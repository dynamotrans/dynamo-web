-- =====================================================================================
-- HORARIO DE VERANO DE LOS SITIOS (usuario, 2026-11-04)
--
-- «En el horario del sitio: por defecto la pestaña horario general, con sus horarios, y
-- luego la pestaña horario de verano, donde ponemos fecha desde-hasta y el horario nuevo;
-- por defecto todos de 7:30 a 15:00 cuando se activa. Si no se activa, se usa el general
-- para todo y se avisa en las fechas de verano genéricas de Dynamo de posibles cambios de
-- horario de los almacenes, que lo revisen bien.»
--
--   · lugar_horarios.temporada: 'general' (todo el año) o 'verano'.
--   · lugares.verano_activo + verano_desde / verano_hasta ('MM-DD', se repite cada año).
--   · lugares.horarios_verano: el resumen legible del de verano (lo escribe la base de datos).
--   · Fechas genéricas de Dynamo (parámetros): verano_sitios_desde '05-25' y
--     verano_sitios_hasta '09-15' — las que ya usaba el aviso «Revisa horarios de verano».
--     Son también las que se proponen al activar el horario de verano de un sitio.
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('verano_sitios_desde', '"05-25"', 'Verano de los almacenes (mes-día): desde aquí se avisa de posibles horarios de verano y se propone al activarlo en un sitio.'),
  ('verano_sitios_hasta', '"09-15"', 'Verano de los almacenes (mes-día): hasta aquí.')
on conflict (clave) do nothing;

alter table lugar_horarios add column temporada text not null default 'general' check (temporada in ('general', 'verano'));
alter table lugar_horarios drop constraint ux_lugar_horarios;
alter table lugar_horarios add constraint ux_lugar_horarios unique (lugar_id, temporada, dia_semana, abre);
drop index if exists idx_lugar_horarios_lugar;
create index idx_lugar_horarios_lugar on lugar_horarios (lugar_id, temporada, dia_semana);

alter table lugares
  add column verano_activo   boolean not null default false,
  add column verano_desde    text check (verano_desde ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  add column verano_hasta    text check (verano_hasta ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  add column horarios_verano text;
alter table lugares add constraint ck_lugares_verano check (not verano_activo or (verano_desde is not null and verano_hasta is not null));
comment on column lugares.verano_activo is 'El sitio tiene horario de verano (lugar_horarios temporada verano) entre verano_desde y verano_hasta (MM-DD, cada año).';
comment on column lugares.horarios_verano is 'Resumen legible del horario de verano. Lo escribe la base de datos.';

-- Los tramos de una misma temporada y día no se pisan.
create or replace function fn_lugar_horarios_sin_solapes()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from lugar_horarios h
              where h.lugar_id = new.lugar_id and h.temporada = new.temporada and h.dia_semana = new.dia_semana
                and h.id <> new.id and h.abre < new.cierra and new.abre < h.cierra) then
    raise exception 'Hay dos tramos del mismo dia que se pisan.' using errcode = '23P01';
  end if;
  return new;
end $$;

-- Resumen legible de una temporada.
drop function if exists horario_texto(uuid);
create or replace function horario_texto(p_lugar uuid, p_temporada text default 'general')
returns text language plpgsql stable security definer set search_path = public as $$
declare
  letras text[] := array['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  dia int; t text; prev text := null; desde int := null; hasta int := null;
  partes text[] := '{}';
begin
  for dia in 1..8 loop
    if dia <= 7 then
      select string_agg(to_char(abre, 'FMHH24:MI') || '-' || to_char(cierra, 'FMHH24:MI'), ' y ' order by abre)
        into t from lugar_horarios where lugar_id = p_lugar and temporada = p_temporada and dia_semana = dia;
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
revoke execute on function horario_texto(uuid, text) from public, anon;

create or replace function fn_lugar_horarios_resumen()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid := coalesce(new.lugar_id, old.lugar_id);
begin
  update lugares set horarios = horario_texto(v, 'general'), horarios_verano = horario_texto(v, 'verano') where id = v
     and (horarios, horarios_verano) is distinct from (horario_texto(v, 'general'), horario_texto(v, 'verano'));
  return null;
end $$;

-- Los resúmenes no se escriben a mano.
drop trigger if exists tg_lugares_resumen_horario on lugares;
create or replace function fn_lugares_resumen_horario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.horarios := null; new.horarios_verano := null;
  else new.horarios := horario_texto(new.id, 'general'); new.horarios_verano := horario_texto(new.id, 'verano'); end if;
  return new;
end $$;
create trigger tg_lugares_resumen_horario before insert or update of horarios, horarios_verano on lugares
  for each row execute function fn_lugares_resumen_horario();

-- Guardar el horario de una temporada de una vez (todo o nada). El general es
-- obligatorio; el de verano puede quedar vacío (si el sitio no lo usa).
drop function if exists guardar_horario(uuid, jsonb);
create or replace function guardar_horario(p_lugar uuid, p_tramos jsonb, p_temporada text default 'general')
returns void language plpgsql set search_path = public as $$
begin
  if p_temporada not in ('general', 'verano') then raise exception 'Temporada no válida.'; end if;
  if jsonb_typeof(p_tramos) <> 'array' or (p_temporada = 'general' and jsonb_array_length(p_tramos) = 0) then
    raise exception 'El horario es obligatorio: pon al menos un día con su horario.';
  end if;
  if not exists (select 1 from lugares where id = p_lugar) then
    raise exception 'Ese sitio no existe o no es tuyo.' using errcode = '42501';
  end if;
  delete from lugar_horarios where lugar_id = p_lugar and temporada = p_temporada;
  insert into lugar_horarios (lugar_id, temporada, dia_semana, abre, cierra)
  select p_lugar, p_temporada, (t ->> 'dia')::smallint, (t ->> 'abre')::time, (t ->> 'cierra')::time
    from jsonb_array_elements(p_tramos) t;
end $$;
revoke execute on function guardar_horario(uuid, jsonb, text) from public, anon;
grant execute on function guardar_horario(uuid, jsonb, text) to authenticated;

-- Activar / desactivar el horario de verano de un sitio, con sus fechas y tramos.
-- Con los permisos de quien llama (cada cliente, sus sitios).
create or replace function guardar_horario_verano(p_lugar uuid, p_activo boolean, p_desde text, p_hasta text, p_tramos jsonb)
returns void language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from lugares where id = p_lugar) then
    raise exception 'Ese sitio no existe o no es tuyo.' using errcode = '42501';
  end if;
  if p_activo then
    if coalesce(p_desde, '') !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' or coalesce(p_hasta, '') !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
      raise exception 'Pon las fechas del horario de verano (desde y hasta).';
    end if;
    if jsonb_typeof(p_tramos) <> 'array' or jsonb_array_length(p_tramos) = 0 then
      raise exception 'Pon el horario de verano: al menos un día con su horario.';
    end if;
    perform guardar_horario(p_lugar, p_tramos, 'verano');
  end if;
  update lugares set verano_activo = coalesce(p_activo, false),
                     verano_desde = case when p_activo then p_desde else verano_desde end,
                     verano_hasta = case when p_activo then p_hasta else verano_hasta end
   where id = p_lugar;
end $$;
revoke execute on function guardar_horario_verano(uuid, boolean, text, text, jsonb) from public, anon;
grant execute on function guardar_horario_verano(uuid, boolean, text, text, jsonb) to authenticated;

-- ¿Cae esta fecha en el verano (MM-DD desde/hasta, cada año; admite que cruce el año)?
create or replace function en_temporada(p_fecha date, p_desde text, p_hasta text)
returns boolean language sql immutable as $$
  select case when p_desde is null or p_hasta is null then false
              when p_desde <= p_hasta then to_char(p_fecha, 'MM-DD') between p_desde and p_hasta
              else to_char(p_fecha, 'MM-DD') >= p_desde or to_char(p_fecha, 'MM-DD') <= p_hasta end
$$;

-- El horario de un sitio un día concreto: el de verano si lo tiene activo y cae en sus fechas.
create or replace function horario_del_dia(p_lugar uuid, p_fecha date)
returns table (abre time, cierra time, temporada text)
language sql stable security definer set search_path = public as $$
  select h.abre, h.cierra, h.temporada
    from lugares l join lugar_horarios h on h.lugar_id = l.id
   where l.id = p_lugar
     and h.dia_semana = extract(isodow from p_fecha)::int
     and h.temporada = case when l.verano_activo and en_temporada(p_fecha, l.verano_desde, l.verano_hasta) then 'verano' else 'general' end
   order by h.abre
$$;
revoke execute on function horario_del_dia(uuid, date) from public, anon;
grant execute on function horario_del_dia(uuid, date) to authenticated;
