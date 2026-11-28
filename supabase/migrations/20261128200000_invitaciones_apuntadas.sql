-- INVITACIONES APUNTADAS Y CON TOPE DIARIO (auditoría de seguridad, 2026-11-28; el usuario pidió
-- seguir con lo pendiente). Hasta hoy, con el registro de clientes cerrado, una cuenta nueva
-- entraba si en sus datos de alta venía el id de un usuario activo («anadido_por»). Esos datos
-- los escribe quien se da de alta, así que alguien que conociera ese id podía colarse.
-- Desde hoy la invitación se APUNTA en la base de datos (quién invita a qué email) antes de
-- mandarla, y el alta solo pasa si hay una invitación apuntada para ese email en los últimos
-- 7 días, de alguien activo. Con tope de invitaciones al día por persona.

create table if not exists public.invitaciones (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  anadido_por  uuid not null references public.usuarios(id) on delete cascade,
  creada_en    timestamptz not null default now()
);
create index if not exists invitaciones_email on public.invitaciones (email, creada_en desc);
create index if not exists invitaciones_quien on public.invitaciones (anadido_por, creada_en desc);
alter table public.invitaciones enable row level security;   -- sin políticas: solo las funciones de abajo
drop trigger if exists tg_mantenimiento on public.invitaciones;
create trigger tg_mantenimiento before insert or update or delete on public.invitaciones
  for each row execute function fn_bloqueo_mantenimiento();
comment on table public.invitaciones is 'Invitaciones a la plataforma apuntadas antes de mandarlas (Dynamo desde Usuarios, o un compañero desde Mi cuenta). Con el registro cerrado, una cuenta nueva solo entra si tiene aquí una invitación de los últimos 7 días de alguien activo. Nadie la lee ni la escribe directamente.';
comment on column public.invitaciones.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador de la invitación.';
comment on column public.invitaciones.email is 'formato: email en minúsculas | rango: 3 a 254 caracteres | lista: no aplica | obligatorio | A quién se invita. Ej. OK: marta@empresa.es · Ej. mal: Marta@Empresa.es';
comment on column public.invitaciones.anadido_por is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | automático | Quién invita (el usuario con la sesión abierta).';
comment on column public.invitaciones.creada_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo se apuntó. Vale 7 días.';

insert into public.parametros (clave, valor, descripcion) values
  ('invitaciones_dia_max', '10', 'Seguridad: cuántas invitaciones puede mandar al día un usuario de cliente o de transportista (añadir compañeros desde Mi cuenta).'),
  ('invitaciones_dia_max_dynamo', '100', 'Seguridad: cuántas invitaciones puede mandar al día una persona del equipo de Dynamo (altas desde Usuarios).')
on conflict (clave) do nothing;

-- Apuntar una invitación (antes de mandarla). Quien invita es siempre el de la sesión.
create or replace function public.invitacion_registrar(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); u usuarios; v_max int; v_hoy int;
begin
  select * into u from usuarios where id = auth.uid();
  if u.id is null or u.estado <> 'activa' then return jsonb_build_object('resultado', 'no_puede'); end if;
  if es_equipo_dynamo() then
    if es_solo_lectura() then return jsonb_build_object('resultado', 'no_puede'); end if;
    v_max := greatest(parametro_num('invitaciones_dia_max_dynamo', 100), 1)::int;
  elsif u.rol in ('cliente', 'transportista') then
    v_max := greatest(parametro_num('invitaciones_dia_max', 10), 1)::int;
  else
    return jsonb_build_object('resultado', 'no_puede');
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(v_email) > 254 then return jsonb_build_object('resultado', 'email_no_valido'); end if;
  -- De uno en uno por persona: dos invitaciones a la vez no se saltan el tope.
  perform pg_advisory_xact_lock(hashtext('invitaciones:' || u.id::text));
  select count(*) into v_hoy from invitaciones where anadido_por = u.id and creada_en > now() - interval '24 hours';
  if v_hoy >= v_max then return jsonb_build_object('resultado', 'tope', 'maximo', v_max); end if;
  insert into invitaciones (email, anadido_por) values (v_email, u.id);
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke execute on function public.invitacion_registrar(text) from public, anon;
grant execute on function public.invitacion_registrar(text) to authenticated;
comment on function public.invitacion_registrar(text) is '[Usuarios] Apunta una invitación antes de mandarla: quien invita es el usuario de la sesión (activo; equipo de Dynamo que no sea de solo lectura, o usuario de cliente o de transportista). Con tope al día por persona (invitaciones_dia_max_dynamo o invitaciones_dia_max). Devuelve resultado (ok, tope con el máximo, email_no_valido, no_puede). Quién: Dynamo desde Usuarios y los usuarios activos desde Mi cuenta (añadir compañero). Argumentos: p_email: a quién se invita.';

-- ¿Tiene ese email una invitación vigente (7 días) de alguien activo?
create or replace function public.invitacion_vigente(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from invitaciones i join usuarios u on u.id = i.anadido_por and u.estado = 'activa'
                  where i.email = lower(btrim(coalesce(p_email, ''))) and i.creada_en > now() - interval '7 days')
$$;
revoke execute on function public.invitacion_vigente(text) from public, anon, authenticated;
comment on function public.invitacion_vigente(text) is '[Gestión interna] Dice si un email tiene una invitación apuntada en los últimos 7 días por alguien activo. Quién: interno (al crear la cuenta). Argumentos: p_email: el email de la cuenta nueva.';

-- El alta deja de fiarse de «anadido_por» (lo escribe quien se registra) y mira la invitación apuntada.
do $$
declare v_def text := pg_get_functiondef('public.fn_crear_perfil_usuario()'::regprocedure); v_nuevo text;
begin
  v_nuevo := replace(v_def,
    'if new.raw_user_meta_data ->> ''anadido_por'' is null and email_es_de_transportista(new.email) then',
    'if not invitacion_vigente(new.email) and email_es_de_transportista(new.email) then');
  if v_nuevo = v_def then raise exception 'fn_crear_perfil_usuario: no se ha encontrado la comprobación del transportista'; end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def,
    E'if not registro_clientes_abierto() and not exists (\n       select 1 from usuarios u\n        where u.id::text = new.raw_user_meta_data ->> ''anadido_por'' and u.estado = ''activa'') then',
    'if not registro_clientes_abierto() and not invitacion_vigente(new.email) then');
  if v_nuevo = v_def then raise exception 'fn_crear_perfil_usuario: no se ha encontrado la comprobación del registro cerrado'; end if;
  if position('anadido_por' in v_nuevo) > 0 then raise exception 'fn_crear_perfil_usuario: sigue fiándose de anadido_por'; end if;
  execute v_nuevo;
end $$;
