-- =====================================================================================
-- LAS NOTAS FIJAS DEL SITIO, TAMBIÉN PARA EL CLIENTE (usuario, 2026-11-12)
-- =====================================================================================
-- Las indicaciones permanentes de la ficha del sitio («cargar siempre por el muelle
-- 10»…) se escriben una vez y ya salían en la orden de carga, en la página pública de
-- la carga, en la ficha del viaje del transportista y en la ficha del envío de Dynamo.
-- Faltaba el CLIENTE: paradas_json (lo que alimenta mis_envios / mis_envios_por_ids)
-- no traía las notas del sitio. Se añade 'notas_sitio' leyéndolas EN VIVO de la ficha
-- del sitio: si mañana cambia el muelle, todos los envíos la enseñan actualizada.
create or replace function public.paradas_json(p_envio uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'orden', p.orden, 'tipo', p.tipo, 'sitio_id', p.sitio_id,
           'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion,
           'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion,
           'provincia', p.provincia, 'pais_codigo_iso', p.pais_codigo_iso,
           'lat', p.lat, 'lon', p.lon, 'fecha_desde', p.fecha_desde,
           'fecha_hasta', p.fecha_hasta, 'realizado_en', p.realizado_en,
           'referencia', p.referencia, 'anotaciones', p.anotaciones,
           'notas_sitio', s.anotaciones)
           order by p.orden), '[]'::jsonb)
    from envio_paradas p
    left join sitios s on s.id = p.sitio_id
   where p.envio_id = p_envio
$$;
comment on function public.paradas_json(p_envio uuid) is '[Envíos] Las paradas de un envío en JSON para las listas y fichas del cliente (mis_envios, mis_envios_por_ids…): orden, tipo, dirección, fechas, referencia, anotaciones de la parada y las notas fijas de la ficha del sitio (notas_sitio, leídas en vivo). Quién: interna, la llaman esas funciones. Argumentos: p_envio: envios.id.';
