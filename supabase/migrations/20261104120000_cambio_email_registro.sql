-- =====================================================================================
-- CAMBIO DE EMAIL DE UNA CUENTA: solo el Admin Master, y queda QUIÉN lo hizo
-- =====================================================================================
-- Decisión del usuario (2026-11-04, repaso de seguridad): cambiar el email con el que
-- entra alguien es la puerta para quedarse con su cuenta (luego basta «¿olvidaste tu
-- contraseña?» al email nuevo). Por eso solo lo hace el Admin Master.
--
-- El cambio en sí lo hace el servidor con la clave de servicio (Supabase Auth), y por eso
-- la auditoría automática lo apunta sin autor. Esta función deja la fila de auditoría con
-- el Admin Master que lo pidió, el email de antes y el de después. Solo la puede llamar
-- un Admin Master, y solo si el email de esa cuenta YA es el nuevo (no se puede apuntar
-- un cambio que no ha pasado).
-- =====================================================================================
create or replace function registrar_cambio_email(p_usuario uuid, p_antes text, p_despues text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_administrador() then raise exception 'Solo el administrador cambia el email de una cuenta.'; end if;
  if not exists (select 1 from usuarios where id = p_usuario and lower(email) = lower(trim(p_despues))) then
    raise exception 'Ese cambio de email no ha ocurrido.';
  end if;
  insert into auditoria (tabla, registro_id, accion, quien, quien_email, quien_origen, cambios)
  values ('usuarios', p_usuario::text, 'modificacion', auth.uid(),
          (select email from usuarios where id = auth.uid()), 'app',
          jsonb_build_object('email', jsonb_build_object('antes', lower(trim(p_antes)), 'despues', lower(trim(p_despues))),
                             'motivo', 'Cambio de email desde Usuarios (Admin Master)'));
end $$;
revoke execute on function registrar_cambio_email(uuid, text, text) from public, anon;
grant execute on function registrar_cambio_email(uuid, text, text) to authenticated;
