-- =====================================================================================
-- EXPORTACIONES: Holded (pedidos de venta y de compra) y Wtransnet (bolsa de carga)
-- =====================================================================================
-- Tres vistas que devuelven, COLUMNA A COLUMNA Y EN EL MISMO ORDEN, las plantillas que
-- el usuario ya usa en su Sheet:
--
--   v_holded_pedido_venta   = pestaña dy_holded_pedido_venta  (33 columnas)
--   v_holded_pedido_compra  = pestaña dy_holded_pedido_compra (34 columnas)
--   v_wtransnet             = pestaña dy_fichero_wtransnet    (29 columnas)
--
-- Los nombres de columna van ENTRE COMILLAS, idénticos a los de la plantilla
-- ("Num Pedido (referencia_gx_carga)", "IVA %"...). Así, pedir la vista en CSV a la API
-- de Supabase ya da el fichero listo para importar, con la cabecera exacta.
--
-- Solo las ve DYNAMO: son vistas security_invoker sobre `envios`, que solo lee Dynamo.
-- Los nombres de Holded NUNCA aparecen en la interfaz del cliente (regla del 2026-06).
-- =====================================================================================


-- =====================================================================================
-- 0. LO QUE FALTABA EN `envios` PARA LAS COLUMNAS DE CONTROL
-- =====================================================================================
-- "EN HOLDED?"  → sale solo: hay número de pedido de Holded guardado o no.
-- "ALB REC?"    → sale solo: hay un documento 'albaran' en el envío o no.
-- "FACTURADO?"  → esto sí hay que marcarlo: si ya se facturó (venta) o si ya llegó la
--                 factura del transportista (compra).
alter table envios add column facturado_venta  boolean not null default false;
alter table envios add column facturado_compra boolean not null default false;
comment on column envios.facturado_venta  is 'Ya facturado al cliente (columna FACTURADO? de la venta de Holded).';
comment on column envios.facturado_compra is 'Ya recibida la factura del transportista (FACTURADO? de la compra).';

-- Ajustes de Holded y de la bolsa: los rellena el usuario en `parametros`, sin tocar código.
insert into parametros (clave, valor, descripcion) values
  ('holded_formato_numeracion_venta',  '""', 'Columna "Formato de numeracion" del pedido de venta de Holded (la serie).'),
  ('holded_formato_numeracion_compra', '""', 'Columna "Formato de numeracion" del pedido de compra de Holded.'),
  ('holded_canal_venta_nombre',        '""', 'Columna "Nombre canal de venta" de Holded (venta).'),
  ('holded_canal_venta_cuenta',        '""', 'Columna "Cuenta canal de venta" de Holded (venta): la cuenta contable de ingresos.'),
  ('holded_canal_compra_nombre',       '""', 'Columna "Nombre canal de venta" de Holded (compra).'),
  ('holded_canal_compra_cuenta',       '""', 'Columna "Cuenta canal de venta" de Holded (compra): la cuenta contable de gastos.'),
  ('bolsa_espera_minutos',             '3',
   'Minutos que espera un envio, desde que se crea o se modifica por ultima vez, antes de '
   'salir en el fichero de la bolsa (para no publicarlo veinte veces mientras se corrige).');


-- =====================================================================================
-- 1. AYUDANTES
-- =====================================================================================
-- Fecha en el formato de las plantillas: dd/mm/yyyy.
create or replace function fecha_ddmmyyyy(p date)
returns text language sql immutable as $$ select to_char(p, 'DD/MM/YYYY') $$;

-- "Operación" de Holded según el país del cliente o del transportista.
-- ⚠️ A CONFIRMAR con el asesor: es la regla habitual del IVA en transporte (España →
-- general; resto de la UE → intracomunitaria; fuera de la UE → exportación), pero los
-- textos exactos que espera Holded hay que verlos en una importación real.
create or replace function holded_operacion(p_pais char(2))
returns text language sql immutable as $$
  select case
    when coalesce(p_pais, 'ES') = 'ES' then 'general'
    when p_pais in ('PT','FR','DE','IT','NL','BE','LU','AT','PL','CZ','IE','DK','SE','FI',
                    'SK','SI','HR','HU','RO','BG','GR','EE','LV','LT','CY','MT') then 'intracomunitaria'
    else 'exportacion'
  end
$$;

-- S/N de las plantillas de Wtransnet.
create or replace function sn(p boolean)
returns text language sql immutable as $$ select case when p then 'S' else 'N' end $$;

-- Las LÍNEAS de cada pedido: el porte, más las penalizaciones confirmadas. Holded las
-- importa como líneas del mismo pedido porque comparten "Num Pedido".
create or replace view v_lineas_pedido with (security_invoker = true) as
  -- El porte (un envío cancelado no se factura como porte; su penalización, sí)
  select e.id as envio_id, 1 as orden, 'porte'::tipo_concepto as concepto,
         'Porte ' || e.referencia_gx || ' · ' ||
           coalesce(e.poblacion_origen, '?') || ' (' || coalesce(e.cp_origen, '') || ') → ' ||
           coalesce(e.poblacion_destino, '?') || ' (' || coalesce(e.cp_destino, '') || ')' ||
           coalesce(' · ' || fecha_ddmmyyyy(coalesce(e.fecha_carga_real, e.fecha_carga_desde)), '') ||
           coalesce(' · ' || e.matricula_camion, '')                       as descripcion,
         e.importe_cliente       as precio_venta,
         e.importe_transportista as precio_compra
    from envios e
   where e.operador_id is null and e.estado not in ('borrador', 'cancelado')
  union all
  -- Cada penalización confirmada, como línea propia
  select p.envio_id, 2, case t.clave when 'paralizacion' then 'paralizacion'::tipo_concepto
                                     else 'penalizacion'::tipo_concepto end,
         t.nombre || ' ' || p.codigo || coalesce(' · ' || p.descripcion, ''),
         p.importe_cliente, p.importe_transportista
    from penalizaciones p join tipos_penalizacion t on t.id = p.tipo_id
   where p.estado = 'confirmada';

comment on view v_lineas_pedido is
  'Lineas de cada pedido para Holded: el porte y las penalizaciones confirmadas.';


-- =====================================================================================
-- 2. HOLDED · PEDIDO DE VENTA (al cliente) — 33 columnas, orden de la plantilla
-- =====================================================================================
create or replace view v_holded_pedido_venta with (security_invoker = true) as
select
  e.estado::text                                                    as "ESTADO VIAJE",
  case when e.pedido_venta_holded is not null then 'SI' else 'NO' end as "EN HOLDED?",
  case when e.facturado_venta then 'SI' else 'NO' end               as "FACTURADO?",
  case when exists (select 1 from documentos d where d.envio_id = e.id
                    and d.tipo = 'albaran' and not d.borrado) then 'SI' else 'NO' end as "ALB REC?",
  coalesce(e.plazo_pago_aplicado, c.plazo_pago_dias)                as "PLAZO PAGO",
  e.referencia_gx                                                   as "Num Pedido (referencia_gx_carga)",
  (select valor #>> '{}' from parametros where clave = 'holded_formato_numeracion_venta')
                                                                    as "Formato de numeración",
  fecha_ddmmyyyy(coalesce(e.fecha_carga_real, e.fecha_carga_desde)) as "Fecha dd/mm/yyyy",
  fecha_ddmmyyyy(coalesce(e.fecha_carga_real, e.fecha_carga_desde)
                 + coalesce(e.plazo_pago_aplicado, c.plazo_pago_dias)) as "Fecha de vencimiento dd/mm/yyyy",
  coalesce(e.referencia_cliente, '')                                as "Descripción",
  c.razon_social                                                    as "Nombre del contacto",
  c.cif                                                             as "NIF",
  c.direccion                                                       as "Dirección",
  c.poblacion                                                       as "Población",
  c.codigo_postal                                                   as "Código postal",
  c.provincia                                                       as "Provincia",
  c.pais_codigo_iso                                                 as "País",
  l.concepto::text                                                  as "Concepto",
  l.descripcion                                                     as "Descripción del producto",
  ''::text                                                          as "SKU",
  l.precio_venta                                                    as "Precio unidad",
  1                                                                 as "Unidades",
  0                                                                 as "Descuento %",
  coalesce(e.iva_aplicado, c.iva_porcentaje)                        as "IVA %",
  coalesce(e.retencion_aplicada, c.retencion_porcentaje)            as "Retención %",
  c.recargo_equivalencia_porcentaje                                 as "Rec. de eq. %",
  holded_operacion(c.pais_codigo_iso)                               as "Operación",
  c.forma_pago_holded_id                                            as "Forma de pago (ID)",
  array_to_string(c.tags, '-')                                      as "Tags separados por -",
  (select valor #>> '{}' from parametros where clave = 'holded_canal_venta_nombre')
                                                                    as "Nombre canal de venta",
  (select valor #>> '{}' from parametros where clave = 'holded_canal_venta_cuenta')
                                                                    as "Cuenta canal de venta",
  e.moneda                                                          as "Moneda",
  1                                                                 as "Cambio de moneda"
from v_lineas_pedido l
join envios   e on e.id = l.envio_id
join clientes c on c.id = e.cliente_id
where l.precio_venta is not null;

comment on view v_holded_pedido_venta is
  'Fichero de importacion de PEDIDOS DE VENTA de Holded, identico a dy_holded_pedido_venta. '
  'Una fila por linea (porte + penalizaciones confirmadas). Solo Dynamo.';


-- =====================================================================================
-- 3. HOLDED · PEDIDO DE COMPRA (al transportista) — 34 columnas
-- =====================================================================================
create or replace view v_holded_pedido_compra with (security_invoker = true) as
select
  e.estado::text                                                    as "ESTADO VIAJE",
  case when e.pedido_compra_holded is not null then 'SI' else 'NO' end as "EN HOLDED?",
  case when e.facturado_compra then 'SI' else 'NO' end              as "FACTURADO?",
  case when exists (select 1 from documentos d where d.envio_id = e.id
                    and d.tipo = 'albaran' and not d.borrado) then 'SI' else 'NO' end as "ALB REC?",
  t.plazo_pago_dias                                                 as "PLAZO PAGO",
  e.referencia_gx                                                   as "Num Pedido (referencia_gx_carga)",
  (select valor #>> '{}' from parametros where clave = 'holded_formato_numeracion_compra')
                                                                    as "Formato de numeración",
  fecha_ddmmyyyy(coalesce(e.fecha_carga_real, e.fecha_carga_desde)) as "Fecha dd/mm/yyyy",
  fecha_ddmmyyyy(coalesce(e.fecha_carga_real, e.fecha_carga_desde) + t.plazo_pago_dias)
                                                                    as "Fecha de vencimiento dd/mm/yyyy",
  coalesce(e.matricula_camion, '')                                  as "Descripción",
  t.razon_social                                                    as "Nombre del contacto",
  t.cif                                                             as "NIF",
  t.direccion                                                       as "Dirección",
  t.poblacion                                                       as "Población",
  t.codigo_postal                                                   as "Código postal",
  t.provincia                                                       as "Provincia",
  t.pais_codigo_iso                                                 as "País",
  l.concepto::text                                                  as "Concepto",
  l.descripcion                                                     as "Descripción del producto",
  ''::text                                                          as "SKU",
  l.precio_compra                                                   as "Precio unidad",
  1                                                                 as "Unidades",
  case when e.estado = 'entregado' then 1 else 0 end                as "Unidades recibidas",
  0                                                                 as "Descuento",
  t.iva_porcentaje                                                  as "IVA %",
  t.retencion_porcentaje                                            as "Retención %",
  0                                                                 as "Rec. de eq. %",
  holded_operacion(t.pais_codigo_iso)                               as "Operación",
  t.forma_pago_holded_id                                            as "Forma de pago (ID)",
  array_to_string(t.tags, '-')                                      as "Tags separados por -",
  (select valor #>> '{}' from parametros where clave = 'holded_canal_compra_nombre')
                                                                    as "Nombre canal de venta",
  (select valor #>> '{}' from parametros where clave = 'holded_canal_compra_cuenta')
                                                                    as "Cuenta canal de venta",
  t.moneda                                                          as "Moneda",
  1                                                                 as "Cambio de moneda"
from v_lineas_pedido l
join envios         e on e.id = l.envio_id
join transportistas t on t.id = e.transportista_id
where l.precio_compra is not null;

comment on view v_holded_pedido_compra is
  'Fichero de importacion de PEDIDOS DE COMPRA de Holded, identico a dy_holded_pedido_compra. '
  'Una fila por linea. Solo envios con transportista asignado. Solo Dynamo.';


-- =====================================================================================
-- 4. WTRANSNET · fichero de la bolsa — 29 columnas
-- =====================================================================================
-- Qué sale: envíos de Dynamo PROGRAMADOS y SIN transportista confirmado, que llevan al
-- menos `bolsa_espera_minutos` sin tocarse (decisión 2026-09: no publicar mientras se
-- está corrigiendo la carga).
--
-- ⚠️ A CONFIRMAR con un fichero real de Wtransnet: los textos exactos que espera en
-- "Tipo Bolsa", "Tipo Vehiculo" y "Especialidad" (aquí: Completa/Grupaje, Trailer/Rigido
-- y Lona) y si "Peso" va en kg o en toneladas (aquí en kg).
-- "CLIENTE" es una columna INTERNA de la hoja del usuario: si el envío lleva discreción
-- comercial, sale vacía. "Comentarios Públicos" sale SIEMPRE vacía (ver abajo).
create or replace view v_wtransnet with (security_invoker = true) as
select
  e.estado::text                                                    as "ESTADO VIAJE",
  case when e.discrecion_comercial or c.discrecion_comercial then ''
       else coalesce(c.nombre_visible, '') end                      as "CLIENTE",
  e.referencia_gx                                                   as "REF.",
  coalesce(e.referencia_cliente, '')                                as "Referencia",
  fecha_ddmmyyyy(e.fecha_carga_desde)                               as "Fecha disponibilidad",
  o.pais_codigo_iso                                                 as "País origen",
  e.cp_origen                                                       as "CP origen",
  e.poblacion_origen                                                as "Localidad origen",
  d.pais_codigo_iso                                                 as "País destino",
  e.cp_destino                                                      as "CP destino",
  e.poblacion_destino                                               as "Localidad destino",
  case when e.tipo_carga = 'completa' then 'Completa' else 'Grupaje' end as "Tipo Bolsa",
  case when e.plataforma_elevadora then 'Rigido' else 'Trailer' end as "Tipo Vehiculo",
  'Lona'::text                                                      as "Especialidad",
  round(e.toneladas * 1000)                                         as "Peso",
  e.metros_lineales                                                 as "Largo",
  sn(e.adr)                                                         as "Adr",
  sn(e.paletizado)                                                  as "Paletizado",
  'N'::text                                                         as "Intercambio Palets",
  'N'::text                                                         as "Localizador GPS",
  sn(e.carga_superior)                                              as "Arriba",
  sn(e.carga_lateral)                                               as "Lateral",
  sn(e.carga_trasera)                                               as "Detrás",
  'N'::text                                                         as "Sirve Frigorifico",
  sn(e.carga_lateral_bajo)                                          as "Sirve Lateral Bajo",
  'N'::text                                                         as "Misma Especialidad",
  -- VACÍO a propósito: es un texto PÚBLICO en la bolsa, y las anotaciones del cliente
  -- pueden llevar nombres, teléfonos o su cliente final. Que no se publiquen solas.
  ''::text                                                          as "Comentarios Públicos",
  e.importe_transportista                                           as "Precio",
  'N'::text                                                         as "Activar Serv. Alerta"
from envios e
join clientes c on c.id = e.cliente_id
left join lateral (select pais_codigo_iso from envio_paradas
                    where envio_id = e.id order by orden asc  limit 1) o on true
left join lateral (select pais_codigo_iso from envio_paradas
                    where envio_id = e.id order by orden desc limit 1) d on true
where e.operador_id is null
  and e.estado = 'programado'
  and e.estado_asignacion in ('sin_asignar', 'ofertada')
  and coalesce(e.modificado_en, e.creado_en) <= now() - make_interval(mins =>
        coalesce((select (valor #>> '{}')::int from parametros where clave = 'bolsa_espera_minutos'), 3));

comment on view v_wtransnet is
  'Fichero de subida a Wtransnet, identico a dy_fichero_wtransnet. Envios programados sin '
  'transportista, quietos desde hace bolsa_espera_minutos. Solo Dynamo.';
