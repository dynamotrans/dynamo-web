-- =====================================================================================
-- USUARIOS: lo que tenía el mockup y faltaba (2026-11-04)
-- =====================================================================================
--   1. «Enviar copia a»: hasta 10 emails que reciben copia de los avisos de ese usuario
--      (cuando salgan los emails con Postmark). Lo pone Dynamo en la ficha del usuario.
--   2. Tiempo conectado: mientras el panel está abierto y a la vista, manda un «sigo
--      aquí» cada 5 minutos (`latido()`). Se suman minutos por usuario y día. La base
--      de datos solo cuenta un latido cada 4 minutos como mucho, así que no se puede
--      inflar llamando a la API a lo loco.
--   3. `metricas_usuarios()`: consultas de precio y minutos conectados de cada usuario,
--      para la tabla de Usuarios (solo el equipo de Dynamo).
-- =====================================================================================

create or replace function emails_validos(p text[])
returns boolean language sql immutable set search_path = public as $$
  select cardinality(p) <= 10
     and not exists (select 1 from unnest(p) e where e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$')
$$;
alter table usuarios add column copias_avisos text[] not null default '{}'
  check (emails_validos(copias_avisos));
comment on column usuarios.copias_avisos is 'Emails que reciben copia de los avisos de este usuario (máx. 10).';

create table conexion_minutos (
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  dia         date not null,                 -- día de España
  minutos     integer not null default 0 check (minutos >= 0 and minutos <= 1440),
  ultimo      timestamptz not null default now(),
  primary key (usuario_id, dia)
);
alter table conexion_minutos enable row level security;
create policy conexion_minutos_leer on conexion_minutos for select to authenticated using (ve_todo() or usuario_id = auth.uid());
revoke insert, update, delete on conexion_minutos from anon, authenticated;

-- «Sigo aquí»: suma hasta 5 minutos, y solo si el anterior fue hace 4 minutos o más.
create or replace function latido()
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_dia date := (now() at time zone 'Europe/Madrid')::date; v_ult timestamptz;
begin
  if auth.uid() is null then return; end if;
  select max(ultimo) into v_ult from conexion_minutos where usuario_id = auth.uid();
  if v_ult is not null and v_ult > now() - interval '4 minutes' then return; end if;
  insert into conexion_minutos (usuario_id, dia, minutos, ultimo)
  values (auth.uid(), v_dia, 5, now())
  on conflict (usuario_id, dia) do update
    set minutos = least(1440, conexion_minutos.minutos + 5), ultimo = now();
end $$;
revoke execute on function latido() from public, anon;
grant execute on function latido() to authenticated;

-- Métricas para la tabla de Usuarios (solo Dynamo). Media diaria = últimos 30 días / 30;
-- media semanal = últimos 28 días / 4.
create or replace function metricas_usuarios()
returns table (id uuid, consultas bigint, min_dia integer, min_semana integer, ultimo_latido timestamptz)
language sql stable security definer set search_path = public as $$
  select u.id,
         (select count(*) from consultas_precio q where q.usuario_id = u.id),
         (select coalesce(sum(c.minutos), 0) / 30 from conexion_minutos c where c.usuario_id = u.id and c.dia > current_date - 30)::integer,
         (select coalesce(sum(c.minutos), 0) / 4  from conexion_minutos c where c.usuario_id = u.id and c.dia > current_date - 28)::integer,
         (select max(c.ultimo) from conexion_minutos c where c.usuario_id = u.id)
    from usuarios u
   where ve_todo()
$$;
revoke execute on function metricas_usuarios() from public, anon;
grant execute on function metricas_usuarios() to authenticated;
