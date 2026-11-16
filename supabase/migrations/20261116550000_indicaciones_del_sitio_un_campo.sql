-- =====================================================================================
-- INDICACIONES DEL SITIO: UN SOLO CAMPO (usuario, 2026-11-16)
-- =====================================================================================
-- La ficha del sitio tenía dos campos de texto fijo: «Indicaciones del sitio»
-- (sitios.anotaciones) e «Info mercancía por defecto» (sitios.mercancia_defecto). El
-- usuario los une en uno: «Indicaciones del sitio · opcional · vale para TODOS los
-- envíos del sitio» (ej. «cargar por muelle 3», «traer 14 cintas de amarre», «preguntar
-- por Paco para cargas»).
--
--   · Lo que hubiera en «Info mercancía por defecto» pasa a las indicaciones del sitio,
--     en una línea aparte debajo de lo que ya tuvieran (no se pierde nada).
--   · La columna mercancia_defecto desaparece.
--   · Las indicaciones salen siempre con el sitio (orden de carga y ficha del envío), así
--     que ya no hace falta copiarlas al detalle de mercancía de cada envío.
update public.sitios
   set anotaciones = concat_ws(E'\n', nullif(btrim(anotaciones), ''), nullif(btrim(mercancia_defecto), ''))
 where nullif(btrim(mercancia_defecto), '') is not null
   and position(btrim(mercancia_defecto) in coalesce(anotaciones, '')) = 0;

alter table public.sitios drop column mercancia_defecto;

comment on column public.sitios.anotaciones is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Indicaciones del sitio: lo fijo que vale para TODOS los envíos del sitio (por dónde se carga, qué hay que traer, por quién preguntar). Las ven el transportista y el cliente: salen en la orden de carga y en la ficha del envío. Ej. OK: Cargar por muelle 3. Traer 14 cintas de amarre.';
