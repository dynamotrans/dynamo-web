-- =====================================================================================
-- ADMIN MASTER: SOLO SE NOMBRA DESDE SUPABASE (decisión del usuario, 2026-11-03)
-- =====================================================================================
-- Nadie puede crear un Admin Master ('admin') desde la web: ni otro Admin Master, ni con
-- la clave de servicio del servidor. Solo desde el panel de Supabase (Table Editor o SQL
-- Editor), que entra como el dueño de la base de datos ('postgres'), nunca por la API.
-- Motivo: el Admin Master lo puede todo; si alguien robara una sesión de admin o la clave
-- de servicio, no podría fabricarse otro.
-- Quitarle el rol a un admin sí se puede desde la web (sigue la regla de «no dejar la
-- plataforma sin ningún admin activo»).
-- =====================================================================================

-- Conexión directa desde Supabase (Table Editor / SQL Editor) o una migración: sin
-- cabeceras de la API y con el rol del dueño. La API llega como anon/authenticated/service_role.
create or replace function es_consola_supabase()
returns boolean language sql stable set search_path = public as $$
  select coalesce(current_setting('role', true), 'none') in ('none', 'postgres', 'supabase_admin')
     and coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = ''
$$;
comment on function es_consola_supabase() is
  'true solo en una conexión directa (panel de Supabase o migración), nunca por la API (anon, authenticated ni service_role).';
revoke execute on function es_consola_supabase() from public, anon, authenticated;

create or replace function fn_usuarios_admin_master()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rol = 'admin' and (tg_op = 'INSERT' or old.rol is distinct from 'admin') and not es_consola_supabase() then
    raise exception 'El Admin Master solo se nombra desde Supabase (Table Editor → usuarios), nunca desde la web.'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists tg_usuarios_admin_master on usuarios;
create trigger tg_usuarios_admin_master before insert or update of rol on usuarios
  for each row execute function fn_usuarios_admin_master();
