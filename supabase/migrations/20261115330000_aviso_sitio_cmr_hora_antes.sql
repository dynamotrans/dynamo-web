-- EL CMR / DeCA DIGITAL A CADA SITIO, EL DÍA DE SU PARADA (usuario, 2026-11-15): «¿en qué
-- momento se manda el mail con DeCA / CMR digital? A cada sitio una hora y fecha
-- diferente … mismo día que parada en el sitio a las 7:00 y 1 hora antes de la hora
-- prevista de carga de ese día en ese sitio. Si la previsión es martes 11:30 → martes
-- 7:00 y martes 10:30».
--   · El aviso del MISMO DÍA (d0) pasa a las 7:00 (parámetro aviso_parada_hora_mismo_dia,
--     antes 8) y lleva el ENLACE de la hoja de firmas del CMR / DeCA (la misma que la del
--     transportista: cada uno firma su casilla con el dedo).
--   · Aviso nuevo «h1»: aviso_parada_minutos_antes (60) antes de la HORA PREVISTA de esa
--     parada (la del seguimiento: seguimiento_calcular), también con el enlace. Solo si esa
--     hora cae después del aviso de las 7:00 (si la parada es a las 7:30, el de las 7:00 ya
--     va con 30 min) y mientras la casilla del sitio no esté firmada; hasta 30 min después
--     de la hora prevista, por si la pasada de 10 min llega justa.
--   · Los de 2 días antes y la víspera siguen igual (sin enlace: aún no hay nada que firmar).
-- Cada sitio, por su hora: una recogida a las 11:30 y una entrega a las 17:00 del mismo
-- envío reciben cada una su aviso de 1 hora antes.

update parametros set valor = '7' where clave = 'aviso_parada_hora_mismo_dia' and valor = '8';
insert into parametros (clave, valor, descripcion) values
  ('aviso_parada_minutos_antes', '60',
   'Minutos antes de la hora PREVISTA de cada parada en los que se manda al sitio el aviso con el enlace del CMR / DeCA digital para firmar (además del de primera hora del mismo dia).')
on conflict (clave) do nothing;

-- ---- El bloque del enlace de firma (va en el d0 y en el h1) ---------------------------
create or replace function texto_enlace_cmr_sitio(p_recogida boolean, p_url text, p_hora timestamptz)
returns text language sql stable set search_path = public as $$
  select format('<div style="margin:14px 0;padding:12px 14px;border:1.5px solid #ddd6fe;background:#f4f2fb;border-radius:12px">'
    || '%s<p style="margin:0 0 8px"><strong>CMR / DeCA digital:</strong> al %s, firmad vuestra casilla con el dedo desde el móvil, sin apps ni cuenta. '
    || 'Si estáis en el ordenador, la página os enseña un QR para abrirla en el móvil.</p>'
    || '<p style="margin:0"><a href="%s" style="display:inline-block;background:#3300cc;color:#fff;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:10px">Abrir la hoja de firmas</a></p></div>',
    case when p_hora is not null
         then format('<p style="margin:0 0 6px">Llegada prevista del camión: <strong>hacia las %s</strong> (hora local).</p>',
                     to_char(p_hora at time zone 'Europe/Madrid', 'HH24:MI'))
         else '' end,
    case when p_recogida then 'cargar' else 'descargar' end,
    escapar_html(p_url))
$$;
comment on function public.texto_enlace_cmr_sitio(boolean, text, timestamptz) is '[Gestión interna] El recuadro HTML con el enlace a la hoja de firmas del CMR / DeCA digital que llevan los avisos del mismo día y de 1 hora antes a un sitio (y, si se sabe, la hora prevista de llegada del camión). Quién: encolar_avisos_paradas. Argumentos: p_recogida: true si es recogida · p_url: enlace de la hoja de firmas · p_hora: hora prevista en esa parada (vacía = no se pinta).';

-- ---- El encolador: d2 y d1 como siempre; d0 a las 7:00 con enlace; h1 nuevo ------------
drop function if exists public.encolar_avisos_paradas(date);
create or replace function public.encolar_avisos_paradas(p_hoy date default null, p_ahora timestamptz default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0; v_cnt int; r record; v_tramo text; v_rec boolean; v_hora timestamptz; v_tok uuid; v_url text; v_extra text;
  v_ahora timestamptz := coalesce(p_ahora, now());
  hoy date := coalesce(p_hoy, (v_ahora at time zone 'Europe/Madrid')::date);
  ahora time := (v_ahora at time zone 'Europe/Madrid')::time;
  h_ini int := greatest(0, least(23, parametro_num('aviso_parada_ventana_inicio', 10)::int));
  h_fin int := greatest(0, least(24, parametro_num('aviso_parada_ventana_fin', 16)::int));
  h_dia int := greatest(0, least(23, parametro_num('aviso_parada_hora_mismo_dia', 7)::int));
  m_antes int := greatest(10, least(600, parametro_num('aviso_parada_minutos_antes', 60)::int));
  base_url text := coalesce(parametro('url_plataforma') #>> '{}', '');
  -- El de 1 hora antes depende del reloj de verdad: en las pruebas con un día fijado, solo
  -- si también se fija la hora (así no baila según cuándo se ejecuten).
  con_h1 boolean := p_hoy is null or p_ahora is not null;
  en_ventana boolean;
begin
  en_ventana := ahora >= make_time(h_ini, 0, 0) and (h_fin >= 24 or ahora < make_time(h_fin, 0, 0));
  for r in
    select e.id as envio, e.referencia_gx, e.matricula_camion, e.matricula_remolque, e.conductor_nombre,
           c.razon_social as cliente,
           p.id as parada, p.tipo as tipo_parada, p.nombre_empresa, p.direccion, p.codigo_postal, p.poblacion,
           p.pais_codigo_iso as pais_sitio,
           s.emails_avisos,
           case when p.tipo = 'carga' then coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde)
                else e.fecha_entrega_estimada end as fecha_obj
      from envios e
      join clientes c on c.id = e.cliente_id
      join envio_paradas p on p.envio_id = e.id
      join sitios s on s.id = p.sitio_id
     where e.transportista_id is not null
       and not coalesce(e.es_manual, false)
       and e.estado not in ('borrador', 'cancelado', 'entregado')
       and cardinality(s.emails_avisos) > 0
       and (case when p.tipo = 'carga' then coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde)
                 else e.fecha_entrega_estimada end) between hoy and hoy + 10
  loop
    v_rec := r.tipo_parada = 'carga';
    v_tramo := tramo_aviso_parada(hoy, r.fecha_obj, r.pais_sitio, r.codigo_postal, r.poblacion);
    v_hora := null; v_extra := '';

    if v_tramo = 'd0' then
      -- Hora prevista en ESTA parada (la del seguimiento) y el enlace de la hoja de firmas.
      select c.hora into v_hora from seguimiento_calcular(r.envio) c
       where c.parada_id = r.parada and c.estado in ('cargando', 'entregado') limit 1;
      select token into v_tok from cmr_enlaces where envio_id = r.envio and not revocado and caduca_en > now() limit 1;
      if v_tok is null then insert into cmr_enlaces (envio_id) values (r.envio) returning token into v_tok; end if;
      v_url := base_url || '/cmr/' || v_tok;

      -- h1: X minutos antes de la hora prevista, si cae después del aviso de primera hora,
      -- la casilla del sitio sigue sin firmar y no ha pasado más de media hora.
      if con_h1 and v_hora is not null
         and v_ahora >= v_hora - make_interval(mins => m_antes) and v_ahora <= v_hora + interval '30 minutes'
         and (v_hora - make_interval(mins => m_antes)) > ((hoy + make_time(h_dia, 0, 0)) at time zone 'Europe/Madrid')
         and not exists (select 1 from firmas_cmr f where f.envio_id = r.envio and f.parada_id = r.parada and not f.extra
                            and f.rol = case when v_rec then 'remitente' else 'destinatario' end) then
        insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
        values ('aviso_parada:' || r.envio || ':' || r.parada || ':h1:' || r.fecha_obj,
                'aviso_parada', r.envio, array_to_string(r.emails_avisos, ','),
                format('Llegamos hacia las %s · %s de parte de %s · CMR / DeCA para firmar · Dynamo',
                       to_char(v_hora at time zone 'Europe/Madrid', 'HH24:MI'),
                       case when v_rec then 'recogida' else 'entrega' end, r.cliente),
                texto_aviso_parada(v_rec, r.cliente, r.nombre_empresa, r.direccion, r.codigo_postal,
                                   r.poblacion, r.fecha_obj, r.matricula_camion, r.matricula_remolque, r.conductor_nombre)
                || texto_enlace_cmr_sitio(v_rec, v_url, v_hora))
        on conflict (clave) do nothing;
        get diagnostics v_cnt = row_count; n := n + v_cnt;
        -- Si el de primera hora aún no había salido (p. ej. transportista asignado a media
        -- mañana), ya no se manda: dos emails seguidos al mismo sitio sobran.
        if v_cnt > 0 then
          insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html, estado, error)
          values ('aviso_parada:' || r.envio || ':' || r.parada || ':d0:' || r.fecha_obj, 'aviso_parada', r.envio,
                  array_to_string(r.emails_avisos, ','), '—', '—', 'omitido', 'Cubierto por el aviso de antes de la hora prevista')
          on conflict (clave) do nothing;
        end if;
      end if;
      continue when ahora < make_time(h_dia, 0, 0);
      v_extra := texto_enlace_cmr_sitio(v_rec, v_url, v_hora);
    elsif v_tramo in ('d1', 'd2') then
      continue when not en_ventana;
    else
      continue;
    end if;

    insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
    values ('aviso_parada:' || r.envio || ':' || r.parada || ':' || v_tramo || ':' || r.fecha_obj,
            'aviso_parada', r.envio, array_to_string(r.emails_avisos, ','),
            case when v_tramo = 'd0'
                 then format('Hoy: %s de parte de %s · CMR / DeCA para firmar · Dynamo',
                             case when v_rec then 'recogida' else 'entrega' end, r.cliente)
                 else format('%s prevista el %s · de parte de %s · Dynamo',
                             case when v_rec then 'Recogida' else 'Entrega' end, to_char(r.fecha_obj, 'DD/MM/YYYY'), r.cliente) end,
            texto_aviso_parada(v_rec, r.cliente, r.nombre_empresa, r.direccion, r.codigo_postal,
                               r.poblacion, r.fecha_obj, r.matricula_camion, r.matricula_remolque,
                               r.conductor_nombre) || v_extra)
    on conflict (clave) do nothing;
    get diagnostics v_cnt = row_count; n := n + v_cnt;
  end loop;
  return n;
end $$;
revoke execute on function public.encolar_avisos_paradas(date, timestamptz) from public, anon, authenticated;
comment on function public.encolar_avisos_paradas(date, timestamptz) is '[Gestión interna] Encola los avisos de recogida y entrega a los sitios de la ruta (a sus emails de aviso), cada uno UNA sola vez por tramo y fecha, contando en DÍAS HÁBILES del sitio (fines de semana y festivos nacionales de su país, autonómicos de su comunidad por el CP y locales de su población): 2 días hábiles antes y la víspera hábil dentro de la ventana diaria (aviso_parada_ventana_inicio/fin, Madrid); el MISMO DÍA desde aviso_parada_hora_mismo_dia (7:00) con el enlace de la hoja de firmas del CMR / DeCA digital; y otro aviso_parada_minutos_antes (60) antes de la hora PREVISTA de esa parada (seguimiento_calcular), también con el enlace, si esa hora cae después del de primera hora y la casilla del sitio no está firmada (si sale antes que el de primera hora, este ya no se manda). Solo envíos de Dynamo con transportista asignado. SIEMPRE «de parte de <cliente>». Devuelve cuántos encoló. Quién: la tarea programada; nadie por la API. Argumentos: p_hoy: solo para las pruebas, fija el día (vacío = hoy en Madrid) · p_ahora: solo para las pruebas, fija el momento (vacío = ahora); con p_hoy y sin p_ahora no se evalúa el aviso de antes de la hora.';
