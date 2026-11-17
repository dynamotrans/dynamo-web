-- =====================================================================================
-- LOS SITIOS VUELVEN A «CON MEDIOS DE CARGA» (usuario, 2026-11-17)
-- =====================================================================================
-- «¿Por qué sale "Atención: Sin medios de carga: el camión debe llevar plataforma
-- elevadora"? No lo veo por sitios ni nada.» La casilla «Tiene medios de carga» está
-- oculta en el formulario de Sitios, y el formulario la guardaba siempre desmarcada: todo
-- sitio creado o editado desde ahí quedaba como «sin medios de carga», y ese aviso salía en
-- la orden de carga, en la ficha del viaje y en la oferta al transportista sin que nadie lo
-- hubiera puesto.
--
-- Nadie ha podido marcar ese dato a propósito (la casilla no se ve), así que todos los
-- sitios vuelven al valor de fábrica: con medios de carga. La plataforma elevadora se pide
-- en el propio envío, que es donde se elige. El formulario ya no lo desmarca.
-- (Sin disparadores: es una corrección de datos, no un cambio que haya que auditar ni
-- anunciar en vivo fila a fila.)
alter table sitios disable trigger user;
update sitios set tiene_medios_carga = true where not tiene_medios_carga;
alter table sitios enable trigger user;
