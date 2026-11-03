-- =====================================================================================
-- HORARIOS DE LOS SITIOS EN TABLA (decisión del usuario, 2026-11-03)
-- =====================================================================================
-- "Los horarios nos sirven para calcular luego rutas, horas de llegada… y ahora son
-- campos libres." Pasan a una tabla: una fila por DÍA de la semana y TRAMO (abre-cierra),
-- así un sitio puede abrir de mañana y de tarde, y tener un horario de lunes a jueves y
-- otro el viernes.
--
--   · `lugar_horarios`: lugar_id, dia_semana (1 = lunes … 7 = domingo), abre, cierra.
--     Un día sin filas = cerrado. Los tramos de un mismo día no se pisan.
--   · `lugares.horarios` (texto) pasa a ser el RESUMEN legible que escribe la base de
--     datos ("L-J 8:00-14:00 y 15:00-17:30 · V 8:00-14:00"). No se escribe a mano.
--   · Horario OBLIGATORIO: todo sitio nace con el horario por defecto del usuario
--     (L-J 8:00-14:00 y 15:00-17:30 · V 8:00-14:00) y la ficha lo cambia. Cuando esté
--     Google Places, se rellenará con el horario de Google.
--   · No hay tramos que pasen de medianoche (cierra > abre). Si aparece un sitio así, se
--     parte en dos días.
-- =====================================================================================

create table lugar_horarios (
  id              uuid primary key default gen_random_uuid(),
  lugar_id        uuid not null references lugares(id) on delete cascade,
  dia_semana      smallint not null check (dia_semana between 1 and 7),
  abre            time not null,
  cierra          time not null,
  creado_en       timestamptz not null default now(),
  creado_por      uuid references auth.users(id) on delete set null,
  modificado_en   timestamptz,
  modificado_por  uuid references auth.users(id) on delete set null,
  constraint ck_lugar_horarios_tramo check (cierra > abre),
  constraint ux_lugar_horarios unique (lugar_id, dia_semana, abre)
);
create index idx_lugar_horarios_lugar on lugar_horarios (lugar_id, dia_semana);
comment on table lugar_horarios is
  'Horario de cada sitio: una fila por dia de la semana (1 = lunes) y tramo. Dia sin filas = '
  'cerrado. Sirve para calcular horas de llegada y avisar si un camion llega con el sitio cerrado.';

alter table lugar_horarios enable row level security;
select activar_rastro('lugar_horarios');

-- Quien ve el sitio ve su horario; quien puede editar el sitio, edita su horario.
create policy lugar_horarios_sel on lugar_horarios for select using (
  exists (select 1 from lugares l where l.id = lugar_horarios.lugar_id));
create policy lugar_horarios_ins on lugar_horarios for insert with check (
  es_admin() or exists (select 1 from lugares l where l.id = lugar_horarios.lugar_id
                                              and l.cliente_id = cliente_del_usuario()));
create policy lugar_horarios_upd on lugar_horarios for update
  using (es_admin() or exists (select 1 from lugares l where l.id = lugar_horarios.lugar_id
                                                     and l.cliente_id = cliente_del_usuario()))
  with check (es_admin() or exists (select 1 from lugares l where l.id = lugar_horarios.lugar_id
                                                          and l.cliente_id = cliente_del_usuario()));
create policy lugar_horarios_del on lugar_horarios for delete using (
  es_admin() or exists (select 1 from lugares l where l.id = lugar_horarios.lugar_id
                                              and l.cliente_id = cliente_del_usuario()));

-- ---- Los tramos de un mismo día no se pisan ----------------------------------------
create or replace function fn_lugar_horarios_sin_solapes()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from lugar_horarios h
              where h.lugar_id = new.lugar_id and h.dia_semana = new.dia_semana
                and h.id <> new.id and h.abre < new.cierra and new.abre < h.cierra) then
    raise exception 'Hay dos tramos del mismo dia que se pisan.' using errcode = '23P01';
  end if;
  return new;
end $$;
create trigger tg_lugar_horarios_sin_solapes before insert or update on lugar_horarios
  for each row execute function fn_lugar_horarios_sin_solapes();

-- ---- Resumen legible: "L-J 8:00-14:00 y 15:00-17:30 · V 8:00-14:00" -----------------
create or replace function horario_texto(p_lugar uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  letras text[] := array['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  dia int; t text; prev text := null; desde int := null; hasta int := null;
  partes text[] := '{}';
begin
  for dia in 1..8 loop
    if dia <= 7 then
      select string_agg(to_char(abre, 'FMHH24:MI') || '-' || to_char(cierra, 'FMHH24:MI'), ' y ' order by abre)
        into t from lugar_horarios where lugar_id = p_lugar and dia_semana = dia;
    else
      t := '#fin';
    end if;
    if t is distinct from prev then
      if prev is not null then
        partes := partes || (letras[desde] || case when hasta > desde then '-' || letras[hasta] else '' end || ' ' || prev);
      end if;
      prev := t; desde := dia;
    end if;
    hasta := dia;
  end loop;
  return nullif(array_to_string(partes, ' · '), '');
end $$;

-- Cada cambio de tramos rehace el resumen del sitio.
create or replace function fn_lugar_horarios_resumen()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid := coalesce(new.lugar_id, old.lugar_id);
begin
  update lugares set horarios = horario_texto(v) where id = v
     and horarios is distinct from horario_texto(v);
  return null;
end $$;
create trigger tg_lugar_horarios_resumen after insert or update or delete on lugar_horarios
  for each row execute function fn_lugar_horarios_resumen();

-- El resumen no se escribe a mano: cualquier escritura se sustituye por el de la tabla.
create or replace function fn_lugares_resumen_horario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.horarios := case when tg_op = 'INSERT' then null else horario_texto(new.id) end;
  return new;
end $$;
create trigger tg_lugares_resumen_horario before insert or update of horarios on lugares
  for each row execute function fn_lugares_resumen_horario();

-- ---- Horario por defecto (el del usuario) ------------------------------------------
create or replace function poner_horario_por_defecto(p_lugar uuid)
returns void language sql security definer set search_path = public as $$
  insert into lugar_horarios (lugar_id, dia_semana, abre, cierra)
  select p_lugar, d, t.abre, t.cierra
    from generate_series(1, 4) d,
         (values (time '08:00', time '14:00'), (time '15:00', time '17:30')) t(abre, cierra)
  union all
  select p_lugar, 5, time '08:00', time '14:00'
  on conflict do nothing
$$;
comment on function poner_horario_por_defecto(uuid) is
  'Horario por defecto de un sitio (decision del usuario 2026-11-03): L-J 8:00-14:00 y '
  '15:00-17:30, V 8:00-14:00. Lo recibe todo sitio al nacer; la ficha lo cambia.';

create or replace function fn_lugares_horario_inicial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform poner_horario_por_defecto(new.id);
  return null;
end $$;
create trigger tg_lugares_horario_inicial after insert on lugares
  for each row execute function fn_lugares_horario_inicial();

-- ---- Guardar el horario de un sitio de una vez (todo o nada) ------------------------
-- p_tramos = [{"dia": 1, "abre": "08:00", "cierra": "14:00"}, …]. Con los permisos de
-- quien llama (RLS): cada cliente solo el de sus sitios. Vacío no vale: es obligatorio.
create or replace function guardar_horario(p_lugar uuid, p_tramos jsonb)
returns void language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(p_tramos) <> 'array' or jsonb_array_length(p_tramos) = 0 then
    raise exception 'El horario es obligatorio: pon al menos un día con su horario.';
  end if;
  if not exists (select 1 from lugares where id = p_lugar) then
    raise exception 'Ese sitio no existe o no es tuyo.' using errcode = '42501';
  end if;
  delete from lugar_horarios where lugar_id = p_lugar;
  insert into lugar_horarios (lugar_id, dia_semana, abre, cierra)
  select p_lugar, (t ->> 'dia')::smallint, (t ->> 'abre')::time, (t ->> 'cierra')::time
    from jsonb_array_elements(p_tramos) t;
end $$;
revoke execute on function guardar_horario(uuid, jsonb) from public, anon;

-- ---- Los sitios que ya hay: horario por defecto, sin perder el texto que tenían -----
update lugares set anotaciones = concat_ws(E'\n', anotaciones, 'Horario anterior: ' || horarios)
 where horarios is not null and trim(horarios) <> '';
select poner_horario_por_defecto(id) from lugares
 where not exists (select 1 from lugar_horarios h where h.lugar_id = lugares.id);

revoke execute on function poner_horario_por_defecto(uuid)  from public, anon, authenticated;
revoke execute on function fn_lugares_horario_inicial()     from public, anon, authenticated;
revoke execute on function fn_lugar_horarios_resumen()      from public, anon, authenticated;
revoke execute on function fn_lugares_resumen_horario()     from public, anon, authenticated;
revoke execute on function horario_texto(uuid)              from public, anon;
