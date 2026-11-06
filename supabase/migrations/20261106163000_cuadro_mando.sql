-- CUADRO DE MANDO del Dashboard admin (usuario, 2026-11-06): lo que el usuario llevaba en su
-- hoja (facturación, margen, viajes realizados y solicitados, % cerrados, por día de la
-- semana, km y €/km, por cliente, por mes y acumulado), calculado de los envíos de la
-- plataforma. Solo lectura y solo Dynamo (ve_todo: también los de solo lectura).
--
-- Qué cuenta:
--  · fecha del envío = la de carga real, o la prevista, o el primer día de la ventana;
--  · solo envíos de Dynamo (los manuales del cliente con su operador no son negocio nuestro);
--  · REALIZADOS = en marcha o entregados; SOLICITADOS = todos los pedidos (también solicitudes
--    de precio sin aceptar, programados y cancelados); % cerrados = realizados / solicitados;
--  · FACTURACIÓN = importe al cliente (base sin IVA) de los realizados; COSTE = precio del
--    transportista; MARGEN = facturación − coste (sin precio de transportista cuenta 0 de
--    margen, para no inflarlo);
--  · KM = distancia_total_km de los realizados; €/km solo con los que tienen km.
-- Quitado de la hoja por no aportar: «% capacidad» (dependía de un tope fijo de viajes al día)
-- y «% día sobre total de la semana» (siempre 20 %).

create or replace function cuadro_mando(p_desde date, p_hasta date, p_comp_desde date default null, p_comp_hasta date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_desde date := least(p_desde, p_hasta); v_hasta date := greatest(p_desde, p_hasta);
  v_gran text; r jsonb;
begin
  if not ve_todo() then raise exception 'Solo el equipo de Dynamo ve el cuadro de mando.' using errcode = '42501'; end if;
  if v_desde is null or v_hasta is null or v_hasta - v_desde > 3700 then raise exception 'Periodo no válido (máximo 10 años).'; end if;
  v_gran := case when v_hasta - v_desde <= 62 then 'dia' else 'mes' end;

  with base as (
    select e.id, e.cliente_id, e.transportista_id,
           coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde, (e.creado_en at time zone 'Europe/Madrid')::date) as dia,
           e.estado in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado') as hecho,
           e.estado = 'cancelado' as cancelado,
           coalesce(e.importe_cliente, 0) as ic,
           coalesce(e.importe_transportista, e.importe_cliente, 0) as it,
           e.distancia_total_km as km
      from envios e
     where not coalesce(e.es_manual, false)
  ),
  per as (select * from base where dia between v_desde and v_hasta),
  -- Totales de un conjunto de envíos.
  tot as (
    select count(*) filter (where hecho) as realizados, count(*) as solicitados, count(*) filter (where cancelado) as cancelados,
           coalesce(sum(ic) filter (where hecho), 0) as facturacion,
           coalesce(sum(ic - it) filter (where hecho), 0) as margen,
           coalesce(sum(it) filter (where hecho), 0) as coste,
           coalesce(sum(km) filter (where hecho and km > 0), 0) as km,
           coalesce(sum(ic) filter (where hecho and km > 0), 0) as fact_con_km,
           coalesce(sum(it) filter (where hecho and km > 0), 0) as coste_con_km,
           count(*) filter (where hecho and coalesce(km, 0) = 0) as sin_km,
           count(distinct cliente_id) filter (where hecho) as clientes,
           count(distinct transportista_id) filter (where hecho) as transportistas
      from per
  ),
  comp as (
    select count(*) filter (where hecho) as realizados, count(*) as solicitados, count(*) filter (where cancelado) as cancelados,
           coalesce(sum(ic) filter (where hecho), 0) as facturacion,
           coalesce(sum(ic - it) filter (where hecho), 0) as margen,
           coalesce(sum(it) filter (where hecho), 0) as coste,
           coalesce(sum(km) filter (where hecho and km > 0), 0) as km,
           coalesce(sum(ic) filter (where hecho and km > 0), 0) as fact_con_km,
           coalesce(sum(it) filter (where hecho and km > 0), 0) as coste_con_km,
           count(*) filter (where hecho and coalesce(km, 0) = 0) as sin_km,
           count(distinct cliente_id) filter (where hecho) as clientes,
           count(distinct transportista_id) filter (where hecho) as transportistas
      from base where p_comp_desde is not null and dia between least(p_comp_desde, p_comp_hasta) and greatest(p_comp_desde, p_comp_hasta)
  ),
  -- Evolución: por día (hasta 62 días) o por mes, sin huecos.
  cubos as (
    select g::date as k from generate_series(
      case when v_gran = 'dia' then v_desde else date_trunc('month', v_desde)::date end,
      v_hasta, case when v_gran = 'dia' then interval '1 day' else interval '1 month' end) g
  ),
  serie as (
    select c.k,
           count(p.id) filter (where p.hecho) as realizados, count(p.id) as solicitados,
           coalesce(sum(p.ic) filter (where p.hecho), 0) as facturacion,
           coalesce(sum(p.ic - p.it) filter (where p.hecho), 0) as margen
      from cubos c left join per p
        on (case when v_gran = 'dia' then p.dia else date_trunc('month', p.dia)::date end) = c.k
     group by c.k
  ),
  -- Meses del periodo, con el mismo mes del año anterior para comparar.
  meses as (
    select m::date as k from generate_series(date_trunc('month', v_desde)::date, v_hasta, interval '1 month') m
  ),
  mes_dat as (
    select m.k,
           count(b.id) filter (where b.hecho and b.dia between v_desde and v_hasta) as realizados,
           count(b.id) filter (where b.dia between v_desde and v_hasta) as solicitados,
           coalesce(sum(b.ic) filter (where b.hecho and b.dia between v_desde and v_hasta), 0) as facturacion,
           coalesce(sum(b.ic - b.it) filter (where b.hecho and b.dia between v_desde and v_hasta), 0) as margen,
           coalesce(sum(b.km) filter (where b.hecho and b.km > 0 and b.dia between v_desde and v_hasta), 0) as km
      from meses m left join base b on date_trunc('month', b.dia)::date = m.k
     group by m.k
  ),
  mes_ant as (
    select m.k,
           count(b.id) filter (where b.hecho) as realizados,
           coalesce(sum(b.ic) filter (where b.hecho), 0) as facturacion,
           coalesce(sum(b.ic - b.it) filter (where b.hecho), 0) as margen
      from meses m left join base b on date_trunc('month', b.dia)::date = (m.k - interval '1 year')::date
     group by m.k
  ),
  -- Día de la semana (1 lunes … 7 domingo).
  semana as (
    select d as dow,
           count(p.id) filter (where p.hecho) as realizados,
           coalesce(sum(p.ic) filter (where p.hecho), 0) as facturacion,
           coalesce(sum(p.ic - p.it) filter (where p.hecho), 0) as margen,
           coalesce(sum(p.km) filter (where p.hecho and p.km > 0), 0) as km,
           coalesce(sum(p.ic) filter (where p.hecho and p.km > 0), 0) as fact_con_km,
           coalesce(sum(p.it) filter (where p.hecho and p.km > 0), 0) as coste_con_km
      from generate_series(1, 7) d left join per p on extract(isodow from p.dia)::int = d
     group by d
  ),
  -- Clientes del periodo (los 25 que más facturan), con su riesgo.
  cli as (
    select p.cliente_id,
           count(*) filter (where p.hecho) as realizados, count(*) as solicitados,
           coalesce(sum(p.ic) filter (where p.hecho), 0) as facturacion,
           coalesce(sum(p.ic - p.it) filter (where p.hecho), 0) as margen
      from per p where p.cliente_id is not null group by p.cliente_id
     order by 4 desc, 2 desc limit 25
  ),
  -- Transportistas del periodo (los 10 a los que más se compra).
  tra as (
    select p.transportista_id,
           count(*) filter (where p.hecho) as realizados,
           coalesce(sum(p.it) filter (where p.hecho), 0) as coste,
           coalesce(sum(p.ic - p.it) filter (where p.hecho), 0) as margen,
           coalesce(sum(p.km) filter (where p.hecho and p.km > 0), 0) as km
      from per p where p.transportista_id is not null group by p.transportista_id
     having count(*) filter (where p.hecho) > 0
     order by 3 desc limit 10
  )
  select jsonb_build_object(
    'desde', v_desde, 'hasta', v_hasta, 'granularidad', v_gran,
    'totales', (select to_jsonb(t) from tot t),
    'comparacion', case when p_comp_desde is null then null else (select to_jsonb(c) from comp c) end,
    'serie', (select coalesce(jsonb_agg(to_jsonb(s) order by s.k), '[]') from serie s),
    'meses', (select coalesce(jsonb_agg(jsonb_build_object('k', d.k, 'realizados', d.realizados, 'solicitados', d.solicitados,
                'facturacion', d.facturacion, 'margen', d.margen, 'km', d.km,
                'realizados_ant', a.realizados, 'facturacion_ant', a.facturacion, 'margen_ant', a.margen) order by d.k), '[]')
                from mes_dat d join mes_ant a on a.k = d.k),
    'semana', (select coalesce(jsonb_agg(to_jsonb(w) order by w.dow), '[]') from semana w),
    'clientes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.cliente_id, 'nombre', coalesce(k.nombre_visible, k.razon_social), 'cif', k.cif,
                   'realizados', c.realizados, 'solicitados', c.solicitados, 'facturacion', c.facturacion, 'margen', c.margen,
                   'riesgo', rc.riesgo_efectivo, 'disponible', rc.disponible, 'plazo_pago_dias', k.plazo_pago_dias)
                   order by c.facturacion desc, c.realizados desc), '[]')
                   from cli c join clientes k on k.id = c.cliente_id
                   left join riesgos_clientes() rc on rc.cliente_id = c.cliente_id),
    'transportistas', (select coalesce(jsonb_agg(jsonb_build_object('id', t.transportista_id, 'nombre', x.nombre_visible, 'cif', x.cif,
                   'realizados', t.realizados, 'coste', t.coste, 'margen', t.margen, 'km', t.km) order by t.coste desc), '[]')
                   from tra t join transportistas x on x.id = t.transportista_id)
  ) into r;
  return r;
end $$;
revoke execute on function cuadro_mando(date, date, date, date) from public, anon;
grant execute on function cuadro_mando(date, date, date, date) to authenticated, service_role;
comment on function public.cuadro_mando(date, date, date, date) is '[Avisos y panel] Cuadro de mando del Dashboard admin para un periodo (y otro para comparar): totales (realizados, solicitados, cancelados, facturación, coste, margen, km), evolución por día (hasta 62 días) o por mes, cada mes con el mismo mes del año anterior, por día de la semana, los 25 clientes que más facturan (con riesgo y plazo de pago) y los 10 transportistas a los que más se compra. Envíos de Dynamo (no los manuales); fecha = carga real, prevista o primer día de la ventana. Quién: Dynamo (también solo lectura). Argumentos: p_desde, p_hasta: periodo (máx. 10 años) · p_comp_desde, p_comp_hasta: periodo para comparar (opcional).';
