-- =====================================================================================
-- PRECIOS DE LOS ALMACENES DYNAMO (2026-11-03)
-- =====================================================================================
-- En el mockup cada almacén Dynamo tiene SU tarifa (base sin IVA) y, si no se pone, se
-- usa la de por defecto, que estaba escrita en el código (240 € y 220 €):
--   · Almacenamiento: tráiler completo, 7 días / 1 semana.
--   · Reparto urbano: camión de 4 m, por reparto.
-- Las de por defecto pasan a `parametros` (se cambian sin tocar código) y cada almacén
-- puede llevar la suya. Solo los almacenes de Dynamo tienen precio: un sitio de un
-- cliente no.
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('almacen_precio_semana', '240',
   'Precio por defecto (EUR sin IVA) de almacenar un trailer completo 7 dias en un almacen '
   'Dynamo, si el almacen no tiene precio propio.'),
  ('almacen_precio_reparto', '220',
   'Precio por defecto (EUR sin IVA) de cada reparto urbano con camion de 4 m desde un '
   'almacen Dynamo, si el almacen no tiene precio propio.')
on conflict (clave) do nothing;

alter table lugares
  add column precio_almacenamiento_semana numeric(10,2)
    check (precio_almacenamiento_semana is null or precio_almacenamiento_semana >= 0),
  add column precio_reparto numeric(10,2)
    check (precio_reparto is null or precio_reparto >= 0),
  add constraint ck_lugares_precio_solo_dynamo check (
    es_almacen_dynamo or (precio_almacenamiento_semana is null and precio_reparto is null));

comment on column lugares.precio_almacenamiento_semana is
  'Solo almacenes Dynamo: precio propio (EUR sin IVA) de un trailer completo 7 dias. '
  'Vacio = el de parametros (almacen_precio_semana).';
comment on column lugares.precio_reparto is
  'Solo almacenes Dynamo: precio propio (EUR sin IVA) por reparto urbano con camion de 4 m. '
  'Vacio = el de parametros (almacen_precio_reparto).';
