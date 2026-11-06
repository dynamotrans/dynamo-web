-- LISTAS POR PÁGINAS DESDE LA BASE DE DATOS: transportistas, clientes y sitios (2026-11-06).
-- Encontrado al probar con los datos de prueba: estas tres pantallas mandaban la tabla
-- ENTERA al navegador (22 MB y 17 s la de transportistas con 20.000; 10 MB sitios; 9 MB
-- clientes) y buscaban en memoria. Ahora, como Envíos: la base de datos busca (todas las
-- palabras, sin tildes ni mayúsculas, sobre un texto de búsqueda que mantiene un
-- disparador), filtra, cuenta y da los ids de la página; la pantalla solo lee esas filas.
--  · texto_busqueda en las tres tablas (con sus contactos, y en transportistas también sus
--    matrículas), al día por disparador (como envios.texto_busqueda);
--  · transportistas_pagina, clientes_pagina, sitios_pagina: {id, total} de la página;
--  · buscar_transportistas: para elegir uno al asignar o al ofertar un envío (antes la ficha
--    cargaba los 20.000 para un desplegable);
--  · Cada uno ve lo suyo: Dynamo todo; un cliente, sus sitios (sitios_pagina).

-- ---- Texto de búsqueda --------------------------------------------------------------
alter table transportistas add column if not exists texto_busqueda text;
alter table clientes add column if not exists texto_busqueda text;
alter table sitios add column if not exists texto_busqueda text;
comment on column transportistas.texto_busqueda is 'formato: texto | rango: no aplica | lista: no aplica | automático | Texto en minúsculas y sin tildes con nombre, CIF, código, bolsa, población, NIMA, contactos y matrículas, para el buscador de la lista. Lo mantiene un disparador. Ej. OK: transportes garcia sl b12345678 sevilla';
comment on column clientes.texto_busqueda is 'formato: texto | rango: no aplica | lista: no aplica | automático | Texto en minúsculas y sin tildes con nombre, CIF, código, domicilio, sector y contactos, para el buscador de la lista. Lo mantiene un disparador. Ej. OK: muebles lopez sl b87654321 madrid';
comment on column sitios.texto_busqueda is 'formato: texto | rango: no aplica | lista: no aplica | automático | Texto en minúsculas y sin tildes con empresa, dirección, población, horarios, notas, contactos y el nombre de su cliente, para el buscador de la lista. Lo mantiene un disparador. Ej. OK: nave central poligono la isla dos hermanas';

create or replace function transportista_texto_busqueda(t transportistas)
returns text language sql stable security definer set search_path = public as $$
  select lower(unaccent_simple(concat_ws(' ',
    t.nombre_visible, t.razon_social, t.nombre_comercial, t.cif, t.codigo, t.codigo_bolsa, t.bolsa,
    t.poblacion, t.provincia, t.codigo_postal, t.nima,
    (select string_agg(concat_ws(' ', c.nombre, c.telefono, c.email), ' ') from contactos c where c.transportista_id = t.id),
    (select string_agg(v.matricula, ' ') from vehiculos v where v.transportista_id = t.id and v.activo))))
$$;
create or replace function cliente_texto_busqueda(k clientes)
returns text language sql stable security definer set search_path = public as $$
  select lower(unaccent_simple(concat_ws(' ',
    k.nombre_visible, k.razon_social, k.nombre_comercial, k.cif, k.codigo, k.direccion, k.codigo_postal,
    k.poblacion, k.provincia, k.pais_codigo_iso, k.sector,
    (select string_agg(concat_ws(' ', c.nombre, c.telefono, c.email, c.cargo), ' ') from contactos c where c.cliente_id = k.id))))
$$;
create or replace function sitio_texto_busqueda(s sitios)
returns text language sql stable security definer set search_path = public as $$
  select lower(unaccent_simple(concat_ws(' ',
    s.nombre_empresa, s.direccion, s.codigo_postal, s.poblacion, s.provincia, s.pais_codigo_iso, s.horarios, s.anotaciones,
    array_to_string(s.emails_avisos, ' '),
    (select string_agg(concat_ws(' ', c.nombre, c.telefono, c.email), ' ') from contactos c where c.sitio_id = s.id),
    (select concat_ws(' ', k.nombre_visible, k.razon_social, k.cif) from clientes k where k.id = s.cliente_id))))
$$;
revoke execute on function transportista_texto_busqueda(transportistas), cliente_texto_busqueda(clientes), sitio_texto_busqueda(sitios) from public, anon, authenticated;

-- En la propia fila (BEFORE, al final de los demás disparadores: por eso «zzzz»).
create or replace function fn_zzzz_texto_busqueda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'transportistas' then new.texto_busqueda := transportista_texto_busqueda(new);
  elsif tg_table_name = 'clientes' then new.texto_busqueda := cliente_texto_busqueda(new);
  else new.texto_busqueda := sitio_texto_busqueda(new); end if;
  return new;
end $$;
drop trigger if exists tg_zzzz_busqueda on transportistas;
create trigger tg_zzzz_busqueda before insert or update on transportistas for each row execute function fn_zzzz_texto_busqueda();
drop trigger if exists tg_zzzz_busqueda on clientes;
create trigger tg_zzzz_busqueda before insert or update on clientes for each row execute function fn_zzzz_texto_busqueda();
drop trigger if exists tg_zzzz_busqueda on sitios;
create trigger tg_zzzz_busqueda before insert or update on sitios for each row execute function fn_zzzz_texto_busqueda();

-- Cuando cambian los contactos o los vehículos, se refresca el texto de su dueño.
create or replace function fn_busqueda_dueno()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tra uuid[] := '{}'; v_cli uuid[] := '{}'; v_sit uuid[] := '{}';
begin
  -- En un INSERT no hay OLD y en un DELETE no hay NEW: se mira lo que exista.
  if tg_op in ('INSERT', 'UPDATE') then
    v_tra := v_tra || new.transportista_id;
    if tg_table_name = 'contactos' then v_cli := v_cli || new.cliente_id; v_sit := v_sit || new.sitio_id; end if;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_tra := v_tra || old.transportista_id;
    if tg_table_name = 'contactos' then v_cli := v_cli || old.cliente_id; v_sit := v_sit || old.sitio_id; end if;
  end if;
  update transportistas t set texto_busqueda = transportista_texto_busqueda(t) where t.id = any(v_tra);
  update clientes k set texto_busqueda = cliente_texto_busqueda(k) where k.id = any(v_cli);
  update sitios s set texto_busqueda = sitio_texto_busqueda(s) where s.id = any(v_sit);
  return null;
end $$;
drop trigger if exists tg_zz_busqueda_dueno on contactos;
create trigger tg_zz_busqueda_dueno after insert or update or delete on contactos for each row execute function fn_busqueda_dueno();
drop trigger if exists tg_zz_busqueda_dueno on vehiculos;
create trigger tg_zz_busqueda_dueno after insert or update of matricula, activo, transportista_id or delete on vehiculos for each row execute function fn_busqueda_dueno();
-- Un cliente que cambia de nombre: sus sitios lo llevan en el texto.
create or replace function fn_busqueda_sitios_del_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update sitios s set texto_busqueda = sitio_texto_busqueda(s) where s.cliente_id = new.id;
  return null;
end $$;
drop trigger if exists tg_zz_busqueda_sitios on clientes;
create trigger tg_zz_busqueda_sitios after update of razon_social, nombre_comercial, nombre_visible, cif on clientes for each row
  when (old.nombre_visible is distinct from new.nombre_visible or old.razon_social is distinct from new.razon_social or old.cif is distinct from new.cif)
  execute function fn_busqueda_sitios_del_cliente();

-- Lo que ya existe, con su texto (sin pasar por los demás disparadores: solo esta columna).
update transportistas t set texto_busqueda = transportista_texto_busqueda(t) where texto_busqueda is null;
update clientes k set texto_busqueda = cliente_texto_busqueda(k) where texto_busqueda is null;
update sitios s set texto_busqueda = sitio_texto_busqueda(s) where texto_busqueda is null;

-- pg_trgm vive en el esquema «extensions» (Supabase) o en «public» (local): se mira cuál.
do $$
declare s text := (select n.nspname from pg_extension x join pg_namespace n on n.oid = x.extnamespace where x.extname = 'pg_trgm');
begin
  if s is null then raise exception 'Falta la extensión pg_trgm (la activa la migración buscador_envios).'; end if;
  execute format('create index if not exists idx_transportistas_texto on transportistas using gin (texto_busqueda %I.gin_trgm_ops)', s);
  execute format('create index if not exists idx_clientes_texto on clientes using gin (texto_busqueda %I.gin_trgm_ops)', s);
  execute format('create index if not exists idx_sitios_texto on sitios using gin (texto_busqueda %I.gin_trgm_ops) where not borrado', s);
end $$;
create index if not exists idx_transportistas_nombre_visible on transportistas (nombre_visible);
create index if not exists idx_clientes_nombre_visible on clientes (nombre_visible);
create index if not exists idx_sitios_nombre on sitios (cliente_id, nombre_empresa) where not borrado;

-- Las palabras del buscador como patrones LIKE (la más larga primero: es la que usa el índice).
create or replace function patrones_busqueda(p_q text)
returns text[] language sql immutable as $$
  select coalesce(array_agg('%' || replace(replace(replace(lower(unaccent_simple(w)), '\', '\\'), '%', '\%'), '_', '\_') || '%' order by length(w) desc), '{}')
    from unnest(regexp_split_to_array(trim(coalesce(p_q, '')), '\s+')) w where length(w) > 0
$$;
revoke execute on function patrones_busqueda(text) from public, anon;
grant execute on function patrones_busqueda(text) to authenticated, service_role;
comment on function public.patrones_busqueda(text) is '[Envíos] Ayudante de los buscadores: convierte el texto escrito en patrones LIKE (minúsculas, sin tildes, una palabra por patrón, la más larga primero). Quién: interno de los buscadores por páginas. Argumentos: p_q: texto del buscador.';

-- ---- Transportistas (solo Dynamo) ------------------------------------------------------
create or replace function transportistas_pagina(p_q text default null, p_estado text default null, p_adr text default null,
  p_pagina integer default 1, p_por_pagina integer default 20)
returns table (id uuid, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_pal text[] := patrones_busqueda(p_q);
  v_por int := least(greatest(coalesce(p_por_pagina, 20), 1), 200);
  v_off int := (greatest(coalesce(p_pagina, 1), 1) - 1) * least(greatest(coalesce(p_por_pagina, 20), 1), 200);
begin
  if not ve_todo() then return; end if;
  return query
  select t.id, count(*) over ()
    from transportistas t
   where (cardinality(v_pal) = 0 or (t.texto_busqueda like v_pal[1] and t.texto_busqueda like all (v_pal)))
     and (p_estado is null or p_estado = '' or t.estado_operativo::text = p_estado)
     and (p_adr is null or p_adr = ''
          or (p_adr = 'si') = exists (select 1 from vehiculos v where v.transportista_id = t.id and v.activo and v.adr))
   order by t.nombre_visible, t.id
   offset v_off limit v_por;
end $$;
revoke execute on function transportistas_pagina(text, text, text, integer, integer) from public, anon;
grant execute on function transportistas_pagina(text, text, text, integer, integer) to authenticated, service_role;
comment on function public.transportistas_pagina(text, text, text, integer, integer) is '[Transportistas] Lista por páginas: ids de la página y total, buscando en nombre, CIF, código de bolsa, población, NIMA, contactos y matrículas (todas las palabras, sin tildes), con filtros de estado y ADR. Quién: Dynamo (también solo lectura). Argumentos: p_q: texto · p_estado: activo | no_ofertar | suspendido · p_adr: si | no · p_pagina, p_por_pagina (máx. 200).';

-- Flota resumida de unos transportistas (para la lista: camiones, remolques, ADR, matrículas).
create or replace function transportistas_flota(p_ids uuid[])
returns table (transportista_id uuid, tractoras int, rigidos int, remolques int, adr boolean, matriculas text[])
language sql stable security definer set search_path = public as $$
  select v.transportista_id,
         count(*) filter (where v.tipo = 'tractora')::int, count(*) filter (where v.tipo = 'rigido')::int,
         count(*) filter (where v.tipo = 'remolque')::int,
         bool_or(coalesce(v.adr, false)), array_agg(v.matricula order by v.matricula)
    from vehiculos v
   where ve_todo() and v.activo and v.transportista_id = any(p_ids) and cardinality(p_ids) <= 500
   group by v.transportista_id
$$;
revoke execute on function transportistas_flota(uuid[]) from public, anon;
grant execute on function transportistas_flota(uuid[]) to authenticated, service_role;
comment on function public.transportistas_flota(uuid[]) is '[Transportistas] Flota activa resumida de hasta 500 transportistas (camiones, rígidos, remolques, si alguno es ADR y las matrículas). Quién: Dynamo. Argumentos: p_ids: transportistas.id.';

-- Envíos hechos (no borradores ni cancelados) de unas empresas: para la lista.
create or replace function envios_hechos_de(p_campo text, p_ids uuid[])
returns table (id uuid, envios bigint)
language sql stable security definer set search_path = public as $$
  select x.id, count(e.id)
    from unnest(p_ids) x(id)
    left join envios e on e.estado not in ('borrador', 'cancelado')
       and e.id is not null
       and case p_campo when 'cliente' then e.cliente_id = x.id and not e.es_manual
                        when 'transportista' then e.transportista_id = x.id
                        else false end
   where ve_todo() and cardinality(p_ids) <= 500
   group by x.id
$$;
revoke execute on function envios_hechos_de(text, uuid[]) from public, anon;
grant execute on function envios_hechos_de(text, uuid[]) to authenticated, service_role;
comment on function public.envios_hechos_de(text, uuid[]) is '[Envíos] Cuántos envíos hechos (no borradores ni cancelados) tiene cada empresa de la lista (hasta 500): para las listas de clientes y transportistas. Quién: Dynamo. Argumentos: p_campo: cliente | transportista · p_ids.';

-- Elegir un transportista al asignar u ofertar un envío (antes la ficha cargaba los 20.000).
create or replace function buscar_transportistas(p_q text, p_limite integer default 12, p_incluir uuid default null)
returns table (id uuid, nombre text, cif text, estado text, nima text, telefono text, email text)
language plpgsql stable security definer set search_path = public as $$
declare v_pal text[] := patrones_busqueda(p_q); v_lim int := least(greatest(coalesce(p_limite, 12), 1), 50);
  v_txt text := lower(unaccent_simple(trim(coalesce(p_q, ''))));
begin
  if not ve_todo() then return; end if;
  -- Primero se eligen los ids (con el límite); los contactos, solo de esos. Orden: el incluido,
  -- los que EMPIEZAN por lo escrito en el nombre, los que lo contienen entero, los activos, y
  -- por nombre (si no, con 20.000 fichas el que se busca por su nombre exacto puede quedar fuera).
  return query
  with elegidos as (
    select t.id, t.nombre_visible, t.cif, t.estado_operativo, t.nima,
           (t.id = p_incluir) as inc,
           (v_txt <> '' and lower(unaccent_simple(t.nombre_visible)) like v_txt || '%') as empieza,
           (v_txt <> '' and lower(unaccent_simple(t.nombre_visible)) like '%' || v_txt || '%') as contiene
      from transportistas t
     where t.id = p_incluir or cardinality(v_pal) = 0 or (t.texto_busqueda like v_pal[1] and t.texto_busqueda like all (v_pal))
     order by 6 desc, 7 desc, 8 desc, (t.estado_operativo = 'activo') desc, t.nombre_visible
     limit v_lim)
  select e.id, e.nombre_visible, e.cif, e.estado_operativo::text, e.nima, c.telefono, c.email
    from elegidos e
    left join lateral (select x.telefono, x.email from contactos x where x.transportista_id = e.id and x.funcion = 'trafico' and x.es_principal limit 1) c on true
   order by e.inc desc, e.empieza desc, e.contiene desc, (e.estado_operativo = 'activo') desc, e.nombre_visible;
end $$;
revoke execute on function buscar_transportistas(text, integer, uuid) from public, anon;
grant execute on function buscar_transportistas(text, integer, uuid) to authenticated, service_role;
comment on function public.buscar_transportistas(text, integer, uuid) is '[Transportistas] Buscador para elegir un transportista (asignar u ofertar un envío): hasta 50 que casen con el texto (nombre, CIF, bolsa, población, matrículas…), los activos primero; p_incluir sale siempre (el ya asignado). Quién: Dynamo. Argumentos: p_q: texto · p_limite (máx. 50) · p_incluir: transportistas.id.';

-- ---- Clientes (solo Dynamo) ------------------------------------------------------------
create or replace function clientes_pagina(p_q text default null, p_estado text default null, p_pagina integer default 1, p_por_pagina integer default 20)
returns table (id uuid, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_pal text[] := patrones_busqueda(p_q);
  v_por int := least(greatest(coalesce(p_por_pagina, 20), 1), 200);
  v_off int := (greatest(coalesce(p_pagina, 1), 1) - 1) * least(greatest(coalesce(p_por_pagina, 20), 1), 200);
begin
  if not ve_todo() then return; end if;
  return query
  select k.id, count(*) over ()
    from clientes k
   where (cardinality(v_pal) = 0 or (k.texto_busqueda like v_pal[1] and k.texto_busqueda like all (v_pal)))
     and (p_estado is null or p_estado = '' or k.estado::text = p_estado)
   order by k.nombre_visible, k.id
   offset v_off limit v_por;
end $$;
revoke execute on function clientes_pagina(text, text, integer, integer) from public, anon;
grant execute on function clientes_pagina(text, text, integer, integer) to authenticated, service_role;
comment on function public.clientes_pagina(text, text, integer, integer) is '[Clientes] Lista por páginas: ids de la página y total, buscando en nombre, CIF, código, domicilio, sector y contactos (todas las palabras, sin tildes), con filtro de estado. Quién: Dynamo (también solo lectura). Argumentos: p_q: texto · p_estado: activa | pendiente_verificacion | suspendida · p_pagina, p_por_pagina (máx. 200).';

-- ---- Sitios (Dynamo: todos; cliente: los suyos) ---------------------------------------------
create or replace function sitios_pagina(p_q text default null, p_cliente uuid default null, p_pagina integer default 1, p_por_pagina integer default 20)
returns table (id uuid, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_pal text[] := patrones_busqueda(p_q); v_cli uuid;
  v_por int := least(greatest(coalesce(p_por_pagina, 20), 1), 200);
  v_off int := (greatest(coalesce(p_pagina, 1), 1) - 1) * least(greatest(coalesce(p_por_pagina, 20), 1), 200);
begin
  if ve_todo() then v_cli := p_cliente;
  elsif cliente_del_usuario() is not null then v_cli := cliente_del_usuario();
  else return; end if;
  return query
  select s.id, count(*) over ()
    from sitios s left join clientes k on k.id = s.cliente_id
   where not s.borrado and not s.es_almacen_dynamo
     and (v_cli is null or s.cliente_id = v_cli)
     and (cardinality(v_pal) = 0 or (s.texto_busqueda like v_pal[1] and s.texto_busqueda like all (v_pal)))
   -- Dynamo sin filtro: agrupados por cliente; el principal arriba, luego los nuevos (48 h), luego por nombre.
   order by case when v_cli is null then k.nombre_visible end, s.cliente_id,
            (k.sitio_principal_id = s.id) desc nulls last,
            (s.creado_en > now() - interval '48 hours') desc, s.creado_en desc, s.nombre_empresa, s.id
   offset v_off limit v_por;
end $$;
revoke execute on function sitios_pagina(text, uuid, integer, integer) from public, anon;
grant execute on function sitios_pagina(text, uuid, integer, integer) to authenticated, service_role;
comment on function public.sitios_pagina(text, uuid, integer, integer) is '[Sitios y horarios] Lista por páginas de los sitios (no almacenes Dynamo): ids de la página y total, buscando en empresa, dirección, población, horarios, notas, contactos y nombre del cliente (todas las palabras, sin tildes). Dynamo ve todos (agrupados por cliente, o filtrados por p_cliente); un cliente, los suyos. Quién: Dynamo o cliente. Argumentos: p_q: texto · p_cliente: clientes.id (solo Dynamo) · p_pagina, p_por_pagina (máx. 200).';

-- Clientes para un desplegable grande: nombre, CIF y sitio principal, buscando (máx. 50).
create or replace function buscar_clientes(p_q text, p_limite integer default 12, p_incluir uuid default null)
returns table (id uuid, nombre text, cif text, principal_id uuid, iva_pct numeric, estado text)
language plpgsql stable security definer set search_path = public as $$
declare v_pal text[] := patrones_busqueda(p_q); v_lim int := least(greatest(coalesce(p_limite, 12), 1), 50);
  v_txt text := lower(unaccent_simple(trim(coalesce(p_q, ''))));
begin
  if not ve_todo() then return; end if;
  -- Mismo orden que buscar_transportistas: incluido, empieza por lo escrito, lo contiene, activos, nombre.
  return query
  select k.id, k.nombre_visible, k.cif, k.sitio_principal_id, k.iva_pct, k.estado::text
    from clientes k
   where k.id = p_incluir or cardinality(v_pal) = 0 or (k.texto_busqueda like v_pal[1] and k.texto_busqueda like all (v_pal))
   order by (k.id = p_incluir) desc,
            (v_txt <> '' and lower(unaccent_simple(k.nombre_visible)) like v_txt || '%') desc,
            (v_txt <> '' and lower(unaccent_simple(k.nombre_visible)) like '%' || v_txt || '%') desc,
            (k.estado = 'activa') desc, k.nombre_visible
   limit v_lim;
end $$;
revoke execute on function buscar_clientes(text, integer, uuid) from public, anon;
grant execute on function buscar_clientes(text, integer, uuid) to authenticated, service_role;
comment on function public.buscar_clientes(text, integer, uuid) is '[Clientes] Buscador para elegir un cliente (nuevo envío, sitios, usuarios…): hasta 50 que casen con el texto, los activos primero; p_incluir sale siempre. Quién: Dynamo. Argumentos: p_q: texto · p_limite (máx. 50) · p_incluir: clientes.id.';
