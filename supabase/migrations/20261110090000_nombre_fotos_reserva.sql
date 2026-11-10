-- =====================================================================================
-- NOMBRE CLARO PARA LAS FOTOS DE LAS RESERVAS DEL CMR (usuario, 2026-11-10)
-- =====================================================================================
-- Las fotos que llegan con una reserva se guardaban con el nombre técnico del fichero
-- subido («foto-<uuid>.jpg»), que en la sección Documentos de la ficha no dice nada.
-- Ahora el nombre cuenta de dónde vienen: «Reserva - <cargador|conductor|destinatario> ·
-- <fecha y hora de Madrid>», con «(2)», «(3)»… si llegan varias en la misma reserva, y
-- la extensión original. Solo cambia el nombre_archivo: validaciones, límites y
-- permisos quedan exactamente como en 20261109100000.
-- =====================================================================================

create or replace function public.anotar_reservas_cmr_publico(p_token uuid, p_parada uuid, p_rol text, p_texto text, p_fotos text[] default null)
 returns jsonb
 language plpgsql volatile security definer set search_path to 'public'
as $function$
declare v_envio uuid; v_texto text := trim(coalesce(p_texto, '')); v_inc uuid; v_quien text; v_tipo text;
begin
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  if p_rol not in ('remitente', 'transportista', 'destinatario') then return jsonb_build_object('resultado', 'rol_no_valido'); end if;
  if (select estado from envios where id = v_envio) = 'cancelado' then return jsonb_build_object('resultado', 'cancelado'); end if;
  -- La misma casilla que al firmar: remitente en una recogida, destinatario en una entrega,
  -- transportista sin parada. Y nunca en una casilla ya firmada.
  if p_rol = 'transportista' then
    if p_parada is not null then return jsonb_build_object('resultado', 'parada_no_valida'); end if;
  else
    select tipo into v_tipo from envio_paradas where id = p_parada and envio_id = v_envio;
    if v_tipo is null or (p_rol = 'remitente' and v_tipo <> 'carga') or (p_rol = 'destinatario' and v_tipo <> 'descarga') then
      return jsonb_build_object('resultado', 'parada_no_valida');
    end if;
  end if;
  if exists (select 1 from firmas_cmr where envio_id = v_envio and rol = p_rol and parada_id is not distinct from p_parada) then
    return jsonb_build_object('resultado', 'ya_firmada');
  end if;
  if (select count(*) from cmr_reservas where envio_id = v_envio) >= 10 then
    return jsonb_build_object('resultado', 'demasiadas');
  end if;
  if length(v_texto) < 3 or length(v_texto) > 1000 then return jsonb_build_object('resultado', 'texto_no_valido'); end if;
  if (select count(*) from cmr_reservas where envio_id = v_envio and rol = p_rol and parada_id is not distinct from p_parada) >= 3 then
    return jsonb_build_object('resultado', 'demasiadas');
  end if;
  v_quien := case p_rol when 'remitente' then 'el cargador' when 'transportista' then 'el conductor' else 'el destinatario' end;
  insert into incidencias (tipo_id, envio_id, cliente_id, titulo, detalle)
  values ((select id from tipos_incidencia where clave = 'siniestro'), v_envio, (select cliente_id from envios where id = v_envio),
          format('Reservas en el CMR (%s)', v_quien), v_texto)
  returning id into v_inc;
  insert into cmr_reservas (envio_id, parada_id, rol, texto, incidencia_id) values (v_envio, p_parada, p_rol, v_texto, v_inc);
  -- Fotos de la reserva: colgadas de la incidencia y del envío. Solo rutas de ESTE
  -- enlace, subidas de verdad, de imagen y de 25 MB o menos; máximo 6. El nombre dice
  -- de dónde vienen: «Reserva - conductor · 10/11/26 22:37 (2).jpg».
  if p_fotos is not null then
    insert into documentos (tipo, envio_id, incidencia_id, storage_bucket, storage_ruta, nombre_archivo, tipo_mime, tamano_bytes, visible_cliente)
    select 'foto_incidencia', v_envio, v_inc, 'documentos', x.name,
           format('Reserva - %s · %s%s.%s',
                  case p_rol when 'remitente' then 'cargador' when 'transportista' then 'conductor' else 'destinatario' end,
                  to_char(now() at time zone 'Europe/Madrid', 'DD/MM/YY HH24:MI'),
                  case when count(*) over () > 1 then format(' (%s)', row_number() over (order by x.name)) else '' end,
                  case when x.name like '%.%' then lower(regexp_replace(x.name, '^.*\.', '')) else 'jpg' end),
           x.mimetype, x.tamano, false
      from (select distinct on (o.name) o.name, o.metadata ->> 'mimetype' as mimetype,
                   nullif(o.metadata ->> 'size', '')::bigint as tamano
              from unnest(p_fotos[1:6]) f
              join storage.objects o on o.bucket_id = 'documentos' and o.name = f
             where f like 'cmr/' || p_token::text || '/%'
               and coalesce(o.metadata ->> 'mimetype', 'image/desconocido') like 'image/%'
               and coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0) <= 26214400
               and not exists (select 1 from documentos d where d.storage_ruta = o.name and not d.borrado)) x;
  end if;
  return jsonb_build_object('resultado', 'ok',
    'fotos', coalesce((select count(*) from documentos d where d.incidencia_id = v_inc and d.tipo = 'foto_incidencia'), 0));
end $function$;
revoke all on function public.anotar_reservas_cmr_publico(uuid, uuid, text, text, text[]) from public, anon, authenticated, service_role;
grant execute on function public.anotar_reservas_cmr_publico(uuid, uuid, text, text, text[]) to anon, authenticated, service_role;
comment on function public.anotar_reservas_cmr_publico(uuid, uuid, text, text, text[]) is '[CMR y PIN] Anota reservas (faltas o daños) en una casilla del CMR desde el enlace, antes de firmarla: abre sola una incidencia de siniestro crítica y, si llegan fotos (rutas del propio enlace ya subidas al almacén, imágenes de hasta 25 MB, máx. 6), las cuelga de esa incidencia y del envío como foto_incidencia, con nombre «Reserva - <quien> · <fecha y hora>». Máx. 3 reservas por casilla y 10 por envío. Quién: la página pública del CMR (anon) con su enlace vivo. Argumentos: p_token: llave del enlace · p_parada: envio_paradas.id (null para el transportista) · p_rol: remitente, transportista o destinatario · p_texto: 3–1000 caracteres · p_fotos: rutas cmr/<llave>/… (opcional).';
