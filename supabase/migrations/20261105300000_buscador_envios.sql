-- =====================================================================================
-- BUSCADOR DE ENVÍOS PARA AÑOS DE DATOS (usuario, 2026-11-05)
-- «Si buscamos un envío de hace 4 años, o por cliente o matrícula, ¿podrá?»
--   1. Índice de búsqueda: envios.texto_busqueda (todo lo buscable, en minúsculas y sin
--      acentos) con índice de trigramas: buscar en años de datos tarda décimas.
--      Lo mantiene la base de datos (al cambiar el envío, sus paradas o el nombre del
--      cliente/transportista/operador).
--   2. Filtro por fecha de carga desde/hasta, sin plazo máximo.
--   3. Resultados por páginas (de 100), con el total: se llega a todos.
--   4. Clientes y transportistas buscan en TODOS sus envíos, cada uno solo en los datos
--      que ya ve (el transportista no puede buscar por el nombre del cliente).
-- buscar_envios_pagina() devuelve los ids de la página y el total; las filas se leen
-- después (Dynamo: la tabla; cliente: mis_envios_por_ids; transportista: mis_viajes_por_ids).
-- =====================================================================================

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create schema if not exists extensions;
    create extension pg_trgm with schema extensions;
  end if;
end $$;

alter table envios add column texto_busqueda text;
comment on column public.envios.texto_busqueda is 'formato: texto | rango: no aplica | lista: no aplica | automático | Todo lo buscable del envío (referencias, cliente, transportista, operador, mercancía, matrículas, conductor, paradas) en minúsculas y sin acentos, para el buscador. Lo mantiene la base de datos; no se escribe.';

-- Texto buscable de un envío (vista de Dynamo: todo).
create or replace function envio_texto_busqueda(e envios)
returns text language sql stable security definer set search_path = public as $$
  select lower(unaccent_simple(concat_ws(' ',
    e.referencia_gx, e.referencia_cliente, e.descripcion_mercancia,
    e.matricula_camion, e.matricula_remolque, e.conductor_nombre,
    e.poblacion_origen, e.poblacion_destino, e.codigo_postal_origen, e.codigo_postal_destino,
    (select concat_ws(' ', c.nombre_visible, c.razon_social, c.cif) from clientes c where c.id = e.cliente_id),
    (select concat_ws(' ', t.nombre_visible, t.razon_social, t.cif) from transportistas t where t.id = e.transportista_id),
    (select concat_ws(' ', o.razon_social, o.cif) from operadores o where o.id = e.operador_id),
    (select string_agg(concat_ws(' ', p.nombre_empresa, p.direccion, p.codigo_postal, p.poblacion, p.provincia, p.referencia), ' ')
       from envio_paradas p where p.envio_id = e.id))))
$$;
revoke execute on function envio_texto_busqueda(envios) from public, anon, authenticated;

-- Texto buscable para el CLIENTE o el TRANSPORTISTA: solo lo que cada uno ya ve.
create or replace function envio_texto_propio(e envios, p_quien text)
returns text language sql stable security definer set search_path = public as $$
  select lower(unaccent_simple(concat_ws(' ',
    e.referencia_gx, case when p_quien = 'cliente' then e.referencia_cliente end, e.descripcion_mercancia,
    e.matricula_camion, e.matricula_remolque, e.conductor_nombre,
    e.poblacion_origen, e.poblacion_destino, e.codigo_postal_origen, e.codigo_postal_destino,
    case when p_quien = 'cliente' then (select concat_ws(' ', o.razon_social, o.cif) from operadores o where o.id = e.operador_id) end,
    (select string_agg(concat_ws(' ', p.nombre_empresa, p.direccion, p.codigo_postal, p.poblacion, p.provincia,
                                 case when p_quien = 'cliente' then p.referencia end), ' ')
       from envio_paradas p where p.envio_id = e.id))))
$$;
revoke execute on function envio_texto_propio(envios, text) from public, anon, authenticated;

create or replace function fn_envios_zzzz_busqueda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.texto_busqueda := envio_texto_busqueda(new);
  return new;
end $$;
revoke execute on function fn_envios_zzzz_busqueda() from public, anon, authenticated;
create trigger tg_envios_zzzz_busqueda before insert or update on envios
  for each row execute function fn_envios_zzzz_busqueda();

-- Al cambiar las paradas o el nombre de la empresa, se recalcula el texto del envío.
create or replace function fn_busqueda_paradas()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid := coalesce(new.envio_id, old.envio_id);
begin
  update envios e set texto_busqueda = envio_texto_busqueda(e) where e.id = v and e.texto_busqueda is distinct from envio_texto_busqueda(e);
  return null;
end $$;
revoke execute on function fn_busqueda_paradas() from public, anon, authenticated;
create trigger tg_busqueda_paradas after insert or update or delete on envio_paradas
  for each row execute function fn_busqueda_paradas();

create or replace function fn_busqueda_empresa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'clientes' then
    update envios e set texto_busqueda = envio_texto_busqueda(e) where e.cliente_id = new.id;
  elsif tg_table_name = 'transportistas' then
    update envios e set texto_busqueda = envio_texto_busqueda(e) where e.transportista_id = new.id;
  else
    update envios e set texto_busqueda = envio_texto_busqueda(e) where e.operador_id = new.id;
  end if;
  return null;
end $$;
revoke execute on function fn_busqueda_empresa() from public, anon, authenticated;
create trigger tg_busqueda_clientes after update of razon_social, nombre_comercial, cif on clientes
  for each row when ((old.razon_social, old.nombre_comercial, old.cif) is distinct from (new.razon_social, new.nombre_comercial, new.cif))
  execute function fn_busqueda_empresa();
create trigger tg_busqueda_transportistas after update of razon_social, nombre_comercial, cif on transportistas
  for each row when ((old.razon_social, old.nombre_comercial, old.cif) is distinct from (new.razon_social, new.nombre_comercial, new.cif))
  execute function fn_busqueda_empresa();
create trigger tg_busqueda_operadores after update of razon_social, cif on operadores
  for each row when ((old.razon_social, old.cif) is distinct from (new.razon_social, new.cif))
  execute function fn_busqueda_empresa();

-- La auditoría no apunta el texto de búsqueda (es técnico).
create or replace function fn_auditar()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_cambios jsonb := '{}'::jsonb;
  v_accion  text;
  v_id      text;
  v_uid     uuid := auth.uid();
  k         text;
  -- Campos que NO generan entrada de auditoría por sí solos: son el propio sello.
  v_ignorar text[] := array['modificado_en', 'modificado_por', 'texto_busqueda']
                       -- Datos técnicos que caducan (RGPD): no se copian a la auditoría.
                       || case tg_table_name when 'envio_reservas' then array['ip', 'navegador'] else array[]::text[] end;
begin
  if tg_op = 'INSERT' then
    v_new     := to_jsonb(new) - v_ignorar;
    v_id      := v_new ->> 'id';
    v_accion  := 'alta';
    v_cambios := jsonb_build_object('despues', v_new - v_ignorar);

  elsif tg_op = 'UPDATE' then
    v_old    := to_jsonb(old);
    v_new    := to_jsonb(new);
    v_id     := v_new ->> 'id';
    v_accion := 'modificacion';
    for k in select jsonb_object_keys(v_new) loop
      if not (k = any (v_ignorar)) and (v_old -> k) is distinct from (v_new -> k) then
        v_cambios := v_cambios || jsonb_build_object(
          k, jsonb_build_object('antes', v_old -> k, 'despues', v_new -> k)
        );
      end if;
    end loop;
    -- Un UPDATE que no cambia nada real no ensucia la auditoría.
    if v_cambios = '{}'::jsonb then
      return new;
    end if;
    -- Anonimización (RGPD): se apunta QUÉ campos se borraron, nunca sus valores.
    if coalesce(current_setting('dynamo.anonimizando', true), '') = 'on' then
      v_cambios := jsonb_build_object('anonimizado', true,
                     'campos', (select jsonb_agg(x order by x) from jsonb_object_keys(v_cambios) x));
    end if;

  else   -- DELETE
    v_old     := to_jsonb(old) - v_ignorar;
    v_id      := v_old ->> 'id';
    v_accion  := 'baja';
    v_cambios := jsonb_build_object('antes', v_old);
    -- Borrado dentro de una anonimización: sin los datos borrados.
    if coalesce(current_setting('dynamo.anonimizando', true), '') = 'on' then
      v_cambios := jsonb_build_object('anonimizado', true, 'borrado', true);
    end if;
  end if;

  insert into auditoria (tabla, registro_id, accion, quien, quien_email, quien_origen, cambios)
  values (
    tg_table_name,
    v_id,
    v_accion,
    v_uid,
    (select u.email from auth.users u where u.id = v_uid),
    case when coalesce(current_setting('dynamo.migracion', true), '') = 'on'
         then 'migracion-sheet' else 'app' end,
    v_cambios
  );

  return coalesce(new, old);
end $$;

-- Rellenar los envíos que ya hay (sin disparar el resto de disparadores).
alter table envios disable trigger user;
update envios e set texto_busqueda = envio_texto_busqueda(e);
alter table envios enable trigger user;

-- Índices: texto (trigramas) y fecha de carga.
do $$
declare s text := (select n.nspname from pg_extension x join pg_namespace n on n.oid = x.extnamespace where x.extname = 'pg_trgm');
begin
  execute format('create index idx_envios_busqueda on envios using gin (texto_busqueda %I.gin_trgm_ops)', s);
end $$;
create index idx_envios_fecha_busqueda on envios ((coalesce(fecha_carga_real, fecha_carga_desde)) desc, creado_en desc);

-- ---- La búsqueda ----------------------------------------------------------------------
create or replace function buscar_envios_pagina(
  p_q text default null, p_desde date default null, p_hasta date default null,
  p_pagina integer default 1, p_por_pagina integer default 100,
  p_cliente uuid default null, p_transportista uuid default null)
returns table (id uuid, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_pal text[];
  v_cli uuid; v_tra uuid; v_quien text;
  v_por int := least(greatest(coalesce(p_por_pagina, 100), 1), 500);
  v_off int := (greatest(coalesce(p_pagina, 1), 1) - 1) * least(greatest(coalesce(p_por_pagina, 100), 1), 500);
begin
  -- La palabra más larga, primero: es la que usa el índice.
  select coalesce(array_agg('%' || replace(replace(replace(lower(unaccent_simple(w)), '\', '\\'), '%', '\%'), '_', '\_') || '%' order by length(w) desc), '{}')
    into v_pal
    from unnest(regexp_split_to_array(trim(coalesce(p_q, '')), '\s+')) w where length(w) > 0;
  if cardinality(v_pal) = 0 and p_desde is null and p_hasta is null then return; end if;

  if ve_todo() then
    v_quien := 'dynamo'; v_cli := p_cliente; v_tra := p_transportista;
  elsif cliente_del_usuario() is not null then
    v_quien := 'cliente'; v_cli := cliente_del_usuario();
  elsif transportista_del_usuario() is not null then
    v_quien := 'transportista'; v_tra := transportista_del_usuario();
  else
    return;
  end if;

  if v_quien = 'dynamo' and cardinality(v_pal) > 0 then
    -- Dynamo: con el índice de texto (la palabra más larga) y el resto comprobadas después.
    return query
    select e.id, count(*) over ()
      from envios e
     where e.texto_busqueda like v_pal[1] and e.texto_busqueda like all (v_pal)
       and (v_cli is null or e.cliente_id = v_cli)
       and (v_tra is null or e.transportista_id = v_tra)
       and (p_desde is null or coalesce(e.fecha_carga_real, e.fecha_carga_desde) >= p_desde)
       and (p_hasta is null or coalesce(e.fecha_carga_real, e.fecha_carga_desde) <= p_hasta)
     order by coalesce(e.fecha_carga_real, e.fecha_carga_desde) desc nulls last, e.creado_en desc
     offset v_off limit v_por;
  else
    -- Solo fechas (Dynamo), o cliente/transportista (sus envíos, con el texto que ve cada uno).
    return query
    select e.id, count(*) over ()
      from envios e
     where (v_cli is null or e.cliente_id = v_cli)
       and (v_tra is null or e.transportista_id = v_tra)
       and (p_desde is null or coalesce(e.fecha_carga_real, e.fecha_carga_desde) >= p_desde)
       and (p_hasta is null or coalesce(e.fecha_carga_real, e.fecha_carga_desde) <= p_hasta)
       and (cardinality(v_pal) = 0 or envio_texto_propio(e, v_quien) like all (v_pal))
     order by coalesce(e.fecha_carga_real, e.fecha_carga_desde) desc nulls last, e.creado_en desc
     offset v_off limit v_por;
  end if;
end $$;
revoke execute on function buscar_envios_pagina(text, date, date, integer, integer, uuid, uuid) from public, anon;
grant execute on function buscar_envios_pagina(text, date, date, integer, integer, uuid, uuid) to authenticated;

-- Las filas de una página de resultados, para el cliente y el transportista.
create or replace function mis_envios_por_ids(p_ids uuid[])
returns table (
  id uuid, referencia_gx text, referencia_cliente text, estado estado_envio,
  estado_asignacion estado_asignacion, es_manual boolean, operador_id uuid,
  precio_acordado_operador numeric,
  fecha_carga_desde date, fecha_carga_hasta date, fecha_carga_real date,
  fecha_entrega_estimada date,
  descripcion_mercancia varchar, toneladas numeric, metros_lineales numeric,
  tipo_carga tipo_carga, paletizado boolean, carga_lateral boolean, carga_superior boolean,
  carga_trasera boolean, plataforma_elevadora boolean, nima_requerido boolean, adr boolean,
  codigo_postal_origen text, poblacion_origen text,
  codigo_postal_destino text, poblacion_destino text,
  num_paradas smallint, importe_cliente numeric, moneda char, iva_aplicado numeric,
  anotaciones_cliente varchar, discrecion_comercial boolean,
  matricula_camion text, matricula_remolque text,
  conductor_nombre text, conductor_telefono text,
  creado_en timestamptz, modificado_en timestamptz, confirmado_en timestamptz,
  asignado_en timestamptz, cargado_en timestamptz, entregado_en timestamptz,
  cancelado_en timestamptz, paradas jsonb,
  solicitud_estado text, precio_valido_hasta timestamptz, condiciones_aceptadas_en timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.referencia_gx, e.referencia_cliente, e.estado, e.estado_asignacion,
         e.es_manual, e.operador_id, e.precio_acordado_operador,
         e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real, e.fecha_entrega_estimada,
         e.descripcion_mercancia, e.toneladas, e.metros_lineales, e.tipo_carga,
         e.paletizado, e.carga_lateral, e.carga_superior, e.carga_trasera,
         e.plataforma_elevadora, e.nima_requerido, e.adr,
         e.codigo_postal_origen, e.poblacion_origen,
         e.codigo_postal_destino, e.poblacion_destino, e.num_paradas,
         -- Mientras Dynamo no proponga precio, el cliente no ve ningún importe.
         case when e.solicitud_estado = 'pendiente_precio' then null else e.importe_cliente end,
         e.moneda, e.iva_aplicado, e.anotaciones_cliente,
         e.discrecion_comercial, e.matricula_camion, e.matricula_remolque,
         case when contacto_transportista_oculto(e.estado, e.fecha_entrega_estimada) then null else e.conductor_nombre end,
         case when contacto_transportista_oculto(e.estado, e.fecha_entrega_estimada) then null else e.conductor_telefono end,
         e.creado_en, e.modificado_en, e.confirmado_en, e.asignado_en, e.cargado_en,
         e.entregado_en, e.cancelado_en, paradas_json(e.id),
         e.solicitud_estado, e.precio_valido_hasta, e.condiciones_aceptadas_en
    from envios e
   where e.cliente_id = cliente_del_usuario() and e.id = any(p_ids)
   order by e.creado_en desc
$$;
revoke execute on function mis_envios_por_ids(uuid[]) from public, anon;
grant execute on function mis_envios_por_ids(uuid[]) to authenticated;

create or replace function mis_viajes_por_ids(p_ids uuid[])
returns table (
  id uuid, referencia_gx text, estado estado_envio,
  fecha_carga_desde date, fecha_carga_hasta date, fecha_carga_real date,
  fecha_entrega_estimada date,
  descripcion_mercancia varchar, toneladas numeric, metros_lineales numeric,
  tipo_carga tipo_carga, paletizado boolean, carga_lateral boolean, carga_superior boolean,
  carga_trasera boolean, plataforma_elevadora boolean, nima_requerido boolean, adr boolean,
  importe_transportista numeric, moneda char,
  matricula_camion text, matricula_remolque text, conductor_nombre text,
  conductor_telefono text, asignado_en timestamptz, cargado_en timestamptz,
  entregado_en timestamptz, paradas jsonb,
  discrecion_comercial boolean, codigo_postal_origen text, poblacion_origen text,
  codigo_postal_destino text, poblacion_destino text, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.referencia_gx, e.estado,
         e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real, e.fecha_entrega_estimada,
         e.descripcion_mercancia, e.toneladas, e.metros_lineales, e.tipo_carga,
         e.paletizado, e.carga_lateral, e.carga_superior, e.carga_trasera,
         e.plataforma_elevadora, e.nima_requerido, e.adr,
         e.importe_transportista, e.moneda,
         e.matricula_camion, e.matricula_remolque, e.conductor_nombre, e.conductor_telefono,
         e.asignado_en, e.cargado_en, e.entregado_en, paradas_viaje_json(e.id),
         e.discrecion_comercial, e.codigo_postal_origen, e.poblacion_origen,
         e.codigo_postal_destino, e.poblacion_destino, e.creado_en
    from envios e
   where e.transportista_id = transportista_del_usuario() and e.id = any(p_ids)
   order by e.fecha_carga_desde desc nulls last
$$;
revoke execute on function mis_viajes_por_ids(uuid[]) from public, anon;
grant execute on function mis_viajes_por_ids(uuid[]) to authenticated;

comment on function public.buscar_envios_pagina(text, date, date, integer, integer, uuid, uuid) is '[Envíos] Buscador de envíos en todos los años: palabras (todas tienen que aparecer, sin mayúsculas ni acentos) y/o fecha de carga desde-hasta, por páginas; devuelve los ids de la página y el total. Dynamo busca en todo (el cliente o transportista de «Ver como» acota); un cliente, en sus envíos; un transportista, en sus viajes y sin datos del cliente. Quién: cualquier usuario con sesión. Argumentos: p_q · p_desde/p_hasta (fecha de carga) · p_pagina · p_por_pagina (máx 500) · p_cliente/p_transportista (solo Dynamo).';
comment on function public.mis_envios_por_ids(uuid[]) is '[Envíos] Igual que mis_envios() pero solo los envíos indicados (una página de resultados del buscador). Quién: cliente. Argumentos: p_ids: ids de envíos.';
comment on function public.mis_viajes_por_ids(uuid[]) is '[Envíos] Igual que mis_viajes() pero solo los viajes indicados (una página de resultados del buscador). Quién: transportista. Argumentos: p_ids: ids de envíos.';
