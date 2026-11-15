-- PROFORMA VINCULADA AL ENVÍO PAGADO (usuario, 2026-11-15): cuando un envío con pago
-- previo se paga — a mano por transferencia o solo con tarjeta (Stripe) — su proforma
-- queda vinculada y viaja resuelta en el CONCEPTO del pedido de venta que se importa al
-- programa de gestión: «porte · PROFORMA PRO-GX… · PAGADA VÍA TRANSFERENCIA · FECHA
-- dd/mm/aaaa · IMPORTE 1.234,56 €». Así el pedido llega con el pago anotado y se marca
-- en la factura sin volver a mirar nada. La ficha del envío enseña la misma línea.
-- No hace falta tabla nueva: el nº de proforma es PRO-<referencia GX> (el del PDF) y el
-- método, la fecha y el importe ya viven en el envío (pago_metodo, pagado_en,
-- pago_envio_importes). Solo los envíos PAGADOS llevan la línea; los exentos, no.

-- ---- 1. La línea de la proforma pagada ------------------------------------------------
create or replace function public.proforma_pagada_texto(p_envio uuid)
returns text language sql stable security definer set search_path = public as $$
  select 'PROFORMA PRO-' || e.referencia_gx
         || ' · PAGADA VÍA ' || case e.pago_metodo when 'stripe' then 'STRIPE (TARJETA)' else 'TRANSFERENCIA' end
         || coalesce(' · FECHA ' || to_char(e.pagado_en at time zone 'Europe/Madrid', 'DD/MM/YYYY'), '')
         || ' · IMPORTE ' || euros_texto(i.total)
    from envios e cross join lateral pago_envio_importes(e.id) i
   where e.id = p_envio and e.estado_pago_previo = 'pagado'
     and (ve_todo() or e.cliente_id = cliente_del_usuario())
$$;
revoke execute on function public.proforma_pagada_texto(uuid) from public, anon;
grant execute on function public.proforma_pagada_texto(uuid) to authenticated;
comment on function public.proforma_pagada_texto(uuid) is '[Pagos] La proforma de un envío PAGADO por adelantado, en una línea lista para el concepto del pedido de venta: «PROFORMA PRO-GX… · PAGADA VÍA STRIPE (TARJETA)|TRANSFERENCIA · FECHA dd/mm/aaaa · IMPORTE 1.234,56 €» (importe con IVA, el que se cobró). Vacío si el envío no se ha pagado por adelantado o no es del que pregunta (Dynamo ve todos; el cliente, solo los suyos, como pagos_envio). Quién: la vista del pedido de venta y la ficha del envío. Argumentos: p_envio: envios.id.';

-- ---- 2. El concepto del pedido de venta la lleva --------------------------------------
-- Se reescribe SOLO la columna «Concepto» de v_holded_pedido_venta sobre su definición
-- actual (pg_get_viewdef), para no arrastrar a mano las otras 32 columnas. Si la
-- columna no estuviera como se espera, la migración falla en vez de dejarla a medias.
do $$
declare v_def text; v_nueva text;
begin
  v_def := pg_get_viewdef('public.v_holded_pedido_venta'::regclass, true);
  v_nueva := replace(v_def, 'l.concepto::text AS "Concepto"',
    '(CASE WHEN l.concepto = ''porte''::tipo_concepto AND proforma_pagada_texto(e.id) IS NOT NULL'
    || ' THEN (l.concepto)::text || '' · ''::text || proforma_pagada_texto(e.id)'
    || ' ELSE (l.concepto)::text END) AS "Concepto"');
  if v_nueva = v_def then
    raise exception 'No encuentro la columna Concepto en v_holded_pedido_venta: revisar la vista antes de aplicar. Alrededor: [%]', substr(v_def, greatest(1, position('"Concepto"' in v_def) - 60), 120);
  end if;
  execute 'create or replace view public.v_holded_pedido_venta with (security_invoker = true) as ' || v_nueva;
end $$;
