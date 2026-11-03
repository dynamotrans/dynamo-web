-- =====================================================================================
-- LA ORDEN DE CARGA DESDE EL PANEL DEL TRANSPORTISTA
-- =====================================================================================
-- El PDF de la orden de carga lo genera el servidor con datos que solo ve Dynamo. Para que
-- el transportista lo descargue desde SU viaje, esta función le da exactamente lo que lleva
-- la orden (y nada más): su viaje, su empresa, las paradas con su muelle y si va con pronto
-- pago, más los parámetros del pronto pago. Nunca el cliente de Dynamo ni el precio del
-- cliente. Solo envíos de Dynamo (los manuales los gestiona el cliente con su operador).
create or replace function datos_orden_transportista(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e envios%rowtype; t transportistas%rowtype; c record;
begin
  if not envio_del_transportista(p_envio) then raise exception 'Ese viaje no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio;
  if e.operador_id is not null or e.estado in ('borrador', 'cancelado') then raise exception 'Este viaje no tiene orden de carga.'; end if;
  select * into t from transportistas where id = e.transportista_id;
  select x.nombre, x.telefono, x.email into c from contactos x where x.transportista_id = t.id
   order by (x.funcion = 'trafico') desc, x.es_principal desc limit 1;
  return jsonb_build_object(
    'envio', jsonb_build_object(
      'id', e.id, 'referencia_gx', e.referencia_gx, 'referencia_cliente', e.referencia_cliente, 'estado', e.estado,
      'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta, 'fecha_carga_real', e.fecha_carga_real,
      'fecha_entrega_estimada', e.fecha_entrega_estimada, 'descripcion_mercancia', e.descripcion_mercancia,
      'toneladas', e.toneladas, 'metros_lineales', e.metros_lineales, 'tipo_carga', e.tipo_carga, 'paletizado', e.paletizado,
      'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera, 'carga_superior', e.carga_superior,
      'plataforma_elevadora', e.plataforma_elevadora, 'nima_requerido', e.nima_requerido, 'adr', e.adr,
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
                    where clave in ('pronto_pago_pct', 'pronto_pago_minimo', 'pronto_pago_dias', 'plazo_pago_transportista_dias'))
  );
end $$;
revoke execute on function datos_orden_transportista(uuid) from public, anon;
grant execute on function datos_orden_transportista(uuid) to authenticated;
