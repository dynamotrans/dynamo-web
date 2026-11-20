-- =====================================================================================
-- ¿QUIÉN DEL EQUIPO DE DYNAMO TIENE EL DOBLE PASO? (para el Admin Master)
-- =====================================================================================
-- Usuario, 2026-11-20: «no sé si los empleados… lo tienen activado o no… dímelo tú». Hasta
-- ahora solo se veía en la ficha de cada usuario y pedía la clave de servicio (aún sin poner
-- en Vercel). Aquí se lee directamente de Supabase Auth (auth.mfa_factors): sin clave.
create or replace function public.doble_paso_del_equipo()
returns table (usuario_id uuid, email text, nombre text, rol text, estado text, activo boolean, desde timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (es_admin_master() or es_consola_supabase()) then
    raise exception 'Solo el Admin Master ve el doble paso del equipo.' using errcode = '42501';
  end if;
  -- La base de las pruebas no tiene auth.mfa_factors (la de Supabase, sí).
  if to_regclass('auth.mfa_factors') is null then
    return query select u.id, u.email, u.nombre, u.rol::text, u.estado::text, false, null::timestamptz
      from usuarios u where u.rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') order by u.rol, u.email;
    return;
  end if;
  return query execute $q$
    select u.id, u.email, u.nombre, u.rol::text, u.estado::text, f.desde is not null, f.desde
      from usuarios u
      left join lateral (select min(m.created_at) as desde from auth.mfa_factors m
                          where m.user_id = u.id and m.status::text = 'verified') f on f.desde is not null
     where u.rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura')
     order by u.rol, u.email $q$;
end $$;
revoke execute on function public.doble_paso_del_equipo() from public, anon;
grant execute on function public.doble_paso_del_equipo() to authenticated;
comment on function public.doble_paso_del_equipo() is '[Clientes y cuentas] Las personas del equipo de Dynamo (admin, empleado y los de lectura) y si tienen el doble paso activado (un código de Google Authenticator verificado en Supabase Auth), con desde cuándo. Quién: solo el Admin Master. Argumentos: sin argumentos.';
