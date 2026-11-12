-- =====================================================================================
-- LIMPIEZA: FUERA LAS FUNCIONES DEL FLUJO VIEJO DE SOLICITUDES DE PRECIO
-- =====================================================================================
-- El flujo «solicitud → Dynamo pone precio → el cliente acepta o contraoferta» se retiró
-- el 2026-11-08 (el tarifador es automático: crear_envio_cliente crea el envío YA
-- preciado y programado, y crear_solicitud_envio se borró entonces). Sus tres funciones
-- quedaron sin uso por el patrón estrangulador y aquí se retiran del todo, con su UI
-- (pantalla «Poner precio», aceptar/contraofertar del cliente) y sus pruebas.
--
-- SE CONSERVAN a propósito: la columna envios.estado_solicitud y sus valores (histórico
-- de envíos reales), mi_contraoferta() y resolver_contraoferta_cliente() con los
-- interruptores de contraoferta (parámetro general + permite_contraoferta de la ficha
-- del cliente), por si la contraoferta vuelve sobre el flujo nuevo del tarifador.

drop function if exists proponer_precio_solicitud(uuid, numeric, numeric);
drop function if exists responder_precio_solicitud(uuid, boolean, numeric);
drop function if exists contraofertar_precio_solicitud(uuid, numeric);
