-- =====================================================================================
-- EL DÍA DE CARGA ELEGIDO SALE EN LOS DOCUMENTOS PÚBLICOS (usuario, 2026-11-13)
-- =====================================================================================
-- Al asignar transportista se elige el día en que carga (fecha_carga_prevista) y la
-- entrega estimada. El PDF del panel ya enseñaba ESE día, pero los documentos POR
-- ENLACE PÚBLICO (la orden que se comparte con el transportista, la página de firmas
-- del e-CMR y su PDF) se montan con JSON de estas funciones, y a su bloque de envío LE
-- FALTABA fecha_carga_prevista: seguían enseñando la ventana entera. Se recrean las
-- tres con el campo; la web ya lo prefiere cuando llega.

-- ---- 1. La orden de carga por enlace (orden_carga_json) ------------------------------
create or replace function orden_carga_json(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e envios%rowtype; t transportistas%rowtype; c record;
begin
  select * into e from envios where id = p_envio;
  if e.operador_id is not null or e.estado in ('borrador', 'cancelado') then raise exception 'Este envío no tiene orden de carga.'; end if;
  select * into t from transportistas where id = e.transportista_id;
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
      'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
      'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono,
      'transportista_nima', e.transportista_nima, 'plazo_pago_transportista', t.plazo_pago_dias, 'es_manual', false),
    'porteador', jsonb_build_object(
      'nombre', coalesce(t.nombre_visible, t.razon_social), 'razon_social', t.razon_social, 'cif', t.cif, 'codigo', t.codigo,
      'direccion', t.direccion, 'codigo_postal', t.codigo_postal, 'poblacion', t.poblacion, 'provincia', t.provincia,
      'pais_codigo_iso', t.pais_codigo_iso, 'telefono', c.telefono, 'email', c.email, 'contacto', c.nombre),
    'paradas', paradas_viaje_json(e.id),
    'pronto_pago', coalesce((select r.pronto_pago from envio_reservas r where r.envio_id = e.id and r.transportista_id = t.id
                              and r.estado = 'aceptada' order by r.cerrada_en desc limit 1), false),
    'parametros', (select jsonb_object_agg(clave, valor) from parametros
                    where clave in ('pronto_pago_pct', 'pronto_pago_minimo', 'pronto_pago_dias', 'plazo_pago_transportista_dias')),
    'dynamo', datos_dynamo()
  );
end $$;
revoke execute on function orden_carga_json(uuid) from public, anon, authenticated;
comment on function public.orden_carga_json(uuid) is '[Envíos] Devuelve en JSON todo lo que necesita el PDF de la orden de carga de un envío de Dynamo: envío (con el día de carga elegido, fecha_carga_prevista, para enseñar ESE día y no la ventana), porteador con su contacto de tráfico, paradas, pronto pago aceptado, parámetros de pago y los datos fijos de Dynamo. Rechaza envíos manuales, borradores y cancelados. Quién: funciones internas (datos_orden_por_cmr y la descarga del panel). Argumentos: p_envio: envios.id.';

-- ---- 2. La página pública de firmas del e-CMR (cmr_publico) --------------------------
create or replace function public.cmr_publico(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_envio uuid; e record;
begin
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  select * into e from envios where id = v_envio;
  if e.estado = 'cancelado' then return jsonb_build_object('resultado', 'cancelado', 'referencia', e.referencia_gx); end if;
  return jsonb_build_object(
    'resultado', 'ok',
    'referencia', e.referencia_gx,
    'manual', e.es_manual,
    'remitente', (select razon_social from clientes where id = e.cliente_id),
    'porteador', case when e.es_manual then (select razon_social from operadores where id = e.operador_id)
                      else coalesce(parametro('dynamo_razon_social') #>> '{}', 'Dynamo Operador Logístico, S.L.') end,
    'transportista', (select nombre_visible from transportistas where id = e.transportista_id),
    -- Para precargar el email de la casilla 23 (quien firma lo puede cambiar).
    'transportista_email', (select c.email from contactos c where c.transportista_id = e.transportista_id
                             and c.email is not null order by c.es_principal desc, c.creado_en limit 1),
    'matricula', concat_ws(' / ', e.matricula_camion, e.matricula_remolque),
    -- Por separado (2026-11-11): la ventana de firma las precarga y deja corregirlas.
    'matricula_camion', e.matricula_camion,
    'matricula_remolque', e.matricula_remolque,
    'conductor', e.conductor_nombre,
    -- El día REAL si ya se cargó; si no, el día ELEGIDO al asignar; y si no, la ventana.
    'fecha_carga', coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde),
    'mercancia', e.descripcion_mercancia, 'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas,
    'adr', e.adr,
    'paradas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa', p.nombre_empresa,
        'poblacion', p.poblacion, 'provincia', p.provincia, 'codigo_postal', p.codigo_postal,
        -- Para rellenar de antemano el nombre y el email de quien firma (los puede cambiar).
        'contacto', (select c.nombre from contactos c where c.sitio_id = p.sitio_id and c.es_principal limit 1),
        'email', (select c.email from contactos c where c.sitio_id = p.sitio_id
                   and c.email is not null order by c.es_principal desc, c.creado_en limit 1))
        order by p.orden), '[]'::jsonb) from envio_paradas p where p.envio_id = e.id),
    'firmas', (select coalesce(jsonb_agg(jsonb_build_object(
        'parada_id', f.parada_id, 'rol', f.rol, 'nombre', f.nombre,
        'documento', '•••' || right(f.documento, 4), 'documento_pais', f.documento_pais,
        'firmado_en', f.firmado_en, 'ruta', f.firma_storage_ruta, 'extra', f.extra) order by f.extra, f.firmado_en), '[]'::jsonb)
        from firmas_cmr f where f.envio_id = e.id)
  );
end $$;

-- ---- 3. El PDF público del e-CMR (datos_cmr_por_token) -------------------------------
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
        'documento', '•••' || right(f.documento, 4), 'firmado_en', f.firmado_en, 'extra', f.extra, 'lat', f.lat, 'lon', f.lon,
        'gps_precision_m', f.gps_precision_m, 'gps_direccion', f.gps_direccion, 'sha256', f.sha256_documento,
        'ruta', f.firma_storage_ruta, 'trazo', encode(f.trazo_png, 'base64')) order by f.firmado_en)
      from firmas_cmr f where f.envio_id = e.id), '[]'::jsonb),
    'reservas', coalesce((select jsonb_agg(jsonb_build_object('rol', r.rol, 'texto', r.texto, 'parada_id', r.parada_id,
        'creado_en', r.creado_en) order by r.creado_en)
      from cmr_reservas r where r.envio_id = e.id), '[]'::jsonb),
    'deca', jsonb_build_object('creado_en', v.creado_en),
    'dynamo', datos_dynamo());
end $$;
revoke execute on function public.datos_cmr_por_token(uuid) from public;
grant execute on function public.datos_cmr_por_token(uuid) to anon, authenticated;
comment on function public.datos_cmr_por_token(uuid) is '[CMR y PIN] Devuelve en JSON todo lo que necesita el PDF público del e-CMR (/cmr/<token>/pdf) a partir del enlace vivo de cmr_enlaces: envío (lista blanca de columnas, sin importes, con el día de carga elegido fecha_carga_prevista), cliente, porteador (o el operador en envíos manuales), paradas, firmas con el documento enmascarado y su trazo en base64, reservas, la fecha de creación del enlace (nº único del DeCA) y los datos fijos de Dynamo. Rechaza enlaces revocados o caducados y envíos cancelados. Quién: cualquiera con el enlace (anon). Argumentos: p_token: cmr_enlaces.token.';
