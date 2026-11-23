-- PACKS DE GRUPAJE (usuario, 2026-11-23): agrupar envíos para ofrecerlos juntos a un
-- transportista como un solo viaje.
--
-- Una PARTIDA puede ir en un pack si es un envío de Dynamo programado, sin transportista,
-- de GRUPAJE (menos de un tráiler completo), en tráiler (sin plataforma elevadora), sin
-- mercancía peligrosa (ADR) y sin pago pendiente. Van juntas las partidas que:
--   · van de la MISMA PROVINCIA de origen a la MISMA PROVINCIA de destino, o le pillan
--     «AL PASO» a la ruta (recogida y entrega cerca de la línea origen → destino y en el
--     mismo sentido; parámetro pack_desvio_max_km);
--   · tienen VENTANAS DE CARGA QUE COINCIDEN (hay al menos un día común a todas);
--   · y entre todas NO SUPERAN EL TRÁILER: 13,30 m y 24 t (las medidas oficiales).
--
-- Dynamo ve en la ficha del envío las partidas compatibles y crea el pack; en «Packs de
-- grupaje», los packs posibles y los creados. Al asignar Dynamo un transportista a una
-- partida, se le asignan todas las del pack (mismo camión, mismo día dentro de la ventana
-- común). Si un transportista acepta una partida por su cuenta, o la partida cambia y ya
-- no encaja, o se cancela, sale del pack y Dynamo recibe aviso. Ofrecer el pack entero en
-- la bolsa y por email queda para la siguiente fase (TODO.md).

insert into parametros (clave, valor, descripcion) values
  ('pack_desvio_max_km', '50', 'Packs de grupaje: cuántos km, como mucho, pueden quedar la recogida y la entrega de una partida de la línea recta de la ruta del pack para contar como «al paso».')
on conflict (clave) do nothing;

create sequence if not exists packs_codigo_seq;

create table if not exists packs (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique default ('PK-' || lpad(nextval('packs_codigo_seq')::text, 4, '0')),
  estado          text not null default 'abierto' check (estado in ('abierto', 'asignado', 'deshecho')),
  lider_envio_id  uuid references envios(id) on delete set null,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  deshecho_en     timestamptz
);
comment on table packs is 'Packs de grupaje: envíos (partidas) agrupados por Dynamo para ofrecerlos juntos a un transportista como un solo viaje. Las partidas apuntan al pack con envios.pack_id.';
comment on column packs.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único.';
comment on column packs.codigo is 'formato: texto, PK- y 4 cifras | rango: no aplica | lista: no aplica | automático | Código del pack para hablar de él. Ej. OK: PK-0007';
comment on column packs.estado is 'formato: texto | rango: no aplica | lista: abierto, asignado, deshecho | automático | abierto: sin transportista; asignado: ya tiene transportista; deshecho: se deshizo (o se quedó con menos de 2 partidas). Ej. OK: abierto';
comment on column packs.lider_envio_id is 'formato: uuid | → envios.id | rango: no aplica | lista: no aplica | automático | La partida que marca la ruta del pack (las demás van por las mismas provincias o le pillan al paso).';
comment on column packs.creado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo se creó.';
comment on column packs.creado_por is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | automático | Quién lo creó.';
comment on column packs.deshecho_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo se deshizo.';
alter table packs enable row level security;
drop policy if exists packs_sel on packs;
create policy packs_sel on packs for select using ((select es_equipo_dynamo()));
drop policy if exists packs_ve_todo on packs;
create policy packs_ve_todo on packs for select using ((select ve_todo()));
revoke insert, update, delete on packs from anon, authenticated;
drop trigger if exists tg_mantenimiento on packs;
create trigger tg_mantenimiento before insert or update or delete on packs
  for each row execute function fn_bloqueo_mantenimiento();

alter table envios add column if not exists pack_id uuid references packs(id) on delete set null;
comment on column envios.pack_id is 'formato: uuid | → packs.id | rango: no aplica | lista: no aplica | automático | Pack de grupaje en el que va este envío (solo lo ve Dynamo). Lo ponen y lo quitan las funciones de packs.';
create index if not exists envios_pack_idx on envios(pack_id) where pack_id is not null;

-- ---- Ruta de un envío: provincia y punto de la 1.ª recogida y de la última entrega -------
-- La provincia, para comparar: en España la del código postal (la que manda); fuera, la
-- escrita (sin tildes ni mayúsculas) o, si no hay, la población.
create or replace function pack_provincia_clave(p_pais text, p_cp text, p_provincia text, p_poblacion text) returns text
language sql immutable set search_path = public as $$
  select case
    when upper(coalesce(p_pais, 'ES')) = 'ES' and regexp_replace(coalesce(p_cp, ''), '\s', '', 'g') ~ '^[0-9]{5}$'
      then 'ES|' || lower(unaccent_simple(provincia_de_codigo_postal(p_cp)))
    else upper(coalesce(p_pais, 'ES')) || '|' || lower(unaccent_simple(coalesce(nullif(trim(p_provincia), ''), trim(p_poblacion), '')))
  end
$$;
revoke all on function pack_provincia_clave(text, text, text, text) from public, anon, authenticated;

create or replace function pack_ruta(p_envio uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (
    select p.orden, p.tipo, upper(coalesce(p.pais_codigo_iso, 'ES')) pais, p.codigo_postal, p.poblacion,
           case when upper(coalesce(p.pais_codigo_iso, 'ES')) = 'ES' and regexp_replace(coalesce(p.codigo_postal, ''), '\s', '', 'g') ~ '^[0-9]{5}$'
                then provincia_de_codigo_postal(p.codigo_postal) else coalesce(nullif(trim(p.provincia), ''), p.poblacion) end provincia,
           pack_provincia_clave(p.pais_codigo_iso, p.codigo_postal, p.provincia, p.poblacion) clave,
           coalesce(p.lat, s.lat, g.lat) lat, coalesce(p.lon, s.lon, g.lon) lon
      from envio_paradas p
      left join sitios s on s.id = p.sitio_id
      left join geo_codigos_postales g on g.pais_codigo_iso = upper(coalesce(p.pais_codigo_iso, 'ES'))
                                      and g.codigo_postal = upper(regexp_replace(coalesce(p.codigo_postal, ''), '\s', '', 'g'))
     where p.envio_id = p_envio),
  o as (select * from p where tipo = 'carga' order by orden limit 1),
  d as (select * from p where tipo = 'descarga' order by orden desc limit 1)
  select jsonb_build_object(
    'origen_clave', o.clave, 'destino_clave', d.clave,
    'origen', trim(coalesce(o.poblacion, '') || case when o.provincia is not null and o.provincia is distinct from o.poblacion then ' (' || o.provincia || ')' else '' end),
    'destino', trim(coalesce(d.poblacion, '') || case when d.provincia is not null and d.provincia is distinct from d.poblacion then ' (' || d.provincia || ')' else '' end),
    'provincia_origen', o.provincia, 'provincia_destino', d.provincia,
    'olat', o.lat, 'olon', o.lon, 'dlat', d.lat, 'dlon', d.lon)
  from o, d
$$;
revoke all on function pack_ruta(uuid) from public, anon, authenticated;

-- ¿Puede ir en un pack? null = sí; si no, el motivo (para enseñarlo en la ficha).
create or replace function pack_motivo_no(p_envio uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when e.id is null then 'No existe.'
    when e.cliente_id is null or coalesce(e.es_manual, false) or e.operador_id is not null then 'Lo mueve el transportista propio del cliente.'
    when e.estado <> 'programado' then 'Ya no está programado.'
    when e.transportista_id is not null then 'Ya tiene transportista.'
    when coalesce(e.requiere_plataforma_elevadora, false) then 'Va en rígido con plataforma elevadora (los packs son de tráiler).'
    when coalesce(e.adr, false) then 'Lleva mercancía peligrosa (ADR): no se agrupa.'
    when coalesce(e.metros_lineales, 0) <= 0 or coalesce(e.metros_lineales, 0) >= 12.99 then 'No es grupaje: ocupa el tráiler entero.'
    when e.estado_pago_previo = 'pendiente' then 'Está pendiente de pago.'
    when e.fecha_carga_desde is null then 'No tiene fecha de carga.'
  end
  from (select 1) x left join envios e on e.id = p_envio
$$;
revoke all on function pack_motivo_no(uuid) from public, anon, authenticated;

-- ¿Le pilla AL PASO la partida c a la ruta r? Recogida y entrega a menos de N km de la línea
-- origen → destino de r (en plano, suficiente para esto) y en el mismo sentido.
create or replace function pack_al_paso(r jsonb, c jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare ax float8; ay float8; bx float8; by_ float8; px float8; py float8; qx float8; qy float8;
  k float8; l2 float8; t1 float8; t2 float8; d1 float8; d2 float8; lim float8;
begin
  if r ->> 'olat' is null or r ->> 'dlat' is null or c ->> 'olat' is null or c ->> 'dlat' is null then return false; end if;
  lim := coalesce((parametro('pack_desvio_max_km'))::text::float8, 50);
  k := cos(radians(((r ->> 'olat')::float8 + (r ->> 'dlat')::float8) / 2));
  ax := (r ->> 'olon')::float8 * 111.32 * k; ay := (r ->> 'olat')::float8 * 110.57;
  bx := (r ->> 'dlon')::float8 * 111.32 * k; by_ := (r ->> 'dlat')::float8 * 110.57;
  px := (c ->> 'olon')::float8 * 111.32 * k; py := (c ->> 'olat')::float8 * 110.57;
  qx := (c ->> 'dlon')::float8 * 111.32 * k; qy := (c ->> 'dlat')::float8 * 110.57;
  l2 := (bx - ax) ^ 2 + (by_ - ay) ^ 2;
  if l2 < 1 then return false; end if;
  t1 := ((px - ax) * (bx - ax) + (py - ay) * (by_ - ay)) / l2;
  t2 := ((qx - ax) * (bx - ax) + (qy - ay) * (by_ - ay)) / l2;
  if t1 < -0.05 or t2 > 1.05 or t1 >= t2 then return false; end if;
  d1 := sqrt((px - (ax + greatest(0, least(1, t1)) * (bx - ax))) ^ 2 + (py - (ay + greatest(0, least(1, t1)) * (by_ - ay))) ^ 2);
  d2 := sqrt((qx - (ax + greatest(0, least(1, t2)) * (bx - ax))) ^ 2 + (qy - (ay + greatest(0, least(1, t2)) * (by_ - ay))) ^ 2);
  return d1 <= lim and d2 <= lim;
end $$;
revoke all on function pack_al_paso(jsonb, jsonb) from public, anon, authenticated;

-- Una partida en el formato de las pantallas.
create or replace function pack_partida_json(p_envio uuid, p_tipo text default null, p_cabe boolean default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', e.id, 'referencia_gx', e.referencia_gx, 'cliente', c.nombre_visible,
           'origen', r ->> 'origen', 'destino', r ->> 'destino',
           'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas,
           'desde', e.fecha_carga_desde, 'hasta', coalesce(e.fecha_carga_hasta, e.fecha_carga_desde),
           'importe_transportista', e.importe_transportista, 'transportista_id', e.transportista_id,
           'tipo', p_tipo, 'cabe', p_cabe)
    from envios e left join clientes c on c.id = e.cliente_id, lateral (select pack_ruta(e.id) r) x
   where e.id = p_envio
$$;
revoke all on function pack_partida_json(uuid, text, boolean) from public, anon, authenticated;

-- ---- Lo que enseña la ficha: el pack del envío o las partidas que se le pueden juntar -----
create or replace function envio_pack_info(p_envio uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e envios%rowtype; k packs%rowtype; r jsonb; v_ml numeric; v_t numeric; v_desde date; v_hasta date;
  v_miembros uuid[]; v_lider uuid; v_motivo text; v_comp jsonb; v_part jsonb;
begin
  if not (es_equipo_dynamo() or ve_todo()) then raise exception 'Solo Dynamo ve los packs.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio;
  if not found then return null; end if;
  if e.pack_id is not null then
    select * into k from packs where id = e.pack_id;
    select array_agg(id order by fecha_carga_desde, referencia_gx) into v_miembros from envios where pack_id = k.id;
    v_lider := coalesce(k.lider_envio_id, v_miembros[1]);
  else
    v_motivo := pack_motivo_no(p_envio);
    if v_motivo is not null then return jsonb_build_object('pack', null, 'motivo', v_motivo, 'compatibles', '[]'::jsonb); end if;
    v_miembros := array[p_envio]; v_lider := p_envio;
  end if;
  select sum(metros_lineales), sum(toneladas), max(fecha_carga_desde), min(coalesce(fecha_carga_hasta, fecha_carga_desde))
    into v_ml, v_t, v_desde, v_hasta from envios where id = any(v_miembros);
  r := pack_ruta(v_lider);
  select coalesce(jsonb_agg(pack_partida_json(m) order by n), '[]'::jsonb) into v_part from unnest(v_miembros) with ordinality u(m, n);
  -- Compatibles: libres, que coinciden en fechas con el pack (o el envío) y por la misma
  -- ruta o al paso. «cabe» dice si entra sin pasarse del tráiler.
  if k.id is null or k.estado = 'abierto' then
    select coalesce(jsonb_agg(x.j order by x.misma desc, x.cabe desc, x.desde, x.gx), '[]'::jsonb) into v_comp from (
      select pack_partida_json(c.id, case when cr ->> 'origen_clave' = r ->> 'origen_clave' and cr ->> 'destino_clave' = r ->> 'destino_clave' then 'misma_ruta' else 'al_paso' end,
                               v_ml + c.metros_lineales <= 13.3 and coalesce(v_t, 0) + coalesce(c.toneladas, 0) <= 24) j,
             (cr ->> 'origen_clave' = r ->> 'origen_clave' and cr ->> 'destino_clave' = r ->> 'destino_clave') misma,
             (v_ml + c.metros_lineales <= 13.3 and coalesce(v_t, 0) + coalesce(c.toneladas, 0) <= 24) cabe,
             c.fecha_carga_desde desde, c.referencia_gx gx
        from envios c, lateral (select pack_ruta(c.id) cr) y
       where c.estado = 'programado' and c.transportista_id is null and c.pack_id is null and c.id <> all(v_miembros)
         and c.fecha_carga_desde <= v_hasta and coalesce(c.fecha_carga_hasta, c.fecha_carga_desde) >= v_desde
         and pack_motivo_no(c.id) is null
         and ((cr ->> 'origen_clave' = r ->> 'origen_clave' and cr ->> 'destino_clave' = r ->> 'destino_clave') or pack_al_paso(r, cr))
       limit 30) x;
  end if;
  return jsonb_build_object(
    'pack', case when k.id is null then null else jsonb_build_object('id', k.id, 'codigo', k.codigo, 'estado', k.estado) end,
    'motivo', null, 'ruta', jsonb_build_object('origen', r ->> 'origen', 'destino', r ->> 'destino'),
    'partidas', v_part, 'metros_lineales', v_ml, 'toneladas', v_t, 'desde', v_desde, 'hasta', v_hasta,
    'compatibles', coalesce(v_comp, '[]'::jsonb));
end $$;
revoke execute on function envio_pack_info(uuid) from public, anon;
grant execute on function envio_pack_info(uuid) to authenticated;
comment on function envio_pack_info(uuid) is '[Packs] Para la ficha del envío (solo Dynamo): su pack de grupaje (partidas, metros, toneladas y días comunes) o, si va suelto, las partidas libres que se le pueden juntar (misma ruta o al paso, fechas que coinciden y si caben en el tráiler); si no puede ir en un pack, el motivo. Argumentos: p_envio.';

-- ---- Crear un pack o añadir partidas ---------------------------------------------------------
-- Todas las partidas tienen que poder ir en un pack, coincidir en al menos un día de carga,
-- ir por la ruta de la primera (mismas provincias) o pillarle al paso, y no pasar del tráiler.
create or replace function crear_pack(p_envios uuid[], p_pack uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k packs%rowtype; v_todos uuid[]; v_lider uuid; r jsonb; v uuid; v_m text; v_ml numeric; v_t numeric;
  v_desde date; v_hasta date; v_gx text; cr jsonb;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo agrupa envíos.' using errcode = '42501'; end if;
  if p_pack is not null then
    select * into k from packs where id = p_pack for update;
    if not found or k.estado <> 'abierto' then raise exception 'Ese pack ya no admite partidas.'; end if;
  end if;
  select array_agg(distinct x) into v_todos from (
    select unnest(coalesce(p_envios, '{}')) x union select id from envios where p_pack is not null and pack_id = p_pack) y;
  if coalesce(array_length(v_todos, 1), 0) < 2 then raise exception 'Un pack necesita al menos 2 partidas.'; end if;
  perform 1 from envios where id = any(v_todos) for update;
  foreach v in array v_todos loop
    select referencia_gx into v_gx from envios where id = v;
    v_m := pack_motivo_no(v);
    if v_m is not null then raise exception 'La partida #% no puede ir en un pack: %', coalesce(v_gx, '?'), v_m; end if;
    if exists (select 1 from envios where id = v and pack_id is not null and pack_id is distinct from p_pack) then
      raise exception 'La partida #% ya va en otro pack: quítala de ese primero.', v_gx;
    end if;
    if coalesce(envio_transportista_asignandose(v), false) then
      raise exception 'La partida #% tiene un transportista asignándose ahora mismo.', v_gx;
    end if;
  end loop;
  v_lider := coalesce(k.lider_envio_id, p_envios[1]);
  if not (v_lider = any(v_todos)) then v_lider := v_todos[1]; end if;
  r := pack_ruta(v_lider);
  foreach v in array v_todos loop
    continue when v = v_lider;
    cr := pack_ruta(v);
    if not ((cr ->> 'origen_clave' = r ->> 'origen_clave' and cr ->> 'destino_clave' = r ->> 'destino_clave') or pack_al_paso(r, cr)) then
      raise exception 'La partida #% no va de % a % ni le pilla al paso.', (select referencia_gx from envios where id = v), r ->> 'provincia_origen', r ->> 'provincia_destino';
    end if;
  end loop;
  select sum(metros_lineales), sum(coalesce(toneladas, 0)), max(fecha_carga_desde), min(coalesce(fecha_carga_hasta, fecha_carga_desde))
    into v_ml, v_t, v_desde, v_hasta from envios where id = any(v_todos);
  if v_ml > 13.3 then raise exception 'Entre todas suman % m: se pasan del tráiler (13,30 m).', replace(round(v_ml, 2)::text, '.', ','); end if;
  if v_t > 24 then raise exception 'Entre todas suman % t: se pasan del tráiler (24 t).', replace(round(v_t, 2)::text, '.', ','); end if;
  if v_desde > v_hasta then raise exception 'Las ventanas de carga no tienen ningún día en común.'; end if;
  if k.id is null then
    insert into packs (lider_envio_id) values (v_lider) returning * into k;
  end if;
  update envios set pack_id = k.id where id = any(v_todos) and pack_id is distinct from k.id;
  return jsonb_build_object('ok', true, 'pack_id', k.id, 'codigo', k.codigo);
end $$;
revoke execute on function crear_pack(uuid[], uuid) from public, anon;
grant execute on function crear_pack(uuid[], uuid) to authenticated;
comment on function crear_pack(uuid[], uuid) is '[Packs] Dynamo agrupa envíos en un pack de grupaje (o añade partidas a uno abierto): todas programadas, sin transportista, de grupaje en tráiler, con al menos un día de carga en común, por la misma ruta de provincias o al paso, y sin pasar de 13,30 m ni 24 t. Argumentos: p_envios, p_pack (vacío = pack nuevo).';

-- Quitar partidas y deshacer. Un pack con menos de 2 partidas se deshace solo.
create or replace function pack_recoger(p_pack uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_pack is null then return; end if;
  if (select count(*) from envios where pack_id = p_pack) < 2 then
    update envios set pack_id = null where pack_id = p_pack;
    update packs set estado = 'deshecho', deshecho_en = now() where id = p_pack and estado <> 'deshecho';
  elsif not exists (select 1 from envios where pack_id = p_pack and id = (select lider_envio_id from packs where id = p_pack)) then
    update packs set lider_envio_id = (select id from envios where pack_id = p_pack order by fecha_carga_desde, referencia_gx limit 1) where id = p_pack;
  end if;
end $$;
revoke all on function pack_recoger(uuid) from public, anon, authenticated;

create or replace function quitar_de_pack(p_envio uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_pack uuid;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo agrupa envíos.' using errcode = '42501'; end if;
  select pack_id into v_pack from envios where id = p_envio for update;
  if v_pack is null then return jsonb_build_object('ok', true); end if;
  update envios set pack_id = null where id = p_envio;
  perform pack_recoger(v_pack);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function quitar_de_pack(uuid) from public, anon;
grant execute on function quitar_de_pack(uuid) to authenticated;
comment on function quitar_de_pack(uuid) is '[Packs] Dynamo saca un envío de su pack de grupaje; si el pack se queda con menos de 2 partidas, se deshace. Argumentos: p_envio.';

create or replace function deshacer_pack(p_pack uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo agrupa envíos.' using errcode = '42501'; end if;
  update envios set pack_id = null where pack_id = p_pack and transportista_id is null;
  perform pack_recoger(p_pack);
  update packs set estado = 'deshecho', deshecho_en = now() where id = p_pack and estado = 'abierto'
    and not exists (select 1 from envios where pack_id = p_pack);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function deshacer_pack(uuid) from public, anon;
grant execute on function deshacer_pack(uuid) to authenticated;
comment on function deshacer_pack(uuid) is '[Packs] Dynamo deshace un pack de grupaje: sus partidas sin transportista vuelven a ir sueltas. Argumentos: p_pack.';

-- ---- La lista: packs creados y packs posibles ------------------------------------------------
-- Posibles: las partidas libres se juntan por pareja de provincias (origen → destino) y, en
-- cada pareja, de la que carga antes a la que carga después, mientras haya un día común y
-- quepan en el tráiler. Solo se enseñan los grupos de 2 o más.
create or replace function packs_de_grupaje() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_creados jsonb; v_posibles jsonb := '[]'::jsonb; c record; v_ids uuid[] := '{}'; v_ml numeric := 0; v_t numeric := 0;
  v_desde date; v_hasta date; v_par text; v_po text; v_pd text;
begin
  if not (es_equipo_dynamo() or ve_todo()) then raise exception 'Solo Dynamo ve los packs.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(envio_pack_info(x.lider) || jsonb_build_object('creado_en', x.creado_en) order by x.creado_en desc), '[]'::jsonb) into v_creados
    from (select k.creado_en, (select id from envios where pack_id = k.id order by fecha_carga_desde limit 1) lider
            from packs k where k.estado in ('abierto', 'asignado') and exists (select 1 from envios where pack_id = k.id)
           order by k.creado_en desc limit 100) x;
  -- Un solo recorrido, ordenado por pareja de provincias y por fecha; se cierra el grupo al
  -- cambiar de pareja, al no haber día común o al no caber.
  for c in
    select y.id, y.ml, y.t, y.d, y.h, (y.r ->> 'origen_clave') || '>' || (y.r ->> 'destino_clave') par,
           y.r ->> 'provincia_origen' po, y.r ->> 'provincia_destino' pd
      from (select e.id, e.metros_lineales ml, coalesce(e.toneladas, 0) t, e.fecha_carga_desde d,
                   coalesce(e.fecha_carga_hasta, e.fecha_carga_desde) h, e.referencia_gx gx, pack_ruta(e.id) r
              from envios e
             where e.estado = 'programado' and e.transportista_id is null and e.pack_id is null and pack_motivo_no(e.id) is null
             order by e.fecha_carga_desde limit 2000) y
     where y.r ->> 'origen_clave' is not null and y.r ->> 'destino_clave' is not null
     order by 6, y.d, y.h, y.gx
  loop
    if array_length(v_ids, 1) is not null
       and (c.par <> v_par or greatest(v_desde, c.d) > least(v_hasta, c.h) or v_ml + c.ml > 13.3 or v_t + c.t > 24) then
      if array_length(v_ids, 1) >= 2 then
        v_posibles := v_posibles || jsonb_build_array(jsonb_build_object('origen', v_po, 'destino', v_pd,
          'metros_lineales', v_ml, 'toneladas', v_t, 'desde', v_desde, 'hasta', v_hasta,
          'partidas', (select jsonb_agg(pack_partida_json(u) order by n) from unnest(v_ids) with ordinality z(u, n))));
      end if;
      v_ids := '{}'; v_ml := 0; v_t := 0; v_desde := null; v_hasta := null;
    end if;
    v_ids := v_ids || c.id; v_ml := v_ml + c.ml; v_t := v_t + c.t; v_par := c.par; v_po := c.po; v_pd := c.pd;
    v_desde := greatest(coalesce(v_desde, c.d), c.d); v_hasta := least(coalesce(v_hasta, c.h), c.h);
  end loop;
  if array_length(v_ids, 1) >= 2 then
    v_posibles := v_posibles || jsonb_build_array(jsonb_build_object('origen', v_po, 'destino', v_pd,
      'metros_lineales', v_ml, 'toneladas', v_t, 'desde', v_desde, 'hasta', v_hasta,
      'partidas', (select jsonb_agg(pack_partida_json(u) order by n) from unnest(v_ids) with ordinality z(u, n))));
  end if;
  return jsonb_build_object('creados', v_creados, 'posibles', v_posibles);
end $$;
revoke execute on function packs_de_grupaje() from public, anon;
grant execute on function packs_de_grupaje() to authenticated;
comment on function packs_de_grupaje() is '[Packs] Para la pantalla «Packs de grupaje» (solo Dynamo): los packs creados (abiertos o asignados) y los packs posibles con las partidas libres, juntadas por provincia de origen y de destino, con un día de carga en común y sin pasar del tráiler. Argumentos: sin argumentos.';

-- ---- Lo que pasa cuando cambia una partida ---------------------------------------------------
create or replace function fn_envios_pack() returns trigger
language plpgsql security definer set search_path = public as $$
declare k packs%rowtype; v_fp date; v_mal text; s record; v_desde date; v_hasta date;
begin
  if new.pack_id is null then return new; end if;
  select * into k from packs where id = new.pack_id;
  -- Le ponen transportista.
  if old.transportista_id is null and new.transportista_id is not null then
    if es_equipo_dynamo() then
      -- Lo asigna Dynamo: el mismo camión y el mismo día para TODAS las partidas del pack.
      select max(fecha_carga_desde), min(coalesce(fecha_carga_hasta, fecha_carga_desde)) into v_desde, v_hasta
        from envios where pack_id = new.pack_id;
      v_fp := new.fecha_carga_prevista;
      if v_fp is null or v_fp < v_desde or v_fp > v_hasta then
        raise exception 'Este envío va en el pack %: la carga tiene que ser un día común a todas sus partidas (del % al %).',
          k.codigo, to_char(v_desde, 'DD/MM/YYYY'), to_char(v_hasta, 'DD/MM/YYYY');
      end if;
      for s in select id, referencia_gx, importe_transportista from envios
                where pack_id = new.pack_id and id <> new.id and transportista_id is null loop
        if coalesce(s.importe_transportista, 0) <= 0 then
          raise exception 'La partida #% del pack % no tiene precio del transportista: pónselo antes de asignar el pack.', s.referencia_gx, k.codigo;
        end if;
      end loop;
      update envios set transportista_id = new.transportista_id, estado_asignacion = 'confirmada',
             matricula_camion = new.matricula_camion, matricula_remolque = new.matricula_remolque,
             conductor_nombre = new.conductor_nombre, conductor_telefono = new.conductor_telefono,
             fecha_carga_prevista = v_fp
       where pack_id = new.pack_id and id <> new.id and transportista_id is null;
      update packs set estado = 'asignado' where id = new.pack_id and estado = 'abierto';
      return new;
    end if;
    -- Lo ha aceptado un transportista por su cuenta: esa partida sale del pack.
    v_mal := 'la ha aceptado un transportista por separado';
  elsif new.estado <> 'programado' and new.transportista_id is null then
    v_mal := 'ya no está programada (' || replace(new.estado::text, '_', ' ') || ')';
  elsif new.transportista_id is null and k.estado = 'abierto'
        and (new.metros_lineales, new.toneladas, new.fecha_carga_desde, new.fecha_carga_hasta, new.requiere_plataforma_elevadora, new.adr, new.estado_pago_previo)
            is distinct from (old.metros_lineales, old.toneladas, old.fecha_carga_desde, old.fecha_carga_hasta, old.requiere_plataforma_elevadora, old.adr, old.estado_pago_previo) then
    v_mal := pack_motivo_no(new.id);
    if v_mal is null then
      select max(fecha_carga_desde), min(coalesce(fecha_carga_hasta, fecha_carga_desde)) into v_desde, v_hasta from envios where pack_id = new.pack_id;
      if v_desde > v_hasta then v_mal := 'su ventana de carga ya no coincide con las demás';
      elsif (select sum(metros_lineales) from envios where pack_id = new.pack_id) > 13.3
         or (select sum(coalesce(toneladas, 0)) from envios where pack_id = new.pack_id) > 24 then v_mal := 'con sus medidas nuevas el pack se pasa del tráiler';
      end if;
    end if;
  end if;
  if v_mal is not null then
    update envios set pack_id = null where id = new.id;
    perform pack_recoger(k.id);
    perform crear_aviso('dynamo', null, null, 'pack_partida_fuera', 'aviso', 'Pack ' || k.codigo || ': sale la partida #' || coalesce(new.referencia_gx, ''),
      'La partida #' || coalesce(new.referencia_gx, '') || ' sale del pack ' || k.codigo || ': ' || v_mal || '. Revisa el pack.',
      '/panel/envios?ver=' || new.id, new.id);
  end if;
  return new;
end $$;
drop trigger if exists tg_envios_pack on envios;
create trigger tg_envios_pack after update on envios
  for each row when (new.pack_id is not null) execute function fn_envios_pack();
