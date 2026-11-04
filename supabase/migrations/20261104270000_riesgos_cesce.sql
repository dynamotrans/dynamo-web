-- =====================================================================================
-- CESCE - RIESGOS (usuario, 2026-11-04)
--
-- 1. Regla del riesgo que limita a cada cliente («riesgo efectivo»): si el manual de
--    Dynamo (Álvaro) es 0 o está vacío, manda el de CESCE; si es distinto de 0, manda el
--    manual. Antes un manual a 0 dejaba al cliente sin crédito aunque CESCE se lo diera.
--    Sigue siendo una columna calculada (no se puede desincronizar).
-- 2. riesgos_clientes(): para la pantalla «CESCE - Riesgos». Por cliente: lo concedido
--    (CESCE, manual y el que limita), el riesgo ASUMIDO (envíos de los últimos 60 días
--    que no se han pagado por adelantado, con IVA) y lo disponible.
-- =====================================================================================

alter table clientes drop column riesgo_efectivo_euros;
alter table clientes add column riesgo_efectivo_euros numeric(12,2)
  generated always as (coalesce(nullif(riesgo_manual_euros, 0), riesgo_cesce_euros)) stored;
comment on column clientes.riesgo_efectivo_euros is
  'Crédito que limita al cliente: el manual de Dynamo si es distinto de 0; si no, el de CESCE. Calculado.';

insert into parametros (clave, valor, descripcion) values
  ('riesgo_dias_asumido', '60', 'CESCE - Riesgos: días hacia atrás que cuentan como riesgo asumido (envíos aún sin cobrar).')
on conflict (clave) do nothing;

create or replace function riesgos_clientes()
returns table (cliente_id uuid, nombre text, cif text, riesgo_cesce numeric, plazo_cesce integer, riesgo_manual numeric,
               riesgo_efectivo numeric, manda text, envios integer, asumido_base numeric, asumido numeric,
               disponible numeric, ultimo_envio date)
language sql stable security definer set search_path = public as $$
  with d as (select p_num('riesgo_dias_asumido', 60)::int as dias),
  a as (
    select e.cliente_id, count(*)::int as n,
           sum(coalesce(e.importe_cliente, 0)) as base,
           sum(round(coalesce(e.importe_cliente, 0) * (1 + coalesce(c.iva_porcentaje, 21) / 100), 2)) as total,
           max(coalesce(e.fecha_carga_real, e.fecha_carga_desde)) as ultimo
      from envios e join clientes c on c.id = e.cliente_id, d
     where not coalesce(e.es_manual, false)
       and e.estado not in ('borrador', 'cancelado')
       and e.pago_previo in ('no_requerido', 'exento')          -- lo pagado por adelantado no es riesgo
       and coalesce(e.fecha_carga_real, e.fecha_carga_desde, e.creado_en::date) >= current_date - d.dias
     group by e.cliente_id
  )
  select c.id, c.nombre_visible, c.cif, c.riesgo_cesce_euros, c.riesgo_cesce_plazo_dias, c.riesgo_manual_euros,
         c.riesgo_efectivo_euros,
         case when coalesce(c.riesgo_manual_euros, 0) <> 0 then 'manual' when c.riesgo_cesce_euros is not null then 'cesce' else 'ninguno' end,
         coalesce(a.n, 0), coalesce(a.base, 0), coalesce(a.total, 0),
         case when c.riesgo_efectivo_euros is null then null else c.riesgo_efectivo_euros - coalesce(a.total, 0) end,
         a.ultimo
    from clientes c left join a on a.cliente_id = c.id
   where ve_todo()
$$;
revoke execute on function riesgos_clientes() from public, anon;
grant execute on function riesgos_clientes() to authenticated;   -- dentro: solo Dynamo
