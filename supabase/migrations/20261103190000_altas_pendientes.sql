-- =====================================================================================
-- ALTAS PENDIENTES (pantalla «Altas pendientes» del panel, solo Dynamo)
-- =====================================================================================
-- Quien se registra en el portal nace como CLIENTE, 'pendiente_verificacion' y sin
-- empresa (migración usuarios_y_roles). Lo que escribió en el formulario de registro
-- (empresa, CIF, dirección, teléfono, DNI…) va en los metadatos de Supabase Auth, que no
-- se pueden leer con la clave pública. Esta función se los enseña SOLO a Dynamo.
create or replace function altas_pendientes()
returns table (id uuid, email text, nombre text, telefono text, documento text, solicitada_en timestamptz,
               confirmado_email boolean, datos jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo el equipo de Dynamo ve las altas pendientes.' using errcode = '42501'; end if;
  return query
    select u.id, u.email, u.nombre, u.telefono, u.documento, u.creado_en,
           a.email_confirmed_at is not null, coalesce(a.raw_user_meta_data, '{}'::jsonb)
      from usuarios u
      left join auth.users a on a.id = u.id
     where u.estado = 'pendiente_verificacion' and u.cliente_id is null and u.transportista_id is null
     order by u.creado_en desc;
end $$;
revoke execute on function altas_pendientes() from public, anon;
grant execute on function altas_pendientes() to authenticated;
