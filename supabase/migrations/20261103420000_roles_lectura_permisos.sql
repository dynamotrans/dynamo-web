-- =====================================================================================
-- ROLES DE SOLO LECTURA (2/2): lo ven todo, no escriben nada
-- =====================================================================================
-- Regla: 'admin_lectura' y 'empleado_lectura' LEEN exactamente lo mismo que un gestor
-- de Dynamo (es_admin()), y NO ESCRIBEN NADA. Cómo se consigue sin tocar las decenas
-- de políticas que ya hay:
--   · es_admin() NO cambia: sigue siendo "Admin Master o Empleado gestor" y es lo que
--     abre la escritura en todas las políticas y funciones. Los de lectura no entran.
--   · ve_todo() (nueva) = los cuatro roles de Dynamo. Por cada política de LECTURA que
--     hoy mira es_admin(), se añade otra de solo SELECT con ve_todo(). En Postgres las
--     políticas de una tabla se suman (OR), así que leen lo mismo; las de escritura no
--     se tocan, así que no escriben.
--   · Las funciones que LEEN (altas pendientes, últimas conexiones, pronto pago, datos
--     del CMR, sitio principal) pasan a ve_todo(). Las que escriben siguen con es_admin().
-- =====================================================================================

create or replace function ve_todo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuarios
     where id = auth.uid() and estado = 'activa'
       and rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura')
  )
$$;
comment on function ve_todo() is
  'Cualquier usuario de Dynamo (también los de solo lectura): para LEER. Para escribir, es_admin().';
revoke execute on function ve_todo() from public, anon;
grant execute on function ve_todo() to authenticated;

create or replace function es_solo_lectura()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios where id = auth.uid() and estado = 'activa'
                    and rol in ('admin_lectura', 'empleado_lectura'))
$$;
revoke execute on function es_solo_lectura() from public, anon;
grant execute on function es_solo_lectura() to authenticated;

-- ---- 1. Una política de lectura con ve_todo() por cada lectura con es_admin() --------
do $$ declare p record; nombre text; begin
  for p in
    select distinct tablename from pg_policies
     where schemaname = 'public' and cmd in ('SELECT', 'ALL') and qual ~ 'es_admin\(\)'
  loop
    nombre := left(p.tablename, 50) || '_ve_todo';
    execute format('drop policy if exists %I on public.%I', nombre, p.tablename);
    execute format('create policy %I on public.%I for select to authenticated using (ve_todo())', nombre, p.tablename);
  end loop;
end $$;

-- ---- 2. Funciones que LEEN: de es_admin() a ve_todo() ---------------------------------
create or replace function altas_pendientes()
returns table (id uuid, email text, nombre text, telefono text, documento text, solicitada_en timestamptz,
               confirmado_email boolean, datos jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not ve_todo() then raise exception 'Solo el equipo de Dynamo ve las altas pendientes.' using errcode = '42501'; end if;
  return query
    select u.id, u.email, u.nombre, u.telefono, u.documento, u.creado_en,
           a.email_confirmed_at is not null, coalesce(a.raw_user_meta_data, '{}'::jsonb)
      from usuarios u
      left join auth.users a on a.id = u.id
     where u.estado = 'pendiente_verificacion' and u.cliente_id is null and u.transportista_id is null
     order by u.creado_en desc;
end $$;

create or replace function conexiones_usuarios()
returns table (id uuid, ultima_conexion timestamptz, email_confirmado boolean)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.last_sign_in_at, u.email_confirmed_at is not null
    from auth.users u
   where ve_todo()
$$;

create or replace function pronto_pago_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_linea numeric; v_on boolean; v_dias int; v_usado numeric; v_lista jsonb;
begin
  v_linea := (parametro('pronto_pago_linea_euros'))::text::numeric;
  v_on    := (parametro('pronto_pago_encendido'))::text::boolean;
  v_dias  := (parametro('pronto_pago_ventana_dias'))::text::int;
  select coalesce(sum(r.precio_aceptado - pronto_pago_descuento(r.precio_aceptado)), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'cuando', r.cerrada_en, 'envio', e.referencia_gx, 'transportista', t.nombre_visible,
           'importe', r.precio_aceptado, 'descuento', pronto_pago_descuento(r.precio_aceptado),
           'anticipado', r.precio_aceptado - pronto_pago_descuento(r.precio_aceptado))
           order by r.cerrada_en desc) filter (where r.id is not null), '[]'::jsonb)
    into v_usado, v_lista
    from envio_reservas r
    join envios e on e.id = r.envio_id
    left join transportistas t on t.id = r.transportista_id
   where r.estado = 'aceptada' and r.pronto_pago and r.cerrada_en > now() - make_interval(days => v_dias)
     and e.estado <> 'cancelado';
  return jsonb_build_object(
    'linea', v_linea, 'encendido', v_on, 'ventana_dias', v_dias, 'usado', v_usado,
    'disponible', greatest(v_linea - v_usado, 0),
    'activo', v_on and v_linea - v_usado >= (parametro('pronto_pago_minimo'))::text::numeric,
    'anticipos', case when ve_todo() then v_lista else '[]'::jsonb end);
end $$;

create or replace function sitio_principal(p_cliente uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select c.lugar_defecto_id from clientes c
   where c.id = p_cliente and (ve_todo() or c.id = cliente_del_usuario())
$$;

create or replace function datos_cmr_envio(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e envios%rowtype;
begin
  if not (ve_todo() or envio_del_cliente(p_envio) or envio_del_transportista(p_envio)) then
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  select * into e from envios where id = p_envio;
  return jsonb_build_object('numero_bultos', e.numero_bultos, 'embalaje', e.embalaje, 'volumen_m3', e.volumen_m3,
    'firmado', exists (select 1 from firmas_cmr f where f.envio_id = p_envio));
end $$;

-- ---- 3. Quién da qué rol --------------------------------------------------------------
-- · Un email ya atado a un cliente o transportista no pasa a NINGÚN rol de Dynamo,
--   tampoco a los de lectura (lo verían todo).
-- · Conceder 'admin' o 'admin_lectura' (lo ve TODO, también lo de administración):
--   solo el Admin Master. Los de lectura no cambian roles (no son es_admin()).
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

  if es_servidor() then return new; end if;
  select rol into v_yo_rol from usuarios where id = auth.uid() and estado = 'activa';

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
