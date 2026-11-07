-- =====================================================================================
-- Cuadro de mando: índice por «fecha efectiva» para que no recorra todo el histórico
-- (2026-11-07, preparado para volumen extremo: 100 envíos/día son ~36.000 al año).
--
-- Antes: cuadro_mando leía TODOS los envíos no manuales en cada carga, porque la fecha que
-- cuenta es un coalesce de cuatro columnas (carga real → prevista → primer día de ventana →
-- día de creación) y ningún índice lo cubre. Con años de datos eso es un recorrido completo.
--
-- Ahora: una columna `fecha_efectiva` guarda ese coalesce ya calculado, mantenida sola por un
-- disparador que corre el último (ve las fechas definitivas que ponen los demás). Un índice
-- parcial (solo envíos de Dynamo) la cubre, y el cuadro de mando acota la lectura a la ventana
-- del periodo (más un año atrás para comparar con el mismo mes del año anterior). Los números
-- son idénticos: `fecha_efectiva` es exactamente la misma fecha que se calculaba al vuelo.
-- =====================================================================================

-- ---- Columna + relleno inicial (sin disparar los disparadores de envios) ---------------
alter table public.envios add column if not exists fecha_efectiva date;
comment on column public.envios.fecha_efectiva is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | automático | Fecha que cuenta del envío para los informes: la de carga real, o la prevista, o el primer día de la ventana, o el día en que se creó (zona Europe/Madrid). La mantiene sola un disparador; sirve para acotar el cuadro de mando por fecha con índice.';

-- session_replication_role = replica apaga los disparadores durante el relleno, para no
-- registrar «cambios» falsos ni reejecutar lógica de negocio sobre los envíos ya existentes.
set session_replication_role = replica;
update public.envios
   set fecha_efectiva = coalesce(fecha_carga_real, fecha_carga_prevista, fecha_carga_desde, (creado_en at time zone 'Europe/Madrid')::date);
set session_replication_role = default;

-- ---- Disparador que la mantiene (corre el último: ve las fechas que ponen los demás) ----
create or replace function public.fn_envios_fecha_efectiva()
returns trigger language plpgsql set search_path = public as $$
begin
  new.fecha_efectiva := coalesce(new.fecha_carga_real, new.fecha_carga_prevista, new.fecha_carga_desde,
                                 (new.creado_en at time zone 'Europe/Madrid')::date);
  return new;
end $$;
revoke execute on function public.fn_envios_fecha_efectiva() from public, anon, authenticated;
comment on function public.fn_envios_fecha_efectiva() is '[Disparadores] Recalcula envios.fecha_efectiva (carga real → prevista → primer día de ventana → día de creación). Corre el último de los disparadores del envío para ver las fechas ya definitivas. Quién: disparador de envios.';

-- El nombre con muchas «z» lo coloca después de los demás disparadores BEFORE (se ejecutan por
-- orden de nombre), para que las fechas de carga ya estén puestas cuando este calcula.
drop trigger if exists tg_envios_zzzzz_fecha_efectiva on public.envios;
create trigger tg_envios_zzzzz_fecha_efectiva
  before insert or update on public.envios
  for each row execute function public.fn_envios_fecha_efectiva();

-- ---- Índice parcial: solo envíos de Dynamo (no manuales), por fecha efectiva ------------
create index if not exists idx_envios_fecha_efectiva on public.envios (fecha_efectiva) where not coalesce(es_manual, false);

-- ---- Cuadro de mando: acotado a la ventana del periodo (usa el índice) ------------------
-- (misma función que 20261106163000, con `base` leyendo solo [periodo − 1 año .. periodo], y
--  usando fecha_efectiva en vez de recalcular el coalesce.)
create or replace function cuadro_mando(p_desde date, p_hasta date, p_comp_desde date default null, p_comp_hasta date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_desde date := least(p_desde, p_hasta); v_hasta date := greatest(p_desde, p_hasta);
  -- La lectura necesita, además del periodo, un año antes (comparar con el mismo mes del año
  -- anterior) y el periodo de comparación si lo hay.
  v_lo date := least((v_desde - interval '1 year')::date, coalesce(least(p_comp_desde, p_comp_hasta), v_desde));
  v_hi date := greatest(v_hasta, coalesce(greatest(p_comp_desde, p_comp_hasta), v_hasta));
  v_gran text; r jsonb;
begin
  if not ve_todo() then raise exception 'Solo el equipo de Dynamo ve el cuadro de mando.' using errcode = '42501'; end if;
  if v_desde is null or v_hasta is null or v_hasta - v_desde > 3700 then raise exception 'Periodo no válido (máximo 10 años).'; end if;
  v_gran := case when v_hasta - v_desde <= 62 then 'dia' else 'mes' end;

  with base as (
    select e.id, e.cliente_id, e.transportista_id,
           e.fecha_efectiva as dia,
           e.estado in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado') as hecho,
           e.estado = 'cancelado' as cancelado,
           coalesce(e.importe_cliente, 0) as ic,
           coalesce(e.importe_transportista, e.importe_cliente, 0) as it,
           e.distancia_total_km as km
      from envios e
     where not coalesce(e.es_manual, false)
       and e.fecha_efectiva between v_lo and v_hi
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
