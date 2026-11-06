-- SEGUIMIENTO AUTOMÁTICO DEL ENVÍO (usuario, 2026-11-06) · 2 de 2.
--
-- El estado del envío avanza SOLO según un horario previsto, y Dynamo lo puede corregir a
-- mano en cualquier momento: lo que se marca pasa a ser el nuevo punto de partida y desde
-- ahí sigue con los mismos plazos («si llega antes, a las 10:00, el resto parte de ahí»).
--
-- ETAPAS de un envío con n paradas (el número de etapa es «paso»):
--   0          Programado (o Asignando transportista / Confirmado: eso es solo la vista)
--   1          Yendo a la carga (hacia la 1.ª parada)
--   2·p        En la parada p: cargando (recogida) o descargando (entrega)
--   2·p − 1    En ruta a la parada p (p ≥ 2)
--   2·n + 1    Entregado
-- En la tabla: estado + parada_actual (la parada en la que está o a la que va).
--
-- HORARIO PREVISTO (parámetros «seguimiento_*», cambiables en Parámetros):
--   · día: el de carga real, o el previsto (lo pone quien asigna el transportista; en un
--     envío con ventana es obligatorio), o el primero de la ventana;
--   · llegada a la 1.ª parada a las 12:30 (otra hora en verano, si se quiere: mismo verano
--     que los almacenes); sale hacia la carga 2 h antes (10:30);
--   · 1 h en cada parada; entre paradas, a 80 km/h por los km de la ruta (los del tarifador
--     si están; si no, en línea recta × 1,25; si no hay coordenadas, 300 km);
--   · tacógrafo: pausa de 45 min tras 4 h 30 min conduciendo, máximo 9 h de conducción al día
--     y descanso de 11 h; la jornada (conducir + cargar + esperar) no pasa de 13 h desde que
--     empezó. El camión arranca la jornada a las 7:00 (usuario, 2026-11-06: «el camión arranca
--     a las 7:00 como estándar»): de 7:00 a 20:00 como mucho, y tras el descanso no vuelve a
--     arrancar antes de las 7:00;
--   · si llega a una parada antes de que abra (horario del sitio: cerrado a mediodía, fin de
--     semana…), espera parado hasta la apertura; la espera cuenta como jornada, no como
--     conducción, y si es de 45 min o más le sirve de pausa.
-- La etapa marcada a mano (ancla_paso, a la hora ancla_hora) manda: las anteriores no pueden
-- ser más tarde y las siguientes se calculan desde ella. Una hora futura sirve para atrasar
-- («llegará a las 14:00»): hasta entonces sigue en la etapa anterior.
--
-- Cada 5 min (pg_cron) se ponen al día los envíos en marcha: etapa a etapa, para que cada
-- una deje su hito y su hora (la prevista, no la del momento en que corre la tarea).
-- Quién: «automático» en la línea de tiempo y «Sistema» en el historial. La marca a mano
-- deja el nombre de quien la hizo y un hito «Etapa corregida».
-- Pausar el automático (seguimiento_automatico = false) lo deja quieto hasta reanudarlo; la
-- marca a mano funciona igual.
-- No se mueven solos: los cancelados, los borradores, los que esperan el pago previo, los
-- que no tienen transportista y los envíos manuales del cliente (los lleva su operador).

-- ---- Columnas -----------------------------------------------------------------------
alter table envios
  add column if not exists fecha_carga_prevista date,
  add column if not exists parada_actual smallint,
  add column if not exists seguimiento_automatico boolean not null default true,
  add column if not exists ancla_paso smallint,
  add column if not exists ancla_hora timestamptz;
comment on column envios.fecha_carga_prevista is 'formato: fecha (AAAA-MM-DD) | rango: dentro de la ventana de carga | lista: no aplica | opcional | Día en que el transportista carga. Lo pone quien asigna (obligatorio si hay ventana) o el transportista al completar la carga en la bolsa; con fecha fija, la fecha fija. Ej. OK: 2026-11-20';
comment on column envios.parada_actual is 'formato: número entero | rango: 1 a nº de paradas | lista: no aplica | automático | Seguimiento: orden de la parada en la que está (cargando/descargando) o a la que va (yendo a la carga, en ruta). Vacío si está programado. Ej. OK: 2';
comment on column envios.seguimiento_automatico is 'formato: sí/no | rango: no aplica | lista: no aplica | automático | Si el estado avanza solo según el horario previsto (por defecto sí). No = pausado a mano desde la ficha (pausar_seguimiento_envio). Ej. OK: true';
comment on column envios.ancla_paso is 'formato: número entero | rango: 0 a 2·nº de paradas + 1 | lista: no aplica | opcional | Seguimiento: etapa marcada a mano (0 programado, 1 yendo a la carga, 2·p en la parada p, 2·p−1 en ruta a la parada p, 2·n+1 entregado). La pone marcar_etapa_envio(). Ej. OK: 2';
comment on column envios.ancla_hora is 'formato: fecha y hora (con zona) | rango: 30 días atrás a 14 adelante | lista: no aplica | opcional | Seguimiento: hora en que empezó (o empezará) la etapa marcada a mano; desde ella se recalcula el resto. Ej. OK: 2026-11-20 10:05+01';

-- ---- Parámetros -----------------------------------------------------------------------
insert into parametros (clave, valor, descripcion) values
  ('seguimiento_activo', 'true', 'Interruptor general del seguimiento automático: si está apagado, ningún envío cambia de estado solo (sí a mano).'),
  ('seguimiento_hora_inicio_jornada', '"07:00"', 'Hora (Madrid, HH:MM) a la que el camión empieza la jornada: cuenta para las 13 h de jornada y tras el descanso de 11 h no vuelve a arrancar antes.'),
  ('seguimiento_hora_primera_parada', '"12:30"', 'Hora (Madrid, HH:MM) a la que se prevé que el camión llega a la 1.ª parada el día de carga.'),
  ('seguimiento_hora_primera_parada_verano', '"12:30"', 'Lo mismo en verano (las fechas del verano de los almacenes).'),
  ('seguimiento_minutos_hasta_carga', '120', 'Minutos antes de llegar a la 1.ª parada en que pasa a «Yendo a la carga».'),
  ('seguimiento_minutos_por_parada', '60', 'Minutos que se prevén en cada parada cargando o descargando.'),
  ('seguimiento_velocidad_kmh', '80', 'Velocidad media prevista del camión entre paradas (km/h).'),
  ('seguimiento_km_por_defecto', '300', 'Km que se suponen entre dos paradas cuando no hay distancia ni coordenadas.'),
  ('seguimiento_horas_asignando', '36', 'Horas antes de la primera posibilidad de cargar en que un envío sin transportista pasa a verse como «Asignando transportista».')
on conflict (clave) do nothing;

-- ---- Ayudantes ------------------------------------------------------------------------
create or replace function puede_ver_envio(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select ve_todo() or exists (select 1 from envios e where e.id = p_envio
           and (e.cliente_id = cliente_del_usuario() or e.transportista_id = transportista_del_usuario()))
$$;
revoke execute on function puede_ver_envio(uuid) from public, anon;
grant execute on function puede_ver_envio(uuid) to authenticated, service_role;
comment on function public.puede_ver_envio(uuid) is '[Envíos] Si el usuario puede ver ese envío: Dynamo (también solo lectura), el cliente dueño o el transportista asignado. Quién: cualquiera con sesión. Argumentos: p_envio: envios.id.';

-- Conduce p_horas desde t con las reglas del tacógrafo. Devuelve la hora de llegada y cómo
-- quedan los contadores (inicio de la jornada, horas desde la última pausa, horas del día).
create or replace function seguimiento_conducir(inout t timestamptz, inout jornada timestamptz,
  inout tramo numeric, inout dia numeric, p_horas numeric, p_inicio time default time '07:00')
language plpgsql stable as $$
declare h numeric := greatest(coalesce(p_horas, 0), 0); trozo numeric; queda numeric; e constant numeric := 0.0001;
begin
  while h > e loop
    queda := extract(epoch from (jornada + interval '13 hours' - t)) / 3600;
    if dia >= 9 - e or queda <= e then
      -- Fin de jornada: descanso de 11 h, y no arranca antes de su hora (las 7:00).
      t := greatest(t + interval '11 hours',
                    (((t + interval '11 hours') at time zone 'Europe/Madrid')::date + p_inicio) at time zone 'Europe/Madrid');
      jornada := t; tramo := 0; dia := 0;
      continue;
    end if;
    if tramo >= 4.5 - e then                                  -- 4 h 30 min seguidas: pausa de 45 min
      t := t + interval '45 minutes'; tramo := 0;
      continue;
    end if;
    trozo := least(h, 4.5 - tramo, 9 - dia, queda);
    t := t + trozo * interval '1 hour'; h := h - trozo; tramo := tramo + trozo; dia := dia + trozo;
  end loop;
end $$;
revoke execute on function seguimiento_conducir(timestamptz, timestamptz, numeric, numeric, numeric, time) from public, anon, authenticated;
comment on function public.seguimiento_conducir(timestamptz, timestamptz, numeric, numeric, numeric, time) is '[Envíos] Paso interno del seguimiento: suma horas de conducción con pausas de 45 min cada 4 h 30 min, máximo 9 h al día, jornada de 13 h y descanso de 11 h sin arrancar antes de p_inicio (7:00). Quién: interno.';

-- Primera hora, desde p_t, en que el sitio está abierto (su horario de cada día, con verano y
-- cierre a mediodía; mira hasta 7 días). Sin sitio o sin horario: p_t.
create or replace function seguimiento_apertura(p_sitio uuid, p_t timestamptz)
returns timestamptz language plpgsql stable set search_path = public as $$
declare d date := (p_t at time zone 'Europe/Madrid')::date; i int; h record;
begin
  if p_sitio is null then return p_t; end if;
  for i in 0 .. 7 loop
    for h in select x.abre, x.cierra from horario_del_dia(p_sitio, d + i) x where x.abre is not null and x.cierra is not null order by x.abre loop
      if (((d + i) + h.cierra) at time zone 'Europe/Madrid') > p_t then
        return greatest(p_t, ((d + i) + h.abre) at time zone 'Europe/Madrid');
      end if;
    end loop;
  end loop;
  return p_t;
end $$;
revoke execute on function seguimiento_apertura(uuid, timestamptz) from public, anon, authenticated;
comment on function public.seguimiento_apertura(uuid, timestamptz) is '[Envíos] Paso interno del seguimiento: primera hora desde p_t en que el sitio está abierto según su horario (hasta 7 días). Quién: interno.';

-- Etapa ↔ (estado, parada).
create or replace function seguimiento_paso(p_estado estado_envio, p_parada smallint, p_paradas int)
returns smallint language sql immutable as $$
  select (case p_estado
    when 'programado' then 0
    when 'hacia_la_carga' then 1
    when 'cargando' then 2 * greatest(coalesce(p_parada, 1), 1)
    when 'en_ruta' then 2 * greatest(coalesce(p_parada, 2), 2) - 1
    when 'entregado' then 2 * p_paradas + 1
  end)::smallint
$$;
revoke execute on function seguimiento_paso(estado_envio, smallint, int) from public, anon;
grant execute on function seguimiento_paso(estado_envio, smallint, int) to authenticated, service_role;
comment on function public.seguimiento_paso(estado_envio, smallint, int) is '[Envíos] Número de etapa de un envío (0 programado, 1 yendo a la carga, 2·p en la parada p, 2·p−1 en ruta a la parada p, 2·n+1 entregado). Argumentos: p_estado · p_parada: parada_actual · p_paradas: cuántas paradas tiene.';

-- Todas las etapas del envío con su hora (prevista, o la marcada). Interno: sin permisos.
create or replace function seguimiento_calcular(p_envio uuid)
returns table (paso smallint, estado estado_envio, parada smallint, parada_id uuid, tipo_parada text,
               poblacion text, hora timestamptz, km numeric, km_estimado boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  e record; p record; v_dia date; v_hora1 time; v_n int; k int; v_ultimo int;
  t timestamptz; v_jor timestamptz; v_tramo numeric := 0; v_diac numeric := 0;
  v_hasta_carga numeric := (parametro('seguimiento_minutos_hasta_carga') #>> '{}')::numeric / 60;
  v_parada interval := ((parametro('seguimiento_minutos_por_parada') #>> '{}')::numeric) * interval '1 minute';
  v_vel numeric := greatest((parametro('seguimiento_velocidad_kmh') #>> '{}')::numeric, 1);
  v_km_def numeric := (parametro('seguimiento_km_por_defecto') #>> '{}')::numeric;
  v_inicio time; v_abre timestamptz;
  ids uuid[]; tipos text[]; pobs text[]; las float8[]; los float8[]; sit uuid[]; cps text[]; pais text[]; dsig numeric[];
  horas timestamptz[]; kms numeric[]; est boolean[];
  v_km numeric; v_est boolean; a float8; v_h timestamptz;
begin
  select x.fecha_carga_real, x.fecha_carga_prevista, x.fecha_carga_desde, x.ancla_paso, x.ancla_hora
    into e from envios x where x.id = p_envio;
  if not found then return; end if;
  v_dia := coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde);
  select array_agg(q.id order by q.orden), array_agg(q.tipo order by q.orden), array_agg(coalesce(q.poblacion, l.poblacion) order by q.orden),
         array_agg(coalesce(q.lat, l.lat)::float8 order by q.orden), array_agg(coalesce(q.lon, l.lon)::float8 order by q.orden),
         array_agg(q.sitio_id order by q.orden), array_agg(coalesce(q.codigo_postal, l.codigo_postal) order by q.orden),
         array_agg(coalesce(q.pais_codigo_iso, l.pais_codigo_iso)::text order by q.orden), array_agg(q.distancia_siguiente_km order by q.orden)
    into ids, tipos, pobs, las, los, sit, cps, pais, dsig
    from envio_paradas q left join sitios l on l.id = q.sitio_id where q.envio_id = p_envio;
  v_n := coalesce(array_length(ids, 1), 0);
  if v_n = 0 or (v_dia is null and e.ancla_hora is null) then return; end if;
  v_ultimo := 2 * v_n + 1;
  v_dia := coalesce(v_dia, (e.ancla_hora at time zone 'Europe/Madrid')::date);

  begin   -- una hora mal escrita en Parámetros («11» o «11h») no rompe nada: 12:30
    v_hora1 := (parametro(case when en_temporada(v_dia, parametro('verano_sitios_desde') #>> '{}', parametro('verano_sitios_hasta') #>> '{}')
                               then 'seguimiento_hora_primera_parada_verano' else 'seguimiento_hora_primera_parada' end) #>> '{}')::time;
  exception when others then v_hora1 := time '12:30';
  end;
  begin
    v_inicio := (parametro('seguimiento_hora_inicio_jornada') #>> '{}')::time;
  exception when others then v_inicio := time '07:00';
  end;
  horas := array_fill(null::timestamptz, array[v_ultimo]); kms := array_fill(null::numeric, array[v_ultimo]); est := array_fill(false, array[v_ultimo]);

  for k in 1 .. v_ultimo loop
    if k = 1 then
      t := ((v_dia + v_hora1) at time zone 'Europe/Madrid') - v_hasta_carga * interval '1 hour';
      v_jor := least(t, (v_dia + v_inicio) at time zone 'Europe/Madrid'); v_tramo := 0; v_diac := 0;   -- la jornada empezó a las 7:00
    elsif k = 2 then
      select x.t, x.jornada, x.tramo, x.dia into t, v_jor, v_tramo, v_diac from seguimiento_conducir(t, v_jor, v_tramo, v_diac, v_hasta_carga, v_inicio) x;
    elsif k % 2 = 0 then
      -- Llega a la parada k/2 desde la anterior.
      v_km := dsig[k / 2 - 1]; v_est := false;
      if v_km is null and sit[k / 2 - 1] is not null and sit[k / 2] is not null then v_km := km_sitios(sit[k / 2 - 1], sit[k / 2], interval '100 years'); end if;
      if v_km is null and cps[k / 2 - 1] is not null and cps[k / 2] is not null then v_km := km_cp(pais[k / 2 - 1], cps[k / 2 - 1], pais[k / 2], cps[k / 2], interval '100 years'); end if;
      if v_km is null and las[k / 2 - 1] is not null and las[k / 2] is not null and los[k / 2 - 1] is not null and los[k / 2] is not null then
        a := sin(radians(las[k / 2] - las[k / 2 - 1]) / 2) ^ 2 + cos(radians(las[k / 2 - 1])) * cos(radians(las[k / 2])) * sin(radians(los[k / 2] - los[k / 2 - 1]) / 2) ^ 2;
        v_km := round((2 * 6371 * asin(sqrt(a)) * 1.25)::numeric, 1);
      end if;
      if v_km is null then v_km := v_km_def; v_est := true; end if;
      kms[k] := v_km; est[k] := v_est;
      select x.t, x.jornada, x.tramo, x.dia into t, v_jor, v_tramo, v_diac from seguimiento_conducir(t, v_jor, v_tramo, v_diac, v_km / v_vel, v_inicio) x;
    else
      t := t + v_parada;                 -- sale de la parada (k−1)/2 tras cargar o descargar
    end if;
    if k % 2 = 0 then
      -- Llega antes de que abra el sitio: espera parado hasta la apertura (cuenta como jornada,
      -- no como conducción). 45 min o más le sirven de pausa; 11 h o más, de descanso.
      v_abre := seguimiento_apertura(sit[k / 2], t);
      if v_abre > t then
        if v_abre - t >= interval '11 hours' then v_jor := v_abre; v_tramo := 0; v_diac := 0;
        elsif v_abre - t >= interval '45 minutes' then v_tramo := 0; end if;
        t := v_abre;
      end if;
    end if;
    -- La etapa marcada a mano manda; si empezó 11 h o más después de lo previsto, ya ha descansado.
    if e.ancla_paso = k and e.ancla_hora is not null then
      if e.ancla_hora - t >= interval '11 hours' then v_jor := e.ancla_hora; v_tramo := 0; v_diac := 0; end if;
      t := e.ancla_hora;
    end if;
    horas[k] := t;
  end loop;

  -- Las etapas anteriores a la marcada no pueden ser más tarde que ella.
  if e.ancla_paso between 1 and v_ultimo and e.ancla_hora is not null then
    for k in 1 .. e.ancla_paso - 1 loop horas[k] := least(horas[k], e.ancla_hora); end loop;
  end if;

  paso := 0; estado := 'programado'; parada := null; parada_id := null; tipo_parada := null; poblacion := null; hora := null; km := null; km_estimado := false;
  return next;
  for k in 1 .. v_ultimo loop
    paso := k; hora := horas[k]; km := kms[k]; km_estimado := est[k];
    if k = v_ultimo then estado := 'entregado'; parada := v_n;
    elsif k = 1 then estado := 'hacia_la_carga'; parada := 1;
    elsif k % 2 = 0 then estado := 'cargando'; parada := k / 2;
    else estado := 'en_ruta'; parada := (k + 1) / 2; end if;
    parada_id := ids[parada]; tipo_parada := tipos[parada]; poblacion := pobs[parada];
    return next;
  end loop;
end $$;
revoke execute on function seguimiento_calcular(uuid) from public, anon, authenticated;
grant execute on function seguimiento_calcular(uuid) to service_role;
comment on function public.seguimiento_calcular(uuid) is '[Envíos] Paso interno del seguimiento: todas las etapas del envío con su hora prevista (o la marcada a mano) y los km de cada tramo. Quién: interno (las pantallas usan etapas_envio).';

-- Lo que ven las pantallas: las etapas, cuál es la actual y si ya se hizo.
create or replace function etapas_envio(p_envio uuid)
returns table (paso smallint, estado estado_envio, parada smallint, tipo_parada text, poblacion text,
               hora timestamptz, km numeric, km_estimado boolean, hecha boolean, actual boolean, marcada boolean)
language plpgsql stable security definer set search_path = public as $$
declare e record; v_n int; v_actual smallint;
begin
  if not puede_ver_envio(p_envio) then return; end if;
  select x.estado, x.parada_actual, x.ancla_paso into e from envios x where x.id = p_envio;
  select count(*) into v_n from envio_paradas where envio_id = p_envio;
  v_actual := seguimiento_paso(e.estado, e.parada_actual, v_n);
  return query
    select c.paso, c.estado, c.parada, c.tipo_parada, c.poblacion, c.hora, c.km, c.km_estimado,
           coalesce(c.paso <= v_actual, false), coalesce(c.paso = v_actual, false), coalesce(c.paso = e.ancla_paso, false)
      from seguimiento_calcular(p_envio) c order by c.paso;
end $$;
revoke execute on function etapas_envio(uuid) from public, anon;
grant execute on function etapas_envio(uuid) to authenticated, service_role;
comment on function public.etapas_envio(uuid) is '[Envíos] Etapas del envío (programado, yendo a la carga, cada parada, en ruta a la siguiente, entregado) con la hora prevista o la real, cuál es la actual y cuál se marcó a mano. Quién: Dynamo, el cliente dueño o el transportista asignado. Argumentos: p_envio: envios.id.';

-- Primera posibilidad de cargar: el primer día de la ventana a la hora a la que abre la
-- 1.ª parada (si su sitio tiene horario; si no, a las 8:00).
create or replace function primera_carga_posible(p_envio uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select ((e.fecha_carga_desde + coalesce((select min(h.abre) from envio_paradas q, horario_del_dia(q.sitio_id, e.fecha_carga_desde) h
                                            where q.envio_id = e.id and q.orden = (select min(orden) from envio_paradas where envio_id = e.id)
                                              and q.sitio_id is not null), time '08:00')) at time zone 'Europe/Madrid')
    from envios e where e.id = p_envio and e.fecha_carga_desde is not null
$$;
revoke execute on function primera_carga_posible(uuid) from public, anon, authenticated;
grant execute on function primera_carga_posible(uuid) to service_role;
comment on function public.primera_carga_posible(uuid) is '[Envíos] Paso interno: primer día de la ventana a la hora de apertura de la 1.ª parada (8:00 si no tiene horario). Quién: interno.';

-- Para las listas: en qué parada está, de qué tipo, y si ya toca «Asignando transportista».
create or replace function seguimiento_envios(p_ids uuid[])
returns table (envio_id uuid, parada_actual smallint, tipo_parada text, paradas int, primera_carga_en timestamptz,
               asignando boolean, fecha_carga_prevista date, automatico boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.parada_actual,
         (select q.tipo from envio_paradas q where q.envio_id = e.id and q.orden = e.parada_actual),
         (select count(*)::int from envio_paradas q where q.envio_id = e.id),
         primera_carga_posible(e.id),
         e.estado = 'programado' and e.transportista_id is null and not coalesce(e.es_manual, false)
           and coalesce(e.estado_pago_previo, '') <> 'pendiente'
           and now() >= primera_carga_posible(e.id) - ((parametro('seguimiento_horas_asignando') #>> '{}')::numeric) * interval '1 hour',
         e.fecha_carga_prevista, e.seguimiento_automatico
    from envios e
   where e.id = any(p_ids) and cardinality(p_ids) <= 200
     and (ve_todo() or e.cliente_id = cliente_del_usuario() or e.transportista_id = transportista_del_usuario())
$$;
revoke execute on function seguimiento_envios(uuid[]) from public, anon;
grant execute on function seguimiento_envios(uuid[]) to authenticated, service_role;
comment on function public.seguimiento_envios(uuid[]) is '[Envíos] Para las listas (máx. 200 ids): parada actual y su tipo, cuántas paradas, primera posibilidad de cargar, si se ve como «Asignando transportista» (sin transportista y a menos de seguimiento_horas_asignando horas), día previsto de carga y si el automático está en marcha. Quién: Dynamo, cliente dueño o transportista asignado. Argumentos: p_ids: envios.id.';

-- ---- Mover el envío a la etapa que toca --------------------------------------------------
-- Hacia delante, etapa a etapa (cada una con su hito y su hora); hacia atrás (solo al marcar
-- a mano), de golpe y quitando la hora de las paradas que vuelven a quedar por hacer.
create or replace function seguimiento_aplicar(p_envio uuid, p_a_mano boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare e record; v_n int; v_actual int; v_obj int; c record; n int := 0;
begin
  select x.id, x.estado, x.parada_actual, x.transportista_id, x.es_manual, x.estado_pago_previo, x.seguimiento_automatico
    into e from envios x where x.id = p_envio for update skip locked;
  if not found then return 0; end if;
  if e.estado not in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado') then return 0; end if;
  if not p_a_mano and (e.estado = 'entregado' or not e.seguimiento_automatico or e.transportista_id is null
       or coalesce(e.es_manual, false) or coalesce(e.estado_pago_previo, '') = 'pendiente') then return 0; end if;
  select count(*) into v_n from envio_paradas where envio_id = p_envio;
  if v_n = 0 then return 0; end if;
  v_actual := seguimiento_paso(e.estado, e.parada_actual, v_n);
  select coalesce(max(s.paso), 0) into v_obj from seguimiento_calcular(p_envio) s where s.hora <= now();
  if v_obj = v_actual or (v_obj < v_actual and not p_a_mano) then return 0; end if;

  perform set_config('dynamo.seguimiento', case when p_a_mano then 'mano' else 'auto' end, true);
  if v_obj > v_actual then
    for c in select * from seguimiento_calcular(p_envio) s where s.paso > v_actual and s.paso <= v_obj order by s.paso loop
      perform set_config('dynamo.hora_etapa', c.hora::text, true);
      update envios set estado = c.estado, parada_actual = case when c.paso = 0 then null else c.parada end,
             fecha_carga_real = case when c.estado in ('en_ruta', 'entregado') then coalesce(fecha_carga_real, (c.hora at time zone 'Europe/Madrid')::date) else fecha_carga_real end
       where id = p_envio;
      n := n + 1;
    end loop;
  else
    select * into c from seguimiento_calcular(p_envio) s where s.paso = v_obj;
    perform set_config('dynamo.hora_etapa', coalesce(c.hora, now())::text, true);
    -- Lo que vuelve a quedar por hacer, sin hora.
    update envio_paradas set realizado_en = null
     where envio_id = p_envio and realizado_en is not null
       and orden >= case when v_obj <= 1 then 1 when v_obj % 2 = 0 then v_obj / 2 else (v_obj + 1) / 2 end;
    update envios set estado = c.estado, parada_actual = case when v_obj = 0 then null else c.parada end,
           fecha_carga_real = case when v_obj <= 2 then null else fecha_carga_real end
     where id = p_envio;
    n := 1;
  end if;
  perform set_config('dynamo.hora_etapa', '', true);
  perform set_config('dynamo.seguimiento', '', true);
  return n;
end $$;
revoke execute on function seguimiento_aplicar(uuid, boolean) from public, anon, authenticated;
grant execute on function seguimiento_aplicar(uuid, boolean) to service_role;
comment on function public.seguimiento_aplicar(uuid, boolean) is '[Envíos] Paso interno del seguimiento: pone el envío en la etapa que toca según su horario. Hacia delante etapa a etapa; hacia atrás solo si es a mano. Devuelve cuántos cambios hizo. Quién: interno.';

-- Tarea cada 5 min: todos los envíos en marcha.
create or replace function avanzar_estados_envios()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not coalesce((parametro('seguimiento_activo') #>> '{}')::boolean, false) then return 0; end if;
  for r in select x.id from envios x
            where x.estado in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta')
              and x.seguimiento_automatico and x.transportista_id is not null and not coalesce(x.es_manual, false)
              and coalesce(x.estado_pago_previo, '') <> 'pendiente'
              and (x.ancla_hora is not null or coalesce(x.fecha_carga_real, x.fecha_carga_prevista, x.fecha_carga_desde) between (now() at time zone 'Europe/Madrid')::date - 30 and (now() at time zone 'Europe/Madrid')::date) loop
    begin
      n := n + seguimiento_aplicar(r.id, false);
    exception when others then
      raise warning 'Seguimiento automático: el envío % no se ha podido mover (%).', r.id, sqlerrm;
    end;
  end loop;
  return n;
end $$;
revoke execute on function avanzar_estados_envios() from public, anon, authenticated;
grant execute on function avanzar_estados_envios() to service_role;
comment on function public.avanzar_estados_envios() is '[Envíos] Tarea automática (cada 5 min): pone en su etapa a los envíos en marcha según su horario previsto (o la etapa marcada a mano). Devuelve cuántos cambios hizo. Quién: pg_cron.';

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('dynamo-estados-automaticos', '*/5 * * * *', 'select public.avanzar_estados_envios()');
    exception when others then
      raise notice 'No se pudo programar el seguimiento automático (%).', sqlerrm;
    end;
  end if;
end $$;

-- ---- A mano (Dynamo) ------------------------------------------------------------------
create or replace function marcar_etapa_envio(p_envio uuid, p_paso smallint, p_hora timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e record; v_n int; v_hora timestamptz := coalesce(p_hora, now()); v_antes smallint; c record;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo cambia el estado de un envío.' using errcode = '42501'; end if;
  select x.estado, x.parada_actual, x.transportista_id, x.es_manual, x.operador_id into e from envios x where x.id = p_envio for update;
  if not found then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  if e.estado = 'cancelado' then return jsonb_build_object('ok', false, 'resultado', 'cancelado'); end if;
  if e.estado = 'borrador' then return jsonb_build_object('ok', false, 'resultado', 'borrador'); end if;
  select count(*) into v_n from envio_paradas where envio_id = p_envio;
  if v_n = 0 or p_paso is null or p_paso < 0 or p_paso > 2 * v_n + 1 then return jsonb_build_object('ok', false, 'resultado', 'etapa_no_valida'); end if;
  if p_paso > 0 and e.transportista_id is null and e.operador_id is null then return jsonb_build_object('ok', false, 'resultado', 'sin_transportista'); end if;
  if v_hora < now() - interval '30 days' or v_hora > now() + interval '14 days' then return jsonb_build_object('ok', false, 'resultado', 'hora_no_valida'); end if;
  v_antes := seguimiento_paso(e.estado, e.parada_actual, v_n);

  update envios set ancla_paso = case when p_paso = 0 then null else p_paso end,
                    ancla_hora = case when p_paso = 0 then null else v_hora end
   where id = p_envio;
  select * into c from seguimiento_calcular(p_envio) s where s.paso = p_paso;
  perform registrar_hito(p_envio, 'etapa_corregida', c.parada_id, null,
    jsonb_build_object('paso', p_paso, 'estado', c.estado, 'parada', c.parada, 'tipo_parada', c.tipo_parada,
                       'hora', v_hora, 'paso_anterior', v_antes));
  perform seguimiento_aplicar(p_envio, true);
  return jsonb_build_object('ok', true, 'resultado', 'marcada',
    'estado', (select estado from envios where id = p_envio), 'parada_actual', (select parada_actual from envios where id = p_envio));
end $$;
revoke execute on function marcar_etapa_envio(uuid, smallint, timestamptz) from public, anon;
grant execute on function marcar_etapa_envio(uuid, smallint, timestamptz) to authenticated, service_role;
comment on function public.marcar_etapa_envio(uuid, smallint, timestamptz) is '[Envíos] Dynamo marca a mano en qué etapa está el envío y a qué hora empezó (o empezará: una hora futura atrasa). Desde ahí el automático sigue con los mismos plazos. Hacia delante deja el hito de cada etapa; hacia atrás quita la hora de las paradas que vuelven a quedar por hacer. Devuelve {ok, resultado: marcada | no_existe | cancelado | borrador | etapa_no_valida | sin_transportista | hora_no_valida, estado, parada_actual}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_paso: 0 programado, 1 yendo a la carga, 2·p en la parada p, 2·p−1 en ruta a la parada p, 2·n+1 entregado (ver etapas_envio) · p_hora: cuándo (por defecto, ahora; entre 30 días atrás y 14 adelante).';

create or replace function pausar_seguimiento_envio(p_envio uuid, p_pausar boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo cambia el estado de un envío.' using errcode = '42501'; end if;
  update envios set seguimiento_automatico = not coalesce(p_pausar, false) where id = p_envio;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  if not coalesce(p_pausar, false) then perform seguimiento_aplicar(p_envio, false); end if;
  return jsonb_build_object('ok', true, 'resultado', case when p_pausar then 'pausado' else 'reanudado' end);
end $$;
revoke execute on function pausar_seguimiento_envio(uuid, boolean) from public, anon;
grant execute on function pausar_seguimiento_envio(uuid, boolean) to authenticated, service_role;
comment on function public.pausar_seguimiento_envio(uuid, boolean) is '[Envíos] Pausa o reanuda el seguimiento automático de un envío (p. ej. por una avería). Pausado, el estado no avanza solo; a mano sí. Al reanudar se pone al día. Devuelve {ok, resultado: pausado | reanudado | no_existe}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_pausar: true pausa, false reanuda.';

-- El cambio de fase de siempre (también el de n8n) pasa a ser marcar la etapa ahora.
drop function if exists marcar_estado_envio(uuid, estado_envio, date);
create or replace function marcar_estado_envio(p_envio uuid, p_estado estado_envio, p_fecha_carga_real date default null,
  p_parada smallint default null, p_hora timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e record; v_n int; r jsonb;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo cambia el estado de un envío.' using errcode = '42501'; end if;
  if p_estado not in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado') then return jsonb_build_object('ok', false, 'resultado', 'estado_no_valido'); end if;
  select estado, transportista_id, es_manual into e from envios where id = p_envio;
  if not found then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  if e.estado = 'cancelado' then return jsonb_build_object('ok', false, 'resultado', 'cancelado'); end if;
  if p_estado <> 'programado' and e.transportista_id is null and not e.es_manual then return jsonb_build_object('ok', false, 'resultado', 'sin_transportista'); end if;
  select count(*) into v_n from envio_paradas where envio_id = p_envio;
  if p_parada is not null and (p_parada < 1 or p_parada > v_n or (p_estado = 'en_ruta' and p_parada < 2)) then return jsonb_build_object('ok', false, 'resultado', 'parada_no_valida'); end if;
  if v_n = 0 then
    update envios set estado = p_estado, fecha_carga_real = coalesce(p_fecha_carga_real, fecha_carga_real) where id = p_envio;
    return jsonb_build_object('ok', true, 'resultado', 'cambiado');
  end if;
  r := marcar_etapa_envio(p_envio, seguimiento_paso(p_estado, p_parada, v_n), p_hora);
  if not (r ->> 'ok')::boolean then return r; end if;
  if p_fecha_carga_real is not null then update envios set fecha_carga_real = p_fecha_carga_real where id = p_envio; end if;
  return jsonb_build_object('ok', true, 'resultado', 'cambiado');
end $$;
revoke execute on function marcar_estado_envio(uuid, estado_envio, date, smallint, timestamptz) from public, anon;
grant execute on function marcar_estado_envio(uuid, estado_envio, date, smallint, timestamptz) to authenticated, service_role;
comment on function public.marcar_estado_envio(uuid, estado_envio, date, smallint, timestamptz) is '[Envíos] Dynamo cambia la fase de un envío (programado, hacia_la_carga, cargando, en_ruta, entregado): es marcar esa etapa (marcar_etapa_envio) y el automático sigue desde ahí. Para cancelar: cancelar_envio. Devuelve {ok, resultado: cambiado | no_existe | cancelado | sin_transportista | estado_no_valido | parada_no_valida | …}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_estado: la fase nueva · p_fecha_carga_real: día real de carga (opcional) · p_parada: en qué parada (cargando) o hacia cuál (en_ruta, ≥ 2); por defecto la 1.ª / la 2.ª · p_hora: cuándo (por defecto, ahora).';

-- ---- Asignar: día previsto de carga ---------------------------------------------------------
drop function if exists asignar_transportista(uuid, uuid, numeric, text, text, text, text);
create or replace function asignar_transportista(p_envio uuid, p_transportista uuid, p_importe_transportista numeric default null,
  p_matricula_camion text default null, p_matricula_remolque text default null, p_conductor_nombre text default null,
  p_conductor_telefono text default null, p_fecha_carga_prevista date default null)
returns jsonb language plpgsql set search_path = public as $$
declare v_t record; v_e record; v_tel text := regexp_replace(coalesce(p_conductor_telefono, ''), '[^0-9+]', '', 'g');
  n int; v_fp date;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo asigna transportistas.' using errcode = '42501'; end if;
  select estado_operativo into v_t from transportistas where id = p_transportista;
  if not found then return jsonb_build_object('ok', false, 'resultado', 'transportista_no_existe'); end if;
  if v_t.estado_operativo = 'suspendido' then return jsonb_build_object('ok', false, 'resultado', 'transportista_suspendido'); end if;
  if p_importe_transportista is not null and p_importe_transportista < 0 then return jsonb_build_object('ok', false, 'resultado', 'importe_no_valido'); end if;
  select fecha_carga_desde, fecha_carga_hasta, fecha_carga_prevista into v_e from envios where id = p_envio;
  if not found then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  -- Con ventana, el día en que carga es obligatorio y dentro de la ventana; con fecha fija, esa.
  if v_e.fecha_carga_desde is not null and v_e.fecha_carga_desde = coalesce(v_e.fecha_carga_hasta, v_e.fecha_carga_desde) then
    v_fp := v_e.fecha_carga_desde;
  else
    v_fp := coalesce(p_fecha_carga_prevista, v_e.fecha_carga_prevista);
    if v_fp is null then return jsonb_build_object('ok', false, 'resultado', 'falta_fecha_prevista'); end if;
    if v_e.fecha_carga_desde is not null and (v_fp < v_e.fecha_carga_desde or v_fp > coalesce(v_e.fecha_carga_hasta, v_e.fecha_carga_desde)) then
      return jsonb_build_object('ok', false, 'resultado', 'fecha_fuera_de_ventana');
    end if;
  end if;
  update envios set transportista_id = p_transportista, estado_asignacion = 'confirmada', importe_transportista = p_importe_transportista,
         matricula_camion = nullif(upper(regexp_replace(coalesce(p_matricula_camion, ''), '[\s-]', '', 'g')), ''),
         matricula_remolque = nullif(upper(regexp_replace(coalesce(p_matricula_remolque, ''), '[\s-]', '', 'g')), ''),
         conductor_nombre = nullif(trim(coalesce(p_conductor_nombre, '')), ''),
         conductor_telefono = case when length(replace(v_tel, '+', '')) >= 6 then v_tel end,
         fecha_carga_prevista = v_fp,
         -- Otro día: la etapa marcada a mano de antes ya no vale.
         ancla_paso = case when v_fp is distinct from fecha_carga_prevista and estado = 'programado' then null else ancla_paso end,
         ancla_hora = case when v_fp is distinct from fecha_carga_prevista and estado = 'programado' then null else ancla_hora end
   where id = p_envio;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  return jsonb_build_object('ok', true, 'resultado', 'asignado');
end $$;
revoke execute on function asignar_transportista(uuid, uuid, numeric, text, text, text, text, date) from public, anon;
grant execute on function asignar_transportista(uuid, uuid, numeric, text, text, text, text, date) to authenticated, service_role;
comment on function public.asignar_transportista(uuid, uuid, numeric, text, text, text, text, date) is '[Envíos] Asigna a mano un transportista a un envío (queda confirmado), con su precio, matrículas, conductor y el día en que carga. No deja uno suspendido. Devuelve {ok, resultado: asignado | no_existe | transportista_no_existe | transportista_suspendido | importe_no_valido | falta_fecha_prevista | fecha_fuera_de_ventana}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_transportista: transportistas.id · p_importe_transportista: euros sin IVA (opcional) · p_matricula_camion, p_matricula_remolque (opcionales; se guardan en mayúsculas y sin espacios) · p_conductor_nombre, p_conductor_telefono (opcionales; teléfono con prefijo) · p_fecha_carga_prevista: día en que carga, obligatorio si el envío tiene ventana (dentro de ella; con fecha fija se ignora).';

-- ---- Coherencia del día previsto -------------------------------------------------------------
-- Con fecha fija y transportista, el día previsto es esa fecha; si la fecha o la ventana
-- cambian y el día previsto se queda fuera, se borra (habrá que volver a ponerlo). Un envío
-- todavía programado que cambia de día pierde la etapa marcada a mano.
create or replace function fn_envios_zz_fecha_prevista()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.fecha_carga_desde is not null and new.fecha_carga_desde = coalesce(new.fecha_carga_hasta, new.fecha_carga_desde) then
    if new.transportista_id is not null then new.fecha_carga_prevista := new.fecha_carga_desde; end if;
  elsif new.fecha_carga_prevista is not null and (new.fecha_carga_desde is null
        or new.fecha_carga_prevista < new.fecha_carga_desde or new.fecha_carga_prevista > coalesce(new.fecha_carga_hasta, new.fecha_carga_desde)) then
    new.fecha_carga_prevista := null;
  end if;
  if tg_op = 'UPDATE' and new.estado = 'programado'
     and (new.fecha_carga_desde, new.fecha_carga_hasta, new.fecha_carga_prevista) is distinct from (old.fecha_carga_desde, old.fecha_carga_hasta, old.fecha_carga_prevista)
     and (new.ancla_paso, new.ancla_hora) is not distinct from (old.ancla_paso, old.ancla_hora) then
    new.ancla_paso := null; new.ancla_hora := null;
  end if;
  return new;
end $$;
drop trigger if exists tg_envios_zz_fecha_prevista on envios;
create trigger tg_envios_zz_fecha_prevista before insert or update on envios
  for each row execute function fn_envios_zz_fecha_prevista();
comment on function public.fn_envios_zz_fecha_prevista() is '[Envíos] Disparador: con fecha fija y transportista, el día previsto de carga es esa fecha; si cambia la ventana y el día previsto queda fuera, se borra; un envío programado que cambia de día pierde la etapa marcada a mano.';

-- Los envíos ya asignados con fecha fija: su día previsto.
update envios set fecha_carga_prevista = fecha_carga_desde
 where fecha_carga_prevista is null and transportista_id is not null and fecha_carga_desde is not null
   and fecha_carga_desde = coalesce(fecha_carga_hasta, fecha_carga_desde);
-- Los que ya están en marcha se quedan como estaban hasta que alguien los marque (no se
-- mueven solos de golpe al aplicar esta migración).
update envios set seguimiento_automatico = false where estado in ('hacia_la_carga', 'cargando', 'en_ruta') and parada_actual is null;

-- ---- Hitos: cada parada con su hito y su hora -----------------------------------------------
create or replace function fn_hitos_sellar()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('dynamo.migracion', true), '') = 'on' then
    new.cuando := coalesce(new.cuando, now());
    new.quien_origen := 'migracion-sheet';
  elsif coalesce(current_setting('dynamo.seguimiento', true), '') in ('auto', 'mano') then
    -- Seguimiento: la hora de la etapa (nunca futura). Automático: sin persona.
    new.cuando := least(coalesce(nullif(current_setting('dynamo.hora_etapa', true), '')::timestamptz, now()), now());
    if current_setting('dynamo.seguimiento', true) = 'auto' then new.quien_origen := 'sistema'; end if;
  else
    new.cuando := now();
  end if;
  new.quien := coalesce(auth.uid(), new.quien);
  return new;
end $$;

create or replace function fn_envios_hitos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hora timestamptz := least(coalesce(nullif(current_setting('dynamo.hora_etapa', true), '')::timestamptz, now()), now());
  p record;
begin
  if tg_op = 'INSERT' then
    perform registrar_hito(new.id, 'creado', null, null,
      jsonb_build_object('estado', new.estado, 'importe_cliente', new.importe_cliente));
    if new.estado not in ('borrador', 'cancelado') then
      perform registrar_hito(new.id, 'confirmado');
    end if;
    return null;
  end if;

  if old.estado = 'borrador' and new.estado not in ('borrador', 'cancelado') then
    perform registrar_hito(new.id, 'confirmado', null, null,
      jsonb_build_object('importe_cliente', new.importe_cliente));
  end if;

  if new.publicado_en_bolsa_en is distinct from old.publicado_en_bolsa_en
     and new.publicado_en_bolsa_en is not null then
    perform registrar_hito(new.id, 'publicado_bolsa');
  end if;

  if new.transportista_id is distinct from old.transportista_id then
    if old.transportista_id is not null then
      perform registrar_hito(new.id, 'transportista_quitado', null, null,
        jsonb_build_object('transportista_id', old.transportista_id));
    end if;
    if new.transportista_id is not null then
      perform registrar_hito(new.id, 'transportista_asignado', null, null,
        jsonb_build_object('transportista_id', new.transportista_id,
                           'importe_transportista', new.importe_transportista,
                           'fecha_carga_prevista', new.fecha_carga_prevista));
    end if;
  end if;

  if (new.matricula_camion, new.matricula_remolque)
       is distinct from (old.matricula_camion, old.matricula_remolque)
     and coalesce(new.matricula_camion, new.matricula_remolque) is not null then
    perform registrar_hito(new.id, 'matricula_asignada', null, null,
      jsonb_build_object('camion', new.matricula_camion,
                         'remolque', new.matricula_remolque));
  end if;

  if (new.estado, new.parada_actual) is distinct from (old.estado, old.parada_actual) then
    if new.estado = 'hacia_la_carga' then perform registrar_hito(new.id, 'hacia_la_carga', null, null, jsonb_build_object('parada', 1)); end if;
    if new.estado = 'cargando' then
      -- Llega a la parada: cargando si es recogida, descargando si es entrega.
      select id, orden, tipo into p from envio_paradas where envio_id = new.id and orden = coalesce(new.parada_actual, 1);
      perform registrar_hito(new.id, (case when p.tipo = 'descarga' then 'descargando' else 'cargando' end)::tipo_hito, p.id, null,
        jsonb_build_object('parada', p.orden));
    end if;
    if new.estado = 'en_ruta' then
      if new.parada_actual is not null and new.parada_actual >= 2 then
        -- Sale de la parada anterior hacia la siguiente.
        select id, orden, tipo into p from envio_paradas where envio_id = new.id and orden = new.parada_actual - 1;
        perform registrar_hito(new.id, (case when p.tipo = 'descarga' then 'descargado' else 'cargado' end)::tipo_hito, p.id, null,
          jsonb_build_object('parada', p.orden, 'hacia_parada', new.parada_actual));
        update envio_paradas set realizado_en = v_hora where id = p.id and realizado_en is null;
      else
        -- Cambio a mano sin parada (como antes): cargado, con la hora en las recogidas.
        perform registrar_hito(new.id, 'cargado');
        update envio_paradas set realizado_en = v_hora
         where envio_id = new.id and tipo = 'carga' and realizado_en is null;
      end if;
    end if;
    if new.estado = 'entregado' and old.estado is distinct from 'entregado' then
      select id into p from envio_paradas where envio_id = new.id order by orden desc limit 1;
      perform registrar_hito(new.id, 'entregado', p.id);
      update envio_paradas set realizado_en = v_hora
       where envio_id = new.id and realizado_en is null;   -- entregas (y paradas sin hora)
    end if;
    if new.estado = 'cancelado' and old.estado is distinct from 'cancelado' then
      perform registrar_hito(new.id, 'cancelado', null, null,
        jsonb_build_object('estado_anterior', old.estado,
                           'tenia_transportista', old.transportista_id is not null));
    end if;
    if old.estado = 'cancelado' and new.estado is distinct from 'cancelado' then
      perform registrar_hito(new.id, 'cancelacion_deshecha', null, null,
        jsonb_build_object('estado_nuevo', new.estado));
    end if;
  end if;
  return null;
end $$;

create or replace function hito_visible_fuera(p tipo_hito)
returns boolean language sql immutable as $$
  select p in ('creado','confirmado','transportista_asignado','matricula_asignada','hacia_la_carga','cargando','descargando',
               'cargado','descargado','entregado','cancelado','cancelacion_deshecha',
               'orden_carga_enviada','cmr_firmado','pin_validado',
               'pin_validado_manual','incidencia','fecha_carga_movida')
$$;

-- ---- Funciones de siempre, retocadas ------------------------------------------------------
-- «Cargado y en ruta» al cliente: solo la primera vez que sale cargado.
CREATE OR REPLACE FUNCTION public.fn_avisos_envios()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol text := (select rol::text from usuarios where id = auth.uid());
  v_dynamo boolean := coalesce(v_rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura'), false);
  v_por_cliente boolean := coalesce(v_rol = 'cliente', false);
  v_ref text := '#' || coalesce(new.referencia_gx, '');
  v_cli text;
  v_enl text := '/panel/envios?ver=' || new.id;
  o_sol text; o_est estado_envio; o_cam text; o_pago text; o_tr uuid;
begin
  if coalesce(new.es_manual, false) then return null; end if;
  select nombre_visible into v_cli from clientes where id = new.cliente_id;
  v_cli := coalesce(v_cli, 'El cliente');
  if tg_op = 'UPDATE' then
    o_sol := old.estado_solicitud; o_est := old.estado; o_cam := old.estado_cambio_cliente; o_pago := old.estado_pago_previo; o_tr := old.transportista_id;
  end if;

  -- Solicitudes de precio y contraofertas del cliente.
  if new.estado_solicitud is distinct from o_sol then
    if new.estado_solicitud = 'pendiente_precio' then
      perform crear_aviso('dynamo', null, null, 'solicitud', 'aviso', 'Solicitud de precio · ' || v_ref,
        v_cli || case when o_sol = 'precio_propuesto' then ' vuelve a pedir precio (el anterior caducó).' else ' pide precio para un envío.' end, v_enl, new.id);
    elsif new.estado_solicitud = 'precio_propuesto' then
      if o_sol = 'contraoferta' then
        perform crear_aviso('cliente', new.cliente_id, null, 'contraoferta_rechazada', 'aviso', 'Tu propuesta de precio no se ha aceptado · ' || v_ref,
          'Puedes aceptar nuestro precio (' || euros_texto(new.importe_cliente) || ' + IVA) o cancelar sin coste.', v_enl, new.id);
      else
        perform crear_aviso('cliente', new.cliente_id, null, 'precio', 'ok', 'Ya tienes precio · ' || v_ref,
          euros_texto(new.importe_cliente) || ' + IVA. Revísalo y acéptalo antes de que caduque.', v_enl, new.id);
      end if;
    elsif new.estado_solicitud = 'contraoferta' then
      perform crear_aviso('dynamo', null, null, 'importe_contraoferta_cliente', 'aviso', 'Contraoferta del cliente · ' || v_ref,
        v_cli || ' propone ' || euros_texto(new.importe_contraoferta_cliente) || ' (le dimos ' || euros_texto(new.importe_cliente) || ').', v_enl, new.id);
    elsif new.estado_solicitud = 'aceptada' and o_sol = 'contraoferta' then
      perform crear_aviso('cliente', new.cliente_id, null, 'contraoferta_aceptada', 'ok', 'Aceptamos tu precio · ' || v_ref,
        'Tu envío queda confirmado a ' || euros_texto(new.importe_cliente) || ' + IVA.', v_enl, new.id);
    end if;
  end if;

  -- El cliente confirma su envío.
  if tg_op = 'UPDATE' and o_est = 'borrador' and new.estado = 'programado' and v_por_cliente then
    perform crear_aviso('dynamo', null, null, 'confirmado', 'info', 'Envío confirmado · ' || v_ref,
      v_cli || ' lo ha confirmado' || case when new.estado_pago_previo = 'pendiente' then ' (pendiente de pago).' else '.' end, v_enl, new.id);
  end if;

  -- Cambios pedidos por el cliente.
  if new.estado_cambio_cliente is distinct from o_cam then
    if new.estado_cambio_cliente = 'pendiente' then
      perform crear_aviso('dynamo', null, null, 'cambio', 'aviso', 'Cambio pedido · ' || v_ref, v_cli || ' pide un cambio en su envío.', v_enl, new.id);
    elsif new.estado_cambio_cliente in ('aceptado', 'rechazado') then
      perform crear_aviso('cliente', new.cliente_id, null, 'cambio_' || new.estado_cambio_cliente,
        case when new.estado_cambio_cliente = 'aceptado' then 'ok' else 'aviso' end,
        'Tu cambio ha sido ' || new.estado_cambio_cliente || ' · ' || v_ref, new.cambio_cliente_nota, v_enl, new.id);
    end if;
  end if;

  -- Pago por adelantado.
  if tg_op = 'UPDATE' and o_pago = 'pendiente' and new.estado_pago_previo = 'pagado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'pagado', 'ok', 'Pago recibido · ' || v_ref, 'Gracias. Ya buscamos camión para tu envío.' || case when new.fecha_carga_desde is distinct from old.fecha_carga_desde
        then ' El pago llegó cuando ya no daba tiempo a cargar en la fecha elegida, así que la carga pasa al primer día posible: ' || ventana_texto(new.fecha_carga_desde, new.fecha_carga_hasta) || '.' else '' end, v_enl, new.id);
    if not v_dynamo then
      perform crear_aviso('dynamo', null, null, 'pagado', 'ok', 'Pago recibido · ' || v_ref,
        v_cli || ' ha pagado' || case when new.pago_metodo = 'stripe' then ' con tarjeta.' else '.' end || ' Ya se puede asignar.' || case when new.fecha_carga_desde is distinct from old.fecha_carga_desde
        then ' Pagó tarde: la carga pasa a ' || ventana_texto(new.fecha_carga_desde, new.fecha_carga_hasta) || '.' else '' end, v_enl, new.id);
    end if;
  elsif tg_op = 'UPDATE' and o_pago = 'pendiente' and new.estado_pago_previo = 'exento' then
    perform crear_aviso('cliente', new.cliente_id, null, 'exento', 'ok', 'Ya no hace falta pagar por adelantado · ' || v_ref, 'Lo pagarás a tu plazo habitual.' || case when new.fecha_carga_desde is distinct from old.fecha_carga_desde
        then ' Como ya no daba tiempo a cargar en la fecha elegida, la carga pasa al primer día posible: ' || ventana_texto(new.fecha_carga_desde, new.fecha_carga_hasta) || '.' else '' end, v_enl, new.id);
  end if;

  -- Transportista asignado.
  if tg_op = 'UPDATE' and new.transportista_id is not null and new.transportista_id is distinct from o_tr and new.estado <> 'cancelado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'asignado', 'ok', 'Tu envío ya tiene transportista · ' || v_ref, null, v_enl, new.id);
    perform crear_aviso('transportista', null, new.transportista_id, 'asignada', 'ok', 'Envío asignado · ' || v_ref,
      'Revisa los datos y la orden de carga.', v_enl, new.id);
  end if;

  -- En ruta, entregado, cancelado.
  if tg_op = 'UPDATE' and new.estado is distinct from o_est then
    -- Con varias paradas pasa varias veces por «En ruta»: el aviso, solo al salir cargado la primera vez.
    if new.estado = 'en_ruta' and old.cargado_en is null then
      perform crear_aviso('cliente', new.cliente_id, null, 'en_ruta', 'info', 'Cargado y en ruta · ' || v_ref, null, v_enl, new.id);
    elsif new.estado = 'entregado' then
      perform crear_aviso('cliente', new.cliente_id, null, 'entregado', 'ok', 'Entregado · ' || v_ref, null, v_enl, new.id);
    elsif new.estado = 'cancelado' then
      if v_por_cliente then
        perform crear_aviso('dynamo', null, null, 'cancelado', case when o_tr is not null then 'urgente' else 'aviso' end,
          'Cancelado por el cliente · ' || v_ref,
          v_cli || ' lo ha cancelado' || case when o_tr is not null then '. Tenía camión: avisa al transportista.' else '.' end, v_enl, new.id);
      elsif auth.uid() is null and new.estado_pago_previo = 'pendiente' then
        -- Anulado por el sistema: pasó el plazo para pagar.
        perform crear_aviso('cliente', new.cliente_id, null, 'pago_caducado', 'aviso', 'Envío anulado: no recibimos el pago · ' || v_ref,
          'Pasó el plazo para pagar. Si aún lo necesitas, vuelve a pedirlo: el precio se recalcula.', '/panel/nuevo-envio?repetir=' || new.id, new.id);
        perform crear_aviso('dynamo', null, null, 'pago_caducado', 'info', 'Anulado sin pago · ' || v_ref,
          v_cli || ' no pagó a tiempo.', v_enl, new.id);
      elsif o_est <> 'borrador' then
        perform crear_aviso('cliente', new.cliente_id, null, 'cancelado', 'aviso', 'Envío cancelado · ' || v_ref,
          'Si no lo esperabas, llámanos al ' || tel_dynamo() || '.', v_enl, new.id);
      end if;
      if o_tr is not null then
        perform crear_aviso('transportista', null, o_tr, 'cancelada', 'urgente', 'Envío cancelado · ' || v_ref,
          'No vayas a cargar. Si tienes dudas, llámanos al ' || tel_dynamo() || '.', null, new.id);
      end if;
    end if;
  end if;
  return null;
end $function$;

-- La hora de carga y de entrega: la de la etapa.
CREATE OR REPLACE FUNCTION public.fn_envios_atajos_hitos()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  -- Seguimiento automático o etapa marcada a mano: la hora de la etapa (nunca futura).
  v_hora timestamptz := least(coalesce(nullif(current_setting('dynamo.hora_etapa', true), '')::timestamptz, now()), now());
begin
  -- Al migrar el Sheet se conservan las fechas reales que traiga cada fila.
  if coalesce(current_setting('dynamo.migracion', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Nadie puede inventarse las fechas al crear: las pone esta función.
    new.confirmado_en := case when new.estado not in ('borrador', 'cancelado') then now() end;
    new.primera_oferta_en := null;
    new.asignado_en  := case when new.transportista_id is not null then now() end;
    new.cargado_en   := null; new.entregado_en := null; new.cancelado_en := null;
    return new;
  end if;

  -- En UPDATE no se pueden tocar a mano: se recalculan desde el cambio real.
  new.confirmado_en     := old.confirmado_en;
  new.primera_oferta_en := old.primera_oferta_en;
  new.asignado_en       := old.asignado_en;
  new.cargado_en        := old.cargado_en;
  new.entregado_en      := old.entregado_en;
  new.cancelado_en      := old.cancelado_en;

  if old.estado = 'borrador' and new.estado not in ('borrador', 'cancelado') then
    new.confirmado_en := coalesce(new.confirmado_en, now());
  end if;
  if new.transportista_id is distinct from old.transportista_id then
    new.asignado_en := case when new.transportista_id is not null then now() end;
  end if;
  if new.estado is distinct from old.estado then
    if new.estado = 'en_ruta'   then new.cargado_en   := coalesce(new.cargado_en, v_hora); end if;
    if new.estado = 'entregado' then new.entregado_en := v_hora; end if;
    -- Marcado a mano hacia atrás: lo que vuelve a quedar por hacer, sin hora.
    if old.estado = 'entregado' and new.estado <> 'entregado' then new.entregado_en := null; end if;
    if new.estado in ('programado', 'hacia_la_carga') or (new.estado = 'cargando' and coalesce(new.parada_actual, 1) <= 1) then new.cargado_en := null; end if;
    if new.estado = 'cancelado' then new.cancelado_en := now(); end if;
    if old.estado = 'cancelado' then new.cancelado_en := null;  end if;
  end if;
  -- La primera oferta la marca la función de ofertas con este ajuste de sesión.
  if coalesce(current_setting('dynamo.primera_oferta', true), '') = 'on'
     and new.primera_oferta_en is null then
    new.primera_oferta_en := now();
  end if;
  return new;
end $function$;

-- La carga aceptada (bolsa) enseña el día previsto.
CREATE OR REPLACE FUNCTION public.carga_aceptada_publica(p_reserva uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; e record;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found then return jsonb_build_object('resultado', 'reserva_no_existe'); end if;
  if r.estado = 'pendiente_revision' then
    return jsonb_build_object('resultado', 'pendiente_revision', 'precio_propuesto', r.precio_propuesto);
  end if;
  if r.estado = 'viva' and r.hasta > now() then
    return jsonb_build_object('resultado', 'viva', 'hasta', r.hasta, 'ahora', now());
  end if;
  if r.estado <> 'aceptada' then
    return jsonb_build_object('resultado', case when r.estado = 'viva' then 'caducada' else r.estado end);
  end if;
  select * into e from envios where id = r.envio_id;
  if e.transportista_id is distinct from r.transportista_id then
    return jsonb_build_object('resultado', 'reasignada');
  end if;
  -- La llave caduca al terminar el viaje (entregado o cancelado).
  if not enlace_carga_vigente(e.id) then
    return jsonb_build_object('resultado', 'cerrada', 'estado', e.estado, 'referencia', e.referencia_gx);
  end if;
  return jsonb_build_object(
    'resultado', 'aceptada', 'estado', e.estado,
    'referencia', e.referencia_gx, 'referencia_cliente', e.referencia_cliente,
    'transportista', (select nombre_visible from transportistas where id = r.transportista_id),
    'precio', r.precio_aceptado, 'pronto_pago', r.pronto_pago,
    'pronto_pago_pct', parametro('pronto_pago_pct'), 'pronto_pago_minimo', parametro('pronto_pago_minimo'),
    'pronto_pago_dias', parametro('pronto_pago_dias'), 'plazo_pago_dias', parametro('plazo_pago_transportista_dias'),
    'aceptada_en', r.cerrada_en,
    'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
    'fecha_carga_prevista', e.fecha_carga_prevista,
    'fecha_entrega_estimada', e.fecha_entrega_estimada,
    'descripcion_mercancia', e.descripcion_mercancia, 'metros_lineales', e.metros_lineales,
    'toneladas', e.toneladas, 'tipo_carga', e.tipo_carga, 'paletizado', e.paletizado,
    'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera, 'carga_techo', e.carga_techo,
    'requiere_plataforma_elevadora', e.requiere_plataforma_elevadora, 'requiere_nima', e.requiere_nima, 'adr', e.adr,
    'discrecion_comercial', e.discrecion_comercial,
    'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
    'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono,
    'paradas', (select coalesce(jsonb_agg(jsonb_build_object(
        'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion,
        'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia,
        'pais_codigo_iso', p.pais_codigo_iso, 'referencia', p.referencia, 'anotaciones', p.anotaciones,
        'tipo_sitio', l.tipo, 'horarios', l.horarios, 'notas_sitio', l.anotaciones,
        'requiere_cita', coalesce(l.requiere_cita, false), 'tiene_medios_carga', coalesce(l.tiene_medios_carga, true),
        'url_google_maps', l.url_google_maps,
        'contacto', (select jsonb_build_object('nombre', c.nombre, 'telefono', c.telefono)
                       from contactos c where c.sitio_id = p.sitio_id and c.es_principal limit 1))
        order by p.orden), '[]'::jsonb)
      from envio_paradas p left join sitios l on l.id = p.sitio_id where p.envio_id = e.id)
  );
end $function$;

-- Sin transportista tampoco queda su día previsto ni la etapa marcada.
CREATE OR REPLACE FUNCTION public.fn_envios_ac_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t record;
begin
  if new.transportista_id is not null and new.transportista_id is distinct from old.transportista_id then
    select estado_operativo, nima into t from transportistas where id = new.transportista_id;
    if t.estado_operativo = 'suspendido' and not es_consola_supabase() then
      raise exception 'Ese transportista está suspendido: no se le pueden dar envíos.';
    end if;
    new.estado_asignacion := 'confirmada';
    -- El NIMA es el del transportista nuevo (salvo que quien asigna ponga otro).
    if new.transportista_nima is not distinct from old.transportista_nima then new.transportista_nima := t.nima; end if;
  elsif new.transportista_id is null and old.transportista_id is not null then
    -- Sin transportista no quedan su camión, su conductor ni su precio.
    new.matricula_camion := null; new.matricula_remolque := null; new.conductor_nombre := null; new.conductor_telefono := null;
    new.vehiculo_camion_id := null; new.vehiculo_remolque_id := null; new.conductor_id := null;
    new.transportista_nima := null; new.importe_transportista := null;
    new.fecha_carga_prevista := null; new.ancla_paso := null; new.ancla_hora := null;
    if new.estado_asignacion = 'confirmada' then
      new.estado_asignacion := case when exists (select 1 from envio_ofertas o where o.envio_id = new.id and o.estado = 'activa' and o.caduca_en > now())
                                    then 'ofertada' else 'sin_asignar' end;
    end if;
  end if;
  return new;
end $function$;

-- El transportista de la bolsa dice qué día carga (envío con ventana).
drop function if exists completar_carga_publica(uuid, text, text, text, text);
CREATE OR REPLACE FUNCTION public.completar_carga_publica(p_reserva uuid, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_telefono text, p_fecha_carga_prevista date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; e record; v_tel text; v_cam text; v_rem text; v_nom text; k record;
begin
  select * into r from envio_reservas where id = p_reserva and estado = 'aceptada';
  if not found then return jsonb_build_object('resultado', 'no_aceptada'); end if;
  select * into e from envios where id = r.envio_id and transportista_id = r.transportista_id and estado in ('programado', 'hacia_la_carga');
  if not found then return jsonb_build_object('resultado', 'ya_no_se_puede'); end if;
  if not enlace_carga_vigente(r.envio_id) then return jsonb_build_object('resultado', 'ya_no_se_puede'); end if;

  -- Envío con ventana: el transportista dice qué día carga (obligatorio, dentro de la ventana).
  if p_fecha_carga_prevista is not null and (e.fecha_carga_desde is null
       or p_fecha_carga_prevista < e.fecha_carga_desde or p_fecha_carga_prevista > coalesce(e.fecha_carga_hasta, e.fecha_carga_desde)) then
    return jsonb_build_object('resultado', 'fecha_fuera_de_ventana');
  end if;
  if coalesce(p_fecha_carga_prevista, e.fecha_carga_prevista) is null
     and e.fecha_carga_desde is distinct from coalesce(e.fecha_carga_hasta, e.fecha_carga_desde) then
    return jsonb_build_object('resultado', 'falta_fecha_prevista');
  end if;

  v_cam := nullif(upper(regexp_replace(coalesce(p_matricula_camion, ''), '[\s-]', '', 'g')), '');
  v_rem := nullif(upper(regexp_replace(coalesce(p_matricula_remolque, ''), '[\s-]', '', 'g')), '');
  v_nom := nullif(trim(p_conductor_nombre), '');
  v_tel := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
  if length(replace(coalesce(v_tel, ''), '+', '')) < 6 then v_tel := null; end if;

  if v_nom is null and v_cam is not null
     and normalizar_matricula(v_cam) is distinct from normalizar_matricula(e.matricula_camion) then
    -- Camión nuevo sin chófer escrito: el de ese camión de otras veces, o vacío.
    select * into k from conductor_de_camion(r.transportista_id, v_cam);
    v_nom := k.nombre;                        -- null si ese camión no tiene historial
    v_tel := coalesce(v_tel, k.telefono);
  elsif v_nom is not null and lower(unaccent_simple(v_nom)) is distinct from lower(unaccent_simple(trim(coalesce(e.conductor_nombre, '')))) then
    -- Chófer nuevo: su teléfono, el que tenga en la flota, o vacío (nunca el del anterior).
    if v_tel is null then select telefono into v_tel from conductor_conocido(r.transportista_id, v_nom); end if;
  else
    -- Mismo chófer (o no escribe): lo que llega vacío no borra.
    v_nom := coalesce(v_nom, e.conductor_nombre);
    v_tel := coalesce(v_tel, e.conductor_telefono);
  end if;

  update envios set
    matricula_camion   = coalesce(v_cam, matricula_camion),
    matricula_remolque = coalesce(v_rem, matricula_remolque),
    conductor_nombre   = v_nom,
    conductor_telefono = v_tel,
    fecha_carga_prevista = coalesce(p_fecha_carga_prevista, fecha_carga_prevista)
   where id = r.envio_id;
  return jsonb_build_object('resultado', 'guardado', 'conductor', v_nom, 'telefono', v_tel,
    'fecha_carga_prevista', coalesce(p_fecha_carga_prevista, e.fecha_carga_prevista));
end $function$;
revoke execute on function completar_carga_publica(uuid, text, text, text, text, date) from public;
grant execute on function completar_carga_publica(uuid, text, text, text, text, date) to anon, authenticated, service_role;
comment on function public.completar_carga_publica(uuid, text, text, text, text, date) is '[Ofertas y transportistas] Enlace público de una carga ya aceptada: el transportista completa o corrige matrícula del camión y del remolque, nombre y teléfono del conductor y, si el envío tiene ventana, el día en que carga (obligatorio). Solo mientras el envío siga suyo y esté programado o hacia la carga. Lo que llega vacío no borra. Devuelve {resultado: guardado | no_aceptada | ya_no_se_puede | falta_fecha_prevista | fecha_fuera_de_ventana, conductor, telefono, fecha_carga_prevista}. Quién: público con reserva aceptada. Argumentos: p_reserva: envio_reservas.id (aceptada) · p_matricula_camion, p_matricula_remolque: matrículas (se quitan espacios y guiones) · p_conductor_nombre: nombre · p_telefono: mín. 6 cifras · p_fecha_carga_prevista: día de carga dentro de la ventana.';

-- El transportista avisa de cómo va su viaje: pasa a la etapa siguiente (o a la que diga,
-- siempre hacia delante) a esta hora, y el automático sigue desde ahí.
create or replace function marcar_mi_viaje(p_envio uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
declare e record; v_n int; v_actual int; v_paso int; c record;
begin
  if not envio_del_transportista(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  if p_estado not in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado') then raise exception 'Estado no válido.'; end if;
  select estado, parada_actual, fecha_carga_desde, fecha_carga_prevista into e from envios where id = p_envio for update;
  if e.estado not in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta') then
    raise exception 'El envío está % y no puede volver atrás. Si te has equivocado, llámanos al %.', replace(e.estado::text, '_', ' '), tel_dynamo();
  end if;
  -- No se puede dar por cargado ni entregado antes del día de carga.
  if p_estado in ('en_ruta', 'entregado') and coalesce(e.fecha_carga_prevista, e.fecha_carga_desde) > (now() at time zone 'Europe/Madrid')::date then
    raise exception 'Todavía no es el día de carga: no se puede marcar en ruta ni entregado.';
  end if;
  select count(*) into v_n from envio_paradas where envio_id = p_envio;
  if v_n = 0 then
    update envios set estado = p_estado::estado_envio,
                      fecha_carga_real = case when p_estado in ('en_ruta', 'entregado') then coalesce(fecha_carga_real, (now() at time zone 'Europe/Madrid')::date) else fecha_carga_real end
     where id = p_envio;
    return;
  end if;
  v_actual := seguimiento_paso(e.estado, e.parada_actual, v_n);
  -- La primera etapa después de la actual con ese estado.
  select min(s.paso) into v_paso from seguimiento_calcular(p_envio) s where s.paso > v_actual and s.estado::text = p_estado;
  if v_paso is null then
    raise exception 'El envío está % y no puede volver atrás. Si te has equivocado, llámanos al %.', replace(e.estado::text, '_', ' '), tel_dynamo();
  end if;
  update envios set ancla_paso = v_paso, ancla_hora = now() where id = p_envio;
  perform seguimiento_aplicar(p_envio, true);
end $$;
revoke execute on function marcar_mi_viaje(uuid, text) from public, anon;
grant execute on function marcar_mi_viaje(uuid, text) to authenticated, service_role;
comment on function public.marcar_mi_viaje(uuid, text) is '[Envíos] El transportista avisa de cómo va su viaje: pasa a la siguiente etapa con ese estado (yendo a la carga, cargando/descargando en la siguiente parada, en ruta a la siguiente, entregado) a esta hora, y el seguimiento automático sigue desde ahí. No puede volver atrás. Al pasar a en ruta o entregado pone la fecha real de carga. Quién: transportista del envío. Argumentos: p_envio: envios.id · p_estado: hacia_la_carga, cargando, en_ruta o entregado.';
