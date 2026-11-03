-- =====================================================================================
-- ROLES DE SOLO LECTURA (1/2) — petición del usuario, 2026-11-03
-- =====================================================================================
-- Tipos de usuario de Dynamo a partir de hoy (nombre en el panel → valor en la base):
--   · Admin Master      → 'admin'             (hace todo; ya existía)
--   · Admin lectura     → 'admin_lectura'     (lo ve TODO, no toca nada)        NUEVO
--   · Empleado gestor   → 'empleado'          (crea, edita, borra; ya existía)
--   · Empleado lectura  → 'empleado_lectura'  (supervisor: lo ve, no toca nada) NUEVO
-- Los valores viejos NO se renombran (renombrar obligaría a rehacer decenas de
-- políticas y funciones): solo cambia cómo se llaman en pantalla.
--
-- Va en una migración aparte porque Postgres no deja USAR un valor nuevo de un tipo
-- enumerado en la misma transacción en que se añade. Los permisos, en la siguiente.
-- =====================================================================================
alter type rol_usuario add value if not exists 'admin_lectura';
alter type rol_usuario add value if not exists 'empleado_lectura';
