-- =====================================================================================
-- AJUSTES DE CONTACTOS Y USUARIOS (revisión con el usuario, 2026-11-02)
-- =====================================================================================
-- Segundo bloque de la revisión de tablas. Migración nueva: la 0003 y la 0004 ya están
-- aplicadas en dynamo-pruebas y no se editan (regla 16).
--
--   1. `idioma` en contactos y usuarios → los emails y WhatsApp automáticos salen en
--      el idioma de cada uno (el transportista polaco, en polaco).
--   2. `recibe_avisos` en contactos → quién recibe los avisos automáticos del envío.
--   3. usuarios: `limite_ppto_diario` → `limite_consultas_precio_diario`
--      (los presupuestos salieron del portal en julio; lo que se limita es el tarifador).
--   4. `cargo` en contactos y usuarios (jefe de tráfico, administración…).
-- =====================================================================================


-- ---- 1. Idioma ----------------------------------------------------------------------
-- Código de idioma estándar: 2 letras ('es', 'pl', 'pt') y, si hace falta, la región
-- ('zh-CN'). Son los mismos códigos que usa el selector de idioma de la web.
alter table contactos add column idioma text not null default 'es'
  check (idioma ~ '^[a-z]{2}(-[A-Z]{2})?$');
alter table usuarios  add column idioma text not null default 'es'
  check (idioma ~ '^[a-z]{2}(-[A-Z]{2})?$');

comment on column contactos.idioma is
  'Idioma de los mensajes automaticos a este contacto (es, pl, pt, en...). Por defecto es.';
comment on column usuarios.idioma is
  'Idioma del portal y de los emails a este usuario (es, pl, pt, en...). Por defecto es.';


-- ---- 2. Quién recibe los avisos automáticos -----------------------------------------
-- "El camión va hacia la carga", "entregado"... Sin esta marca, o le llegaría a todos
-- los contactos de la empresa o a ninguno. Por defecto NO: se marca a quien lo quiera.
alter table contactos add column recibe_avisos boolean not null default false;
comment on column contactos.recibe_avisos is
  'Recibe los avisos automaticos de los envios (salida hacia la carga, entregado...).';

create index idx_contactos_avisos on contactos (cliente_id, transportista_id, lugar_id)
  where recibe_avisos;


-- ---- 3. Límite de consultas de precio -----------------------------------------------
-- RENAME: conserva el CHECK (> 0) y la auditoría.
alter table usuarios rename column limite_ppto_diario to limite_consultas_precio_diario;
comment on column usuarios.limite_consultas_precio_diario is
  'Tope diario anti-abuso de consultas al tarifador. null = sin limite.';


-- ---- 4. Cargo -----------------------------------------------------------------------
-- Texto libre a propósito: cada empresa llama a sus puestos de una manera.
alter table contactos add column cargo text;
alter table usuarios  add column cargo text;
comment on column contactos.cargo is 'Puesto de la persona (jefe de trafico, administracion...).';
comment on column usuarios.cargo  is 'Puesto de la persona (jefe de trafico, administracion...).';
