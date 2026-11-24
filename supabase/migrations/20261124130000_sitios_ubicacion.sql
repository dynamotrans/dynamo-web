-- UBICACIÓN DE CADA SITIO (usuario, 2026-11-24: «¿podríamos generar enlace de ubicación con las
-- coordenadas cuando creamos un sitio que no está en Google? Para "ver mapa" y para mandarlo al
-- transportista»). Cada sitio guarda sus coordenadas (las busca el SERVIDOR en Google con su
-- dirección al crearlo o al cambiarle la dirección) y, si no trae enlace de Google Maps propio,
-- se le pone uno a esas coordenadas. Ese enlace es el que ya sale en la ficha del envío, en la
-- orden de carga, en la página de la carga y en los emails al transportista.
--   · Las coordenadas las pone el servidor o Dynamo; la pantalla de un cliente no las cambia
--     (con ellas se calculan los kilómetros).
--   · Si cambia la dirección y no llegan coordenadas nuevas, las viejas dejan de valer (se
--     vacían; el servidor las vuelve a buscar).
--   · El enlace que trae Google al crear el sitio con su buscador (la ficha del negocio) se
--     respeta: el automático solo se pone cuando no hay otro, y se rehace si el sitio se mueve.
create or replace function public.fn_sitios_ubicacion()
returns trigger language plpgsql security definer set search_path = public as $function$
declare v_auto constant text := '^https://www\.google\.com/maps/search/\?api=1&query=-?[0-9.]+,-?[0-9.]+$';
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    if tg_op = 'UPDATE' then new.lat := old.lat; new.lon := old.lon;
    else new.lat := null; new.lon := null; end if;
  end if;
  if tg_op = 'UPDATE' and new.lat is not distinct from old.lat and new.lon is not distinct from old.lon
     and (new.direccion, new.codigo_postal, new.poblacion, new.pais_codigo_iso)
         is distinct from (old.direccion, old.codigo_postal, old.poblacion, old.pais_codigo_iso) then
    new.lat := null; new.lon := null;
  end if;
  if new.lat is not null and new.lon is not null then
    if new.url_google_maps is null or new.url_google_maps ~ v_auto then
      new.url_google_maps := 'https://www.google.com/maps/search/?api=1&query='
        || trim_scale(round(new.lat::numeric, 6)) || ',' || trim_scale(round(new.lon::numeric, 6));
    end if;
  elsif new.url_google_maps ~ v_auto then
    new.url_google_maps := null;
  end if;
  return new;
end $function$;
comment on function public.fn_sitios_ubicacion() is '[Sitios] Disparador: la ubicación de un sitio. Las coordenadas solo las pone el servidor (Google) o Dynamo; si cambia la dirección sin coordenadas nuevas, se vacían. Con coordenadas y sin enlace de Google Maps propio, pone el enlace a esas coordenadas (y lo rehace si cambian; sin coordenadas lo quita). Quién: solo uso interno.';

-- Después del que guarda el enlace (tg_sitios_url_mapa) y antes del que cuenta las mudanzas
-- (tg_sitios_version_geo): por eso su nombre.
drop trigger if exists tg_sitios_url_ubicacion on public.sitios;
create trigger tg_sitios_url_ubicacion before insert or update on public.sitios
  for each row execute function public.fn_sitios_ubicacion();

-- Los sitios que ya tienen coordenadas y no tienen enlace: se les pone ahora.
update public.sitios
   set url_google_maps = 'https://www.google.com/maps/search/?api=1&query='
       || trim_scale(round(lat::numeric, 6)) || ',' || trim_scale(round(lon::numeric, 6))
 where url_google_maps is null and lat is not null and lon is not null;
