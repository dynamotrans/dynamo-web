-- TRES AVISOS DE MATRÍCULAS AL TRANSPORTISTA (usuario, 2026-11-15: «ok, móntalo así»).
-- Antes: un solo email, 2 h antes de la carga, y si se ignoraba no había más. Ahora, con
-- transportista asignado y sin las matrículas que pide el documento de control (camión y,
-- en un tráiler, semirremolque), hasta TRES, cada uno una sola vez y solo mientras falten:
--   1. VÍSPERA HÁBIL, desde aviso_matriculas_hora_vispera (16:00 Madrid): «el dd/mm cargas…».
--   2. ANTES: aviso_matriculas_minutos_antes (120) antes de la hora de carga.
--   3. A LA HORA de carga (y hasta 4 h después): «URGENTE».
-- La hora de carga es la CITA de la 1.ª recogida; sin cita, la hora PREVISTA del
-- seguimiento (la misma de los avisos a los sitios); y si no hay, las 8:00.
-- Si el n.º 2 salió a menos de 45 min de la hora (transportista asignado a última hora),
-- el n.º 3 ya no se manda: dos seguidos sobran. Todos llevan el enlace de la hoja de firmas.

insert into parametros (clave, valor, descripcion) values
  ('aviso_matriculas_hora_vispera', '16',
   'Hora (Madrid) a partir de la cual, la vispera habil de la carga, se pide al transportista las matriculas que falten (primer aviso).'),
  ('aviso_matriculas_minutos_antes', '120',
   'Minutos antes de la hora de carga en los que se vuelve a pedir al transportista las matriculas que falten (segundo aviso; el tercero sale a la hora de carga).')
on conflict (clave) do nothing;

drop function if exists public.encolar_avisos_operativos();
create or replace function public.encolar_avisos_operativos(p_ahora timestamptz default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0; v_cnt int; r record; v_tok uuid; v_para text; v_hora timestamptz; v_tramo text; v_clave text; v_falta text;
  v_ahora timestamptz := coalesce(p_ahora, now());
  hoy date := (coalesce(p_ahora, now()) at time zone 'Europe/Madrid')::date;
  ahora time := (coalesce(p_ahora, now()) at time zone 'Europe/Madrid')::time;
  h_vis int := greatest(0, least(23, parametro_num('aviso_matriculas_hora_vispera', 16)::int));
  m_antes int := greatest(15, least(720, parametro_num('aviso_matriculas_minutos_antes', 120)::int));
  base_url text := coalesce(parametro('url_plataforma') #>> '{}', '');
  -- Los datos de Dynamo salen de Parámetros (una sola fuente), nunca escritos a mano.
  d_firma text := coalesce(parametro('dynamo_razon_social') #>> '{}', '');
  d_email text := coalesce(parametro('dynamo_email') #>> '{}', '');
  d_tel   text := coalesce(parametro('dynamo_telefono') #>> '{}', '');
begin
  -- (a) MATRÍCULAS: envío de Dynamo con transportista y sin las matrículas completas.
  for r in
    select e.id, e.referencia_gx, e.transportista_id, e.matricula_camion,
           coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde) as fecha,
           p1.id as parada1, p1.fecha_desde as cita, p1.poblacion as origen
      from envios e
      left join lateral (select p.id, p.fecha_desde, p.poblacion from envio_paradas p
                          where p.envio_id = e.id and p.tipo = 'carga' order by p.orden limit 1) p1 on true
     where e.estado in ('programado', 'hacia_la_carga') and not coalesce(e.es_manual, false)
       and e.transportista_id is not null
       and (e.matricula_camion is null or (envio_necesita_remolque(e.id) and e.matricula_remolque is null))
       and coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde) between hoy - 1 and hoy + 6
  loop
    v_hora := coalesce(r.cita,
                       (select c.hora from seguimiento_calcular(r.id) c where c.parada_id = r.parada1 and c.estado = 'cargando' limit 1),
                       ((r.fecha::text || ' 08:00')::timestamp at time zone 'Europe/Madrid'));
    v_tramo := case
      when v_ahora >= v_hora and v_ahora <= v_hora + interval '4 hours' then 'hora'
      when v_ahora >= v_hora - make_interval(mins => m_antes) and v_ahora < v_hora then 'antes'
      when r.fecha > hoy and ahora >= make_time(h_vis, 0, 0) and tramo_aviso_parada(hoy, r.fecha, 'ES') = 'd1' then 'vispera'
    end;
    continue when v_tramo is null;
    -- El «antes» conserva la clave de siempre (un envío ya avisado no se repite).
    v_clave := case v_tramo when 'antes' then 'matriculas:' || r.id
                            else 'matriculas:' || v_tramo || ':' || r.id || ':' || r.fecha end;
    continue when exists (select 1 from emails_enviados x where x.clave = v_clave);
    -- Asignado a última hora: si el «antes» salió a menos de 45 min de la hora, el urgente sobra.
    continue when v_tramo = 'hora' and exists (select 1 from emails_enviados x
                    where x.clave = 'matriculas:' || r.id and x.creado_en > v_hora - interval '45 minutes');
    select c.email into v_para from contactos c
     where c.transportista_id = r.transportista_id and c.email is not null
     order by c.es_principal desc, c.creado_en limit 1;
    -- El enlace del CMR del envío (se crea si no hay uno vivo): ahí se anotan las
    -- matrículas al firmar la cabecera.
    select token into v_tok from cmr_enlaces where envio_id = r.id and not revocado and caduca_en > now() limit 1;
    if v_tok is null then insert into cmr_enlaces (envio_id) values (r.id) returning token into v_tok; end if;
    v_falta := case when r.matricula_camion is null then 'las <strong>matrículas del camión</strong> (tractora y, si es un tráiler, semirremolque)'
                    else 'la <strong>matrícula del semirremolque</strong> (un tráiler lleva las dos en el documento de control)' end;
    insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html, estado, error)
    values (v_clave, 'matriculas', r.id, coalesce(v_para, '—'),
      case v_tramo
        when 'vispera' then format('Carga el %s · envío #%s · necesitamos las matrículas', to_char(r.fecha, 'DD/MM'), r.referencia_gx)
        when 'antes'   then format('Faltan las matrículas · envío #%s · carga a las %s', r.referencia_gx, to_char(v_hora at time zone 'Europe/Madrid', 'HH24:MI'))
        else                format('URGENTE · faltan las matrículas · envío #%s · carga a las %s', r.referencia_gx, to_char(v_hora at time zone 'Europe/Madrid', 'HH24:MI'))
      end,
      format('<p>Hola,</p><p>El envío <strong>#%s</strong> carga %s%s y todavía no tenemos %s.</p>'
             || '<p><a href="%s/cmr/%s">Anótalas aquí</a> (se piden al firmar la cabecera del CMR / DeCA), o respóndenos a este email. Urgencias 24 h: %s.</p>'
             || '<p>— %s · %s</p>',
             escapar_html(r.referencia_gx),
             case v_tramo when 'vispera' then format('el <strong>%s</strong> hacia las <strong>%s</strong>', to_char(r.fecha, 'DD/MM/YYYY'), to_char(v_hora at time zone 'Europe/Madrid', 'HH24:MI'))
                          when 'antes'   then format('a las <strong>%s</strong>', to_char(v_hora at time zone 'Europe/Madrid', 'HH24:MI'))
                          else                format('<strong>ya, a las %s</strong>', to_char(v_hora at time zone 'Europe/Madrid', 'HH24:MI')) end,
             case when r.origen is not null then ' en ' || escapar_html(r.origen) else '' end,
             v_falta, base_url, v_tok,
             escapar_html(d_tel), escapar_html(d_firma), escapar_html(d_email)),
      case when v_para is null then 'error' else 'pendiente' end,
      case when v_para is null then 'El transportista no tiene ningún contacto con email: avisar a mano.' end)
    on conflict (clave) do nothing;
    get diagnostics v_cnt = row_count; n := n + v_cnt;
  end loop;

  -- (b) VÍSPERA: a partir de las 17:00 (Madrid), recordatorio al creador del envío (y
  -- sus emails de copia) de que MAÑANA se carga. Solo envíos de Dynamo programados.
  if ahora >= time '17:00' then
    for r in
      select e.id, e.referencia_gx, u.email, u.emails_copia_avisos,
             coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde) as fecha,
             (select p.poblacion from envio_paradas p where p.envio_id = e.id and p.tipo = 'carga' order by p.orden limit 1) as origen,
             (select p.poblacion from envio_paradas p where p.envio_id = e.id and p.tipo = 'descarga' order by p.orden desc limit 1) as destino
        from envios e join usuarios u on u.id = e.creado_por
       where e.estado = 'programado' and not coalesce(e.es_manual, false)
         and coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde) = hoy + 1
    loop
      v_para := array_to_string(r.email || coalesce(r.emails_copia_avisos, '{}'), ',');
      insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
      values ('vispera:' || r.id || ':' || r.fecha, 'vispera', r.id, v_para,
        format('Mañana cargamos tu envío #%s (%s → %s)', r.referencia_gx, coalesce(r.origen, '—'), coalesce(r.destino, '—')),
        format('<p>Hola,</p><p>Recordatorio: <strong>mañana, %s</strong>, cargamos tu envío <strong>#%s</strong> (%s → %s).</p>'
               || '<p>Ten la mercancía lista en el punto de carga. Lo sigues en vivo en <a href="%s/panel/envios">tu panel</a>.</p>'
               || '<p>— %s · %s · %s</p>',
               to_char(r.fecha, 'DD/MM/YYYY'), escapar_html(r.referencia_gx), escapar_html(coalesce(r.origen, '—')),
               escapar_html(coalesce(r.destino, '—')), base_url, escapar_html(d_firma), escapar_html(d_email), escapar_html(d_tel)))
      on conflict (clave) do nothing;
      get diagnostics v_cnt = row_count; n := n + v_cnt;
    end loop;
  end if;
  return n;
end $$;
revoke execute on function public.encolar_avisos_operativos(timestamptz) from public, anon, authenticated;
comment on function public.encolar_avisos_operativos(timestamptz) is '[Gestión interna] Encola los emails operativos de reloj, cada uno UNA sola vez (clave única): (a) hasta tres peticiones de matrículas al transportista mientras falten (camión y, en un tráiler, semirremolque) — la víspera hábil desde aviso_matriculas_hora_vispera, aviso_matriculas_minutos_antes antes de la hora de carga y otra, urgente, a la hora de carga (hasta 4 h después; no sale si la anterior se mandó a menos de 45 min de la hora) —, con el enlace del CMR; la hora de carga es la cita de la 1.ª recogida, o la prevista del seguimiento, o las 8:00; y (b) el recordatorio de víspera al creador del envío (y sus emails de copia) a partir de las 17:00. Devuelve cuántos encoló. Quién: la tarea programada; nadie por la API. Argumentos: p_ahora: solo para las pruebas, fija el momento (vacío = ahora).';
