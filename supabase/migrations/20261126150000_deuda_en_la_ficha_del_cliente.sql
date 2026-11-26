-- LA DEUDA DEL CLIENTE EN SU FICHA, PARA DYNAMO (usuario, 2026-11-26).
-- Lo que debe, lo que lleva más de 60 días sin pagar (el plazo máximo pactado: hay que
-- llamarle), sus envíos a crédito aún sin facturar y cuánto crédito le queda. Las facturas
-- pasadas de 60 días, una a una, para saber qué reclamar. Solo el equipo de Dynamo.
create or replace function public.deuda_cliente_ficha(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare hoy date := (now() at time zone 'Europe/Madrid')::date; v_dias int; u record; c record; r jsonb;
begin
  if not (es_equipo_dynamo() or es_servidor()) then raise exception 'Solo el equipo de Dynamo ve la deuda de un cliente.' using errcode = '42501'; end if;
  select id, riesgo_efectivo_euros into c from clientes where id = p_cliente;
  if c.id is null then return null; end if;
  v_dias := coalesce((select dias_max from clientes_pagos where cliente_id = p_cliente), parametro_num('pago_tarde_dias_max', 60)::int);
  select * into u from credito_usado_de(array[p_cliente]);
  select jsonb_build_object(
      'debe', greatest(coalesce(sum(f.pendiente), 0), 0),
      'facturas', count(*) filter (where f.pendiente > 0),
      'pasado', coalesce(sum(f.pendiente) filter (where f.pendiente > 0 and f.tipo = 'factura' and hoy - f.fecha_emision > v_dias), 0),
      'facturas_pasadas', count(*) filter (where f.pendiente > 0 and f.tipo = 'factura' and hoy - f.fecha_emision > v_dias),
      'dias_mas_antigua', max(hoy - f.fecha_emision) filter (where f.pendiente > 0 and f.tipo = 'factura'),
      'abonos', coalesce(-sum(f.pendiente) filter (where f.pendiente < 0), 0),
      'lista_pasadas', coalesce((select jsonb_agg(jsonb_build_object('numero', x.numero, 'emision', x.fecha_emision, 'pendiente', x.pendiente, 'dias', hoy - x.fecha_emision)
                                                  order by x.fecha_emision)
                                   from (select * from facturas_emitidas x where x.cliente_id = p_cliente and x.tipo = 'factura' and x.estado <> 'anulada'
                                            and x.pendiente > 0 and hoy - x.fecha_emision > v_dias order by x.fecha_emision limit 20) x), '[]'::jsonb))
    into r
    from facturas_emitidas f
   where f.cliente_id = p_cliente and f.estado <> 'anulada' and f.pendiente <> 0;
  return r || jsonb_build_object(
    'dias_plazo', v_dias,
    'sin_facturar', coalesce(u.sin_facturar, 0), 'envios_sin_facturar', coalesce(u.envios, 0),
    'pedidos', coalesce(u.pedidos, 0), 'n_pedidos', coalesce(u.n_pedidos, 0),
    'usado', coalesce(u.usado, 0), 'limite', c.riesgo_efectivo_euros,
    'disponible', case when c.riesgo_efectivo_euros is null then null else c.riesgo_efectivo_euros - coalesce(u.usado, 0) end,
    'credito_real', credito_con_deuda_real(),
    'al_dia_en', (select ultima_ok_en from facturas_copia_estado where id));
end $$;
comment on function public.deuda_cliente_ficha(uuid) is '[Precio y pago] La deuda de un cliente para su ficha (vista de Dynamo): lo que debe según la copia de facturas (menos abonos), lo que lleva más días sin pagar que su plazo (60 por defecto, el pactado; la lista de esas facturas, hasta 20, para reclamarlas), los días de la más antigua, sus envíos a crédito sin facturar y sus pedidos de venta sin facturar, lo usado de su crédito, su límite y lo que le queda, y cuándo se leyó la facturación por última vez. Quién: equipo de Dynamo o servidor. Argumentos: p_cliente: clientes.id.';
revoke all on function public.deuda_cliente_ficha(uuid) from public, anon;
grant execute on function public.deuda_cliente_ficha(uuid) to authenticated, service_role;
