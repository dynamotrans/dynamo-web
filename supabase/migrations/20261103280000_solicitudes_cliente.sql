-- =====================================================================================
-- ETAPA B: EL CLIENTE PIDE SUS ENVÍOS DESDE EL PANEL (2026-11-03)
-- =====================================================================================
-- Hasta que llegue el tarifador (lo último del proyecto), el cliente no ve un precio
-- automático. Así funciona mientras tanto, igual que el «te pasamos tu tarifa antes de 25
-- minutos» de la web pública:
--
--   1. El CLIENTE crea una SOLICITUD (ruta, mercancía, fecha). El envío nace en borrador
--      con `solicitud_estado = 'pendiente_precio'`. No hay camión ni compromiso.
--   2. DYNAMO le pone precio → 'precio_propuesto', con validez (24 h por defecto).
--   3. El CLIENTE lo ACEPTA (y con ello las condiciones generales) → el envío pasa a
--      programado, como uno creado por Dynamo. O lo RECHAZA → cancelado, sin coste.
--
-- Además: el cliente puede CANCELAR su envío antes de que el camión vaya hacia la carga
-- (fuera de plazo, la penalización la genera la regla que ya existe).

alter table envios add column solicitud_estado text
  check (solicitud_estado in ('pendiente_precio', 'precio_propuesto', 'aceptada', 'rechazada'));
alter table envios add column precio_valido_hasta timestamptz;
alter table envios add column condiciones_aceptadas_en timestamptz;
comment on column envios.solicitud_estado is
  'Solo envíos pedidos por el CLIENTE desde el panel: pendiente_precio → precio_propuesto → aceptada / rechazada. Null = creado por Dynamo.';
comment on column envios.condiciones_aceptadas_en is
  'Hora del SERVIDOR en que el cliente aceptó el precio y las condiciones generales.';
create index idx_envios_solicitudes on envios (solicitud_estado) where solicitud_estado in ('pendiente_precio', 'precio_propuesto');

insert into parametros (clave, valor, descripcion) values
  ('solicitud_validez_horas', '24', 'Horas que vale el precio que Dynamo propone a una solicitud de envío del cliente.')
on conflict (clave) do nothing;


-- ---- 1. El cliente crea la solicitud -----------------------------------------------
create or replace function crear_solicitud_envio(p_envio jsonb, p_paradas jsonb)
returns table (id uuid, referencia_gx text)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cliente uuid := cliente_del_usuario();
  v_id uuid; v_gx text; v_p jsonb; v_orden smallint := 0; v_lugar uuid; l lugares%rowtype;
begin
  if v_cliente is null or not exists (select 1 from usuarios u where u.id = auth.uid() and u.estado = 'activa') then
    raise exception 'Tu cuenta no puede pedir envíos todavía.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envío necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como máximo 4 puntos en la ruta (2 paradas además del origen y el destino).';
  end if;
  if (p_envio ->> 'fecha_carga_desde') is null or (p_envio ->> 'fecha_carga_desde')::date <= current_date then
    raise exception 'Elige una fecha de recogida a partir de mañana.';
  end if;

  insert into envios (cliente_id, referencia_cliente, estado, solicitud_estado,
    fecha_carga_desde, fecha_carga_hasta, descripcion_mercancia, toneladas, metros_lineales,
    paletizado, carga_lateral, carga_trasera, carga_superior, plataforma_elevadora, nima_requerido, adr,
    iva_aplicado, discrecion_comercial, anotaciones_cliente)
  values (v_cliente, nullif(trim(p_envio ->> 'referencia_cliente'), ''), 'borrador', 'pendiente_precio',
    (p_envio ->> 'fecha_carga_desde')::date, (p_envio ->> 'fecha_carga_hasta')::date,
    nullif(trim(p_envio ->> 'descripcion_mercancia'), ''),
    (p_envio ->> 'toneladas')::numeric, (p_envio ->> 'metros_lineales')::numeric,
    coalesce((p_envio ->> 'paletizado')::boolean, true), coalesce((p_envio ->> 'carga_lateral')::boolean, true),
    coalesce((p_envio ->> 'carga_trasera')::boolean, false), coalesce((p_envio ->> 'carga_superior')::boolean, false),
    coalesce((p_envio ->> 'plataforma_elevadora')::boolean, false), coalesce((p_envio ->> 'nima_requerido')::boolean, false),
    coalesce((p_envio ->> 'adr')::boolean, false), 21,
    coalesce((p_envio ->> 'discrecion_comercial')::boolean, false), left(nullif(trim(p_envio ->> 'anotaciones_cliente'), ''), 1000))
  returning envios.id, envios.referencia_gx into v_id, v_gx;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    if (v_p ->> 'tipo') not in ('carga', 'descarga') then raise exception 'Tipo de parada no válido.'; end if;
    v_lugar := nullif(v_p ->> 'lugar_id', '')::uuid;
    if v_lugar is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into lugares (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso)
      values (v_cliente, trim(v_p ->> 'nombre_empresa'), coalesce(nullif(v_p ->> 'tipo_lugar', '')::tipo_lugar, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''), nullif(trim(v_p ->> 'poblacion'), ''),
              nullif(trim(v_p ->> 'provincia'), ''), coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'))
      returning lugares.id into v_lugar;
      if regexp_replace(coalesce(v_p ->> 'contacto_telefono', ''), '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$' then
        insert into contactos (lugar_id, nombre, telefono, es_principal)
        values (v_lugar, nullif(trim(v_p ->> 'contacto_nombre'), ''), regexp_replace(v_p ->> 'contacto_telefono', '[^0-9+]', '', 'g'), true);
      end if;
    end if;
    if v_lugar is not null then
      -- Solo sus sitios o un almacén de Dynamo: nunca la agenda de otro cliente.
      select * into l from lugares where lugares.id = v_lugar and not borrado
         and (es_almacen_dynamo or cliente_id = v_cliente);
      if not found then raise exception 'El sitio elegido no existe o no es tuyo.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, lugar_id, nombre_empresa, direccion, codigo_postal, poblacion,
                                 provincia, pais_codigo_iso, lat, lon, referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', v_lugar, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion,
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
  return query select v_id, v_gx;
end $$;
revoke execute on function crear_solicitud_envio(jsonb, jsonb) from public, anon;
grant execute on function crear_solicitud_envio(jsonb, jsonb) to authenticated;


-- ---- 2. Dynamo propone el precio ----------------------------------------------------
create or replace function proponer_precio_solicitud(p_envio uuid, p_importe numeric, p_importe_transportista numeric default null)
returns void language plpgsql volatile security invoker set search_path = public as $$
declare e envios%rowtype; v_horas int;
begin
  if not es_admin() then raise exception 'Solo Dynamo pone precio a las solicitudes.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if e.solicitud_estado not in ('pendiente_precio', 'precio_propuesto') or e.estado <> 'borrador' then
    raise exception 'Esta solicitud ya no admite precio (está %).', coalesce(e.solicitud_estado, 'sin solicitud');
  end if;
  if p_importe is null or p_importe <= 0 then raise exception 'Pon un precio para el cliente mayor que cero.'; end if;
  select coalesce((select (valor #>> '{}')::int from parametros where clave = 'solicitud_validez_horas'), 24) into v_horas;
  update envios set importe_cliente = p_importe, importe_transportista = p_importe_transportista, precio_fijado_a_mano = true,
                    solicitud_estado = 'precio_propuesto', precio_valido_hasta = now() + make_interval(hours => v_horas)
   where id = p_envio;
end $$;
revoke execute on function proponer_precio_solicitud(uuid, numeric, numeric) from public, anon;
grant execute on function proponer_precio_solicitud(uuid, numeric, numeric) to authenticated;


-- ---- 3. El cliente acepta o rechaza --------------------------------------------------
create or replace function responder_precio_solicitud(p_envio uuid, p_acepta boolean)
returns text language plpgsql volatile security definer set search_path = public as $$
declare e envios%rowtype;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if e.solicitud_estado <> 'precio_propuesto' or e.estado <> 'borrador' then
    raise exception 'Esta solicitud ya no está esperando tu respuesta.';
  end if;
  if not p_acepta then
    update envios set solicitud_estado = 'rechazada', estado = 'cancelado' where id = p_envio;
    return 'rechazada';
  end if;
  if e.precio_valido_hasta < now() then
    update envios set solicitud_estado = 'pendiente_precio', precio_valido_hasta = null where id = p_envio;
    return 'caducado';
  end if;
  if e.fecha_carga_desde <= current_date then
    raise exception 'La fecha de recogida ya ha pasado: cancela la solicitud y pide otra.';
  end if;
  update envios set solicitud_estado = 'aceptada', condiciones_aceptadas_en = now(), estado = 'programado' where id = p_envio;
  return 'aceptada';
end $$;
revoke execute on function responder_precio_solicitud(uuid, boolean) from public, anon;
grant execute on function responder_precio_solicitud(uuid, boolean) to authenticated;


-- ---- 4. El cliente cancela su envío (se rehace cancelar_mi_envio) --------------------
-- Ahora también cierra la solicitud y explica por qué no se puede cuando el camión ya va
-- hacia la carga. Hasta que el camión va hacia la carga. Fuera de plazo y con camión asignado, la
-- penalización la crea sola la regla de cancelación (como cuando cancela Dynamo).
create or replace function cancelar_mi_envio(p_envio uuid, p_motivo text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_estado estado_envio; v_pen numeric;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select estado into v_estado from envios where id = p_envio for update;
  if v_estado = 'cancelado' then raise exception 'El envío ya está cancelado.'; end if;
  if v_estado not in ('borrador', 'programado') then
    raise exception 'El camión ya va hacia la carga: para cancelar, llámanos al +34 955 225 945.';
  end if;
  update envios set estado = 'cancelado',
                    solicitud_estado = case when solicitud_estado in ('pendiente_precio', 'precio_propuesto') then 'rechazada' else solicitud_estado end
   where id = p_envio;
  if nullif(trim(p_motivo), '') is not null then
    perform registrar_hito(p_envio, 'incidencia', null, null, jsonb_build_object('motivo_cancelacion', left(trim(p_motivo), 500), 'por', 'cliente'));
  end if;
  select importe_cliente into v_pen from penalizaciones
   where envio_id = p_envio and generada_auto and estado = 'pendiente_confirmar' order by creado_en desc limit 1;
  return jsonb_build_object('resultado', 'cancelado', 'penalizacion', v_pen is not null, 'importe', v_pen);
end $$;
revoke execute on function cancelar_mi_envio(uuid, text) from public, anon;
grant execute on function cancelar_mi_envio(uuid, text) to authenticated;


-- (Las penalizaciones del cliente ya las da mis_penalizaciones(), de la migración operativa.)


-- ---- 6. mis_envios con el estado de la solicitud --------------------------------------
drop function mis_envios();
create function mis_envios()
returns table (
  id uuid, referencia_gx text, referencia_cliente text, estado estado_envio,
  estado_asignacion estado_asignacion, es_manual boolean, operador_id uuid,
  precio_acordado_operador numeric,
  fecha_carga_desde date, fecha_carga_hasta date, fecha_carga_real date,
  fecha_entrega_estimada date,
  descripcion_mercancia varchar, toneladas numeric, metros_lineales numeric,
  tipo_carga tipo_carga, paletizado boolean, carga_lateral boolean, carga_superior boolean,
  carga_trasera boolean, plataforma_elevadora boolean, nima_requerido boolean, adr boolean,
  codigo_postal_origen text, poblacion_origen text,
  codigo_postal_destino text, poblacion_destino text,
  num_paradas smallint, importe_cliente numeric, moneda char, iva_aplicado numeric,
  anotaciones_cliente varchar, discrecion_comercial boolean,
  matricula_camion text, matricula_remolque text,
  conductor_nombre text, conductor_telefono text,
  creado_en timestamptz, modificado_en timestamptz, confirmado_en timestamptz,
  asignado_en timestamptz, cargado_en timestamptz, entregado_en timestamptz,
  cancelado_en timestamptz, paradas jsonb,
  solicitud_estado text, precio_valido_hasta timestamptz, condiciones_aceptadas_en timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.referencia_gx, e.referencia_cliente, e.estado, e.estado_asignacion,
         e.es_manual, e.operador_id, e.precio_acordado_operador,
         e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real, e.fecha_entrega_estimada,
         e.descripcion_mercancia, e.toneladas, e.metros_lineales, e.tipo_carga,
         e.paletizado, e.carga_lateral, e.carga_superior, e.carga_trasera,
         e.plataforma_elevadora, e.nima_requerido, e.adr,
         e.codigo_postal_origen, e.poblacion_origen,
         e.codigo_postal_destino, e.poblacion_destino, e.num_paradas,
         -- Mientras Dynamo no proponga precio, el cliente no ve ningún importe.
         case when e.solicitud_estado = 'pendiente_precio' then null else e.importe_cliente end,
         e.moneda, e.iva_aplicado, e.anotaciones_cliente,
         e.discrecion_comercial, e.matricula_camion, e.matricula_remolque,
         case when e.estado in ('entregado','cancelado') then null else e.conductor_nombre end,
         case when e.estado in ('entregado','cancelado') then null else e.conductor_telefono end,
         e.creado_en, e.modificado_en, e.confirmado_en, e.asignado_en, e.cargado_en,
         e.entregado_en, e.cancelado_en, paradas_json(e.id),
         e.solicitud_estado, e.precio_valido_hasta, e.condiciones_aceptadas_en
    from envios e
   where e.cliente_id = cliente_del_usuario()
   order by e.creado_en desc
$$;
revoke execute on function mis_envios() from public, anon;
grant execute on function mis_envios() to authenticated;
comment on function mis_envios() is
  'Envios del CLIENTE que llama, con sus paradas y el estado de su solicitud. Sin datos internos de Dynamo y con la '
  'regla 11 aplicada.';
