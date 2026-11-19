-- =====================================================================================
-- EL BUSCADOR DE ENVÍOS ENCUENTRA POR FECHA (usuario, 2026-11-19)
-- =====================================================================================
-- «Ese buscador debe buscar entre todo ese texto que sale; pongo la fecha 23/01 y no sale
-- uno que se ve.» El campo «Envío relacionado» (incidencias y penalizaciones) y el buscador
-- de la lista de Envíos buscan en el texto que guarda la base de datos, y ese texto no
-- llevaba ninguna fecha, aunque la sugerencia la enseña («Jue 23/01/25»).
-- Ahora lleva las fechas del envío tal y como se leen en pantalla: carga (primer y último
-- día de la ventana, la asignada y la real) y entrega estimada, en corto («jue 23/01/25»)
-- y con el año entero («23/01/2025»). Vale escribir «23/01», «23/01/25» o «01/2025».
-- =====================================================================================

create or replace function public.envio_fechas_texto(e public.envios)
 returns text
 language sql
 stable
 set search_path to 'public'
as $function$
  select string_agg(public.fecha_texto(d) || ' ' || to_char(d, 'DD/MM/YYYY'), ' ' order by d)
    from (select distinct f as d
            from unnest(array[e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_prevista, e.fecha_carga_real, e.fecha_entrega_estimada]) f
           where f is not null) x
$function$;
revoke all on function public.envio_fechas_texto(public.envios) from public, anon;
grant execute on function public.envio_fechas_texto(public.envios) to authenticated, service_role;
comment on function public.envio_fechas_texto(public.envios) is '[Búsqueda] Las fechas de un envío (carga: ventana, asignada y real; entrega estimada) escritas como se leen en pantalla, para que el buscador las encuentre. Quién: uso interno de la búsqueda. Argumentos: e: la fila del envío.';

create or replace function public.envio_texto_busqueda(e public.envios)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select lower(unaccent_simple(concat_ws(' ',
    e.referencia_gx, e.referencia_cliente, e.descripcion_mercancia,
    e.matricula_camion, e.matricula_remolque, e.conductor_nombre,
    e.poblacion_origen, e.poblacion_destino, e.codigo_postal_origen, e.codigo_postal_destino,
    (select concat_ws(' ', c.nombre_visible, c.razon_social, c.cif) from clientes c where c.id = e.cliente_id),
    (select concat_ws(' ', t.nombre_visible, t.razon_social, t.cif) from transportistas t where t.id = e.transportista_id),
    (select concat_ws(' ', o.razon_social, o.cif) from operadores o where o.id = e.operador_id),
    (select string_agg(concat_ws(' ', p.nombre_empresa, p.direccion, p.codigo_postal, p.poblacion, p.provincia, p.referencia), ' ')
       from envio_paradas p where p.envio_id = e.id),
    public.envio_fechas_texto(e))))
$function$;

create or replace function public.envio_texto_propio(e public.envios, p_quien text)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select lower(unaccent_simple(concat_ws(' ',
    e.referencia_gx, case when p_quien = 'cliente' then e.referencia_cliente end, e.descripcion_mercancia,
    e.matricula_camion, e.matricula_remolque, e.conductor_nombre,
    e.poblacion_origen, e.poblacion_destino, e.codigo_postal_origen, e.codigo_postal_destino,
    case when p_quien = 'cliente' then (select concat_ws(' ', o.razon_social, o.cif) from operadores o where o.id = e.operador_id) end,
    (select string_agg(concat_ws(' ', p.nombre_empresa, p.direccion, p.codigo_postal, p.poblacion, p.provincia,
                                 case when p_quien = 'cliente' then p.referencia end), ' ')
       from envio_paradas p where p.envio_id = e.id),
    public.envio_fechas_texto(e))))
$function$;

-- Los envíos que ya hay (sin disparar el resto de disparadores; solo los que cambian).
alter table public.envios disable trigger user;
update public.envios e set texto_busqueda = public.envio_texto_busqueda(e)
 where e.texto_busqueda is distinct from public.envio_texto_busqueda(e);
alter table public.envios enable trigger user;
