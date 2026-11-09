-- =====================================================================================
-- EL CLIENTE NUNCA ELIGE FECHAS FUERA DE REGLAS, NI SALTÁNDOSE LA PANTALLA (usuario, 2026-11-09)
-- =====================================================================================
-- La pantalla ya solo ofrecía días válidos (lo de elegir cualquier fecha es exclusivo
-- del Admin Master), pero el tope de la BASE DE DATOS para el cliente era más laxo
-- («de hoy en adelante»): alguien llamando a la acción directamente podía colar un hoy
-- pasado el corte o un sábado. crear_envio_cliente pasa a exigir lo mismo que la
-- pantalla: días hábiles (desde y hasta) y nunca antes de primera_fecha_carga() según
-- el tipo de fecha. pedir_cambio_envio ya lo exigía (dia_no_habil, antes_de_lo_posible,
-- ventana_distinta — prueba 149); crear_envio (Dynamo) queda libre a propósito.
-- =====================================================================================

create or replace function crear_envio_cliente(p_datos jsonb, p_paradas jsonb)
returns table (id uuid, referencia_gx text)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cliente uuid := cliente_del_usuario();
  v_importe numeric := round((p_datos ->> 'importe_cliente')::numeric, 2);
  v_id uuid; v_gx text; v_p jsonb; v_orden smallint := 0; v_sitio uuid; l sitios%rowtype;
  v_desde date; v_hasta date;
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
  -- REGLAS DURAS DE LA FECHA (usuario, 2026-11-09): el cliente NUNCA elige fuera de
  -- las reglas, ni saltándose la pantalla — solo días hábiles, y nunca antes del primer
  -- día que permite la hora de corte (primera_fecha_carga: ventana puede ser hoy antes
  -- de las 14:00; fija, desde el siguiente hábil). Saltárselas es cosa del Admin
  -- Master, que no pasa por aquí (usa crear_envio).
  v_desde := (p_datos ->> 'fecha_carga_desde')::date;
  v_hasta := coalesce((p_datos ->> 'fecha_carga_hasta')::date, v_desde);
  if v_desde is null then raise exception 'Elige una fecha de recogida.'; end if;
  if v_hasta < v_desde then raise exception 'La ventana no puede terminar antes de empezar.'; end if;
  if not es_dia_habil(v_desde) or not es_dia_habil(v_hasta) then
    raise exception 'La recogida solo puede empezar y terminar en un día hábil (sin sábados, domingos ni festivos).';
  end if;
  if v_desde < primera_fecha_carga(v_hasta = v_desde) then
    raise exception 'Esa fecha ya no se puede elegir (hora de corte): el primer día posible ahora mismo es el %.',
      to_char(primera_fecha_carga(v_hasta = v_desde), 'DD/MM/YYYY');
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
comment on function public.crear_envio_cliente(jsonb, jsonb) is '[Envíos] El cliente crea su envío YA CON PRECIO (el del tarifador automático; hasta que el tarifador viva en el servidor, el importe llega de la pantalla y se acota a 0–100.000). Nace programado: el previo pago decide solo si va a crédito o pendiente de pago. Fecha de recogida: SOLO días hábiles y nunca antes de primera_fecha_carga() según el tipo (ventana: hoy antes del corte; fija: desde el siguiente hábil) — la base de datos lo exige aunque se salte la pantalla. 2 a 4 paradas; valida la ruta. Devuelve id y referencia GX. Quién: cliente (usuario activo de un cliente). Argumentos: p_datos: jsonb {importe_cliente (obligatorio), fecha_carga_desde, fecha_carga_hasta, referencia_cliente, descripcion_mercancia, toneladas, metros_lineales, paletizado, carga_*, requiere_plataforma_elevadora, requiere_nima, adr, discrecion_comercial, anotaciones_cliente} · p_paradas: array de 2 a 4 {tipo, sitio_id o dirección, guardar_en_agenda, contacto_nombre, contacto_telefono, referencia, anotaciones}.';
