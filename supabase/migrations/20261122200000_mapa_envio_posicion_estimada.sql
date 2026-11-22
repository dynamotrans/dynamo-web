-- MAPA DEL ENVÍO CON LA POSICIÓN ESTIMADA DEL CAMIÓN (usuario, 2026-11-22).
-- Sin GPS de los camiones, la posición se ESTIMA con lo que ya sabemos: el plan del seguimiento
-- (hora prevista de cada parada, minutos por parada, velocidad y pausas del tacógrafo de
-- Parámetros) anclado a lo real (las etapas marcadas y las firmas del CMR, que tienen hora
-- exacta y, si quien firmó dio permiso, GPS). En ruta, se repite la conducción con el
-- tacógrafo desde la salida hasta ahora para saber cuántas horas lleva conduciendo (y si
-- está parado en una pausa o descanso) y se sitúa en esa fracción del tramo.
-- La ruta se pinta en línea recta entre paradas hasta tener las rutas de Google Maps.

-- 1. Coordenadas de códigos postales (para paradas sin coordenadas) -----------------------------
create table if not exists geo_codigos_postales (
  pais_codigo_iso char(2) not null,
  codigo_postal   text not null,
  lat             numeric not null check (lat between -90 and 90),
  lon             numeric not null check (lon between -180 and 180),
  fuente          text not null default 'nominatim',
  creado_en       timestamptz not null default now(),
  primary key (pais_codigo_iso, codigo_postal)
);
comment on table geo_codigos_postales is 'Coordenadas aproximadas (centro) de cada código postal, para situar en el mapa las paradas que no tienen coordenadas propias. Las busca el servidor una sola vez (OpenStreetMap) y se guardan aquí. Solo la escribe el servidor.';
comment on column geo_codigos_postales.pais_codigo_iso is 'formato: texto, 2 letras en mayúsculas | rango: no aplica | lista: códigos ISO de país | obligatorio | País del código postal. Ej. OK: ES';
comment on column geo_codigos_postales.codigo_postal is 'formato: texto, en mayúsculas y sin espacios | rango: 3 a 12 caracteres | lista: no aplica | obligatorio | Código postal. Ej. OK: 41001';
comment on column geo_codigos_postales.lat is 'formato: número decimal | rango: -90 a 90 | lista: no aplica | obligatorio | Latitud del centro del código postal. Ej. OK: 37.3891';
comment on column geo_codigos_postales.lon is 'formato: número decimal | rango: -180 a 180 | lista: no aplica | obligatorio | Longitud del centro del código postal. Ej. OK: -5.9845';
comment on column geo_codigos_postales.fuente is 'formato: texto | rango: hasta 30 caracteres | lista: nominatim, google | automático | De dónde salieron las coordenadas. Ej. OK: nominatim';
comment on column geo_codigos_postales.creado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo se guardaron.';
alter table geo_codigos_postales enable row level security;
-- Sin políticas: solo se lee por mapa_envio() y se escribe por guardar_geo_cp().
drop trigger if exists tg_mantenimiento on geo_codigos_postales;
create trigger tg_mantenimiento before insert or update or delete on geo_codigos_postales
  for each row execute function fn_bloqueo_mantenimiento();

create or replace function public.guardar_geo_cp(p_pais text, p_cp text, p_lat numeric, p_lon numeric, p_fuente text default 'nominatim')
returns void language plpgsql security definer set search_path = public as $$
declare v_cp text := upper(regexp_replace(coalesce(p_cp, ''), '\s', '', 'g')); v_pais text := upper(left(coalesce(p_pais, ''), 2));
begin
  if rol_de_la_llamada() in ('anon', 'authenticated') then raise exception 'Solo el servidor guarda coordenadas.'; end if;
  if v_pais !~ '^[A-Z]{2}$' or length(v_cp) not between 3 and 12 or p_lat is null or p_lon is null
     or p_lat not between -90 and 90 or p_lon not between -180 and 180 then return; end if;
  insert into geo_codigos_postales (pais_codigo_iso, codigo_postal, lat, lon, fuente)
  values (v_pais, v_cp, round(p_lat, 6), round(p_lon, 6), left(coalesce(p_fuente, 'nominatim'), 30))
  on conflict (pais_codigo_iso, codigo_postal) do update set lat = excluded.lat, lon = excluded.lon, fuente = excluded.fuente, creado_en = now();
end $$;
revoke execute on function public.guardar_geo_cp(text, text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.guardar_geo_cp(text, text, numeric, numeric, text) to service_role;
comment on function public.guardar_geo_cp(text, text, numeric, numeric, text) is '[Distancias y cobertura] Guarda las coordenadas del centro de un código postal (las busca el servidor en OpenStreetMap la primera vez que una parada sin coordenadas sale en un mapa). Quién: solo el servidor (clave de servicio). Argumentos: p_pais: código ISO del país · p_cp: código postal · p_lat, p_lon: coordenadas · p_fuente: de dónde salen (nominatim por defecto).';

-- 2. El mapa de un envío ------------------------------------------------------------------------
create or replace function public.mapa_envio(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  e record; v_n int; v_paso smallint; v_plan jsonb; v_act jsonb; v_sig jsonb;
  v_modo text; v_desde int; v_hasta int; v_frac numeric := null; v_parado boolean := false; v_retraso boolean := false;
  v_ini timestamptz; v_fin timestamptz; v_km numeric; v_vel numeric; v_horas numeric; lo numeric; hi numeric; mid numeric;
  v_t timestamptz; v_inicio time; i int; v_paradas jsonb; v_gps jsonb;
begin
  if not puede_ver_envio(p_envio) then return jsonb_build_object('resultado', 'sin_permiso'); end if;
  select x.id, x.estado, x.parada_actual, x.referencia_gx into e from envios x where x.id = p_envio;
  if e.id is null then return jsonb_build_object('resultado', 'sin_permiso'); end if;
  select count(*) into v_n from envio_paradas where envio_id = p_envio;

  -- Cada parada con sus coordenadas: las suyas, las de su sitio, las del GPS de su firma o el
  -- centro de su código postal (por este orden). La hora: la real si ya se hizo, si no la prevista.
  select coalesce(jsonb_agg(jsonb_build_object(
           'orden', p.orden, 'tipo', p.tipo, 'empresa', coalesce(nullif(p.nombre_empresa, ''), s.nombre_empresa),
           'poblacion', p.poblacion, 'provincia', p.provincia, 'codigo_postal', p.codigo_postal, 'pais', p.pais_codigo_iso,
           'lat', coalesce(p.lat, s.lat, fg.lat, g.lat), 'lon', coalesce(p.lon, s.lon, fg.lon, g.lon),
           'coord', case when coalesce(p.lat, s.lat) is not null then 'sitio' when fg.lat is not null then 'gps_firma'
                         when g.lat is not null then 'codigo_postal' else 'sin' end,
           'realizado_en', p.realizado_en) order by p.orden), '[]'::jsonb)
    into v_paradas
    from envio_paradas p
    left join sitios s on s.id = p.sitio_id
    left join lateral (select f.lat, f.lon from firmas_cmr f where f.envio_id = p.envio_id and f.parada_id = p.id and f.lat is not null
                        order by f.firmado_en desc limit 1) fg on true
    left join geo_codigos_postales g on g.pais_codigo_iso = upper(coalesce(p.pais_codigo_iso, 'ES'))
                                    and g.codigo_postal = upper(regexp_replace(coalesce(p.codigo_postal, ''), '\s', '', 'g'))
   where p.envio_id = p_envio;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.paso), '[]'::jsonb) into v_plan from seguimiento_calcular(p_envio) c;
  v_paso := seguimiento_paso(e.estado, e.parada_actual, v_n);
  select x into v_act from jsonb_array_elements(v_plan) x where (x ->> 'paso')::int = v_paso;
  select x into v_sig from jsonb_array_elements(v_plan) x where (x ->> 'paso')::int = v_paso + 1;

  if e.estado in ('borrador', 'programado') then v_modo := 'sin_salir'; v_hasta := 1;
  elsif e.estado = 'cancelado' then v_modo := 'cancelado';
  elsif e.estado = 'entregado' then v_modo := 'entregado'; v_hasta := v_n;
  elsif e.estado = 'hacia_la_carga' then v_modo := 'hacia_carga'; v_hasta := 1;
  elsif e.estado = 'cargando' then v_modo := 'en_parada'; v_hasta := coalesce(e.parada_actual, 1);
  else
    v_modo := 'en_ruta'; v_hasta := greatest(coalesce(e.parada_actual, 2), 2); v_desde := v_hasta - 1;
    v_ini := (v_act ->> 'hora')::timestamptz;
    v_fin := (v_sig ->> 'hora')::timestamptz;
    v_km := coalesce((v_sig ->> 'km')::numeric, 0);
    v_vel := greatest(coalesce(parametro_num('seguimiento_velocidad_kmh', 80), 80), 20);
    begin v_inicio := (parametro('seguimiento_hora_inicio_jornada') #>> '{}')::time; exception when others then v_inicio := time '07:00'; end;
    v_horas := v_km / v_vel;
    if v_ini is null or now() <= v_ini or v_horas <= 0 then v_frac := 0;
    else
      -- Horas de conducción hechas desde la salida hasta ahora, con las pausas del tacógrafo
      -- (búsqueda por mitades: «¿a qué hora llevaría h horas conducidas?»).
      lo := 0; hi := v_horas;
      for i in 1..16 loop
        mid := (lo + hi) / 2;
        select x.t into v_t from seguimiento_conducir(v_ini, v_ini, 0, 0, mid, v_inicio) x;
        if v_t <= now() then lo := mid; else hi := mid; end if;
      end loop;
      v_frac := least(lo / v_horas, 1);
      if v_frac < 0.999 then
        select x.t into v_t from seguimiento_conducir(v_ini, v_ini, 0, 0, least(lo + 0.02, v_horas), v_inicio) x;
        v_parado := v_t > now() + interval '5 minutes';   -- la siguiente conducción empieza más tarde: pausa o descanso
      end if;
    end if;
    v_retraso := v_fin is not null and now() > v_fin;
  end if;

  -- El GPS de la última firma (hora y lugar exactos), si la hubo.
  select jsonb_build_object('lat', f.lat, 'lon', f.lon, 'cuando', f.firmado_en, 'parada', p.orden)
    into v_gps
    from firmas_cmr f left join envio_paradas p on p.id = f.parada_id
   where f.envio_id = p_envio and f.lat is not null order by f.firmado_en desc limit 1;

  return jsonb_build_object(
    'resultado', 'ok', 'referencia', e.referencia_gx, 'estado', e.estado, 'ahora', now(),
    'paradas', v_paradas,
    'etapas', (select coalesce(jsonb_agg(jsonb_build_object('paso', (x ->> 'paso')::int, 'estado', x ->> 'estado', 'parada', (x ->> 'parada')::int,
                 'hora', x ->> 'hora', 'hecha', (x ->> 'paso')::int <= v_paso, 'actual', (x ->> 'paso')::int = v_paso)
                 order by (x ->> 'paso')::int), '[]'::jsonb) from jsonb_array_elements(v_plan) x),
    'camion', jsonb_build_object('modo', v_modo, 'desde', v_desde, 'hasta', v_hasta, 'fraccion', round(v_frac, 4),
                 'parado', v_parado, 'retraso', v_retraso, 'salida', v_ini, 'llegada_prevista', coalesce(v_fin, (v_sig ->> 'hora')::timestamptz)),
    'gps_firma', v_gps);
end $$;
revoke execute on function public.mapa_envio(uuid) from public, anon;
grant execute on function public.mapa_envio(uuid) to authenticated, service_role;
comment on function public.mapa_envio(uuid) is '[Envíos] Lo que pinta el mapa de un envío: sus paradas con coordenadas (las del sitio, el GPS de su firma o el centro del código postal), las etapas del seguimiento con su hora y la POSICIÓN ESTIMADA del camión (sin salir, yendo a la carga, en una parada, en ruta entre dos paradas con la fracción del tramo hecha —repitiendo la conducción con las pausas del tacógrafo— y si está parado o va con retraso, o entregado), más el GPS de la última firma del CMR. Quién: Dynamo, el cliente dueño o el transportista asignado. Argumentos: p_envio: envios.id.';
