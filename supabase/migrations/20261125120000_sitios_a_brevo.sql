-- =====================================================================================
-- LOS EMAILS DE LOS SITIOS SUBEN SOLOS A BREVO (usuario, 2026-11-25)
-- =====================================================================================
-- «Para la plataforma quiero que esos mails de sitios, de todos los sitios, se suban a Brevo
-- también.» «Si quieres creamos otra lista: 04-SITIOS-DYNAMO, por diferenciar.»
-- Cada día el servidor sube a su cuenta de Brevo (por la API, con la clave BREVO_API_KEY que él
-- pega en Vercel) los emails de los sitios de recogida y entrega: los de sus personas de contacto
-- y los de avisos. Van a una lista propia de Brevo, «04-SITIOS-DYNAMO», que la plataforma busca
-- (o crea) sola. Lo que se manda a esa lista lo decide él en Brevo: aquí no se envía nada.
--   · APAGADO por defecto (Parámetros → brevo_sitios_activo). Sin clave, tampoco hace nada.
--   · No suben: los almacenes de Dynamo, los sitios borrados, las direcciones de prueba, las
--     mal escritas ni las del propio dominio de Dynamo.
--   · Cada email sube una vez; vuelve a subir si cambian sus datos (nombre, empresa, dirección…).
--     Un fallo se reintenta al día siguiente, tres veces como mucho.
-- El circuito de captación de polígonos (Apify → Sheet → listas 02 y 03 de Brevo) es otro, suyo,
-- y esto no lo toca.

insert into public.parametros (clave, valor, descripcion) values
  ('brevo_sitios_activo', 'false', 'Brevo: sube cada día a la lista de Brevo los emails de los sitios de recogida y entrega (personas de contacto y emails de avisos). Apagado no sube nada. Hace falta además la clave BREVO_API_KEY en el servidor.'),
  ('brevo_sitios_lista', '"04-SITIOS-DYNAMO"', 'Brevo: nombre de la lista de Brevo a la que suben los emails de los sitios. Si no existe, la plataforma la crea la primera vez.'),
  ('brevo_sitios_lista_id', '{"id": 0, "nombre": ""}', 'Brevo: número de la lista de Brevo ya localizada (lo apunta el servidor; no tocar). Si se cambia el nombre de la lista, se vuelve a buscar.')
on conflict (clave) do nothing;

-- ---- 1. Lo que ya ha subido -------------------------------------------------------------------
create table if not exists public.brevo_subidas (
  email text primary key check (email = lower(email)),
  sitio_id uuid references public.sitios(id) on delete set null,
  huella text not null,
  estado text not null check (estado in ('subido', 'error')),
  error text,
  intentos integer not null default 1,
  subido_en timestamptz not null default now()
);
alter table public.brevo_subidas enable row level security;
drop policy if exists brevo_subidas_dynamo on public.brevo_subidas;
create policy brevo_subidas_dynamo on public.brevo_subidas for select to authenticated using ((select ve_todo()));
comment on table public.brevo_subidas is 'Emails de los sitios que la plataforma ha subido a Brevo (lista 04-SITIOS-DYNAMO), uno por fila, con la huella de los datos que se mandaron: sirve para no repetir y para volver a subir solo lo que cambia. La escribe solo el servidor (brevo_sitios_marcar).';
comment on column public.brevo_subidas.email is 'formato: email en minúsculas | rango: no aplica | lista: no aplica | obligatorio | El email subido (o intentado). Ej. OK: almacen@empresa.com. Ej. mal: Almacen@Empresa.com.';
comment on column public.brevo_subidas.sitio_id is 'formato: uuid | rango: no aplica | lista: no aplica | opcional | El sitio del que salió el email (sitios.id). Vacío si el sitio se borró del todo.';
comment on column public.brevo_subidas.huella is 'formato: texto (md5) | rango: no aplica | lista: no aplica | automático | Resumen de los datos que se mandaron con el email (nombre, empresa, dirección…): si cambia, vuelve a subir.';
comment on column public.brevo_subidas.estado is 'formato: texto | rango: no aplica | lista: subido · error | obligatorio | subido = Brevo lo aceptó; error = Brevo lo rechazó (se reintenta, 3 veces como mucho).';
comment on column public.brevo_subidas.error is 'formato: texto | rango: hasta 300 caracteres | lista: no aplica | opcional | Lo que contestó Brevo al rechazarlo.';
comment on column public.brevo_subidas.intentos is 'formato: entero | rango: 1 o más | lista: no aplica | automático | Veces seguidas que ha fallado (1 si subió bien).';
comment on column public.brevo_subidas.subido_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se subió (o se intentó) por última vez.';

-- ---- 2. Qué emails de sitios hay, uno por email -----------------------------------------------
create or replace function public.brevo_sitios_candidatos()
returns table(email text, nombre text, cargo text, empresa text, cif text, telefono text, direccion text, codigo_postal text,
              localidad text, provincia text, pais text, google_maps text, sitio_id uuid, huella text)
language sql stable security definer set search_path = public as $$
  with crudo as (
    -- Las personas de contacto del sitio…
    select lower(btrim(c.email)) as email, nullif(btrim(c.nombre), '') as nombre, nullif(btrim(c.cargo), '') as cargo,
           nullif(btrim(c.telefono), '') as telefono, c.sitio_id, 1 as prio, c.creado_en
      from contactos c
     where c.sitio_id is not null and nullif(btrim(c.email), '') is not null
    union all
    -- …y los emails de avisos del sitio.
    select lower(btrim(e)), null, null, null, s.id, 2, s.creado_en
      from sitios s, unnest(coalesce(s.emails_avisos, '{}'::text[])) e
     where nullif(btrim(e), '') is not null
  ), uno as (
    select distinct on (x.email) x.* from crudo x order by x.email, x.prio, x.creado_en
  )
  select u.email, u.nombre, u.cargo, nullif(btrim(s.nombre_empresa), ''), nullif(btrim(s.cif), ''), u.telefono,
         nullif(btrim(s.direccion), ''), nullif(btrim(s.codigo_postal), ''), nullif(btrim(s.poblacion), ''), nullif(btrim(s.provincia), ''),
         nullif(btrim(s.pais_codigo_iso::text), ''), nullif(btrim(s.url_google_maps), ''), s.id,
         md5(concat_ws('|', u.email, u.nombre, u.cargo, s.nombre_empresa, s.cif, u.telefono, s.direccion, s.codigo_postal, s.poblacion, s.provincia, s.pais_codigo_iso))
    from uno u
    join sitios s on s.id = u.sitio_id
   where not coalesce(s.borrado, false) and not coalesce(s.es_almacen_dynamo, false)
     and u.email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
     and u.email !~ '\.(invalid|test|example|local|localhost)$'
     and u.email !~ '@(example\.(com|org|net)|ejemplo\.(com|es))$'
     and split_part(u.email, '@', 2) <> split_part(lower(coalesce(parametro('dynamo_email') #>> '{}', '')), '@', 2)
$$;
comment on function public.brevo_sitios_candidatos() is '[Gestión interna] Los emails de los sitios que pueden subir a Brevo, uno por email: los de las personas de contacto del sitio y los de avisos, con los datos del sitio. Fuera los almacenes de Dynamo, los sitios borrados, las direcciones de prueba o mal escritas y las del dominio de Dynamo. Quién: solo el servidor.';
revoke all on function public.brevo_sitios_candidatos() from public, anon, authenticated;
grant execute on function public.brevo_sitios_candidatos() to service_role;

create or replace function public.brevo_sitios_pendientes(p_limite integer default 200)
returns table(email text, nombre text, cargo text, empresa text, cif text, telefono text, direccion text, codigo_postal text,
              localidad text, provincia text, pais text, google_maps text, sitio_id uuid, huella text)
language sql stable security definer set search_path = public as $$
  select c.*
    from brevo_sitios_candidatos() c
    left join brevo_subidas b on b.email = c.email
   where b.email is null                                              -- nunca subido
      or (b.estado = 'subido' and b.huella <> c.huella)                -- han cambiado sus datos
      or (b.estado = 'error' and b.intentos < 3 and b.subido_en < now() - interval '20 hours')   -- reintento
   order by (b.email is null) desc, c.email
   limit greatest(1, least(coalesce(p_limite, 200), 500))
$$;
comment on function public.brevo_sitios_pendientes(integer) is '[Gestión interna] Los emails de sitios que toca subir a Brevo ahora: los nuevos, los que han cambiado de datos y los que fallaron (un reintento al día, tres como mucho). Quién: solo el servidor.';
revoke all on function public.brevo_sitios_pendientes(integer) from public, anon, authenticated;
grant execute on function public.brevo_sitios_pendientes(integer) to service_role;

-- ---- 3. Apuntar el resultado ------------------------------------------------------------------
create or replace function public.brevo_sitios_marcar(p_filas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not (es_servidor() or es_consola_supabase()) then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  insert into brevo_subidas (email, sitio_id, huella, estado, error)
  select lower(x ->> 'email'), nullif(x ->> 'sitio_id', '')::uuid, coalesce(x ->> 'huella', ''),
         case when x ->> 'estado' = 'subido' then 'subido' else 'error' end, left(nullif(x ->> 'error', ''), 300)
    from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) x
   where nullif(x ->> 'email', '') is not null
  on conflict (email) do update
     set sitio_id = excluded.sitio_id, huella = excluded.huella, estado = excluded.estado, error = excluded.error,
         intentos = case when excluded.estado = 'error' then brevo_subidas.intentos + 1 else 1 end,
         subido_en = now();
  get diagnostics n = row_count;
  return n;
end $$;
comment on function public.brevo_sitios_marcar(jsonb) is '[Gestión interna] Apunta el resultado de subir a Brevo una tanda de emails de sitios (subido o error, con su huella). Quién: solo el servidor.';
revoke all on function public.brevo_sitios_marcar(jsonb) from public, anon, authenticated;
grant execute on function public.brevo_sitios_marcar(jsonb) to service_role;

-- ---- 4. El resumen para la pantalla de Mantenimiento ------------------------------------------
create or replace function public.brevo_sitios_resumen()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not ve_todo() then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'activo', coalesce((parametro('brevo_sitios_activo') #>> '{}')::boolean, false),
    'lista', coalesce(parametro('brevo_sitios_lista') #>> '{}', ''),
    'lista_id', coalesce((parametro('brevo_sitios_lista_id') ->> 'id')::int, 0),
    'candidatos', (select count(*) from brevo_sitios_candidatos()),
    'pendientes', (select count(*) from brevo_sitios_pendientes(500)),
    'subidos', (select count(*) from brevo_subidas where estado = 'subido'),
    'errores', (select count(*) from brevo_subidas where estado = 'error'),
    'ultima', (select max(subido_en) from brevo_subidas),
    'ultimos_errores', coalesce((select jsonb_agg(jsonb_build_object('email', x.email, 'error', x.error, 'cuando', x.subido_en, 'intentos', x.intentos))
                                   from (select * from brevo_subidas where estado = 'error' order by subido_en desc limit 8) x), '[]'::jsonb))
    into v;
  return v;
end $$;
comment on function public.brevo_sitios_resumen() is '[Gestión interna] Cómo va la subida de emails de sitios a Brevo: si está encendida, la lista, cuántos hay, cuántos faltan, cuántos han subido o fallado y los últimos fallos. Quién: el equipo de Dynamo (pantalla de Mantenimiento).';
revoke all on function public.brevo_sitios_resumen() from public, anon;
grant execute on function public.brevo_sitios_resumen() to authenticated, service_role;

-- ---- 5. La tarea diaria: avisa al servidor para que suba lo pendiente --------------------------
-- La base de datos no habla con Brevo (la clave vive en el servidor): le pide al servidor que
-- pase. Sin pg_net, sin dirección https de la plataforma o apagado, no hace nada.
create or replace function public.brevo_sitios_avisar()
returns boolean language plpgsql security definer set search_path = public as $$
declare v_base text;
begin
  if not (es_servidor() or es_consola_supabase()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  if not coalesce((parametro('brevo_sitios_activo') #>> '{}')::boolean, false) then return false; end if;
  v_base := rtrim(coalesce(parametro('url_plataforma') #>> '{}', ''), '/');
  if v_base !~ '^https://' or not exists (select 1 from pg_extension where extname = 'pg_net') then return false; end if;
  begin
    execute $q$select net.http_post(url := $1, body := $2, headers := jsonb_build_object('Content-Type', 'application/json'))$q$
      using v_base || '/api/brevo/sitios', '{}'::jsonb;
  exception when others then return false;
  end;
  return true;
end $$;
comment on function public.brevo_sitios_avisar() is '[Gestión interna] Tarea de cada mañana: si la subida de sitios a Brevo está encendida, le pide al servidor (/api/brevo/sitios) que suba lo pendiente. Quién: solo el sistema (pg_cron).';
revoke all on function public.brevo_sitios_avisar() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-brevo-sitios', '23 5 * * *', 'select public.brevo_sitios_avisar()');
  end if;
end $$;
