-- =====================================================================================
-- LISTA DE BLOQUEO DE ALTAS (usuario, 2026-11-14)
-- =====================================================================================
-- Al anonimizar a alguien conflictivo (RGPD) su email queda libre y podía volver a darse
-- de alta. Lista de bloqueo con dos tipos: una dirección completa (una persona) o un
-- dominio entero (toda una empresa). El registro público consulta la lista y responde
-- con un mensaje neutro, sin revelar el bloqueo ni dar vía de contacto (decisión del
-- usuario). Y aunque alguien esquive la web, el perfil tampoco se crea: el propio
-- disparador de alta rechaza la cuenta. Desde «Anonimizar» se puede bloquear a la vez
-- el email (y opcionalmente el dominio) de la cuenta que se borra.

-- ---- 1. La lista ---------------------------------------------------------------------
create table bloqueos_alta (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('email', 'dominio')),
  valor text not null check (
    valor = lower(btrim(valor)) and valor not like '% %' and length(valor) between 4 and 254
    and case when tipo = 'email' then valor like '_%@_%._%'
             else valor not like '%@%' and valor like '_%._%' end),
  motivo text,
  creado_por uuid default auth.uid() references usuarios(id) on delete set null,
  creado_en timestamptz not null default now()
);
create unique index ux_bloqueos_alta_valor on bloqueos_alta (tipo, valor);
alter table bloqueos_alta enable row level security;
create policy bloqueos_alta_lee_dynamo on bloqueos_alta for select to authenticated using (ve_todo());
create policy bloqueos_alta_crea_admin on bloqueos_alta for insert to authenticated with check (es_admin_master());
create policy bloqueos_alta_borra_admin on bloqueos_alta for delete to authenticated using (es_admin_master());
create trigger tg_mantenimiento before insert or update or delete on bloqueos_alta
  for each row execute function fn_bloqueo_mantenimiento();

comment on table public.bloqueos_alta is '[Protección de datos] Lista de bloqueo del registro: emails completos (una persona) o dominios enteros (toda una empresa) que no pueden volver a darse de alta — p. ej. una cuenta conflictiva anonimizada por RGPD. El registro público responde con un mensaje neutro («Actualmente no estamos dando de alta nuevos usuarios») sin revelar el bloqueo, y el disparador de alta rechaza la cuenta aunque se esquive la web. Quién: la ve el equipo de Dynamo; la gestiona solo el Admin Master (Protección de datos).';
comment on column public.bloqueos_alta.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único del bloqueo.';
comment on column public.bloqueos_alta.tipo is 'formato: texto | rango: no aplica | lista: email · dominio | obligatorio | Qué se bloquea: una dirección completa (email) o todas las direcciones de un dominio (dominio). Ej. OK: dominio';
comment on column public.bloqueos_alta.valor is 'formato: texto en minúsculas | rango: 4 a 254 caracteres | lista: no aplica | obligatorio | La dirección completa (tipo email) o el dominio sin @ (tipo dominio). Ej. OK: empresa-conflictiva.com';
comment on column public.bloqueos_alta.motivo is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Por qué se bloqueó, para el equipo. Ej. OK: Bloqueado al anonimizar la cuenta (RGPD)';
comment on column public.bloqueos_alta.creado_por is 'formato: UUID | → usuarios.id | rango: no aplica | lista: no aplica | automático | Quién lo bloqueó (→ usuarios.id).';
comment on column public.bloqueos_alta.creado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se bloqueó. La pone la base de datos.';

-- ---- 2. ¿Está bloqueada esta dirección? ----------------------------------------------
create or replace function public.alta_bloqueada(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bloqueos_alta b
     where (b.tipo = 'email' and b.valor = lower(btrim(p_email)))
        or (b.tipo = 'dominio' and b.valor = split_part(lower(btrim(p_email)), '@', 2))
  );
$$;
revoke all on function public.alta_bloqueada(text) from public;
grant execute on function public.alta_bloqueada(text) to anon, authenticated, service_role;
comment on function public.alta_bloqueada(p_email text) is '[Protección de datos] Dice si un email tiene el alta bloqueada (bloqueos_alta): por su dirección exacta o por su dominio, sin distinguir mayúsculas. Solo devuelve sí/no; el mensaje que ve quien lo intenta es neutro y no revela el bloqueo. Quién: el registro público (anónimo) y el servidor web. Argumentos: p_email: la dirección a comprobar.';

-- ---- 3. Defensa en el propio alta: el perfil no se crea ------------------------------
-- Quien llame a la API de registro directamente (sin pasar por la web) tampoco entra:
-- el disparador que crea el perfil rechaza la cuenta y el alta en Auth falla entera.
create or replace function fn_crear_perfil_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if alta_bloqueada(new.email) then
    raise exception 'alta_bloqueada' using errcode = '42501';
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
end $$;
comment on function public.fn_crear_perfil_usuario() is '[Gestión interna] Disparador del alta (auth.users): crea el perfil en usuarios (rol cliente, estado pendiente_verificacion) con el nombre de los metadatos. Si el email está en la lista de bloqueo (bloqueos_alta), rechaza la cuenta y el alta falla entera. Quién: el disparador; nadie por la API. Argumentos: ninguno (NEW).';

-- ---- 4. Anonimizar con bloqueo opcional del email o del dominio ----------------------
-- La firma cambia (dos opciones nuevas): se quita la antigua para no dejar dos copias.
drop function if exists public.anonimizar_usuario(uuid);
create or replace function public.anonimizar_usuario(p_usuario uuid, p_bloquear_email boolean default false, p_bloquear_dominio boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare u usuarios%rowtype; v_email text;
begin
  if not es_admin_master() then raise exception 'Solo el Admin Master anonimiza.' using errcode = '42501'; end if;
  select * into u from usuarios where id = p_usuario for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if u.rol not in ('cliente', 'transportista') then return jsonb_build_object('resultado', 'solo_clientes_y_transportistas'); end if;
  -- El bloqueo se apunta ANTES de tocar nada, con el email real que va a desaparecer.
  if p_bloquear_email and u.email not like '%@anonimo.invalid' then
    insert into bloqueos_alta (tipo, valor, motivo)
    values ('email', lower(btrim(u.email)), 'Bloqueado al anonimizar la cuenta (RGPD)')
    on conflict (tipo, valor) do nothing;
  end if;
  if p_bloquear_dominio and u.email not like '%@anonimo.invalid' then
    insert into bloqueos_alta (tipo, valor, motivo)
    values ('dominio', split_part(lower(btrim(u.email)), '@', 2), 'Bloqueado al anonimizar la cuenta (RGPD)')
    on conflict (tipo, valor) do nothing;
  end if;
  v_email := 'eliminado-' || left(replace(u.id::text, '-', ''), 12) || '@anonimo.invalid';
  perform set_config('dynamo.anonimizando', 'on', true);
  update usuarios set nombre = 'Persona eliminada', email = v_email, documento = null, telefono = null, cargo = null,
                      emails_copia_avisos = '{}', estado = case when estado = 'pendiente_verificacion' then 'suspendida' else estado end
   where id = p_usuario;
  update usuarios set estado = 'suspendida', suspension_motivo = 'Datos eliminados a petición del interesado (RGPD)'
   where id = p_usuario and estado <> 'suspendida';
  delete from notas_internas where tabla = 'usuarios' and registro_id = p_usuario;
  -- Sus fichas de contacto: se vacían y se quitan (un contacto necesita teléfono o email).
  update contactos set nombre = 'Persona eliminada', telefono = null, email = 'eliminado@anonimo.invalid', cargo = null
   where lower(email) = lower(u.email);
  delete from contactos where email = 'eliminado@anonimo.invalid';
  perform set_config('dynamo.anonimizando', 'off', true);
  return jsonb_build_object('resultado', 'ok', 'email_anonimo', v_email);
end $$;
revoke execute on function public.anonimizar_usuario(uuid, boolean, boolean) from public, anon;
grant execute on function public.anonimizar_usuario(uuid, boolean, boolean) to authenticated;
comment on function public.anonimizar_usuario(p_usuario uuid, p_bloquear_email boolean, p_bloquear_dominio boolean) is '[Protección de datos] RGPD: borra los datos personales de un usuario cliente o transportista (nombre genérico, email anónimo, sin documento ni teléfono), lo deja suspendido, borra sus notas internas y las fichas de contacto con su email. Puede además apuntar su email, y hasta su dominio entero, en la lista de bloqueo de altas (bloqueos_alta) para que no vuelva a registrarse. No sirve para usuarios de Dynamo. Devuelve {resultado, email_anonimo}. Quién: solo el Admin Master. Argumentos: p_usuario: usuarios.id; p_bloquear_email: apuntar su dirección en la lista de bloqueo; p_bloquear_dominio: apuntar también todo su dominio.';
