-- =====================================================================================
-- ENVÍOS MANUALES: el cliente con SU propio transportista (v1.0, usuario 2026-11-02)
-- =====================================================================================
-- La sección "Operadores de transporte" del panel: cada cliente tiene un catálogo
-- PRIVADO de sus transportistas de confianza (empresas o autónomos). Si en Nuevo envío
-- elige uno de ellos en vez de Dynamo, el envío es MANUAL: Dynamo no interviene en nada,
-- y la plataforma solo le sirve para organizarse y sacar la orden de transporte en PDF
-- (sin ninguna mención a Dynamo).
--
-- Decisión de julio (bitácora 2026-07-17): MISMA tabla `envios` para los dos tipos,
-- nunca dos tablas. Aquí: `envios.operador_id` null = envío de Dynamo; con valor =
-- envío manual con ese operador.
-- =====================================================================================


-- =====================================================================================
-- 1. EL CATÁLOGO DE OPERADORES DE CADA CLIENTE
-- =====================================================================================
-- OJO: NO es la tabla `transportistas`. Esa es la red de Dynamo (con su estado interno,
-- su valoración, sus ofertas). Un operador es un contacto PRIVADO del cliente: Dynamo
-- no lo usa para nada ni lo mezcla con su red.
create table operadores (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references clientes(id) on delete restrict,

  razon_social    text not null check (length(trim(razon_social)) > 0),
  cif             text not null,
  telefono        text check (telefono is null or telefono ~ '^\+?[0-9]{6,15}$'),
  email           text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  persona_contacto text,
  web             text,
  logo_url        text,           -- el logo que el cliente sube para su orden de transporte
  anotaciones     text,

  -- Borrado suave, como los sitios: los envíos ya hechos con él no pierden a quién se dieron.
  borrado         boolean not null default false,
  borrado_en      timestamptz,

  creado_en       timestamptz not null default now(),
  creado_por      uuid references auth.users(id) on delete set null,
  modificado_en   timestamptz,
  modificado_por  uuid references auth.users(id) on delete set null,

  constraint ck_operadores_borrado check (
    (borrado and borrado_en is not null) or (not borrado and borrado_en is null)
  )
);

-- Regla 10 dentro de cada cliente: el mismo CIF no puede estar dos veces en SU catálogo.
create unique index ux_operadores_cliente_cif
  on operadores (cliente_id, normaliza_id_fiscal(cif)) where not borrado;
create index idx_operadores_cliente on operadores (cliente_id) where not borrado;

comment on table operadores is
  'Catalogo PRIVADO de transportistas de cada cliente (seccion "Operadores de transporte"). '
  'No es la red de Dynamo (`transportistas`): Dynamo no los usa ni los mezcla.';

select activar_rastro('operadores');
alter table operadores enable row level security;

-- Si lo crea un cliente, es suyo aunque la app no lo diga.
create or replace function fn_operadores_dueno()
returns trigger language plpgsql as $$
begin
  if new.cliente_id is null then new.cliente_id := cliente_del_usuario(); end if;
  return new;
end $$;
create trigger tg_operadores_dueno before insert on operadores
  for each row execute function fn_operadores_dueno();

-- Cada cliente ve y gestiona SOLO su catálogo (también sus borrados: el borrado suave es
-- un UPDATE y Postgres exige que la fila siga visible; el panel filtra `borrado = false`).
create policy operadores_sel on operadores for select
  using (es_admin() or cliente_id = cliente_del_usuario());
create policy operadores_ins on operadores for insert
  with check (es_admin() or cliente_id = cliente_del_usuario());
create policy operadores_upd on operadores for update
  using      (es_admin() or cliente_id = cliente_del_usuario())
  with check (es_admin() or cliente_id = cliente_del_usuario());
create policy operadores_del on operadores for delete using (es_admin());


-- =====================================================================================
-- 2. EL ENVÍO MANUAL
-- =====================================================================================
alter table envios add column operador_id uuid references operadores(id) on delete restrict;
alter table envios add column precio_acordado_operador numeric(12,2)
  check (precio_acordado_operador is null or precio_acordado_operador >= 0);
alter table envios add column es_manual boolean
  generated always as (operador_id is not null) stored;

comment on column envios.operador_id is
  'null = envio de DYNAMO. Con valor = envio MANUAL con ese operador del cliente: Dynamo '
  'no interviene (sin ofertas, sin transportista de Dynamo, sin precio de Dynamo).';
comment on column envios.precio_acordado_operador is
  'Solo envios manuales. Lo que el cliente ha pactado con SU transportista, sin IVA. '
  'Opcional. Sale en la orden de transporte del cliente.';

create index idx_envios_operador on envios (operador_id) where operador_id is not null;

-- Lo que un envío manual NO puede tener, porque Dynamo no interviene:
alter table envios add constraint ck_envios_manual_sin_dynamo check (
  operador_id is null
  or (transportista_id is null and importe_transportista is null and importe_cliente is null)
);
-- Y el precio acordado solo existe en los manuales.
alter table envios add constraint ck_envios_precio_operador_solo_manual check (
  precio_acordado_operador is null or operador_id is not null
);

-- El operador tiene que ser del catálogo del MISMO cliente del envío.
create or replace function fn_envios_operador_del_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.operador_id is not null and not exists (
       select 1 from operadores where id = new.operador_id and cliente_id = new.cliente_id) then
    raise exception 'Ese operador no esta en el catalogo de este cliente.';
  end if;
  return new;
end $$;
create trigger tg_envios_operador_del_cliente
  before insert or update of operador_id, cliente_id on envios
  for each row execute function fn_envios_operador_del_cliente();


-- =====================================================================================
-- 3. LO DE DYNAMO NO SE APLICA A UN ENVÍO MANUAL
-- =====================================================================================
-- a) Las zonas donde Dynamo no da servicio (0009) son de DYNAMO. El transportista del
--    cliente puede ir a Suiza si quiere: solo se mira la estructura de la ruta.
create or replace function fn_envios_validar_al_confirmar()
returns trigger language plpgsql as $$
begin
  if old.estado = 'borrador' and new.estado <> 'borrador' then
    perform validar_ruta_envio(new.id);                -- estructura (0007): siempre
    if new.operador_id is null then
      perform validar_restricciones_envio(new.id);     -- restricciones (0009): solo Dynamo
    end if;
  end if;
  return new;
end $$;

create or replace function fn_paradas_restriccion_al_anadir()
returns trigger language plpgsql as $$
declare
  v_estado estado_envio;
  v_r      record;
  v_carga  tipo_carga;
  v_manual boolean;
begin
  select estado, tipo_carga, operador_id is not null
    into v_estado, v_carga, v_manual from envios where id = new.envio_id;

  if v_estado is null or v_estado in ('borrador', 'entregado', 'cancelado') or v_manual then
    return new;   -- borrador: se mira al confirmar · terminados: historia · manual: no es de Dynamo
  end if;

  for v_r in
    select * from fn_restriccion_punto(new.pais_codigo_iso, new.cp, new.tipo, v_carga)
  loop
    if v_r.efecto = 'bloquea'
       or (v_r.efecto = 'solo_admin' and not es_admin()) then
      raise exception 'No se puede anadir esta parada (% en %): %',
        new.tipo, coalesce(new.nombre_empresa, new.poblacion, new.cp, '?'), v_r.mensaje;
    end if;
  end loop;
  return new;
end $$;

-- b) Un envío manual no se oferta a la red de Dynamo ni se reserva.
create or replace function fn_ofertas_no_manual()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from envios where id = new.envio_id and operador_id is not null) then
    raise exception 'Es un envio manual del cliente: Dynamo no lo oferta.';
  end if;
  return new;
end $$;
create trigger tg_ofertas_no_manual before insert on envio_ofertas
  for each row execute function fn_ofertas_no_manual();

create or replace function fn_reservas_no_manual()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from envios where id = new.envio_id and operador_id is not null) then
    raise exception 'Es un envio manual del cliente: no se reserva.';
  end if;
  return new;
end $$;
create trigger tg_reservas_no_manual before insert on envio_reservas
  for each row execute function fn_reservas_no_manual();

-- c) Sin PIN (v3): el control de identidad en el muelle es un servicio de Dynamo.
create or replace function preparar_pines_envio(p_envio uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if exists (select 1 from envios where id = p_envio and operador_id is not null) then
    return 0;
  end if;
  insert into envio_parada_pines (parada_id, envio_id, pin)
  select p.id, p.envio_id, pin_aleatorio((parametro('pin_cifras'))::int)
    from envio_paradas p
    join envios   e on e.id = p.envio_id
    join clientes c on c.id = e.cliente_id
    left join lugares l on l.id = p.lugar_id
   where p.envio_id = p_envio
     and (c.exige_pin or coalesce(l.exige_pin, false))
     and not exists (select 1 from envio_parada_pines x where x.parada_id = p.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function preparar_pines_envio(uuid) from public, anon, authenticated;


-- =====================================================================================
-- 4. LA VISTA DEL CLIENTE ENSEÑA SU OPERADOR Y SU PRECIO ACORDADO
-- =====================================================================================
drop view v_envios_cliente;
create view v_envios_cliente with (security_invoker = true) as
select e.id, e.referencia_gx, e.referencia_cliente, e.cliente_id, e.estado,
       e.estado_asignacion, e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real,
       e.fecha_entrega_estimada, e.descripcion_mercancia, e.toneladas, e.metros_lineales,
       e.tipo_carga, e.paletizado, e.carga_lateral, e.carga_superior, e.carga_trasera,
       e.plataforma_elevadora, e.nima_requerido, e.adr,
       e.cp_origen, e.poblacion_origen, e.cp_destino, e.poblacion_destino, e.num_paradas,
       e.importe_cliente, e.moneda, e.anotaciones_cliente, e.creado_en, e.modificado_en,
       e.confirmado_en, e.asignado_en, e.cargado_en, e.entregado_en, e.cancelado_en,
       e.es_manual, e.operador_id, e.precio_acordado_operador,
       e.matricula_camion, e.matricula_remolque,
       case when e.estado in ('entregado','cancelado') then null
            else e.conductor_nombre end   as conductor_nombre,
       case when e.estado in ('entregado','cancelado') then null
            else e.conductor_telefono end as conductor_telefono
       -- NUNCA: importe_transportista, margen_euros, factor_tarifa_aplicado,
       --        transportista_id, transportista_nima, precio_fijado_a_mano,
       --        primera_oferta_en
from envios e;

comment on view v_envios_cliente is
  'Vista del rol CLIENTE. Regla 11 y sin datos internos de Dynamo. En los envios manuales '
  'ensena su operador y el precio que pacto con el.';

-- v_envios_con_paradas lleva `e.*` congelado al crearse: se rehace para que recoja las
-- columnas nuevas (operador_id, precio_acordado_operador, es_manual).
drop view v_envios_con_paradas;
create view v_envios_con_paradas with (security_invoker = true) as
select e.*,
       (select jsonb_agg(jsonb_build_object(
                 'id', p.id, 'orden', p.orden, 'tipo', p.tipo,
                 'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion,
                 'cp', p.cp, 'poblacion', p.poblacion, 'provincia', p.provincia,
                 'pais', p.pais_codigo_iso, 'lat', p.lat, 'lon', p.lon,
                 'fecha_desde', p.fecha_desde, 'fecha_hasta', p.fecha_hasta,
                 'hora_real', p.hora_real, 'referencia', p.referencia,
                 'observaciones', p.observaciones, 'km_hasta_siguiente', p.km_hasta_siguiente)
                 order by p.orden)
        from envio_paradas p where p.envio_id = e.id) as paradas
from envios e;
comment on view v_envios_con_paradas is 'Un envio con sus paradas ya ordenadas por `orden`.';
