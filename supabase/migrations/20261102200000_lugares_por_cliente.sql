-- =====================================================================================
-- SITIOS: CADA CLIENTE LOS SUYOS (decisión del usuario, 2026-11-02)
-- =====================================================================================
-- Cambia lo de 20261102190000_lugares_visibilidad.sql ("compartido pero discreto").
-- El usuario lo vio claro al pensarlo con casos reales:
--
--   · "Manolo, el encargado de cargas, es amigo de Pepe, mi primo" → la nota es de UN
--     cliente y no tiene sentido en una ficha compartida.
--   · Si un cliente cambia el teléfono o el horario de la nave, en una ficha compartida
--     se le cambia también al otro cliente sin que se entere.
--   · Y con una ficha compartida, el segundo cliente no podía corregir nada.
--
-- AHORA: cada sitio pertenece a UN cliente (`cliente_id`). Cada cliente ve, edita y
-- borra los suyos; si dos clientes cargan en la misma nave, hay dos fichas, y eso está
-- bien: cada una con sus notas, su contacto y su horario. Los almacenes de Dynamo son
-- la excepción: no son de ningún cliente y los ven todos.
--
-- Lo que se pierde (y cómo se recupera si algún día hace falta): Dynamo ya no ve "la"
-- nave X, sino una ficha por cliente. Para estadísticas por nave real se podrá añadir
-- más adelante un enlace interno, solo de Dynamo, entre fichas que sean el mismo sitio.
-- Anotado en el README. No se monta ahora.
--
-- Como en dynamo-pruebas no hay datos reales, se desmonta lo de la migración anterior
-- en vez de dejarlo muerto.
-- =====================================================================================


-- =====================================================================================
-- 1. FUERA LA AGENDA COMPARTIDA Y LAS NOTAS SUELTAS
-- =====================================================================================
drop policy if exists lugares_sel on lugares;
drop policy if exists lugares_ins on lugares;
drop policy if exists lugares_upd on lugares;
drop policy if exists lugares_del on lugares;

drop trigger if exists tg_lugares_agenda_al_crear on lugares;
drop trigger if exists tg_paradas_agenda_al_usar  on envio_paradas;
drop trigger if exists tg_lugares_campos_dynamo   on lugares;

drop function if exists fn_lugares_agenda_al_crear();
drop function if exists fn_paradas_agenda_al_usar();
drop function if exists fn_lugares_campos_dynamo();
drop function if exists lugar_existente_o_nuevo_en_agenda(uuid, text, text);
drop function if exists lugar_creado_por_mi_empresa(uuid);
drop function if exists agenda_anadir(uuid, uuid, text);

drop table if exists cliente_agenda_lugares;

-- Las notas privadas de un cliente sobre un sitio compartido ya no hacen falta: el sitio
-- ES suyo, y sus notas van en la propia ficha (`anotaciones`).
drop table if exists lugar_notas_cliente;
drop sequence if exists seq_lugar_nota_codigo;


-- =====================================================================================
-- 2. CADA SITIO ES DE UN CLIENTE (o es un almacén de Dynamo)
-- =====================================================================================
alter table lugares rename column cliente_propietario_id to cliente_id;
alter table lugares rename column anotaciones_generales  to anotaciones;

-- La FK venía con ON DELETE SET NULL, que ahora dejaría sitios sin dueño. Un cliente no
-- se borra nunca (se suspende), así que pasa a RESTRICT.
do $$ declare fk text; begin
  select conname into fk from pg_constraint
   where conrelid = 'lugares'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'lugares'::regclass and attname = 'cliente_id')];
  execute format('alter table lugares drop constraint %I', fk);
end $$;
alter table lugares add constraint fk_lugares_cliente
  foreign key (cliente_id) references clientes(id) on delete restrict;

-- O es de un cliente, o es un almacén de Dynamo. Nunca las dos cosas, nunca ninguna.
alter table lugares add constraint ck_lugares_dueno check (
  (es_almacen_dynamo and cliente_id is null) or (not es_almacen_dynamo and cliente_id is not null)
);

comment on column lugares.cliente_id is
  'Cliente al que pertenece la ficha. Cada cliente tiene las suyas, aunque dos clientes '
  'carguen en la misma nave (decision del usuario 2026-11-02). Null solo en almacenes Dynamo.';
comment on column lugares.anotaciones is
  'Notas del cliente sobre su sitio ("preguntar por Manolo"). Solo las ve ese cliente y Dynamo.';

-- Si lo crea un cliente desde el panel, el sitio es suyo aunque la app no lo diga.
create or replace function fn_lugares_dueno()
returns trigger language plpgsql as $$
begin
  if new.cliente_id is null and not new.es_almacen_dynamo then
    new.cliente_id := cliente_del_usuario();
  end if;
  return new;
end $$;
create trigger tg_lugares_dueno before insert on lugares
  for each row execute function fn_lugares_dueno();

-- El aviso de "este sitio ya lo tienes" se mira dentro de los sitios DE CADA CLIENTE.
drop index if exists idx_lugares_posible_duplicado;
create index idx_lugares_posible_duplicado on lugares
  (cliente_id, upper(regexp_replace(nombre_empresa, '[^A-Za-z0-9]', '', 'g')), codigo_postal)
  where not borrado;


-- =====================================================================================
-- 3. PERMISOS: cada cliente lo suyo, Dynamo todo
-- =====================================================================================
-- El cliente ve también SUS sitios borrados. Es a propósito: Postgres exige que la
-- fila siga siendo visible después de un UPDATE, así que si se ocultaran los borrados
-- el propio "borrar" (que es un UPDATE de `borrado`) fallaría. Lo cazó la prueba.
-- El panel pide `borrado = false` al listar la agenda. Solo ve lo suyo, nunca lo ajeno.
create policy lugares_sel on lugares for select using (
  es_admin()
  or (not borrado and es_almacen_dynamo)
  or cliente_id = cliente_del_usuario()
);
create policy lugares_ins on lugares for insert with check (
  es_admin()
  or (cliente_id = cliente_del_usuario() and not es_almacen_dynamo)
);
create policy lugares_upd on lugares for update
  using      (es_admin() or cliente_id = cliente_del_usuario())
  with check (es_admin() or (cliente_id = cliente_del_usuario() and not es_almacen_dynamo));
-- Borrar del todo, solo Dynamo. El cliente borra en "suave" (`borrado`), que es lo que
-- hace el panel: desaparece de su agenda y los envíos antiguos conservan la dirección.
create policy lugares_del on lugares for delete using (es_admin());

-- Lo que el cliente NO puede tocar de su propio sitio: el dueño y lo de Dynamo.
create or replace function fn_lugares_campos_dynamo()
returns trigger language plpgsql as $$
begin
  if not es_admin() and not es_servidor() then
    if new.cliente_id is distinct from old.cliente_id
       or new.es_almacen_dynamo is distinct from old.es_almacen_dynamo
       or new.disponible is distinct from old.disponible then
      raise exception 'Ese cambio solo lo puede hacer Dynamo.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger tg_lugares_campos_dynamo before update on lugares
  for each row execute function fn_lugares_campos_dynamo();


-- =====================================================================================
-- 4. UN ENVÍO SOLO PUEDE IR A SITIOS DE SU CLIENTE (o a un almacén Dynamo)
-- =====================================================================================
-- Vale también para Dynamo: si alguien del equipo monta el envío de Marbex, no puede
-- elegir por error la ficha de otro cliente (vería las notas de ese otro cliente en el
-- envío, y la ficha de Marbex no se enteraría de nada).
create or replace function fn_paradas_lugar_del_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lugar_id is null then return new; end if;
  if not exists (
       select 1 from lugares l join envios e on e.id = new.envio_id
        where l.id = new.lugar_id
          and (l.es_almacen_dynamo or l.cliente_id = e.cliente_id)) then
    raise exception 'Ese sitio no es de este cliente. Usa uno de su agenda o crea uno nuevo.';
  end if;
  return new;
end $$;
create trigger tg_paradas_lugar_del_cliente
  before insert or update of lugar_id on envio_paradas
  for each row execute function fn_paradas_lugar_del_cliente();
