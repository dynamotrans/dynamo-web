-- =====================================================================================
-- MERCANCÍA POR DEFECTO DEL SITIO (usuario, 2026-11-10)
-- =====================================================================================
-- Campo opcional en la ficha del sitio/almacén: un texto de mercancía por defecto.
-- Al elegir ese sitio en Nuevo envío, el «detalle de mercancía» del paso 4 sale
-- prerrelleno con él; es editable allí, y lo que quede al crear el envío se guarda
-- de vuelta en la ficha del sitio (vaciarlo lo borra). Los almacenes de Dynamo lo
-- tienen también (se edita en Almacenes; desde el envío no se les escribe).
-- =====================================================================================

alter table public.sitios add column if not exists mercancia_defecto text;

comment on column public.sitios.mercancia_defecto is
  'formato: texto | rango: no aplica | lista: no aplica | opcional | Detalle de mercancía por defecto del sitio. Prerrellena el «detalle de mercancía» de la parada al crear un envío; editarlo allí actualiza este valor. Ej. OK: 4 palets de recambios';
