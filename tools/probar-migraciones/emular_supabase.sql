-- =====================================================================================
-- Lo mínimo para que un PostgreSQL limpio se comporte como SUPABASE en lo que
-- importa para probar migraciones: roles de la API, esquema auth y, sobre todo,
-- LOS PRIVILEGIOS POR DEFECTO.
--
-- Esos privilegios son la clave: en Supabase todo lo que se crea en `public`
-- queda concedido a `anon` y `authenticated`, que son los roles con los que
-- entra la API de datos. Por eso una tabla SIN seguridad por filas (RLS) en
-- Supabase es una tabla ABIERTA a cualquiera con la clave pública, aunque en
-- un Postgres normal parezca inofensiva.
-- =====================================================================================

create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;   -- la llave maestra: se salta RLS

create schema auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  last_sign_in_at    timestamptz,          -- como en Supabase: último inicio de sesión
  email_confirmed_at timestamptz
);

-- Supabase saca el usuario del token (JWT). Aquí se simula con un ajuste de sesión:
--   select set_config('request.jwt.claim.sub', '<uuid>', false);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Los privilegios por defecto de Supabase.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ---- Almacén de ficheros (Supabase Storage) ------------------------------------------
-- Lo justo para probar los permisos: los ficheros son filas de storage.objects y quién
-- puede leer o subir lo deciden las políticas (RLS) de esa tabla, como en Supabase.
create schema storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null unique,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);
create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text not null,
  owner      uuid default auth.uid(),
  metadata   jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
