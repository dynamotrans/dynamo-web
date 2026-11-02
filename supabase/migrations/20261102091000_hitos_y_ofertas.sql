-- =====================================================================================
-- 0010 — HITOS, OFERTAS, RESERVAS Y PIN DE RECOGIDA/ENTREGA
-- =====================================================================================
-- Lo que convierte la ficha de un envío en algo vivo:
--
--   1. parametros          ajustes de negocio que se cambian SIN tocar tablas
--   2. envio_hitos         cada momento del envío sellado con la hora del SERVIDOR
--                          (regla 12, punto 4). Append-only.
--   3. envio_ofertas       a quién se ofreció la carga, por qué canal, a qué precio y
--                          con qué banda de negociación. Una fila por transportista.
--   4. envio_reservas      el bloqueo de 3 minutos al abrir el enlace (modelo A,
--                          decisión del 2026-07-20) y la aceptación, ATÓMICAS.
--   5. envio_parada_pines  el PIN de cada punto (idea del 2026-10-29, decisiones del
--   + pin_intentos         2026-11-02) y el registro de intentos contra la fuerza bruta.
--
-- ⚠️ QUIÉN LLAMA A QUÉ. Las funciones de la página pública (reservar, aceptar, validar
-- el PIN) NO se pueden llamar desde la API con la clave pública: los transportistas y
-- los conductores no tienen cuenta. Las llama el SERVIDOR (función de Supabase o ruta
-- de la app) con la clave de servicio, después de comprobar lo que haga falta. Así nadie
-- puede saltarse el bloqueo por intentos llamando a la base de datos directamente.
-- =====================================================================================


-- =====================================================================================
-- 0. ¿LA LLAMADA VIENE DEL SERVIDOR?
-- =====================================================================================
-- Dentro de una función SECURITY DEFINER `current_user` es el dueño, así que no sirve
-- para saber quién llama. Se mira:
--   · el rol del token: 'service_role' = la clave de servicio, solo la tiene el servidor;
--   · el rol de la sesión: la API de Supabase SIEMPRE entra con `set role anon` o
--     `set role authenticated`. 'none' significa conexión directa a la base de datos
--     (migraciones, n8n con la cadena de conexión), que ya es acceso de servidor.
create or replace function es_servidor()
returns boolean language sql stable set search_path = public as $$
  select coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) = 'service_role'
      or coalesce(current_setting('role', true), 'none') in ('none', 'service_role', 'postgres')
$$;

comment on function es_servidor() is
  'true si la llamada viene de la clave de servicio o de una conexion directa (no de '
  'la API publica). La API de Supabase siempre entra con set role anon/authenticated.';


-- =====================================================================================
-- 1. PARÁMETROS DE NEGOCIO
-- =====================================================================================
-- Todo lo que el usuario puede querer cambiar mañana vive aquí y no en el código:
-- cambiar "3 minutos" por "5" es un UPDATE, no una migración. La migración de tarifas
-- (0012) añadirá sus propias claves a esta misma tabla.
create table parametros (
  -- `id` además de la clave: fn_auditar() identifica cada registro por su columna id.
  id             uuid primary key default gen_random_uuid(),
  clave          text not null unique check (clave ~ '^[a-z][a-z0-9_]*$'),
  valor          jsonb not null,
  descripcion    text  not null,

  creado_en      timestamptz not null default now(),
  creado_por     uuid references auth.users(id) on delete set null,
  modificado_en  timestamptz,
  modificado_por uuid references auth.users(id) on delete set null
);

select activar_rastro('parametros');
alter table parametros enable row level security;

-- Lectura tipada. Si falta la clave, revienta: un parámetro que no existe es un error
-- de despliegue, no algo que deba resolverse con un valor por defecto escondido.
create or replace function parametro(p_clave text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select valor into v from parametros where clave = p_clave;
  if not found then
    raise exception 'Falta el parametro "%" en la tabla parametros.', p_clave;
  end if;
  return v;
end $$;

insert into parametros (clave, valor, descripcion) values
  ('reserva_minutos', '3',
   'Minutos que dura la reserva de una carga al abrir el enlace (decision 2026-07-20).'),
  ('oferta_dias_caducidad', '7',
   'Dias que vive un enlace de oferta personal antes de caducar.'),
  ('contraoferta_auto_pct', '10',
   'Hasta este % de diferencia con el precio ofertado, la contraoferta la decide el '
   'sistema al instante. Por encima, queda pendiente de revision (banda de 30%).'),
  ('pin_cifras', '4',
   'Cifras del PIN de recogida/entrega. 4: comodo de dictar en el muelle y seguro '
   'gracias al bloqueo por intentos (decision del usuario 2026-11-02).'),
  ('pin_max_intentos', '3',
   'Intentos fallidos antes de bloquear el PIN de un punto. Al bloquearse hay que '
   'llamar a Dynamo, que valida a mano.'),
  ('pin_ventana_horas_antes', 'null',
   'Horas antes de la cita en que el PIN empieza a valer. null = sin limite '
   '(decision del usuario 2026-11-02).'),
  ('pin_ventana_horas_despues', 'null',
   'Horas despues de la cita en que el PIN deja de valer. null = sin limite '
   '(decision del usuario 2026-11-02).'),
  ('pin_orden_obliga', 'false',
   'Si es true, no se puede validar una descarga sin haber validado las cargas '
   'anteriores. false = se deja validar pero queda aviso (decision 2026-11-02).');

create policy parametros_admin on parametros for all
  using (es_admin()) with check (es_admin());


-- =====================================================================================
-- 2. HITOS DEL ENVÍO (append-only)
-- =====================================================================================
create type tipo_hito as enum (
  -- Ciclo de vida del envío (los pone el trigger de `envios`)
  'creado',
  'confirmado',               -- sale de borrador
  'publicado_bolsa',
  'transportista_asignado',
  'transportista_quitado',
  'matricula_asignada',
  'cargado',                  -- pasa a en_ruta
  'entregado',
  'cancelado',
  'cancelacion_deshecha',
  -- Ofertas y reservas (los ponen las funciones de este fichero)
  'ofertado',
  'enlace_abierto',
  'reservado',
  'reserva_caducada',
  'reserva_liberada',
  'contraoferta_propuesta',
  'contraoferta_resuelta',
  -- Documentos (los pondrá la app al generarlos)
  'orden_transporte_enviada',
  'cmr_firmado',
  -- PIN
  'pin_enviado',
  'pin_validado',
  'pin_validado_manual',
  'pin_fuera_de_orden',
  'pin_bloqueado',
  -- Cualquier problema
  'incidencia'
);

comment on type tipo_hito is
  'Los hitos de negocio de la regla 12 (punto 4) mas los de ofertas, reservas y PIN. '
  '"modificado" NO es un hito: vive en envios.modificado_en y, con el antes/despues, en '
  'la tabla auditoria.';

create table envio_hitos (
  id            bigint generated always as identity primary key,
  envio_id      uuid        not null references envios(id) on delete restrict,
  hito          tipo_hito   not null,
  cuando        timestamptz not null default now(),   -- HORA DEL SERVIDOR (trigger)
  quien         uuid,                                 -- auth.users.id; null = sistema/anónimo
  quien_origen  text        not null default 'app'
                  check (quien_origen in ('app','servidor','sistema','migracion-sheet')),
  -- Sin FK a propósito: una parada puede borrarse mientras el envío está programado,
  -- y un registro append-only no puede quedarse colgando ni actualizarse a null.
  -- El `orden` de la parada se copia en `datos` para poder leerlo siempre.
  parada_id     uuid,
  oferta_id     uuid,
  datos         jsonb       not null default '{}'::jsonb
);

comment on table envio_hitos is
  'Append-only. Cada momento del envio con la hora del SERVIDOR. Alimenta las reglas de '
  'precio por tiempo, la defensa ante una reclamacion y la analitica de la operativa.';

create index idx_hitos_envio  on envio_hitos (envio_id, cuando);
create index idx_hitos_tipo   on envio_hitos (hito, cuando desc);
create index idx_hitos_oferta on envio_hitos (oferta_id) where oferta_id is not null;
create index idx_hitos_parada on envio_hitos (parada_id) where parada_id is not null;

-- La hora la pone SIEMPRE el servidor, igual que en fn_sellar.
create or replace function fn_hitos_sellar()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('dynamo.migracion', true), '') = 'on' then
    new.cuando := coalesce(new.cuando, now());
    new.quien_origen := 'migracion-sheet';
  else
    new.cuando := now();
  end if;
  new.quien := coalesce(auth.uid(), new.quien);
  return new;
end $$;

create trigger tg_hitos_sellar before insert on envio_hitos
  for each row execute function fn_hitos_sellar();

-- Append-only con los dos cinturones de la tabla auditoria: trigger + permisos.
create or replace function fn_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'La tabla % es append-only (regla 12). Intento de % bloqueado.',
    tg_table_name, tg_op;
end $$;

create trigger tg_hitos_inmutable before update or delete or truncate on envio_hitos
  for each statement execute function fn_append_only();
revoke update, delete, truncate on envio_hitos from public, anon, authenticated;

alter table envio_hitos enable row level security;

-- El cliente y el transportista ven SOLO los hitos que les afectan. A quién se ofreció
-- la carga, cuántos abrieron el enlace o las contraofertas son cocina interna.
create or replace function hito_visible_fuera(p tipo_hito)
returns boolean language sql immutable as $$
  select p in ('creado','confirmado','transportista_asignado','matricula_asignada',
               'cargado','entregado','cancelado','cancelacion_deshecha',
               'orden_transporte_enviada','cmr_firmado','pin_validado',
               'pin_validado_manual','incidencia')
$$;

create policy hitos_sel on envio_hitos for select using (
  es_admin()
  or (hito_visible_fuera(hito) and exists (
        select 1 from envios e where e.id = envio_id
        and (e.cliente_id = cliente_del_usuario()
             or e.transportista_id = transportista_del_usuario())))
);
-- Sin políticas de escritura: solo escriben los triggers y las funciones de abajo.

-- Ayudante interno para las funciones de este fichero (corre como dueño).
create or replace function registrar_hito(
  p_envio uuid, p_hito tipo_hito,
  p_parada uuid default null, p_oferta uuid default null,
  p_datos jsonb default '{}'::jsonb, p_origen text default 'app'
) returns void language sql security definer set search_path = public as $$
  insert into envio_hitos (envio_id, hito, parada_id, oferta_id, datos, quien_origen)
  values (p_envio, p_hito, p_parada, p_oferta, coalesce(p_datos, '{}'::jsonb), p_origen)
$$;
revoke execute on function registrar_hito(uuid, tipo_hito, uuid, uuid, jsonb, text)
  from public, anon, authenticated;


-- ---- Atajos en `envios`: la tabla de hitos es la verdad, esto es el acceso rápido ----
-- Para listados y para el motor de precio por escasez ("si a las 15:30 de la víspera
-- no hay transportista, sube el precio"), que no puede hacer JOIN a los hitos en cada
-- pasada. Los pone el trigger; nadie los escribe a mano.
alter table envios
  add column confirmado_en      timestamptz,
  add column primera_oferta_en  timestamptz,
  add column asignado_en        timestamptz,
  add column cargado_en         timestamptz,
  add column entregado_en       timestamptz,
  add column cancelado_en       timestamptz;

create index idx_envios_sin_asignar_por_fecha on envios (fecha_carga_desde)
  where asignado_en is null and estado = 'programado';

create or replace function fn_envios_atajos_hitos()
returns trigger language plpgsql as $$
begin
  -- Al migrar el Sheet se conservan las fechas reales que traiga cada fila.
  if coalesce(current_setting('dynamo.migracion', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Nadie puede inventarse las fechas al crear: las pone esta función.
    new.confirmado_en := case when new.estado <> 'borrador' then now() end;
    new.primera_oferta_en := null;
    new.asignado_en  := case when new.transportista_id is not null then now() end;
    new.cargado_en   := null; new.entregado_en := null; new.cancelado_en := null;
    return new;
  end if;

  -- En UPDATE no se pueden tocar a mano: se recalculan desde el cambio real.
  new.confirmado_en     := old.confirmado_en;
  new.primera_oferta_en := old.primera_oferta_en;
  new.asignado_en       := old.asignado_en;
  new.cargado_en        := old.cargado_en;
  new.entregado_en      := old.entregado_en;
  new.cancelado_en      := old.cancelado_en;

  if old.estado = 'borrador' and new.estado <> 'borrador' then
    new.confirmado_en := coalesce(new.confirmado_en, now());
  end if;
  if new.transportista_id is distinct from old.transportista_id then
    new.asignado_en := case when new.transportista_id is not null then now() end;
  end if;
  if new.estado is distinct from old.estado then
    if new.estado = 'en_ruta'   then new.cargado_en   := coalesce(new.cargado_en, now()); end if;
    if new.estado = 'entregado' then new.entregado_en := now(); end if;
    if new.estado = 'cancelado' then new.cancelado_en := now(); end if;
    if old.estado = 'cancelado' then new.cancelado_en := null;  end if;
  end if;
  -- La primera oferta la marca la función de ofertas con este ajuste de sesión.
  if coalesce(current_setting('dynamo.primera_oferta', true), '') = 'on'
     and new.primera_oferta_en is null then
    new.primera_oferta_en := now();
  end if;
  return new;
end $$;

create trigger tg_envios_atajos_hitos before insert or update on envios
  for each row execute function fn_envios_atajos_hitos();

-- Los hitos del ciclo de vida, por trigger: imposible cambiar un estado sin que quede.
-- SECURITY DEFINER porque escribe en envio_hitos, que no tiene política de escritura.
create or replace function fn_envios_hitos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform registrar_hito(new.id, 'creado', null, null,
      jsonb_build_object('estado', new.estado, 'importe_cliente', new.importe_cliente));
    if new.estado <> 'borrador' then
      perform registrar_hito(new.id, 'confirmado');
    end if;
    return null;
  end if;

  if old.estado = 'borrador' and new.estado <> 'borrador' then
    perform registrar_hito(new.id, 'confirmado', null, null,
      jsonb_build_object('importe_cliente', new.importe_cliente));
  end if;

  if new.publicado_en_bolsa_en is distinct from old.publicado_en_bolsa_en
     and new.publicado_en_bolsa_en is not null then
    perform registrar_hito(new.id, 'publicado_bolsa');
  end if;

  if new.transportista_id is distinct from old.transportista_id then
    if old.transportista_id is not null then
      perform registrar_hito(new.id, 'transportista_quitado', null, null,
        jsonb_build_object('transportista_id', old.transportista_id));
    end if;
    if new.transportista_id is not null then
      perform registrar_hito(new.id, 'transportista_asignado', null, null,
        jsonb_build_object('transportista_id', new.transportista_id,
                           'importe_transportista', new.importe_transportista));
    end if;
  end if;

  if (new.matricula_tractora, new.matricula_remolque)
       is distinct from (old.matricula_tractora, old.matricula_remolque)
     and coalesce(new.matricula_tractora, new.matricula_remolque) is not null then
    perform registrar_hito(new.id, 'matricula_asignada', null, null,
      jsonb_build_object('tractora', new.matricula_tractora,
                         'remolque', new.matricula_remolque));
  end if;

  if new.estado is distinct from old.estado then
    if new.estado = 'en_ruta'   then perform registrar_hito(new.id, 'cargado');   end if;
    if new.estado = 'entregado' then perform registrar_hito(new.id, 'entregado'); end if;
    if new.estado = 'cancelado' then
      perform registrar_hito(new.id, 'cancelado', null, null,
        jsonb_build_object('estado_anterior', old.estado,
                           'tenia_transportista', old.transportista_id is not null));
    end if;
    if old.estado = 'cancelado' then
      perform registrar_hito(new.id, 'cancelacion_deshecha', null, null,
        jsonb_build_object('estado_nuevo', new.estado));
    end if;
  end if;
  return null;
end $$;

create trigger tg_envios_hitos after insert or update on envios
  for each row execute function fn_envios_hitos();


-- =====================================================================================
-- 3. OFERTAS A TRANSPORTISTAS
-- =====================================================================================
-- Una fila por transportista y envío ofertado (un email a 100 transportistas = 100
-- filas). Cada una lleva SU enlace con token propio (idea del 2026-07-21): al abrirlo
-- el transportista entra ya identificado y se sabe quién abrió y cuándo.
-- Para la bolsa de carga (Wtransnet…) va una fila SIN transportista: es una oferta
-- abierta, se identificará al aceptar.
create table envio_ofertas (
  id                uuid primary key default gen_random_uuid(),
  envio_id          uuid not null references envios(id) on delete restrict,
  transportista_id  uuid references transportistas(id) on delete restrict,
  canal             text not null check (canal in
                      ('email','whatsapp','telefono','bolsa_wtransnet','bolsa_teleroute',
                       'bolsa_otra','panel')),
  -- El enlace personal. Aleatorio: NO se puede deducir de nada (el GX sí).
  token             uuid not null unique default gen_random_uuid(),

  precio_ofertado   numeric(12,2) not null check (precio_ofertado > 0),
  -- Banda de negociación (decisión 2026-09-03). El ADMIN elige el %; el transportista
  -- NUNCA lo ve: solo el rango en euros ya calculado.
  banda_pct         smallint not null default 10 check (banda_pct in (0, 5, 10, 30)),
  -- ±%, redondeado a 10 €, con un escalón mínimo de 10 € si hay banda.
  banda_euros       numeric(12,2) generated always as (
                      case when banda_pct = 0 then 0
                           else greatest(10, round(precio_ofertado * banda_pct / 100.0 / 10) * 10)
                      end) stored,
  pronto_pago       boolean not null default true,

  estado            text not null default 'activa'
                      check (estado in ('activa','aceptada','caducada','revocada','cerrada')),
  enviada_en        timestamptz not null default now(),
  caduca_en         timestamptz not null,
  abierta_en        timestamptz,              -- primer clic
  aperturas         integer not null default 0,

  creado_en         timestamptz not null default now(),
  creado_por        uuid references auth.users(id) on delete set null,
  modificado_en     timestamptz,
  modificado_por    uuid references auth.users(id) on delete set null,

  constraint ck_ofertas_bolsa_sin_transportista check (
    transportista_id is not null or canal like 'bolsa_%'
  )
);

comment on column envio_ofertas.banda_pct is
  'SOLO ADMIN. El transportista ve el rango en euros (banda_euros), nunca el porcentaje.';
comment on column envio_ofertas.estado is
  'activa → aceptada (este la gano) | cerrada (la gano otro) | caducada | revocada. '
  'La fila NO se borra: es el historico de a quien se oferto cada carga.';

create index idx_ofertas_envio  on envio_ofertas (envio_id, enviada_en desc);
create index idx_ofertas_transp on envio_ofertas (transportista_id, enviada_en desc)
  where transportista_id is not null;

select activar_rastro('envio_ofertas');
alter table envio_ofertas enable row level security;

-- Solo admin desde la API. El transportista verá sus ofertas por una vista SIN el % de
-- banda cuando se monte su panel (migración de políticas).
create policy ofertas_admin on envio_ofertas for all
  using (es_admin()) with check (es_admin());

-- Ofertar: una función y no un INSERT suelto, para que el hito, la caducidad y el
-- estado de asignación del envío no dependan de que la app se acuerde.
create or replace function ofertar_envio(
  p_envio uuid, p_transportista uuid, p_canal text,
  p_precio numeric, p_banda_pct smallint default 10, p_pronto_pago boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_estado estado_envio; v_asig estado_asignacion;
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

  insert into envio_ofertas (envio_id, transportista_id, canal, precio_ofertado,
                             banda_pct, pronto_pago, caduca_en)
  values (p_envio, p_transportista, p_canal, p_precio, p_banda_pct, p_pronto_pago,
          now() + make_interval(days => (parametro('oferta_dias_caducidad'))::int))
  returning id into v_id;

  -- Un solo UPDATE: pasa a 'ofertada' y, con el ajuste de sesión, el trigger de atajos
  -- sella primera_oferta_en (solo la primera vez).
  perform set_config('dynamo.primera_oferta', 'on', true);
  update envios set estado_asignacion = case when estado_asignacion = 'sin_asignar'
                                             then 'ofertada'::estado_asignacion
                                             else estado_asignacion end
   where id = p_envio;
  perform set_config('dynamo.primera_oferta', '', true);

  perform registrar_hito(p_envio, 'ofertado', null, v_id,
    jsonb_build_object('transportista_id', p_transportista, 'canal', p_canal,
                       'precio', p_precio, 'banda_pct', p_banda_pct));
  return v_id;
end $$;


-- =====================================================================================
-- 4. RESERVAS (el bloqueo de 3 minutos) Y ACEPTACIÓN
-- =====================================================================================
-- Modelo A del 2026-07-20: el primero que abre el enlace se queda la carga 3 minutos.
-- Anónimo hasta que pone su CIF al aceptar. No hay presencia en vivo: el control es
-- por marca de tiempo + caducidad, y la caducidad es perezosa (la recicla el siguiente
-- que entra). Va en tabla propia y no en columnas del envío para guardar el HISTÓRICO
-- (cuántas reservas caducaron antes de que alguien aceptara es un dato de mercado).
create table envio_reservas (
  id                 uuid primary key default gen_random_uuid(),
  envio_id           uuid not null references envios(id) on delete restrict,
  oferta_id          uuid references envio_ofertas(id) on delete restrict,

  desde              timestamptz not null default now(),
  hasta              timestamptz not null,
  estado             text not null default 'viva'
                       check (estado in ('viva','pendiente_revision','aceptada',
                                         'caducada','liberada','rechazada')),

  -- Se rellenan al ACEPTAR (antes es anónima)
  transportista_id   uuid references transportistas(id) on delete restrict,
  usuario_id         uuid references usuarios(id) on delete set null,
  precio_aceptado    numeric(12,2) check (precio_aceptado is null or precio_aceptado > 0),
  precio_propuesto   numeric(12,2) check (precio_propuesto is null or precio_propuesto > 0),
  cerrada_en         timestamptz,
  motivo_cierre      text,

  -- Rastro anti-suplantación (dato técnico, no personal en sí; RGPD: ver PRODUCCION.md)
  ip                 inet,
  navegador          text,

  creado_en          timestamptz not null default now(),
  creado_por         uuid references auth.users(id) on delete set null,
  modificado_en      timestamptz,
  modificado_por     uuid references auth.users(id) on delete set null,

  constraint ck_reservas_hasta check (hasta > desde)
);

-- UNA reserva activa por envío, impuesto por la base de datos. Las funciones además
-- bloquean la fila del envío (FOR UPDATE), así que dos aperturas simultáneas no pueden
-- quedarse las dos con la carga.
create unique index ux_reservas_una_activa on envio_reservas (envio_id)
  where estado in ('viva','pendiente_revision');
create index idx_reservas_envio on envio_reservas (envio_id, desde desc);

select activar_rastro('envio_reservas');
alter table envio_reservas enable row level security;
create policy reservas_admin_sel on envio_reservas for select using (es_admin());

comment on table envio_reservas is
  'Historico de reservas de cada carga. Solo puede haber UNA viva (o en revision) por '
  'envio a la vez. Se escribe SOLO por las funciones reservar/aceptar/liberar.';


-- Caducidad perezosa: la llama cualquier función que vaya a mirar reservas.
create or replace function caducar_reservas(p_envio uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in update envio_reservas
              set estado = 'caducada', cerrada_en = now(), motivo_cierre = 'tiempo agotado'
            where envio_id = p_envio and estado = 'viva' and hasta < now()
           returning id, oferta_id loop
    perform registrar_hito(p_envio, 'reserva_caducada', null, r.oferta_id,
                           jsonb_build_object('reserva_id', r.id), 'sistema');
  end loop;
  update envios set estado_asignacion =
           case when exists (select 1 from envio_ofertas where envio_id = p_envio)
                then 'ofertada'::estado_asignacion else 'sin_asignar'::estado_asignacion end
   where id = p_envio and estado_asignacion = 'reservada'
     and not exists (select 1 from envio_reservas
                     where envio_id = p_envio and estado in ('viva','pendiente_revision'));
end $$;


-- ---- RESERVAR: al abrir el enlace ----------------------------------------------------
-- Acepta el token general del envío (envios.token_publico) o el de una oferta personal.
-- Devuelve SIEMPRE la hora del servidor: el contador de la página cuenta hacia `hasta`
-- y nunca hacia el reloj del móvil.
create or replace function reservar_envio(
  p_token uuid, p_ip inet default null, p_navegador text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_envio uuid; v_oferta uuid; e record; v_res record; v_id uuid; v_hasta timestamptz;
begin
  select id into v_envio from envios where token_publico = p_token;
  if v_envio is null then
    select envio_id, id into v_envio, v_oferta from envio_ofertas
     where token = p_token and estado = 'activa' and caduca_en > now();
  end if;
  if v_envio is null then
    return jsonb_build_object('resultado', 'enlace_no_valido', 'ahora', now());
  end if;

  -- La fila del envío bloqueada: a partir de aquí nadie más reserva a la vez.
  select * into e from envios where id = v_envio for update;

  if v_oferta is not null then
    update envio_ofertas set aperturas = aperturas + 1,
                             abierta_en = coalesce(abierta_en, now())
     where id = v_oferta;
  end if;
  perform registrar_hito(v_envio, 'enlace_abierto', null, v_oferta,
                         jsonb_build_object('ip', host(p_ip)), 'servidor');

  if e.estado <> 'programado' or e.estado_asignacion = 'confirmada' then
    return jsonb_build_object('resultado', 'tomada', 'ahora', now(),
                              'asignada_en', e.asignado_en);
  end if;

  perform caducar_reservas(v_envio);

  select * into v_res from envio_reservas
   where envio_id = v_envio and estado in ('viva','pendiente_revision');
  if found then
    return jsonb_build_object('resultado', 'en_tramite', 'ahora', now(),
                              'hasta', v_res.hasta, 'desde', v_res.desde);
  end if;

  v_hasta := now() + make_interval(mins => (parametro('reserva_minutos'))::int);
  insert into envio_reservas (envio_id, oferta_id, hasta, ip, navegador)
  values (v_envio, v_oferta, v_hasta, p_ip, left(p_navegador, 400))
  returning id into v_id;

  update envios set estado_asignacion = 'reservada' where id = v_envio;
  perform registrar_hito(v_envio, 'reservado', null, v_oferta,
                         jsonb_build_object('reserva_id', v_id), 'servidor');

  return jsonb_build_object('resultado', 'reservada', 'reserva_id', v_id,
                            'ahora', now(), 'hasta', v_hasta);
end $$;


-- ---- ACEPTAR: el transportista ya se ha identificado ---------------------------------
-- La revalidación es ATÓMICA: si la reserva caducó un segundo antes, no se acepta.
-- Precio: si no propone nada, se acepta el ofertado. Si propone otro:
--   · dentro de la banda y ≤ contraoferta_auto_pct → aceptado al instante;
--   · dentro de la banda de 30% pero por encima    → pendiente_revision (la reserva
--     queda congelada, sin caducar, hasta que Dynamo decida);
--   · fuera de la banda                            → rechazado, la reserva sigue viva.
create or replace function aceptar_reserva(
  p_reserva uuid, p_transportista uuid, p_usuario uuid default null,
  p_precio numeric default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; e record; o record;
  v_base numeric; v_banda numeric; v_pct numeric; v_auto numeric;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found then return jsonb_build_object('resultado','reserva_no_existe'); end if;

  select * into e from envios where id = r.envio_id for update;
  -- Volver a leer la reserva YA con el envío bloqueado.
  select * into r from envio_reservas where id = p_reserva for update;

  if r.estado <> 'viva' or r.hasta < now() then
    perform caducar_reservas(r.envio_id);
    return jsonb_build_object('resultado','reserva_caducada','ahora',now());
  end if;
  if e.estado <> 'programado' or e.estado_asignacion = 'confirmada' then
    return jsonb_build_object('resultado','tomada','ahora',now());
  end if;
  if not exists (select 1 from transportistas
                 where id = p_transportista and estado_operativo = 'activo') then
    return jsonb_build_object('resultado','transportista_no_activo');
  end if;
  if p_usuario is not null and not exists (
       select 1 from usuarios where id = p_usuario and rol = 'transportista'
       and estado = 'activa' and transportista_id = p_transportista) then
    return jsonb_build_object('resultado','usuario_no_valido');
  end if;

  if r.oferta_id is not null then
    select * into o from envio_ofertas where id = r.oferta_id;
    v_base := o.precio_ofertado; v_banda := o.banda_euros; v_pct := o.banda_pct;
  else
    v_base := e.importe_transportista; v_banda := 0; v_pct := 0;
  end if;
  if v_base is null then
    return jsonb_build_object('resultado','envio_sin_precio');
  end if;

  if p_precio is not null and p_precio <> v_base then
    if abs(p_precio - v_base) > v_banda then
      return jsonb_build_object('resultado','precio_fuera_de_banda',
                                'minimo', v_base - v_banda, 'maximo', v_base + v_banda);
    end if;
    v_auto := (parametro('contraoferta_auto_pct'))::numeric;
    if abs(p_precio - v_base) > round(v_base * v_auto / 100.0, 2) then
      update envio_reservas set estado = 'pendiente_revision',
             precio_propuesto = p_precio, transportista_id = p_transportista,
             usuario_id = p_usuario
       where id = p_reserva;
      perform registrar_hito(e.id, 'contraoferta_propuesta', null, r.oferta_id,
        jsonb_build_object('reserva_id', p_reserva, 'precio_base', v_base,
                           'precio_propuesto', p_precio), 'servidor');
      return jsonb_build_object('resultado','pendiente_revision','ahora',now());
    end if;
    perform registrar_hito(e.id, 'contraoferta_resuelta', null, r.oferta_id,
      jsonb_build_object('reserva_id', p_reserva, 'precio_base', v_base,
                         'precio_propuesto', p_precio, 'decision', 'aceptada_auto'),
      'servidor');
  end if;

  return cerrar_aceptacion(p_reserva, p_transportista, p_usuario, coalesce(p_precio, v_base));
end $$;


-- El cierre común a "aceptada al instante" y "aprobada por Dynamo".
create or replace function cerrar_aceptacion(
  p_reserva uuid, p_transportista uuid, p_usuario uuid, p_precio numeric
) returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  update envio_reservas set estado = 'aceptada', cerrada_en = now(),
         transportista_id = p_transportista, usuario_id = p_usuario,
         precio_aceptado = p_precio, motivo_cierre = 'aceptada'
   where id = p_reserva returning * into r;

  update envios set transportista_id = p_transportista,
                    importe_transportista = p_precio,
                    estado_asignacion = 'confirmada'
   where id = r.envio_id;

  update envio_ofertas set estado = 'aceptada' where id = r.oferta_id;
  update envio_ofertas set estado = 'cerrada'
   where envio_id = r.envio_id and estado = 'activa' and id is distinct from r.oferta_id;

  return jsonb_build_object('resultado','aceptada','envio_id', r.envio_id,
                            'precio', p_precio, 'ahora', now());
end $$;
revoke execute on function cerrar_aceptacion(uuid, uuid, uuid, numeric)
  from public, anon, authenticated;


-- ---- Dynamo resuelve una contraoferta de la banda de 30% -----------------------------
create or replace function resolver_contraoferta(p_reserva uuid, p_aprobar boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not (es_admin() or es_servidor()) then
    raise exception 'Solo Dynamo resuelve contraofertas.' using errcode = '42501';
  end if;
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'pendiente_revision' then
    return jsonb_build_object('resultado','no_hay_contraoferta_pendiente');
  end if;
  perform 1 from envios where id = r.envio_id for update;

  perform registrar_hito(r.envio_id, 'contraoferta_resuelta', null, r.oferta_id,
    jsonb_build_object('reserva_id', p_reserva, 'precio_propuesto', r.precio_propuesto,
                       'decision', case when p_aprobar then 'aprobada' else 'rechazada' end));
  if p_aprobar then
    return cerrar_aceptacion(p_reserva, r.transportista_id, r.usuario_id, r.precio_propuesto);
  end if;

  update envio_reservas set estado = 'rechazada', cerrada_en = now(),
         motivo_cierre = 'contraoferta rechazada' where id = p_reserva;
  perform caducar_reservas(r.envio_id);     -- devuelve el envío a 'ofertada'
  return jsonb_build_object('resultado','rechazada');
end $$;


-- ---- Soltar una reserva antes de tiempo ----------------------------------------------
-- El transportista dice "no la quiero", o falla 3 veces el código de confirmación por
-- email: la carga vuelve a quedar libre para el siguiente al instante.
create or replace function liberar_reserva(p_reserva uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado not in ('viva','pendiente_revision') then
    return jsonb_build_object('resultado','no_estaba_activa');
  end if;
  perform 1 from envios where id = r.envio_id for update;
  update envio_reservas set estado = 'liberada', cerrada_en = now(),
         motivo_cierre = left(coalesce(p_motivo, 'liberada'), 200)
   where id = p_reserva;
  perform registrar_hito(r.envio_id, 'reserva_liberada', null, r.oferta_id,
    jsonb_build_object('reserva_id', p_reserva, 'motivo', p_motivo), 'servidor');
  perform caducar_reservas(r.envio_id);
  return jsonb_build_object('resultado','liberada');
end $$;


-- =====================================================================================
-- 5. PIN DE RECOGIDA Y ENTREGA
-- =====================================================================================
-- Decisiones del usuario (2026-11-02):
--   · 4 cifras, bloqueo a los 3 fallos                        → parametros
--   · sin límite de tiempo                                     → parametros (null)
--   · entrega antes que recogida: se deja, con aviso           → parametros
--   · si falla o no hay cobertura: se carga igual, Dynamo valida a mano y queda
--     registrado quién lo autorizó + incidencia
--
-- ⚠️ POR QUÉ EN TABLA PROPIA Y NO EN `envio_paradas`. El transportista PUEDE leer las
-- paradas de su envío (las necesita para ir). La seguridad por filas filtra FILAS, no
-- COLUMNAS: si el PIN fuera una columna de la parada, el conductor lo leería del código
-- de la página y el control no valdría nada. En tabla aparte, solo admin la lee, y el
-- conductor solo puede MANDAR un número y recibir "sí" o "no" (lo compara el servidor).

-- ¿Se exige PIN? Se activa por sitio o por cliente, nunca para todos.
alter table lugares  add column exige_pin boolean not null default false;
alter table clientes add column exige_pin boolean not null default false;
comment on column lugares.exige_pin  is 'El conductor tiene que validar un PIN al cargar/descargar aqui.';
comment on column clientes.exige_pin is 'Todos los puntos de los envios de este cliente exigen PIN.';

create table envio_parada_pines (
  id                  uuid primary key default gen_random_uuid(),   -- para fn_auditar()
  parada_id           uuid not null unique references envio_paradas(id) on delete cascade,
  envio_id            uuid not null references envios(id) on delete cascade,
  pin                 text not null check (pin ~ '^[0-9]{4,8}$'),
  exigido             boolean not null default true,

  enviado_en          timestamptz,
  enviado_a           text,              -- a qué email/móvil del muelle se mandó

  intentos_fallidos   smallint not null default 0,
  bloqueado           boolean  not null default false,

  validado_en         timestamptz,       -- HORA DEL SERVIDOR (regla 12)
  validado_por        uuid references auth.users(id) on delete set null,
  validado_modo       text check (validado_modo in ('enlace','manual_dynamo')),
  validado_nota       text,              -- obligatoria si es manual: quién y por qué

  creado_en           timestamptz not null default now(),
  creado_por          uuid references auth.users(id) on delete set null,
  modificado_en       timestamptz,
  modificado_por      uuid references auth.users(id) on delete set null,

  constraint ck_pin_manual_con_nota check (
    validado_modo is distinct from 'manual_dynamo'
    or length(trim(coalesce(validado_nota, ''))) >= 5
  ),
  constraint ck_pin_validado_completo check (
    (validado_en is null) = (validado_modo is null)
  )
);

comment on table envio_parada_pines is
  'El PIN de cada punto de la ruta. SOLO ADMIN: el transportista lee las paradas pero '
  'NUNCA esta tabla. El conductor manda un numero a validar_pin_parada() y el servidor '
  'compara.';

create index idx_pines_envio on envio_parada_pines (envio_id);

select activar_rastro('envio_parada_pines');
alter table envio_parada_pines enable row level security;
create policy pines_admin_sel on envio_parada_pines for select using (es_admin());
-- Sin políticas de escritura: solo por las funciones de abajo.


-- Intentos: append-only. Con 4 cifras hay 10.000 combinaciones; sin contar intentos se
-- adivina con un script en minutos. Y varios fallos en el mismo almacén son una señal de
-- fraude que solo se ve si se guardan.
create table pin_intentos (
  id          bigint generated always as identity primary key,
  parada_id   uuid        not null,          -- sin FK: append-only (ver envio_hitos)
  envio_id    uuid        not null,
  cuando      timestamptz not null default now(),
  acierto     boolean     not null,
  motivo      text        not null,
  ip          inet,
  navegador   text
);

create index idx_pin_intentos_parada on pin_intentos (parada_id, cuando desc);
create index idx_pin_intentos_ip     on pin_intentos (ip, cuando desc) where not acierto;

create or replace function fn_cuando_servidor()
returns trigger language plpgsql as $$
begin new.cuando := now(); return new; end $$;

create trigger tg_pin_intentos_sellar before insert on pin_intentos
  for each row execute function fn_cuando_servidor();
create trigger tg_pin_intentos_inmutable before update or delete or truncate on pin_intentos
  for each statement execute function fn_append_only();
revoke update, delete, truncate on pin_intentos from public, anon, authenticated;

alter table pin_intentos enable row level security;
create policy pin_intentos_admin_sel on pin_intentos for select using (es_admin());


-- ---- Generar un PIN aleatorio -------------------------------------------------------
-- gen_random_uuid() usa el generador criptográfico del sistema; los 12 primeros
-- caracteres hexadecimales de un UUID v4 son 48 bits totalmente aleatorios. (random()
-- NO vale: es predecible.)
create or replace function pin_aleatorio(p_cifras int)
returns text language sql volatile as $$
  select lpad(
    ((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint)
      % power(10, p_cifras)::bigint)::text,
    p_cifras, '0')
$$;

-- Crea el PIN de los puntos que lo exigen y aún no lo tienen. Idempotente.
create or replace function preparar_pines_envio(p_envio uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
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

-- Al confirmar el envío se generan los PIN...
create or replace function fn_envios_pines()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'borrador' and new.estado <> 'borrador' then
    perform preparar_pines_envio(new.id);
  end if;
  return null;
end $$;
create trigger tg_envios_pines after update of estado on envios
  for each row execute function fn_envios_pines();

-- ...y si después se añade un punto a un envío vivo, también el suyo.
create or replace function fn_paradas_pines()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from envios where id = new.envio_id
             and estado not in ('borrador','entregado','cancelado')) then
    perform preparar_pines_envio(new.envio_id);
  end if;
  return null;
end $$;
create trigger tg_paradas_pines after insert on envio_paradas
  for each row execute function fn_paradas_pines();


-- ---- Dynamo genera (o regenera) un PIN y lo manda al muelle --------------------------
-- Regenerar invalida el anterior, pone a cero los intentos y quita el bloqueo.
-- Devuelve el PIN para que el servidor lo envíe al contacto del muelle (NO al cliente
-- que contrató: es otra persona, a menudo de otra empresa).
create or replace function regenerar_pin_parada(p_parada uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_pin text; v_envio uuid;
begin
  if not (es_admin() or es_servidor()) then
    raise exception 'Solo Dynamo gestiona los PIN.' using errcode = '42501';
  end if;
  select envio_id into v_envio from envio_paradas where id = p_parada;
  if v_envio is null then raise exception 'La parada % no existe.', p_parada; end if;
  if exists (select 1 from envio_parada_pines where parada_id = p_parada
             and validado_en is not null) then
    raise exception 'Ese punto ya esta validado: no se regenera su PIN.';
  end if;
  v_pin := pin_aleatorio((parametro('pin_cifras'))::int);
  insert into envio_parada_pines (parada_id, envio_id, pin)
  values (p_parada, v_envio, v_pin)
  on conflict (parada_id) do update
    set pin = excluded.pin, intentos_fallidos = 0, bloqueado = false,
        exigido = true, enviado_en = null, enviado_a = null;
  return v_pin;
end $$;

create or replace function marcar_pin_enviado(p_parada uuid, p_destino text)
returns void language plpgsql security definer set search_path = public as $$
declare v_envio uuid;
begin
  if not (es_admin() or es_servidor()) then
    raise exception 'Solo Dynamo gestiona los PIN.' using errcode = '42501';
  end if;
  update envio_parada_pines set enviado_en = now(), enviado_a = left(p_destino, 200)
   where parada_id = p_parada returning envio_id into v_envio;
  if v_envio is null then raise exception 'Ese punto no tiene PIN.'; end if;
  perform registrar_hito(v_envio, 'pin_enviado', p_parada, null,
                         jsonb_build_object('a', p_destino), 'servidor');
end $$;


-- ---- EL CONDUCTOR VALIDA EL PIN ------------------------------------------------------
-- Solo el SERVIDOR la llama (la página del conductor no tiene cuenta). Nunca devuelve
-- el PIN correcto: solo si acierta y cuántos intentos quedan.
create or replace function validar_pin_parada(
  p_parada uuid, p_pin text, p_ip inet default null, p_navegador text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k record; par record; e record;
  v_max int; v_antes numeric; v_despues numeric; v_pend int; v_res text;
begin
  select * into k from envio_parada_pines where parada_id = p_parada for update;
  if not found or not k.exigido then
    return jsonb_build_object('resultado','no_exige_pin');
  end if;
  if k.validado_en is not null then
    return jsonb_build_object('resultado','ya_validado','validado_en', k.validado_en);
  end if;

  select * into par from envio_paradas where id = p_parada;
  select * into e   from envios        where id = k.envio_id;

  -- Cualquier rechazo antes de comparar queda también registrado (no cuenta como fallo).
  v_res := case
    when k.bloqueado then 'bloqueado'
    when e.transportista_id is null
      or e.estado not in ('programado','hacia_la_carga','cargando','en_ruta')
      then 'envio_no_activo'
  end;

  -- `#>> '{}'` convierte el null de JSON en un NULL de verdad (null = sin límite).
  -- (Un ::text a secas da la palabra 'null' y revienta: lo cazó la prueba.)
  v_antes   := (parametro('pin_ventana_horas_antes')   #>> '{}')::numeric;
  v_despues := (parametro('pin_ventana_horas_despues') #>> '{}')::numeric;
  if v_res is null and v_antes is not null and par.fecha_desde is not null
     and now() < par.fecha_desde - make_interval(secs => v_antes * 3600) then
    v_res := 'demasiado_pronto';
  end if;
  if v_res is null and v_despues is not null and coalesce(par.fecha_hasta, par.fecha_desde) is not null
     and now() > coalesce(par.fecha_hasta, par.fecha_desde) + make_interval(secs => v_despues * 3600) then
    v_res := 'demasiado_tarde';
  end if;

  -- ¿Quedan puntos ANTERIORES con PIN sin validar?
  select count(*) into v_pend
    from envio_parada_pines x join envio_paradas y on y.id = x.parada_id
   where x.envio_id = k.envio_id and x.exigido and x.validado_en is null
     and y.orden < par.orden;
  if v_res is null and v_pend > 0 and (parametro('pin_orden_obliga'))::boolean then
    v_res := 'faltan_puntos_anteriores';
  end if;

  if v_res is not null then
    insert into pin_intentos (parada_id, envio_id, acierto, motivo, ip, navegador)
    values (p_parada, k.envio_id, false, v_res, p_ip, left(p_navegador, 400));
    return jsonb_build_object('resultado', v_res);
  end if;

  -- La comparación.
  if trim(coalesce(p_pin, '')) <> k.pin then
    v_max := (parametro('pin_max_intentos'))::int;
    update envio_parada_pines set intentos_fallidos = intentos_fallidos + 1,
           bloqueado = (intentos_fallidos + 1 >= v_max)
     where parada_id = p_parada returning * into k;
    insert into pin_intentos (parada_id, envio_id, acierto, motivo, ip, navegador)
    values (p_parada, k.envio_id, false, 'pin_incorrecto', p_ip, left(p_navegador, 400));
    if k.bloqueado then
      perform registrar_hito(k.envio_id, 'pin_bloqueado', p_parada, null,
        jsonb_build_object('orden', par.orden, 'tipo', par.tipo, 'ip', host(p_ip)), 'servidor');
      perform registrar_hito(k.envio_id, 'incidencia', p_parada, null,
        jsonb_build_object('motivo', 'PIN bloqueado por intentos fallidos',
                           'orden', par.orden), 'servidor');
      return jsonb_build_object('resultado','bloqueado');
    end if;
    return jsonb_build_object('resultado','incorrecto',
                              'intentos_restantes', v_max - k.intentos_fallidos);
  end if;

  -- Acierto.
  update envio_parada_pines set validado_en = now(), validado_modo = 'enlace'
   where parada_id = p_parada;
  update envio_paradas set hora_real = coalesce(hora_real, now()) where id = p_parada;
  insert into pin_intentos (parada_id, envio_id, acierto, motivo, ip, navegador)
  values (p_parada, k.envio_id, true, 'ok', p_ip, left(p_navegador, 400));
  perform registrar_hito(k.envio_id, 'pin_validado', p_parada, null,
    jsonb_build_object('orden', par.orden, 'tipo', par.tipo), 'servidor');
  if v_pend > 0 then
    perform registrar_hito(k.envio_id, 'pin_fuera_de_orden', p_parada, null,
      jsonb_build_object('orden', par.orden, 'puntos_anteriores_sin_validar', v_pend),
      'servidor');
  end if;
  return jsonb_build_object('resultado','validado','ahora', now(),
                            'aviso', case when v_pend > 0
                                          then 'hay puntos anteriores sin validar' end);
end $$;


-- ---- SALIDA DE EMERGENCIA: Dynamo valida a mano --------------------------------------
-- Sin cobertura, PIN bloqueado, muelle sin el código... la carga NO se para (decisión
-- 2026-11-02): el transportista llama, alguien de Dynamo valida aquí y queda escrito
-- quién lo autorizó y por qué. Salta incidencia para revisarlo después.
create or replace function validar_pin_manual(p_parada uuid, p_nota text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k record; par record;
begin
  if not (es_admin() or es_servidor()) then
    raise exception 'Solo Dynamo valida un PIN a mano.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_nota, ''))) < 5 then
    raise exception 'Hay que explicar por que se valida a mano (quien llamo y motivo).';
  end if;
  select * into k from envio_parada_pines where parada_id = p_parada for update;
  if not found then return jsonb_build_object('resultado','no_exige_pin'); end if;
  if k.validado_en is not null then
    return jsonb_build_object('resultado','ya_validado','validado_en', k.validado_en);
  end if;
  select * into par from envio_paradas where id = p_parada;

  update envio_parada_pines set validado_en = now(), validado_modo = 'manual_dynamo',
         validado_por = auth.uid(), validado_nota = trim(p_nota)
   where parada_id = p_parada;
  update envio_paradas set hora_real = coalesce(hora_real, now()) where id = p_parada;

  perform registrar_hito(k.envio_id, 'pin_validado_manual', p_parada, null,
    jsonb_build_object('orden', par.orden, 'tipo', par.tipo, 'nota', trim(p_nota),
                       'estaba_bloqueado', k.bloqueado));
  perform registrar_hito(k.envio_id, 'incidencia', p_parada, null,
    jsonb_build_object('motivo', 'PIN validado a mano por Dynamo', 'nota', trim(p_nota),
                       'orden', par.orden));
  return jsonb_build_object('resultado','validado_manual','ahora', now());
end $$;


-- =====================================================================================
-- 6. PERMISOS DE LAS FUNCIONES
-- =====================================================================================
-- Supabase da EXECUTE a anon y authenticated en todo lo que se crea en public. Aquí se
-- quita y se concede solo a quien toca.

-- Solo el servidor (páginas públicas sin cuenta: transportista, conductor):
revoke execute on function reservar_envio(uuid, inet, text)              from public, anon, authenticated;
revoke execute on function aceptar_reserva(uuid, uuid, uuid, numeric)    from public, anon, authenticated;
revoke execute on function liberar_reserva(uuid, text)                   from public, anon, authenticated;
revoke execute on function validar_pin_parada(uuid, text, inet, text)    from public, anon, authenticated;
grant  execute on function reservar_envio(uuid, inet, text)              to service_role;
grant  execute on function aceptar_reserva(uuid, uuid, uuid, numeric)    to service_role;
grant  execute on function liberar_reserva(uuid, text)                   to service_role;
grant  execute on function validar_pin_parada(uuid, text, inet, text)    to service_role;

-- Admin desde el panel o servidor (comprueban es_admin() dentro):
revoke execute on function ofertar_envio(uuid, uuid, text, numeric, smallint, boolean) from public, anon;
revoke execute on function resolver_contraoferta(uuid, boolean)          from public, anon;
revoke execute on function regenerar_pin_parada(uuid)                    from public, anon;
revoke execute on function marcar_pin_enviado(uuid, text)                from public, anon;
revoke execute on function validar_pin_manual(uuid, text)                from public, anon;

-- Herramientas internas: nadie de la API.
revoke execute on function caducar_reservas(uuid)        from public, anon, authenticated;
revoke execute on function preparar_pines_envio(uuid)    from public, anon, authenticated;
revoke execute on function pin_aleatorio(int)            from public, anon, authenticated;
revoke execute on function parametro(text)               from public, anon, authenticated;
grant  execute on function caducar_reservas(uuid)        to service_role;
grant  execute on function preparar_pines_envio(uuid)    to service_role;


-- =====================================================================================
-- 7. CHIVATO DE RASTRO: las tablas append-only no llevan sellos de modificación
-- =====================================================================================
-- envio_hitos y pin_intentos son registros en sí mismos (como `auditoria`): nunca se
-- modifican, así que no tienen modificado_en/por ni auditoría propia.
create or replace view v_tablas_sin_rastro with (security_invoker = true) as
select c.relname as tabla
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace
where  n.nspname = 'public'
  and  c.relkind = 'r'
  and  c.relname not in ('auditoria', 'recargos_tipo_lugar', 'envio_hitos', 'pin_intentos')
  and  not exists (
         select 1 from pg_trigger t
         where t.tgrelid = c.oid and t.tgname = 'tg_auditar_' || c.relname
       );
revoke all on v_tablas_sin_rastro from public, anon, authenticated;
