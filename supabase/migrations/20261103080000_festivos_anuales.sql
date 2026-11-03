-- =====================================================================================
-- FESTIVOS QUE SE REPITEN SOLOS (2026-11-03, a petición del usuario)
-- =====================================================================================
-- Antes cada festivo era una fila con su fecha, y los nacionales se sembraron año a año
-- de 2026 a 2030: el 1 de noviembre aparecía cinco veces y en 2031 se acababa la lista.
-- Ahora cada festivo dice CÓMO se repite:
--
--   repetir = 'no'         → solo esa fecha (un año). Para lo que cambia cada año: muchos
--                             autonómicos y locales, o un festivo de domingo que esa
--                             comunidad pasa al lunes.
--   repetir = 'cada_anio'  → el mismo día y mes todos los años (1 ene, 25 dic, 1 nov...).
--   repetir = 'pascua'     → a X días del Domingo de Pascua, que cambia cada año y se
--                             calcula solo (Jueves Santo = -3, Viernes Santo = -2,
--                             Lunes de Pascua = +1).
--
-- `fecha` pasa a ser la PRIMERA vez que vale (desde ese día en adelante) y `vigente_hasta`,
-- si se rellena, la última. Así un festivo que deja de serlo se cierra sin borrarlo, y
-- el historial sigue diciendo la verdad para los envíos de años anteriores.
-- =====================================================================================

alter table festivos
  add column repetir text not null default 'no'
    check (repetir in ('no', 'cada_anio', 'pascua')),
  add column dias_desde_pascua smallint,
  add column vigente_hasta date;

alter table festivos
  add constraint ck_festivos_pascua check (
    (repetir = 'pascua') = (dias_desde_pascua is not null)
    and (repetir <> 'pascua'
         or fecha = domingo_de_pascua(extract(year from fecha)::int) + dias_desde_pascua)),
  add constraint ck_festivos_hasta check (vigente_hasta is null or vigente_hasta >= fecha),
  add constraint ck_festivos_hasta_solo_repetidos check (repetir <> 'no' or vigente_hasta is null);

comment on column festivos.repetir is
  'no = solo esa fecha · cada_anio = mismo dia y mes todos los anios · pascua = a '
  'dias_desde_pascua del Domingo de Pascua de cada anio.';
comment on column festivos.fecha is
  'Si repetir = no, el dia festivo. Si se repite, la primera vez que vale (desde).';
comment on column festivos.vigente_hasta is
  'Ultimo dia en que vale un festivo que se repite. Vacio = sin fin.';

-- ---- ¿Cae este festivo en esta fecha? -----------------------------------------------
create or replace function festivo_cae_en(p_fecha date, p_desde date, p_repetir text,
                                          p_dias_pascua smallint, p_hasta date)
returns boolean language sql immutable set search_path = public as $$
  select p_fecha >= p_desde
     and (p_hasta is null or p_fecha <= p_hasta)
     and case p_repetir
           when 'no'        then p_fecha = p_desde
           when 'cada_anio' then extract(month from p_fecha) = extract(month from p_desde)
                             and extract(day   from p_fecha) = extract(day   from p_desde)
           when 'pascua'    then p_fecha = domingo_de_pascua(extract(year from p_fecha)::int)
                                           + p_dias_pascua
           else false
         end
$$;

-- ---- Los nacionales de España: de 55 filas (2026-2030) a 11 que no caducan -----------
delete from festivos
 where pais_codigo_iso = 'ES' and region is null and poblacion is null
   and extract(year from fecha) between 2026 and 2030
   and nombre in ('Año Nuevo', 'Reyes', 'Día del Trabajo', 'Asunción', 'Fiesta Nacional',
                  'Todos los Santos', 'Constitución', 'Inmaculada', 'Navidad',
                  'Jueves Santo', 'Viernes Santo');

insert into festivos (fecha, nombre, repetir)
select make_date(2026, f.mes, f.dia), f.nombre, 'cada_anio'
  from (values (1, 1, 'Año Nuevo'), (1, 6, 'Reyes'), (5, 1, 'Día del Trabajo'),
               (8, 15, 'Asunción'), (10, 12, 'Fiesta Nacional'),
               (11, 1, 'Todos los Santos'), (12, 6, 'Constitución'),
               (12, 8, 'Inmaculada'), (12, 25, 'Navidad')) as f(mes, dia, nombre);

insert into festivos (fecha, nombre, repetir, dias_desde_pascua) values
  (domingo_de_pascua(2026) - 3, 'Jueves Santo',  'pascua', -3),
  (domingo_de_pascua(2026) - 2, 'Viernes Santo', 'pascua', -2);

-- ---- ¿Es día hábil? (ahora entiende los que se repiten) ------------------------------
create or replace function es_dia_habil(p_fecha date, p_pais char(2) default 'ES',
                                        p_region text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select extract(isodow from p_fecha) < 6
     and not exists (select 1 from festivos f
                      where f.pais_codigo_iso = p_pais
                        and f.poblacion is null
                        and (f.region is null or f.region = p_region)
                        and f.fecha <= p_fecha
                        and festivo_cae_en(p_fecha, f.fecha, f.repetir,
                                           f.dias_desde_pascua, f.vigente_hasta))
$$;
revoke execute on function es_dia_habil(date, char, text) from public, anon;

-- ---- Los festivos de un periodo, ya con su fecha de cada año ------------------------
-- Lo usa el panel para el calendario de Nuevo envío. Sin comunidad, solo los nacionales;
-- con comunidad, los nacionales más los de esa comunidad. Máximo 3 años de golpe.
create or replace function festivos_entre(p_desde date, p_hasta date,
                                          p_pais char(2) default 'ES',
                                          p_region text default null)
returns table (fecha date, nombre text, region text)
language sql stable set search_path = public as $$
  select d::date, f.nombre, f.region
    from generate_series(p_desde, least(p_hasta, p_desde + 1096), interval '1 day') d
    join festivos f
      on f.pais_codigo_iso = p_pais
     and f.poblacion is null
     and (f.region is null or f.region = p_region)
     and f.fecha <= d::date
     and festivo_cae_en(d::date, f.fecha, f.repetir, f.dias_desde_pascua, f.vigente_hasta)
   order by 1, 2
$$;
comment on function festivos_entre(date, date, char, text) is
  'Festivos de un periodo con su fecha real de cada anio (resuelve los que se repiten).';
revoke execute on function festivos_entre(date, date, char, text) from public, anon;
revoke execute on function festivo_cae_en(date, date, text, smallint, date) from public, anon;
