-- FIRMAR EXIGE TRANSPORTISTA, MATRÍCULAS Y SITIOS (usuario, 2026-11-15): ninguna casilla
-- del CMR se firma si el envío no tiene transportista, matrícula del camión y sus sitios
-- (una recogida y una entrega con dirección). Antes solo se exigían las matrículas en la
-- firma de cabecera; ahora cualquier firma. La de cabecera sigue pudiendo ponerlas en el
-- mismo acto. Copia de la versión de 20261111190000 con el control añadido.
create or replace function public.firmar_cmr_publico(
  p_token uuid, p_parada uuid, p_rol text, p_nombre text, p_documento text, p_pais text,
  p_validado boolean, p_email text, p_ruta text, p_ip inet, p_navegador text, p_sha256 text,
  p_extra boolean default false, p_lat double precision default null, p_lon double precision default null,
  p_gps_precision_m integer default null, p_gps_direccion text default null, p_trazo_png text default null,
  p_matricula_camion text default null, p_matricula_remolque text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_envio uuid; v_tipo text; v_estado estado_envio; v_transportista uuid; v_manual boolean; v_sitio uuid; v_email text;
        v_trazo bytea; v_cabecera boolean; v_mc text; v_mr text;
begin
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  select estado, transportista_id, es_manual into v_estado, v_transportista, v_manual from envios where id = v_envio;
  if v_estado = 'cancelado' then return jsonb_build_object('resultado', 'cancelado'); end if;
  -- SIN TRANSPORTISTA NO SE FIRMA (usuario, 2026-11-10): sin camión asignado no se
  -- puede estar cargando. En los manuales el porteador es el operador: no aplica.
  if v_transportista is null and not coalesce(v_manual, false) then
    return jsonb_build_object('resultado', 'sin_transportista');
  end if;
  if p_rol not in ('remitente', 'transportista', 'destinatario') then return jsonb_build_object('resultado', 'rol_no_valido'); end if;

  -- Cada casilla con su parada: el remitente firma en una RECOGIDA, el destinatario en
  -- una ENTREGA y el transportista sin parada. Vale también para las firmas extra.
  if p_rol = 'transportista' then
    if p_parada is not null then return jsonb_build_object('resultado', 'parada_no_valida'); end if;
  else
    select tipo into v_tipo from envio_paradas where id = p_parada and envio_id = v_envio;
    if v_tipo is null or (p_rol = 'remitente' and v_tipo <> 'carga') or (p_rol = 'destinatario' and v_tipo <> 'descarga') then
      return jsonb_build_object('resultado', 'parada_no_valida');
    end if;
  end if;
  -- La casilla principal solo se firma una vez; las EXTRA no la ocupan y van con su
  -- propio tope: 3 por envío.
  if not coalesce(p_extra, false) and exists (select 1 from firmas_cmr
       where envio_id = v_envio and rol = p_rol and parada_id is not distinct from p_parada and not extra) then
    return jsonb_build_object('resultado', 'ya_firmada');
  end if;
  if coalesce(p_extra, false) and (select count(*) from firmas_cmr where envio_id = v_envio and extra) >= 3 then
    return jsonb_build_object('resultado', 'demasiadas_firmas');
  end if;
  if nullif(trim(p_nombre), '') is null or nullif(trim(p_documento), '') is null then
    return jsonb_build_object('resultado', 'faltan_datos');
  end if;

  -- MATRÍCULAS AL FIRMAR (usuario, 2026-11-11): solo en la firma PRINCIPAL del
  -- transportista o del cargador de la 1.ª parada (da igual quién firme antes). Ahí se
  -- verifican, se corrigen o, si el envío no las tiene, SE EXIGEN (salvo manuales): el
  -- DeCA debe existir antes de salir de la 1.ª parada. En las demás casillas y en las
  -- extra el parámetro se ignora: el envío ya está en tránsito.
  v_cabecera := not coalesce(p_extra, false)
    and (p_rol = 'transportista'
         or (p_rol = 'remitente' and p_parada = (select p2.id from envio_paradas p2 where p2.envio_id = v_envio order by p2.orden limit 1)));
  if v_cabecera then
    v_mc := nullif(upper(trim(coalesce(p_matricula_camion, ''))), '');
    v_mr := nullif(upper(trim(coalesce(p_matricula_remolque, ''))), '');
    if v_mc is not null then
      if v_mc !~ '^[A-Z0-9][A-Z0-9 .·-]{1,15}$' or (v_mr is not null and v_mr !~ '^[A-Z0-9][A-Z0-9 .·-]{1,15}$') then
        return jsonb_build_object('resultado', 'matricula_no_valida');
      end if;
      update envios set matricula_camion = v_mc, matricula_remolque = v_mr where id = v_envio;
    elsif not coalesce(v_manual, false)
          and (select matricula_camion from envios where id = v_envio) is null then
      return jsonb_build_object('resultado', 'faltan_matriculas');
    end if;
  end if;
  -- NADIE FIRMA SIN MATRÍCULAS NI SITIOS (usuario, 2026-11-15): además del transportista
  -- (arriba), ninguna casilla — destinatario, otras recogidas, firmas extra — se firma
  -- mientras el envío no tenga la matrícula del camión ni una recogida y una entrega con
  -- su sitio. La firma de cabecera (transportista o cargador de la 1.ª recogida) puede
  -- poner las matrículas en ese mismo acto: este control va DESPUÉS de guardarlas.
  if not coalesce(v_manual, false) then
    if (select matricula_camion from envios where id = v_envio) is null then
      return jsonb_build_object('resultado', 'sin_matriculas');
    end if;
    if not exists (select 1 from envio_paradas where envio_id = v_envio and tipo = 'carga')
       or not exists (select 1 from envio_paradas where envio_id = v_envio and tipo = 'descarga')
       or exists (select 1 from envio_paradas where envio_id = v_envio
                   and nullif(trim(coalesce(codigo_postal, '')), '') is null and nullif(trim(coalesce(poblacion, '')), '') is null) then
      return jsonb_build_object('resultado', 'faltan_sitios');
    end if;
  end if;
  -- El trazo tiene que estar ya subido, y en la carpeta de ESTE enlace.
  if p_ruta not like 'cmr/' || p_token::text || '/%'
     or not exists (select 1 from storage.objects where bucket_id = 'documentos' and name = p_ruta) then
    return jsonb_build_object('resultado', 'falta_trazo');
  end if;
  -- El MISMO PNG, también en la fila (2026-11-11): de aquí lo leen la página y el PDF
  -- públicos sin clave de servicio. Si no llega o no decodifica, la firma vale igual.
  begin
    if p_trazo_png is not null and length(p_trazo_png) <= 820000 then
      v_trazo := decode(regexp_replace(p_trazo_png, '\s', '', 'g'), 'base64');
      if v_trazo is not null and (octet_length(v_trazo) not between 200 and 600000 or substring(v_trazo from 1 for 4) <> '\x89504e47'::bytea) then
        v_trazo := null;
      end if;
    end if;
  exception when others then v_trazo := null;
  end;

  -- GPS: solo si llega el par completo y dentro de rango; la precisión, acotada.
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    p_lat := null; p_lon := null; p_gps_precision_m := null;
  end if;
  insert into firmas_cmr (envio_id, parada_id, rol, nombre, documento, documento_pais, documento_validado,
                          email, ip, navegador, firma_storage_ruta, sha256_documento, extra, lat, lon, gps_precision_m, gps_direccion, trazo_png)
  values (v_envio, p_parada, p_rol, trim(p_nombre), upper(regexp_replace(p_documento, '[\s.-]', '', 'g')),
          upper(coalesce(nullif(p_pais, ''), 'XX')),
          -- La validez la decide la base de datos (no quien llama): DNI/NIE español con su letra.
          upper(coalesce(nullif(p_pais, ''), 'XX')) = 'ES' and documento_es_valido(p_documento), nullif(lower(trim(p_email)), ''),
          p_ip, left(p_navegador, 400), p_ruta,
          case when p_sha256 ~ '^[0-9a-f]{64}$' then p_sha256 end, coalesce(p_extra, false),
          p_lat, p_lon, case when p_lat is not null then least(greatest(p_gps_precision_m, 0), 100000) end,
          case when p_lat is not null then left(nullif(trim(p_gps_direccion), ''), 300) end, v_trazo);

  -- EL EMAIL A LA FICHA (2026-11-09): si quien firma deja su email y la ficha del sitio
  -- de la parada (o la del transportista, en la casilla 23) no tenía NINGUNO, se guarda
  -- ahí — en su primer contacto, o en uno nuevo si no había contactos — y la próxima
  -- firma sale precargada. Nunca pisa un email existente; si falla, la firma vale igual.
  begin
    v_email := nullif(lower(trim(p_email)), '');
    if v_email is not null and v_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      if p_rol <> 'transportista' then
        select sitio_id into v_sitio from envio_paradas where id = p_parada;
        if v_sitio is not null
           and not exists (select 1 from contactos where sitio_id = v_sitio and email is not null) then
          update contactos set email = v_email, modificado_en = now()
           where id = (select id from contactos where sitio_id = v_sitio
                        order by es_principal desc, creado_en limit 1);
          if not found then
            insert into contactos (sitio_id, nombre, email, es_principal)
            values (v_sitio, trim(p_nombre), v_email, true);
          end if;
        end if;
      elsif v_transportista is not null
            and not exists (select 1 from contactos where transportista_id = v_transportista and email is not null) then
        update contactos set email = v_email, modificado_en = now()
         where id = (select id from contactos where transportista_id = v_transportista
                      order by es_principal desc, creado_en limit 1);
        if not found then
          insert into contactos (transportista_id, nombre, email, es_principal)
          values (v_transportista, trim(p_nombre), v_email, true);
        end if;
      end if;
    end if;
  exception when others then null;   -- guardar el email nunca puede tumbar la firma
  end;
  return jsonb_build_object('resultado', 'firmada');
end $$;
revoke all on function public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean, double precision, double precision, integer, text, text, text, text) from public;
grant execute on function public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean, double precision, double precision, integer, text, text, text, text) to anon, authenticated, service_role;
comment on function public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean, double precision, double precision, integer, text, text, text, text) is '[CMR y PIN] Firma una casilla del CMR desde el enlace: SOLO con transportista asignado (sin camión no se está cargando; devuelve sin_transportista), con la matrícula del camión ya puesta (sin_matriculas) y con recogida y entrega con su sitio (faltan_sitios) — en envíos manuales nada de esto aplica —, valida la casilla (remitente en recogida, destinatario en entrega, transportista sin parada), exige el trazo ya subido a la carpeta del enlace y guarda la firma con hora del servidor, documento (letra validada para ES), IP, navegador, huella, el PNG del trazo en la propia fila y, si quien firma dio permiso, su ubicación GPS. En la firma principal del transportista o del cargador de la 1.ª parada, las matrículas se verifican, se corrigen (p_matricula_camion, p_matricula_remolque) o, si el envío no las tiene, se exigen (faltan_matriculas; salvo manuales): el DeCA debe existir antes de salir. Si quien firma deja email y la ficha del sitio (o del transportista) no tenía ninguno, se guarda en ella sin pisar nada. Con p_extra, es una firma AÑADIDA: no ocupa la casilla y hay 3 como mucho por envío. Quién: la página pública del CMR (anon) con su enlace vivo. Argumentos: p_token: llave del enlace · p_parada: envio_paradas.id (null para el transportista) · p_rol: remitente, transportista o destinatario · p_nombre, p_documento, p_pais, p_validado, p_email: quien firma · p_ruta: trazo cmr/<llave>/… · p_ip, p_navegador: desde dónde · p_sha256: huella de lo firmado · p_extra: firma añadida (opcional) · p_lat, p_lon, p_gps_precision_m, p_gps_direccion: ubicación (opcionales) · p_trazo_png: el PNG del trazo en base64 (opcional) · p_matricula_camion, p_matricula_remolque: matrículas del camión (opcionales; solo transportista o cargador de la 1.ª parada).';
