-- =====================================================================================
-- 0004 — USUARIOS Y ROLES  (sobre Supabase Auth)
-- =====================================================================================
-- Origen: dy_contactos_clientes_transportistas_hoja.
--
-- ⚠️ LA COLUMNA `clave_acceso_web_dynamo` DEL SHEET NO EXISTE AQUÍ, A PROPÓSITO.
-- Las contraseñas no se guardan: las gestiona Supabase Auth con hash (bcrypt) en
-- auth.users, y el reset va por email firmado. En este esquema no hay ninguna columna
-- de contraseña, ni cifrada.
--
-- `usuarios` es el PERFIL: una fila por cada cuenta con login. Su `id` ES el de
-- auth.users, así que no hay forma de tener un perfil sin cuenta ni al revés.
-- OJO: `usuarios` NO es `contactos`. Un contacto (trafico@cointrans.es) casi nunca
-- tiene login; un usuario (tú, tu hermano) casi nunca pertenece a un cliente.
-- =====================================================================================

create table usuarios (
  id                   uuid primary key references auth.users(id) on delete cascade,

  -- Copia del email de auth.users, sincronizada por trigger. Se duplica a propósito:
  -- auth.users no se expone por la API, y el panel necesita listar y buscar usuarios.
  email                text not null,
  nombre               text,
  documento            text,            -- DNI/NIE. Dato personal → ver nota RGPD abajo.
  telefono             text check (telefono is null or telefono ~ '^\+?[0-9]{6,15}$'),

  rol                  rol_usuario   not null default 'cliente',
  estado               estado_cuenta not null default 'pendiente_verificacion',

  -- A quién pertenece. Un admin o empleado de Dynamo no pertenece a ninguna empresa.
  cliente_id           uuid references clientes(id)       on delete restrict,
  transportista_id     uuid references transportistas(id) on delete restrict,

  -- Límites anti-abuso por usuario (ya estaban en el Sheet y son buena idea).
  limite_ppto_diario   integer check (limite_ppto_diario   is null or limite_ppto_diario   > 0),
  limite_cargas_diario integer check (limite_cargas_diario is null or limite_cargas_diario > 0),

  ultima_conexion      timestamptz,
  anotaciones          text,

  creado_en            timestamptz not null default now(),
  creado_por           uuid references auth.users(id) on delete set null,
  modificado_en        timestamptz,
  modificado_por       uuid references auth.users(id) on delete set null,

  -- Nunca puede pertenecer a las dos cosas a la vez. Esto vale SIEMPRE.
  constraint ck_usuarios_una_empresa check (
    not (cliente_id is not null and transportista_id is not null)
  ),

  -- El rol decide a qué pertenece... pero SOLO se exige cuando la cuenta está ACTIVA.
  --
  -- ⚠️ Esto estaba mal en la primera versión y lo cazó la prueba en Postgres: la
  -- restricción se exigía siempre, así que el trigger que crea el perfil al registrarse
  -- (rol 'cliente' todavía sin empresa asignada) fallaba y NADIE podía darse de alta.
  -- El alta pasa por tres fases reales, que son las que ya tiene el portal:
  --   1. se registra          → estado 'pendiente_verificacion', sin empresa
  --   2. Dynamo lo verifica y lo engancha a su cliente o transportista
  --   3. pasa a 'activa'      → aquí sí tiene que estar enganchado
  -- Así la base de datos deja pasar el alta y sigue impidiendo que una cuenta se
  -- active sin dueño (que es el caso peligroso: un 'cliente' sin cliente_id no vería
  -- nada, o con el RLS mal escrito, lo vería todo).
  constraint ck_usuarios_pertenencia check (
    estado <> 'activa'
    or case rol
         when 'cliente'       then cliente_id is not null
         when 'transportista' then transportista_id is not null
         else cliente_id is null and transportista_id is null   -- admin / empleado
       end
  )
);

-- REGLA 10: un email no puede estar dos veces como usuario.
-- (auth.users ya lo impone por su lado; esto lo asegura también en el perfil.)
create unique index ux_usuarios_email on usuarios (lower(email));

create index idx_usuarios_rol            on usuarios (rol, estado);
create index idx_usuarios_cliente        on usuarios (cliente_id)       where cliente_id is not null;
create index idx_usuarios_transportista  on usuarios (transportista_id) where transportista_id is not null;

comment on table usuarios is
  'Perfil de las cuentas con login. El id ES el de auth.users. NO hay columna de '
  'contrasena: las gestiona Supabase Auth con hash.';
comment on column usuarios.documento is
  'DATO PERSONAL (RGPD). Solo se pide donde hace falta de verdad (firma del CMR). '
  'Al ejercerse el derecho de supresion NO se borra la fila de auditoria: se anonimiza '
  'este campo. Ver el pendiente de RGPD en TODO.md.';
comment on constraint ck_usuarios_pertenencia on usuarios is
  'Solo se exige en cuentas ACTIVAS: un alta recien registrada esta en '
  'pendiente_verificacion y todavia no tiene empresa asignada.';

select activar_rastro('usuarios');

-- Cerramos el puente que quedó abierto en 0003: un contacto PUEDE tener login.
alter table contactos
  add constraint fk_contactos_usuario
  foreign key (usuario_id) references usuarios(id) on delete set null;


-- -------------------------------------------------------------------------------------
-- El perfil se crea solo al registrarse (patrón estándar de Supabase)
-- -------------------------------------------------------------------------------------
-- Sin esto, un usuario puede autenticarse y no tener perfil → queda en el limbo.
create or replace function fn_crear_perfil_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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
end $$;

create trigger tg_crear_perfil_usuario
  after insert on auth.users
  for each row execute function fn_crear_perfil_usuario();

-- Y si cambia el email en Auth, el perfil se entera.
create or replace function fn_sincronizar_email_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update usuarios set email = new.email where id = new.id;
  end if;
  return new;
end $$;

create trigger tg_sincronizar_email_usuario
  after update of email on auth.users
  for each row execute function fn_sincronizar_email_usuario();


-- -------------------------------------------------------------------------------------
-- PROTECCIÓN DEL CAMBIO DE ROL
-- -------------------------------------------------------------------------------------
-- Regla ya decidida en el panel (2026-07-12): no se puede degradar al ÚNICO admin
-- activo. En el mockup era una comprobación de JavaScript; aquí no hay forma de
-- saltársela, ni desde la API ni desde el SQL Editor por error.
create or replace function fn_proteger_ultimo_admin()
returns trigger language plpgsql as $$
begin
  if old.rol = 'admin'
     and (new.rol <> 'admin' or new.estado <> 'activa')
     and not exists (
       select 1 from usuarios
       where rol = 'admin' and estado = 'activa' and id <> old.id
     )
  then
    raise exception
      'No se puede degradar ni suspender al unico admin activo (%). Nombra otro admin primero.',
      old.email;
  end if;
  return new;
end $$;

create trigger tg_proteger_ultimo_admin
  before update of rol, estado on usuarios
  for each row execute function fn_proteger_ultimo_admin();

-- Lo mismo al borrar.
create or replace function fn_proteger_ultimo_admin_baja()
returns trigger language plpgsql as $$
begin
  if old.rol = 'admin' and old.estado = 'activa'
     and not exists (
       select 1 from usuarios
       where rol = 'admin' and estado = 'activa' and id <> old.id
     )
  then
    raise exception 'No se puede borrar al unico admin activo (%).', old.email;
  end if;
  return old;
end $$;

create trigger tg_proteger_ultimo_admin_baja
  before delete on usuarios
  for each row execute function fn_proteger_ultimo_admin_baja();

-- PENDIENTE para 0012 (RLS), porque son reglas de PERMISO y no de integridad:
--   · solo un admin puede conceder el rol admin
--   · un admin no se concede admin a si mismo
--   · re-autenticacion antes de un cambio de rol
-- La auditoria de quien cambio el rol ya la da fn_auditar() de 0002.
