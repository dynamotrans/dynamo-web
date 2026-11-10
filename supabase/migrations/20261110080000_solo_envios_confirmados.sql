-- =====================================================================================
-- SOLO EXISTEN ENVÍOS CONFIRMADOS: FUERA LOS BORRADORES (usuario, 2026-11-10)
-- =====================================================================================
-- Decisión del usuario: «No debe haber borradores. Solo deben existir confirmados.
-- Si no, se eliminan.»
--
-- · La única puerta que CREABA borradores persistentes era el flujo antiguo de
--   solicitudes de precio (crear_solicitud_envio: el cliente pedía sin precio y Dynamo
--   lo proponía). La web ya no lo usa (el tarifador da el precio y crear_envio_cliente
--   confirma en la misma transacción), pero la función seguía abierta por API a
--   cualquier cliente. Se ELIMINA.
-- · Los borradores que queden se RETIRAN: pasan a «cancelado» (sin coste, por el
--   trigger de siempre). No se borran físicamente porque el historial (envio_hitos)
--   es inmutable a propósito —garantía antimanipulación— e impide borrar un envío;
--   cancelados desaparecen de todas las listas y contadores.
-- · El estado «borrador» sigue existiendo como estado TRANSITORIO dentro de la
--   transacción de crear_envio_cliente (nace borrador y se confirma en el mismo
--   instante: así quedan los dos hitos, creado y confirmado) y para el par
--   proponer/responder precio, que sin puerta de entrada ya no tiene con qué actuar
--   (su limpieza completa queda para el barrido de código muerto).
-- =====================================================================================

-- 1. Cerrar la puerta: ya no se pueden crear solicitudes sin precio.
drop function if exists crear_solicitud_envio(jsonb, jsonb);

-- 2. Retirar los borradores existentes: a «cancelado» (el trigger del ciclo de vida
--    deja el hito y lo marca sin coste; el rastro queda en el historial inmutable).
update envios set estado = 'cancelado' where estado = 'borrador';
