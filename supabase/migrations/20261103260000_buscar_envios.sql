-- =====================================================================================
-- BUSCAR ENVÍOS EN LA BASE DE DATOS (cuando haya miles)
-- =====================================================================================
-- La lista de envíos del panel trae todos los envíos vivos y los últimos terminados. Para
-- encontrar uno más antiguo, el buscador pregunta aquí: cada palabra tiene que aparecer
-- en la referencia, la del cliente, el cliente (nombre o CIF), el transportista, la
-- mercancía, las matrículas o cualquier parada (empresa, dirección, CP, población).
-- Sin distinguir mayúsculas ni acentos. Con los permisos de quien busca (security
-- invoker): cada uno encuentra solo lo que ya puede ver.
create or replace function buscar_envios(p_q text, p_limite integer default 500)
returns setof uuid language sql stable security invoker set search_path = public as $$
  with palabras as (
    select replace(replace(lower(unaccent_simple(w)), '%', '\%'), '_', '\_') as w
      from unnest(regexp_split_to_array(trim(coalesce(p_q, '')), '\s+')) w
     where length(w) > 0
  )
  select e.id
    from envios e
    left join clientes c on c.id = e.cliente_id
    left join transportistas t on t.id = e.transportista_id
   where exists (select 1 from palabras)
     and not exists (
       select 1 from palabras
        where lower(unaccent_simple(concat_ws(' ',
                e.referencia_gx, e.referencia_cliente, c.nombre_visible, c.razon_social, c.cif,
                t.nombre_visible, t.razon_social, e.descripcion_mercancia, e.matricula_camion, e.matricula_remolque,
                e.poblacion_origen, e.poblacion_destino, e.codigo_postal_origen, e.codigo_postal_destino,
                (select string_agg(concat_ws(' ', p.nombre_empresa, p.direccion, p.codigo_postal, p.poblacion, p.provincia), ' ')
                   from envio_paradas p where p.envio_id = e.id))))
              not like '%' || palabras.w || '%')
   order by e.creado_en desc
   limit least(greatest(coalesce(p_limite, 500), 1), 2000)
$$;
revoke execute on function buscar_envios(text, integer) from public, anon;
grant execute on function buscar_envios(text, integer) to authenticated;
