-- =====================================================================================
-- PDF DEL e-CMR POR SU ENLACE PÚBLICO, SIN CLAVE DE SERVICIO (usuario, 2026-11-11)
-- =====================================================================================
-- La descarga pública del CMR relleno (/cmr/<token>/pdf, la verificación en línea que
-- promete el QR del propio documento) leía la base de datos con la CLAVE DE SERVICIO
-- del servidor, y donde esa clave no está configurada (la preview de Vercel) moría con
-- «La plataforma no está conectada» — el mismo fallo que la orden pública, arreglada
-- esta mañana (datos_orden_por_cmr). Mismo remedio: una función SECURITY DEFINER para
-- la clave pública. datos_cmr_por_token(p_token) valida el token vivo de cmr_enlaces y
-- devuelve TODO lo que el PDF necesita, con lista blanca de columnas (nunca importes ni
-- datos internos) y el documento de identidad de cada firmante ENMASCARADO (•••1234):
-- envío, cliente, porteador (transportista, o el operador en los manuales), paradas,
-- firmas, reservas, la fecha de creación del enlace (el nº único del DeCA) y los datos
-- fijos de Dynamo.
--
-- Los TRAZOS: el almacén no se puede abrir a anon ni con la ruta por llave (listar el
-- almacén revelaría las rutas y, con ellas, los tokens — lo vigilan las pruebas 135 y
-- 140). En su lugar, el trazo se guarda TAMBIÉN en la propia fila de la firma
-- (firmas_cmr.trazo_png, lo escribe firmar_cmr_publico: la acción ya tiene el PNG en la
-- mano) y de ahí salen la página y el PDF públicos, sin clave de servicio. El archivo
-- del almacén sigue siendo la copia de siempre; las firmas de ANTES de esta migración
-- no tienen la columna y, sin clave de servicio, salen sin dibujo (el registro completo
-- —quién, cuándo, huella— va igual).
-- =====================================================================================

alter table firmas_cmr add column trazo_png bytea
  check (trazo_png is null or (octet_length(trazo_png) between 200 and 600000));
comment on column firmas_cmr.trazo_png is 'formato: imagen PNG (bytes) | rango: 200 bytes a 600 KB | lista: no aplica | opcional | El trazo de la firma, el mismo PNG que se sube al almacén (cmr/<token>/…): de aquí lo leen la página y el PDF públicos sin clave de servicio. Las firmas anteriores al 2026-11-11 no lo tienen. Ej. OK: \x89504e47…';

-- firmar_cmr_publico gana p_trazo_png (el PNG en base64, opcional): cambia la firma de
-- la función, así que la versión anterior se retira para no dejar dos.
drop function if exists public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean, double precision, double precision, integer, text);
create or replace function public.firmar_cmr_publico(
  p_token uuid, p_parada uuid, p_rol text, p_nombre text, p_documento text, p_pais text,
  p_validado boolean, p_email text, p_ruta text, p_ip inet, p_navegador text, p_sha256 text,
  p_extra boolean default false, p_lat double precision default null, p_lon double precision default null,
  p_gps_precision_m integer default null, p_gps_direccion text default null, p_trazo_png text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_envio uuid; v_tipo text; v_estado estado_envio; v_transportista uuid; v_manual boolean; v_sitio uuid; v_email text;
        v_trazo bytea;
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
comment on function public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean, double precision, double precision, integer, text, text) is '[CMR y PIN] Firma una casilla del CMR desde el enlace: SOLO con transportista asignado (sin camión no se está cargando; devuelve sin_transportista — en envíos manuales no aplica), valida la casilla (remitente en recogida, destinatario en entrega, transportista sin parada), exige el trazo ya subido a la carpeta del enlace y guarda la firma con hora del servidor, documento (letra validada para ES), IP, navegador, huella, el PNG del trazo en la propia fila (de ahí lo leen la página y el PDF públicos) y, si quien firma dio permiso, su ubicación GPS con su dirección aproximada. Si quien firma deja email y la ficha del sitio (o del transportista) no tenía ninguno, se guarda en ella sin pisar nada. Con p_extra, es una firma AÑADIDA: no ocupa la casilla y hay 3 como mucho por envío. Quién: la página pública del CMR (anon) con su enlace vivo. Argumentos: p_token: llave del enlace · p_parada: envio_paradas.id (null para el transportista) · p_rol: remitente, transportista o destinatario · p_nombre, p_documento, p_pais, p_validado, p_email: quien firma · p_ruta: trazo cmr/<llave>/… · p_ip, p_navegador: desde dónde · p_sha256: huella de lo firmado · p_extra: firma añadida (opcional) · p_lat, p_lon, p_gps_precision_m, p_gps_direccion: ubicación del dispositivo (opcionales) · p_trazo_png: el mismo PNG del trazo, en base64 (opcional).';
revoke all on function public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean, double precision, double precision, integer, text, text) from public, anon, authenticated, service_role;
grant execute on function public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean, double precision, double precision, integer, text, text) to anon, authenticated, service_role;

create or replace function public.datos_cmr_por_token(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v cmr_enlaces%rowtype; e envios%rowtype; cli clientes%rowtype; t transportistas%rowtype; o operadores%rowtype; v_port jsonb;
begin
  select * into v from cmr_enlaces where token = p_token and not revocado and caduca_en > now();
  if not found then
    raise exception 'Este enlace no es válido: ha caducado o se ha retirado.' using errcode = '42501';
  end if;
  select * into e from envios where id = v.envio_id;
  if not found or e.estado = 'cancelado' then
    raise exception 'Este envío está cancelado: ya no hace falta su CMR.' using errcode = '42501';
  end if;
  select * into cli from clientes where id = e.cliente_id;
  if e.operador_id is not null then
    select * into o from operadores where id = e.operador_id;
    v_port := jsonb_build_object('nombre', o.razon_social, 'razon_social', o.razon_social, 'cif', o.cif,
      'telefono', o.telefono, 'email', o.email, 'contacto', o.persona_contacto);
  elsif e.transportista_id is not null then
    select * into t from transportistas where id = e.transportista_id;
    v_port := jsonb_build_object('nombre', coalesce(t.nombre_visible, t.razon_social), 'razon_social', t.razon_social,
      'cif', t.cif, 'codigo', t.codigo, 'direccion', t.direccion, 'codigo_postal', t.codigo_postal,
      'poblacion', t.poblacion, 'provincia', t.provincia, 'pais_codigo_iso', t.pais_codigo_iso);
  end if;
  return jsonb_build_object(
    'envio', jsonb_build_object(
      'id', e.id, 'referencia_gx', e.referencia_gx, 'referencia_cliente', e.referencia_cliente, 'estado', e.estado,
      'es_manual', e.es_manual, 'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
      'fecha_carga_real', e.fecha_carga_real, 'fecha_entrega_estimada', e.fecha_entrega_estimada,
      'descripcion_mercancia', e.descripcion_mercancia, 'toneladas', e.toneladas, 'metros_lineales', e.metros_lineales,
      'paletizado', e.paletizado, 'num_bultos', e.num_bultos, 'embalaje', e.embalaje, 'volumen_m3', e.volumen_m3,
      'adr', e.adr, 'discrecion_comercial', e.discrecion_comercial, 'anotaciones_cliente', e.anotaciones_cliente,
      'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
      'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono),
    'manual', e.operador_id is not null,
    'cliente', jsonb_build_object('nombre', coalesce(cli.nombre_visible, cli.razon_social), 'razon_social', cli.razon_social,
      'cif', cli.cif, 'direccion', cli.direccion, 'codigo_postal', cli.codigo_postal, 'poblacion', cli.poblacion,
      'provincia', cli.provincia, 'pais_codigo_iso', cli.pais_codigo_iso),
    'porteador', v_port,
    'paradas', paradas_viaje_json(e.id),
    'firmas', coalesce((select jsonb_agg(jsonb_build_object('rol', f.rol, 'parada_id', f.parada_id, 'nombre', f.nombre,
        'documento', '•••' || right(f.documento, 4), 'firmado_en', f.firmado_en, 'extra', f.extra, 'lat', f.lat, 'lon', f.lon,
        'gps_precision_m', f.gps_precision_m, 'gps_direccion', f.gps_direccion, 'sha256', f.sha256_documento,
        'ruta', f.firma_storage_ruta, 'trazo', encode(f.trazo_png, 'base64')) order by f.firmado_en)
      from firmas_cmr f where f.envio_id = e.id), '[]'::jsonb),
    'reservas', coalesce((select jsonb_agg(jsonb_build_object('rol', r.rol, 'texto', r.texto, 'parada_id', r.parada_id,
        'creado_en', r.creado_en) order by r.creado_en)
      from cmr_reservas r where r.envio_id = e.id), '[]'::jsonb),
    'deca', jsonb_build_object('creado_en', v.creado_en),
    'dynamo', datos_dynamo());
end $$;
revoke execute on function public.datos_cmr_por_token(uuid) from public;
grant execute on function public.datos_cmr_por_token(uuid) to anon, authenticated;
comment on function public.datos_cmr_por_token(uuid) is '[CMR y PIN] Devuelve en JSON todo lo que necesita el PDF público del e-CMR (/cmr/<token>/pdf) a partir del enlace vivo de cmr_enlaces: envío (lista blanca de columnas, sin importes), cliente, porteador (o el operador en envíos manuales), paradas, firmas con el documento enmascarado y su trazo en base64, reservas, la fecha de creación del enlace (nº único del DeCA) y los datos fijos de Dynamo. Rechaza enlaces revocados o caducados y envíos cancelados. Quién: cualquiera con el enlace (anon). Argumentos: p_token: cmr_enlaces.token.';
