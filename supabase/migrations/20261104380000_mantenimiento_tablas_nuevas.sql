-- =====================================================================================
-- MANTENIMIENTO EN LA BASE DE DATOS: TABLAS NUEVAS Y TAREAS AUTOMÁTICAS (2026-11-04)
--
-- El bloqueo de escrituras con el mantenimiento encendido (20261103270000) se puso en las
-- tablas que existían ese día. Desde entonces hay dos más que se escriben desde la web
-- de clientes y transportistas: las reservas del CMR y los hitos del envío. Se añaden.
--
-- Y una corrección: el bloqueo dejaba pasar al equipo de Dynamo y a la clave de servicio,
-- pero NO a las tareas automáticas (pg_cron) ni a las migraciones, que se conectan directo
-- a la base de datos sin sesión de usuario. Con el mantenimiento encendido, esas tareas
-- (caducar ofertas, suspensiones, avisos…) fallaban. Ahora una conexión directa —sin
-- usuario de la web y sin pasar por la API— también pasa.
--
-- Fuera del bloqueo, a propósito: usuarios (entrar en la cuenta escribe en ella y, con el
-- mantenimiento, tienen que poder llegar a la pantalla de aviso), los registros de
-- consultas, conexión e intentos, y los catálogos que solo toca Dynamo. La prueba 115
-- avisa si se crea una tabla nueva sin decidir esto.
-- =====================================================================================

create or replace function fn_bloqueo_mantenimiento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_directo boolean;
begin
  -- Conexión directa (pg_cron, migraciones): ni API (authenticator) ni usuario en la sesión.
  v_directo := session_user not in ('authenticator', 'anon', 'authenticated')
               and nullif(current_setting('request.jwt.claim.sub', true), '') is null
               and nullif(current_setting('request.jwt.claims', true), '') is null;
  if mantenimiento_activo() and not es_admin() and not es_servidor() and not v_directo then
    raise exception 'La plataforma está en mantenimiento: vuelve a intentarlo en un rato.' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function fn_bloqueo_mantenimiento() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['cmr_reservas', 'envio_hitos'] loop
    continue when to_regclass('public.' || t) is null;
    execute format('drop trigger if exists tg_mantenimiento on %I', t);
    execute format('create trigger tg_mantenimiento before insert or update or delete on %I
                    for each row execute function fn_bloqueo_mantenimiento()', t);
  end loop;
end $$;
