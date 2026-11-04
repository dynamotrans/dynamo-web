-- =====================================================================================
-- SUSPENSIÓN AUTOMÁTICA DE CUENTAS (reglas fijadas por el usuario el 2026-07-17)
-- =====================================================================================
-- Un proceso diario suspende SOLO la cuenta de un USUARIO (nunca la empresa entera) que
-- cumpla cualquiera de estas reglas. Las cifras son PARÁMETROS (tabla `parametros`): se
-- ven y se cambian en el panel → Parámetros → «Suspensión automática de cuentas».
--
--   1. Pide precios pero su EMPRESA no genera ningún envío en 45 días.
--      (Cuentas con menos de 45 días: no aplica.)
--   2. No entra en la plataforma en 400 días. (Cuentas con menos de 400 días: no aplica.)
--   3. Abuso de consultas de precio: más de 15 al día, 30 a la semana o 60 al mes.
--   4. Cancela el 30 % o más de los envíos que pide (a partir de un mínimo de envíos).
--   5. Cancela 3 o más envíos en 10 días.
--
-- · Las reglas 1, 3, 4 y 5 son para CLIENTES; la 2, para clientes y transportistas.
--   Al equipo de Dynamo no se le suspende nunca solo.
-- · «Consulta de precio» = hoy, cada SOLICITUD de precio que pide el cliente desde su
--   panel; cuando llegue el tarifador, también cada cálculo. Quedan en `consultas_precio`.
-- · Las cancelaciones que cuentan son las que hace EL PROPIO usuario (si Dynamo cancela
--   porque no hay camión, no le cuenta).
-- · Reactivar es SIEMPRE a mano (Dynamo, desde la ficha del usuario). Al reactivar, el
--   contador vuelve a empezar desde ese momento (si no, al día siguiente volvería a caer).
-- · «No suspender nunca automáticamente»: casilla por usuario para clientes especiales.
-- · Interruptor general: `autosusp_activa`. Todo queda en la auditoría (quién = sistema).
-- =====================================================================================

-- ---- Columnas del usuario -------------------------------------------------------------
alter table usuarios add column sin_autosuspension boolean not null default false;
alter table usuarios add column autosusp_desde   timestamptz;   -- reactivada a mano: cuenta desde aquí
alter table usuarios add column suspendida_en    timestamptz;
alter table usuarios add column suspension_motivo text;
comment on column usuarios.sin_autosuspension is 'Dynamo marca que a este usuario no se le suspenda nunca automáticamente.';
comment on column usuarios.suspension_motivo is 'Por qué se suspendió (regla automática o a mano). Se borra al reactivar.';

-- Solo Dynamo (gestor) toca estas columnas; el propio usuario no.
create or replace function fn_usuarios_aa_autosusp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.sin_autosuspension, new.autosusp_desde, new.suspendida_en, new.suspension_motivo)
     is distinct from (old.sin_autosuspension, old.autosusp_desde, old.suspendida_en, old.suspension_motivo)
     and not es_servidor() and not es_admin() then
    raise exception 'Solo Dynamo puede cambiar la suspensión de una cuenta.' using errcode = '42501';
  end if;
  -- Al suspender a mano sin motivo, se apunta la hora; al reactivar, se limpia y el
  -- contador de las reglas empieza de nuevo.
  if new.estado = 'suspendida' and old.estado is distinct from 'suspendida' then
    new.suspendida_en := coalesce(new.suspendida_en, now());
    new.suspension_motivo := coalesce(new.suspension_motivo, 'Suspendida a mano por Dynamo.');
  elsif new.estado = 'activa' and old.estado = 'suspendida' then
    new.autosusp_desde := now();
    new.suspendida_en := null;
    new.suspension_motivo := null;
  end if;
  return new;
end $$;
revoke execute on function fn_usuarios_aa_autosusp() from public, anon, authenticated;
create trigger tg_usuarios_aa_autosusp before update on usuarios
  for each row execute function fn_usuarios_aa_autosusp();

-- ---- Consultas de precio -----------------------------------------------------------
create table consultas_precio (
  id          bigint generated always as identity primary key,
  usuario_id  uuid references usuarios(id) on delete cascade,
  cliente_id  uuid references clientes(id) on delete cascade,
  envio_id    uuid references envios(id)   on delete set null,
  origen      text not null default 'solicitud' check (origen in ('solicitud', 'tarifador')),
  cuando      timestamptz not null default now()          -- hora del SERVIDOR
);
alter table consultas_precio enable row level security;
create index idx_consultas_precio_usuario on consultas_precio (usuario_id, cuando);
create index idx_consultas_precio_cliente on consultas_precio (cliente_id, cuando);
-- Solo se leen (Dynamo). Se escriben solas, desde la base de datos.
create policy consultas_precio_leer on consultas_precio for select to authenticated using (ve_todo());
revoke insert, update, delete on consultas_precio from anon, authenticated;

-- Cada solicitud de precio del cliente es una consulta.
create or replace function fn_envios_consulta_precio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.solicitud_estado = 'pendiente_precio' then
    insert into consultas_precio (usuario_id, cliente_id, envio_id, origen)
    values (coalesce(new.creado_por, auth.uid()), new.cliente_id, new.id, 'solicitud');
  end if;
  return new;
end $$;
revoke execute on function fn_envios_consulta_precio() from public, anon, authenticated;
create trigger tg_envios_consulta_precio after insert on envios
  for each row execute function fn_envios_consulta_precio();

-- ---- Las cifras, en Parámetros -------------------------------------------------------
insert into parametros (clave, valor, descripcion) values
  ('autosusp_activa',              'true', 'Suspensión automática de cuentas: encendida o apagada (todas las reglas).'),
  ('autosusp_sin_envios_dias',     '45',   'Regla 1 · Días pidiendo precios sin que su empresa genere ningún envío (no aplica a cuentas más nuevas).'),
  ('autosusp_sin_acceso_dias',     '400',  'Regla 2 · Días sin entrar en la plataforma (no aplica a cuentas más nuevas).'),
  ('autosusp_consultas_dia',       '15',   'Regla 3 · Máximo de consultas de precio en un día.'),
  ('autosusp_consultas_semana',    '30',   'Regla 3 · Máximo de consultas de precio en 7 días.'),
  ('autosusp_consultas_mes',       '60',   'Regla 3 · Máximo de consultas de precio en 30 días.'),
  ('autosusp_cancel_pct',          '30',   'Regla 4 · % de envíos cancelados por el propio usuario a partir del cual se suspende.'),
  ('autosusp_cancel_min_envios',   '5',    'Regla 4 · Mínimo de envíos pedidos antes de aplicar el % (para no suspender por cancelar el primero).'),
  ('autosusp_cancel_recientes',    '3',    'Regla 5 · Cancelaciones en pocos días que suspenden la cuenta.'),
  ('autosusp_cancel_recientes_dias','10',  'Regla 5 · Esos «pocos días».')
on conflict (clave) do nothing;

create or replace function p_num(p_clave text, p_defecto numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (valor #>> '{}')::numeric from parametros where clave = p_clave), p_defecto)
$$;
revoke execute on function p_num(text, numeric) from public, anon, authenticated;

-- ---- Qué regla cumple cada usuario (sin tocar nada) ---------------------------------
-- Devuelve una fila por usuario activo que cumpla alguna regla, con el motivo en claro.
create or replace function autosuspension_candidatos()
returns table (usuario_id uuid, email text, motivo text)
language plpgsql stable security definer set search_path = public, auth as $$
declare
  d_sin_env int := p_num('autosusp_sin_envios_dias', 45);
  d_acceso  int := p_num('autosusp_sin_acceso_dias', 400);
  c_dia     int := p_num('autosusp_consultas_dia', 15);
  c_sem     int := p_num('autosusp_consultas_semana', 30);
  c_mes     int := p_num('autosusp_consultas_mes', 60);
  pct       numeric := p_num('autosusp_cancel_pct', 30);
  min_env   int := p_num('autosusp_cancel_min_envios', 5);
  n_rec     int := p_num('autosusp_cancel_recientes', 3);
  d_rec     int := p_num('autosusp_cancel_recientes_dias', 10);
begin
  if not es_servidor() and not ve_todo() then return; end if;
  return query
  with base as (
    select u.id, u.email, u.rol, u.cliente_id, u.creado_en,
           coalesce(u.autosusp_desde, u.creado_en) as desde,
           coalesce(u.limite_consultas_precio_diario, c_dia) as max_dia,
           au.last_sign_in_at
      from usuarios u left join auth.users au on au.id = u.id
     where u.estado = 'activa' and not u.sin_autosuspension and u.rol in ('cliente', 'transportista')
  ), m as (
    select b.*,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - interval '1 day'))  as q1,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - interval '7 days')) as q7,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - interval '30 days')) as q30,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - make_interval(days => d_sin_env))) as q_reg1,
      (select count(*) from envios e where e.cliente_id = b.cliente_id and e.estado <> 'borrador'
          and e.solicitud_estado is distinct from 'rechazada' and e.creado_en >= now() - make_interval(days => d_sin_env)) as env_empresa,
      (select count(*) from envios e where e.creado_por = b.id and e.estado <> 'borrador' and e.creado_en >= b.desde) as env_suyos,
      (select count(distinct h.envio_id) from envio_hitos h join envios e on e.id = h.envio_id
          where h.hito = 'cancelado' and h.quien = b.id and e.creado_por = b.id and e.creado_en >= b.desde) as canc_suyas,
      (select count(distinct h.envio_id) from envio_hitos h
          where h.hito = 'cancelado' and h.quien = b.id and h.cuando >= greatest(b.desde, now() - make_interval(days => d_rec))) as canc_rec
    from base b
  )
  select m.id, m.email, r.motivo
    from m cross join lateral (
      select case
        when m.rol = 'cliente' and m.creado_en <= now() - make_interval(days => d_sin_env) and m.desde <= now() - make_interval(days => d_sin_env)
             and m.q_reg1 > 0 and m.env_empresa = 0
          then format('Regla 1: pide precios (%s en %s días) y su empresa no ha generado ningún envío.', m.q_reg1, d_sin_env)
        when m.creado_en <= now() - make_interval(days => d_acceso)
             and greatest(coalesce(m.last_sign_in_at, m.creado_en), m.desde) <= now() - make_interval(days => d_acceso)
          then format('Regla 2: no entra en la plataforma desde hace más de %s días.', d_acceso)
        when m.rol = 'cliente' and (m.q1 > m.max_dia or m.q7 > c_sem or m.q30 > c_mes)
          then format('Regla 3: demasiadas consultas de precio (%s hoy, %s en 7 días, %s en 30; máximo %s / %s / %s).', m.q1, m.q7, m.q30, m.max_dia, c_sem, c_mes)
        when m.rol = 'cliente' and m.env_suyos >= greatest(min_env, 1) and m.canc_suyas * 100.0 / m.env_suyos >= pct
          then format('Regla 4: ha cancelado %s de sus %s envíos (%s %%; límite %s %%).', m.canc_suyas, m.env_suyos, round(m.canc_suyas * 100.0 / m.env_suyos), pct)
        when m.rol = 'cliente' and m.canc_rec >= n_rec
          then format('Regla 5: %s cancelaciones en %s días (límite %s).', m.canc_rec, d_rec, n_rec)
      end as motivo) r
   where r.motivo is not null;
end $$;
revoke execute on function autosuspension_candidatos() from public, anon;
grant execute on function autosuspension_candidatos() to authenticated;   -- dentro: solo Dynamo

-- ---- El proceso: suspende a los que cumplen ------------------------------------------
-- Lo lanza el reloj de la base de datos cada día; el Admin Master también puede lanzarlo
-- a mano desde Parámetros.
create or replace function autosuspender_cuentas()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; c record;
begin
  if not es_servidor() and not es_administrador() then
    raise exception 'Solo el Admin Master (o el proceso diario) lanza la suspensión automática.' using errcode = '42501';
  end if;
  if not coalesce((parametro('autosusp_activa') #>> '{}')::boolean, false) then return 0; end if;
  for c in select * from autosuspension_candidatos() loop
    update usuarios set estado = 'suspendida', suspendida_en = now(),
                        suspension_motivo = 'Automática · ' || c.motivo
     where id = c.usuario_id and estado = 'activa';
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function autosuspender_cuentas() from public, anon;
grant execute on function autosuspender_cuentas() to authenticated;   -- dentro: solo Admin Master

-- ---- El reloj diario (pg_cron, 03:17 UTC) -----------------------------------------------
-- En Supabase pg_cron está disponible; si no lo está (o no se puede activar desde aquí),
-- la migración sigue adelante y el proceso se lanza a mano desde Parámetros.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('dynamo-autosuspension', '17 3 * * *', 'select public.autosuspender_cuentas()');
    exception when others then
      raise notice 'pg_cron no disponible (%): la suspensión automática se lanza a mano.', sqlerrm;
    end;
  end if;
end $$;
