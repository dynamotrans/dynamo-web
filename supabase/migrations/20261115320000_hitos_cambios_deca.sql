-- Hitos nuevos para el DeCA (usuario, 2026-11-15; Resolución 5-jun-2026, apdo. quinto):
-- los cambios de FECHA DE CARGA y de MERCANCÍA que hace Dynamo desde «Modificar» después
-- de emitirse el documento de control tienen que quedar en su panel de modificaciones
-- (fecha y peso/naturaleza de la mercancía son datos del documento: Orden FOM/2861/2012,
-- art. 6). Van solos: un valor nuevo de un tipo no se puede usar en la misma transacción
-- en que se crea.
alter type tipo_hito add value if not exists 'fecha_carga_cambiada' after 'fecha_carga_movida';
alter type tipo_hito add value if not exists 'mercancia_cambiada' after 'fecha_carga_cambiada';
