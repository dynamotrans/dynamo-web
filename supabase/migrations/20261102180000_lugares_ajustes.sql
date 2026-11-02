-- =====================================================================================
-- AJUSTES DE SITIOS (revisión con el usuario, 2026-11-02)
-- =====================================================================================
-- Tercer bloque de la revisión de tablas. Migración nueva (regla 16).
--
--   1. `requiere_cita`      → el almacén solo carga con cita previa.
--                             Por defecto NO (decisión del usuario).
--   2. `tiene_medios_carga` → hay medios de carga/descarga (muelle, carretilla...).
--                             Por defecto SÍ (decisión del usuario). Si es NO, hace falta
--                             camión con trampilla elevadora: el aviso del panel "envío en
--                             tráiler, asegúrate de que hay medios de carga" pasa a poder
--                             salir solo cuando de verdad toca.
-- =====================================================================================

alter table lugares add column requiere_cita      boolean not null default false;
alter table lugares add column tiene_medios_carga boolean not null default true;

comment on column lugares.requiere_cita is
  'Solo carga/descarga con cita previa. Por defecto no. Sirve para avisar al '
  'transportista antes de que el camion llegue y no le carguen.';
comment on column lugares.tiene_medios_carga is
  'Hay medios de carga/descarga (muelle, carretilla...). Por defecto si. Si es no, hace '
  'falta camion con trampilla elevadora.';

-- Para avisar rápido al ofertar: "esta ruta tiene un sitio sin medios / con cita".
create index idx_lugares_sin_medios on lugares (id) where not tiene_medios_carga;
create index idx_lugares_con_cita   on lugares (id) where requiere_cita;
