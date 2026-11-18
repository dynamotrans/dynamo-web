-- =====================================================================================
-- DOBLE PASO PARA EL EQUIPO DE DYNAMO (usuario, 2026-11-18)
-- =====================================================================================
-- «Verificación en dos pasos»: además de la contraseña, un código de 6 cifras que da una
-- aplicación del móvil (Google Authenticator u otra). Para los usuarios de Dynamo —Admin
-- Master, Empleado gestor y los de solo lectura—, que son los que ven márgenes, precios de
-- compra y todos los clientes. Clientes y transportistas entran como siempre.
--
-- Los códigos y las aplicaciones los lleva Supabase (su sesión guarda si el segundo paso
-- está hecho: «aal2» en vez de «aal1»). Lo que se añade aquí:
--   · el interruptor `doble_paso_equipo` (Parámetros → Plataforma, solo Admin Master).
--     NACE APAGADO, para que cada uno pueda dar de alta su móvil antes de exigirlo;
--   · con el interruptor encendido, LA BASE DE DATOS no reconoce como equipo de Dynamo a
--     quien no ha hecho el segundo paso en esa sesión: una contraseña robada no ve nada.
--     No es un control de pantalla: va en los cuatro ayudantes de permisos de los que
--     cuelgan todas las políticas y funciones (es_equipo_dynamo, ve_todo, es_solo_lectura,
--     es_admin_master) y en los contadores del menú.
-- Si alguien pierde el móvil: el Admin Master le quita el doble paso desde su ficha de
-- usuario; si es el propio Admin Master, desde el panel de Supabase (Authentication →
-- Users → el usuario → sus factores) o apagando ahí el parámetro.

insert into parametros (clave, valor, descripcion) values
  ('doble_paso_equipo', 'false', 'Doble paso del equipo de Dynamo: true = los usuarios de Dynamo (Admin Master, Empleado gestor y los de solo lectura) tienen que escribir, además de la contraseña, el código de 6 cifras de su aplicación del móvil; sin ese código la base de datos no les deja ver ni cambiar nada. false = no se exige (quien lo haya activado por su cuenta lo sigue usando). Nace apagado: enciéndelo cuando todos tengan su móvil dado de alta.')
on conflict (clave) do nothing;

-- ---- 1. El nivel de la sesión que llama ------------------------------------------------
-- Supabase lo pone en el token: «aal1» = solo contraseña; «aal2» = contraseña + código.
create or replace function public.sesion_nivel()
returns text language plpgsql stable set search_path = public as $$
declare v text;
begin
  begin
    v := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal';
  exception when others then v := null;
  end;
  return coalesce(v, nullif(current_setting('request.jwt.claim.aal', true), ''), 'aal1');
end $$;
revoke execute on function public.sesion_nivel() from public, anon;
grant execute on function public.sesion_nivel() to authenticated, service_role;
comment on function public.sesion_nivel() is '[Ayudantes internos] Nivel de la sesión que llama, sacado del token de Supabase: «aal1» (solo contraseña) o «aal2» (contraseña y código del doble paso). Sin token devuelve «aal1». Quién: cualquier usuario con sesión. Argumentos: sin argumentos.';

-- ---- 2. ¿Se cumple el doble paso? ------------------------------------------------------
create or replace function public.doble_paso_cumplido()
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((select (valor #>> '{}')::boolean from parametros where clave = 'doble_paso_equipo'), false)
      or public.sesion_nivel() = 'aal2'
$$;
revoke execute on function public.doble_paso_cumplido() from public, anon;
grant execute on function public.doble_paso_cumplido() to authenticated, service_role;
comment on function public.doble_paso_cumplido() is '[Ayudantes internos] true si no se exige el doble paso al equipo de Dynamo (parámetro doble_paso_equipo apagado) o si la sesión que llama ya ha hecho el segundo paso (aal2). Lo usan los ayudantes de permisos del equipo de Dynamo. Quién: cualquier usuario con sesión. Argumentos: sin argumentos.';

-- Para la pantalla: ¿a ESTE usuario se le exige? (es de Dynamo y el interruptor está
-- encendido). Lee su rol directamente, porque con el segundo paso sin hacer los ayudantes
-- de permisos ya no le reconocen.
create or replace function public.doble_paso_obligatorio()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (valor #>> '{}')::boolean from parametros where clave = 'doble_paso_equipo'), false)
     and exists (select 1 from usuarios where id = auth.uid() and estado = 'activa'
                    and rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura'))
$$;
revoke execute on function public.doble_paso_obligatorio() from public, anon;
grant execute on function public.doble_paso_obligatorio() to authenticated, service_role;
comment on function public.doble_paso_obligatorio() is '[Clientes y cuentas] Dice si a quien llama se le exige el doble paso: es un usuario de Dynamo activo y el parámetro doble_paso_equipo está encendido. Solo devuelve sí/no. Quién: cualquier usuario con sesión (la pantalla del doble paso y la entrada al panel). Argumentos: sin argumentos.';

-- ---- 3. Los ayudantes de permisos del equipo de Dynamo lo exigen ------------------------
create or replace function public.es_equipo_dynamo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuarios
    where id = auth.uid() and rol in ('admin','empleado') and estado = 'activa'
  ) and public.doble_paso_cumplido()
$$;
create or replace function public.ve_todo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuarios
     where id = auth.uid() and estado = 'activa'
       and rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura')
  ) and public.doble_paso_cumplido()
$$;
create or replace function public.es_solo_lectura()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios where id = auth.uid() and estado = 'activa'
                    and rol in ('admin_lectura', 'empleado_lectura'))
     and public.doble_paso_cumplido()
$$;
create or replace function public.es_admin_master()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios where id = auth.uid() and rol = 'admin' and estado = 'activa')
     and public.doble_paso_cumplido()
$$;
comment on function public.es_equipo_dynamo() is '[Ayudantes internos] Ayudante de permisos: true si quien llama es un usuario de Dynamo activo con rol admin o empleado y, si se exige el doble paso (parámetro doble_paso_equipo), lo ha hecho en esta sesión. Con la clave de servicio da false (no hay usuario). Quién: cualquiera. Argumentos: sin argumentos.';
comment on function public.ve_todo() is '[Ayudantes internos] Ayudante de permisos: true si quien llama es cualquier usuario de Dynamo activo, también los de solo lectura (admin, empleado, admin_lectura, empleado_lectura) y, si se exige el doble paso (parámetro doble_paso_equipo), lo ha hecho en esta sesión. Quién: cualquier usuario con sesión. Argumentos: sin argumentos.';
comment on function public.es_solo_lectura() is '[Ayudantes internos] Ayudante de permisos: true si quien llama es un usuario de Dynamo de solo lectura (admin_lectura o empleado_lectura) y, si se exige el doble paso (parámetro doble_paso_equipo), lo ha hecho en esta sesión. Quién: cualquier usuario con sesión. Argumentos: sin argumentos.';
comment on function public.es_admin_master() is '[Ayudantes internos] Ayudante de permisos: true solo si quien llama es el Admin Master (rol admin, cuenta activa) y, si se exige el doble paso (parámetro doble_paso_equipo), lo ha hecho en esta sesión. Quién: cualquier usuario con sesión. Argumentos: sin argumentos.';

-- ---- 4. Los contadores del menú (miran el rol por su cuenta) ---------------------------
do $$
declare f record; v_def text; v_nueva text; n int := 0;
begin
  for f in select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname = 'contadores_panel' loop
    n := n + 1;
    v_def := pg_get_functiondef(f.oid);
    if v_def like '%doble_paso_cumplido()%' then continue; end if;   -- ya cambiada
    v_nueva := replace(v_def, 'if v_rol is null then return ''{}''::jsonb; end if;',
      'if v_rol is null then return ''{}''::jsonb; end if;' || E'\n'
      || '  if v_rol in (''admin'', ''empleado'', ''admin_lectura'', ''empleado_lectura'') and not doble_paso_cumplido() then return ''{}''::jsonb; end if;');
    if v_nueva = v_def then
      raise exception 'No encuentro en contadores_panel() dónde se lee el rol: revisar la función antes de aplicar.';
    end if;
    execute v_nueva;
  end loop;
  if n = 0 then raise exception 'No existe contadores_panel(): revisar antes de aplicar.'; end if;
end $$;

-- ---- 5. Quitarle el doble paso a un usuario queda apuntado ------------------------------
-- Lo quita la web con la clave de servicio de Supabase (que no tiene autor): aquí se apunta
-- quién lo hizo, como con los cambios de email.
create or replace function public.registrar_doble_paso_quitado(p_usuario uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin_master() then raise exception 'Solo el Admin Master quita el doble paso de un usuario.' using errcode = '42501'; end if;
  if not exists (select 1 from usuarios where id = p_usuario) then raise exception 'Ese usuario no existe.'; end if;
  insert into auditoria (tabla, registro_id, accion, quien, quien_email, quien_origen, cambios)
  values ('usuarios', p_usuario::text, 'modificacion', auth.uid(),
          (select email from usuarios where id = auth.uid()), 'app',
          jsonb_build_object('doble_paso', jsonb_build_object('antes', 'activo', 'despues', 'quitado'),
                             'motivo', 'Doble paso quitado desde Usuarios (Admin Master)'));
end $$;
revoke execute on function public.registrar_doble_paso_quitado(uuid) from public, anon;
grant execute on function public.registrar_doble_paso_quitado(uuid) to authenticated, service_role;
comment on function public.registrar_doble_paso_quitado(uuid) is '[Clientes y cuentas] Apunta en la auditoría que a un usuario se le ha quitado el doble paso (lo quita la web en Supabase Auth; aquí solo se registra quién). Quién: solo el Admin Master. Argumentos: p_usuario: usuarios.id.';
