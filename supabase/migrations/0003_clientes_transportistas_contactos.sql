-- =====================================================================================
-- 0003 — CLIENTES, TRANSPORTISTAS Y CONTACTOS
-- =====================================================================================
-- Origen: dy_clientes_hoja (44 col) y dy_transportistas_hoja (34 col) del Sheet.
--
-- Fuera, por calculados o por ser apaños de Sheets:
--   *_concatenar                          → es un JOIN
--   validaciones_descripcion              → ahora es el tipo + CHECK + COMMENT
--   cliente_numero_viajes / _transportes / _km_recorridos / _ratio_incidencias /
--   _numero_paraliazaciones / _numero_cancelaciones / transportista_numero_* 
--                                         → vistas materializadas (migración 0011)
--
-- Dentro, nuevo: las columnas que exige la importación de Holded y que no estaban
-- (forma_pago_holded_id, cuenta_contable, recargo_equivalencia, moneda, pais_codigo_iso).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Normalizador de CIF/NIF — la base de la regla 10 (altas sin duplicados)
-- -------------------------------------------------------------------------------------
-- "B-04824686", "b04824686" y "B04824686 " son el MISMO CIF. Si el UNIQUE va sobre el
-- texto tal cual, entran los tres y tienes la misma empresa tres veces → facturación
-- partida y líos contables, que es justo lo que la regla 10 quiere evitar.
create or replace function normaliza_id_fiscal(p text)
returns text language sql immutable strict as $$
  select upper(regexp_replace(p, '[^A-Za-z0-9]', '', 'g'))
$$;

comment on function normaliza_id_fiscal(text) is
  'Quita guiones, puntos y espacios y pasa a mayusculas. Base del UNIQUE de la regla 10.';


-- =====================================================================================
-- CLIENTES
-- =====================================================================================
create table clientes (
  id                      uuid primary key default gen_random_uuid(),
  codigo                  text not null unique
                            default ('C-' || nextval('seq_cliente_codigo')),

  -- ---- Identidad -------------------------------------------------------------------
  nombre                  text not null check (length(trim(nombre)) > 0),
  cif                     text not null,

  -- ---- Fiscal / Holded (columnas 1:1 con la plantilla de importación) --------------
  direccion               text,
  poblacion               text,
  codigo_postal           text,          -- TEXTO SIEMPRE: '08185' como número sería 8185
  provincia               text,
  pais                    text default 'España',
  pais_codigo_iso         char(2) default 'ES' check (pais_codigo_iso ~ '^[A-Z]{2}$'),
  iva_porcentaje          numeric(5,2) not null default 21.00
                            check (iva_porcentaje >= 0 and iva_porcentaje <= 100),
  retencion_porcentaje    numeric(5,2) not null default 0
                            check (retencion_porcentaje >= 0 and retencion_porcentaje <= 100),
  recargo_equivalencia_porcentaje numeric(5,2) not null default 0,
  forma_pago_holded_id    text,
  cuenta_contable         text,
  moneda                  char(3) not null default 'EUR',
  tags                    text[] not null default '{}',

  -- ---- Condiciones de pago ---------------------------------------------------------
  plazo_pago_dias         integer not null default 60
                            check (plazo_pago_dias in (0, 30, 60, 90)),

  -- ---- Comercial -------------------------------------------------------------------
  -- Del diccionario del Sheet: "si admite precios superior o inferior poder ajustar
  -- segun tipologia cliente: +-3%". El panel usa un slider -30/+30 con default -7%
  -- (captación). Decisión del usuario 2026-10-07: manda el -30/+30, editable.
  factor_tarifa_porcentaje numeric(5,2) not null default -7.00
                            check (factor_tarifa_porcentaje between -30 and 30),

  -- Del diccionario: "si paga muy tarde aplicar recargo %". NO estaba en el panel.
  recargo_pago_tarde_porcentaje numeric(5,2) not null default 0
                            check (recargo_pago_tarde_porcentaje between 0 and 100),

  -- Del diccionario, regla completa: si es TRUE se añade al precio la coletilla
  -- "En caso que la tarifa no le encaje, contraoferte su tarifa objetivo, pero no
  -- aseguramos tener disponibilidad". Si es FALSE, no se añade.
  -- El texto vive en la tabla `plantillas` (migración 0010), no aquí.
  permite_contraoferta    boolean not null default false,

  discrecion_comercial    boolean not null default false,

  -- ---- Riesgo / crédito ------------------------------------------------------------
  -- Decisión del usuario 2026-10-07: son DOS cosas distintas.
  --   - el que concede CESCE
  --   - el manual de Dynamo, que MANDA sobre el de CESCE
  --   - si el manual está VACÍO, manda el de CESCE
  -- Eso es exactamente un COALESCE, así que el efectivo es una columna GENERADA: no se
  -- puede desincronizar ni hay que acordarse de recalcularla.
  riesgo_cesce_euros      numeric(12,2) check (riesgo_cesce_euros >= 0),
  riesgo_cesce_plazo_dias integer       check (riesgo_cesce_plazo_dias >= 0),
  riesgo_manual_euros     numeric(12,2) check (riesgo_manual_euros >= 0),
  riesgo_efectivo_euros   numeric(12,2)
                            generated always as
                            (coalesce(riesgo_manual_euros, riesgo_cesce_euros)) stored,

  -- ---- Valores por defecto del cliente (los arrastra el formulario de nuevo envío) --
  tipo_camion_defecto     tipo_camion,
  forma_carga_defecto     forma_carga,
  plataforma_elevadora_defecto boolean not null default false,
  tipo_mercancia_defecto  text,
  descripcion_mercancia_defecto text,
  urgencia_defecto_dias   integer check (urgencia_defecto_dias between 0 and 30),
  -- lugar_defecto_id se añade en 0005, cuando exista la tabla `lugares`.

  -- ---- Estado ----------------------------------------------------------------------
  estado                  estado_cuenta not null default 'activa',
  verificado              boolean not null default false,
  verificado_en           timestamptz,
  verificado_nota         text,          -- a mano hoy; VIES/AEAT cuando se automatice
  anotaciones             text,

  -- ---- Regla 12 --------------------------------------------------------------------
  creado_en               timestamptz not null default now(),
  creado_por              uuid references auth.users(id) on delete set null,
  modificado_en           timestamptz,
  modificado_por          uuid references auth.users(id) on delete set null
);

-- REGLA 10: un CIF no puede estar dos veces como cliente.
create unique index ux_clientes_cif on clientes (normaliza_id_fiscal(cif));
comment on index ux_clientes_cif is
  'Regla 10: CIF/NIF unico entre clientes. El mismo CIF SI puede ser ademas '
  'transportista (tablas y roles distintos), pero nunca dos veces cliente.';

create index idx_clientes_nombre on clientes using gin (to_tsvector('spanish', nombre));
create index idx_clientes_estado on clientes (estado);

comment on column clientes.codigo is 'Codigo legible tipo C-10042, para hablar por telefono. El id uuid es el que usan las FK.';
comment on column clientes.factor_tarifa_porcentaje is
  'SOLO ADMIN. El cliente NUNCA ve este campo. Default -7% (captacion). Se CONGELA en '
  'cada envio: el envio de hoy se cobro con el factor de hoy aunque manana cambie.';
comment on column clientes.riesgo_efectivo_euros is
  'Generada: coalesce(manual, cesce). El manual manda; si esta vacio manda CESCE.';

select activar_rastro('clientes');


-- =====================================================================================
-- TRANSPORTISTAS  (los "proveedores")
-- =====================================================================================
create table transportistas (
  id                      uuid primary key default gen_random_uuid(),
  codigo                  text not null unique
                            default ('T-' || nextval('seq_transportista_codigo')),

  nombre                  text not null check (length(trim(nombre)) > 0),
  cif                     text not null,

  -- ---- Fiscal / Holded -------------------------------------------------------------
  direccion               text,
  poblacion               text,
  codigo_postal           text,
  provincia               text,
  pais                    text default 'España',
  pais_codigo_iso         char(2) default 'ES' check (pais_codigo_iso ~ '^[A-Z]{2}$'),
  iva_porcentaje          numeric(5,2) not null default 21.00,
  retencion_porcentaje    numeric(5,2) not null default 0,
  forma_pago_holded_id    text,
  cuenta_contable         text,
  moneda                  char(3) not null default 'EUR',
  tags                    text[] not null default '{}',
  plazo_pago_dias         integer not null default 60
                            check (plazo_pago_dias in (0, 30, 60, 90)),

  -- ---- Operativa -------------------------------------------------------------------
  nima                    text,          -- del transportista, NO del cliente (2026-08-07)
  wtransnet_codigo        text,          -- código de socio en la bolsa de carga
  almacen_logistico       boolean not null default false,
  tipo_camion_defecto     tipo_camion,
  seguro_cmr_compania     text,
  seguro_cmr_poliza       text,
  seguro_cmr_vence        date,

  -- ---- Interno (NUNCA visible al rol transportista) --------------------------------
  estado_operativo        estado_operativo_transportista not null default 'activo',
  valoracion_dynamo       numeric(2,1) check (valoracion_dynamo between 0 and 5),
  valoracion_dynamo_votos integer not null default 0,
  incidencias_notas       text,
  anotaciones             text,

  -- ---- Regla 12 --------------------------------------------------------------------
  creado_en               timestamptz not null default now(),
  creado_por              uuid references auth.users(id) on delete set null,
  modificado_en           timestamptz,
  modificado_por          uuid references auth.users(id) on delete set null
);

-- REGLA 10: un CIF no puede estar dos veces como transportista.
create unique index ux_transportistas_cif on transportistas (normaliza_id_fiscal(cif));

create index idx_transportistas_nombre on transportistas using gin (to_tsvector('spanish', nombre));
create index idx_transportistas_estado on transportistas (estado_operativo);
-- Para el aviso de "a este le caduca el seguro antes de darle la carga":
create index idx_transportistas_seguro on transportistas (seguro_cmr_vence)
  where seguro_cmr_vence is not null;

comment on column transportistas.estado_operativo is
  'SOLO ADMIN: el transportista NUNCA ve su propio estado operativo (regla del panel).';
comment on column transportistas.valoracion_dynamo is
  'SOLO ADMIN: puntuacion interna de Dynamo. El transportista no la ve.';
comment on column transportistas.nima is
  'El NIMA es del TRANSPORTISTA, no del cliente ni del envio (decision 2026-08-07): lo '
  'aporta al aceptar la carga. En el Sheet venia de polizon dentro de '
  'matriculas_autorizadas ("... .-- NIMA: 5000113855").';

select activar_rastro('transportistas');


-- =====================================================================================
-- CONTACTOS  (1-N)
-- =====================================================================================
-- Sustituye a los pares persona_contacto_1/2 + telefono_1/2 + email_1/2 de las hojas
-- de clientes, transportistas y lugares.
--
-- Por qué: dos huecos fijos no dan para algo que no tiene número fijo. Prueba del
-- propio Sheet, en un campo declarado `max_length:80`:
--   "pedro.pedreira@abclogistic.es, fatima.castanedo@abclogistic.es,
--    daniel.cacicedo@abclogistic.es, barbara.gomez@abclogistic.es,
--    ignacio.gimenez@abclogistic.es, angela.velez@abclogistic.es"
-- Seis emails en una celda.
--
-- OJO: un CONTACTO no es un USUARIO. El 90% de estos (trafico@cointrans.es) nunca
-- entrará al portal. `usuario_id` es opcional y es el puente entre las dos cosas
-- (la tabla `usuarios` llega en 0004).
create table contactos (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique
                      default ('CT-' || nextval('seq_contacto_codigo')),

  -- Dueño del contacto. Se usan FK reales y no una pareja (tipo, id) polimórfica:
  -- la FK polimórfica no la puede comprobar la base de datos, así que acabas con
  -- contactos huérfanos apuntando a empresas borradas.
  cliente_id        uuid references clientes(id)       on delete cascade,
  transportista_id  uuid references transportistas(id) on delete cascade,
  -- lugar_id se añade en 0005.

  nombre            text,
  funcion           funcion_contacto not null default 'general',
  telefono          text check (telefono is null or telefono ~ '^\+?[0-9]{6,15}$'),
  tiene_whatsapp    boolean not null default false,
  email             text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  es_principal      boolean not null default false,
  notas             text,
  usuario_id        uuid,    -- FK a usuarios en 0004. Opcional: casi ninguno tiene login.

  creado_en         timestamptz not null default now(),
  creado_por        uuid references auth.users(id) on delete set null,
  modificado_en     timestamptz,
  modificado_por    uuid references auth.users(id) on delete set null,

  -- Exactamente UN dueño. En 0005 se sustituye por la versión con lugar_id.
  constraint ck_contactos_un_dueno check (
    (cliente_id is not null)::int + (transportista_id is not null)::int = 1
  ),
  -- Un contacto sirve para algo: o teléfono o email.
  constraint ck_contactos_algun_canal check (telefono is not null or email is not null)
);

create index idx_contactos_cliente       on contactos (cliente_id)       where cliente_id is not null;
create index idx_contactos_transportista on contactos (transportista_id) where transportista_id is not null;
create index idx_contactos_email         on contactos (lower(email))     where email is not null;
create index idx_contactos_funcion       on contactos (funcion);

-- Un solo contacto principal por empresa y función.
create unique index ux_contactos_principal_cliente
  on contactos (cliente_id, funcion) where es_principal and cliente_id is not null;
create unique index ux_contactos_principal_transportista
  on contactos (transportista_id, funcion) where es_principal and transportista_id is not null;

comment on column contactos.funcion is
  'trafico | contabilidad | conductor | general. Importa: la regla del panel dice que '
  'el email de CONTABILIDAD del transportista NO se usa para la operativa de cargas '
  '(para eso solo el de trafico), y que el rol transportista no lo ve.';
comment on column contactos.telefono is
  'El regex del Sheet era ^\+34\d{9}$ y rechazaba a los transportistas de PL/IT/PT y a '
  'los conductores extranjeros que YA estan en la hoja. Relajado a E.164.';

select activar_rastro('contactos');


-- =====================================================================================
-- COMPROBACIÓN
-- =====================================================================================
-- Debe devolver 0 filas. Si devuelve alguna, falta un activar_rastro().
-- select * from v_tablas_sin_rastro;
