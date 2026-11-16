-- =====================================================================================
-- EL MOTIVO «SIN CRÉDITO» DICE DE QUIÉN ES EL 0 (para Dynamo)
-- =====================================================================================
-- Desde 20261116670000 el crédito manual de Dynamo manda siempre: un 0 a mano deja al
-- cliente sin crédito aunque CESCE se lo dé. El motivo del pago por adelantado seguía
-- diciendo «CESCE autoriza 0,00 €» también en ese caso, y a Dynamo (que es quien lo lee,
-- en la caja de pago de su ficha) le contaba algo que no era. Ahora distingue:
--   · el 0 lo ha puesto Dynamo a mano → «Sin crédito: crédito de Dynamo a 0,00 €»
--   · el 0 es de CESCE                → «Sin crédito: CESCE autoriza 0,00 €» (como antes)
-- Al cliente este texto no se le enseña: su tarjeta dice solo «Sin crédito disponible».
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.pago_previo_motivo(uuid, uuid)'::regprocedure);
  n := replace(v, 'select riesgo_efectivo_euros, exento_pago_previo_primer_envio into c from clientes',
                  'select riesgo_efectivo_euros, exento_pago_previo_primer_envio, riesgo_manual_euros into c from clientes');
  if n = v then raise exception 'pago_previo_motivo: no encuentro la lectura del cliente'; end if;
  v := n;
  n := replace(v, 'else ''Sin crédito: CESCE autoriza 0,00 €'' end;',
                  'when c.riesgo_manual_euros is not null then ''Sin crédito: crédito de Dynamo a 0,00 €'' else ''Sin crédito: CESCE autoriza 0,00 €'' end;');
  if n = v then raise exception 'pago_previo_motivo: no encuentro el motivo del crédito a 0'; end if;
  execute n;
end $$;
