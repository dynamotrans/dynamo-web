-- ENTREGA ESTIMADA EN VENTANA (usuario, 2026-11-19): mientras el envío no tenga su fecha
-- de entrega fijada (se fija al asignar el transportista), la lista y las fichas enseñan una
-- ventana estimada a partir de la de recogida, con la misma cuenta que el tarifador de
-- «Nuevo envío»: ~600 km por día de viaje, solo días hábiles. Recoge del miércoles al
-- viernes con 1 día de viaje → entrega estimada del jueves al lunes.
-- Con la fecha de carga ya asignada (o real), la ventana se cierra a un día.

-- ---- 1. Días de viaje de un envío (interno) ------------------------------------------
-- Los km, tramo a tramo, como kmRuta() del servidor web: caché de km entre sitios → caché
-- entre códigos postales → línea recta entre coordenadas × 1,25 → 300 km.
create or replace function envio_dias_viaje(p_envio uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare a record; b record; t numeric; km numeric := 0; n int := 0;
begin
  for b in select p.sitio_id, p.codigo_postal, p.pais_codigo_iso, s.lat, s.lon
             from envio_paradas p left join sitios s on s.id = p.sitio_id
            where p.envio_id = p_envio order by p.orden
  loop
    n := n + 1;
    if n > 1 then
      t := null;
      if a.sitio_id is not null and b.sitio_id is not null then t := km_sitios(a.sitio_id, b.sitio_id, interval '100 years'); end if;
      if t is null and a.codigo_postal is not null and b.codigo_postal is not null then
        t := km_cp(a.pais_codigo_iso, a.codigo_postal, b.pais_codigo_iso, b.codigo_postal, interval '100 years');
      end if;
      if t is null and a.lat is not null and a.lon is not null and b.lat is not null and b.lon is not null then
        t := round(2 * 6371 * asin(sqrt(power(sin(radians(b.lat - a.lat) / 2), 2)
               + cos(radians(a.lat)) * cos(radians(b.lat)) * power(sin(radians(b.lon - a.lon) / 2), 2))) * 1.25);
      end if;
      km := km + coalesce(t, 300);
    end if;
    a := b;
  end loop;
  if n < 2 then return null; end if;
  return greatest(1, ceil(km / 600))::int;
end $$;
revoke all on function envio_dias_viaje(uuid) from public, anon, authenticated;
grant execute on function envio_dias_viaje(uuid) to service_role;
comment on function envio_dias_viaje(uuid) is '[Envíos] Días de viaje estimados de un envío (~600 km por día, mínimo 1), con los km de su ruta: caché entre sitios, caché entre códigos postales, línea recta entre coordenadas × 1,25 o 300 km por tramo. Null con menos de 2 paradas. Quién: interno (lo usa entregas_estimadas). Argumentos: p_envio: envios.id.';

-- ---- 2. La entrega estimada de las listas y las fichas -------------------------------
create or replace function entregas_estimadas(p_ids uuid[])
returns table (envio_id uuid, desde date, hasta date, fijada boolean)
language sql
stable
security definer
set search_path = public
as $$
  select e.id,
         coalesce(e.fecha_entrega_estimada, case when b.ini is not null and d.dias is not null then sumar_dias_habiles(b.ini, d.dias) end),
         coalesce(e.fecha_entrega_estimada, case when b.fin is not null and d.dias is not null then sumar_dias_habiles(b.fin, d.dias) end),
         e.fecha_entrega_estimada is not null
    from envios e
    cross join lateral (select coalesce(e.fecha_carga_real::date, e.fecha_carga_prevista, e.fecha_carga_desde) as ini,
                               coalesce(e.fecha_carga_real::date, e.fecha_carga_prevista, e.fecha_carga_hasta, e.fecha_carga_desde) as fin) b
    cross join lateral (select case when e.fecha_entrega_estimada is null then envio_dias_viaje(e.id) end as dias) d
   where e.id = any(p_ids) and cardinality(p_ids) <= 200
     and (ve_todo() or e.cliente_id = cliente_del_usuario() or e.transportista_id = transportista_del_usuario())
$$;
revoke all on function entregas_estimadas(uuid[]) from public, anon;
grant execute on function entregas_estimadas(uuid[]) to authenticated, service_role;
comment on function entregas_estimadas(uuid[]) is '[Envíos] Para las listas y fichas (máx. 200 ids): la entrega estimada de cada envío. Con la fecha de entrega fijada (al asignar el transportista), esa (fijada = true); si no, una ventana: la recogida (real, asignada o la ventana pedida) más los días de viaje estimados, en días hábiles. Quién: Dynamo, cliente dueño o transportista asignado. Argumentos: p_ids: envios.id.';
