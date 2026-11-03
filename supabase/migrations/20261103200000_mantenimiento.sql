-- =====================================================================================
-- MODO MANTENIMIENTO (kill-switch de la plataforma, opción del menú de admin)
-- =====================================================================================
-- Encendido, clientes y transportistas ven la pantalla de mantenimiento en vez del panel,
-- y la página pública de aceptar carga se para. El equipo de Dynamo sigue entrando (es
-- quien lo enciende y lo apaga). El valor vive aquí, no en el navegador: vale para todos.
insert into parametros (clave, valor, descripcion) values
  ('mantenimiento_activo', 'false', 'Modo mantenimiento: true = el portal se cierra para clientes y transportistas.')
on conflict (clave) do nothing;

-- Cualquiera puede saber si está en mantenimiento (también la página pública, sin sesión).
create or replace function mantenimiento_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (valor)::text::boolean from parametros where clave = 'mantenimiento_activo'), false)
$$;
grant execute on function mantenimiento_activo() to anon, authenticated;
