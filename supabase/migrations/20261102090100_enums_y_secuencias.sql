-- =====================================================================================
-- 0001 — ENUMS, CATÁLOGOS Y SECUENCIAS DE CÓDIGO
-- =====================================================================================
-- Va primero porque todo lo demás lo referencia.
-- Listas tomadas del diccionario del Sheet IA-DYNAMO-2030 y del panel (dashboard.html).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- LUGARES
-- Lista DEFINITIVA = la del panel (decisión del usuario 2026-10-07), no la del Sheet.
-- -------------------------------------------------------------------------------------
create type tipo_lugar as enum (
  'almacen_nave',   -- Almacén / Nave      (recargo 0%)
  'obra',           -- Obra                (+5%)
  'evento',         -- Evento              (+15%)
  'zona_urbana',    -- Zona urbana         (+20%)
  'finca'           -- Finca / Agrícola    (+25%)
);
comment on type tipo_lugar is
  'Tipo de punto de carga/descarga. De aquí cuelga el recargo del tarifador: ver recargos_tipo_lugar.';

-- El recargo es un CATÁLOGO CON VIGENCIA, no una constante en el código: cambia con el
-- tiempo y el envío de ayer tiene que seguir recalculándose con el porcentaje de ayer.
create table recargos_tipo_lugar (
  tipo             tipo_lugar  not null,
  porcentaje       numeric(5,2) not null check (porcentaje >= 0 and porcentaje <= 100),
  vigente_desde    date        not null default current_date,
  vigente_hasta    date,
  primary key (tipo, vigente_desde),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

insert into recargos_tipo_lugar (tipo, porcentaje, vigente_desde) values
  ('almacen_nave',  0.00, '2026-01-01'),
  ('obra',          5.00, '2026-01-01'),
  ('evento',       15.00, '2026-01-01'),
  ('zona_urbana',  20.00, '2026-01-01'),
  ('finca',        25.00, '2026-01-01');

-- -------------------------------------------------------------------------------------
-- VEHÍCULO Y CARGA
-- -------------------------------------------------------------------------------------
create type tipo_camion as enum (
  'trailer_tauliner',   -- 13,30 m · 2,40 m · 2,70 m · 24 Tn · 33 europalés (regla 0-quinquies)
  'rigido_plataforma'   --  8,00 m · 2,40 m · 2,40 m · 14 Tn · 20 europalés
);

create type tipo_vehiculo as enum ('tractora', 'remolque', 'rigido');

create type tipo_carga as enum ('completa', 'grupaje');

create type forma_carga as enum (
  'paletizado_lateral',      -- Paletizado (por lateral)
  'no_paletizada_lateral',   -- No paletizada, lateral
  'no_paletizada_techo'      -- No paletizada por TECHO
);

-- -------------------------------------------------------------------------------------
-- ENVÍO
-- -------------------------------------------------------------------------------------
create type estado_envio as enum (
  'borrador',        -- creado pero no confirmado
  'programado',      -- confirmado, esperando fecha
  'hacia_la_carga',  -- el camión va hacia el origen
  'cargando',
  'en_ruta',
  'entregado',
  'cancelado'
);
comment on type estado_envio is
  'Ciclo de vida del envío. OJO: "Pendiente asignar" y "Retrasada" NO son estados: se '
  'derivan de (estado = programado AND transportista_id IS NULL AND fecha_carga < hoy). '
  'Guardarlos como estado los desincroniza con el calendario.';

create type estado_asignacion as enum (
  'sin_asignar',     -- nadie todavía
  'ofertada',        -- enviada a transportistas, sin respuesta
  'reservada',       -- un transportista tiene la reserva viva (3 min)
  'confirmada'       -- transportista asignado
);

-- Concepto de la LÍNEA del pedido. Rellena la columna "Concepto" de las plantillas de
-- importación de Holded (dy_holded_pedido_venta / _compra). No es facturación: la
-- facturación entera vive en Holded; aquí solo salen los pedidos de venta y de compra.
create type tipo_concepto as enum (
  'porte',
  'almacenaje',
  'paralizacion',
  'penalizacion',
  'otros'
);

-- -------------------------------------------------------------------------------------
-- TICKETS / INCIDENCIAS — lista literal del diccionario del Sheet
-- -------------------------------------------------------------------------------------
create type tipo_ticket as enum (
  'incidencia_transporte',
  'cancelacion_transporte',
  'cambio_fecha_hora_carga',
  'facturacion_consulta',
  'pago_consulta'
);

create type estado_ticket    as enum ('abierto', 'en_curso', 'resuelto', 'cancelado');
create type prioridad_ticket as enum ('baja', 'media', 'alta', 'critica');

-- -------------------------------------------------------------------------------------
-- PERSONAS Y CUENTAS
-- -------------------------------------------------------------------------------------
create type rol_usuario as enum ('admin', 'empleado', 'cliente', 'transportista');

create type estado_cuenta as enum ('activa', 'suspendida', 'pendiente_verificacion');

-- Función del contacto dentro de la empresa. Sustituye a los pares persona_contacto_1/2.
-- 'trafico' y 'contabilidad' son distintos a propósito: la regla del panel dice que el
-- email de contabilidad del transportista NO se usa para la operativa de cargas.
create type funcion_contacto as enum ('trafico', 'contabilidad', 'conductor', 'general');

create type tipo_entidad as enum ('cliente', 'transportista', 'lugar');

create type estado_operativo_transportista as enum (
  'activo',          -- se le puede ofertar
  'no_ofertar',      -- activo pero no se le ofrecen cargas
  'suspendido'
);

-- -------------------------------------------------------------------------------------
-- SECUENCIAS DE CÓDIGO LEGIBLE
-- -------------------------------------------------------------------------------------
-- Cada tabla lleva un `id uuid` interno (para las FK, estable y no adivinable) Y un
-- `codigo` legible con prefijo (para hablar por teléfono: "el cliente C-10042").
-- Las dos cosas, no una.

create sequence seq_cliente_codigo       start 10000;
create sequence seq_transportista_codigo start 10000;
create sequence seq_lugar_codigo         start 10000;
create sequence seq_lugar_nota_codigo    start 10000;
create sequence seq_contacto_codigo      start 10000;
create sequence seq_vehiculo_codigo      start 10000;
create sequence seq_conductor_codigo     start 10000;
create sequence seq_almacenamiento_codigo start 100000;
create sequence seq_penalizacion_codigo  start 10000;

-- ===== LA REFERENCIA GX =====
-- Del diccionario del Sheet, literal:
--   "formato: texto | alfanumerico | longitud_fija: 11"
--   "El primer referencia de carga comenzó en el GX100888689."
--   "El incremento entre una referencia y la siguiente es SIEMPRE +7."
-- Se implementa como SECUENCIA, nunca como MAX(ref)+7 desde la aplicación: con dos
-- envíos simultáneos, los dos leerían el mismo máximo y colisionarían.
create sequence seq_gx start 100888689 increment by 7;

-- ⚠️ AL MIGRAR EL SHEET: la secuencia arranca en el PRIMER GX que existió, así que
-- después de cargar los envíos históricos hay que empujarla por delante del último,
-- o los GX nuevos chocarían con los viejos:
--     select setval('seq_gx', (select max(substring(codigo from 3)::bigint) from envios));
-- (el siguiente nextval ya devuelve ese valor + 7)
comment on sequence seq_gx is
  'Referencia GX: GX + 9 digitos = 11 caracteres. Paso fijo +7 (regla del negocio). '
  'AVISO DE SEGURIDAD: un correlativo de paso fijo es ENUMERABLE (1 de cada 7 numeros '
  'acierta). El GX NO debe viajar solo en la URL publica de aceptar-carga: ese enlace '
  'necesita ademas un token aleatorio (ver envios.token_publico).';

create sequence seq_ticket_gx start 100888689 increment by 7;
