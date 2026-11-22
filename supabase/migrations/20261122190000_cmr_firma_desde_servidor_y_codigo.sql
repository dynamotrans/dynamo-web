-- e-CMR MÁS SÓLIDO: FIRMA SOLO DESDE NUESTRO SERVIDOR Y CÓDIGO AL EMAIL DE QUIEN FIRMA
-- (usuario, 2026-11-22: «hazlo, el 1 y el 2»).
--  1. La firma (y sus reservas) ya NO se puede registrar llamando a la base de datos con la
--     clave pública: solo desde el servidor de la web, con la clave de servicio. Así la hora,
--     la IP, el navegador y la huella sha256 de lo firmado los pone siempre nuestro servidor y
--     nadie puede meter una firma con datos inventados llamando directamente.
--  2. Código de 6 cifras al email de quien firma: si lo escribe bien, su firma queda marcada
--     «email verificado» (lo dice el PDF). Lo decide la base de datos al guardar la firma, no
--     la pantalla. Sigue pudiéndose firmar sin código (sin cobertura de email en el muelle):
--     queda «email sin verificar».
-- Pendiente antes de producción (TODO / PRODUCCION): sello de tiempo cualificado, sello
-- electrónico de Dynamo en el PDF y confirmación del asesor.

-- 1. Solo el servidor ---------------------------------------------------------------------------
-- Las llamadas con la clave pública llegan como 'anon' (o 'authenticated' con sesión); el
-- servidor llega como 'service_role'. Se antepone el control al cuerpo actual de cada función.
-- Rol con el que llega la llamada por la API: 'anon' (clave pública sin sesión),
-- 'authenticated' (con sesión) o 'service_role' (servidor). Vacío en conexión directa.
create or replace function public.rol_de_la_llamada()
returns text language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
$$;
comment on function public.rol_de_la_llamada() is '[Ayudantes internos] Rol con el que llega la llamada por la API: anon (clave pública sin sesión), authenticated (con sesión de usuario) o service_role (servidor con la clave de servicio); vacío en una conexión directa a la base de datos. Quién: cualquiera. Argumentos: sin argumentos.';

do $$
declare v_def text; v_aguja text := E'\nbegin\n  v_envio := cmr_envio_de_token(p_token);';
  v_ctrl text := E'\nbegin\n  -- Solo desde el servidor de la web (clave de servicio): nunca con la clave pública.\n  if rol_de_la_llamada() in (''anon'', ''authenticated'') then return jsonb_build_object(''resultado'', ''solo_servidor''); end if;\n  v_envio := cmr_envio_de_token(p_token);';
  f text;
begin
  foreach f in array array['firmar_cmr_publico', 'anotar_reservas_cmr_publico'] loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = ('public.' || f)::regproc;
    if position('solo_servidor' in v_def) > 0 then continue; end if;
    if (length(v_def) - length(replace(v_def, v_aguja, ''))) / length(v_aguja) <> 1 then
      raise exception 'No se encuentra (una sola vez) el inicio esperado de %: revisar antes de aplicar.', f;
    end if;
    execute replace(v_def, v_aguja, v_ctrl);
  end loop;
end $$;

-- 2. Códigos de firma ---------------------------------------------------------------------------
create table if not exists cmr_codigos_firma (
  id            uuid primary key default gen_random_uuid(),
  envio_id      uuid not null references envios(id) on delete cascade,
  parada_id     uuid references envio_paradas(id) on delete cascade,
  rol           text not null check (rol in ('remitente', 'transportista', 'destinatario')),
  email         text not null check (length(email) between 6 and 254),
  codigo_sha    text not null check (codigo_sha ~ '^[0-9a-f]{64}$'),
  intentos      integer not null default 0 check (intentos between 0 and 5),
  creado_en     timestamptz not null default now(),
  verificado_en timestamptz,
  usado_en      timestamptz
);
create index if not exists cmr_codigos_firma_envio on cmr_codigos_firma (envio_id, email, creado_en desc);
comment on table cmr_codigos_firma is 'Códigos de 6 cifras que se mandan al email de quien va a firmar un CMR digital. Solo se guarda la huella del código, nunca el código. Si quien firma lo escribe bien, su firma queda «email verificado». Solo los usa el servidor; se borran a los 30 días.';
comment on column cmr_codigos_firma.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único del código.';
comment on column cmr_codigos_firma.envio_id is 'formato: uuid | → envios.id | rango: no aplica | lista: no aplica | obligatorio | Envío cuyo CMR se va a firmar.';
comment on column cmr_codigos_firma.parada_id is 'formato: uuid | → envio_paradas.id | rango: no aplica | lista: no aplica | opcional | Parada de la casilla (vacío en la del transportista).';
comment on column cmr_codigos_firma.rol is 'formato: texto | rango: no aplica | lista: remitente, transportista, destinatario | obligatorio | Casilla que se va a firmar. Ej. OK: destinatario';
comment on column cmr_codigos_firma.email is 'formato: texto, email en minúsculas | rango: 6 a 254 caracteres | lista: no aplica | obligatorio | Email al que se mandó el código (el mismo que queda en la firma). Ej. OK: ana@almacen.es';
comment on column cmr_codigos_firma.codigo_sha is 'formato: texto, 64 caracteres hexadecimales | rango: no aplica | lista: no aplica | obligatorio | Huella sha256 del código (el código no se guarda).';
comment on column cmr_codigos_firma.intentos is 'formato: número entero | rango: 0 a 5 | lista: no aplica | automático | Intentos fallidos; con 5 el código deja de valer.';
comment on column cmr_codigos_firma.creado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo se mandó el código (vale 15 minutos).';
comment on column cmr_codigos_firma.verificado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo lo escribió bien quien firma (vale para firmar 30 minutos).';
comment on column cmr_codigos_firma.usado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo se usó para una firma (cada código, una sola firma).';
alter table cmr_codigos_firma enable row level security;
-- Sin políticas: solo se lee y escribe por las funciones de abajo.
drop trigger if exists tg_mantenimiento on cmr_codigos_firma;
create trigger tg_mantenimiento before insert or update or delete on cmr_codigos_firma
  for each row execute function fn_bloqueo_mantenimiento();

-- La firma: ¿el email se verificó con código?
alter table firmas_cmr add column if not exists email_verificado boolean not null default false;
comment on column firmas_cmr.email_verificado is 'formato: sí/no | rango: no aplica | lista: no aplica | automático | Si quien firmó escribió bien el código de 6 cifras que se mandó a su email justo antes de firmar. Lo pone la base de datos al guardar la firma; no se puede mandar desde fuera.';

-- Tipo de email nuevo: el del código.
do $$
declare v_def text; v_lista text[];
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'emails_enviados_tipo_check' and conrelid = 'emails_enviados'::regclass;
  if position('{' in v_def) > 0 then
    v_lista := string_to_array(substring(v_def from '\{([^}]*)\}'), ',');
  else
    select array_agg(m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(array_length(v_lista, 1), 0) < 30 then
    raise exception 'No se ha podido leer la lista de tipos de email (%): revisar antes de aplicar.', v_def;
  end if;
  select array_agg(distinct x order by x) into v_lista from unnest(v_lista || array['codigo_firma']) as x;
  alter table emails_enviados drop constraint emails_enviados_tipo_check;
  execute format('alter table emails_enviados add constraint emails_enviados_tipo_check check (tipo = any (%L::text[]))', v_lista);
end $$;

create or replace function public.cmr_codigo_firma_crear(p_token uuid, p_parada uuid, p_rol text, p_email text, p_codigo_sha text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_envio uuid; v_email text := lower(trim(coalesce(p_email, ''))); v_id uuid; v_ref text;
begin
  if rol_de_la_llamada() in ('anon', 'authenticated') then return jsonb_build_object('resultado', 'solo_servidor'); end if;
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  if (select estado from envios where id = v_envio) = 'cancelado' then return jsonb_build_object('resultado', 'cancelado'); end if;
  if p_rol not in ('remitente', 'transportista', 'destinatario') then return jsonb_build_object('resultado', 'rol_no_valido'); end if;
  if p_parada is not null and not exists (select 1 from envio_paradas where id = p_parada and envio_id = v_envio) then
    return jsonb_build_object('resultado', 'parada_no_valida');
  end if;
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    return jsonb_build_object('resultado', 'email_no_valido');
  end if;
  if coalesce(p_codigo_sha, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('resultado', 'datos_no_validos'); end if;
  -- Topes: uno por minuto a cada email, 5 por hora a cada email y 40 al día por envío.
  if exists (select 1 from cmr_codigos_firma where envio_id = v_envio and email = v_email and creado_en > now() - interval '60 seconds') then
    return jsonb_build_object('resultado', 'espera');
  end if;
  if (select count(*) from cmr_codigos_firma where envio_id = v_envio and email = v_email and creado_en > now() - interval '1 hour') >= 5
     or (select count(*) from cmr_codigos_firma where envio_id = v_envio and creado_en > now() - interval '1 day') >= 40 then
    return jsonb_build_object('resultado', 'demasiados');
  end if;
  insert into cmr_codigos_firma (envio_id, parada_id, rol, email, codigo_sha)
  values (v_envio, p_parada, p_rol, v_email, p_codigo_sha) returning id into v_id;
  select referencia_gx into v_ref from envios where id = v_envio;
  return jsonb_build_object('resultado', 'ok', 'id', v_id, 'envio_id', v_envio, 'referencia', v_ref, 'email', v_email);
end $$;
revoke execute on function public.cmr_codigo_firma_crear(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.cmr_codigo_firma_crear(uuid, uuid, text, text, text) to service_role;
comment on function public.cmr_codigo_firma_crear(uuid, uuid, text, text, text) is '[CMR y PIN] Apunta un código de 6 cifras (solo su huella) para quien va a firmar una casilla del CMR digital con ese email; el servidor se lo manda por email. Topes: uno por minuto y 5 por hora a cada email, 40 al día por envío. Devuelve resultado (ok, espera, demasiados, email_no_valido, enlace_no_valido, cancelado, parada_no_valida, rol_no_valido, datos_no_validos, solo_servidor) y, si ok, id, envio_id, referencia y email. Quién: solo el servidor de la web (clave de servicio). Argumentos: p_token: enlace del CMR · p_parada: envio_paradas.id (vacío para el transportista) · p_rol: remitente, transportista o destinatario · p_email: email de quien firma · p_codigo_sha: huella sha256 del código en hexadecimal.';

create or replace function public.cmr_codigo_firma_comprobar(p_token uuid, p_parada uuid, p_rol text, p_email text, p_codigo_sha text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_envio uuid; v_email text := lower(trim(coalesce(p_email, ''))); c cmr_codigos_firma;
begin
  if rol_de_la_llamada() in ('anon', 'authenticated') then return jsonb_build_object('resultado', 'solo_servidor'); end if;
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  -- Ya verificado y sin usar (pulsó dos veces): vale.
  if exists (select 1 from cmr_codigos_firma where envio_id = v_envio and rol = p_rol and parada_id is not distinct from p_parada
              and email = v_email and verificado_en > now() - interval '30 minutes' and usado_en is null) then
    return jsonb_build_object('resultado', 'ok');
  end if;
  select * into c from cmr_codigos_firma
   where envio_id = v_envio and rol = p_rol and parada_id is not distinct from p_parada and email = v_email
     and verificado_en is null and usado_en is null and creado_en > now() - interval '15 minutes'
   order by creado_en desc limit 1 for update;
  if c.id is null then return jsonb_build_object('resultado', 'caducado'); end if;
  if c.intentos >= 5 then return jsonb_build_object('resultado', 'bloqueado'); end if;
  if c.codigo_sha = coalesce(p_codigo_sha, '') then
    update cmr_codigos_firma set verificado_en = now() where id = c.id;
    return jsonb_build_object('resultado', 'ok');
  end if;
  update cmr_codigos_firma set intentos = intentos + 1 where id = c.id;
  return jsonb_build_object('resultado', case when c.intentos + 1 >= 5 then 'bloqueado' else 'no_coincide' end, 'quedan', 4 - c.intentos);
end $$;
revoke execute on function public.cmr_codigo_firma_comprobar(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.cmr_codigo_firma_comprobar(uuid, uuid, text, text, text) to service_role;
comment on function public.cmr_codigo_firma_comprobar(uuid, uuid, text, text, text) is '[CMR y PIN] Comprueba el código de 6 cifras que escribe quien va a firmar: el último mandado a ese email para esa casilla, de hace menos de 15 minutos y con menos de 5 fallos. Si coincide, queda verificado (vale para firmar 30 minutos). Devuelve resultado (ok, no_coincide con quedan, bloqueado, caducado, enlace_no_valido, solo_servidor). Quién: solo el servidor de la web (clave de servicio). Argumentos: p_token: enlace del CMR · p_parada: envio_paradas.id (vacío para el transportista) · p_rol: remitente, transportista o destinatario · p_email: email de quien firma · p_codigo_sha: huella sha256 del código escrito.';

-- Al guardar la firma, la base de datos decide si el email está verificado (y gasta el código).
create or replace function public.fn_firmas_email_verificado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  new.email_verificado := false;
  if new.email is not null then
    select id into v_id from cmr_codigos_firma
     where envio_id = new.envio_id and rol = new.rol and parada_id is not distinct from new.parada_id
       and email = lower(trim(new.email)) and verificado_en > now() - interval '30 minutes' and usado_en is null
     order by verificado_en desc limit 1 for update;
    if v_id is not null then
      new.email_verificado := true;
      update cmr_codigos_firma set usado_en = now() where id = v_id;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.fn_firmas_email_verificado() from public, anon, authenticated;
comment on function public.fn_firmas_email_verificado() is '[Gestión interna] Disparador de firmas del CMR: marca la firma «email verificado» si quien firma escribió bien, hace menos de 30 minutos, el código mandado a ese mismo email para esa casilla; el código queda gastado. Si no, «sin verificar». Quién: nadie la llama; la ejecuta la base de datos.';
drop trigger if exists tg_firmas_email_verificado on firmas_cmr;
create trigger tg_firmas_email_verificado before insert on firmas_cmr
  for each row execute function fn_firmas_email_verificado();

-- 3. Se ve en la hoja pública y en el PDF -------------------------------------------------------
do $$
declare v_def text; f text; v_aguja text := '''en_papel'', f.en_papel';
begin
  foreach f in array array['cmr_publico', 'datos_cmr_por_token'] loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = ('public.' || f)::regproc;
    if position('email_verificado' in v_def) > 0 then continue; end if;
    if (length(v_def) - length(replace(v_def, v_aguja, ''))) / length(v_aguja) <> 1 then
      raise exception 'No se encuentra (una sola vez) la lista de firmas esperada en %: revisar antes de aplicar.', f;
    end if;
    execute replace(v_def, v_aguja, v_aguja || ', ''email_verificado'', f.email_verificado');
  end loop;
end $$;

drop function if exists public.firmas_envio(uuid);
create function public.firmas_envio(p_envio uuid)
returns table(rol text, parada_id uuid, nombre text, documento text, documento_pais text, documento_validado boolean, firmado_en timestamptz,
              firma_storage_ruta text, extra boolean, lat double precision, lon double precision, gps_precision_m integer, gps_direccion text,
              sha256 text, en_papel boolean, email_verificado boolean)
language sql stable security definer set search_path = public as $$
  select f.rol::text, f.parada_id, f.nombre::text, f.documento::text,
         f.documento_pais::text, f.documento_validado, f.firmado_en, f.firma_storage_ruta::text, f.extra, f.lat, f.lon, f.gps_precision_m,
         f.gps_direccion::text, f.sha256_documento::text, f.en_papel, f.email_verificado
    from firmas_cmr f
   where f.envio_id = p_envio and (ve_todo() or envio_del_cliente(p_envio) or envio_del_transportista(p_envio))
   order by f.firmado_en
$$;
revoke execute on function public.firmas_envio(uuid) from public, anon;
grant execute on function public.firmas_envio(uuid) to authenticated, service_role;
comment on function public.firmas_envio(uuid) is '[CMR y PIN] Las firmas del CMR de un envío, sin IP, navegador ni email; el documento completo (como en el CMR firmado a mano: cliente, transportista y Dynamo son parte del contrato); con `extra` para distinguir las firmas añadidas a mano, `en_papel` para las que se firmaron en un CMR bis en papel y se registraron después, `email_verificado` si quien firmó confirmó su email con el código de 6 cifras, el GPS del dispositivo con su dirección si quien firmó dio permiso, y la huella sha256 de lo que se firmó. Quién: cliente o transportista del envío y Dynamo. Argumentos: p_envio: envios.id.';

-- Limpieza: los códigos (con su email) se borran a los 30 días.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-codigos-firma-limpiar', '29 4 * * *', $c$delete from public.cmr_codigos_firma where creado_en < now() - interval '30 days'$c$);
  end if;
end $$;
