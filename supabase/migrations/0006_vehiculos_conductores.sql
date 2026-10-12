-- =====================================================================================
-- 0006 — VEHÍCULOS Y CONDUCTORES
-- =====================================================================================
-- Tablas NUEVAS: en el Sheet no existen. Hoy la información vive dentro de la columna
-- `matriculas_autorizadas` de dy_cargas_hoja, con tractora + remolque + NIMA pegados
-- en una celda y seis separadores distintos:
--
--     2547JSV // R0847BDV .-- NIMA: 5000113855
--     6593NNT .-- R3422BDG // NIMA: 0900076810
--     9658-MKH | R-7530-BDV
--     3848 JFJ / R 3506 BCH
--     PO4LE38 / PO7YA52            (matrículas polacas)
--     PENDIENTE ASIGNAR MATRICULA  (texto haciendo de NULL)
--
-- Por qué tabla propia y no dejarlo en el envío: una tractora hace 50 envíos al año,
-- así que en el envío el dato está 50 veces repetido. Y hay datos del vehículo (ITV,
-- seguro, tarjeta de transporte, ADR) que hoy no tienen dónde vivir.
--
-- El ENVÍO, además, guardará su COPIA CONGELADA de la matrícula (migración 0007):
-- un camión se vende y un conductor se va, pero el CMR del año pasado tiene que seguir
-- diciendo la matrícula que realmente cargó.
-- =====================================================================================

-- Normalizador de matrícula: "3848 JFJ", "8221-LXV" y "8221lxv" son la misma.
create or replace function normaliza_matricula(p text)
returns text language sql immutable strict as $$
  select upper(regexp_replace(p, '[^A-Za-z0-9]', '', 'g'))
$$;


-- =====================================================================================
-- VEHÍCULOS
-- =====================================================================================
create table vehiculos (
  id                       uuid primary key default gen_random_uuid(),
  codigo                   text not null unique
                             default ('V-' || nextval('seq_vehiculo_codigo')),

  transportista_id         uuid not null references transportistas(id) on delete cascade,
  matricula                text not null check (length(normaliza_matricula(matricula)) between 4 and 15),
  tipo                     tipo_vehiculo not null,

  -- ---- Documentación: lo que hoy no se puede guardar en ningún sitio ---------------
  itv_vence                date,
  seguro_vence             date,
  tarjeta_transporte_vence date,
  adr                      boolean not null default false,
  trampilla                boolean not null default false,

  activo                   boolean not null default true,
  anotaciones              text,

  creado_en                timestamptz not null default now(),
  creado_por               uuid references auth.users(id) on delete set null,
  modificado_en            timestamptz,
  modificado_por           uuid references auth.users(id) on delete set null
);

-- Una matrícula es única... entre los vehículos ACTIVOS.
-- Es a propósito que el UNIQUE sea parcial: un camión se vende a otro transportista, y
-- con un UNIQUE global no podrías darlo de alta en el nuevo. Así se marca inactivo el
-- viejo y se crea el nuevo, sin bloqueos y sin duplicados vivos.
create unique index ux_vehiculos_matricula_activa
  on vehiculos (normaliza_matricula(matricula)) where activo;

create index idx_vehiculos_transportista on vehiculos (transportista_id) where activo;
create index idx_vehiculos_matricula     on vehiculos (normaliza_matricula(matricula));
create index idx_vehiculos_tipo          on vehiculos (transportista_id, tipo) where activo;

-- Para el aviso de "a este le caduca algo antes de la fecha de carga".
create index idx_vehiculos_itv    on vehiculos (itv_vence)                where activo and itv_vence is not null;
create index idx_vehiculos_seguro on vehiculos (seguro_vence)             where activo and seguro_vence is not null;
create index idx_vehiculos_tarjeta on vehiculos (tarjeta_transporte_vence) where activo and tarjeta_transporte_vence is not null;

comment on table vehiculos is
  'Flota de cada transportista. Sustituye al texto pegado de matriculas_autorizadas.';
comment on index ux_vehiculos_matricula_activa is
  'UNIQUE PARCIAL (solo activos) a proposito: permite que un camion cambie de '
  'transportista marcando el viejo inactivo, sin bloquear el alta.';
comment on column vehiculos.tipo is
  'tractora | remolque | rigido. El par tractora+remolque de cada envio NO se guarda '
  'aqui: se deduce del historico de envios (ver v_pares_vehiculo en 0011), que es lo '
  'que alimenta el autocompletado de aceptar-carga.html.';


-- =====================================================================================
-- CONDUCTORES
-- =====================================================================================
create table conductores (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique
                     default ('CD-' || nextval('seq_conductor_codigo')),

  transportista_id uuid not null references transportistas(id) on delete cascade,
  nombre           text not null check (length(trim(nombre)) > 0),

  -- Documento de identidad: hace falta para FIRMAR EL CMR (firmar-cmr.html ya lo pide
  -- con validación de checksum por país). Es el dato más sensible de todo el esquema.
  documento        text,
  documento_pais   char(2) default 'ES' check (documento_pais ~ '^[A-Z]{2}$'),

  telefono         text check (telefono is null or telefono ~ '^\+?[0-9]{6,15}$'),
  tiene_whatsapp   boolean not null default false,

  activo           boolean not null default true,
  anotaciones      text,

  creado_en        timestamptz not null default now(),
  creado_por       uuid references auth.users(id) on delete set null,
  modificado_en    timestamptz,
  modificado_por   uuid references auth.users(id) on delete set null
);

-- El mismo conductor no se da de alta dos veces en el mismo transportista.
create unique index ux_conductores_documento
  on conductores (transportista_id, normaliza_id_fiscal(documento))
  where documento is not null and activo;

create index idx_conductores_transportista on conductores (transportista_id) where activo;
create index idx_conductores_nombre on conductores
  using gin (to_tsvector('spanish', nombre)) where activo;

comment on column conductores.documento is
  'DATO PERSONAL (RGPD). Necesario para la firma del CMR (valor probatorio). '
  'Al ejercerse el derecho de supresion se ANONIMIZA aqui, y la fila de auditoria NO '
  'se borra (es append-only). Ver el pendiente de RGPD en TODO.md.';
comment on column conductores.telefono is
  'REGLA 11 (anti-desintermediacion): el cliente ve este telefono mientras el envio '
  'esta en curso, y DEJA de verlo cuando pasa a entregado o cancelado. Se impone '
  'server-side en 0012 (RLS), no solo ocultandolo en el front.';

select activar_rastro('vehiculos');
select activar_rastro('conductores');
