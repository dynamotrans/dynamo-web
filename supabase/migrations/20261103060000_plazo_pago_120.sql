-- =====================================================================================
-- PLAZO DE PAGO DE LOS CLIENTES: 120 DÍAS, Y POR DEFECTO (decisión del usuario, 2026-11-03)
-- =====================================================================================
-- Por la cobertura de la aseguradora de crédito (CESCE), a TODOS los clientes se les
-- clasifica a 120 días, aunque en la práctica paguen (acordado de palabra) a 30 o 60
-- como mucho. Así, si un pago se retrasa, sigue dentro de la cobertura de 120 días.
--
-- Solo cambia en CLIENTES. El plazo de los transportistas (lo que paga Dynamo) no se
-- toca: sigue admitiendo 0, 30, 60 y 90.
--
-- En dynamo-pruebas no hay clientes reales, así que los que haya pasan también a 120.
-- =====================================================================================

alter table clientes drop constraint clientes_plazo_pago_dias_check;
alter table clientes add constraint clientes_plazo_pago_dias_check
  check (plazo_pago_dias in (0, 30, 60, 90, 120));
alter table clientes alter column plazo_pago_dias set default 120;

update clientes set plazo_pago_dias = 120;

comment on column clientes.plazo_pago_dias is
  'Plazo de pago CLASIFICADO para la aseguradora (CESCE). Por defecto 120 dias a todos, '
  'aunque se pacte de palabra pagar a 30 o 60: si se retrasan, siguen cubiertos. '
  'Valores: 0 (contado), 30, 60, 90, 120.';
