-- =====================================================================================
-- ARREGLOS DE LA REVISIÓN DE SEGURIDAD (2026-11-05)
-- CMR digital:
--   · Fuera el DNI del conductor ya relleno y el «aprender» el DNI desde la firma: con el
--     enlace del CMR (que tienen almacén, conductor y destinatario) se podía firmar la
--     casilla del conductor con su DNI sin saberlo, o guardar un DNI falso en su ficha.
--   · La validez del documento la decide la base de datos, no quien llama.
--   · Anónimos ya no leen el almacén de archivos: se podían listar las rutas cmr/<llave>/
--     y sacar las llaves de todos los CMR vivos. Los trazos se enseñan desde el servidor.
--   · Con sesión, solo el trazo de una firma de un envío propio (antes cualquier cuenta
--     podía listar las rutas de los CMR vivos, con sus llaves).
--   · Como mucho 20 trazos subidos por enlace (no se puede llenar el almacén).
-- Datos entre empresas:
--   · Hitos: el cliente y el transportista leían el precio de la otra parte en `datos`.
--     Ahora leen sus hitos con mis_hitos() (sin datos).
--   · Firmas del CMR: solo Dynamo lee la tabla; el resto, firmas_envio() sin IP, navegador
--     ni email, y con el documento enmascarado.
--   · Línea de pronto pago: quien no es Dynamo solo ve si está activa.
--   · El transportista ve de su viaje solo los documentos de transporte (no proformas ni
--     adjuntos internos).
--   · Almacenes de Dynamo: solo con sesión (anónimos leían anotaciones y emails).
-- Cuentas:
--   · Un empleado no puede quitarle el rol ni cambiar los datos a un Admin Master.
--   · Un alta online (cliente sin empresa) no puede pasar a cuenta de Dynamo.
-- Otros:
--   · Incidencias: quien no es Dynamo no cambia el envío, almacenamiento, transportista,
--     cliente, prioridad ni resolución de una incidencia ya creada.
--   · Documentos: la ruta registrada tiene que ser de una subida propia (u/<uid>/…).
--   · Sitios: el enlace de Google Maps solo lo pone Dynamo, y siempre https.
--   · Enlace de la carga: el tope de fallos en 24 h ya no bloquea a un transportista que
--     SÍ está en Dynamo (antes cualquiera podía bloquear la carga probando CIF falsos).
-- =====================================================================================

-- ---- CMR ---------------------------------------------------------------------------
create or replace function documento_es_valido(p_doc text)
returns boolean language plpgsql immutable as $$
declare d text := upper(regexp_replace(coalesce(p_doc, ''), '[\s.-]', '', 'g')); n bigint;
begin
  if d ~ '^[0-9]{8}[A-Z]$' then n := substr(d, 1, 8)::bigint;
  elsif d ~ '^[XYZ][0-9]{7}[A-Z]$' then n := (translate(substr(d, 1, 1), 'XYZ', '012') || substr(d, 2, 7))::bigint;
  else return false; end if;
  return substr('TRWAGMYFPDXBNJZSQVHLCKE', (n % 23)::int + 1, 1) = right(d, 1);
end $$;
comment on function public.documento_es_valido(text) is '[Ayudantes internos] ¿Es un DNI o NIE español con la letra correcta? Quién: cualquiera (cálculo). Argumentos: p_doc: el documento.';

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
          upper(coalesce(nullif(p_pais, ''), 'XX')),
          -- La validez la decide la base de datos (no quien llama): DNI/NIE español con su letra.
          upper(coalesce(nullif(p_pais, ''), 'XX')) = 'ES' and documento_es_valido(p_documento), nullif(lower(trim(p_email)), ''),
          p_ip, left(p_navegador, 400), p_ruta,
          case when p_sha256 ~ '^[0-9a-f]{64}$' then p_sha256 end);
  return jsonb_build_object('resultado', 'firmada');
end $$;

drop policy if exists cmr_firma_leer_enlace on storage.objects;
create or replace function cmr_subida_permitida(p_name text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select cmr_ruta_permitida(p_name)
     and (select count(*) from storage.objects o
           where o.bucket_id = 'documentos' and o.name like 'cmr/' || split_part(p_name, '/', 2) || '/%') < 20
$$;
revoke execute on function cmr_subida_permitida(text) from public;
grant execute on function cmr_subida_permitida(text) to anon, authenticated;
comment on function public.cmr_subida_permitida(text) is '[CMR y PIN] ¿Se puede subir este trazo de firma? Ruta de un enlace de CMR vivo y menos de 20 ficheros en ese enlace. Quién: política del almacén. Argumentos: p_name: ruta cmr/<llave>/<fichero>.';
drop policy if exists cmr_firma_subir on storage.objects;
create policy cmr_firma_subir on storage.objects for insert to anon, authenticated with check (
  bucket_id = 'documentos' and public.cmr_subida_permitida(name)
);

-- Con sesión: solo el trazo de una firma del envío que le toca (Dynamo, su cliente o su
-- transportista). Antes bastaba con tener sesión y que el enlace estuviera vivo: cualquier
-- cuenta podía listar las rutas `cmr/<llave>/...` y sacar las llaves de los CMR.
create or replace function cmr_trazo_visible(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from firmas_cmr f
                  where f.firma_storage_ruta = p_name
                    and (ve_todo() or envio_del_cliente(f.envio_id) or envio_del_transportista(f.envio_id)))
$$;
revoke execute on function cmr_trazo_visible(text) from public, anon;
grant execute on function cmr_trazo_visible(text) to authenticated;
comment on function public.cmr_trazo_visible(text) is '[CMR y PIN] ¿Puede esta sesión ver este trazo de firma del CMR? Dynamo, el cliente o el transportista del envío. Quién: política del almacén. Argumentos: p_name: ruta cmr/<llave>/<fichero>.';
drop policy if exists cmr_firma_leer on storage.objects;
create policy cmr_firma_leer on storage.objects for select to authenticated using (
  bucket_id = 'documentos' and name like 'cmr/%' and public.cmr_trazo_visible(name)
);

-- ---- Hitos y firmas: solo lo que toca ------------------------------------------------
drop policy if exists hitos_sel on envio_hitos;
create policy hitos_sel on envio_hitos for select using (es_admin() or ve_todo());
create or replace function mis_hitos(p_envio uuid)
returns table (id bigint, hito tipo_hito, cuando timestamptz)
language sql stable security definer set search_path = public as $$
  select h.id, h.hito, h.cuando from envio_hitos h
   where h.envio_id = p_envio and hito_visible_fuera(h.hito)
     and (envio_del_cliente(p_envio) or envio_del_transportista(p_envio) or ve_todo())
   order by h.cuando desc
$$;
revoke execute on function mis_hitos(uuid) from public, anon;
grant execute on function mis_hitos(uuid) to authenticated;
comment on function public.mis_hitos(uuid) is '[Envíos] Los hitos de un envío que ve el cliente o el transportista: qué pasó y cuándo, sin datos internos ni importes. Quién: cliente o transportista del envío (y Dynamo). Argumentos: p_envio: envios.id.';

drop policy if exists firmas_sel on firmas_cmr;
create policy firmas_sel on firmas_cmr for select using (es_admin() or ve_todo());
create or replace function firmas_envio(p_envio uuid)
returns table (rol text, parada_id uuid, nombre text, documento text, documento_pais text, documento_validado boolean, firmado_en timestamptz, firma_storage_ruta text)
language sql stable security definer set search_path = public as $$
  select f.rol::text, f.parada_id, f.nombre::text, (case when ve_todo() then f.documento else '•••' || right(f.documento, 4) end)::text,
         f.documento_pais::text, f.documento_validado, f.firmado_en, f.firma_storage_ruta::text
    from firmas_cmr f
   where f.envio_id = p_envio and (ve_todo() or envio_del_cliente(p_envio) or envio_del_transportista(p_envio))
   order by f.firmado_en
$$;
revoke execute on function firmas_envio(uuid) from public, anon;
grant execute on function firmas_envio(uuid) to authenticated;
comment on function public.firmas_envio(uuid) is '[CMR y PIN] Las firmas del CMR de un envío, sin IP, navegador ni email; el documento enmascarado salvo para Dynamo. Quién: cliente o transportista del envío y Dynamo. Argumentos: p_envio: envios.id.';

-- ---- Pronto pago: la línea, solo para Dynamo -----------------------------------------
create or replace function pronto_pago_estado_interno()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_linea numeric; v_on boolean; v_dias int; v_usado numeric; v_lista jsonb;
begin
  v_linea := (parametro('pronto_pago_linea_euros'))::text::numeric;
  v_on    := (parametro('pronto_pago_encendido'))::text::boolean;
  v_dias  := (parametro('pronto_pago_ventana_dias'))::text::int;
  select coalesce(sum(r.precio_aceptado - pronto_pago_descuento(r.precio_aceptado)), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'cuando', r.cerrada_en, 'envio', e.referencia_gx, 'transportista', t.nombre_visible,
           'importe', r.precio_aceptado, 'descuento', pronto_pago_descuento(r.precio_aceptado),
           'anticipado', r.precio_aceptado - pronto_pago_descuento(r.precio_aceptado))
           order by r.cerrada_en desc) filter (where r.id is not null), '[]'::jsonb)
    into v_usado, v_lista
    from envio_reservas r
    join envios e on e.id = r.envio_id
    left join transportistas t on t.id = r.transportista_id
   where r.estado = 'aceptada' and r.pronto_pago and r.cerrada_en > now() - make_interval(days => v_dias)
     and e.estado <> 'cancelado';
  return jsonb_build_object(
    'linea', v_linea, 'encendido', v_on, 'ventana_dias', v_dias, 'usado', v_usado,
    'disponible', greatest(v_linea - v_usado, 0),
    'activo', v_on and v_linea - v_usado >= (parametro('pronto_pago_minimo'))::text::numeric,
    'anticipos', case when ve_todo() then v_lista else '[]'::jsonb end);
end $$;
revoke execute on function pronto_pago_estado_interno() from public, anon, authenticated;
comment on function public.pronto_pago_estado_interno() is '[Ayudantes internos] Estado completo de la línea de pronto pago (para las reglas de la base de datos). Quién: solo uso interno.';
create or replace function pronto_pago_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if ve_todo() then return pronto_pago_estado_interno(); end if;
  return jsonb_build_object('activo', pronto_pago_estado_interno() -> 'activo');
end $$;
create or replace function fn_ofertas_pronto_pago()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pronto_pago and not (pronto_pago_estado_interno() ->> 'activo')::boolean then
    new.pronto_pago := false;
  end if;
  return new;
end $$;
create or replace function fn_reservas_pronto_pago_linea()
returns trigger language plpgsql security definer set search_path = public as $$
declare est jsonb;
begin
  if new.estado = 'aceptada' and new.pronto_pago and not (old.estado = 'aceptada' and old.pronto_pago) then
    perform pg_advisory_xact_lock(hashtext('dynamo_pronto_pago'));
    est := pronto_pago_estado_interno();
    if not coalesce((est ->> 'activo')::boolean, false)
       or coalesce((est ->> 'disponible')::numeric, 0) < coalesce(new.precio_aceptado, 0) - pronto_pago_descuento(coalesce(new.precio_aceptado, 0)) then
      new.pronto_pago := false;     -- sin línea: se paga a su plazo normal
    end if;
  end if;
  return new;
end $$;

-- ---- Documentos ----------------------------------------------------------------------
drop policy if exists documentos_sel on documentos;
create policy documentos_sel on documentos for select using (
  es_admin()
  or (not borrado
      and (visible_cliente
           or (creado_por = auth.uid() and tipo in ('foto_incidencia','adjunto')))
      and (envio_del_cliente(envio_id)
           or exists (select 1 from incidencias i
                      where i.id = documentos.incidencia_id and i.cliente_id = cliente_del_usuario())
           or exists (select 1 from almacenamientos a
                      where a.id = documentos.almacenamiento_id and a.cliente_id = cliente_del_usuario())))
  or (not borrado and tipo = 'logo'
      and exists (select 1 from operadores o where o.id = documentos.operador_id and o.cliente_id = cliente_del_usuario()))
  or (not borrado and usuario_id = auth.uid())
  -- Transportista: los de su ficha y, de sus viajes, los de transporte (no proformas ni
  -- adjuntos internos de Dynamo), más lo que suba él.
  or (not borrado and transportista_del_usuario() is not null
      and (documentos.transportista_id = transportista_del_usuario()
           or (envio_del_transportista(envio_id)
               and (tipo in ('orden_transporte', 'cmr', 'cmr_firmado', 'albaran', 'gps_tacografo') or creado_por = auth.uid()))))
);

drop policy if exists documentos_ins on documentos;
create policy documentos_ins on documentos for insert with check (
  es_admin()
  or (storage_ruta like 'u/' || auth.uid()::text || '/%' and (
       (tipo in ('foto_incidencia','adjunto') and incidencia_id is not null and envio_id is null
        and transportista_id is null and almacenamiento_id is null and penalizacion_id is null
        and operador_id is null and usuario_id is null
        and exists (select 1 from incidencias i where i.id = documentos.incidencia_id
                    and i.cliente_id = cliente_del_usuario()))
    or (tipo = 'logo' and operador_id is not null and envio_id is null and incidencia_id is null
        and transportista_id is null and almacenamiento_id is null and penalizacion_id is null and usuario_id is null
        and exists (select 1 from operadores o where o.id = documentos.operador_id and o.cliente_id = cliente_del_usuario()))
    or (tipo in ('hoja_cif','dni','otro') and usuario_id = auth.uid() and envio_id is null and incidencia_id is null
        and transportista_id is null and almacenamiento_id is null and penalizacion_id is null and operador_id is null)))
);
drop policy if exists documentos_ins_transportista on documentos;
create policy documentos_ins_transportista on documentos for insert with check (
  tipo in ('albaran', 'cmr_firmado', 'foto_incidencia', 'gps_tacografo', 'adjunto')
  and storage_ruta like 'u/' || auth.uid()::text || '/%'
  and envio_id is not null and envio_del_transportista(envio_id)
  and incidencia_id is null and transportista_id is null and almacenamiento_id is null
  and penalizacion_id is null and operador_id is null and usuario_id is null
);

-- ---- Almacenes de Dynamo: solo con sesión ---------------------------------------------
drop policy if exists lugares_sel on lugares;
create policy lugares_sel on lugares for select using (
  es_admin()
  or (not borrado and es_almacen_dynamo and auth.uid() is not null)
  or cliente_id = cliente_del_usuario()
);

-- ---- Cuentas ---------------------------------------------------------------------------
create or replace function fn_usuarios_campos_protegidos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_yo_rol rol_usuario;
begin
  -- La cuenta de un Admin Master (o admin de lectura) solo la toca el Admin Master, el
  -- sistema o la consola: un empleado no le quita el rol ni le cambia los datos. Cada
  -- uno puede tocar lo suyo (las demás reglas siguen aplicando).
  if old.rol in ('admin', 'admin_lectura') and new.id is distinct from auth.uid()
     and (to_jsonb(new) - 'ultima_conexion' - 'modificado_en' - 'modificado_por') is distinct from (to_jsonb(old) - 'ultima_conexion' - 'modificado_en' - 'modificado_por')
     and not (es_administrador() or es_servidor() or es_consola_supabase()) then
    raise exception 'La cuenta de un Admin Master solo la cambia el Admin Master.' using errcode = '42501';
  end if;
  -- Una cuenta de cliente o transportista nunca pasa a Dynamo. Tampoco un alta online
  -- (se registró sola, sin invitación): solo las invitaciones de Dynamo nacen como
  -- «cliente» provisional y luego reciben su rol.
  if new.rol is distinct from old.rol
     and (old.cliente_id is not null or old.transportista_id is not null
          or (old.rol in ('cliente', 'transportista') and not es_consola_supabase() and not es_servidor()
              and exists (select 1 from auth.users au where au.id = old.id and au.invited_at is null)))
     and new.rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then
    raise exception 'Un email de % no puede pasar a %. Hay que borrar el usuario y darlo de alta de nuevo.',
      old.rol, new.rol using errcode = '42501';
  end if;

  -- El estado de un Admin Master: solo desde la consola de Supabase (tampoco con la clave de servicio).
  if old.rol = 'admin' and new.estado is distinct from old.estado and not es_consola_supabase() then
    raise exception 'El estado de un Admin Master solo se cambia desde Supabase.' using errcode = '42501';
  end if;
  -- Copias de avisos, email y anotaciones internas: Dynamo o el sistema, no el dueño de la cuenta.
  if (new.copias_avisos, new.email, new.anotaciones) is distinct from (old.copias_avisos, old.email, old.anotaciones)
     and not (es_servidor() or es_consola_supabase() or es_admin()) then
    raise exception 'Esos datos de la cuenta solo los cambia Dynamo.' using errcode = '42501';
  end if;

  if es_servidor() or autosusp_en_curso(old, new) then return new; end if;
  select rol into v_yo_rol from usuarios where id = auth.uid() and estado = 'activa';

  -- Estado de la cuenta (2026-11-04): nadie se suspende a sí mismo, el Admin Master solo
  -- se toca desde Supabase, y una cuenta no vuelve a «pendiente de verificación».
  if new.estado is distinct from old.estado then
    if new.id = auth.uid() then
      raise exception 'Nadie puede cambiar el estado de su propia cuenta.' using errcode = '42501';
    end if;
    if old.rol = 'admin' then
      raise exception 'El estado de un Admin Master solo se cambia desde Supabase.' using errcode = '42501';
    end if;
    if new.estado = 'pendiente_verificacion' then
      raise exception 'Una cuenta no puede volver a «pendiente de verificación»: o activa o suspendida.' using errcode = '42501';
    end if;
  end if;

  if (new.rol, new.estado, new.cliente_id, new.transportista_id,
      new.limite_consultas_precio_diario, new.limite_cargas_diario)
     is distinct from
     (old.rol, old.estado, old.cliente_id, old.transportista_id,
      old.limite_consultas_precio_diario, old.limite_cargas_diario) then
    if v_yo_rol is null or v_yo_rol not in ('admin', 'empleado') then
      raise exception 'Solo Dynamo puede cambiar el rol, el estado o la empresa de una cuenta.'
        using errcode = '42501';
    end if;
    if new.rol is distinct from old.rol and new.id = auth.uid() then
      raise exception 'Nadie puede cambiar su propio rol.' using errcode = '42501';
    end if;
    if new.rol in ('admin', 'admin_lectura') and new.rol is distinct from old.rol and v_yo_rol <> 'admin' then
      raise exception 'Solo el Admin Master puede conceder el rol %.', new.rol using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- ---- Incidencias: lo que no es suyo cambiar -------------------------------------------
create or replace function fn_incidencias_campos_dynamo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if es_admin() or es_servidor() then return new; end if;
  if tg_op = 'INSERT' then
    if new.almacenamiento_id is not null
       and not exists (select 1 from almacenamientos a where a.id = new.almacenamiento_id and a.cliente_id = cliente_del_usuario()) then
      raise exception 'Ese almacenamiento no es tuyo.' using errcode = '42501';
    end if;
    new.resolucion := null; new.resuelto_en := null;
    return new;
  end if;
  new.envio_id := old.envio_id; new.almacenamiento_id := old.almacenamiento_id;
  new.transportista_id := old.transportista_id; new.cliente_id := old.cliente_id;
  new.prioridad := old.prioridad; new.resolucion := old.resolucion; new.resuelto_en := old.resuelto_en;
  return new;
end $$;
revoke execute on function fn_incidencias_campos_dynamo() from public, anon, authenticated;
create trigger tg_incidencias_campos_dynamo before insert or update on incidencias
  for each row execute function fn_incidencias_campos_dynamo();

-- ---- Sitios: el enlace de Google Maps -------------------------------------------------
create or replace function fn_lugares_url_mapa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (es_admin() or es_servidor()) then
    new.url_google_maps := case when tg_op = 'UPDATE' then old.url_google_maps end;
  end if;
  if new.url_google_maps is not null and new.url_google_maps !~* '^https://' then
    raise exception 'El enlace del mapa tiene que empezar por https://' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function fn_lugares_url_mapa() from public, anon, authenticated;
create trigger tg_lugares_url_mapa before insert or update of url_google_maps on lugares
  for each row execute function fn_lugares_url_mapa();

-- ---- Enlace de la carga: el tope de fallos solo frena CIF desconocidos -----------------
create or replace function aceptar_oferta_publica(
  p_reserva uuid, p_cif text, p_precio numeric default null, p_pronto_pago boolean default false,
  p_camion text default null, p_remolque text default null, p_conductor text default null, p_telefono text default null,
  p_ip inet default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; o_t uuid; o_pp boolean; v_t uuid; v_res jsonb; v_tel text; v_fr int; v_fd int;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found then return jsonb_build_object('resultado', 'reserva_no_existe'); end if;
  if r.oferta_id is not null then select transportista_id, pronto_pago into o_t, o_pp from envio_ofertas where id = r.oferta_id; end if;
  -- Pronto pago: un aceptado a la vez comprueba la línea (ver fn_reservas_pronto_pago_linea).
  if coalesce(p_pronto_pago, false) then perform pg_advisory_xact_lock(hashtext('dynamo_pronto_pago')); end if;

  v_t := o_t;
  if v_t is null then
    if nullif(trim(p_cif), '') is null then return jsonb_build_object('resultado', 'falta_cif'); end if;
    select id into v_t from transportistas where normaliza_id_fiscal(cif) = normaliza_id_fiscal(p_cif);
    if v_t is null then
      -- ¿Demasiados fallos con esta carga en 24 h? Solo frena CIF desconocidos: un
      -- transportista que SÍ está en Dynamo puede aceptar aunque otros hayan probado.
      select count(*) into v_fd from intentos_carga_publica where envio_id = r.envio_id and cuando > now() - interval '24 hours';
      if v_fd >= coalesce((parametro('carga_publica_max_fallos_dia') #>> '{}')::int, 20) then
        return jsonb_build_object('resultado', 'demasiados_intentos');
      end if;
      insert into intentos_carga_publica (envio_id, reserva_id, motivo, ip) values (r.envio_id, p_reserva, 'cif_no_encontrado', p_ip);
      select count(*) into v_fr from intentos_carga_publica where reserva_id = p_reserva;
      if v_fr >= coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) then
        perform liberar_reserva(p_reserva, 'demasiados CIF no encontrados');
        return jsonb_build_object('resultado', 'demasiados_intentos');
      end if;
      return jsonb_build_object('resultado', 'transportista_no_encontrado', 'intentos_restantes',
        coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) - v_fr);
    end if;
  end if;

  v_res := aceptar_reserva(p_reserva, v_t, null, p_precio);
  if v_res ->> 'resultado' in ('aceptada', 'pendiente_revision') then
    update envio_reservas
       set pronto_pago = coalesce(p_pronto_pago, false) and coalesce(o_pp, true)
     where id = p_reserva;
  end if;
  if v_res ->> 'resultado' = 'aceptada' then
    v_tel := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
    update envios set
      matricula_camion   = coalesce(nullif(upper(regexp_replace(coalesce(p_camion, ''), '[\s-]', '', 'g')), ''), matricula_camion),
      matricula_remolque = coalesce(nullif(upper(regexp_replace(coalesce(p_remolque, ''), '[\s-]', '', 'g')), ''), matricula_remolque),
      conductor_nombre   = coalesce(nullif(trim(p_conductor), ''), conductor_nombre),
      conductor_telefono = coalesce(case when length(replace(v_tel, '+', '')) >= 6 then v_tel end, conductor_telefono),
      transportista_nima = coalesce(transportista_nima, (select nima from transportistas where id = v_t))
     where id = r.envio_id;
  end if;
  return v_res || jsonb_build_object('transportista', (select nombre_visible from transportistas where id = v_t));
end $$;
