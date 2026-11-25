-- =====================================================================================
-- PREVISIÓN DE ENTREGA: EL GRUPAJE LLEGA 3 HORAS MÁS TARDE (usuario, 2026-11-25)
-- =====================================================================================
-- «Para el cálculo de previsión de entrega: cuando es carga completa la dejamos como está, pero
-- cuando lleva un reparto o grupajes… eso va como a repartos de entrega. Entonces se demora como
-- 2-3 horas sobre la previsión de un tráiler completo… siempre más 3 horas en grupajes.»
--
-- El cálculo de las horas previstas de un envío (seguimiento_calcular: de ahí salen la ficha, la
-- lista, el mapa, los avisos y la página de pago) suma ahora unas horas a la llegada a la
-- PRIMERA entrega cuando el envío es grupaje. Una vez por envío; las entregas siguientes ya la
-- arrastran. Cuántas horas: parámetro nuevo, 3 por defecto. La carga completa no cambia.
-- Si después de sumarlas el sitio ya está cerrado, pasa a su siguiente apertura, como siempre.

insert into public.parametros (clave, valor, descripcion) values
  ('seguimiento_horas_extra_grupaje', '3',
   'Seguimiento: horas que se suman a la llegada prevista a la primera entrega cuando el envío es un grupaje (va en un reparto con otras entregas y llega más tarde que un camión completo). 0 = sin demora. La carga completa no cambia.')
on conflict (clave) do nothing;

create or replace function public.seguimiento_calcular(p_envio uuid, p_dia date default null::date)
returns table(paso smallint, estado estado_envio, parada smallint, parada_id uuid, tipo_parada text, poblacion text, hora timestamp with time zone, km numeric, km_estimado boolean)
language plpgsql stable security definer set search_path to 'public'
as $function$
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
  -- Grupaje: la entrega va en un reparto con otras y llega más tarde que un camión completo.
  v_extra interval := greatest(parametro_num('seguimiento_horas_extra_grupaje', 3), 0) * interval '1 hour';
  v_extra_hecho boolean := false;
begin
  select x.fecha_carga_real, x.fecha_carga_prevista, x.fecha_carga_desde, x.ancla_paso, x.ancla_hora, x.tipo_carga
    into e from envios x where x.id = p_envio;
  if not found then return; end if;
  v_dia := coalesce(p_dia, e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde);
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
  -- Sábado, domingo o festivo nacional: el camión no circula; carga el siguiente día hábil.
  while not es_dia_habil(v_dia) loop v_dia := v_dia + 1; end loop;

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
      -- GRUPAJE (usuario, 2026-11-25): «va como a repartos de entrega… siempre más 3 horas en
      -- grupajes». Una vez por envío, al llegar a su PRIMERA entrega; la carga completa, como estaba.
      if e.tipo_carga = 'grupaje' and not v_extra_hecho and tipos[k / 2] = 'descarga' then
        t := t + v_extra; v_extra_hecho := true;
      end if;
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
end $function$;
