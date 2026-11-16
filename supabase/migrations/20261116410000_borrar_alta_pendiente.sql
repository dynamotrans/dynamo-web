-- =====================================================================================
-- BORRAR UN ALTA PENDIENTE (usuario, 2026-11-16)
-- =====================================================================================
-- En «Verificar alta» solo se podía confirmar o suspender. Suspender deja la cuenta
-- bloqueada y el email sin poder volver a pedir acceso; faltaba poder QUITAR del todo un
-- alta que no vale (una prueba, alguien que se registró dos veces o con el email
-- equivocado), dejando el email libre para registrarse de nuevo.
--
-- Solo se borra lo que todavía no es nada: un alta de cliente que sigue pendiente de
-- verificar y sin empresa. Una cuenta que ya se activó alguna vez no se borra nunca desde
-- aquí (tiene envíos, firmas o historial que hay que conservar): se suspende o se
-- anonimiza. Lo hace solo el administrador y queda apuntado en la auditoría.
--
-- Se van con ella los documentos que subió para su alta (hoja del CIF, DNI) y sus
-- búsquedas de empresa. Devuelve las rutas de esos ficheros para que el servidor los quite
-- del almacén (si no puede, los recoge la limpieza de archivos sueltos de Mantenimiento).

create or replace function borrar_alta_pendiente(p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u usuarios;
  v_rutas text[];
begin
  if not es_admin_master() then
    raise exception 'Solo el administrador borra un alta.' using errcode = '42501';
  end if;
  select * into u from usuarios where id = p_usuario for update;
  if not found then raise exception 'Esa alta ya no existe.'; end if;
  if u.estado <> 'pendiente_verificacion' or u.rol <> 'cliente' or u.cliente_id is not null or u.transportista_id is not null then
    raise exception 'Solo se borra un alta de cliente que sigue pendiente de verificar y sin empresa. Una cuenta que ya se activó no se borra: se suspende o se anonimiza desde Usuarios.';
  end if;
  select coalesce(array_agg(storage_ruta), '{}') into v_rutas from documentos where usuario_id = p_usuario;
  insert into auditoria (tabla, registro_id, accion, quien, quien_email, quien_origen, cambios)
  values ('usuarios', p_usuario::text, 'baja', auth.uid(),
          (select email from usuarios where id = auth.uid()), 'app',
          jsonb_build_object('email', u.email, 'documentos', coalesce(array_length(v_rutas, 1), 0),
                             'motivo', 'Alta pendiente borrada desde Altas (administrador)'));
  delete from documentos where usuario_id = p_usuario;
  begin
    delete from auth.users where id = p_usuario;   -- se lleva el perfil y sus búsquedas de empresa
  exception when foreign_key_violation then
    raise exception 'Esta alta ya tiene actividad en la plataforma y no se puede borrar. Suspéndela.';
  end;
  return jsonb_build_object('email', u.email, 'rutas', to_jsonb(v_rutas));
end $$;
revoke execute on function borrar_alta_pendiente(uuid) from public, anon;
grant execute on function borrar_alta_pendiente(uuid) to authenticated;
comment on function public.borrar_alta_pendiente(uuid) is '[Altas] Borra del todo un alta de cliente que sigue pendiente de verificar y sin empresa: su usuario de acceso, su perfil, los documentos que subió para el alta y sus búsquedas de empresa. El email queda libre para registrarse otra vez. No borra cuentas que ya se activaron. Lo apunta en la auditoría. Devuelve {email, rutas} (rutas de los ficheros a quitar del almacén). Quién: solo el Admin Master. Argumentos: p_usuario: usuarios.id del alta.';
