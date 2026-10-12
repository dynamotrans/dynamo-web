-- =====================================================================================
-- 0005 — LUGARES  (la agenda de sitios de recogida y entrega)
-- =====================================================================================
-- Origen: dy_lugar (18 col) y dy_lugar_anotaciones_cliente (5 col).
--
-- Cambio principal respecto al Sheet: la dirección va PARTIDA. En el Sheet es
-- `direccion_lugar` en una celda y los envíos guardan "08185 Lliçà de Vall" pegado.
-- Partirla es obligatorio para: agrupar por provincia, calcular km, publicar en
-- Wtransnet (que pide CP y localidad por separado) y rellenar Holded.
-- =====================================================================================

create table lugares (
  id                     uuid primary key default gen_random_uuid(),
  codigo                 text not null unique
                           default ('L-' || nextval('seq_lugar_codigo')),

  nombre_empresa         text not null check (length(trim(nombre_empresa)) > 0),
  cif                    text,          -- opcional: una obra o un evento no tiene CIF
  tipo                   tipo_lugar not null default 'almacen_nave',

  -- ---- Dirección partida -----------------------------------------------------------
  calle                  text,          -- calle y número, SOLO eso
  codigo_postal          text,          -- TEXTO: '08185' como numero seria 8185.
  poblacion              text,
  provincia              text,
  pais                   text default 'España',
  pais_codigo_iso        char(2) default 'ES' check (pais_codigo_iso ~ '^[A-Z]{2}$'),
  -- Coordenadas de la geocodificación, para no volver a llamar a Nominatim cada vez.
  lat                    numeric(9,6) check (lat is null or lat between  -90 and  90),
  lon                    numeric(9,6) check (lon is null or lon between -180 and 180),

  horarios               text,          -- campo de texto libre (decision del usuario 2026-08-07)
  url_google_maps        text,
  anotaciones_generales  text,

  -- ---- Almacenes Dynamo ------------------------------------------------------------
  es_almacen_dynamo      boolean not null default false,
  -- El toggle "Almacén disponible / Completo" del panel. OJO: completo bloquea
  -- ALMACENAR, no recoger ni entregar (decision del usuario 2026-07-08).
  disponible             boolean not null default true,

  -- Si el lugar es el almacén de un cliente concreto (almacen_cliente_relacionado).
  cliente_propietario_id uuid references clientes(id) on delete set null,

  -- ---- Borrado SUAVE ---------------------------------------------------------------
  -- Nunca se borra de verdad: los envíos ya creados tienen que conservar la dirección
  -- a la que se fue. Borrar solo lo quita de la agenda y del buscador.
  borrado                boolean not null default false,
  borrado_en             timestamptz,

  creado_en              timestamptz not null default now(),
  creado_por             uuid references auth.users(id) on delete set null,
  modificado_en          timestamptz,
  modificado_por         uuid references auth.users(id) on delete set null,

  constraint ck_lugares_borrado check (
    (borrado and borrado_en is not null) or (not borrado and borrado_en is null)
  )
);

create index idx_lugares_cp        on lugares (codigo_postal)  where not borrado;
create index idx_lugares_provincia on lugares (provincia)      where not borrado;
create index idx_lugares_tipo      on lugares (tipo);
create index idx_lugares_dynamo    on lugares (es_almacen_dynamo, disponible)
                                   where es_almacen_dynamo;
create index idx_lugares_cliente   on lugares (cliente_propietario_id)
                                   where cliente_propietario_id is not null;
-- Buscador de la agenda: empresa + calle + población en un solo índice de texto.
create index idx_lugares_busqueda on lugares
  using gin (to_tsvector('spanish',
    coalesce(nombre_empresa,'') || ' ' || coalesce(calle,'') || ' ' || coalesce(poblacion,'')))
  where not borrado;

-- DETECTOR DE DUPLICADOS (regla 10 aplicada a lugares, pero en blando).
-- Aquí NO se puede poner un UNIQUE duro: una misma empresa tiene varias naves, y dos
-- obras distintas pueden llamarse igual. Lo que sí se puede es avisar: mismo nombre
-- normalizado + mismo CP es un duplicado casi seguro. Lo usa el aviso del panel.
create index idx_lugares_posible_duplicado on lugares
  (upper(regexp_replace(nombre_empresa, '[^A-Za-z0-9]', '', 'g')), codigo_postal)
  where not borrado;

comment on column lugares.disponible is
  'Toggle "Almacen disponible/Completo". Completo bloquea crear ALMACENAMIENTOS, pero '
  'el lugar sigue eligiendose como recogida o entrega de un envio.';
comment on column lugares.borrado is
  'Borrado SUAVE. Los envios ya creados conservan su direccion, asi que un lugar nunca '
  'se borra de verdad: solo desaparece de la agenda y del buscador.';
comment on column lugares.codigo_postal is
  'TEXTO siempre. Hay CP no espanoles en la operativa: 2400-016 (PT), 85-453 (PL), '
  'N41 RW27 (IE). Y 08185 como numero perderia el cero.';

select activar_rastro('lugares');


-- =====================================================================================
-- NOTAS PRIVADAS DE UN CLIENTE SOBRE UN LUGAR
-- =====================================================================================
-- Viene de dy_lugar_anotaciones_cliente y es BUEN DISEÑO tal como estaba: el lugar es
-- compartido (varios clientes cargan en la misma nave) pero la nota es privada de cada
-- cliente ("preguntar por Manolo", "entrar por la puerta de atrás").
create table lugar_notas_cliente (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique
                   default ('LA-' || nextval('seq_lugar_nota_codigo')),
  lugar_id       uuid not null references lugares(id)  on delete cascade,
  cliente_id     uuid not null references clientes(id) on delete cascade,
  notas          text not null check (length(trim(notas)) > 0),

  creado_en      timestamptz not null default now(),
  creado_por     uuid references auth.users(id) on delete set null,
  modificado_en  timestamptz,
  modificado_por uuid references auth.users(id) on delete set null,

  -- Una sola nota por cliente y lugar: si escribe otra, se edita la que hay.
  constraint ux_lugar_notas_cliente unique (lugar_id, cliente_id)
);

create index idx_lugar_notas_cliente on lugar_notas_cliente (cliente_id);

comment on table lugar_notas_cliente is
  'Nota PRIVADA de un cliente sobre un lugar compartido. En 0012 (RLS) cada cliente '
  'solo vera las suyas: la nota de un cliente no la puede leer otro.';

select activar_rastro('lugar_notas_cliente');


-- =====================================================================================
-- CIERRE DE LO QUE QUEDÓ PENDIENTE EN 0003
-- =====================================================================================
-- 1) Un contacto también puede pertenecer a un LUGAR (la persona de esa nave).
alter table contactos add column lugar_id uuid references lugares(id) on delete cascade;

alter table contactos drop constraint ck_contactos_un_dueno;
alter table contactos add constraint ck_contactos_un_dueno check (
  (cliente_id is not null)::int
  + (transportista_id is not null)::int
  + (lugar_id is not null)::int = 1
);

create index idx_contactos_lugar on contactos (lugar_id) where lugar_id is not null;
create unique index ux_contactos_principal_lugar
  on contactos (lugar_id, funcion) where es_principal and lugar_id is not null;

-- 2) El almacén por defecto del cliente deja de ser texto y pasa a ser una relación.
--    En el Sheet era `cliente_direccion_defecto_almacen_carga`, texto libre.
alter table clientes add column lugar_defecto_id uuid references lugares(id) on delete set null;

comment on column clientes.lugar_defecto_id is
  'Almacen de carga por defecto del cliente. En el Sheet era texto libre '
  '(cliente_direccion_defecto_almacen_carga); ahora es una relacion real.';
