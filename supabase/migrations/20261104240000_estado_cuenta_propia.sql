-- =====================================================================================
-- ESTADO DE LA CUENTA: tres cosas que no tenían sentido (usuario, 2026-11-04)
--   · nadie puede suspender (ni cambiar el estado de) su PROPIA cuenta;
--   · el estado de un Admin Master solo se cambia desde Supabase (como su rol);
--   · una cuenta activa o suspendida no vuelve a «pendiente de verificación» (ese
--     estado solo existe mientras se revisa un alta).
-- El servidor (Supabase directo) sigue pudiendo todo.
-- =====================================================================================

create or replace function fn_usuarios_campos_protegidos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_yo_rol rol_usuario;
begin
  if new.rol is distinct from old.rol
     and (old.cliente_id is not null or old.transportista_id is not null)
     and new.rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then
    raise exception 'Un email de % no puede pasar a %. Hay que borrar el usuario y darlo de alta de nuevo.',
      old.rol, new.rol using errcode = '42501';
  end if;

  if es_servidor() or autosusp_en_curso(old, new) then return new; end if;
  select rol into v_yo_rol from usuarios where id = auth.uid() and estado = 'activa';

  -- Estado de la cuenta (2026-11-04): nadie se suspende a sí mismo, el Admin Master solo
  -- se toca desde Supabase, y una cuenta no vuelve a «pendiente de verificación».
  if new.estado is distinct from old.estado then
    if new.id = auth.uid() then
      raise exception 'Nadie puede cambiar el estado de su propia cuenta.' using errcode = '42501';
    end if;
    if old.rol = 'admin' then
      raise exception 'El estado de un Admin Master solo se cambia desde Supabase.' using errcode = '42501';
    end if;
    if new.estado = 'pendiente_verificacion' then
      raise exception 'Una cuenta no puede volver a «pendiente de verificación»: o activa o suspendida.' using errcode = '42501';
    end if;
  end if;

  if (new.rol, new.estado, new.cliente_id, new.transportista_id,
      new.limite_consultas_precio_diario, new.limite_cargas_diario)
     is distinct from
     (old.rol, old.estado, old.cliente_id, old.transportista_id,
      old.limite_consultas_precio_diario, old.limite_cargas_diario) then
    if v_yo_rol is null or v_yo_rol not in ('admin', 'empleado') then
      raise exception 'Solo Dynamo puede cambiar el rol, el estado o la empresa de una cuenta.'
        using errcode = '42501';
    end if;
    if new.rol is distinct from old.rol and new.id = auth.uid() then
      raise exception 'Nadie puede cambiar su propio rol.' using errcode = '42501';
    end if;
    if new.rol in ('admin', 'admin_lectura') and new.rol is distinct from old.rol and v_yo_rol <> 'admin' then
      raise exception 'Solo el Admin Master puede conceder el rol %.', new.rol using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
