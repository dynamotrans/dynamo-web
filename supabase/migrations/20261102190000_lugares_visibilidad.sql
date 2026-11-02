-- =====================================================================================
-- QUIÉN VE CADA SITIO: "compartido pero discreto" (decisión del usuario, 2026-11-02)
-- =====================================================================================
-- Opción A elegida por el usuario:
--   · Cada cliente ve en su agenda SOLO los sitios que ha creado o usado él.
--   · Dynamo (admin/empleado) los ve todos.
--   · Si dos clientes cargan en la misma nave, es UNA sola ficha (sin duplicados).
--   · Los almacenes de Dynamo los ve todo cliente (se pueden elegir como recogida o
--     entrega desde el panel, decisión del 2026-07-08).
--
-- Motivo: con "todos ven todos", un cliente vería dónde cargan los demás, es decir, los
-- clientes y proveedores de la competencia.
--
-- CÓMO: una tabla de AGENDA (cliente ↔ sitio). Ver un sitio = tenerlo en tu agenda.
-- Ventaja extra: "borrar un sitio" para un cliente pasa a ser QUITARLO DE SU AGENDA. Hasta
-- ahora `lugares.borrado` era global, así que si el cliente A borraba una nave compartida,
-- desaparecía también para el cliente B. Ahora solo Dynamo puede borrarla de verdad.
-- =====================================================================================


-- =====================================================================================
-- 1. LA AGENDA
-- =====================================================================================
create table cliente_agenda_lugares (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references clientes(id) on delete cascade,
  lugar_id        uuid not null references lugares(id)  on delete cascade,
  origen          text not null check (origen in ('creado', 'usado', 'anadido_dynamo')),
  ultimo_uso_en   timestamptz,       -- para la lista de "recientes" sin recorrer envíos

  creado_en       timestamptz not null default now(),
  creado_por      uuid references auth.users(id) on delete set null,
  modificado_en   timestamptz,
  modificado_por  uuid references auth.users(id) on delete set null,

  constraint ux_agenda_cliente_lugar unique (cliente_id, lugar_id)
);

comment on table cliente_agenda_lugares is
  'Que sitios tiene cada cliente en su agenda. Un cliente SOLO ve los sitios de su agenda '
  '(mas los almacenes Dynamo). Quitar una fila = el cliente "borra" el sitio de su agenda; '
  'el sitio sigue existiendo para los demas.';

create index idx_agenda_lugar   on cliente_agenda_lugares (lugar_id);
create index idx_agenda_recient on cliente_agenda_lugares (cliente_id, ultimo_uso_en desc nulls last);

select activar_rastro('cliente_agenda_lugares');
alter table cliente_agenda_lugares enable row level security;

create policy agenda_sel on cliente_agenda_lugares for select using (
  es_admin() or cliente_id = cliente_del_usuario()
);
-- El cliente puede QUITAR sitios de su agenda. Añadirlos solo lo hacen los triggers
-- (al crear o usar un sitio) y Dynamo.
create policy agenda_del on cliente_agenda_lugares for delete using (
  es_admin() or cliente_id = cliente_del_usuario()
);
create policy agenda_admin_ins on cliente_agenda_lugares for insert with check (es_admin());


-- Ayudante interno: añade (o refresca) un sitio en la agenda de un cliente.
create or replace function agenda_anadir(p_cliente uuid, p_lugar uuid, p_origen text)
returns void language sql security definer set search_path = public as $$
  insert into cliente_agenda_lugares (cliente_id, lugar_id, origen, ultimo_uso_en)
  values (p_cliente, p_lugar, p_origen,
          case when p_origen = 'usado' then now() end)
  on conflict (cliente_id, lugar_id) do update
    set ultimo_uso_en = case when excluded.origen = 'usado' then now()
                             else cliente_agenda_lugares.ultimo_uso_en end
$$;
revoke execute on function agenda_anadir(uuid, uuid, text) from public, anon, authenticated;


-- =====================================================================================
-- 2. LA AGENDA SE RELLENA SOLA
-- =====================================================================================
-- a) Al CREAR un sitio: entra en la agenda del cliente de quien lo crea, y en la del
--    cliente propietario si Dynamo lo crea para él.
create or replace function fn_lugares_agenda_al_crear()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cli uuid;
begin
  select cliente_id into v_cli from usuarios where id = new.creado_por and rol = 'cliente';
  if v_cli is not null then
    perform agenda_anadir(v_cli, new.id, 'creado');
  end if;
  if new.cliente_propietario_id is not null then
    perform agenda_anadir(new.cliente_propietario_id, new.id, 'creado');
  end if;
  return null;
end $$;

create trigger tg_lugares_agenda_al_crear after insert on lugares
  for each row execute function fn_lugares_agenda_al_crear();

-- b) Al USAR un sitio en un envío: entra en la agenda del cliente del envío. Así, si
--    Dynamo monta un envío de un cliente a una nave que ya tenía otro cliente, el
--    nuevo pasa a verla, sin duplicar la ficha.
create or replace function fn_paradas_agenda_al_usar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cli uuid;
begin
  if new.lugar_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.lugar_id is not distinct from old.lugar_id then return null; end if;
  select cliente_id into v_cli from envios where id = new.envio_id;
  if v_cli is not null then
    perform agenda_anadir(v_cli, new.lugar_id, 'usado');
  end if;
  return null;
end $$;

create trigger tg_paradas_agenda_al_usar after insert or update of lugar_id on envio_paradas
  for each row execute function fn_paradas_agenda_al_usar();

-- c) Rellenar con lo que ya exista (en dynamo-pruebas no hay datos, pero así la misma
--    migración vale el día que se carguen los del Sheet).
insert into cliente_agenda_lugares (cliente_id, lugar_id, origen)
select distinct e.cliente_id, p.lugar_id, 'usado'
  from envio_paradas p join envios e on e.id = p.envio_id
 where p.lugar_id is not null
on conflict do nothing;
insert into cliente_agenda_lugares (cliente_id, lugar_id, origen)
select cliente_propietario_id, id, 'creado' from lugares where cliente_propietario_id is not null
on conflict do nothing;


-- =====================================================================================
-- 3. POLÍTICAS DE `lugares`
-- =====================================================================================
-- VER: Dynamo todo · cliente lo de su agenda y los almacenes Dynamo disponibles.
-- `lugares.id` con el nombre de la tabla a propósito: dentro del subselect, un `id` a
-- secas sería el de la agenda, y la regla dejaría ver sitios que no tocan.
-- `creado_por = auth.uid()`: quien crea un sitio tiene que poder leerlo en el mismo
-- INSERT (la app pide la fila de vuelta), y eso ocurre ANTES de que el trigger lo meta
-- en su agenda. Solo le enseña a esa persona lo que ella misma creó. La lista de la
-- agenda del panel se lee de cliente_agenda_lugares, no de aquí.
create policy lugares_sel on lugares for select using (
  es_admin()
  or (not borrado and es_almacen_dynamo)
  or (not borrado and creado_por = auth.uid())
  or (not borrado and exists (
        select 1 from cliente_agenda_lugares a
         where a.lugar_id = lugares.id and a.cliente_id = cliente_del_usuario()))
);

-- CREAR: un cliente puede crear sitios (entran solos en su agenda por el trigger).
-- No puede crear almacenes Dynamo ni ponerle otro propietario.
create policy lugares_ins on lugares for insert with check (
  es_admin()
  or (cliente_del_usuario() is not null
      and not es_almacen_dynamo and not borrado
      and (cliente_propietario_id is null or cliente_propietario_id = cliente_del_usuario()))
);

-- EDITAR: Dynamo siempre. Un cliente, solo los sitios que creó SU empresa. Una nave
-- compartida que creó otro cliente no la puede tocar (cambiaría la dirección o el
-- horario que ven los demás). Sus apuntes privados van en lugar_notas_cliente.
create or replace function lugar_creado_por_mi_empresa(p_lugar uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lugares l join usuarios u on u.id = l.creado_por
     where l.id = p_lugar and u.rol = 'cliente'
       and u.cliente_id = cliente_del_usuario())
$$;

create policy lugares_upd on lugares for update
  using (es_admin() or (not borrado and lugar_creado_por_mi_empresa(id)))
  with check (es_admin() or (not borrado and not es_almacen_dynamo));

-- BORRAR de verdad (o marcar borrado): solo Dynamo. El cliente quita de SU agenda.
-- (Sin política de DELETE para clientes.)
create policy lugares_del on lugares for delete using (es_admin());

-- El cliente no puede marcar `borrado` ni tocar `es_almacen_dynamo`: eso es de Dynamo.
create or replace function fn_lugares_campos_dynamo()
returns trigger language plpgsql as $$
begin
  if not es_admin() and not es_servidor() then
    if new.borrado is distinct from old.borrado
       or new.es_almacen_dynamo is distinct from old.es_almacen_dynamo
       or new.disponible is distinct from old.disponible then
      raise exception 'Solo Dynamo puede borrar sitios o cambiar los almacenes Dynamo.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger tg_lugares_campos_dynamo before update on lugares
  for each row execute function fn_lugares_campos_dynamo();


-- =====================================================================================
-- 4. NOTAS PRIVADAS: cada cliente las suyas
-- =====================================================================================
create policy notas_sel on lugar_notas_cliente for select using (
  es_admin() or cliente_id = cliente_del_usuario()
);
create policy notas_ins on lugar_notas_cliente for insert with check (
  es_admin() or cliente_id = cliente_del_usuario()
);
create policy notas_upd on lugar_notas_cliente for update
  using (es_admin() or cliente_id = cliente_del_usuario())
  with check (es_admin() or cliente_id = cliente_del_usuario());
create policy notas_del on lugar_notas_cliente for delete using (
  es_admin() or cliente_id = cliente_del_usuario()
);


-- =====================================================================================
-- 5. UN CLIENTE NO PUEDE MONTAR UN ENVÍO A UN SITIO QUE NO VE
-- =====================================================================================
-- Sin esto, alguien que consiguiera el id de un sitio ajeno podría usarlo en su envío y,
-- con eso, colárselo en su agenda (el trigger lo añadiría).
drop policy paradas_ins on envio_paradas;
create policy paradas_ins on envio_paradas for insert with check (
  exists (select 1 from envios e where e.id = envio_id
          and (es_admin() or e.cliente_id = cliente_del_usuario()))
  and (lugar_id is null or es_admin()
       or exists (select 1 from lugares l where l.id = lugar_id))   -- RLS de lugares filtra
);

drop policy paradas_upd on envio_paradas;
create policy paradas_upd on envio_paradas for update
  using (
    exists (select 1 from envios e where e.id = envio_id
            and (es_admin() or (e.cliente_id = cliente_del_usuario()
                                and e.estado in ('borrador','programado'))))
  )
  with check (
    lugar_id is null or es_admin()
    or exists (select 1 from lugares l where l.id = lugar_id)
  );


-- =====================================================================================
-- 6. DEDUPLICAR: ¿esta nave ya existe? (solo el servidor)
-- =====================================================================================
-- Cuando un cliente da de alta un sitio, el servidor mira primero si ya existe (mismo
-- nombre normalizado + mismo CP, el mismo criterio del índice de posibles duplicados
-- de la 0005). Si existe, NO se crea otra ficha: se añade a su agenda. El cliente no
-- se entera de que otro cliente la usa. Solo el servidor: si lo llamara el cliente,
-- podría "sondear" qué naves existen.
create or replace function lugar_existente_o_nuevo_en_agenda(
  p_cliente uuid, p_nombre text, p_cp text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from lugares
   where not borrado and not es_almacen_dynamo
     and upper(regexp_replace(nombre_empresa, '[^A-Za-z0-9]', '', 'g'))
         = upper(regexp_replace(p_nombre,     '[^A-Za-z0-9]', '', 'g'))
     and codigo_postal = trim(p_cp)
   order by creado_en limit 1;
  if v_id is not null then
    perform agenda_anadir(p_cliente, v_id, 'anadido_dynamo');
  end if;
  return v_id;      -- null = no existe: el servidor lo crea como sitio nuevo
end $$;

revoke execute on function lugar_existente_o_nuevo_en_agenda(uuid, text, text)
  from public, anon, authenticated;
grant  execute on function lugar_existente_o_nuevo_en_agenda(uuid, text, text) to service_role;
