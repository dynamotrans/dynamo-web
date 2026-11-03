-- =====================================================================================
-- USUARIOS EN EL PANEL (2026-11-03)
-- =====================================================================================
-- Lo que necesita la pantalla Usuarios y que la base de datos aún no imponía:
--
--   1. REGLA DURA del panel (mockup, "Cambiar rol…"): un email de CLIENTE o de
--      TRANSPORTISTA (una cuenta ya atada a esa empresa) nunca pasa a EMPLEADO ni a ADMIN. Para hacer interna a esa persona
--      se borra el usuario y se da de alta de nuevo (normalmente con email de Dynamo).
--      Motivo: ese email ha estado fuera, en manos de otra empresa.
--   2. `conexiones_usuarios()`: última conexión y si confirmó su email, que viven en
--      Supabase Auth (`auth.users`) y no se pueden leer desde la aplicación. Solo Dynamo.
-- =====================================================================================

-- ---- 1. Mismas reglas que antes + la nueva ------------------------------------------
create or replace function fn_usuarios_campos_protegidos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_yo_rol rol_usuario;
begin
  -- La regla nueva va ANTES del atajo del servidor: no se la salta nadie.
  -- Ojo: toda cuenta NACE con rol cliente (fn_crear_perfil_usuario), también la de un
  -- empleado invitado, que luego se sube. Por eso la regla mira si la cuenta ya está
  -- ATADA a la empresa de un cliente o de un transportista, no solo el rol.
  if new.rol is distinct from old.rol
     and (old.cliente_id is not null or old.transportista_id is not null)
     and new.rol in ('admin', 'empleado') then
    raise exception 'Un email de % no puede pasar a %. Hay que borrar el usuario y darlo de alta de nuevo.',
      old.rol, new.rol using errcode = '42501';
  end if;

  if es_servidor() then return new; end if;
  select rol into v_yo_rol from usuarios where id = auth.uid() and estado = 'activa';

  if (new.rol, new.estado, new.cliente_id, new.transportista_id,
      new.limite_consultas_precio_diario, new.limite_cargas_diario)
     is distinct from
     (old.rol, old.estado, old.cliente_id, old.transportista_id,
      old.limite_consultas_precio_diario, old.limite_cargas_diario) then
    if v_yo_rol not in ('admin', 'empleado') then
      raise exception 'Solo Dynamo puede cambiar el rol, el estado o la empresa de una cuenta.'
        using errcode = '42501';
    end if;
    if new.rol is distinct from old.rol and new.id = auth.uid() then
      raise exception 'Nadie puede cambiar su propio rol.' using errcode = '42501';
    end if;
    if new.rol = 'admin' and old.rol <> 'admin' and v_yo_rol <> 'admin' then
      raise exception 'Solo un administrador puede conceder el rol de administrador.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- ---- 2. Última conexión (de Supabase Auth), solo para Dynamo ------------------------
create or replace function conexiones_usuarios()
returns table (id uuid, ultima_conexion timestamptz, email_confirmado boolean)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.last_sign_in_at, u.email_confirmed_at is not null
    from auth.users u
   where es_admin()
$$;
comment on function conexiones_usuarios() is
  'Ultima conexion y email confirmado de cada usuario (viven en auth.users). Solo Dynamo; '
  'a cualquier otro le devuelve cero filas.';
revoke execute on function conexiones_usuarios() from public, anon;
