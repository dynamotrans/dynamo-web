-- RUTAS PINTADAS POR CARRETERA (usuario, 2026-11-24: «distancias, rutas pintadas… todo entorno
-- Google»). Los mapas dibujaban cada tramo en línea recta. Ahora cada tramo entre dos paradas
-- lleva el TRAZADO de la carretera que da Google Routes, guardado junto a los kilómetros
-- (distancias_sitios / distancias_cp): el mismo origen-destino se pide una sola vez.
--
-- Esta función dice, para los envíos que ve quien pregunta, los tramos de su ruta (entre
-- paradas consecutivas con coordenadas) y el trazado guardado de cada uno, si lo hay. De los
-- que faltan da lo justo para que el SERVIDOR lo pida a Google y lo guarde (la base de datos
-- no llama a internet). Los clientes siguen sin leer las tablas de distancias.
create or replace function public.mapa_trazados(p_envios uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  with visibles as (
    select distinct u.id from unnest(p_envios[1:400]) u(id) where puede_ver_envio(u.id)
  ), par as (
    select p.envio_id, p.orden, p.sitio_id, s.version_geo,
           upper(coalesce(p.pais_codigo_iso, 'ES')) as pais_iso,
           nullif(normalizar_cp(coalesce(p.codigo_postal, '')), '') as cp_norm,
           coalesce(p.lat, s.lat, g.lat) as lat, coalesce(p.lon, s.lon, g.lon) as lon
      from visibles v
      join envio_paradas p on p.envio_id = v.id
      left join sitios s on s.id = p.sitio_id
      left join geo_codigos_postales g on g.pais_codigo_iso = upper(coalesce(p.pais_codigo_iso, 'ES'))
                                      and g.codigo_postal = upper(regexp_replace(coalesce(p.codigo_postal, ''), '\s', '', 'g'))
  ), tr as (
    select a.envio_id, a.orden as desde, lead(a.orden) over w as hasta,
           a.sitio_id as sitio_a, a.version_geo as ver_a, a.pais_iso as pais_a, a.cp_norm as cp_a, a.lat as lat_a, a.lon as lon_a,
           lead(a.sitio_id) over w as sitio_b, lead(a.version_geo) over w as ver_b, lead(a.pais_iso) over w as pais_b,
           lead(a.cp_norm) over w as cp_b, lead(a.lat) over w as lat_b, lead(a.lon) over w as lon_b
      from par a
     where a.lat is not null and a.lon is not null
    window w as (partition by a.envio_id order by a.orden)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'envio', t.envio_id, 'desde', t.desde, 'hasta', t.hasta,
           'linea', coalesce(ds.linea, dc.linea),
           'a', jsonb_build_array(t.lat_a, t.lon_a), 'b', jsonb_build_array(t.lat_b, t.lon_b),
           'sitio_a', case when t.sitio_b is not null then t.sitio_a end,
           'sitio_b', case when t.sitio_a is not null then t.sitio_b end,
           'pais_a', t.pais_a, 'cp_a', t.cp_a, 'pais_b', t.pais_b, 'cp_b', t.cp_b,
           'fila_sitios', ds.id, 'fila_cp', dc.id) order by t.envio_id, t.desde), '[]'::jsonb)
    from tr t
    left join lateral (select d.id, d.linea from distancias_sitios d
                        where d.sitio_origen_id = t.sitio_a and d.version_origen = t.ver_a
                          and d.sitio_destino_id = t.sitio_b and d.version_destino = t.ver_b
                        limit 1) ds on t.sitio_a is not null and t.sitio_b is not null
    left join lateral (select d.id, d.linea from distancias_cp d
                        where d.pais_codigo_iso_origen = t.pais_a and normalizar_cp(d.codigo_postal_origen) = t.cp_a
                          and d.pais_codigo_iso_destino = t.pais_b and normalizar_cp(d.codigo_postal_destino) = t.cp_b
                        limit 1) dc on t.cp_a is not null and t.cp_b is not null
   where t.hasta is not null
     and (t.lat_a, t.lon_a) is distinct from (t.lat_b, t.lon_b)
$$;
revoke execute on function public.mapa_trazados(uuid[]) from public, anon;
grant execute on function public.mapa_trazados(uuid[]) to authenticated, service_role;
comment on function public.mapa_trazados(uuid[]) is '[Envíos] Rutas pintadas por carretera: para los envíos pedidos que ve quien pregunta (como mucho 400), los tramos entre paradas consecutivas con coordenadas y el trazado de la carretera guardado de cada uno (el de sus dos sitios o, si no, el de sus dos códigos postales); vacío si aún no se ha pedido a Google. De cada tramo da además sus dos puntos y dónde se guardaría (sitios, códigos postales y la fila que ya exista), para que el servidor pida a Google el que falte. Quién: quien ve cada envío (Dynamo, el cliente dueño o su transportista); de los que no ve no devuelve nada. Argumentos: p_envios: los envíos de los que se quieren los trazados.';
