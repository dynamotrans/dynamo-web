-- Transportista propio del cliente (catálogo privado, tabla operadores) (usuario, 2026-11-22):
-- tres datos nuevos en su ficha: provincia, país y tipos de camión con los que trabaja
-- (tráiler marcado por defecto, rígido con plataforma de 8 m y «otros»). Todos opcionales.

alter table public.operadores
  add column if not exists provincia text,
  add column if not exists pais_codigo_iso char(2) default 'ES',
  add column if not exists tipos_camion tipo_camion[] not null default '{trailer_tauliner}',
  add column if not exists otros_camiones boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'operadores_pais_codigo_iso_check') then
    alter table public.operadores add constraint operadores_pais_codigo_iso_check
      check (pais_codigo_iso is null or pais_codigo_iso ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operadores_provincia_check') then
    alter table public.operadores add constraint operadores_provincia_check
      check (provincia is null or length(btrim(provincia)) between 1 and 100);
  end if;
end $$;

comment on column public.operadores.provincia is 'formato: texto | rango: 1 a 100 caracteres | lista: en España, una de las 52 provincias (desplegable); fuera, texto libre | opcional | Provincia donde tiene su base el transportista del cliente. Sale en su orden de carga. Ej. OK: Sevilla · Ej. mal: 41';
comment on column public.operadores.pais_codigo_iso is 'formato: código ISO de 2 letras en mayúsculas | rango: no aplica | lista: códigos de país ISO 3166-1 | opcional (España por defecto) | País del transportista del cliente. Ej. OK: ES · Ej. mal: España';
comment on column public.operadores.tipos_camion is 'formato: lista de valores | rango: no aplica | lista: trailer_tauliner (tráiler), rigido_plataforma (rígido con plataforma, 8 m) | obligatorio (puede quedar vacía si solo trabaja con otros) | Tipos de camión con los que trabaja el transportista del cliente; el tráiler viene marcado por defecto. Ej. OK: {trailer_tauliner,rigido_plataforma}';
comment on column public.operadores.otros_camiones is 'formato: sí/no | rango: no aplica | lista: no aplica | obligatorio (no por defecto) | Si el transportista del cliente trabaja también con otros camiones (furgonetas, frigoríficos, góndolas…). Ej. OK: true';
