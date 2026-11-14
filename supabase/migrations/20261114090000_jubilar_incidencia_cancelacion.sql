-- =====================================================================================
-- FUERA «CANCELACIÓN DEL TRANSPORTE» DEL SELECTOR DE INCIDENCIAS (usuario, 2026-11-14)
-- =====================================================================================
-- No tiene sentido como incidencia: un transporte se cancela cancelando el envío desde
-- su ficha, o llamando. El tipo se JUBILA (activo = false), que es la vía prevista:
-- deja de ofrecerse en nuevas incidencias y las antiguas que lo usan lo conservan.

update tipos_incidencia set activo = false where clave = 'cancelacion_transporte';
