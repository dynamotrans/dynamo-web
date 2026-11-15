-- CADENCIA NUEVA DE LA OFERTA ESCALONADA (usuario, 2026-11-15): tramos más agresivos.
--   · Lejos de la carga (más de 1 día): un email cada 3 minutos.
--   · Último día (menos de 24 h): cada minuto y de 3 en 3.
--   · Urgente (menos de 6 h): cada minuto y de 20 en 20.
-- Solo cambia el VALOR del parámetro difusion_cadencia (editable en Parámetros):
-- la mecánica de tramos es la misma de 20261115110000.
update parametros
   set valor = '[{"hasta_horas":6,"minutos":1,"lote":20},{"hasta_horas":24,"minutos":1,"lote":3},{"hasta_horas":null,"minutos":3}]'::jsonb
 where clave = 'difusion_cadencia';
