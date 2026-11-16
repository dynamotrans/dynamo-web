-- =====================================================================================
-- AL CONCEDER O SUBIR EL CRÉDITO, LOS ENVÍOS PENDIENTES DE PAGO QUE YA CABEN PASAN A
-- CRÉDITO SOLOS (usuario, 2026-11-16: «sí, hazlo y avísame en la campana, es lo lógico»)
-- =====================================================================================
-- El pago por adelantado se decide al confirmar el envío y no se volvía a mirar: si
-- después se le daba crédito al cliente (CESCE lo clasificaba, o Dynamo ponía su crédito
-- manual), sus envíos que ya estaban «pendientes de pago» seguían pidiendo el pago, y
-- había que pasarlos uno a uno desde la ficha.
--
-- AHORA, cuando el crédito que limita a un cliente SUBE (se le concede o se le amplía):
--   · Se repasan sus envíos programados que están pendientes de pago POR FALTA DE CRÉDITO
--     (motivo «Sin crédito…» o «Crédito insuficiente…»), del que carga antes al que carga
--     después.
--   · Cada uno se vuelve a juzgar como si se confirmara ahora (pago_previo_motivo): si ya
--     no hay motivo para pedirle el pago, pasa a «sin pago previo» —igual que cuando
--     Dynamo lo pasa a mano desde la ficha: el cliente recibe su aviso «Ya no hace falta
--     pagar por adelantado» y el envío ya se puede ofertar y asignar—. Si sigue sin caber,
--     se queda pendiente (con el motivo al día).
--   · Dynamo recibe UN aviso en la campana con los envíos que han pasado a crédito.
--
-- NO se tocan: los que Dynamo pidió cobrar por adelantado a mano («Pedido por Dynamo»),
-- los de «primeros envíos», los que ya tienen un pago a cuenta o un cobro con tarjeta sin
-- aplicar, ni los de transportista propio.

create or replace function credito_liberar_pendientes(p_cliente uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; m text; n int := 0; v_refs text := ''; v_cli text;
begin
  for r in select id, referencia_gx, pago_motivo from envios
            where cliente_id = p_cliente and estado = 'programado' and estado_pago_previo = 'pendiente'
              and not coalesce(es_manual, false) and coalesce(pago_a_cuenta, 0) = 0 and stripe_cobro_sin_aplicar is null
              and (pago_motivo like 'Sin crédito%' or pago_motivo like 'Crédito insuficiente%')
            order by fecha_carga_desde nulls last, creado_en
            for update skip locked loop
    -- Como si se confirmara ahora: ¿sigue habiendo motivo para cobrarlo por adelantado?
    m := pago_previo_motivo(p_cliente, r.id);
    if m is null then
      update envios set estado_pago_previo = 'exento', pago_resuelto_por = auth.uid(),
                        pago_exento_motivo = 'Crédito disponible: pasa a crédito solo, al concederse o ampliarse la línea del cliente'
       where id = r.id;
      n := n + 1;
      v_refs := v_refs || case when v_refs = '' then '' else ', ' end || '#' || coalesce(r.referencia_gx, '');
    elsif m is distinct from r.pago_motivo then
      update envios set pago_motivo = m where id = r.id;   -- sigue pendiente, con el motivo de ahora
    end if;
  end loop;
  if n > 0 then
    select nombre_visible into v_cli from clientes where id = p_cliente;
    perform crear_aviso('dynamo', null, null, 'credito_libera_pagos', 'aviso',
      case when n = 1 then '1 envío pasa a crédito · ' else n || ' envíos pasan a crédito · ' end || coalesce(v_cli, 'cliente'),
      'A ' || coalesce(v_cli, 'este cliente') || ' se le ha concedido o ampliado el crédito. '
        || case when n = 1 then 'Su envío ' || v_refs || ', que estaba pendiente de pago, ya cabe en su línea: pasa a crédito y ya se puede ofertar y asignar.'
                else 'Sus envíos ' || left(v_refs, 300) || ', que estaban pendientes de pago, ya caben en su línea: pasan a crédito y ya se pueden ofertar y asignar.' end,
      '/panel/clientes?ver=' || p_cliente, null);
  end if;
  return n;
end $$;
revoke execute on function credito_liberar_pendientes(uuid) from public, anon, authenticated;
comment on function public.credito_liberar_pendientes(uuid) is '[Precio y pago] Repasa los envíos programados de un cliente que están pendientes de pago por falta de crédito y pasa a «sin pago previo» los que ya caben en su línea (del que carga antes al que carga después), avisando a Dynamo en la campana. Se llama sola cuando el crédito que limita al cliente sube. No toca los pedidos por Dynamo, los de primeros envíos ni los que ya tienen pago a cuenta. Devuelve cuántos ha liberado. Quién: solo uso interno. Argumentos: p_cliente: clientes.id.';

create or replace function fn_clientes_credito_libera_pagos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.riesgo_efectivo_euros, 0) > coalesce(old.riesgo_efectivo_euros, 0) then
    perform credito_liberar_pendientes(new.id);
  end if;
  return null;
end $$;
revoke execute on function fn_clientes_credito_libera_pagos() from public, anon, authenticated;
comment on function public.fn_clientes_credito_libera_pagos() is '[Disparadores] Disparador de clientes: cuando sube el crédito que limita a un cliente (se le concede o se le amplía, sea de CESCE o el manual de Dynamo), repasa sus envíos pendientes de pago por falta de crédito y libera los que ya caben (credito_liberar_pendientes).';
create trigger tg_clientes_credito_libera_pagos after update of riesgo_cesce_euros, riesgo_manual_euros on clientes
  for each row execute function fn_clientes_credito_libera_pagos();
