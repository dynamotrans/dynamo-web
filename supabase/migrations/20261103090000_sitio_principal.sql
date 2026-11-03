-- =====================================================================================
-- SITIO PRINCIPAL DEL CLIENTE (la estrella de la pantalla Sitios) — 2026-11-03
-- =====================================================================================
-- En el mockup la estrella marcaba el almacén principal del cliente: queda arriba de la
-- agenda y se pone solo como RECOGIDA al crear un envío. La columna ya existía
-- (`clientes.lugar_defecto_id`), pero el cliente no puede escribir en `clientes` (ahí
-- está su factor de precio y su crédito), así que la estrella se marca con una función
-- que solo toca esa columna.
--
--   marcar_sitio_principal(cliente, sitio) → pone la estrella (sitio null = la quita).
--   sitio_principal(cliente)               → qué sitio tiene la estrella.
--
-- Reglas que impone la base de datos, la marque quien la marque:
--   · El sitio tiene que ser DE ESE cliente y no estar borrado.
--   · Si el sitio se borra, la estrella se quita sola.
-- =====================================================================================

-- ---- El sitio principal tiene que ser del propio cliente ----------------------------
create or replace function fn_clientes_lugar_defecto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lugar_defecto_id is not null
     and new.lugar_defecto_id is distinct from old.lugar_defecto_id
     and not exists (select 1 from lugares l
                      where l.id = new.lugar_defecto_id
                        and l.cliente_id = new.id and not l.borrado) then
    raise exception 'El sitio principal tiene que ser uno de los sitios de ese cliente.'
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger tg_clientes_lugar_defecto before update of lugar_defecto_id on clientes
  for each row execute function fn_clientes_lugar_defecto();

-- ---- Si se borra el sitio, la estrella se va con él --------------------------------
create or replace function fn_lugares_quitar_principal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.borrado and not old.borrado then
    update clientes set lugar_defecto_id = null where lugar_defecto_id = new.id;
  end if;
  return new;
end $$;
create trigger tg_lugares_quitar_principal after update of borrado on lugares
  for each row execute function fn_lugares_quitar_principal();

-- ---- Hora del borrado: SIEMPRE la del servidor (regla 12) ----------------------------
-- La aplicación solo dice "borrado = true"; la hora la pone la base de datos, y al
-- recuperarlo se vacía.
create or replace function fn_lugares_hora_borrado()
returns trigger language plpgsql as $$
begin
  if new.borrado and not old.borrado then new.borrado_en := now();
  elsif not new.borrado and old.borrado then new.borrado_en := null;
  end if;
  return new;
end $$;
create trigger tg_lugares_hora_borrado before update of borrado on lugares
  for each row execute function fn_lugares_hora_borrado();
revoke execute on function fn_lugares_hora_borrado() from public, anon, authenticated;

-- ---- Poner o quitar la estrella -----------------------------------------------------
create or replace function marcar_sitio_principal(p_cliente uuid, p_lugar uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (es_admin() or p_cliente = cliente_del_usuario()) then
    raise exception 'No tienes permiso para hacer esto.' using errcode = '42501';
  end if;
  update clientes set lugar_defecto_id = p_lugar where id = p_cliente;
  if not found then
    raise exception 'Ese cliente no existe.' using errcode = 'P0002';
  end if;
end $$;
comment on function marcar_sitio_principal(uuid, uuid) is
  'Estrella de la pantalla Sitios: sitio principal del cliente (origen por defecto en '
  'Nuevo envio). p_lugar null la quita. Solo Dynamo o el propio cliente.';

create or replace function sitio_principal(p_cliente uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select c.lugar_defecto_id from clientes c
   where c.id = p_cliente and (es_admin() or c.id = cliente_del_usuario())
$$;

revoke execute on function marcar_sitio_principal(uuid, uuid) from public, anon;
revoke execute on function sitio_principal(uuid)              from public, anon;
revoke execute on function fn_clientes_lugar_defecto()        from public, anon, authenticated;
revoke execute on function fn_lugares_quitar_principal()      from public, anon, authenticated;
