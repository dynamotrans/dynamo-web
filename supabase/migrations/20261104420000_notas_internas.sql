-- =====================================================================================
-- NOTAS INTERNAS DE DYNAMO: SOLO LAS VE DYNAMO (usuario, 2026-11-04)
--
-- Las «anotaciones» de las fichas (usuarios, clientes, transportistas —y sus notas de
-- incidencias—, camiones, conductores y almacenamientos) son notas del equipo de Dynamo.
-- La web no se las enseñaba al cliente ni al transportista, pero la base de datos SÍ se
-- las dejaba leer: la seguridad por filas decide QUÉ FILAS ve cada uno, no qué columnas,
-- y cada uno puede leer su propia fila (su cuenta, su empresa, su flota, su almacén).
--
-- Ahora viven en una tabla aparte, `notas_internas`, que solo lee Dynamo. En las fichas
-- la columna queda SIEMPRE vacía: al guardar una nota (desde el panel o desde una función
-- del sistema, como el alta online), un trigger la mueve a `notas_internas` y vacía la
-- columna. Un cliente o transportista que intente escribir una nota no guarda nada.
-- Los cambios de las notas quedan en la auditoría, como el resto.
-- =====================================================================================

create table notas_internas (
  id             uuid primary key default gen_random_uuid(),
  tabla          text not null check (tabla in ('usuarios', 'clientes', 'transportistas', 'vehiculos', 'conductores', 'almacenamientos')),
  campo          text not null default 'anotaciones' check (campo in ('anotaciones', 'incidencias_notas')),
  registro_id    uuid not null,
  texto          text not null check (length(texto) <= 5000),
  creado_en      timestamptz not null default now(),
  creado_por     uuid references auth.users(id) on delete set null,
  modificado_en  timestamptz,
  modificado_por uuid references auth.users(id) on delete set null,
  unique (tabla, campo, registro_id)
);
comment on table notas_internas is 'Notas del equipo de Dynamo sobre una ficha. SOLO DYNAMO las lee.';
alter table notas_internas enable row level security;
create policy notas_internas_sel on notas_internas for select to authenticated using (ve_todo());
create policy notas_internas_ins on notas_internas for insert to authenticated with check (es_admin());
create policy notas_internas_upd on notas_internas for update to authenticated using (es_admin()) with check (es_admin());
create policy notas_internas_del on notas_internas for delete to authenticated using (es_admin());
revoke all on notas_internas from anon;
grant select, insert, update, delete on notas_internas to authenticated;
select activar_rastro('notas_internas');
create trigger tg_mantenimiento before insert or update or delete on notas_internas
  for each row execute function fn_bloqueo_mantenimiento();

-- Guarda (o borra, si viene vacía) una nota. Sin SECURITY DEFINER: escribe con los
-- permisos de quien guarda la ficha (la seguridad por filas de notas_internas solo deja
-- a Dynamo; las funciones del sistema escriben como su dueño).
create or replace function guardar_nota_interna(p_tabla text, p_campo text, p_id uuid, p_texto text)
returns void language plpgsql set search_path = public as $$
declare t text := nullif(trim(coalesce(p_texto, '')), '');
begin
  if t is null then
    delete from notas_internas where tabla = p_tabla and campo = p_campo and registro_id = p_id;
  else
    insert into notas_internas (tabla, campo, registro_id, texto) values (p_tabla, p_campo, p_id, left(t, 5000))
    on conflict (tabla, campo, registro_id) do update set texto = excluded.texto;
  end if;
end $$;
revoke execute on function guardar_nota_interna(text, text, uuid, text) from public, anon;
grant execute on function guardar_nota_interna(text, text, uuid, text) to authenticated;

-- Los triggers de las fichas. Solo guardan la nota si la escribe Dynamo, el sistema (una
-- función de la base de datos o la clave de servicio) o la consola; si la escribe un
-- cliente o un transportista, se descarta. Y la columna se queda vacía siempre.
--   · al CREAR la ficha: si trae nota, se guarda;
--   · al GUARDAR la ficha con el campo de notas (UPDATE OF): se guarda lo que traiga,
--     y si viene vacío, la nota se borra (la columna siempre está vacía, así que solo
--     así se distingue «la he borrado» de «no he tocado las notas»).
-- (SECURITY INVOKER a propósito: current_user dice quién escribe de verdad.)
create or replace function fn_mover_nota_interna()
returns trigger language plpgsql set search_path = public as $$
declare v_sistema boolean := current_user not in ('authenticated', 'anon') or es_servidor() or es_admin();
        v_campo text := tg_argv[0];
begin
  if tg_op = 'INSERT' then
    if v_sistema and new.anotaciones is not null then perform guardar_nota_interna(tg_table_name, 'anotaciones', new.id, new.anotaciones); end if;
    new.anotaciones := null;
    if tg_table_name = 'transportistas' then
      if v_sistema and new.incidencias_notas is not null then perform guardar_nota_interna('transportistas', 'incidencias_notas', new.id, new.incidencias_notas); end if;
      new.incidencias_notas := null;
    end if;
  elsif v_campo = 'anotaciones' then
    if v_sistema then perform guardar_nota_interna(tg_table_name, 'anotaciones', new.id, new.anotaciones); end if;
    new.anotaciones := null;
  elsif v_campo = 'incidencias_notas' then
    if v_sistema then perform guardar_nota_interna('transportistas', 'incidencias_notas', new.id, new.incidencias_notas); end if;
    new.incidencias_notas := null;
  end if;
  return new;
end $$;

-- Mover lo que ya hay y vaciar las columnas (sin disparar la auditoría de las fichas
-- por cada fila: la nota queda registrada al crearse en notas_internas).
insert into notas_internas (tabla, campo, registro_id, texto)
  select 'usuarios', 'anotaciones', id, left(trim(anotaciones), 5000) from usuarios where nullif(trim(anotaciones), '') is not null
  union all select 'clientes', 'anotaciones', id, left(trim(anotaciones), 5000) from clientes where nullif(trim(anotaciones), '') is not null
  union all select 'transportistas', 'anotaciones', id, left(trim(anotaciones), 5000) from transportistas where nullif(trim(anotaciones), '') is not null
  union all select 'transportistas', 'incidencias_notas', id, left(trim(incidencias_notas), 5000) from transportistas where nullif(trim(incidencias_notas), '') is not null
  union all select 'vehiculos', 'anotaciones', id, left(trim(anotaciones), 5000) from vehiculos where nullif(trim(anotaciones), '') is not null
  union all select 'conductores', 'anotaciones', id, left(trim(anotaciones), 5000) from conductores where nullif(trim(anotaciones), '') is not null
  union all select 'almacenamientos', 'anotaciones', id, left(trim(anotaciones), 5000) from almacenamientos where nullif(trim(anotaciones), '') is not null;

do $$ declare t text; begin
  foreach t in array array['usuarios', 'clientes', 'transportistas', 'vehiculos', 'conductores', 'almacenamientos'] loop
    execute format('alter table %I disable trigger user', t);
    execute format('update %I set anotaciones = null where anotaciones is not null', t);
    if t = 'transportistas' then execute 'update transportistas set incidencias_notas = null where incidencias_notas is not null'; end if;
    execute format('alter table %I enable trigger user', t);
    -- «zz» para que corran los últimos de los BEFORE (después de los guardianes de la ficha).
    execute format('create trigger tg_zz_nota_interna_alta before insert on %I for each row execute function fn_mover_nota_interna(''alta'')', t);
    execute format('create trigger tg_zz_nota_interna before update of anotaciones on %I for each row execute function fn_mover_nota_interna(''anotaciones'')', t);
    if t = 'transportistas' then
      execute 'create trigger tg_zz_nota_interna_inc before update of incidencias_notas on transportistas for each row execute function fn_mover_nota_interna(''incidencias_notas'')';
    end if;
  end loop;
end $$;
