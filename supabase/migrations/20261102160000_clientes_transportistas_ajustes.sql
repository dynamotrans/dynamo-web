-- =====================================================================================
-- AJUSTES DE CLIENTES Y TRANSPORTISTAS (revisión con el usuario, 2026-11-02)
-- =====================================================================================
-- Primer bloque de la revisión de tablas. Va como migración NUEVA y no editando la
-- 0003: la 0003 ya está aplicada en dynamo-pruebas, y Supabase no vuelve a ejecutar
-- una migración que ya aplicó. Editarla dejaría el fichero y la base de datos diciendo
-- cosas distintas.
--
--   1. `nombre` → `razon_social`  +  `nombre_comercial` (opcional)
--      y `nombre_visible`, calculada: el comercial si lo hay, si no la razón social.
--   2. Transportistas: `wtransnet_codigo` → `bolsa` + `codigo_bolsa`
--      (se aceptan todas las bolsas de Alpega, no solo Wtransnet).
--   3. Transportistas: `pronto_pago` (sí/no por transportista).
-- =====================================================================================


-- =====================================================================================
-- 1. RAZÓN SOCIAL Y NOMBRE COMERCIAL
-- =====================================================================================
-- RENAME y no "añadir y copiar": conserva el CHECK, los índices y la auditoría sin
-- tocar nada más. Holded llama "Nombre" a la razón social, así que la exportación
-- usará `razon_social`.
alter table clientes       rename column nombre to razon_social;
alter table transportistas rename column nombre to razon_social;

alter table clientes       add column nombre_comercial text;
alter table transportistas add column nombre_comercial text;

-- El nombre que se enseña en listados y buscadores. Generada: no se puede olvidar
-- rellenarla ni quedarse desfasada.
alter table clientes add column nombre_visible text
  generated always as (coalesce(nullif(trim(nombre_comercial), ''), razon_social)) stored;
alter table transportistas add column nombre_visible text
  generated always as (coalesce(nullif(trim(nombre_comercial), ''), razon_social)) stored;

comment on column clientes.razon_social is
  'Nombre fiscal completo ("Marbex Industrial S.L."). Es el "Nombre" de Holded.';
comment on column clientes.nombre_comercial is
  'Opcional. Como se le conoce ("Marbex"). Si esta vacio se usa la razon social.';
comment on column clientes.nombre_visible is
  'Calculada: nombre comercial si lo hay, si no la razon social. La de listados.';
comment on column transportistas.razon_social is
  'Nombre fiscal completo. Es el "Nombre" de Holded.';
comment on column transportistas.nombre_comercial is
  'Opcional. Como se le conoce. Si esta vacio se usa la razon social.';
comment on column transportistas.nombre_visible is
  'Calculada: nombre comercial si lo hay, si no la razon social. La de listados.';

-- El buscador encuentra por cualquiera de los dos nombres.
drop index if exists idx_clientes_nombre;
drop index if exists idx_transportistas_nombre;
create index idx_clientes_nombre on clientes using gin (
  to_tsvector('spanish', razon_social || ' ' || coalesce(nombre_comercial, '')));
create index idx_transportistas_nombre on transportistas using gin (
  to_tsvector('spanish', razon_social || ' ' || coalesce(nombre_comercial, '')));


-- =====================================================================================
-- 2. BOLSA DE CARGA
-- =====================================================================================
-- Decisión del 2026-10-29: solo se aceptan transportistas de las bolsas del grupo
-- Alpega. Lista cerrada con CHECK y no tipo enumerado: añadir una bolsa mañana es
-- cambiar una línea, y un tipo enumerado no deja quitar valores.
-- Sin bolsa (`null`) = "No tengo bolsa de carga": su alta queda pendiente de revisión.
alter table transportistas rename column wtransnet_codigo to codigo_bolsa;
alter table transportistas add column bolsa text
  check (bolsa in ('wtransnet', 'teleroute', 'bursa_transport', '123cargo'));
alter table transportistas add constraint ck_transportistas_codigo_con_bolsa
  check (codigo_bolsa is null or bolsa is not null);

comment on column transportistas.bolsa is
  'Bolsa de carga del grupo Alpega en la que esta dado de alta. null = no tiene '
  '(su alta queda pendiente de revision, como dice aceptar-carga.html).';
comment on column transportistas.codigo_bolsa is
  'Su codigo de socio en esa bolsa. Si hay codigo tiene que haber bolsa.';

create index idx_transportistas_bolsa on transportistas (bolsa, codigo_bolsa)
  where codigo_bolsa is not null;


-- =====================================================================================
-- 3. PRONTO PAGO POR TRANSPORTISTA
-- =====================================================================================
-- La línea de pronto pago del panel se enciende o se apaga para todos. Esto permite
-- quitárselo a UNO aunque la línea esté encendida.
alter table transportistas add column pronto_pago boolean not null default true;
comment on column transportistas.pronto_pago is
  'SOLO ADMIN. Si es false, sus ofertas salen siempre sin pronto pago, aunque la '
  'linea general este encendida.';

-- Y se impone donde nace la oferta, no en la pantalla: aunque la app pida pronto pago,
-- a este transportista no se le pone.
create or replace function ofertar_envio(
  p_envio uuid, p_transportista uuid, p_canal text,
  p_precio numeric, p_banda_pct smallint default 10, p_pronto_pago boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_estado estado_envio; v_asig estado_asignacion; v_pp boolean;
begin
  if not (es_admin() or es_servidor()) then
    raise exception 'Solo Dynamo puede ofertar cargas.' using errcode = '42501';
  end if;
  select estado, estado_asignacion into v_estado, v_asig
    from envios where id = p_envio for update;
  if v_estado is null then raise exception 'El envio % no existe.', p_envio; end if;
  if v_estado <> 'programado' then
    raise exception 'Solo se ofertan envios programados (este esta en %).', v_estado;
  end if;
  if v_asig = 'confirmada' then
    raise exception 'El envio ya tiene transportista asignado.';
  end if;
  if p_transportista is not null and exists (
       select 1 from transportistas where id = p_transportista
       and estado_operativo <> 'activo') then
    raise exception 'Ese transportista no esta activo para ofertar.';
  end if;

  v_pp := p_pronto_pago and coalesce(
            (select pronto_pago from transportistas where id = p_transportista), true);

  insert into envio_ofertas (envio_id, transportista_id, canal, precio_ofertado,
                             banda_pct, pronto_pago, caduca_en)
  values (p_envio, p_transportista, p_canal, p_precio, p_banda_pct, v_pp,
          now() + make_interval(days => (parametro('oferta_dias_caducidad'))::int))
  returning id into v_id;

  perform set_config('dynamo.primera_oferta', 'on', true);
  update envios set estado_asignacion = case when estado_asignacion = 'sin_asignar'
                                             then 'ofertada'::estado_asignacion
                                             else estado_asignacion end
   where id = p_envio;
  perform set_config('dynamo.primera_oferta', '', true);

  perform registrar_hito(p_envio, 'ofertado', null, v_id,
    jsonb_build_object('transportista_id', p_transportista, 'canal', p_canal,
                       'precio', p_precio, 'banda_pct', p_banda_pct, 'pronto_pago', v_pp));
  return v_id;
end $$;

-- `create or replace` conserva los permisos, pero se reafirman por si acaso.
revoke execute on function ofertar_envio(uuid, uuid, text, numeric, smallint, boolean)
  from public, anon;
