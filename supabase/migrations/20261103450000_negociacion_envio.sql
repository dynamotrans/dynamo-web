-- =====================================================================================
-- NEGOCIACIÓN DEL PRECIO DEL TRANSPORTISTA, FIJADA AL CREAR EL ENVÍO
-- =====================================================================================
-- Hasta ahora la banda (±5/10/30 % o precio fijo) solo se elegía al ofrecer la carga.
-- Ahora Dynamo la puede dejar puesta en el propio envío (al crearlo o al modificarlo) y
-- la ventana de «Ofrecer carga» sale con ese valor. Es un dato INTERNO: el cliente no lo
-- ve (mis_envios no lo devuelve) y el transportista nunca ve el porcentaje, solo el
-- rango en euros (como hasta ahora). Mismos valores que envio_ofertas.banda_pct.
-- =====================================================================================
alter table envios add column negociacion_pct smallint
  check (negociacion_pct is null or negociacion_pct in (0, 5, 10, 30));
comment on column envios.negociacion_pct is
  'Banda de negociación por defecto al ofertar (0 = precio fijo; 5/10 los decide el sistema; 30 lo revisa un agente). Nulo = la de siempre (10). Interno de Dynamo.';
