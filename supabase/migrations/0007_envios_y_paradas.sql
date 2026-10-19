-- =====================================================================================
-- 0007 — ENVÍOS Y PARADAS (ruta con número ILIMITADO de paradas)
-- =====================================================================================
-- Sustituye a las 42 columnas de `dy_cargas_hoja` (recogida_* + parada_1..4_* + entrega_*),
-- que ponían un techo de 4 paradas por diseño de la hoja.
--
-- MODELO: `envios` NO lleva direcciones. Toda la ruta vive en `envio_paradas`, una fila
-- por punto, con `orden` correlativo sobre TODA la ruta sin separar cargas de descargas:
--
--   4 recogidas + 2 entregas → orden 1,2,3,4 (carga) · 5,6 (descarga)
--   ruta mixta               → 1 carga · 2 descarga · 3 carga · 4 descarga
--
--   ORIGEN  = la parada con el `orden` más bajo
--   DESTINO = la parada con el `orden` más alto
--
-- Nada de direccion_1/direccion_2 ni jsonb.
-- =====================================================================================


-- =====================================================================================
-- 1. AYUDANTES DE RLS  (los reutiliza la migración 0012)
-- =====================================================================================
create or replace function es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuarios
    where id = auth.uid() and rol in ('admin','empleado') and estado = 'activa'
  )
$$;

create or replace function cliente_del_usuario()
returns uuid language sql stable security definer set search_path = public as $$
  select cliente_id from usuarios
  where id = auth.uid() and rol = 'cliente' and estado = 'activa'
$$;

create or replace function transportista_del_usuario()
returns uuid language sql stable security definer set search_path = public as $$
  select transportista_id from usuarios
  where id = auth.uid() and rol = 'transportista' and estado = 'activa'
$$;

comment on function es_admin() is
  'Ayudante de RLS. SECURITY DEFINER porque la politica necesita leer `usuarios` sin '
  'quedar atrapada en la RLS de `usuarios`.';


-- =====================================================================================
-- 2. ENVÍOS
-- =====================================================================================
create table envios (
  id                     uuid primary key default gen_random_uuid(),

  -- ---- Identidad -------------------------------------------------------------------
  -- GX + 9 digitos = 11 caracteres, paso +7 (diccionario del Sheet, migración 0001).
  referencia_gx          text not null unique
                           default ('GX' || nextval('seq_gx'))
                           check (referencia_gx ~ '^GX[0-9]{9}$'),
  -- El GX es un correlativo de paso fijo → ENUMERABLE. El enlace público de
  -- aceptar-carga NUNCA lleva el GX: lleva este token aleatorio.
  token_publico          uuid not null unique default gen_random_uuid(),
  referencia_cliente     text,                       -- la ref. interna del cliente

  cliente_id             uuid not null references clientes(id) on delete restrict,

  -- ---- Estado ----------------------------------------------------------------------
  estado                 estado_envio      not null default 'borrador',
  estado_asignacion      estado_asignacion not null default 'sin_asignar',

  -- ---- Transportista asignado: FK al maestro + COPIA CONGELADA ---------------------
  -- Las dos cosas (SUPABASE.md §4): la FK para navegar y avisar de un seguro que
  -- caduca; la copia porque un camión se vende y un conductor se va, y el CMR del año
  -- pasado tiene que seguir diciendo la matrícula que REALMENTE cargó.
  transportista_id       uuid references transportistas(id) on delete restrict,
  vehiculo_tractora_id   uuid references vehiculos(id)      on delete set null,
  vehiculo_remolque_id   uuid references vehiculos(id)      on delete set null,
  conductor_id           uuid references conductores(id)    on delete set null,
  matricula_tractora     text,
  matricula_remolque     text,
  conductor_nombre       text,
  conductor_telefono     text,
  transportista_nima     text,

  -- ---- Ventana COMERCIAL de carga (la cita concreta va en cada parada) -------------
  fecha_carga_desde      date,
  fecha_carga_hasta      date,
  fecha_carga_real       date,
  fecha_entrega_estimada date,

  -- ---- Mercancía -------------------------------------------------------------------
  descripcion_mercancia  varchar(500),
  toneladas              numeric(6,2) check (toneladas is null or toneladas > 0),
  metros_lineales        numeric(5,2) check (metros_lineales is null or metros_lineales > 0),
  -- Completa vs grupaje NO se guarda: se DERIVA de los metros (SUPABASE.md §10.10).
  tipo_carga             tipo_carga
                           generated always as
                           (case when metros_lineales >= 13.30 then 'completa'::tipo_carga
                                 else 'grupaje'::tipo_carga end) stored,

  -- Banderas de carga: dos ejes independientes, 1:1 con el fichero de Wtransnet
  -- (Paletizado | Arriba | Lateral | Detrás | Sirve Lateral Bajo). SUPABASE.md §10.8.
  paletizado             boolean not null default true,
  carga_lateral          boolean not null default true,
  carga_superior         boolean not null default false,
  carga_trasera          boolean not null default true,
  carga_lateral_bajo     boolean not null default false,
  plataforma_elevadora   boolean not null default false,
  nima_requerido         boolean not null default false,
  adr                    boolean not null default false,

  -- ---- Importes: FK a nada, son dinero. El DESGLOSE congelado va en 0010 -----------
  importe_cliente        numeric(12,2) check (importe_cliente is null or importe_cliente >= 0),
  importe_transportista  numeric(12,2) check (importe_transportista is null or importe_transportista >= 0),
  moneda                 char(3) not null default 'EUR',
  -- Calculados: nunca se guardan a mano.
  margen_euros           numeric(12,2)
                           generated always as (importe_cliente - importe_transportista) stored,
  -- Snapshot de lo APLICADO ese día (SUPABASE.md §4): la ficha del cliente cambia después.
  factor_tarifa_aplicado numeric(5,2),
  iva_aplicado           numeric(5,2),
  retencion_aplicada     numeric(5,2),
  plazo_pago_aplicado    integer,
  precio_fijado_a_mano   boolean not null default false,

  -- ---- Ruta: CLAVE DE BÚSQUEDA, mantenida por trigger desde las paradas ------------
  -- Al normalizar la ruta, el CP de origen y destino dejan de estar en `envios`, y sin
  -- ellos el índice de "último precio de ESTA ruta para ESTE cliente" (SUPABASE.md §4)
  -- no se puede crear. Se denormalizan AQUÍ, pero NO a mano: las pone un trigger desde
  -- `envio_paradas`, así que no pueden desincronizarse. No es caché de un precio
  -- calculado: es la clave de la ruta.
  cp_origen              text,
  poblacion_origen       text,
  cp_destino             text,
  poblacion_destino      text,
  num_paradas            smallint not null default 0,
  km_total               numeric(7,2),

  -- ---- Sincronización externa ------------------------------------------------------
  pedido_venta_holded    text,
  pedido_compra_holded   text,
  publicado_en_bolsa_en  timestamptz,
  discrecion_comercial   boolean not null default false,
  anotaciones_cliente    varchar(1000),

  -- ---- Regla 12 --------------------------------------------------------------------
  creado_en              timestamptz not null default now(),
  creado_por             uuid references auth.users(id) on delete set null,
  modificado_en          timestamptz,
  modificado_por         uuid references auth.users(id) on delete set null,

  constraint ck_envios_ventana check (
    fecha_carga_hasta is null or fecha_carga_desde is null
    or fecha_carga_hasta >= fecha_carga_desde
  )
);

comment on column envios.token_publico is
  'Identificador aleatorio para el enlace publico de aceptar-carga. El GX NO vale ahi: '
  'es un correlativo de paso +7, asi que 1 de cada 7 numeros adivina un envio ajeno.';
comment on column envios.cp_origen is
  'Denormalizado desde envio_paradas por el trigger tg_envios_ruta. NO se escribe a mano.';
comment on column envios.tipo_carga is
  'DERIVADO de metros_lineales (>= 13,30 m = completa). No es una lista que mantener.';

create index idx_envios_cliente   on envios (cliente_id, fecha_carga_desde desc);
create index idx_envios_estado    on envios (estado, fecha_carga_desde);
create index idx_envios_transp    on envios (transportista_id) where transportista_id is not null;
create index idx_envios_sin_asig  on envios (fecha_carga_desde)
  where estado = 'programado' and transportista_id is null;
-- EL índice del tarifador: "ultimo precio de esta ruta para este cliente" (§4).
create index idx_envios_ruta_cliente
  on envios (cliente_id, cp_origen, cp_destino, fecha_carga_desde desc);
-- Y la misma ruta para cualquier cliente (media de la ruta a 15 dias).
create index idx_envios_ruta on envios (cp_origen, cp_destino, fecha_carga_desde desc);

select activar_rastro('envios');


-- =====================================================================================
-- 3. ENVIO_PARADAS — una fila por punto de la ruta
-- =====================================================================================
create table envio_paradas (
  id                 uuid primary key default gen_random_uuid(),
  envio_id           uuid     not null references envios(id) on delete cascade,
  orden              smallint not null check (orden > 0),
  tipo               text     not null check (tipo in ('carga','descarga')),

  -- ---- La agenda de sitios: FK + COPIA CONGELADA -----------------------------------
  -- `lugares` (migración 0005) es el catálogo con buscador, recientes, notas privadas
  -- por cliente y detección de duplicados. La parada apunta ahí...
  lugar_id           uuid references lugares(id) on delete set null,
  -- ...y ADEMÁS guarda la dirección tal como estaba el día del viaje, porque un lugar
  -- se puede editar y el CMR de hace un año tiene que seguir diciendo a dónde se fue.
  nombre_empresa     text,
  direccion          text,                      -- calle y número, SOLO eso
  cp                 text,                      -- TEXTO: '08185' como número sería 8185
  poblacion          text,
  provincia          text,
  pais_codigo_iso    char(2) not null default 'ES' check (pais_codigo_iso ~ '^[A-Z]{2}$'),
  lat                numeric(9,6) check (lat is null or lat between  -90 and  90),
  lon                numeric(9,6) check (lon is null or lon between -180 and 180),

  -- ---- Cita concreta en este punto -------------------------------------------------
  fecha_desde        timestamptz,
  fecha_hasta        timestamptz,
  hora_real          timestamptz,               -- cuándo se hizo DE VERDAD

  referencia         text,                      -- ref. de carga/descarga del cliente
  observaciones      text,
  km_hasta_siguiente numeric(7,2) check (km_hasta_siguiente is null
                                         or (km_hasta_siguiente > 0 and km_hasta_siguiente < 6000)),

  creado_en          timestamptz not null default now(),
  creado_por         uuid references auth.users(id) on delete set null,
  modificado_en      timestamptz,
  modificado_por     uuid references auth.users(id) on delete set null,

  -- DEFERRABLE a propósito: sin esto, reordenar paradas es imposible. Un
  -- `update ... set orden = orden + 1` choca consigo mismo a mitad del recorrido,
  -- porque el UNIQUE se comprueba fila a fila. Con DEFERRABLE se puede pedir
  -- `set constraints ux_envio_paradas_orden deferred` y validar al hacer commit.
  constraint ux_envio_paradas_orden unique (envio_id, orden) deferrable initially immediate,

  constraint ck_paradas_ventana check (
    fecha_hasta is null or fecha_desde is null or fecha_hasta >= fecha_desde
  )
);

comment on table envio_paradas is
  'Una fila por punto de la ruta, cargas y descargas en UNA sola secuencia `orden`. '
  'Origen = min(orden), destino = max(orden). Sin techo de paradas.';
comment on constraint ux_envio_paradas_orden on envio_paradas is
  'DEFERRABLE para poder reordenar: un update masivo de `orden` choca consigo mismo '
  'si el UNIQUE se valida fila a fila.';

create index idx_paradas_envio      on envio_paradas (envio_id, orden);
create index idx_paradas_poblacion  on envio_paradas (poblacion);
create index idx_paradas_cp         on envio_paradas (cp);
create index idx_paradas_lugar      on envio_paradas (lugar_id) where lugar_id is not null;
create index idx_paradas_fecha      on envio_paradas (fecha_desde);

select activar_rastro('envio_paradas');


-- =====================================================================================
-- 4. ORIGEN Y DESTINO: los mantiene un TRIGGER, no la aplicación
-- =====================================================================================
create or replace function fn_envios_refrescar_ruta()
returns trigger language plpgsql as $$
declare
  v_envio uuid := coalesce(new.envio_id, old.envio_id);
begin
  update envios e set
    cp_origen        = o.cp,
    poblacion_origen = o.poblacion,
    cp_destino       = d.cp,
    poblacion_destino= d.poblacion,
    num_paradas      = coalesce(n.total, 0),
    km_total         = n.km
  from (select count(*) total, sum(km_hasta_siguiente) km
          from envio_paradas where envio_id = v_envio) n
  left join lateral (select cp, poblacion from envio_paradas
                     where envio_id = v_envio order by orden asc  limit 1) o on true
  left join lateral (select cp, poblacion from envio_paradas
                     where envio_id = v_envio order by orden desc limit 1) d on true
  where e.id = v_envio;
  return null;
end $$;

create trigger tg_envios_ruta
  after insert or update or delete on envio_paradas
  for each row execute function fn_envios_refrescar_ruta();

comment on function fn_envios_refrescar_ruta() is
  'Mantiene cp_origen/cp_destino/num_paradas/km_total en `envios` desde las paradas. '
  'Por trigger y no desde la app: asi no se pueden desincronizar.';


-- =====================================================================================
-- 5. LA RUTA TIENE QUE TENER SENTIDO (pero un borrador puede estar a medias)
-- =====================================================================================
create or replace function validar_ruta_envio(p_envio uuid)
returns void language plpgsql as $$
declare v_total int; v_primera text; v_ultima text; v_gx text;
begin
  select count(*) into v_total from envio_paradas where envio_id = p_envio;
  select referencia_gx into v_gx from envios where id = p_envio;

  if v_total < 2 then
    raise exception 'El envio % necesita al menos 2 paradas (una carga y una descarga); tiene %.',
      v_gx, v_total;
  end if;

  select tipo into v_primera from envio_paradas where envio_id = p_envio order by orden asc  limit 1;
  select tipo into v_ultima  from envio_paradas where envio_id = p_envio order by orden desc limit 1;

  if v_primera <> 'carga' then
    raise exception 'La primera parada del envio % tiene que ser una CARGA (es %).', v_gx, v_primera;
  end if;
  if v_ultima <> 'descarga' then
    raise exception 'La ultima parada del envio % tiene que ser una DESCARGA (es %).', v_gx, v_ultima;
  end if;
end $$;

-- Al salir de borrador se exige ruta completa. Mientras es borrador, el asistente de
-- 4 pasos puede guardar a medias sin pelearse con la base de datos.
create or replace function fn_envios_validar_al_confirmar()
returns trigger language plpgsql as $$
begin
  if old.estado = 'borrador' and new.estado <> 'borrador' then
    perform validar_ruta_envio(new.id);
  end if;
  return new;
end $$;

create trigger tg_envios_validar_al_confirmar
  before update of estado on envios
  for each row execute function fn_envios_validar_al_confirmar();

-- Y una vez confirmado, no se puede dejar la ruta coja quitando paradas.
create or replace function fn_paradas_proteger_ruta()
returns trigger language plpgsql as $$
declare v_estado estado_envio;
begin
  select estado into v_estado from envios where id = old.envio_id;
  if v_estado is not null and v_estado not in ('borrador','cancelado') then
    perform validar_ruta_envio(old.envio_id);
  end if;
  return null;
end $$;

create constraint trigger tg_paradas_proteger_ruta
  after delete or update on envio_paradas
  deferrable initially deferred
  for each row execute function fn_paradas_proteger_ruta();


-- =====================================================================================
-- 6. REORDENAR / RENUMERAR
-- =====================================================================================
-- `orden` solo tiene que ser creciente y único; los huecos son inofensivos (origen y
-- destino se calculan con min/max). Forzar 1..n sin huecos obligaría a reescribir toda
-- la ruta en cada borrado. Cuando se quiera compactar, esta función lo hace.
create or replace function renumerar_paradas(p_envio uuid)
returns void language plpgsql as $$
begin
  set constraints all deferred;
  with nuevo as (
    select id, row_number() over (order by orden) n from envio_paradas where envio_id = p_envio
  )
  update envio_paradas p set orden = nuevo.n from nuevo
  where p.id = nuevo.id and p.orden <> nuevo.n;
end $$;

comment on function renumerar_paradas(uuid) is
  'Compacta `orden` a 1..n. Usa SET CONSTRAINTS DEFERRED porque el UNIQUE chocaria '
  'consigo mismo a mitad del update.';


-- =====================================================================================
-- 7. LEER UN ENVÍO CON SUS PARADAS ORDENADAS
-- =====================================================================================
create or replace view v_envios_con_paradas as
select e.*,
       (select jsonb_agg(jsonb_build_object(
                 'id', p.id, 'orden', p.orden, 'tipo', p.tipo,
                 'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion,
                 'cp', p.cp, 'poblacion', p.poblacion, 'provincia', p.provincia,
                 'pais', p.pais_codigo_iso, 'lat', p.lat, 'lon', p.lon,
                 'fecha_desde', p.fecha_desde, 'fecha_hasta', p.fecha_hasta,
                 'hora_real', p.hora_real, 'referencia', p.referencia,
                 'observaciones', p.observaciones, 'km_hasta_siguiente', p.km_hasta_siguiente)
                 order by p.orden)                       -- <-- SIEMPRE ordenadas
        from envio_paradas p where p.envio_id = e.id) as paradas
from envios e;

comment on view v_envios_con_paradas is
  'Un envio con sus paradas ya ordenadas por `orden`. Desde PostgREST tambien sirve '
  'select=*,envio_paradas(*)&envio_paradas.order=orden.';

-- REGLA 11 (anti-desintermediación): al CLIENTE se le oculta el contacto del
-- transportista en cuanto el envío está entregado o cancelado. RLS filtra FILAS, no
-- columnas → hace falta una vista. El admin sigue viéndolo todo.
create or replace view v_envios_cliente as
select e.id, e.referencia_gx, e.referencia_cliente, e.cliente_id, e.estado,
       e.estado_asignacion, e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real,
       e.fecha_entrega_estimada, e.descripcion_mercancia, e.toneladas, e.metros_lineales,
       e.tipo_carga, e.paletizado, e.carga_lateral, e.carga_superior, e.carga_trasera,
       e.plataforma_elevadora, e.nima_requerido, e.adr,
       e.cp_origen, e.poblacion_origen, e.cp_destino, e.poblacion_destino, e.num_paradas,
       e.importe_cliente, e.moneda, e.anotaciones_cliente, e.creado_en, e.modificado_en,
       e.matricula_tractora, e.matricula_remolque,
       case when e.estado in ('entregado','cancelado') then null
            else e.conductor_nombre end   as conductor_nombre,
       case when e.estado in ('entregado','cancelado') then null
            else e.conductor_telefono end as conductor_telefono
       -- NUNCA: importe_transportista, margen_euros, factor_tarifa_aplicado,
       --        transportista_id, transportista_nima, precio_fijado_a_mano
from envios e;

comment on view v_envios_cliente is
  'Vista del rol CLIENTE. Aplica la regla 11 (el telefono del conductor desaparece al '
  'entregar o cancelar) y oculta el precio del transportista, el margen y el factor de '
  'tarifa, que son SOLO ADMIN.';


-- =====================================================================================
-- 8. RLS
-- =====================================================================================
alter table envios        enable row level security;
alter table envio_paradas enable row level security;

-- ENVÍOS
create policy envios_sel on envios for select using (
  es_admin()
  or cliente_id = cliente_del_usuario()
  or transportista_id = transportista_del_usuario()
);
create policy envios_ins on envios for insert with check (
  es_admin() or cliente_id = cliente_del_usuario()
);
-- El cliente solo toca lo suyo y solo mientras no está en ruta.
create policy envios_upd on envios for update using (
  es_admin()
  or (cliente_id = cliente_del_usuario() and estado in ('borrador','programado'))
) with check (
  es_admin() or cliente_id = cliente_del_usuario()
);
-- SIN política de DELETE a propósito: un envío NO se borra, se cancela. Así queda su
-- rastro, su auditoría y sus penalizaciones.

-- PARADAS: heredan el permiso de su envío.
create policy paradas_sel on envio_paradas for select using (
  exists (select 1 from envios e where e.id = envio_id)
);
create policy paradas_ins on envio_paradas for insert with check (
  exists (select 1 from envios e where e.id = envio_id
          and (es_admin() or e.cliente_id = cliente_del_usuario()))
);
create policy paradas_upd on envio_paradas for update using (
  exists (select 1 from envios e where e.id = envio_id
          and (es_admin() or (e.cliente_id = cliente_del_usuario()
                              and e.estado in ('borrador','programado'))))
);
create policy paradas_del on envio_paradas for delete using (
  exists (select 1 from envios e where e.id = envio_id
          and (es_admin() or (e.cliente_id = cliente_del_usuario()
                              and e.estado in ('borrador','programado'))))
);

-- El `exists` de paradas_sel se apoya en la RLS de `envios`: si el usuario no ve el
-- envío, el subselect no devuelve fila y la parada queda fuera. Una sola regla de
-- visibilidad, en un sitio.
