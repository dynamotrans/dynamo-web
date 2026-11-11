-- =====================================================================================
-- ASISTENTE DE IA SOBRE LA BASE DE DATOS (usuario, 2026-11-11) — fase 1: solo Dynamo
-- =====================================================================================
-- Chat del panel que responde preguntas sobre los datos («¿cuántos envíos esta
-- semana?») con el motor de Claude. La web manda la pregunta al servidor, Claude decide
-- qué consultar y las consultas se ejecutan AQUÍ, con la sesión del usuario que
-- pregunta: ia_consulta_sql es SECURITY INVOKER, así que la seguridad por filas y los
-- permisos de su rol mandan — la función NO amplía ningún permiso, solo empaqueta en
-- JSON lo que ese usuario ya podría consultar a mano. Además exige equipo Dynamo
-- (fase 1), admite UNA sola consulta de lectura (SELECT/WITH, sin punto y coma), marca
-- la transacción de solo lectura (una escritura escondida en un CTE muere con error de
-- transacción de solo lectura) y devuelve como mucho 200 filas.
-- ia_consultas guarda la auditoría de cada pregunta (quién, qué preguntó, qué consultas
-- se ejecutaron y qué se respondió): solo la ve el equipo Dynamo y es inmutable.
-- =====================================================================================

create table ia_consultas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios (id) on delete cascade,
  rol text not null,
  pregunta text not null,
  respuesta text,
  consultas jsonb not null default '[]'::jsonb,
  tokens_entrada integer,
  tokens_salida integer,
  creado_en timestamptz not null default now()
);
create index ia_consultas_creado_idx on ia_consultas (creado_en desc);
create index ia_consultas_usuario_idx on ia_consultas (usuario_id);

comment on table ia_consultas is 'Auditoría del asistente de IA del panel: cada pregunta al chat con su respuesta y las consultas SQL que ejecutó. Inmutable (ni update ni delete); solo la ve y la escribe el equipo Dynamo.';
comment on column ia_consultas.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único de la entrada.';
comment on column ia_consultas.usuario_id is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | obligatorio | Usuario del equipo que preguntó; al borrar el usuario se borra su historial (dato personal).';
comment on column ia_consultas.rol is 'formato: texto | rango: no aplica | lista: admin, empleado, admin_lectura, empleado_lectura | obligatorio | Rol del usuario en el momento de preguntar.';
comment on column ia_consultas.pregunta is 'formato: texto | rango: no aplica | lista: no aplica | obligatorio | La pregunta tal como se escribió en el chat. Ej. OK: ¿Cuántos envíos hay esta semana?';
comment on column ia_consultas.respuesta is 'formato: texto | rango: no aplica | lista: no aplica | opcional | La respuesta del asistente (vacía si falló antes de responder).';
comment on column ia_consultas.consultas is 'formato: jsonb | rango: no aplica | lista: no aplica | automático | Lista JSON de las consultas SQL que el asistente ejecutó para responder.';
comment on column ia_consultas.tokens_entrada is 'formato: entero | rango: 0 o más | lista: no aplica | opcional | Tokens de entrada consumidos en la API de Claude (para vigilar el coste).';
comment on column ia_consultas.tokens_salida is 'formato: entero | rango: 0 o más | lista: no aplica | opcional | Tokens de salida consumidos en la API de Claude.';
comment on column ia_consultas.creado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Fecha y hora de la pregunta.';

-- Bloqueo de mantenimiento, como el resto de tablas de negocio.
create trigger tg_mantenimiento before insert or update or delete on ia_consultas
  for each row execute function fn_bloqueo_mantenimiento();

alter table ia_consultas enable row level security;
create policy ia_consultas_ver on ia_consultas for select using (ve_todo());
create policy ia_consultas_crear on ia_consultas for insert with check (ve_todo() and usuario_id = auth.uid());
-- Sin políticas de update ni delete: la auditoría es inmutable a propósito.

create or replace function public.ia_consulta_sql(p_sql text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v jsonb;
begin
  if not ve_todo() then
    raise exception 'Solo el equipo Dynamo puede usar el asistente.' using errcode = '42501';
  end if;
  if p_sql is null or length(p_sql) > 5000 then
    raise exception 'La consulta es demasiado larga.';
  end if;
  if p_sql like '%;%' then
    raise exception 'Solo se admite UNA consulta, sin punto y coma.';
  end if;
  if p_sql !~* '^\s*(select|with)\M' then
    raise exception 'Solo se admiten consultas de lectura (SELECT o WITH).';
  end if;
  -- La transacción pasa a SOLO LECTURA (local): una escritura colada en un CTE
  -- («with x as (update …)») muere con error 25006, haga lo que haga el texto.
  perform set_config('transaction_read_only', 'on', true);
  execute 'select coalesce(jsonb_agg(to_jsonb(_f)), ''[]''::jsonb) from (select * from (' || p_sql || ') _q limit 200) _f' into v;
  return v;
end $$;
revoke execute on function public.ia_consulta_sql(text) from public, anon;
grant execute on function public.ia_consulta_sql(text) to authenticated;
comment on function public.ia_consulta_sql(text) is '[Equipo] Ejecuta UNA consulta de lectura (SELECT o WITH, sin punto y coma) para el asistente de IA del panel y devuelve las filas como lista JSON (máx. 200). SECURITY INVOKER: corre con los permisos y la seguridad por filas de quien llama, así que no amplía ningún acceso; la transacción pasa a solo lectura, con lo que cualquier escritura escondida falla. Quién: equipo Dynamo (admin, empleado y los de solo lectura). Argumentos: p_sql: la consulta SQL de lectura.';
