-- =====================================================================================
-- CMR DIGITAL: firma con el dedo de cargador, transportista y destinatario
-- =====================================================================================
-- Quien firma no tiene cuenta: abre un enlace que Dynamo genera desde la ficha del envío
-- (/cmr/<token>) y firma su casilla (22 remitente · 23 porteador · 24 destinatario).
-- Valor probatorio (eIDAS, firma electrónica simple): QUIÉN (nombre + documento validado),
-- CUÁNDO (hora del SERVIDOR), DESDE DÓNDE (IP y navegador), QUÉ firmó (huella de los datos
-- del CMR que tenía delante) y el TRAZO (imagen en el almacén privado). `firmas_cmr` es
-- append-only (migración operativa): una firma no se corrige nunca.

-- 1. Enlaces de firma: uno vivo por envío, con caducidad, revocable ---------------------
create table cmr_enlaces (
  id             uuid primary key default gen_random_uuid(),
  envio_id       uuid not null references envios(id) on delete restrict,
  token          uuid not null unique default gen_random_uuid(),
  caduca_en      timestamptz not null default now() + interval '60 days',
  revocado       boolean not null default false,
  creado_en      timestamptz not null default now(),
  creado_por     uuid references auth.users(id) on delete set null,
  modificado_en  timestamptz,
  modificado_por uuid references auth.users(id) on delete set null
);
create unique index ux_cmr_enlace_vivo on cmr_enlaces (envio_id) where not revocado;
select activar_rastro('cmr_enlaces');
alter table cmr_enlaces enable row level security;
create policy cmr_enlaces_dynamo on cmr_enlaces for all using (es_admin()) with check (es_admin());

-- El envío de un enlace VIGENTE (interna: la usan las funciones de abajo).
create or replace function cmr_envio_de_token(p_token uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select envio_id from cmr_enlaces where token = p_token and not revocado and caduca_en > now()
$$;
revoke execute on function cmr_envio_de_token(uuid) from public, anon, authenticated;

-- ¿Es una ruta de firma de un enlace vigente? (cmr/<token>/<uuid>.png) — para el bucket.
create or replace function cmr_ruta_permitida(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_name !~ '^cmr/[0-9a-f-]{36}/[0-9a-f-]{36}\.png$' then return false; end if;
  return cmr_envio_de_token(split_part(p_name, '/', 2)::uuid) is not null;
end $$;
revoke execute on function cmr_ruta_permitida(text) from public;
grant execute on function cmr_ruta_permitida(text) to anon, authenticated;

-- 2. Lo que ve quien firma ----------------------------------------------------------------
-- Lo que pone el propio CMR (remitente, porteador, lugares, fecha, mercancía) y las firmas
-- ya hechas, con el documento ENMASCARADO (RGPD: el enlace lo tienen varias personas).
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
revoke execute on function cmr_publico(uuid) from public;
grant execute on function cmr_publico(uuid) to anon, authenticated;

-- 3. Firmar ----------------------------------------------------------------------------------
create or replace function firmar_cmr_publico(
  p_token uuid, p_parada uuid, p_rol text, p_nombre text, p_documento text, p_pais text,
  p_validado boolean, p_email text, p_ruta text, p_ip inet, p_navegador text, p_sha256 text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_envio uuid; v_tipo text; v_estado estado_envio;
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
  if nullif(trim(p_nombre), '') is null or nullif(trim(p_documento), '') is null then
    return jsonb_build_object('resultado', 'faltan_datos');
  end if;
  -- El trazo tiene que estar ya subido, y en la carpeta de ESTE enlace.
  if p_ruta not like 'cmr/' || p_token::text || '/%'
     or not exists (select 1 from storage.objects where bucket_id = 'documentos' and name = p_ruta) then
    return jsonb_build_object('resultado', 'falta_trazo');
  end if;

  insert into firmas_cmr (envio_id, parada_id, rol, nombre, documento, documento_pais, documento_validado,
                          email, ip, navegador, firma_storage_ruta, sha256_documento)
  values (v_envio, p_parada, p_rol, trim(p_nombre), upper(regexp_replace(p_documento, '[\s.-]', '', 'g')),
          upper(coalesce(nullif(p_pais, ''), 'XX')), coalesce(p_validado, false), nullif(lower(trim(p_email)), ''),
          p_ip, left(p_navegador, 400), p_ruta,
          case when p_sha256 ~ '^[0-9a-f]{64}$' then p_sha256 end);
  return jsonb_build_object('resultado', 'firmada');
end $$;
revoke execute on function firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text) from public;
grant execute on function firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text) to anon, authenticated;

-- 4. El trazo en el almacén privado ---------------------------------------------------------
-- Subir y ver: solo en la carpeta de un enlace vigente (cmr/<token>/…).
drop policy if exists cmr_firma_subir on storage.objects;
create policy cmr_firma_subir on storage.objects for insert to anon, authenticated with check (
  bucket_id = 'documentos' and public.cmr_ruta_permitida(name)
);
drop policy if exists cmr_firma_leer_enlace on storage.objects;
create policy cmr_firma_leer_enlace on storage.objects for select to anon using (
  bucket_id = 'documentos' and public.cmr_ruta_permitida(name)
);
-- Con sesión: además, Dynamo y el cliente o el transportista del envío (lo decide la
-- seguridad por filas de firmas_cmr), aunque el enlace ya haya caducado.
drop policy if exists cmr_firma_leer on storage.objects;
create policy cmr_firma_leer on storage.objects for select to authenticated using (
  bucket_id = 'documentos' and name like 'cmr/%'
  and (public.cmr_ruta_permitida(name)
       or exists (select 1 from public.firmas_cmr f where f.firma_storage_ruta = storage.objects.name))
);
