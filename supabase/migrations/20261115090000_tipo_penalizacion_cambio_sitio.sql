-- Tipo de penalización «Cambio de tipo de sitio» (usuario, 2026-11-15): el cliente
-- declaró un tipo de sitio (por ejemplo almacén) y en el porte resultó otro con
-- recargo (por ejemplo una finca). Dynamo emite la penalización a mano con la
-- descripción del caso y el importe, y se factura después con ese concepto.
-- «Otro» se queda el último del desplegable.
update tipos_penalizacion set orden = 6 where clave = 'otro';
insert into tipos_penalizacion (clave, nombre, orden)
  values ('cambio_tipo_sitio', 'Cambio de tipo de sitio', 5)
  on conflict (clave) do nothing;
