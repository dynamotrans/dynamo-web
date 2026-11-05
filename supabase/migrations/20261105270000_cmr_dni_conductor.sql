-- =====================================================================================
-- CMR: LA CASILLA DEL CONDUCTOR SALE RELLENA CON SU NOMBRE Y SU DNI (usuario, 2026-11-05)
--   · cmr_publico devuelve el DNI del conductor del envío SOLO con sus últimas cifras
--     (el enlace del CMR lo abren también el almacén y el destinatario).
--   · firmar_cmr_publico: en la casilla del conductor, si no escribe documento y el nombre
--     es el del conductor del envío, se usa el DNI de su ficha.
--   · Si firma con un DNI y su ficha no tenía, se guarda para la próxima vez.
-- =====================================================================================

create or replace function cmr_publico(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_envio uuid; e record;
begin
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  select * into e from envios where id = v_envio;
  if e.estado = 'cancelado' then return jsonb_build_object('resultado', 'cancelado', 'referencia', e.referencia_gx); end if;
  return jsonb_build_object(
    'resultado', 'ok',
    'referencia', e.referencia_gx,
    'manual', e.es_manual,
    'remitente', (select razon_social from clientes where id = e.cliente_id),
    'porteador', case when e.es_manual then (select razon_social from operadores where id = e.operador_id)
                      else 'Dynamo Operador de Transportes' end,
    'transportista', (select nombre_visible from transportistas where id = e.transportista_id),
    'matricula', concat_ws(' / ', e.matricula_camion, e.matricula_remolque),
    'conductor', e.conductor_nombre,
    -- DNI del conductor que ya tenemos: solo las últimas cifras (este enlace lo abren
    -- también el almacén y el destinatario). Si es correcto, no hace falta escribirlo.
    'conductor_documento', (select '••••' || right(c.documento, 4) from conductores c
                             where c.id = e.conductor_id and nullif(trim(c.documento), '') is not null),
    'conductor_documento_pais', (select c.documento_pais from conductores c where c.id = e.conductor_id),
    'fecha_carga', coalesce(e.fecha_carga_real, e.fecha_carga_desde),
    'mercancia', e.descripcion_mercancia, 'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas,
    'adr', e.adr,
    'paradas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa', p.nombre_empresa,
        'poblacion', p.poblacion, 'provincia', p.provincia, 'codigo_postal', p.codigo_postal,
        -- Para rellenar de antemano el nombre de quien firma (lo puede cambiar).
        'contacto', (select c.nombre from contactos c where c.lugar_id = p.lugar_id and c.es_principal limit 1))
        order by p.orden), '[]'::jsonb) from envio_paradas p where p.envio_id = e.id),
    'firmas', (select coalesce(jsonb_agg(jsonb_build_object(
        'parada_id', f.parada_id, 'rol', f.rol, 'nombre', f.nombre,
        'documento', '•••' || right(f.documento, 4), 'documento_pais', f.documento_pais,
        'firmado_en', f.firmado_en, 'ruta', f.firma_storage_ruta) order by f.firmado_en), '[]'::jsonb)
        from firmas_cmr f where f.envio_id = e.id)
  );
end $$;

create or replace function firmar_cmr_publico(
  p_token uuid, p_parada uuid, p_rol text, p_nombre text, p_documento text, p_pais text,
  p_validado boolean, p_email text, p_ruta text, p_ip inet, p_navegador text, p_sha256 text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_envio uuid; v_tipo text; v_estado estado_envio; v_doc text := p_documento; v_pais text := p_pais;
        c_id uuid; c_nombre text; c_doc text; c_pais text;
begin
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  select estado into v_estado from envios where id = v_envio;
  if v_estado = 'cancelado' then return jsonb_build_object('resultado', 'cancelado'); end if;
  if p_rol not in ('remitente', 'transportista', 'destinatario') then return jsonb_build_object('resultado', 'rol_no_valido'); end if;

  -- Cada casilla con su parada: el remitente firma en una RECOGIDA, el destinatario en
  -- una ENTREGA y el transportista una sola vez, sin parada.
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
  -- Casilla del conductor: si no escribe documento y firma el conductor del envío, se usa
  -- el DNI que ya tenemos en su ficha.
  if p_rol = 'transportista' then
    select co.id, co.nombre, co.documento, co.documento_pais into c_id, c_nombre, c_doc, c_pais
      from envios e join conductores co on co.id = e.conductor_id where e.id = v_envio;
    if nullif(trim(v_doc), '') is null and c_id is not null and nullif(trim(c_doc), '') is not null
       and lower(unaccent_simple(trim(coalesce(p_nombre, '')))) = lower(unaccent_simple(trim(c_nombre))) then
      v_doc := c_doc; v_pais := coalesce(c_pais, v_pais);
    end if;
  end if;
  if nullif(trim(p_nombre), '') is null or nullif(trim(v_doc), '') is null then
    return jsonb_build_object('resultado', 'faltan_datos');
  end if;
  -- El trazo tiene que estar ya subido, y en la carpeta de ESTE enlace.
  if p_ruta not like 'cmr/' || p_token::text || '/%'
     or not exists (select 1 from storage.objects where bucket_id = 'documentos' and name = p_ruta) then
    return jsonb_build_object('resultado', 'falta_trazo');
  end if;

  insert into firmas_cmr (envio_id, parada_id, rol, nombre, documento, documento_pais, documento_validado,
                          email, ip, navegador, firma_storage_ruta, sha256_documento)
  values (v_envio, p_parada, p_rol, trim(p_nombre), upper(regexp_replace(v_doc, '[\s.-]', '', 'g')),
          upper(coalesce(nullif(v_pais, ''), 'XX')), coalesce(p_validado, false), nullif(lower(trim(p_email)), ''),
          p_ip, left(p_navegador, 400), p_ruta,
          case when p_sha256 ~ '^[0-9a-f]{64}$' then p_sha256 end);
  -- Lo aprende: si el conductor del envío firma con un DNI y su ficha no tenía, se guarda
  -- para la próxima vez.
  if p_rol = 'transportista' and c_id is not null and nullif(trim(c_doc), '') is null
     and lower(unaccent_simple(trim(p_nombre))) = lower(unaccent_simple(trim(c_nombre))) then
    begin
      update conductores set documento = upper(regexp_replace(v_doc, '[\s.-]', '', 'g')),
                             documento_pais = case when upper(coalesce(v_pais, '')) ~ '^[A-Z]{2}$' and upper(v_pais) <> 'XX' then upper(v_pais) else documento_pais end
       where id = c_id;
    exception when unique_violation then null;   -- ese DNI ya está en otra ficha: no se toca
    end;
  end if;
  return jsonb_build_object('resultado', 'firmada');
end $$;
