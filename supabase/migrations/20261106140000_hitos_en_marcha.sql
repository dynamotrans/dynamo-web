-- Hitos nuevos (usuario, 2026-11-06: «¿registramos fecha y hora de cada estado?»): la
-- salida hacia la carga y la llegada a cargar quedaban solo en la auditoría, no en la
-- línea de tiempo del envío. Van solos: un valor nuevo de un tipo no se puede usar en la
-- misma transacción en que se crea.
alter type tipo_hito add value if not exists 'hacia_la_carga' after 'matricula_asignada';
alter type tipo_hito add value if not exists 'cargando' after 'hacia_la_carga';
