-- =====================================================================================
-- CARPETA PRIVADA «tarifa» PARA EL TARIFADOR (usuario, 2026-11-05)
-- Aquí irán las tablas de cálculo del precio (regiones, recargos, coeficientes, km entre
-- códigos postales…). De momento, SOLO la carpeta: sin tablas.
-- Privada con doble cerradura:
--   1. No se publica en la API de Supabase (no añadirla en Settings → API → Exposed
--      schemas): desde fuera ni existe.
--   2. Nadie de la web tiene permiso: ni anónimos, ni usuarios con sesión. Solo la leen
--      las funciones de precio (security definer) y la consola de Supabase. Lo que salga
--      hacia la web es el precio, nunca los coeficientes.
-- Las tablas que se creen aquí NO heredan permisos para la web (ver default privileges).
-- La prueba 141 comprueba que siga así.
-- =====================================================================================
create schema if not exists tarifa;
comment on schema tarifa is 'Tablas privadas del tarifador (regiones, recargos, coeficientes, km entre códigos postales). No se publica en la API: solo la leen las funciones de precio. Quién: Dynamo desde Parámetros (por funciones) y la consola de Supabase.';

revoke all on schema tarifa from public, anon, authenticated;
alter default privileges in schema tarifa revoke all on tables    from public, anon, authenticated;
alter default privileges in schema tarifa revoke all on sequences from public, anon, authenticated;
alter default privileges in schema tarifa revoke all on functions from public, anon, authenticated;
