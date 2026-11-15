-- PANEL DE MODIFICACIONES EN EL DeCA (tarea 91 · Resolución de 5 de junio de 2026,
-- apartado quinto): el documento de control electrónico debe dejar constancia de sus
-- modificaciones. La copia operativa (el DeCA) gana un panel «Modificaciones del
-- documento» con las alteraciones del envío que afectan al documento de control, cada
-- una con su fecha y hora (España): cambios de ruta, fecha de carga movida,
-- transportista retirado o reasignado (a partir del segundo) y cambios de matrícula (a
-- partir de la segunda: la primera es rellenar el documento, no modificarlo). Si no hay
-- ninguna, el panel lo dice («Sin modificaciones desde la emisión»): la constancia
-- afirmativa también cuenta. El dato sale de envio_hitos, que ya lo registra todo; el
-- detalle se construye aquí SIN datos económicos (el DeCA público no lleva importes).

-- ---- 1. El constructor interno -------------------------------------------------------
create or replace function fn_modificaciones_deca(p_envio uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with h as (
    select hito, cuando, datos, row_number() over (partition by hito order by cuando) as n
      from envio_hitos
     where envio_id = p_envio
       and hito in ('ruta_cambiada', 'fecha_carga_movida', 'transportista_quitado',
                    'transportista_asignado', 'matricula_asignada')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cuando', to_char(cuando at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI'),
           'hito', hito,
           'detalle', case hito
             when 'ruta_cambiada' then (
               select string_agg(nullif(trim(coalesce(x ->> 'codigo_postal', '') || ' ' || coalesce(x ->> 'poblacion', '')), ''), ' → ')
                 from jsonb_array_elements(datos -> 'despues') x)
             when 'fecha_carga_movida' then nullif(concat_ws(' → ',
               to_char((nullif(datos ->> 'antes_desde', ''))::date, 'DD/MM/YYYY'),
               to_char((nullif(datos ->> 'desde', ''))::date, 'DD/MM/YYYY')), '')
             when 'matricula_asignada' then nullif(concat_ws(' + ',
               coalesce(datos ->> 'camion', datos ->> 'tractora'), datos ->> 'remolque'), '')
             else null end
         ) order by cuando), '[]'::jsonb)
    from h
   where hito in ('ruta_cambiada', 'fecha_carga_movida', 'transportista_quitado') or n > 1
$$;
revoke execute on function fn_modificaciones_deca(uuid) from public, anon, authenticated;
comment on function public.fn_modificaciones_deca(uuid) is '[Envíos] Las modificaciones del documento de control (DeCA) de un envío, para el panel del PDF (Resolución 5-jun-2026, apdo. quinto): cambios de ruta, fecha de carga movida, transportista retirado o reasignado (desde el segundo) y cambios de matrícula (desde la segunda), de envio_hitos, cada una con fecha y hora españolas y un detalle corto SIN datos económicos. Devuelve jsonb [{cuando, hito, detalle}]. Quién: funciones internas (orden_carga_json, datos_cmr_por_token) y el envoltorio modificaciones_deca. Argumentos: p_envio: envios.id.';

-- ---- 2. El envoltorio con permisos (lo usa la descarga del panel) --------------------
create or replace function modificaciones_deca(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (es_equipo_dynamo() or es_servidor() or envio_del_transportista(p_envio)) then
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  return fn_modificaciones_deca(p_envio);
end $$;
revoke all on function modificaciones_deca(uuid) from public, anon;
grant execute on function modificaciones_deca(uuid) to authenticated, service_role;
comment on function public.modificaciones_deca(uuid) is '[Envíos] Las modificaciones del documento de control (DeCA) de un envío para el panel del PDF: ver fn_modificaciones_deca. Quién: equipo Dynamo y el transportista del envío. Argumentos: p_envio: envios.id.';

-- ---- 3. orden_carga_json y datos_cmr_por_token llevan el panel -----------------------
create or replace function orden_carga_json(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e envios%rowtype; t transportistas%rowtype; cli clientes%rowtype; c record;
begin
  select * into e from envios where id = p_envio;
  if e.operador_id is not null or e.estado in ('borrador', 'cancelado') then raise exception 'Este envío no tiene orden de carga.'; end if;
  select * into t from transportistas where id = e.transportista_id;
  select * into cli from clientes where id = e.cliente_id;
  select x.nombre, x.telefono, x.email into c from contactos x where x.transportista_id = t.id
   order by (x.funcion = 'trafico') desc, x.es_principal desc limit 1;
  return jsonb_build_object(
    'envio', jsonb_build_object(
      'id', e.id, 'referencia_gx', e.referencia_gx, 'referencia_cliente', e.referencia_cliente, 'estado', e.estado,
      'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta, 'fecha_carga_real', e.fecha_carga_real,
      'fecha_carga_prevista', e.fecha_carga_prevista,
      'fecha_entrega_estimada', e.fecha_entrega_estimada, 'descripcion_mercancia', e.descripcion_mercancia,
      'toneladas', e.toneladas, 'metros_lineales', e.metros_lineales, 'tipo_carga', e.tipo_carga, 'paletizado', e.paletizado,
      'num_bultos', e.num_bultos, 'embalaje', e.embalaje, 'volumen_m3', e.volumen_m3,
      'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera, 'carga_techo', e.carga_techo,
      'requiere_plataforma_elevadora', e.requiere_plataforma_elevadora, 'requiere_nima', e.requiere_nima, 'adr', e.adr,
      'discrecion_comercial', e.discrecion_comercial, 'importe_transportista', e.importe_transportista,
      'importe_cliente', e.importe_cliente, 'iva_pct', e.iva_pct,
      'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
      'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono,
      'transportista_nima', e.transportista_nima, 'plazo_pago_transportista', t.plazo_pago_dias, 'es_manual', false),
    'porteador', jsonb_build_object(
      'nombre', coalesce(t.nombre_visible, t.razon_social), 'razon_social', t.razon_social, 'cif', t.cif, 'codigo', t.codigo,
      'direccion', t.direccion, 'codigo_postal', t.codigo_postal, 'poblacion', t.poblacion, 'provincia', t.provincia,
      'pais_codigo_iso', t.pais_codigo_iso, 'telefono', c.telefono, 'email', c.email, 'contacto', c.nombre),
    'cliente', jsonb_build_object(
      'nombre', coalesce(cli.nombre_visible, cli.razon_social), 'razon_social', cli.razon_social, 'cif', cli.cif,
      'direccion', cli.direccion, 'codigo_postal', cli.codigo_postal, 'poblacion', cli.poblacion,
      'provincia', cli.provincia, 'pais_codigo_iso', cli.pais_codigo_iso),
    'paradas', paradas_viaje_json(e.id),
    'pronto_pago', coalesce((select r.pronto_pago from envio_reservas r where r.envio_id = e.id and r.transportista_id = t.id
                              and r.estado = 'aceptada' order by r.cerrada_en desc limit 1), false),
    'parametros', (select jsonb_object_agg(clave, valor) from parametros
                    where clave in ('pronto_pago_pct', 'pronto_pago_minimo', 'pronto_pago_dias', 'plazo_pago_transportista_dias')),
    'dynamo', datos_dynamo(),
    'modificaciones', fn_modificaciones_deca(p_envio)
  );
end $$;
revoke execute on function orden_carga_json(uuid) from public, anon, authenticated;
comment on function public.orden_carga_json(uuid) is '[Envíos] Devuelve en JSON todo lo que necesita el PDF de la orden de carga de un envío de Dynamo: envío (con el día de carga elegido, fecha_carga_prevista, y los dos importes: importe_transportista para la copia completa e importe_cliente con iva_pct para la copia cliente), porteador con su contacto de tráfico, el bloque del cliente ordenante (para la copia cliente), paradas, pronto pago aceptado, parámetros de pago, los datos fijos de Dynamo y las modificaciones del documento de control (fn_modificaciones_deca). Rechaza envíos manuales, borradores y cancelados. Quién: funciones internas (datos_orden_por_cmr, que recorta la economía según la clave, y la descarga del panel). Argumentos: p_envio: envios.id.';

create or replace function public.datos_cmr_por_token(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v cmr_enlaces%rowtype; e envios%rowtype; cli clientes%rowtype; t transportistas%rowtype; o operadores%rowtype; v_port jsonb;
begin
  select * into v from cmr_enlaces where token = p_token and not revocado and caduca_en > now();
  if not found then
    raise exception 'Este enlace no es válido: ha caducado o se ha retirado.' using errcode = '42501';
  end if;
  select * into e from envios where id = v.envio_id;
  if not found or e.estado = 'cancelado' then
    raise exception 'Este envío está cancelado: ya no hace falta su CMR.' using errcode = '42501';
  end if;
  select * into cli from clientes where id = e.cliente_id;
  if e.operador_id is not null then
    select * into o from operadores where id = e.operador_id;
    v_port := jsonb_build_object('nombre', o.razon_social, 'razon_social', o.razon_social, 'cif', o.cif,
      'telefono', o.telefono, 'email', o.email, 'contacto', o.persona_contacto);
  elsif e.transportista_id is not null then
    select * into t from transportistas where id = e.transportista_id;
    v_port := jsonb_build_object('nombre', coalesce(t.nombre_visible, t.razon_social), 'razon_social', t.razon_social,
      'cif', t.cif, 'codigo', t.codigo, 'direccion', t.direccion, 'codigo_postal', t.codigo_postal,
      'poblacion', t.poblacion, 'provincia', t.provincia, 'pais_codigo_iso', t.pais_codigo_iso);
  end if;
  return jsonb_build_object(
    'envio', jsonb_build_object(
      'id', e.id, 'referencia_gx', e.referencia_gx, 'referencia_cliente', e.referencia_cliente, 'estado', e.estado,
      'es_manual', e.es_manual, 'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
      'fecha_carga_real', e.fecha_carga_real, 'fecha_carga_prevista', e.fecha_carga_prevista,
      'fecha_entrega_estimada', e.fecha_entrega_estimada,
      'descripcion_mercancia', e.descripcion_mercancia, 'toneladas', e.toneladas, 'metros_lineales', e.metros_lineales,
      'paletizado', e.paletizado, 'num_bultos', e.num_bultos, 'embalaje', e.embalaje, 'volumen_m3', e.volumen_m3,
      'adr', e.adr, 'discrecion_comercial', e.discrecion_comercial, 'anotaciones_cliente', e.anotaciones_cliente,
      'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
      'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono),
    'manual', e.operador_id is not null,
    'cliente', jsonb_build_object('nombre', coalesce(cli.nombre_visible, cli.razon_social), 'razon_social', cli.razon_social,
      'cif', cli.cif, 'direccion', cli.direccion, 'codigo_postal', cli.codigo_postal, 'poblacion', cli.poblacion,
      'provincia', cli.provincia, 'pais_codigo_iso', cli.pais_codigo_iso),
    'porteador', v_port,
    'paradas', paradas_viaje_json(e.id),
    'firmas', coalesce((select jsonb_agg(jsonb_build_object('rol', f.rol, 'parada_id', f.parada_id, 'nombre', f.nombre,
        'documento', f.documento, 'firmado_en', f.firmado_en, 'extra', f.extra, 'lat', f.lat, 'lon', f.lon,
        'gps_precision_m', f.gps_precision_m, 'gps_direccion', f.gps_direccion, 'sha256', f.sha256_documento,
        'ruta', f.firma_storage_ruta, 'trazo', encode(f.trazo_png, 'base64')) order by f.firmado_en)
      from firmas_cmr f where f.envio_id = e.id), '[]'::jsonb),
    'reservas', coalesce((select jsonb_agg(jsonb_build_object('rol', r.rol, 'texto', r.texto, 'parada_id', r.parada_id,
        'creado_en', r.creado_en) order by r.creado_en)
      from cmr_reservas r where r.envio_id = e.id), '[]'::jsonb),
    'deca', jsonb_build_object('creado_en', v.creado_en),
    'dynamo', datos_dynamo(),
    'modificaciones', fn_modificaciones_deca(e.id));
end $$;
revoke execute on function public.datos_cmr_por_token(uuid) from public;
grant execute on function public.datos_cmr_por_token(uuid) to anon, authenticated;
comment on function public.datos_cmr_por_token(uuid) is '[Envíos] Enlace público del e-CMR (/cmr/<token>/pdf): el documento completo para el PDF — envío sin importes, cliente, porteador (u operador en los manuales), paradas, firmas con su trazo y el documento entero del firmante, reservas, el nº único del DeCA (fecha del enlace), los datos fijos de Dynamo y las modificaciones del documento de control (fn_modificaciones_deca). Solo con el token vivo de cmr_enlaces. Quién: cualquiera con el enlace (anon). Argumentos: p_token: cmr_enlaces.token.';
