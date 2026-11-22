-- EL EMAIL DE UN TRANSPORTISTA TAMPOCO PUEDE DARSE DE ALTA COMO CLIENTE (usuario, 2026-11-22):
-- «el email que usan los transportistas tampoco debe estar habilitado para crear un usuario…
-- con el formulario de alta lo primero que se pide es un email: ese debe salir bloqueado».
-- Completa la barrera del CIF (20261122160000). Es email de un transportista el de cualquier
-- contacto de su ficha y el de sus usuarios. Se bloquea:
--   · el registro de la web (lo primero que se escribe es el email): no llega ni a mandarse el código;
--   · la base de datos al crear la cuenta por su cuenta (sin pasar por la web), al poner a un
--     usuario como cliente con ese email (también si lo hace Dynamo) y al cambiar el email de un
--     cliente a uno de transportista.
-- Las cuentas de transportista que crea Dynamo («Usuarios») siguen funcionando.

create or replace function public.email_es_de_transportista(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select nullif(lower(btrim(coalesce(p_email, ''))), '') is not null and (
    exists (select 1 from contactos c where c.transportista_id is not null and lower(btrim(c.email)) = lower(btrim(p_email)))
    or exists (select 1 from usuarios u where u.rol = 'transportista' and lower(btrim(u.email)) = lower(btrim(p_email))))
$$;
revoke execute on function public.email_es_de_transportista(text) from public, anon, authenticated;
comment on function public.email_es_de_transportista(text) is '[Gestión interna] Dice si un email es de un transportista: el de algún contacto de su ficha o el de alguno de sus usuarios (sin contar mayúsculas ni espacios). Quién: funciones internas (barrera de altas de cliente). Argumentos: p_email: el email.';

-- Lo que pregunta el registro de la web antes de mandar el código (y «Mi cuenta» al cambiar el email).
create or replace function public.email_admitido_para_cliente(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select not alta_bloqueada(p_email) and not email_es_de_transportista(p_email)
$$;
revoke execute on function public.email_admitido_para_cliente(text) from public;
grant execute on function public.email_admitido_para_cliente(text) to anon, authenticated;
comment on function public.email_admitido_para_cliente(text) is '[Altas] Dice si un email puede darse de alta (o pasar a ser) usuario de un cliente: no está en la lista de bloqueo de altas ni es de un transportista. Solo contesta sí o no. Quién: el registro de la web (sin sesión) y «Mi cuenta» al cambiar el email. Argumentos: p_email: el email.';

create or replace function public.fn_crear_perfil_usuario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if alta_bloqueada(new.email) then
    raise exception 'alta_bloqueada' using errcode = '42501';
  end if;
  -- Alta por su cuenta (sin que la pida un usuario activo) con el email de un transportista: no
  -- (usuario, 2026-11-22). Las cuentas de transportista las crea Dynamo desde «Usuarios».
  if new.raw_user_meta_data ->> 'anadido_por' is null and email_es_de_transportista(new.email) then
    raise exception 'alta_bloqueada' using errcode = '42501';
  end if;
  -- Registro de clientes cerrado: solo pasa la cuenta que ha pedido un usuario ya activo
  -- (Dynamo desde «Usuarios», o un compañero de empresa desde «Mi cuenta»).
  if not registro_clientes_abierto() and not exists (
       select 1 from usuarios u
        where u.id::text = new.raw_user_meta_data ->> 'anadido_por' and u.estado = 'activa') then
    raise exception 'registro_cerrado' using errcode = '42501';
  end if;
  insert into usuarios (id, email, nombre, rol, estado)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'nombre', '')), ''),
    'cliente',                    -- el rol se eleva a mano, nunca al registrarse
    'pendiente_verificacion'      -- un alta nueva NO entra activa
  )
  on conflict (id) do nothing;
  return new;
end $function$;

-- Un usuario de CLIENTE nunca con el email de un transportista (al ponerlo como cliente, al
-- asignarle el cliente o al cambiarle el email; también si lo hace Dynamo).
create or replace function public.fn_usuarios_cliente_no_transportista()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rol = 'cliente'
     and (new.rol is distinct from old.rol or new.cliente_id is distinct from old.cliente_id
          or lower(btrim(new.email)) is distinct from lower(btrim(old.email)))
     and exists (select 1 from contactos c where c.transportista_id is not null and lower(btrim(c.email)) = lower(btrim(new.email))) then
    raise exception 'Este email es de un transportista: no se puede usar para un usuario de cliente.' using errcode = '23505';
  end if;
  return new;
end $$;
revoke execute on function public.fn_usuarios_cliente_no_transportista() from public, anon, authenticated;
comment on function public.fn_usuarios_cliente_no_transportista() is '[Gestión interna] Disparador de usuarios: no deja que un usuario de cliente lleve el email de un contacto de transportista (al ponerle el rol de cliente, asignarle el cliente o cambiarle el email), también si lo hace Dynamo (usuario, 2026-11-22). No afecta a los usuarios que ya existían mientras no cambien esos datos. Quién: nadie la llama; la ejecuta la base de datos.';

drop trigger if exists tg_usuarios_cliente_no_transportista on usuarios;
create trigger tg_usuarios_cliente_no_transportista before update of rol, cliente_id, email on usuarios
  for each row execute function fn_usuarios_cliente_no_transportista();
