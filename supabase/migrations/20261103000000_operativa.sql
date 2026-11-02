-- =====================================================================================
-- OPERATIVA: incidencias, penalizaciones, almacenamientos, documentos y firmas del CMR
-- =====================================================================================
-- Lo que el panel ya tiene y la base de datos todavía no:
--
--   1. tipos_incidencia + incidencias   (los "tickets" del Sheet, sección Incidencias)
--   2. tipos_penalizacion + penalizaciones (#PEN-, con la automática al cancelar tarde)
--   3. almacenamientos                   (#AX + 6 cifras, en un almacén Dynamo)
--   4. documentos                        (albarán, CMR, seguro, adjuntos… El fichero va
--                                          en Supabase Storage; aquí, sus datos)
--   5. firmas_cmr                        (quién firmó, con qué documento, cuándo: el
--                                          valor probatorio de la firma con el dedo)
--
-- Tipos de incidencia y de penalización van en CATÁLOGO (tabla editable desde el panel,
-- con `activo` para jubilar uno sin romper el histórico), como pedía SUPABASE.md §10.
-- Los estados son ENUM: de ellos cuelgan flujos, pestañas y permisos.
-- =====================================================================================


-- =====================================================================================
-- 0. ¿PASÓ EL CORTE DE CANCELACIÓN?
-- =====================================================================================
-- Regla de negocio (2026-07-27): con camión asignado, cancelar es gratis hasta las 9:00
-- (hora de Madrid) del día hábil ANTERIOR a la carga; después, se cobra el servicio
-- entero. Ojo: aquí "día hábil" salta sábados y domingos, pero NO festivos (los festivos
-- viven hoy en js/festivos.js, en el navegador). Anotado como pendiente en el README.
create or replace function corte_cancelacion(p_fecha_carga date)
returns timestamptz language sql immutable as $$
  select (( p_fecha_carga
            - case extract(isodow from p_fecha_carga)::int
                when 1 then 3      -- lunes → viernes
                when 7 then 2      -- domingo → viernes
                else 1 end
          )::timestamp + time '09:00') at time zone 'Europe/Madrid'
$$;
comment on function corte_cancelacion(date) is
  'Hora limite para cancelar gratis un envio con camion asignado: 9:00 (Madrid) del dia '
  'habil anterior a la carga. Salta fines de semana; los festivos aun no (pendiente).';


-- =====================================================================================
-- 1. INCIDENCIAS
-- =====================================================================================
create table tipos_incidencia (
  id             uuid primary key default gen_random_uuid(),
  clave          text not null unique check (clave ~ '^[a-z][a-z0-9_]*$'),
  nombre         text not null,
  activo         boolean not null default true,
  orden          smallint not null default 0,
  creado_en      timestamptz not null default now(),
  creado_por     uuid references auth.users(id) on delete set null,
  modificado_en  timestamptz,
  modificado_por uuid references auth.users(id) on delete set null
);
select activar_rastro('tipos_incidencia');
alter table tipos_incidencia enable row level security;
create policy tipos_incidencia_sel on tipos_incidencia for select using (auth.uid() is not null);
create policy tipos_incidencia_admin on tipos_incidencia for all
  using (es_admin()) with check (es_admin());

-- Los 5 del Sheet (`ticket_tipo`).
insert into tipos_incidencia (clave, nombre, orden) values
  ('incidencia_transporte',   'Incidencia en el transporte',   1),
  ('cancelacion_transporte',  'Cancelación del transporte',    2),
  ('cambio_fecha_hora_carga', 'Cambio de fecha u hora de carga', 3),
  ('facturacion_consulta',    'Consulta de facturación',       4),
  ('pago_consulta',           'Consulta de pago',              5);

create sequence seq_incidencia_codigo start 10000;

create table incidencias (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique default ('INC-' || nextval('seq_incidencia_codigo')),
  tipo_id           uuid not null references tipos_incidencia(id) on delete restrict,
  cliente_id        uuid references clientes(id) on delete restrict,
  -- Se puede abrir en CUALQUIER estado del envío (decisión 2026-07-12), o sin envío
  -- (una consulta de facturación), o sobre un almacenamiento.
  envio_id          uuid references envios(id) on delete restrict,
  almacenamiento_id uuid,                      -- FK al final, cuando exista la tabla
  transportista_id  uuid references transportistas(id) on delete set null,

  titulo            text not null check (length(trim(titulo)) > 0),
  detalle           text,
  estado            estado_ticket    not null default 'abierto',
  prioridad         prioridad_ticket not null default 'media',

  resuelto_en       timestamptz,
  resolucion        text,               -- qué se hizo para cerrarla

  creado_en         timestamptz not null default now(),
  creado_por        uuid references auth.users(id) on delete set null,
  modificado_en     timestamptz,
  modificado_por    uuid references auth.users(id) on delete set null
);

create index idx_incidencias_cliente on incidencias (cliente_id, creado_en desc);
create index idx_incidencias_envio   on incidencias (envio_id) where envio_id is not null;
create index idx_incidencias_abiertas on incidencias (estado, prioridad) where estado in ('abierto','en_curso');

select activar_rastro('incidencias');
alter table incidencias enable row level security;

-- El cliente sale del envío si no se dice; y la hora de resolución la pone el servidor.
create or replace function fn_incidencias_completar()
returns trigger language plpgsql as $$
begin
  if new.cliente_id is null and new.envio_id is not null then
    select cliente_id into new.cliente_id from envios where id = new.envio_id;
  end if;
  if new.cliente_id is null then new.cliente_id := cliente_del_usuario(); end if;
  if new.estado = 'resuelto' and (tg_op = 'INSERT' or old.estado <> 'resuelto') then
    new.resuelto_en := now();
  elsif new.estado <> 'resuelto' then
    new.resuelto_en := null;
  end if;
  return new;
end $$;
create trigger tg_incidencias_completar before insert or update on incidencias
  for each row execute function fn_incidencias_completar();

-- Abrir una incidencia sobre un envío deja también su hito (regla 12).
create or replace function fn_incidencias_hito()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.envio_id is not null then
    perform registrar_hito(new.envio_id, 'incidencia', null, null,
      jsonb_build_object('incidencia', new.codigo, 'titulo', new.titulo));
  end if;
  return null;
end $$;
create trigger tg_incidencias_hito after insert on incidencias
  for each row execute function fn_incidencias_hito();

create policy incidencias_sel on incidencias for select
  using (es_admin() or cliente_id = cliente_del_usuario());
create policy incidencias_ins on incidencias for insert
  with check (es_admin() or (cliente_id = cliente_del_usuario()
                             and (envio_id is null or exists (
                                   select 1 from envios e where e.id = incidencias.envio_id))));
-- El cliente puede añadir detalle o retirarla mientras está abierta; resolverla es de Dynamo.
create policy incidencias_upd on incidencias for update
  using (es_admin() or (cliente_id = cliente_del_usuario() and estado = 'abierto'))
  with check (es_admin() or (cliente_id = cliente_del_usuario() and estado in ('abierto','cancelado')));


-- =====================================================================================
-- 2. PENALIZACIONES
-- =====================================================================================
create table tipos_penalizacion (
  id             uuid primary key default gen_random_uuid(),
  clave          text not null unique check (clave ~ '^[a-z][a-z0-9_]*$'),
  nombre         text not null,
  activo         boolean not null default true,
  orden          smallint not null default 0,
  creado_en      timestamptz not null default now(),
  creado_por     uuid references auth.users(id) on delete set null,
  modificado_en  timestamptz,
  modificado_por uuid references auth.users(id) on delete set null
);
select activar_rastro('tipos_penalizacion');
alter table tipos_penalizacion enable row level security;
create policy tipos_penalizacion_sel on tipos_penalizacion for select using (auth.uid() is not null);
create policy tipos_penalizacion_admin on tipos_penalizacion for all
  using (es_admin()) with check (es_admin());

-- Los del panel.
insert into tipos_penalizacion (clave, nombre, orden) values
  ('cancelacion',      'Cancelación',      1),
  ('paralizacion',     'Paralización',     2),
  ('compensacion',     'Compensación',     3),
  ('parada_adicional', 'Parada adicional', 4),
  ('otro',             'Otro',             5);

create type estado_penalizacion as enum ('pendiente_confirmar', 'confirmada', 'cancelada');

create table penalizaciones (
  id                     uuid primary key default gen_random_uuid(),
  codigo                 text not null unique default ('PEN-' || nextval('seq_penalizacion_codigo')),
  envio_id               uuid not null references envios(id) on delete restrict,
  tipo_id                uuid not null references tipos_penalizacion(id) on delete restrict,
  descripcion            text,

  -- Dos importes, igual que el envío: lo que se COBRA al cliente y lo que se PAGA al
  -- transportista (una paralización la pide el transportista y Dynamo la repercute).
  -- Siempre SIN IVA.
  importe_cliente        numeric(12,2) check (importe_cliente is null or importe_cliente >= 0),
  importe_transportista  numeric(12,2) check (importe_transportista is null or importe_transportista >= 0),

  estado                 estado_penalizacion not null default 'pendiente_confirmar',
  generada_auto          boolean not null default false,  -- la de cancelar fuera de plazo
  editada_a_mano         boolean not null default false,  -- Dynamo la ha renegociado

  creado_en              timestamptz not null default now(),
  creado_por             uuid references auth.users(id) on delete set null,
  modificado_en          timestamptz,
  modificado_por         uuid references auth.users(id) on delete set null,

  constraint ck_penalizacion_algun_importe check (
    importe_cliente is not null or importe_transportista is not null
  )
);

create index idx_penalizaciones_envio  on penalizaciones (envio_id);
create index idx_penalizaciones_estado on penalizaciones (estado, creado_en desc);

comment on column penalizaciones.editada_a_mano is
  'true si Dynamo ha tocado los importes de una penalizacion automatica. Si se deshace la '
  'cancelacion, una automatica SIN tocar se retira sola; una editada, no.';

select activar_rastro('penalizaciones');
alter table penalizaciones enable row level security;

-- Marcar "editada a mano" cuando Dynamo cambia un importe de una automática.
create or replace function fn_penalizaciones_editada()
returns trigger language plpgsql as $$
begin
  if old.generada_auto
     and (new.importe_cliente, new.importe_transportista)
         is distinct from (old.importe_cliente, old.importe_transportista) then
    new.editada_a_mano := true;
  end if;
  return new;
end $$;
create trigger tg_penalizaciones_editada before update on penalizaciones
  for each row execute function fn_penalizaciones_editada();

-- Solo Dynamo crea y gestiona penalizaciones. El cliente VE las de sus envíos por la
-- vista de abajo (sin el importe del transportista).
create policy penalizaciones_admin on penalizaciones for all
  using (es_admin()) with check (es_admin());

-- Lo que ve el CLIENTE: sus penalizaciones SIN el importe del transportista.
-- Por qué una función y no una vista o una política: la seguridad por filas filtra
-- FILAS, no COLUMNAS. Si el cliente pudiera leer la tabla, vería también lo que se
-- paga al transportista. La función devuelve solo las columnas que le tocan y solo de
-- sus envíos, y es lo único que la API le deja usar.
create or replace function mis_penalizaciones()
returns table (id uuid, codigo text, envio_id uuid, referencia_gx text, tipo text,
               descripcion text, importe_cliente numeric, estado estado_penalizacion,
               creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.codigo, p.envio_id, e.referencia_gx, t.nombre, p.descripcion,
         p.importe_cliente, p.estado, p.creado_en
    from penalizaciones p
    join envios e             on e.id = p.envio_id
    join tipos_penalizacion t on t.id = p.tipo_id
   where e.cliente_id = cliente_del_usuario()
     and p.importe_cliente is not null
     and p.estado <> 'cancelada'
   order by p.creado_en desc
$$;
revoke execute on function mis_penalizaciones() from public, anon;
comment on function mis_penalizaciones() is
  'Penalizaciones del cliente que llama, sin el importe del transportista (SOLO ADMIN).';


-- ---- La automática: cancelar con camión asignado después del corte ------------------
create or replace function fn_envios_penalizacion_cancelacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_fecha date;
begin
  -- Se cancela...
  if new.estado = 'cancelado' and old.estado <> 'cancelado' then
    v_fecha := coalesce(new.fecha_carga_desde, new.fecha_carga_real);
    -- ...con camión asignado, fuera de plazo, y es un envío de Dynamo (no manual).
    if old.transportista_id is not null and new.operador_id is null
       and v_fecha is not null and now() >= corte_cancelacion(v_fecha) then
      insert into penalizaciones (envio_id, tipo_id, descripcion,
                                  importe_cliente, importe_transportista, generada_auto)
      values (new.id, (select id from tipos_penalizacion where clave = 'cancelacion'),
              'Cancelacion despues de las 9:00 del dia habil anterior a la carga.',
              new.importe_cliente, new.importe_transportista, true);
    end if;
  end if;

  -- Se deshace la cancelación: la automática SIN tocar se retira (queda como cancelada,
  -- no se borra: sigue el rastro).
  if old.estado = 'cancelado' and new.estado <> 'cancelado' then
    update penalizaciones set estado = 'cancelada'
     where envio_id = new.id and generada_auto and not editada_a_mano
       and estado = 'pendiente_confirmar';
  end if;
  return null;
end $$;

create trigger tg_envios_penalizacion_cancelacion after update of estado on envios
  for each row execute function fn_envios_penalizacion_cancelacion();


-- =====================================================================================
-- 3. ALMACENAMIENTOS (#AX + 6 cifras)
-- =====================================================================================
create type estado_almacenamiento as enum (
  'pendiente_confirmar',   -- solicitado; Dynamo tiene que confirmar que hay sitio
  'confirmado',
  'en_almacen',            -- la mercancía ya ha entrado
  'finalizado',            -- ya ha salido
  'cancelado'
);

create table almacenamientos (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null unique
                       default ('AX' || nextval('seq_almacenamiento_codigo'))
                       check (codigo ~ '^AX[0-9]{6}$'),
  cliente_id         uuid not null references clientes(id) on delete restrict,
  -- En un almacén de Dynamo (lugares.es_almacen_dynamo).
  almacen_id         uuid not null references lugares(id) on delete restrict,

  fecha_entrada      date not null,
  fecha_salida       date not null,
  num_trailers       smallint not null default 1 check (num_trailers between 1 and 10),
  descripcion        text,                 -- "20 palets de material eléctrico · PED-0468"
  referencia_cliente text,

  -- Reparto urbano posterior (radio máx. 20 km del almacén: lo mide la app con Google).
  num_repartos       smallint not null default 0 check (num_repartos between 0 and 20),
  lugar_entrega_id   uuid references lugares(id) on delete restrict,
  distancia_entrega_km numeric(6,2) check (distancia_entrega_km is null or distancia_entrega_km <= 20),

  -- Importes SIN IVA, congelados al crear (la tarifa de mañana no cambia lo de hoy).
  importe_almacenaje numeric(12,2) check (importe_almacenaje is null or importe_almacenaje >= 0),
  importe_reparto    numeric(12,2) check (importe_reparto    is null or importe_reparto    >= 0),
  importe_total      numeric(12,2) generated always as
                       (coalesce(importe_almacenaje, 0) + coalesce(importe_reparto, 0)) stored,
  iva_aplicado       numeric(5,2),
  pago_adelantado    boolean not null default true,   -- sin crédito CESCE: proforma

  estado             estado_almacenamiento not null default 'pendiente_confirmar',
  anotaciones        text,

  creado_en          timestamptz not null default now(),
  creado_por         uuid references auth.users(id) on delete set null,
  modificado_en      timestamptz,
  modificado_por     uuid references auth.users(id) on delete set null,

  constraint ck_alm_fechas check (fecha_salida >= fecha_entrada),
  constraint ck_alm_reparto check (
    (num_repartos = 0 and lugar_entrega_id is null) or (num_repartos > 0 and lugar_entrega_id is not null)
  )
);

comment on column almacenamientos.fecha_salida is
  'El servicio es de 1 a 7 dias, pero no se bloquea: alargarlo es un caso real. La app avisa.';

create index idx_alm_cliente on almacenamientos (cliente_id, fecha_entrada desc);
create index idx_alm_almacen on almacenamientos (almacen_id, fecha_entrada);
create index idx_alm_estado  on almacenamientos (estado);

select activar_rastro('almacenamientos');
alter table almacenamientos enable row level security;

alter table incidencias add constraint fk_incidencias_almacenamiento
  foreign key (almacenamiento_id) references almacenamientos(id) on delete restrict;

-- Comprobaciones que no caben en un CHECK porque miran otras tablas.
create or replace function fn_almacenamientos_validar()
returns trigger language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if new.cliente_id is null then new.cliente_id := cliente_del_usuario(); end if;

  select es_almacen_dynamo, disponible, borrado into a from lugares where id = new.almacen_id;
  if not coalesce(a.es_almacen_dynamo, false) or a.borrado then
    raise exception 'Hay que elegir un almacen de Dynamo.';
  end if;
  -- "Completo" bloquea ALMACENAR (decisión 2026-07-08), pero solo al pedirlo: no rompe
  -- los almacenamientos que ya estaban dentro.
  if tg_op = 'INSERT' and not a.disponible then
    raise exception 'Este almacen esta COMPLETO y no admite entradas.';
  end if;

  if new.lugar_entrega_id is not null and not exists (
       select 1 from lugares where id = new.lugar_entrega_id
       and (cliente_id = new.cliente_id or es_almacen_dynamo)) then
    raise exception 'La direccion de entrega tiene que ser un sitio de este cliente.';
  end if;
  return new;
end $$;
create trigger tg_almacenamientos_validar
  before insert or update of almacen_id, lugar_entrega_id, cliente_id on almacenamientos
  for each row execute function fn_almacenamientos_validar();

create policy alm_sel on almacenamientos for select
  using (es_admin() or cliente_id = cliente_del_usuario());
create policy alm_ins on almacenamientos for insert
  with check (es_admin() or (cliente_id = cliente_del_usuario() and estado = 'pendiente_confirmar'));
-- El cliente solo puede tocarlo (o cancelarlo) mientras Dynamo no lo ha confirmado.
create policy alm_upd on almacenamientos for update
  using (es_admin() or (cliente_id = cliente_del_usuario() and estado = 'pendiente_confirmar'))
  with check (es_admin() or (cliente_id = cliente_del_usuario()
                             and estado in ('pendiente_confirmar','cancelado')));


-- =====================================================================================
-- 4. DOCUMENTOS (los datos; el fichero va en Supabase Storage)
-- =====================================================================================
create table documentos (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null check (tipo in (
                      'albaran', 'cmr', 'cmr_firmado', 'orden_transporte', 'proforma',
                      'seguro_cmr', 'tarjeta_transporte', 'foto_incidencia',
                      'adjunto', 'otro')),

  -- A qué pertenece. Al menos una cosa; puede ser más de una (una foto de una incidencia
  -- de un envío cuelga de los dos).
  envio_id          uuid references envios(id)          on delete restrict,
  incidencia_id     uuid references incidencias(id)     on delete restrict,
  almacenamiento_id uuid references almacenamientos(id) on delete restrict,
  transportista_id  uuid references transportistas(id)  on delete restrict,

  -- El fichero. Bucket PRIVADO: se sirve con enlace firmado y caducidad, nunca público.
  storage_bucket    text not null default 'documentos',
  storage_ruta      text not null,
  nombre_archivo    text not null,
  tipo_mime         text,
  tamano_bytes      bigint check (tamano_bytes is null or tamano_bytes between 0 and 26214400),  -- 25 MB
  -- Huella del fichero: prueba de que el documento no se ha cambiado después.
  sha256            text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),

  -- Lo que puede ver el cliente del envío. El seguro o la tarjeta de un transportista,
  -- no; el albarán y el CMR de su envío, sí.
  visible_cliente   boolean not null default false,

  borrado           boolean not null default false,
  borrado_en        timestamptz,

  creado_en         timestamptz not null default now(),
  creado_por        uuid references auth.users(id) on delete set null,
  modificado_en     timestamptz,
  modificado_por    uuid references auth.users(id) on delete set null,

  constraint ck_documentos_dueno check (
    envio_id is not null or incidencia_id is not null
    or almacenamiento_id is not null or transportista_id is not null
  ),
  constraint ck_documentos_borrado check (
    (borrado and borrado_en is not null) or (not borrado and borrado_en is null)
  ),
  constraint ux_documentos_ruta unique (storage_bucket, storage_ruta)
);

create index idx_documentos_envio  on documentos (envio_id)          where envio_id is not null;
create index idx_documentos_inc    on documentos (incidencia_id)     where incidencia_id is not null;
create index idx_documentos_alm    on documentos (almacenamiento_id) where almacenamiento_id is not null;
create index idx_documentos_transp on documentos (transportista_id)  where transportista_id is not null;

select activar_rastro('documentos');
alter table documentos enable row level security;

-- Máximo 5 documentos por transportista en su ficha (regla del panel, 2026-07-12).
create or replace function fn_documentos_max_transportista()
returns trigger language plpgsql as $$
begin
  if new.transportista_id is not null and new.envio_id is null and not new.borrado
     and (select count(*) from documentos
           where transportista_id = new.transportista_id and envio_id is null
             and not borrado and id <> new.id) >= 5 then
    raise exception 'Maximo 5 documentos en la ficha del transportista.';
  end if;
  return new;
end $$;
create trigger tg_documentos_max_transportista before insert or update on documentos
  for each row execute function fn_documentos_max_transportista();

-- Lo que el cliente ve marcado como visible, si es suyo (envío, incidencia o almacenamiento).
-- Lo que sube él mismo (fotos de su incidencia) se ve siempre.
create policy documentos_sel on documentos for select using (
  es_admin()
  or (not borrado
      and (visible_cliente
           or (creado_por = auth.uid() and tipo in ('foto_incidencia','adjunto')))
      and (
        exists (select 1 from envios e          where e.id = documentos.envio_id          and e.cliente_id = cliente_del_usuario())
     or exists (select 1 from incidencias i     where i.id = documentos.incidencia_id     and i.cliente_id = cliente_del_usuario())
     or exists (select 1 from almacenamientos a where a.id = documentos.almacenamiento_id and a.cliente_id = cliente_del_usuario())))
);
-- El cliente sube adjuntos a SUS incidencias; lo demás (albaranes, CMR, seguros) lo
-- sube Dynamo o el servidor.
create policy documentos_ins on documentos for insert with check (
  es_admin()
  or (tipo in ('foto_incidencia','adjunto') and transportista_id is null and envio_id is null
      and almacenamiento_id is null
      and exists (select 1 from incidencias i where i.id = documentos.incidencia_id
                  and i.cliente_id = cliente_del_usuario()))
);
create policy documentos_upd on documentos for update
  using (es_admin()) with check (es_admin());


-- =====================================================================================
-- 5. FIRMAS DEL CMR (append-only)
-- =====================================================================================
-- Firma con el dedo = firma electrónica simple (eIDAS): válida y admisible. Su peso
-- como prueba depende de lo que se guarde con ella: QUIÉN (nombre + documento validado),
-- CUÁNDO (hora del SERVIDOR), DESDE DÓNDE (IP y navegador) y QUÉ firmó (la huella del PDF).
-- Por eso esta tabla NO se modifica nunca: una firma corregida sería una firma falsa.
create table firmas_cmr (
  id               uuid primary key default gen_random_uuid(),
  envio_id         uuid not null references envios(id) on delete restrict,
  -- La parada donde se firma (recogida o entrega). Sin FK: append-only (ver envio_hitos).
  parada_id        uuid,
  rol              text not null check (rol in ('remitente', 'transportista', 'destinatario')),

  nombre           text not null check (length(trim(nombre)) > 0),
  documento        text not null,                  -- DATO PERSONAL (RGPD)
  documento_pais   char(2) not null default 'ES' check (documento_pais ~ '^[A-Z]{2}$'),
  documento_validado boolean not null default false,  -- pasó el control del país (DNI/NIE…)
  email            text,

  firmado_en       timestamptz not null default now(),   -- HORA DEL SERVIDOR
  ip               inet,
  navegador        text,
  firma_storage_ruta text not null,                -- la imagen del trazo, en Storage
  sha256_documento text check (sha256_documento is null or sha256_documento ~ '^[0-9a-f]{64}$'),

  constraint ux_firmas_una_por_rol unique (envio_id, parada_id, rol)
);

comment on table firmas_cmr is
  'Append-only. Valor probatorio de la firma del CMR: quien, con que documento, cuando '
  '(hora del servidor), desde donde y la huella del PDF firmado. Solo la escribe el servidor.';

create index idx_firmas_envio on firmas_cmr (envio_id);

create or replace function fn_firmas_hora_servidor()
returns trigger language plpgsql as $$
begin new.firmado_en := now(); return new; end $$;
create trigger tg_firmas_sellar before insert on firmas_cmr
  for each row execute function fn_firmas_hora_servidor();

create trigger tg_firmas_inmutable before update or delete or truncate on firmas_cmr
  for each statement execute function fn_append_only();
revoke update, delete, truncate on firmas_cmr from public, anon, authenticated;

-- Cada firma deja su hito en el envío (regla 12: "CMR firmado").
create or replace function fn_firmas_hito()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform registrar_hito(new.envio_id, 'cmr_firmado', new.parada_id, null,
    jsonb_build_object('rol', new.rol, 'nombre', new.nombre), 'servidor');
  return null;
end $$;
create trigger tg_firmas_hito after insert on firmas_cmr
  for each row execute function fn_firmas_hito();

alter table firmas_cmr enable row level security;
-- La escribe SOLO el servidor (quien firma no tiene cuenta): sin política de INSERT.
-- Dynamo ve todas; el cliente, las de sus envíos.
create policy firmas_sel on firmas_cmr for select using (
  es_admin()
  or exists (select 1 from envios e where e.id = firmas_cmr.envio_id
             and e.cliente_id = cliente_del_usuario())
);


-- =====================================================================================
-- 6. CHIVATO DE RASTRO: las append-only no llevan sellos de modificación
-- =====================================================================================
create or replace view v_tablas_sin_rastro with (security_invoker = true) as
select c.relname as tabla
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace
where  n.nspname = 'public'
  and  c.relkind = 'r'
  and  c.relname not in ('auditoria', 'recargos_tipo_lugar', 'envio_hitos', 'pin_intentos',
                         'firmas_cmr')
  and  not exists (
         select 1 from pg_trigger t
         where t.tgrelid = c.oid and t.tgname = 'tg_auditar_' || c.relname
       );
revoke all on v_tablas_sin_rastro from public, anon, authenticated;

revoke execute on function corte_cancelacion(date) from public, anon;
