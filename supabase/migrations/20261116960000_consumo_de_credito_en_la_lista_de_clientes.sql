-- =====================================================================================
-- CONSUMO DE CRÉDITO EN LA LISTA DE CLIENTES (usuario, 2026-11-17)
-- =====================================================================================
-- «A la derecha de Condiciones, que se llamará CRÉDITO, pondremos CONSUMO, y sumamos
-- importes pendientes de pago (hasta que conectemos la API de facturación usaremos la suma
-- de envíos generados por antigüedad: riesgo_dias_asumido).»
--
-- Es el MISMO cálculo de CESCE - Riesgos (riesgos_clientes) y de «¿cabe en el crédito?»
-- (credito_alcanza): los envíos de los últimos días (parámetro riesgo_dias_asumido), con
-- IVA, que no se pagaron por adelantado. No son las facturas reales pendientes de cobro:
-- cuando lleguen de la facturación, este cálculo se cambia AQUÍ y la lista no se toca.
--
-- Va por lista de clientes (los de la página que se está viendo), como uso_clientes: no
-- recorre los envíos de todos los clientes para pintar veinte filas.

create or replace function public.consumo_clientes(p_ids uuid[])
returns table (cliente_id uuid, envios integer, consumo numeric, limite numeric, disponible numeric, dias integer)
language sql stable security definer set search_path = public as $$
  with d as (select parametro_num('riesgo_dias_asumido', 60)::int as dias),
  a as (
    select e.cliente_id, count(*)::int as n,
           sum(round(coalesce(e.importe_cliente, 0) * (1 + coalesce(c.iva_pct, 21) / 100), 2)) as total
      from envios e join clientes c on c.id = e.cliente_id, d
     where e.cliente_id = any(p_ids)
       and not coalesce(e.es_manual, false)
       and e.estado not in ('borrador', 'cancelado')
       and e.estado_pago_previo in ('no_requerido', 'exento')   -- lo pagado por adelantado no es consumo
       and coalesce(e.fecha_carga_real, e.fecha_carga_desde, e.creado_en::date) >= (now() at time zone 'Europe/Madrid')::date - d.dias
     group by e.cliente_id
  )
  select c.id, coalesce(a.n, 0), coalesce(a.total, 0), c.riesgo_efectivo_euros,
         case when c.riesgo_efectivo_euros is null then null else c.riesgo_efectivo_euros - coalesce(a.total, 0) end,
         d.dias
    from clientes c cross join d left join a on a.cliente_id = c.id
   where c.id = any(p_ids) and ve_todo()
$$;
revoke execute on function public.consumo_clientes(uuid[]) from public, anon;
grant execute on function public.consumo_clientes(uuid[]) to authenticated, service_role;
comment on function public.consumo_clientes(uuid[]) is '[Precio y pago] Consumo de crédito por cliente para la lista de clientes: envíos de los últimos días (parámetro riesgo_dias_asumido) que no se pagaron por adelantado, con IVA; el mismo cálculo de CESCE - Riesgos. Devuelve cuántos envíos son, el consumo, la línea de crédito que manda, lo que queda disponible (negativo = superado) y los días contados. Hasta conectar la facturación no son facturas reales pendientes. Quién: Dynamo (también solo lectura). Argumentos: p_ids: clientes.id[].';
