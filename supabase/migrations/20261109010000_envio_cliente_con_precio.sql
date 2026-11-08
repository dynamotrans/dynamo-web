-- =====================================================================================
-- FUERA LAS SOLICITUDES DE PRECIO: EL CLIENTE CREA EL ENVÍO YA PRECIADO (usuario 2026-11-08)
-- =====================================================================================
-- El tarifador es automático y calcula el precio en el momento, así que el flujo
-- «solicitud → Dynamo pone precio → el cliente acepta o contraoferta» deja de aplicar:
--   1. crear_envio_cliente(): el cliente crea su envío CON el precio (el del tarifador,
--      que le llega de la pantalla; cuando el tarifador real viva en el servidor, el
--      precio se calculará aquí y este parámetro pasará a comprobarse). Nace programado:
--      el disparador del previo pago decide solo si va a crédito o pendiente de pago.
--   2. Las solicitudes vivas se convierten: con fecha futura pasan a programado con su
--      precio (o el plano del tarifador, 700 €, si no tenían); con la fecha ya pasada se
--      cancelan sin coste (estaban muertas).
--   3. La tarea horaria deja de pedir revisión a Dynamo cuando un precio provisional
--      llega a su fecha: el precio queda definitivo él solo («que se actualice y punto»);
--      y gana una red de seguridad que convierte solicitudes rezagadas (p. ej. recargas
--      de datos de prueba), igual que el punto 2.
-- Las funciones del flujo viejo (crear_solicitud_envio, proponer_precio_solicitud,
-- responder_precio_solicitud, contraofertar_precio_solicitud) quedan SIN USO desde la
-- web (patrón estrangulador): se retirarán en una limpieza junto con sus pruebas.
-- =====================================================================================


-- =====================================================================================
-- 1. EL CLIENTE CREA SU ENVÍO CON EL PRECIO DEL TARIFADOR
-- =====================================================================================
create or replace function crear_envio_cliente(p_datos jsonb, p_paradas jsonb)
returns table (id uuid, referencia_gx text)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cliente uuid := cliente_del_usuario();
  v_importe numeric := round((p_datos ->> 'importe_cliente')::numeric, 2);
  v_id uuid; v_gx text; v_p jsonb; v_orden smallint := 0; v_sitio uuid; l sitios%rowtype;
begin
  if v_cliente is null or not exists (select 1 from usuarios u where u.id = auth.uid() and u.estado = 'activa') then
    raise exception 'Tu cuenta no puede crear envíos todavía.' using errcode = '42501';
  end if;
  if v_importe is null or v_importe <= 0 or v_importe > 100000 then
    raise exception 'Falta el precio del envío (lo pone el tarifador).';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envío necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como máximo 4 puntos en la ruta (2 paradas además del origen y el destino).';
  end if;
  if (p_datos ->> 'fecha_carga_desde') is null or (p_datos ->> 'fecha_carga_desde')::date <= (now() at time zone 'Europe/Madrid')::date then
    raise exception 'Elige una fecha de recogida a partir de mañana.';
  end if;

  insert into envios (cliente_id, referencia_cliente, estado, estado_solicitud, condiciones_aceptadas_en, importe_cliente,
    fecha_carga_desde, fecha_carga_hasta, descripcion_mercancia, toneladas, metros_lineales,
    paletizado, carga_lateral, carga_trasera, carga_techo, requiere_plataforma_elevadora, requiere_nima, adr,
    iva_pct, discrecion_comercial, anotaciones_cliente)
  values (v_cliente, nullif(trim(p_datos ->> 'referencia_cliente'), ''), 'borrador', 'aceptada', now(), v_importe,
    (p_datos ->> 'fecha_carga_desde')::date, (p_datos ->> 'fecha_carga_hasta')::date,
    nullif(trim(p_datos ->> 'descripcion_mercancia'), ''),
    (p_datos ->> 'toneladas')::numeric, (p_datos ->> 'metros_lineales')::numeric,
    coalesce((p_datos ->> 'paletizado')::boolean, true), coalesce((p_datos ->> 'carga_lateral')::boolean, true),
    coalesce((p_datos ->> 'carga_trasera')::boolean, false), coalesce((p_datos ->> 'carga_techo')::boolean, false),
    coalesce((p_datos ->> 'requiere_plataforma_elevadora')::boolean, false), coalesce((p_datos ->> 'requiere_nima')::boolean, false),
    coalesce((p_datos ->> 'adr')::boolean, false), 21,
    coalesce((p_datos ->> 'discrecion_comercial')::boolean, false), left(nullif(trim(p_datos ->> 'anotaciones_cliente'), ''), 1000))
  returning envios.id, envios.referencia_gx into v_id, v_gx;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    if (v_p ->> 'tipo') not in ('carga', 'descarga') then raise exception 'Tipo de parada no válido.'; end if;
    v_sitio := nullif(v_p ->> 'sitio_id', '')::uuid;
    if v_sitio is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into sitios (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso)
      values (v_cliente, trim(v_p ->> 'nombre_empresa'), coalesce(nullif(v_p ->> 'tipo_sitio', '')::tipo_sitio, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''), nullif(trim(v_p ->> 'poblacion'), ''),
              nullif(trim(v_p ->> 'provincia'), ''), coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'))
      returning sitios.id into v_sitio;
      if regexp_replace(coalesce(v_p ->> 'contacto_telefono', ''), '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$' then
        insert into contactos (sitio_id, nombre, telefono, es_principal)
        values (v_sitio, nullif(trim(v_p ->> 'contacto_nombre'), ''), regexp_replace(v_p ->> 'contacto_telefono', '[^0-9+]', '', 'g'), true);
      end if;
    end if;
    if v_sitio is not null then
      -- Solo sus sitios o un almacén de Dynamo: nunca la agenda de otro cliente.
      select * into l from sitios where sitios.id = v_sitio and not borrado
         and (es_almacen_dynamo or cliente_id = v_cliente);
      if not found then raise exception 'El sitio elegido no existe o no es tuyo.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, sitio_id, nombre_empresa, direccion, codigo_postal, poblacion,
                                 provincia, pais_codigo_iso, lat, lon, referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', v_sitio, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion,
              l.provincia, l.pais_codigo_iso, l.lat, l.lon, nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    else
      if nullif(trim(v_p ->> 'nombre_empresa'), '') is null or nullif(trim(v_p ->> 'poblacion'), '') is null then
        raise exception 'Al sitio le faltan la empresa o la población.';
      end if;
      insert into envio_paradas (envio_id, orden, tipo, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, referencia)
      values (v_id, v_orden, v_p ->> 'tipo', trim(v_p ->> 'nombre_empresa'), nullif(trim(v_p ->> 'direccion'), ''),
              nullif(trim(v_p ->> 'codigo_postal'), ''), trim(v_p ->> 'poblacion'), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'), nullif(trim(v_p ->> 'referencia'), ''));
    end if;
  end loop;
  perform validar_ruta_envio(v_id);
  -- A programado: el disparador del previo pago decide solo crédito o pendiente de pago,
  -- y los de hitos y seguimiento sellan lo suyo (igual que al aceptar una solicitud).
  update envios set estado = 'programado' where envios.id = v_id;
  return query select v_id, v_gx;
end $$;
revoke all on function crear_envio_cliente(jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function crear_envio_cliente(jsonb, jsonb) to authenticated;
grant execute on function crear_envio_cliente(jsonb, jsonb) to service_role;
comment on function public.crear_envio_cliente(jsonb, jsonb) is '[Envíos] El cliente crea su envío YA CON PRECIO (el del tarifador automático; hasta que el tarifador viva en el servidor, el importe llega de la pantalla y se acota a 0–100.000). Nace programado: el previo pago decide solo si va a crédito o pendiente de pago. Fecha de recogida a partir de mañana; 2 a 4 paradas; valida la ruta. Devuelve id y referencia GX. Quién: cliente (usuario activo de un cliente). Argumentos: p_datos: jsonb {importe_cliente (obligatorio), fecha_carga_desde, fecha_carga_hasta, referencia_cliente, descripcion_mercancia, toneladas, metros_lineales, paletizado, carga_*, requiere_plataforma_elevadora, requiere_nima, adr, discrecion_comercial, anotaciones_cliente} · p_paradas: array de 2 a 4 {tipo, sitio_id o dirección, guardar_en_agenda, contacto_nombre, contacto_telefono, referencia, anotaciones}.';


-- =====================================================================================
-- 2. LA TAREA HORARIA: el precio provisional queda definitivo solo, y red de solicitudes
-- =====================================================================================
create or replace function revisar_precios_programados()
  returns integer language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare r record; n int := 0; v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  if not (es_servidor() or es_consola_supabase() or es_equipo_dynamo()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  perform set_config('dynamo.revision_precio', 'on', true);
  -- El precio provisional llega a su fecha: queda DEFINITIVO él solo, sin pedir nada a
  -- Dynamo (usuario 2026-11-08: «que se actualice y punto»). Cuando el tarifador real
  -- viva en el servidor, aquí se recalculará con la tarifa del día antes de fijarlo.
  for r in select e.id from envios e
            where e.estado = 'programado' and e.estado_revision_precio in ('pendiente', 'revisar') and e.fecha_revision_precio <= v_hoy
            for update of e skip locked loop
    update envios set estado_revision_precio = 'hecha', revision_precio_en = now() where id = r.id;
    n := n + 1;
  end loop;
  -- Red de seguridad: un envío en «esperando_cliente» (estado de antes del 2026-11-08,
  -- p. ej. recargas de datos de prueba) se resuelve aplicando la subida y avisando.
  for r in select e.id, e.referencia_gx, e.cliente_id, e.importe_cliente, e.importe_revision_nuevo
             from envios e
            where e.estado = 'programado' and e.estado_revision_precio = 'esperando_cliente'
            for update of e skip locked loop
    update envios set estado_revision_precio = 'hecha', revision_precio_en = now(),
                      importe_cliente = coalesce(r.importe_revision_nuevo, importe_cliente) where id = r.id;
    if r.importe_revision_nuevo is not null then
      perform crear_aviso('cliente', r.cliente_id, null, 'precio_subida', 'urgente', 'Nuevo precio de tu envío · #' || coalesce(r.referencia_gx, ''),
        'Al revisarlo antes de la carga, el precio pasa de ' || euros_texto(r.importe_cliente) || ' a ' || euros_texto(r.importe_revision_nuevo) ||
        ' + IVA. Si no te encaja, puedes cancelar el envío sin coste mientras no tenga camión asignado.', '/panel/envios?ver=' || r.id, r.id);
    end if;
    n := n + 1;
  end loop;
  -- Red de seguridad: SOLICITUDES de precio rezagadas (flujo retirado el 2026-11-08; las
  -- recrean las recargas de datos de prueba): con fecha futura pasan a programado con su
  -- precio (o el plano del tarifador si no tenían); con la fecha pasada se cancelan.
  for r in select e.id, e.fecha_carga_desde from envios e
            where e.estado = 'borrador' and e.estado_solicitud in ('pendiente_precio', 'precio_propuesto', 'contraoferta')
            for update of e skip locked loop
    if r.fecha_carga_desde is not null and r.fecha_carga_desde > v_hoy then
      update envios set estado_solicitud = 'aceptada', condiciones_aceptadas_en = coalesce(condiciones_aceptadas_en, now()),
                        importe_cliente = coalesce(importe_cliente, 700), estado = 'programado' where id = r.id;
    else
      update envios set estado_solicitud = 'rechazada', estado = 'cancelado', cancelacion_sin_coste = true where id = r.id;
    end if;
    n := n + 1;
  end loop;
  perform set_config('dynamo.revision_precio', 'off', true);
  return n;
end $$;
revoke execute on function revisar_precios_programados() from public, anon;
grant execute on function revisar_precios_programados() to authenticated;
comment on function public.revisar_precios_programados() is
  '[Precio y pago] Tarea de cada hora (pg_cron dynamo-revision-precios): el precio provisional que llega a su fecha queda definitivo él solo (cuando el tarifador viva en el servidor, aquí se recalculará antes de fijarlo); resuelve envíos en «esperando_cliente» aplicando la subida con aviso; y convierte solicitudes de precio rezagadas (flujo retirado): futuras a programado con su precio o 700 €, pasadas a cancelado sin coste. Devuelve cuántos tocó. Quién: servidor, consola y Dynamo.';


-- =====================================================================================
-- 3. CONVERSIÓN DE LAS SOLICITUDES VIVAS
-- =====================================================================================
do $$ declare r record; v_hoy date := (now() at time zone 'Europe/Madrid')::date; begin
  perform set_config('dynamo.revision_precio', 'on', true);
  for r in select e.id, e.fecha_carga_desde from envios e
            where e.estado = 'borrador' and e.estado_solicitud in ('pendiente_precio', 'precio_propuesto', 'contraoferta') loop
    if r.fecha_carga_desde is not null and r.fecha_carga_desde > v_hoy then
      update envios set estado_solicitud = 'aceptada', condiciones_aceptadas_en = coalesce(condiciones_aceptadas_en, now()),
                        importe_cliente = coalesce(importe_cliente, 700), estado = 'programado' where id = r.id;
    else
      update envios set estado_solicitud = 'rechazada', estado = 'cancelado', cancelacion_sin_coste = true where id = r.id;
    end if;
  end loop;
  perform set_config('dynamo.revision_precio', 'off', true);
end $$;
