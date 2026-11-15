-- FESTIVOS NACIONALES DE LOS 11 PAÍSES EUROPEOS DE SERVICIO (usuario, 2026-11-15):
-- Portugal, Francia, Alemania, Italia, Suiza, Países Bajos, Bélgica, Luxemburgo,
-- Austria, Polonia y República Checa — sembrados PERPETUOS, como los españoles:
-- los fijos con repetir='cada_anio' y los móviles de Pascua con repetir='pascua'
-- (se recalculan solos cada año con domingo_de_pascua). La lista es la misma que la
-- web pública lleva meses usando (js/festivos.js, verificada contra calendario).
-- Afectan a los sitios de SU país en los avisos de recogida/entrega (es_dia_habil_sitio
-- filtra por pais_codigo_iso); a los españoles no les cambian nada. Cobertura NACIONAL:
-- los regionales de esos países (un festivo solo de Baviera) no entran — si algún día
-- hacen falta, se añaden a mano en la pantalla de Festivos.
-- Nombres en español, para leerlos de un vistazo en la pantalla.

-- ---- Fijos (el mismo día y mes todos los años) ----------------------------------------
insert into festivos (fecha, nombre, pais_codigo_iso, repetir)
select make_date(2026, f.mes, f.dia), f.nombre, f.pais, 'cada_anio'
  from (values
    -- Portugal
    ('PT',  1,  1, 'Año Nuevo'), ('PT',  4, 25, 'Día de la Libertad'), ('PT',  5,  1, 'Día del Trabajo'),
    ('PT',  6, 10, 'Día de Portugal'), ('PT',  8, 15, 'Asunción'), ('PT', 10,  5, 'Día de la República'),
    ('PT', 11,  1, 'Todos los Santos'), ('PT', 12,  1, 'Restauración'), ('PT', 12,  8, 'Inmaculada'), ('PT', 12, 25, 'Navidad'),
    -- Francia
    ('FR',  1,  1, 'Año Nuevo'), ('FR',  5,  1, 'Día del Trabajo'), ('FR',  5,  8, 'Victoria 1945'),
    ('FR',  7, 14, 'Fiesta Nacional'), ('FR',  8, 15, 'Asunción'), ('FR', 11,  1, 'Todos los Santos'),
    ('FR', 11, 11, 'Armisticio'), ('FR', 12, 25, 'Navidad'),
    -- Alemania
    ('DE',  1,  1, 'Año Nuevo'), ('DE',  5,  1, 'Día del Trabajo'), ('DE', 10,  3, 'Unidad Alemana'),
    ('DE', 12, 25, 'Navidad'), ('DE', 12, 26, 'San Esteban'),
    -- Italia
    ('IT',  1,  1, 'Año Nuevo'), ('IT',  1,  6, 'Epifanía'), ('IT',  4, 25, 'Liberación'),
    ('IT',  5,  1, 'Día del Trabajo'), ('IT',  6,  2, 'Día de la República'), ('IT',  8, 15, 'Ferragosto'),
    ('IT', 11,  1, 'Todos los Santos'), ('IT', 12,  8, 'Inmaculada'), ('IT', 12, 25, 'Navidad'), ('IT', 12, 26, 'San Esteban'),
    -- Suiza
    ('CH',  1,  1, 'Año Nuevo'), ('CH',  8,  1, 'Fiesta Nacional'), ('CH', 12, 25, 'Navidad'),
    -- Países Bajos
    ('NL',  1,  1, 'Año Nuevo'), ('NL',  4, 27, 'Día del Rey'), ('NL', 12, 25, 'Navidad'), ('NL', 12, 26, '2º día de Navidad'),
    -- Bélgica
    ('BE',  1,  1, 'Año Nuevo'), ('BE',  5,  1, 'Día del Trabajo'), ('BE',  7, 21, 'Fiesta Nacional'),
    ('BE',  8, 15, 'Asunción'), ('BE', 11,  1, 'Todos los Santos'), ('BE', 11, 11, 'Armisticio'), ('BE', 12, 25, 'Navidad'),
    -- Luxemburgo
    ('LU',  1,  1, 'Año Nuevo'), ('LU',  5,  1, 'Día del Trabajo'), ('LU',  5,  9, 'Día de Europa'),
    ('LU',  6, 23, 'Fiesta Nacional'), ('LU',  8, 15, 'Asunción'), ('LU', 11,  1, 'Todos los Santos'),
    ('LU', 12, 25, 'Navidad'), ('LU', 12, 26, 'San Esteban'),
    -- Austria
    ('AT',  1,  1, 'Año Nuevo'), ('AT',  1,  6, 'Epifanía'), ('AT',  5,  1, 'Día del Trabajo'),
    ('AT',  8, 15, 'Asunción'), ('AT', 10, 26, 'Fiesta Nacional'), ('AT', 11,  1, 'Todos los Santos'),
    ('AT', 12,  8, 'Inmaculada'), ('AT', 12, 25, 'Navidad'), ('AT', 12, 26, 'San Esteban'),
    -- Polonia
    ('PL',  1,  1, 'Año Nuevo'), ('PL',  1,  6, 'Epifanía'), ('PL',  5,  1, 'Día del Trabajo'),
    ('PL',  5,  3, 'Día de la Constitución'), ('PL',  8, 15, 'Asunción'), ('PL', 11,  1, 'Todos los Santos'),
    ('PL', 11, 11, 'Independencia'), ('PL', 12, 25, 'Navidad'), ('PL', 12, 26, '2º día de Navidad'),
    -- República Checa
    ('CZ',  1,  1, 'Año Nuevo'), ('CZ',  5,  1, 'Día del Trabajo'), ('CZ',  5,  8, 'Día de la Liberación'),
    ('CZ',  7,  5, 'Cirilo y Metodio'), ('CZ',  7,  6, 'Jan Hus'), ('CZ',  9, 28, 'Día del Estado'),
    ('CZ', 10, 28, 'Independencia'), ('CZ', 11, 17, 'Lucha por la Libertad'), ('CZ', 12, 24, 'Nochebuena'),
    ('CZ', 12, 25, 'Navidad'), ('CZ', 12, 26, 'San Esteban')
  ) as f(pais, mes, dia, nombre)
on conflict do nothing;

-- ---- Móviles de Pascua (offset desde el Domingo de Pascua, perpetuos) -----------------
-- Viernes Santo −2 · Pascua 0 · Lunes de Pascua +1 · Ascensión +39 · Pentecostés +49 ·
-- Lunes de Pentecostés +50 · Corpus Christi +60.
insert into festivos (fecha, nombre, pais_codigo_iso, repetir, dias_desde_pascua)
select domingo_de_pascua(2026) + f.dias, f.nombre, f.pais, 'pascua', f.dias::smallint
  from (values
    ('PT', -2, 'Viernes Santo'), ('PT',  0, 'Pascua'), ('PT', 60, 'Corpus Christi'),
    ('FR',  1, 'Lunes de Pascua'), ('FR', 39, 'Ascensión'), ('FR', 50, 'Lunes de Pentecostés'),
    ('DE', -2, 'Viernes Santo'), ('DE',  1, 'Lunes de Pascua'), ('DE', 39, 'Ascensión'), ('DE', 50, 'Lunes de Pentecostés'),
    ('IT',  1, 'Lunes de Pascua'),
    ('CH', -2, 'Viernes Santo'), ('CH',  1, 'Lunes de Pascua'), ('CH', 39, 'Ascensión'), ('CH', 50, 'Lunes de Pentecostés'),
    ('NL',  0, 'Pascua'), ('NL',  1, 'Lunes de Pascua'), ('NL', 39, 'Ascensión'), ('NL', 49, 'Pentecostés'), ('NL', 50, 'Lunes de Pentecostés'),
    ('BE',  1, 'Lunes de Pascua'), ('BE', 39, 'Ascensión'), ('BE', 50, 'Lunes de Pentecostés'),
    ('LU',  1, 'Lunes de Pascua'), ('LU', 39, 'Ascensión'), ('LU', 50, 'Lunes de Pentecostés'),
    ('AT',  1, 'Lunes de Pascua'), ('AT', 39, 'Ascensión'), ('AT', 50, 'Lunes de Pentecostés'), ('AT', 60, 'Corpus Christi'),
    ('PL',  0, 'Pascua'), ('PL',  1, 'Lunes de Pascua'), ('PL', 49, 'Pentecostés'), ('PL', 60, 'Corpus Christi'),
    ('CZ', -2, 'Viernes Santo'), ('CZ',  1, 'Lunes de Pascua')
  ) as f(pais, dias, nombre)
on conflict do nothing;
