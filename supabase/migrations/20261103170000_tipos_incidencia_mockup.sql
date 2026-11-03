-- =====================================================================================
-- Tipos de incidencia del panel (los del desplegable de "Reportar incidencia" del mockup)
-- =====================================================================================
-- El catálogo tenía los del Sheet (incidencia en el transporte, cancelación, cambio de
-- fecha, facturación y pago). Se añaden los cuatro que enseña el panel. Se pueden
-- desactivar desde la tabla sin borrar las incidencias que ya los usan.
insert into tipos_incidencia (clave, nombre, orden) values
  ('albaran',                 'Solicitud de albarán / Albarán incorrecto',        6),
  ('siniestro',               'Siniestro / rotura / pérdida de mercancía',        7),
  ('transportista_conductor', 'Incidencia con algún transportista / conductor',   8),
  ('otros',                   'Otros',                                            99)
on conflict (clave) do nothing;
