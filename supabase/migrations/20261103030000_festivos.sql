-- =====================================================================================
-- FESTIVOS EN LA BASE DE DATOS
-- =====================================================================================
-- Hasta hoy los festivos vivían solo en el navegador (js/festivos.js), así que la hora
-- límite para cancelar gratis (9:00 del día hábil ANTERIOR a la carga) saltaba fines de
-- semana pero no festivos: una carga el miércoles 9 de diciembre tenía el corte el
-- martes 8, que es la Inmaculada. Ahora el servidor también los conoce.
--
-- Tabla editable desde el panel (solo Dynamo): nacionales, autonómicos y locales.
-- Se siembran los NACIONALES de España de 2026 a 2030, con la misma lista que
-- js/festivos.js (incluido Jueves Santo, como allí). Los autonómicos y locales se
-- añadirán según hagan falta.
-- =====================================================================================

create table festivos (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null,
  pais_codigo_iso char(2) not null default 'ES' check (pais_codigo_iso ~ '^[A-Z]{2}$'),
  -- null = festivo de todo el país. Si no: comunidad en código ISO ('ES-AN', 'ES-CT'...),
  -- el mismo que ya usa el panel (stateToRegion, bitácora 2026-07-11).
  region          text check (region is null or region ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'),
  localidad       text,            -- para los locales ("Sevilla"); null si no es local
  nombre          text not null,

  creado_en       timestamptz not null default now(),
  creado_por      uuid references auth.users(id) on delete set null,
  modificado_en   timestamptz,
  modificado_por  uuid references auth.users(id) on delete set null,

  constraint ck_festivos_local_con_region check (localidad is null or region is not null)
);

create unique index ux_festivos on festivos
  (pais_codigo_iso, coalesce(region, ''), coalesce(lower(localidad), ''), fecha);
create index idx_festivos_fecha on festivos (fecha, pais_codigo_iso);

comment on table festivos is
  'Festivos nacionales (region null), autonomicos (region) y locales (region + localidad). '
  'Los usa el corte de cancelacion. Editable por Dynamo desde el panel.';

select activar_rastro('festivos');
alter table festivos enable row level security;
-- Es información pública: cualquiera con sesión la puede leer (el panel avisa de festivos).
create policy festivos_sel   on festivos for select using (auth.uid() is not null);
create policy festivos_admin on festivos for all using (es_admin()) with check (es_admin());


-- ---- Domingo de Pascua (algoritmo de Gauss, el mismo que js/festivos.js) ------------
create or replace function domingo_de_pascua(p_anio int)
returns date language plpgsql immutable as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
        mes int; dia int;
begin
  a := p_anio % 19; b := p_anio / 100; c := p_anio % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31; dia := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_anio, mes, dia);
end $$;


-- ---- Sembrar los nacionales de España 2026-2030 -------------------------------------
insert into festivos (fecha, nombre)
select make_date(y, f.mes, f.dia), f.nombre
  from generate_series(2026, 2030) y
 cross join (values (1, 1, 'Año Nuevo'), (1, 6, 'Reyes'), (5, 1, 'Día del Trabajo'),
                    (8, 15, 'Asunción'), (10, 12, 'Fiesta Nacional'),
                    (11, 1, 'Todos los Santos'), (12, 6, 'Constitución'),
                    (12, 8, 'Inmaculada'), (12, 25, 'Navidad')) as f(mes, dia, nombre)
union all
select domingo_de_pascua(y) - 3, 'Jueves Santo'  from generate_series(2026, 2030) y
union all
select domingo_de_pascua(y) - 2, 'Viernes Santo' from generate_series(2026, 2030) y;


-- ---- ¿Es día hábil? -----------------------------------------------------------------
create or replace function es_dia_habil(p_fecha date, p_pais char(2) default 'ES',
                                        p_region text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select extract(isodow from p_fecha) < 6
     and not exists (select 1 from festivos f
                      where f.fecha = p_fecha and f.pais_codigo_iso = p_pais
                        and f.localidad is null
                        and (f.region is null or f.region = p_region))
$$;


-- ---- El corte de cancelación, ahora con festivos ------------------------------------
-- 9:00 (hora de Madrid) del día hábil ANTERIOR a la carga: se salta fines de semana y
-- festivos nacionales (y los de la comunidad, si se indica).
drop function if exists corte_cancelacion(date);
create or replace function corte_cancelacion(p_fecha_carga date, p_pais char(2) default 'ES',
                                             p_region text default null)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare d date := p_fecha_carga - 1; vueltas int := 0;
begin
  while not es_dia_habil(d, p_pais, p_region) loop
    d := d - 1; vueltas := vueltas + 1;
    if vueltas > 15 then exit; end if;      -- cinturón: nunca más de dos semanas atrás
  end loop;
  return (d::timestamp + time '09:00') at time zone 'Europe/Madrid';
end $$;

comment on function corte_cancelacion(date, char, text) is
  'Hora limite para cancelar gratis con camion asignado: 9:00 (Madrid) del dia habil '
  'anterior a la carga, saltando fines de semana y festivos (nacionales y, si se pasa, '
  'los de la comunidad). La penalizacion automatica usa los nacionales.';

revoke execute on function corte_cancelacion(date, char, text) from public, anon;
revoke execute on function es_dia_habil(date, char, text)       from public, anon;
