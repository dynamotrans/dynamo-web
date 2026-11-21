-- Límites de consultas de precio más altos (usuario, 2026-11-21: «subir ese límite en
-- Parámetros, ya que son como envíos nuevos creados normal»). «Crear varios envíos» enseña
-- hasta 20 precios de una vez y cada fila cuenta como una consulta: con 15 al día, un cliente
-- que creara 20 envíos de golpe quedaría suspendido. Nuevos valores: 30 al día, 100 a la
-- semana y 300 al mes. Solo se cambian si siguen con el valor de fábrica (si Dynamo ya los
-- había tocado en Parámetros, se respetan). Se pueden cambiar en Parámetros cuando se quiera.
update public.parametros set valor = '30'::jsonb  where clave = 'autosuspension_consultas_dia'    and valor = '15'::jsonb;
update public.parametros set valor = '100'::jsonb where clave = 'autosuspension_consultas_semana' and valor = '30'::jsonb;
update public.parametros set valor = '300'::jsonb where clave = 'autosuspension_consultas_mes'    and valor = '60'::jsonb;
