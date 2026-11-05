-- =====================================================================================
-- DURACIÓN DE LA SESIÓN (usuario, 2026-11-05): cuántos días se puede entrar sin volver a
-- escribir la contraseña, en Parámetros. Cuenta desde la última vez que se escribió (o se
-- entró con el enlace del email); pasado el plazo, la web cierra la sesión de ese
-- dispositivo y pide entrar otra vez. 0 = sin límite.
--   · sesion_recordar_dias (90): con «Recordarme» marcado (lo normal).
--   · sesion_dias (30): sin «Recordarme»; además se cierra al cerrar el navegador.
-- Lo aplica el middleware de la web (lib/supabase/duracionSesion.ts) con duracion_sesion().
-- =====================================================================================
insert into public.parametros (clave, valor, descripcion) values
  ('sesion_recordar_dias', '90', 'Días que se puede entrar sin volver a escribir la contraseña, con «Recordarme» marcado. 0 = sin límite.'),
  ('sesion_dias', '30', 'Días que se puede entrar sin volver a escribir la contraseña, sin «Recordarme» (además, la sesión se cierra al cerrar el navegador). 0 = sin límite.')
on conflict (clave) do nothing;

create or replace function public.duracion_sesion()
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object('recordar_dias', parametro_num('sesion_recordar_dias', 90), 'dias', parametro_num('sesion_dias', 30))
$function$;
revoke all on function public.duracion_sesion() from public, anon;
grant execute on function public.duracion_sesion() to authenticated, service_role;
comment on function public.duracion_sesion() is '[Usuarios y acceso] Días que dura una sesión sin volver a escribir la contraseña (de Parámetros): {recordar_dias, dias}; 0 = sin límite. La usa la web para cerrar la sesión pasado el plazo. Quién: cualquier usuario con sesión. Argumentos: sin argumentos.';
