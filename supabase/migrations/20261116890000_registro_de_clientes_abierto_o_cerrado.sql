-- =====================================================================================
-- REGISTRO DE CLIENTES EN LA WEB: ABIERTO O CERRADO (usuario, 2026-11-17)
-- =====================================================================================
-- Un interruptor en Parámetros para dejar de admitir altas de clientes desde la página de
-- registro («por si tenemos muchos usuarios»). Cerrado, quien intente registrarse ve el
-- mismo mensaje neutro de los bloqueos: «Actualmente no estamos dando de alta nuevos
-- usuarios». NO afecta a:
--   · los transportistas que se dan de alta desde el enlace de una carga (no crean cuenta);
--   · los usuarios que da de alta Dynamo desde «Usuarios»;
--   · los compañeros que un cliente o un transportista ya activo añade desde «Mi cuenta»;
--   · los usuarios que ya existen.
-- Como con los bloqueos, la base de datos lo rechaza aunque alguien se salte la web: con
-- el registro cerrado solo se crea una cuenta nueva si la ha pedido un usuario ya activo
-- (su identificador viaja en la invitación).

insert into parametros (clave, valor, descripcion) values
  ('registro_clientes_abierto', 'true', 'Registro de clientes en la web: true = cualquiera puede darse de alta como cliente desde la página de registro (queda pendiente de tu revisión). false = la página de registro no admite altas nuevas; siguen funcionando las altas que hace Dynamo, los compañeros que añade un usuario activo y las altas de transportistas desde una carga.')
on conflict (clave) do nothing;

create or replace function public.registro_clientes_abierto()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (valor #>> '{}')::boolean from parametros where clave = 'registro_clientes_abierto'), true);
$$;
revoke all on function public.registro_clientes_abierto() from public;
grant execute on function public.registro_clientes_abierto() to anon, authenticated, service_role;
comment on function public.registro_clientes_abierto() is '[Clientes y cuentas] Dice si la página de registro admite altas nuevas de clientes (parámetro registro_clientes_abierto). Solo devuelve sí/no. Quién: cualquiera (la página de registro la consulta sin sesión). Argumentos: sin argumentos.';

do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.fn_crear_perfil_usuario()'::regprocedure);
  n := replace(v, $a$  insert into usuarios (id, email, nombre, rol, estado)$a$,
    $b$  -- Registro de clientes cerrado: solo pasa la cuenta que ha pedido un usuario ya activo
  -- (Dynamo desde «Usuarios», o un compañero de empresa desde «Mi cuenta»).
  if not registro_clientes_abierto() and not exists (
       select 1 from usuarios u
        where u.id::text = new.raw_user_meta_data ->> 'anadido_por' and u.estado = 'activa') then
    raise exception 'registro_cerrado' using errcode = '42501';
  end if;
  insert into usuarios (id, email, nombre, rol, estado)$b$);
  if n = v then raise exception 'fn_crear_perfil_usuario: no encuentro la creación del perfil'; end if;
  execute n;
end $$;
comment on function public.fn_crear_perfil_usuario() is '[Gestión interna] Disparador del alta (auth.users): crea el perfil en usuarios (rol cliente, estado pendiente_verificacion) con el nombre de los metadatos. Rechaza el alta entera si el email está en la lista de bloqueo (bloqueos_alta) o si el registro de clientes está cerrado (parámetro registro_clientes_abierto) y la cuenta no la ha pedido un usuario ya activo. Quién: nadie la llama; la ejecuta la base de datos.';
