-- SEGUIMIENTO AUTOMÁTICO DEL ENVÍO (usuario, 2026-11-06) · 1 de 2: hitos nuevos.
-- Van en su propia migración: un valor nuevo de un enum no se puede usar en la misma
-- transacción en que se añade (la 20261106160100 ya los usa).
--  · descargando: el camión llega a una entrega (en las recogidas sigue siendo «cargando»);
--  · descargado: sale de una entrega que no es la última, hacia la siguiente parada;
--  · etapa_corregida: alguien de Dynamo marca a mano en qué etapa está el envío (y a qué
--    hora); desde ahí el automático sigue con los mismos plazos.
alter type tipo_hito add value if not exists 'descargando' after 'cargando';
alter type tipo_hito add value if not exists 'descargado' after 'cargado';
alter type tipo_hito add value if not exists 'etapa_corregida' after 'descargado';
