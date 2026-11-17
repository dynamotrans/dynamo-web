-- =====================================================================================
-- FOTOS DEL CMR EN PAPEL DESDE LA HOJA DE FIRMAS (usuario, 2026-11-17)
-- =====================================================================================
-- «¿No quieren firmar en el móvil? Puedes subir fotos del CMR / carta de porte aquí
-- directamente y lo recibimos igualmente.» Hasta 10 páginas, 20 MB cada una.
--
-- Quien tiene el enlace de la hoja de firmas (sin cuenta) sube las fotos a la carpeta de
-- ESE enlace y esta función las cuelga del envío como «CMR firmado», NO visibles para el
-- cliente hasta que Dynamo las revise (cualquiera con el enlace puede subir cualquier
-- cosa). Dynamo recibe un aviso en la campana.
--
-- DE PASO se arregla la norma de rutas del almacén: solo admitía el trazo de la firma
-- («cmr/<enlace>/<uuid>.png»), así que las fotos de las reservas («foto-<uuid>.jpg»),
-- que la hoja de firmas sube desde el 2026-11-09, se rechazaban al subir. Ahora admite
-- tres clases de fichero y nada más:
--     <uuid>.png                 el trazo de una firma
--     foto-<uuid>.<ext>          foto de una reserva (daños o faltas)
--     papel-<uuid>.<ext>         página del CMR / carta de porte en papel
-- con <ext> de imagen o PDF. El tope de 60 ficheros por enlace sigue igual.

create or replace function public.cmr_ruta_permitida(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_name !~ '^cmr/[0-9a-f-]{36}/[0-9a-f-]{36}\.png$'
     and p_name !~ '^cmr/[0-9a-f-]{36}/(foto|papel)-[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif|pdf)$' then
    return false;
  end if;
  return cmr_envio_de_token(split_part(p_name, '/', 2)::uuid) is not null;
end $$;
comment on function public.cmr_ruta_permitida(text) is '[CMR y PIN] Ayudante del almacenamiento de ficheros: dice si una ruta es de la carpeta de un enlace de CMR vivo y de una de las tres clases admitidas: el trazo de una firma (<uuid>.png), la foto de una reserva (foto-<uuid>.<ext>) o una página del CMR en papel (papel-<uuid>.<ext>), con extensión de imagen o PDF. Quién: políticas del almacén. Argumentos: p_name: ruta del fichero.';

create or replace function public.subir_cmr_papel_publico(p_token uuid, p_fotos text[])
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_envio uuid; v_ya int; n int; v_ref text;
begin
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  if (select estado from envios where id = v_envio) = 'cancelado' then return jsonb_build_object('resultado', 'cancelado'); end if;
  -- Hasta 10 páginas por enlace, contando las que ya llegaron antes.
  select count(*) into v_ya from documentos d
   where d.envio_id = v_envio and d.tipo = 'cmr_firmado' and not d.borrado
     and d.storage_ruta like 'cmr/' || p_token::text || '/papel-%';
  if v_ya >= 10 then return jsonb_build_object('resultado', 'demasiadas'); end if;
  -- Solo rutas de ESTE enlace, subidas de verdad, de imagen o PDF y de 20 MB o menos.
  insert into documentos (tipo, envio_id, storage_bucket, storage_ruta, nombre_archivo, tipo_mime, tamano_bytes, visible_cliente)
  select 'cmr_firmado', v_envio, 'documentos', x.name,
         format('CMR en papel · %s · pág. %s.%s',
                to_char(now() at time zone 'Europe/Madrid', 'DD/MM/YY HH24:MI'),
                v_ya + row_number() over (order by x.orden),
                lower(regexp_replace(x.name, '^.*\.', ''))),
         x.mimetype, x.tamano, false
    from (select distinct on (o.name) o.name, f.orden, o.metadata ->> 'mimetype' as mimetype,
                 nullif(o.metadata ->> 'size', '')::bigint as tamano
            from unnest(p_fotos[1:10]) with ordinality as f(ruta, orden)
            join storage.objects o on o.bucket_id = 'documentos' and o.name = f.ruta
           where f.ruta like 'cmr/' || p_token::text || '/papel-%'
             and (coalesce(o.metadata ->> 'mimetype', 'image/desconocido') like 'image/%'
                  or o.metadata ->> 'mimetype' = 'application/pdf')
             and coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0) <= 20971520
             and not exists (select 1 from documentos d where d.storage_ruta = o.name and not d.borrado)
           order by o.name, f.orden) x
   order by x.orden
   limit 10 - v_ya;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('resultado', 'sin_fotos'); end if;
  select referencia_gx into v_ref from envios where id = v_envio;
  perform crear_aviso('dynamo', null, null, 'cmr_papel_subido', 'aviso',
    'CMR en papel recibido · #' || coalesce(v_ref, ''),
    format('Han subido %s página%s del CMR / carta de porte desde la hoja de firmas. Revísalas en Documentos del envío: el cliente no las ve hasta que las marques visibles.',
           n, case when n = 1 then '' else 's' end),
    '/panel/envios?ver=' || v_envio, v_envio);
  return jsonb_build_object('resultado', 'ok', 'paginas', n, 'total', v_ya + n);
end $$;
revoke all on function public.subir_cmr_papel_publico(uuid, text[]) from public, anon, authenticated, service_role;
grant execute on function public.subir_cmr_papel_publico(uuid, text[]) to anon, authenticated, service_role;
comment on function public.subir_cmr_papel_publico(uuid, text[]) is '[CMR y PIN] Desde el enlace de la hoja de firmas, cuelga del envío las páginas del CMR / carta de porte en papel ya subidas a la carpeta de ese enlace (papel-<uuid>.<ext>): imagen o PDF, 20 MB como mucho cada una y 10 por enlace. Quedan como «CMR firmado», no visibles para el cliente hasta que Dynamo las revise, y Dynamo recibe un aviso. Devuelve ok (con las páginas guardadas y el total), enlace_no_valido, cancelado, demasiadas o sin_fotos. Quién: cualquiera con el enlace (sin cuenta). Argumentos: p_token: enlace del CMR; p_fotos: rutas ya subidas.';
