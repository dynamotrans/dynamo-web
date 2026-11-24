-- «ASIGNANDO TRANSPORTISTA» A 12 HORAS DE PODER CARGAR (usuario, 2026-11-24; antes 36 h).
-- Un envío sin transportista se ve «Programado» hasta que faltan estas horas para la primera
-- posibilidad de cargar (primer día de la ventana, a la hora en que abre la 1.ª parada);
-- desde entonces, «Asignando transportista». Solo cambia lo que se VE: cuándo se ofrece la
-- carga a los transportistas lo deciden los parámetros de la difusión, que no se tocan.
-- Si alguien ya había puesto a mano otro valor en Parámetros, se respeta.
update parametros set valor = '12'::jsonb
 where clave = 'seguimiento_horas_asignando' and valor = '36'::jsonb;
