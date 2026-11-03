-- =====================================================================================
-- PAGO POR ADELANTADO DE LOS ALMACENAMIENTOS (proforma) + DATOS BANCARIOS DE DYNAMO
-- =====================================================================================
-- Sin crédito (CESCE), el almacenamiento se paga por adelantado con una proforma. Hasta
-- ahora no se guardaba si ya estaba pagado: ahora `pagado_en` (cuándo validó Dynamo el
-- pago). Con eso sale la pestaña «Pendiente de pago».
--
-- Los datos bancarios de la proforma pasan a Parámetros (claves dynamo_*), como el resto
-- de los datos fijos de Dynamo. El IBAN se deja VACÍO a propósito: lo pone el usuario en
-- Parámetros (el mockup nunca tuvo el real). Mientras esté vacío, la proforma no pone
-- IBAN y dice que se pida por teléfono.

alter table almacenamientos add column pagado_en timestamptz;
comment on column almacenamientos.pagado_en is
  'Cuándo validó Dynamo el pago por adelantado (proforma). Nulo = sin pagar (o no hace falta: pago_adelantado = false).';

insert into parametros (clave, valor, descripcion) values
  ('dynamo_iban',  '""',                'IBAN de Dynamo para las transferencias de las proformas. Si está vacío, la proforma no lo pone.'),
  ('dynamo_banco', '"Banco Santander"', 'Banco de la cuenta de Dynamo (proformas).'),
  ('dynamo_bic',   '"BSCHESMM"',        'BIC/SWIFT del banco de Dynamo (proformas).')
on conflict (clave) do nothing;
