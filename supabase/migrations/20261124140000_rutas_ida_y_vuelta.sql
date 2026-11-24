-- RUTAS GUARDADAS: LA IDA VALE PARA LA VUELTA (usuario, 2026-11-24: «la misma de ida nos vale
-- de vuelta, ¿no? 28340 → 08200 es igual a 08200 → 28340»; «entre códigos postales sería más
-- usable: hay muchas empresas en ese origen y destino»). Cada tramo se guarda por separado
-- (41011 → 28340 y 28340 → 08200), entre sus dos sitios y entre sus dos códigos postales, y
-- se aprovecha en cualquier envío que pase por ahí, en los dos sentidos:
--   · km_sitios y km_cp: si no está guardado el sentido pedido, valen los km del contrario
--     (la diferencia entre ida y vuelta por carretera es de metros).
--   · mapa_trazados: lo mismo con el trazado; dice `invertida` para pintarlo al revés.
-- Lo guardado no caduca para el cálculo (quien llama pide hasta 100 años).
create or replace function public.km_cp(p_pais_codigo_iso_origen character, p_codigo_postal_origen text, p_pais_codigo_iso_destino character, p_codigo_postal_destino text, p_max_edad interval default '1 year'::interval)
returns numeric language sql stable as $function$
  select x.km from (
    select d.km, 1 as sentido
      from distancias_cp d
     where d.pais_codigo_iso_origen  = upper(p_pais_codigo_iso_origen)
       and normalizar_cp(d.codigo_postal_origen)  = normalizar_cp(p_codigo_postal_origen)
       and d.pais_codigo_iso_destino = upper(p_pais_codigo_iso_destino)
       and normalizar_cp(d.codigo_postal_destino) = normalizar_cp(p_codigo_postal_destino)
       and coalesce(d.modificado_en, d.creado_en) > now() - p_max_edad
    union all
    select d.km, 2
      from distancias_cp d
     where d.pais_codigo_iso_origen  = upper(p_pais_codigo_iso_destino)
       and normalizar_cp(d.codigo_postal_origen)  = normalizar_cp(p_codigo_postal_destino)
       and d.pais_codigo_iso_destino = upper(p_pais_codigo_iso_origen)
       and normalizar_cp(d.codigo_postal_destino) = normalizar_cp(p_codigo_postal_origen)
       and coalesce(d.modificado_en, d.creado_en) > now() - p_max_edad
  ) x order by x.sentido limit 1
$function$;
comment on function public.km_cp(character, text, character, text, interval) is '[Distancias y cobertura] Km guardados en la caché entre dos códigos postales (CP normalizados), en el sentido pedido o, si no está, en el contrario (la ida vale para la vuelta); null si no hay o son más viejos que la edad máxima. Quién: Dynamo y servidor (RLS: los demás reciben null). Argumentos: p_pais_codigo_iso_origen, p_codigo_postal_origen, p_pais_codigo_iso_destino, p_codigo_postal_destino · p_max_edad: antigüedad máxima (por defecto 1 año).';

create or replace function public.km_sitios(p_origen uuid, p_destino uuid, p_max_edad interval default '1 year'::interval)
returns numeric language sql stable as $function$
  select x.km from (
    select d.km, 1 as sentido
      from distancias_sitios d
      join sitios lo on lo.id = d.sitio_origen_id  and lo.version_geo = d.version_origen
      join sitios ld on ld.id = d.sitio_destino_id and ld.version_geo = d.version_destino
     where d.sitio_origen_id = p_origen and d.sitio_destino_id = p_destino
       and coalesce(d.modificado_en, d.creado_en) > now() - p_max_edad
    union all
    select d.km, 2
      from distancias_sitios d
      join sitios lo on lo.id = d.sitio_origen_id  and lo.version_geo = d.version_origen
      join sitios ld on ld.id = d.sitio_destino_id and ld.version_geo = d.version_destino
     where d.sitio_origen_id = p_destino and d.sitio_destino_id = p_origen
       and coalesce(d.modificado_en, d.creado_en) > now() - p_max_edad
  ) x order by x.sentido limit 1
$function$;
comment on function public.km_sitios(uuid, uuid, interval) is '[Distancias y cobertura] Km guardados en la caché entre dos sitios, en el sentido pedido o, si no está, en el contrario (la ida vale para la vuelta), solo si ninguno se ha movido desde que se calculó; null si no hay o son demasiado viejos. Quién: Dynamo y servidor (RLS: los demás reciben null). Argumentos: p_origen, p_destino: sitios.id · p_max_edad: antigüedad máxima (por defecto 12 meses).';

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
           'linea', coalesce(ds.linea, dc.linea, dsv.linea, dcv.linea),
           'invertida', ds.linea is null and dc.linea is null and coalesce(dsv.linea, dcv.linea) is not null,
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
    -- El sentido contrario (la vuelta): solo si trae trazado.
    left join lateral (select d.linea from distancias_sitios d
                        where d.sitio_origen_id = t.sitio_b and d.version_origen = t.ver_b
                          and d.sitio_destino_id = t.sitio_a and d.version_destino = t.ver_a
                          and d.linea is not null
                        limit 1) dsv on t.sitio_a is not null and t.sitio_b is not null
    left join lateral (select d.linea from distancias_cp d
                        where d.pais_codigo_iso_origen = t.pais_b and normalizar_cp(d.codigo_postal_origen) = t.cp_b
                          and d.pais_codigo_iso_destino = t.pais_a and normalizar_cp(d.codigo_postal_destino) = t.cp_a
                          and d.linea is not null
                        limit 1) dcv on t.cp_a is not null and t.cp_b is not null
   where t.hasta is not null
     and (t.lat_a, t.lon_a) is distinct from (t.lat_b, t.lon_b)
$$;
comment on function public.mapa_trazados(uuid[]) is '[Envíos] Rutas pintadas por carretera: para los envíos pedidos que ve quien pregunta (como mucho 400), los tramos entre paradas consecutivas con coordenadas y el trazado de la carretera guardado de cada uno: el de sus dos sitios o el de sus dos códigos postales, en su sentido o, si no está, en el contrario (entonces «invertida» dice que hay que pintarlo al revés); vacío si aún no se ha pedido a Google. De cada tramo da además sus dos puntos y dónde se guardaría (sitios, códigos postales y la fila que ya exista), para que el servidor pida a Google el que falte. Quién: quien ve cada envío (Dynamo, el cliente dueño o su transportista); de los que no ve no devuelve nada. Argumentos: p_envios: los envíos de los que se quieren los trazados.';
