-- =====================================================================================
-- FIRMAS EXTRA EN EL CMR (usuario, 2026-11-09)
-- =====================================================================================
-- Además de las casillas de siempre (22 remitente por recogida, 23 transportista,
-- 24 destinatario por entrega), desde el enlace se pueden añadir hasta 3 FIRMAS EXTRA
-- (otra persona del almacén, un segundo conductor…): se elige la casilla (recogida /
-- transportista / entrega) y se firma con la pantalla de siempre, con el mismo valor
-- probatorio (hora del servidor, documento, IP, trazo, huella). Una firma extra no
-- ocupa la casilla: la principal sigue pendiente o firmada por su cuenta.
--   · firmas_cmr.extra (false de serie) + el «una por casilla» pasa a índice parcial
--     (solo cuenta las principales; y de paso cierra el hueco del NULL del transportista).
--   · firmar_cmr_publico gana p_extra: sin tope de casilla, máximo 3 extra por envío.
--   · cmr_publico devuelve «extra» en cada firma para pintarlas aparte.
--   · Las reservas siguen siendo de la casilla principal (una firma extra no las anota).
-- =====================================================================================

alter table public.firmas_cmr add column extra boolean not null default false;
comment on column public.firmas_cmr.extra is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | opcional | Firma EXTRA añadida a mano desde el enlace (máx. 3 por envío): no ocupa su casilla (la principal va aparte) y no anota reservas.';

alter table public.firmas_cmr drop constraint ux_firmas_una_por_rol;
create unique index ux_firmas_una_por_rol on public.firmas_cmr
  (envio_id, coalesce(parada_id, '00000000-0000-0000-0000-000000000000'::uuid), rol) where not extra;

drop function public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text);
create function public.firmar_cmr_publico(
  p_token uuid, p_parada uuid, p_rol text, p_nombre text, p_documento text, p_pais text,
  p_validado boolean, p_email text, p_ruta text, p_ip inet, p_navegador text, p_sha256 text,
  p_extra boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_envio uuid; v_tipo text; v_estado estado_envio;
begin
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  select estado into v_estado from envios where id = v_envio;
  if v_estado = 'cancelado' then return jsonb_build_object('resultado', 'cancelado'); end if;
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

  insert into firmas_cmr (envio_id, parada_id, rol, nombre, documento, documento_pais, documento_validado,
                          email, ip, navegador, firma_storage_ruta, sha256_documento, extra)
  values (v_envio, p_parada, p_rol, trim(p_nombre), upper(regexp_replace(p_documento, '[\s.-]', '', 'g')),
          upper(coalesce(nullif(p_pais, ''), 'XX')),
          -- La validez la decide la base de datos (no quien llama): DNI/NIE español con su letra.
          upper(coalesce(nullif(p_pais, ''), 'XX')) = 'ES' and documento_es_valido(p_documento), nullif(lower(trim(p_email)), ''),
          p_ip, left(p_navegador, 400), p_ruta,
          case when p_sha256 ~ '^[0-9a-f]{64}$' then p_sha256 end, coalesce(p_extra, false));
  return jsonb_build_object('resultado', 'firmada');
end $$;
revoke all on function public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean) to anon, authenticated, service_role;
comment on function public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean) is '[CMR y PIN] Firma una casilla del CMR desde el enlace: valida la casilla (remitente en recogida, destinatario en entrega, transportista sin parada), exige el trazo ya subido a la carpeta del enlace y guarda la firma con hora del servidor, documento (letra validada para ES), IP, navegador y huella. Con p_extra, es una firma AÑADIDA: no ocupa la casilla y hay 3 como mucho por envío. Quién: la página pública del CMR (anon) con su enlace vivo. Argumentos: p_token: llave del enlace · p_parada: envio_paradas.id (null para el transportista) · p_rol: remitente, transportista o destinatario · p_nombre, p_documento, p_pais, p_validado, p_email: quien firma · p_ruta: trazo cmr/<llave>/… · p_ip, p_navegador: desde dónde · p_sha256: huella de lo firmado · p_extra: firma añadida (opcional).';

-- ---- cmr_publico: cada firma dice si es extra, para pintarlas aparte ------------------------
CREATE OR REPLACE FUNCTION public.cmr_publico(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                      else coalesce(parametro('dynamo_razon_social') #>> '{}', 'Dynamo Operador Logístico, S.L.') end,
    'transportista', (select nombre_visible from transportistas where id = e.transportista_id),
    'matricula', concat_ws(' / ', e.matricula_camion, e.matricula_remolque),
    'conductor', e.conductor_nombre,
    'fecha_carga', coalesce(e.fecha_carga_real, e.fecha_carga_desde),
    'mercancia', e.descripcion_mercancia, 'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas,
    'adr', e.adr,
    'paradas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa', p.nombre_empresa,
        'poblacion', p.poblacion, 'provincia', p.provincia, 'codigo_postal', p.codigo_postal,
        -- Para rellenar de antemano el nombre de quien firma (lo puede cambiar).
        'contacto', (select c.nombre from contactos c where c.sitio_id = p.sitio_id and c.es_principal limit 1))
        order by p.orden), '[]'::jsonb) from envio_paradas p where p.envio_id = e.id),
    'firmas', (select coalesce(jsonb_agg(jsonb_build_object(
        'parada_id', f.parada_id, 'rol', f.rol, 'nombre', f.nombre,
        'documento', '•••' || right(f.documento, 4), 'documento_pais', f.documento_pais,
        'firmado_en', f.firmado_en, 'ruta', f.firma_storage_ruta, 'extra', f.extra) order by f.extra, f.firmado_en), '[]'::jsonb)
        from firmas_cmr f where f.envio_id = e.id)
  );
end $function$;

