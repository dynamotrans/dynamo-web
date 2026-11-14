-- El DOCUMENTO DE IDENTIDAD de quien firma va COMPLETO en los documentos (usuario,
-- 2026-11-14): en el CMR firmado a mano siempre se escribe entero, y su función es
-- precisamente identificar al firmante ante cualquiera que reciba la carta de porte
-- (RGPD art. 6.1.b: ejecución del contrato de transporte). El enmascarado «•••1234»
-- era una minimización nuestra que dejaba la firma digital más coja que la manual.
--
-- Cambia:
--   · firmas_envio(): documento completo para todos sus llamantes (cliente y
--     transportista del envío y Dynamo: todos son parte del contrato). Antes solo
--     Dynamo lo veía entero. IP, navegador y email siguen sin salir.
--   · datos_cmr_por_token(): documento completo en el PDF público del e-CMR (el del
--     QR), como lo llevaría el papel.
-- La página pública de firma (cmr_publico) SIGUE enmascarando: en pantalla no hace
-- falta el número entero, solo en el documento.

create or replace function firmas_envio(p_envio uuid)
returns table (rol text, parada_id uuid, nombre text, documento text, documento_pais text, documento_validado boolean, firmado_en timestamptz, firma_storage_ruta text, extra boolean, lat double precision, lon double precision, gps_precision_m integer, gps_direccion text, sha256 text)
language sql stable security definer set search_path = public as $$
  select f.rol::text, f.parada_id, f.nombre::text, f.documento::text,
         f.documento_pais::text, f.documento_validado, f.firmado_en, f.firma_storage_ruta::text, f.extra, f.lat, f.lon, f.gps_precision_m,
         f.gps_direccion::text, f.sha256_documento::text
    from firmas_cmr f
   where f.envio_id = p_envio and (ve_todo() or envio_del_cliente(p_envio) or envio_del_transportista(p_envio))
   order by f.firmado_en
$$;
comment on function public.firmas_envio(uuid) is '[CMR y PIN] Las firmas del CMR de un envío, sin IP, navegador ni email; el documento completo (como en el CMR firmado a mano: cliente, transportista y Dynamo son parte del contrato); con `extra` para distinguir las firmas añadidas a mano, el GPS del dispositivo con su dirección si quien firmó dio permiso, y la huella sha256 de lo que se firmó. Quién: cliente o transportista del envío y Dynamo. Argumentos: p_envio: envios.id.';

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
    'dynamo', datos_dynamo());
end $$;
revoke execute on function public.datos_cmr_por_token(uuid) from public;
grant execute on function public.datos_cmr_por_token(uuid) to anon, authenticated;
