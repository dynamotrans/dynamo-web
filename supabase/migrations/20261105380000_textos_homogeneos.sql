-- =====================================================================================
-- TEXTOS QUE ESCRIBE LA BASE DE DATOS, HOMOGÉNEOS (revisión del 2026-11-05)
-- Decisiones del usuario: «Vie 10/07/26» en todo, nombre legal (Dynamo Operador Logístico,
-- S.L.), «orden de carga», «plataforma elevadora».
--   · Fechas de los avisos con fecha_texto() / fecha_hora_texto(): «Vie 10/07/26», «Vie
--     10/07/26 · 14:30» (antes 10/07/2026, 10/07, 10/07/2026 14:30).
--   · Teléfono y email de Dynamo desde Parámetros (tel_dynamo(), email_dynamo()): antes
--     escritos a mano en 9 sitios. El CMR saca la razón social de Parámetros.
--   · Tildes en los mensajes que ve el usuario («envío», «almacén», «día»…).
--   · Mensajes técnicos en castellano llano (histórico, «Ese envío no existe» sin el código
--     interno, estados sin guiones bajos, «Admin Master»).
--   · Títulos de los avisos con la referencia siempre como «Título · #GX…».
--   · CIF/NIF y matrículas se guardan siempre igual: sin espacios, puntos ni guiones (lo
--     hace la base de datos, también para n8n). Los guardados antes se igualan.
-- =====================================================================================

-- ---- Ayudantes de texto ------------------------------------------------------------
create or replace function fecha_texto(p date)
returns text language sql immutable set search_path = public as $$
  select case when p is null then '—'
              else (array['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'])[extract(dow from p)::int + 1] || ' ' || to_char(p, 'DD/MM/YY') end
$$;
comment on function public.fecha_texto(date) is '[Ayudantes internos] Fecha con el formato de la plataforma: «Vie 10/07/26». Quién: cualquiera (cálculo). Argumentos: p: la fecha.';

create or replace function fecha_hora_texto(p timestamptz)
returns text language sql stable set search_path = public as $$
  select case when p is null then '—'
              else fecha_texto((p at time zone 'Europe/Madrid')::date) || ' · ' || to_char(p at time zone 'Europe/Madrid', 'HH24:MI') end
$$;
comment on function public.fecha_hora_texto(timestamptz) is '[Ayudantes internos] Fecha y hora en Madrid con el formato de la plataforma: «Vie 10/07/26 · 14:30». Quién: cualquiera (cálculo). Argumentos: p: el instante.';

create or replace function tel_dynamo()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select valor #>> '{}' from parametros where clave = 'dynamo_telefono'), '+34 955 225 945')
$$;
comment on function public.tel_dynamo() is '[Ayudantes internos] Teléfono de Dynamo para los textos (Parámetros → dynamo_telefono). Quién: cualquiera. Argumentos: sin argumentos.';

create or replace function email_dynamo()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select valor #>> '{}' from parametros where clave = 'dynamo_email'), 'info@dynamotrans.com')
$$;
comment on function public.email_dynamo() is '[Ayudantes internos] Email de Dynamo para los textos (Parámetros → dynamo_email). Quién: cualquiera. Argumentos: sin argumentos.';
grant execute on function fecha_texto(date), fecha_hora_texto(timestamptz), tel_dynamo(), email_dynamo() to anon, authenticated;

-- ---- Funciones con sus textos al día --------------------------------------------------

CREATE OR REPLACE FUNCTION public.alta_transportista_publica(p_reserva uuid, p_bolsa text, p_codigo_bolsa text, p_pais character, p_cif text, p_telefono text, p_precio numeric DEFAULT NULL::numeric, p_pronto_pago boolean DEFAULT false, p_ip inet DEFAULT NULL::inet)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; e record; v_t uuid; v_base numeric; v_banda numeric; v_fd int;
        o_t uuid; o_precio numeric; o_banda numeric; o_pp boolean;
        v_tel text := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
        v_cod text := nullif(trim(coalesce(p_codigo_bolsa, '')), '');
        v_cif text := upper(trim(coalesce(p_cif, '')));
        v_nombre_bolsa text; v_fr int;
begin
  select * into r from envio_reservas where id = p_reserva for update;
  if not found then return jsonb_build_object('resultado', 'reserva_no_existe'); end if;
  if r.estado <> 'viva' or r.hasta < now() then return jsonb_build_object('resultado', 'reserva_caducada'); end if;
  if r.oferta_id is not null then
    select transportista_id, precio_ofertado, banda_euros, pronto_pago into o_t, o_precio, o_banda, o_pp from envio_ofertas where id = r.oferta_id;
  end if;
  if o_t is not null then return jsonb_build_object('resultado', 'oferta_personal'); end if;

  select count(*) into v_fd from intentos_carga_publica where envio_id = r.envio_id and cuando > now() - interval '24 hours';
  if v_fd >= coalesce((parametro('carga_publica_max_fallos_dia') #>> '{}')::int, 20) then
    return jsonb_build_object('resultado', 'demasiados_intentos');
  end if;
  -- Topes de altas online (parámetros): pendientes por carga y altas al día en total.
  if (select count(*) from envio_reservas rr join transportistas tt on tt.id = rr.transportista_id
       where rr.envio_id = r.envio_id and rr.estado = 'pendiente_revision' and 'alta_online' = any (tt.tags)) >= parametro_num('alta_online_max_pendientes_carga', 3)
     or (select count(*) from transportistas where 'alta_online' = any (tags) and creado_en > now() - interval '24 hours') >= parametro_num('alta_online_max_dia', 30) then
    return jsonb_build_object('resultado', 'demasiadas_altas');
  end if;

  -- Los cuatro datos (la pantalla ya los valida; aquí, por si llaman a la API a mano).
  if coalesce(p_bolsa, '') not in ('wtransnet', 'teleroute', 'bursa_transport', '123cargo') then
    return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'bolsa');
  end if;
  if v_cod is null or length(v_cod) > 30 then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'codigo_bolsa'); end if;
  if coalesce(p_pais, '') !~ '^[A-Z]{2}$' then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'pais'); end if;
  if length(normalizar_id_fiscal(v_cif)) not between 5 and 20 then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'cif'); end if;
  if v_tel is null or v_tel !~ '^\+?[0-9]{6,15}$' then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'telefono'); end if;

  -- Ya está en Dynamo (por CIF o por su código en esa bolsa): no se duplica.
  -- Cada intento con un CIF o código que ya existe cuenta como fallo (como en la
  -- aceptación normal): al llegar al máximo por reserva, se pierde la reserva.
  if exists (select 1 from transportistas where normalizar_id_fiscal(cif) = normalizar_id_fiscal(v_cif))
     or exists (select 1 from transportistas where bolsa = p_bolsa and lower(trim(codigo_bolsa)) = lower(v_cod)) then
    insert into intentos_carga_publica (envio_id, reserva_id, motivo, ip) values (r.envio_id, p_reserva, 'alta_ya_existe', p_ip);
    select count(*) into v_fr from intentos_carga_publica where reserva_id = p_reserva;
    if v_fr >= coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) then
      perform liberar_reserva_publica(p_reserva, 'demasiados intentos de alta');
      return jsonb_build_object('resultado', 'demasiados_intentos');
    end if;
    return jsonb_build_object('resultado', case when exists (select 1 from transportistas where normalizar_id_fiscal(cif) = normalizar_id_fiscal(v_cif))
                                                then 'ya_existe' else 'ya_existe_bolsa' end);
  end if;

  -- Precio: el de la oferta, o el propuesto dentro de su banda.
  select * into e from envios where id = r.envio_id for update;
  if e.estado <> 'programado' or e.estado_asignacion = 'confirmada' then return jsonb_build_object('resultado', 'tomada'); end if;
  v_base := coalesce(o_precio, e.importe_transportista); v_banda := coalesce(o_banda, 0);
  if v_base is null then return jsonb_build_object('resultado', 'envio_sin_precio'); end if;
  if p_precio is not null and abs(p_precio - v_base) > v_banda then
    return jsonb_build_object('resultado', 'precio_fuera_de_banda', 'minimo', v_base - v_banda, 'maximo', v_base + v_banda);
  end if;

  v_nombre_bolsa := case p_bolsa when 'wtransnet' then 'Wtransnet' when 'teleroute' then 'Teleroute'
                                 when 'bursa_transport' then 'Bursa Transport' else '123cargo' end;
  begin
    -- La razón social es obligatoria en la tabla: hasta que Dynamo la copie de la bolsa,
    -- lleva un nombre provisional que dice de dónde sacarla.
    insert into transportistas (razon_social, cif, pais_codigo_iso, estado_operativo, bolsa, codigo_bolsa, tags, anotaciones)
    values (format('Pendiente de completar (%s %s)', v_nombre_bolsa, v_cod), v_cif, p_pais, 'no_ofertar', p_bolsa, v_cod, array['alta_online'],
            format('Alta online desde el enlace de la carga %s el %s. Datos dados: %s %s, CIF %s, teléfono %s. '
                   'PENDIENTE: comprobar que está en %s y completar razón social, dirección, seguro y email desde su ficha de la bolsa.',
                   e.referencia_gx, fecha_hora_texto(now()),
                   v_nombre_bolsa, v_cod, v_cif, v_tel, v_nombre_bolsa))
    returning id into v_t;
  exception when unique_violation then
    return jsonb_build_object('resultado', 'ya_existe');
  end;
  -- Cada alta cuenta en el límite diario de intentos de la carga.
  insert into intentos_carga_publica (envio_id, reserva_id, motivo, ip) values (r.envio_id, p_reserva, 'alta_online', p_ip);
  insert into contactos (transportista_id, funcion, telefono, es_principal)
  values (v_t, 'trafico', v_tel, true);

  update envio_reservas set estado = 'pendiente_revision', precio_propuesto = coalesce(p_precio, v_base), transportista_id = v_t,
         pronto_pago = coalesce(p_pronto_pago, false) and coalesce(o_pp, true)
   where id = p_reserva;
  perform registrar_hito(e.id, 'contraoferta_propuesta', null, r.oferta_id,
    jsonb_build_object('reserva_id', p_reserva, 'precio_base', v_base, 'precio_propuesto', coalesce(p_precio, v_base),
                       'alta_online', true, 'bolsa', p_bolsa, 'codigo_bolsa', v_cod, 'cif', v_cif), 'servidor');
  return jsonb_build_object('resultado', 'alta_pendiente');
end $function$;

CREATE OR REPLACE FUNCTION public.cancelar_mi_envio(p_envio uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_estado estado_envio; v_pen numeric;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select estado into v_estado from envios where id = p_envio for update;
  if v_estado = 'cancelado' then raise exception 'El envío ya está cancelado.'; end if;
  if v_estado not in ('borrador', 'programado') then
    raise exception 'El camión ya va hacia la carga: para cancelar, llámanos al %.', tel_dynamo();
  end if;
  update envios set estado = 'cancelado',
                    estado_solicitud = case when estado_solicitud in ('pendiente_precio', 'precio_propuesto', 'contraoferta') then 'rechazada' else estado_solicitud end
   where id = p_envio;
  if nullif(trim(p_motivo), '') is not null then
    perform registrar_hito(p_envio, 'incidencia', null, null, jsonb_build_object('motivo_cancelacion', left(trim(p_motivo), 500), 'por', 'cliente'));
  end if;
  select importe_cliente into v_pen from penalizaciones
   where envio_id = p_envio and generada_auto and estado = 'pendiente_confirmar' order by creado_en desc limit 1;
  return jsonb_build_object('resultado', 'cancelado', 'penalizacion', v_pen is not null, 'importe', v_pen);
end $function$;

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
        'firmado_en', f.firmado_en, 'ruta', f.firma_storage_ruta) order by f.firmado_en), '[]'::jsonb)
        from firmas_cmr f where f.envio_id = e.id)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.crear_envio(p_datos jsonb, p_paradas jsonb)
 RETURNS TABLE(id uuid, referencia_gx text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id      uuid;
  v_gx      text;
  v_cliente uuid := (p_datos ->> 'cliente_id')::uuid;
  v_p       jsonb;
  v_orden   smallint := 0;
  v_sitio   uuid;
  l         sitios%rowtype;
begin
  if not es_equipo_dynamo() then
    raise exception 'Solo el equipo de Dynamo puede crear envíos por ahora.' using errcode = '42501';
  end if;
  if v_cliente is null then
    raise exception 'Falta el cliente del envío.';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envío necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como máximo 4 puntos en la ruta (2 paradas además del origen y el destino).';
  end if;

  insert into envios (
    cliente_id, referencia_cliente, estado,
    fecha_carga_desde, fecha_carga_hasta,
    descripcion_mercancia, toneladas, metros_lineales,
    paletizado, carga_lateral, carga_trasera, carga_techo,
    requiere_plataforma_elevadora, requiere_nima, adr,
    importe_cliente, importe_transportista, precio_fijado_a_mano, iva_pct,
    discrecion_comercial, anotaciones_cliente
  ) values (
    v_cliente, nullif(trim(p_datos ->> 'referencia_cliente'), ''), 'borrador',
    (p_datos ->> 'fecha_carga_desde')::date, (p_datos ->> 'fecha_carga_hasta')::date,
    nullif(trim(p_datos ->> 'descripcion_mercancia'), ''),
    (p_datos ->> 'toneladas')::numeric, (p_datos ->> 'metros_lineales')::numeric,
    coalesce((p_datos ->> 'paletizado')::boolean, true),
    coalesce((p_datos ->> 'carga_lateral')::boolean, true),
    coalesce((p_datos ->> 'carga_trasera')::boolean, false),
    coalesce((p_datos ->> 'carga_techo')::boolean, false),
    coalesce((p_datos ->> 'requiere_plataforma_elevadora')::boolean, false),
    coalesce((p_datos ->> 'requiere_nima')::boolean, false),
    coalesce((p_datos ->> 'adr')::boolean, false),
    (p_datos ->> 'importe_cliente')::numeric, (p_datos ->> 'importe_transportista')::numeric,
    (p_datos ->> 'importe_cliente') is not null,
    coalesce((p_datos ->> 'iva_pct')::numeric, 21),
    coalesce((p_datos ->> 'discrecion_comercial')::boolean, false),
    nullif(trim(p_datos ->> 'anotaciones_cliente'), '')
  ) returning envios.id, envios.referencia_gx into v_id, v_gx;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    v_sitio := nullif(v_p ->> 'sitio_id', '')::uuid;

    -- Sitio nuevo que se quiere en la agenda del cliente: se crea primero.
    if v_sitio is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into sitios (cliente_id, nombre_empresa, tipo, direccion, codigo_postal,
                           poblacion, provincia, pais_codigo_iso, horarios, anotaciones)
      values (v_cliente, trim(v_p ->> 'nombre_empresa'),
              coalesce(nullif(v_p ->> 'tipo_sitio', '')::tipo_sitio, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''),
              nullif(trim(v_p ->> 'poblacion'), ''), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'),
              nullif(trim(v_p ->> 'horarios'), ''), nullif(trim(v_p ->> 'anotaciones_sitio'), ''))
      returning sitios.id into v_sitio;
    end if;

    if v_sitio is not null then
      -- Copia CONGELADA de la dirección del sitio: el CMR de dentro de un año tiene que
      -- seguir diciendo a dónde se fue, aunque el sitio se edite después.
      select * into l from sitios where sitios.id = v_sitio;
      if not found then raise exception 'El sitio elegido no existe o no es de este cliente.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, sitio_id, nombre_empresa, direccion,
                                 codigo_postal, poblacion, provincia, pais_codigo_iso, lat, lon,
                                 referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', v_sitio, l.nombre_empresa, l.direccion,
              l.codigo_postal, l.poblacion, l.provincia, l.pais_codigo_iso, l.lat, l.lon,
              nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    else
      insert into envio_paradas (envio_id, orden, tipo, nombre_empresa, direccion,
                                 codigo_postal, poblacion, provincia, pais_codigo_iso,
                                 referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', nullif(trim(v_p ->> 'nombre_empresa'), ''),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''),
              nullif(trim(v_p ->> 'poblacion'), ''), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'),
              nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    end if;
  end loop;

  -- Confirmar: aquí se comprueban la ruta y las zonas, y se sellan los hitos.
  update envios set estado = 'programado' where envios.id = v_id;

  return query select v_id, v_gx;
end $function$;

CREATE OR REPLACE FUNCTION public.deshacer_cancelacion(p_envio uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_estado estado_envio; v_antes text; e record;
begin
  if not es_equipo_dynamo() then
    raise exception 'Solo Dynamo puede deshacer una cancelación.' using errcode = '42501';
  end if;
  select estado into v_estado from envios where id = p_envio for update;
  if v_estado is distinct from 'cancelado' then raise exception 'El envío no está cancelado.'; end if;
  -- El estado de antes, del hito de la cancelación (el más reciente).
  select datos ->> 'estado_anterior' into v_antes from envio_hitos
   where envio_id = p_envio and hito = 'cancelado' order by cuando desc limit 1;
  if v_antes is null or v_antes = 'cancelado' then v_antes := 'programado'; end if;
  select * into e from envios where id = p_envio;
  if v_antes = 'borrador' then
    -- Era una solicitud (o un borrador): vuelve a serlo, nunca salta a programado sin
    -- precio aceptado, condiciones ni previo pago.
    update envios set estado = 'borrador',
                      estado_solicitud = case when estado_solicitud = 'rechazada' then 'pendiente_precio' else estado_solicitud end
     where id = p_envio;
    return v_antes;
  end if;
  update envios set estado = v_antes::estado_envio where id = p_envio;
  -- Pendiente de pago: plazo nuevo desde ahora (si no, se volvería a anular en minutos).
  if e.estado_pago_previo = 'pendiente' then update envios set pago_pendiente_en = now() where id = p_envio; end if;
  -- Tenía camión: se le dijo «no vayas a cargar»; ahora hay que avisarle.
  if e.transportista_id is not null then
    perform crear_aviso('transportista', null, e.transportista_id, 'reactivada', 'urgente', 'Carga reactivada · #' || coalesce(e.referencia_gx, ''),
      'La carga que se canceló vuelve a estar en pie a tu nombre. Confírmalo con Dynamo: ' || tel_dynamo() || '.', '/panel/envios?ver=' || e.id, e.id);
  end if;
  return v_antes;
end $function$;

CREATE OR REPLACE FUNCTION public.exportar_datos_usuario(p_usuario uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v uuid := coalesce(p_usuario, auth.uid()); u usuarios%rowtype;
begin
  if v is null then raise exception 'Sin sesión.' using errcode = '42501'; end if;
  if v <> auth.uid() and not ve_todo() then raise exception 'Solo tus datos.' using errcode = '42501'; end if;
  select * into u from usuarios where id = v;
  if not found then return null; end if;
  return jsonb_build_object(
    'generado_en', now(),
    'responsable', jsonb_build_object('empresa', (select valor #>> '{}' from parametros where clave = 'dynamo_razon_social'),
                                      'contacto', email_dynamo()),
    'cuenta', jsonb_build_object('email', u.email, 'nombre', u.nombre, 'telefono', u.telefono, 'documento', u.documento,
                                 'cargo', u.cargo, 'idioma', u.idioma, 'rol', u.rol, 'estado', u.estado,
                                 'suspension_motivo', u.suspension_motivo, 'creado_en', u.creado_en, 'ultima_conexion', u.ultima_conexion,
                                 'emails_copia_avisos', u.emails_copia_avisos),
    'empresa', coalesce((select jsonb_build_object('tipo', 'cliente', 'nombre', nombre_visible, 'cif', cif) from clientes where id = u.cliente_id),
                        (select jsonb_build_object('tipo', 'transportista', 'nombre', nombre_visible, 'cif', cif) from transportistas where id = u.transportista_id)),
    'como_contacto', coalesce((select jsonb_agg(jsonb_build_object('nombre', c.nombre, 'cargo', c.cargo, 'telefono', c.telefono, 'email', c.email, 'recibe_avisos', c.recibe_avisos))
                                 from contactos c where lower(c.email) = lower(u.email)), '[]'),
    'envios_creados', coalesce((select jsonb_agg(jsonb_build_object('referencia', e.referencia_gx, 'creado_en', e.creado_en, 'estado', e.estado,
                                   'fecha_carga', e.fecha_carga_desde) order by e.creado_en)
                                 from envios e where e.creado_por = v), '[]'),
    -- Firmas del CMR con su email: solo fecha y papel (el email lo teclea quien firma y no
    -- se verifica: el nombre y el documento podrían ser de otra persona).
    'firmas_cmr_con_tu_email', coalesce((select jsonb_agg(jsonb_build_object('firmado_en', f.firmado_en, 'papel', f.rol))
                              from firmas_cmr f where u.email is not null and lower(f.email) = lower(u.email)), '[]'),
    'consultas_precio_12_meses', (select count(*) from consultas_precio where usuario_id = v),
    'tiempo_conectado_12_meses', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'minutos', minutos) order by dia)
                                             from conexion_minutos where usuario_id = v), '[]'),
    'nota', 'Esto es lo que la plataforma de Dynamo guarda sobre ti. Las anotaciones internas del equipo y los registros de seguridad se facilitan a petición por email a ' || email_dynamo() || '.'
  );
end $function$;

CREATE OR REPLACE FUNCTION public.fn_almacenamientos_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a record;
begin
  if new.cliente_id is null then new.cliente_id := cliente_del_usuario(); end if;

  select es_almacen_dynamo, disponible, borrado into a from sitios where id = new.almacen_id;
  if not coalesce(a.es_almacen_dynamo, false) or a.borrado then
    raise exception 'Hay que elegir un almacén de Dynamo.';
  end if;
  -- "Completo" bloquea ALMACENAR (decisión 2026-07-08), pero solo al pedirlo: no rompe
  -- los almacenamientos que ya estaban dentro.
  if tg_op = 'INSERT' and not a.disponible then
    raise exception 'Este almacén está COMPLETO y no admite entradas.';
  end if;

  if new.sitio_entrega_id is not null and not exists (
       select 1 from sitios where id = new.sitio_entrega_id
       and (cliente_id = new.cliente_id or es_almacen_dynamo)) then
    raise exception 'La dirección de entrega tiene que ser un sitio de este cliente.';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'Este registro forma parte del histórico (% · %) y no se puede cambiar ni borrar.',
    tg_table_name, tg_op;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_append_only_salvo_purga()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('dynamo.purga', true), '') = 'on' then return null; end if;
  raise exception 'Este registro forma parte del histórico (% · %) y no se puede cambiar ni borrar.', tg_table_name, tg_op;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_auditoria_inmutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('dynamo.purga', true), '') = 'on' then return null; end if;
  raise exception
    'El historial de cambios no se puede cambiar ni borrar (%).', tg_op;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_avisos_almacenamientos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_dynamo boolean := coalesce((select rol::text in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') from usuarios where id = auth.uid()), false);
begin
  if new.estado = old.estado or not v_dynamo then return null; end if;
  if new.estado = 'confirmado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'almacen_confirmado', 'ok', 'Almacenamiento confirmado · #' || new.codigo,
      'Entrada el ' || fecha_texto(new.fecha_entrada) || '.', '/panel/almacenamientos', null);
  elsif new.estado = 'cancelado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'almacen_cancelado', 'aviso', 'Almacenamiento cancelado · #' || new.codigo,
      'Si no lo esperabas, llámanos al ' || tel_dynamo() || '.', '/panel/almacenamientos', null);
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_avisos_envios()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol text := (select rol::text from usuarios where id = auth.uid());
  v_dynamo boolean := coalesce(v_rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura'), false);
  v_por_cliente boolean := coalesce(v_rol = 'cliente', false);
  v_ref text := '#' || coalesce(new.referencia_gx, '');
  v_cli text;
  v_enl text := '/panel/envios?ver=' || new.id;
  o_sol text; o_est estado_envio; o_cam text; o_pago text; o_tr uuid;
begin
  if coalesce(new.es_manual, false) then return null; end if;
  select nombre_visible into v_cli from clientes where id = new.cliente_id;
  v_cli := coalesce(v_cli, 'El cliente');
  if tg_op = 'UPDATE' then
    o_sol := old.estado_solicitud; o_est := old.estado; o_cam := old.estado_cambio_cliente; o_pago := old.estado_pago_previo; o_tr := old.transportista_id;
  end if;

  -- Solicitudes de precio y contraofertas del cliente.
  if new.estado_solicitud is distinct from o_sol then
    if new.estado_solicitud = 'pendiente_precio' then
      perform crear_aviso('dynamo', null, null, 'solicitud', 'aviso', 'Solicitud de precio · ' || v_ref,
        v_cli || case when o_sol = 'precio_propuesto' then ' vuelve a pedir precio (el anterior caducó).' else ' pide precio para un envío.' end, v_enl, new.id);
    elsif new.estado_solicitud = 'precio_propuesto' then
      if o_sol = 'contraoferta' then
        perform crear_aviso('cliente', new.cliente_id, null, 'contraoferta_rechazada', 'aviso', 'Tu propuesta de precio no se ha aceptado · ' || v_ref,
          'Puedes aceptar nuestro precio (' || euros_texto(new.importe_cliente) || ' + IVA) o cancelar sin coste.', v_enl, new.id);
      else
        perform crear_aviso('cliente', new.cliente_id, null, 'precio', 'ok', 'Ya tienes precio · ' || v_ref,
          euros_texto(new.importe_cliente) || ' + IVA. Revísalo y acéptalo antes de que caduque.', v_enl, new.id);
      end if;
    elsif new.estado_solicitud = 'contraoferta' then
      perform crear_aviso('dynamo', null, null, 'importe_contraoferta_cliente', 'aviso', 'Contraoferta del cliente · ' || v_ref,
        v_cli || ' propone ' || euros_texto(new.importe_contraoferta_cliente) || ' (le dimos ' || euros_texto(new.importe_cliente) || ').', v_enl, new.id);
    elsif new.estado_solicitud = 'aceptada' and o_sol = 'contraoferta' then
      perform crear_aviso('cliente', new.cliente_id, null, 'contraoferta_aceptada', 'ok', 'Aceptamos tu precio · ' || v_ref,
        'Tu envío queda confirmado a ' || euros_texto(new.importe_cliente) || ' + IVA.', v_enl, new.id);
    end if;
  end if;

  -- El cliente confirma su envío.
  if tg_op = 'UPDATE' and o_est = 'borrador' and new.estado = 'programado' and v_por_cliente then
    perform crear_aviso('dynamo', null, null, 'confirmado', 'info', 'Envío confirmado · ' || v_ref,
      v_cli || ' lo ha confirmado' || case when new.estado_pago_previo = 'pendiente' then ' (pendiente de pago).' else '.' end, v_enl, new.id);
  end if;

  -- Cambios pedidos por el cliente.
  if new.estado_cambio_cliente is distinct from o_cam then
    if new.estado_cambio_cliente = 'pendiente' then
      perform crear_aviso('dynamo', null, null, 'cambio', 'aviso', 'Cambio pedido · ' || v_ref, v_cli || ' pide un cambio en su envío.', v_enl, new.id);
    elsif new.estado_cambio_cliente in ('aceptado', 'rechazado') then
      perform crear_aviso('cliente', new.cliente_id, null, 'cambio_' || new.estado_cambio_cliente,
        case when new.estado_cambio_cliente = 'aceptado' then 'ok' else 'aviso' end,
        'Tu cambio ha sido ' || new.estado_cambio_cliente || ' · ' || v_ref, new.cambio_cliente_nota, v_enl, new.id);
    end if;
  end if;

  -- Pago por adelantado.
  if tg_op = 'UPDATE' and o_pago = 'pendiente' and new.estado_pago_previo = 'pagado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'pagado', 'ok', 'Pago recibido · ' || v_ref, 'Gracias. Ya buscamos camión para tu envío.', v_enl, new.id);
    if not v_dynamo then
      perform crear_aviso('dynamo', null, null, 'pagado', 'ok', 'Pago recibido · ' || v_ref,
        v_cli || ' ha pagado' || case when new.pago_metodo = 'stripe' then ' con tarjeta.' else '.' end || ' Ya se puede asignar.', v_enl, new.id);
    end if;
  elsif tg_op = 'UPDATE' and o_pago = 'pendiente' and new.estado_pago_previo = 'exento' then
    perform crear_aviso('cliente', new.cliente_id, null, 'exento', 'ok', 'Ya no hace falta pagar por adelantado · ' || v_ref, 'Lo pagarás a tu plazo habitual.', v_enl, new.id);
  end if;

  -- Transportista asignado.
  if tg_op = 'UPDATE' and new.transportista_id is not null and new.transportista_id is distinct from o_tr and new.estado <> 'cancelado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'asignado', 'ok', 'Tu envío ya tiene transportista · ' || v_ref, null, v_enl, new.id);
    perform crear_aviso('transportista', null, new.transportista_id, 'asignada', 'ok', 'Carga asignada · ' || v_ref,
      'Revisa los datos y la orden de carga.', v_enl, new.id);
  end if;

  -- En ruta, entregado, cancelado.
  if tg_op = 'UPDATE' and new.estado is distinct from o_est then
    if new.estado = 'en_ruta' then
      perform crear_aviso('cliente', new.cliente_id, null, 'en_ruta', 'info', 'Cargado y en ruta · ' || v_ref, null, v_enl, new.id);
    elsif new.estado = 'entregado' then
      perform crear_aviso('cliente', new.cliente_id, null, 'entregado', 'ok', 'Entregado · ' || v_ref, null, v_enl, new.id);
    elsif new.estado = 'cancelado' then
      if v_por_cliente then
        perform crear_aviso('dynamo', null, null, 'cancelado', case when o_tr is not null then 'urgente' else 'aviso' end,
          'Cancelado por el cliente · ' || v_ref,
          v_cli || ' lo ha cancelado' || case when o_tr is not null then '. Tenía camión: avisa al transportista.' else '.' end, v_enl, new.id);
      elsif auth.uid() is null and new.estado_pago_previo = 'pendiente' then
        -- Anulado por el sistema: pasó el plazo para pagar.
        perform crear_aviso('cliente', new.cliente_id, null, 'pago_caducado', 'aviso', 'Envío anulado: no recibimos el pago · ' || v_ref,
          'Pasó el plazo para pagar. Si aún lo necesitas, vuelve a pedirlo: el precio se recalcula.', '/panel/nuevo-envio?repetir=' || new.id, new.id);
        perform crear_aviso('dynamo', null, null, 'pago_caducado', 'info', 'Anulado por falta de pago · ' || v_ref,
          v_cli || ' no pagó a tiempo.', v_enl, new.id);
      elsif o_est <> 'borrador' then
        perform crear_aviso('cliente', new.cliente_id, null, 'cancelado', 'aviso', 'Envío cancelado · ' || v_ref,
          'Si no lo esperabas, llámanos al ' || tel_dynamo() || '.', v_enl, new.id);
      end if;
      if o_tr is not null then
        perform crear_aviso('transportista', null, o_tr, 'cancelada', 'urgente', 'Carga cancelada · ' || v_ref,
          'No vayas a cargar. Si tienes dudas, llámanos al ' || tel_dynamo() || '.', null, new.id);
      end if;
    end if;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_avisos_firmas_cmr()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e record;
begin
  if new.rol <> 'destinatario' then return null; end if;
  select id, referencia_gx, cliente_id into e from envios where id = new.envio_id;
  perform crear_aviso('cliente', e.cliente_id, null, 'cmr_entrega', 'ok', 'CMR firmado en la entrega · #' || coalesce(e.referencia_gx, ''),
    'Firmado por ' || new.nombre || ' el ' || fecha_hora_texto(new.firmado_en) || '.', '/panel/envios?ver=' || e.id, e.id);
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_avisos_penalizaciones()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e record; v_tipo text;
begin
  if not (new.estado = 'confirmada' and old.estado is distinct from 'confirmada') then return null; end if;
  select id, referencia_gx, cliente_id, transportista_id into e from envios where id = new.envio_id;
  select nombre into v_tipo from tipos_penalizacion where id = new.tipo_id;
  if coalesce(new.importe_cliente, 0) > 0 then
    perform crear_aviso('cliente', e.cliente_id, null, 'penalizacion', 'aviso', 'Penalización · #' || coalesce(e.referencia_gx, ''),
      coalesce(v_tipo, 'Penalización') || ': ' || euros_texto(new.importe_cliente) || ' + IVA. Puedes verla y alegar en Penalizaciones.', '/panel/penalizaciones', e.id);
  end if;
  if coalesce(new.importe_transportista, 0) > 0 and e.transportista_id is not null then
    perform crear_aviso('transportista', null, e.transportista_id, 'penalizacion', 'aviso', 'Penalización · #' || coalesce(e.referencia_gx, ''),
      coalesce(v_tipo, 'Penalización') || ': ' || euros_texto(new.importe_transportista) || '. Puedes verla y alegar en Penalizaciones.', '/panel/penalizaciones', e.id);
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_avisos_reservas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ref text; v_tr text; v_enl text := '/panel/envios?ver=' || new.envio_id;
begin
  if new.estado = old.estado then return null; end if;
  select '#' || coalesce(referencia_gx, '') into v_ref from envios where id = new.envio_id;
  select nombre_visible into v_tr from transportistas where id = new.transportista_id;
  v_tr := coalesce(v_tr, 'Un transportista');
  if old.estado = 'viva' and new.estado = 'pendiente_revision' then
    perform crear_aviso('dynamo', null, null, 'contraoferta_transportista', 'aviso', 'Contraoferta de transportista · ' || v_ref,
      v_tr || ' propone ' || euros_texto(new.precio_propuesto) || '.', v_enl, new.envio_id);
  elsif old.estado = 'viva' and new.estado = 'aceptada' then
    perform crear_aviso('dynamo', null, null, 'carga_aceptada', 'ok', 'Carga aceptada · ' || v_ref,
      v_tr || ' la acepta a ' || euros_texto(new.precio_aceptado) || '.', v_enl, new.envio_id);
  elsif old.estado = 'pendiente_revision' and new.estado = 'aceptada' then
    perform crear_aviso('transportista', null, new.transportista_id, 'contraoferta_aceptada', 'ok', 'Aceptamos tu precio · ' || v_ref,
      'La carga es tuya a ' || euros_texto(new.precio_aceptado) || '.', v_enl, new.envio_id);
  elsif old.estado = 'pendiente_revision' and new.estado = 'rechazada' then
    perform crear_aviso('transportista', null, new.transportista_id, 'contraoferta_rechazada', 'aviso', 'Tu contraoferta no ha salido · ' || v_ref,
      case when new.motivo_cierre is not null then upper(left(new.motivo_cierre, 1)) || substr(new.motivo_cierre, 2) || '.' end, null, new.envio_id);
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_avisos_usuarios()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.estado <> 'suspendida' and new.estado = 'suspendida'
     and coalesce(current_setting('dynamo.autosusp', true), '') = 'on' then
    perform crear_aviso('dynamo', null, null, 'suspendida', 'aviso', 'Cuenta suspendida automáticamente',
      coalesce(new.nombre, new.email) || ' (' || new.email || ')' || coalesce(': ' || rtrim(new.suspension_motivo, '.'), '') || '.', '/panel/usuarios', null);
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_documentos_max_transportista()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.transportista_id is not null and new.envio_id is null and not new.borrado
     and (select count(*) from documentos
           where transportista_id = new.transportista_id and envio_id is null
             and not borrado and id <> new.id) >= 5 then
    raise exception 'Máximo 5 documentos en la ficha del transportista.';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_aa_fecha_lejana()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_max int := parametro_num('envio_antelacion_max_dias', 120)::int;
begin
  if new.fecha_carga_desde is not null and v_max > 0
     and new.fecha_carga_desde > (now() at time zone 'Europe/Madrid')::date + v_max
     and (tg_op = 'INSERT' or new.fecha_carga_desde is distinct from old.fecha_carga_desde)
     and not es_servidor() and not es_equipo_dynamo() then
    raise exception 'Como mucho se puede programar con % días de antelación. Para más, llámanos al %.', v_max, tel_dynamo() using errcode = '22023';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_operador_del_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.operador_id is not null and not exists (
       select 1 from operadores where id = new.operador_id and cliente_id = new.cliente_id) then
    raise exception 'Ese transportista no está entre los transportistas propios de este cliente.';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_penalizacion_cancelacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_fecha date;
begin
  -- Se cancela...
  if new.estado = 'cancelado' and old.estado <> 'cancelado' then
    v_fecha := coalesce(new.fecha_carga_desde, new.fecha_carga_real);
    -- ...con camión asignado, fuera de plazo, y es un envío de Dynamo (no manual).
    if old.transportista_id is not null and new.operador_id is null
       and v_fecha is not null and now() >= corte_cancelacion(v_fecha) then
      insert into penalizaciones (envio_id, tipo_id, descripcion,
                                  importe_cliente, importe_transportista, generada_auto)
      values (new.id, (select id from tipos_penalizacion where clave = 'cancelacion'),
              'Cancelación después de las 9:00 del día hábil anterior a la carga.',
              new.importe_cliente, new.importe_transportista, true);
    end if;
  end if;

  -- Se deshace la cancelación: la automática SIN tocar se retira (queda como cancelada,
  -- no se borra: sigue el rastro).
  if old.estado = 'cancelado' and new.estado <> 'cancelado' then
    update penalizaciones set estado = 'cancelada'
     where envio_id = new.id and generada_auto and not editada_a_mano
       and estado = 'pendiente_confirmar';
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_vehiculos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cam tipo_vehiculo; v_rem tipo_vehiculo;
begin
  if new.vehiculo_camion_id is not null then
    select tipo into v_cam from vehiculos where id = new.vehiculo_camion_id;
    if v_cam = 'remolque' then
      raise exception 'Has puesto un remolque como camión.';
    end if;
    if v_cam = 'rigido'
       and (new.vehiculo_remolque_id is not null
            or nullif(trim(new.matricula_remolque), '') is not null) then
      raise exception 'Un camión rígido no lleva remolque.';
    end if;
  end if;
  if new.vehiculo_remolque_id is not null then
    select tipo into v_rem from vehiculos where id = new.vehiculo_remolque_id;
    if v_rem <> 'remolque' then
      raise exception 'En el remolque solo puede ir un remolque.';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_ofertas_no_manual()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if exists (select 1 from envios where id = new.envio_id and operador_id is not null) then
    raise exception 'Es un envío manual del cliente: Dynamo no lo oferta.';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_paradas_restriccion_al_anadir()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_estado estado_envio;
  v_r      record;
  v_carga  tipo_carga;
  v_manual boolean;
begin
  select estado, tipo_carga, operador_id is not null
    into v_estado, v_carga, v_manual from envios where id = new.envio_id;

  if v_estado is null or v_estado in ('borrador', 'entregado', 'cancelado') or v_manual then
    return new;   -- borrador: se mira al confirmar · terminados: historia · manual: no es de Dynamo
  end if;

  for v_r in
    select * from restriccion_punto(new.pais_codigo_iso, new.codigo_postal, new.tipo, v_carga)
  loop
    if v_r.efecto = 'bloquea'
       or (v_r.efecto = 'solo_admin' and not es_equipo_dynamo()) then
      raise exception 'No se puede añadir esta parada (% en %): %',
        new.tipo, coalesce(new.nombre_empresa, new.poblacion, new.codigo_postal, '?'), v_r.mensaje;
    end if;
  end loop;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_proteger_ultimo_admin()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.rol = 'admin'
     and (new.rol <> 'admin' or new.estado <> 'activa')
     and not exists (
       select 1 from usuarios
       where rol = 'admin' and estado = 'activa' and id <> old.id
     )
  then
    raise exception
      'No se puede degradar ni suspender al único Admin Master activo (%). Nombra antes otro Admin Master.',
      old.email;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_proteger_ultimo_admin_baja()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.rol = 'admin' and old.estado = 'activa'
     and not exists (
       select 1 from usuarios
       where rol = 'admin' and estado = 'activa' and id <> old.id
     )
  then
    raise exception 'No se puede borrar al único Admin Master activo (%).', old.email;
  end if;
  return old;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_reservas_negociacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_base numeric; v_precio numeric; v_motivo text;
begin
  if old.estado <> 'viva' or new.estado not in ('pendiente_revision', 'aceptada') then return new; end if;
  v_precio := case when new.estado = 'aceptada' then new.precio_aceptado else new.precio_propuesto end;
  if new.oferta_id is not null then select precio_ofertado into v_base from envio_ofertas where id = new.oferta_id; end if;
  if v_base is null then select importe_transportista into v_base from envios where id = new.envio_id; end if;
  if v_precio is null or v_base is null or v_precio = v_base then return new; end if;
  v_motivo := negociacion_bloqueada(new.envio_id, new.transportista_id);
  if v_motivo is not null then
    raise exception 'Ahora no se puede negociar el precio de esta carga: %', lower(left(v_motivo, 1)) || substr(v_motivo, 2) using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_reservas_no_manual()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if exists (select 1 from envios where id = new.envio_id and operador_id is not null) then
    raise exception 'Es un envío manual del cliente: no se reserva.';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_sitio_horarios_sin_solapes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from sitio_horarios h
              where h.sitio_id = new.sitio_id and h.temporada = new.temporada and h.dia_semana = new.dia_semana
                and h.id <> new.id and h.abre < new.cierra and new.abre < h.cierra) then
    raise exception 'Hay dos tramos del mismo día que se pisan.' using errcode = '23P01';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.guia_automatizaciones()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (ve_todo() or es_servidor()) then raise exception 'Solo Dynamo.' using errcode = '42501'; end if;
  return $guia$
GUÍA PARA AUTOMATIZACIONES (n8n, agentes de IA) — Plataforma Dynamo

1. CÓMO ENTRAR
   · Un usuario de Dynamo propio para las automatizaciones (p. ej. «Automatizaciones n8n», rol «Empleado gestor» = empleado; si solo
     lee, «Empleado lectura» = empleado_lectura). n8n inicia sesión con su email y contraseña (Supabase Auth) y llama a la API con ese token: se
     aplican las mismas reglas que en la web y la auditoría dice quién lo hizo.
   · La clave de servicio (service_role) se salta las reglas por fila: solo para tareas de sistema (p. ej. el webhook de
     Stripe → pago_envio_stripe) y nunca en un flujo que hable con terceros. Esas funciones de servidor NO salen en
     funciones_api(); su descripción se lee en el editor de Supabase. Las funciones de Dynamo comprueban «usuario de
     Dynamo»: con la clave de servicio responden «Solo Dynamo»; para ellas, el usuario propio.
   · Credenciales guardadas en n8n, nunca a la vista en los flujos.

2. LLAMAR A UNA FUNCIÓN
   · POST /rest/v1/rpc/<funcion> con los argumentos en JSON por su NOMBRE (p_envio, p_estado…). Los que tienen valor por
     defecto se pueden omitir. Lista completa: POST /rest/v1/rpc/funciones_api (o select * from funciones_api();).
   · Las que devuelven TABLE responden una lista (aunque sea de una fila).

3. ¿HA IDO BIEN? (regla para todas)
   · Error HTTP (4xx/5xx) = no se ha hecho nada. El campo «message» viene en castellano y se puede enseñar.
       - code 42501 → sin permiso (usuario equivocado o rol sin acceso). No reintentar.
       - code 55000 → plataforma en modo mantenimiento. Reintentar más tarde.
       - code PGRST202 → nombre de función o de argumento mal escrito.
       - code 23505 (repetido), 23514 (valor fuera de lo permitido), 23503 (referencia que no existe) → lo dice Postgres, en
         inglés: mirar «code» y el nombre de la restricción en «details»; no enseñar «message» tal cual.
       - el resto → la regla del negocio que falla va en «message» (p. ej. «Ese transportista está suspendido»).
   · Respuesta correcta con {resultado: …}: mirar «resultado». Las funciones nuevas traen además {ok: true|false}.
     Los códigos posibles de cada una están en su descripción.
   · Respuesta vacía (void) sin error = hecho.

4. ESCRIBIR: CON FUNCIONES O DIRECTO EN LA TABLA
   · Con FUNCIÓN siempre que exista (aplican previo pago, cobertura, revisión del precio, festivos, plazos…):
     crear un envío de Dynamo → crear_envio · poner precio a una solicitud de un cliente → proponer_precio_solicitud ·
     ofertar a un transportista → ofertar_envio · retirar una oferta → revocar_oferta · asignar o quitar transportista →
     asignar_transportista / quitar_transportista · cambiar la fase → marcar_estado_envio · cancelar → cancelar_envio ·
     revisar el precio de un envío lejano → revisar_precio_envio · marcar una transferencia → marcar_pago_envio ·
     horario de un sitio → guardar_horario / horario_del_dia · ¿hay cobertura? → comprobar_cobertura.
     (crear_solicitud_envio es la petición de un CLIENTE: con el usuario de Dynamo se usa crear_envio.)
   · DIRECTO en la tabla (las reglas las ponen la seguridad por filas y los disparadores): incidencias, penalizaciones,
     almacenamientos, documentos, transportistas, operadores, clientes, sitios y contactos. Al cambiar a mano el precio
     del cliente de un envío (envios.importe_cliente), poner también precio_fijado_a_mano = true.
   · Las columnas «automático» del diccionario las pone la base de datos: no se escriben nunca.

5. LEER
   · Qué significa cada dato: select * from diccionario_datos() where tabla = 'envios';
   · Envíos vistos por el cliente o el transportista: mis_envios(), mis_viajes() (sin datos de la otra parte).

6. GLOSARIO Y CONVENCIONES
   · Envío = el transporte que pide el cliente. En las pantallas del transportista se llama «carga» (antes de aceptarla:
     enlaces /carga, funciones *_carga_publica) y «viaje» (después). Es el mismo registro de envios.
   · Sitio = dirección de recogida o entrega de la agenda (tabla sitios). Polo logístico (futuro) = ciudad de referencia
     del tarifador.
   · Importes en euros SIN IVA salvo que la descripción diga otra cosa (IVA aparte: iva_pct / clientes.iva_pct).
   · date = día (hora de Madrid); timestamptz = instante, en ISO 8601 con zona. Columnas *_en = instante.
   · Países en ISO de 2 letras (ES, PT, FR…). Códigos postales como texto (conservan el 0 inicial).
   · Referencia del envío (envios.referencia_gx): la pone la base de datos, GX + número, +7 entre una y la siguiente (la
     primera, GX100888689). Es la «referencia_gx_carga» de las hojas de n8n.
   · Los valores de cada lista cerrada (estados, tipos…) están en el diccionario, columna «lista».
   · Nunca se borra el histórico: los envíos se cancelan, no se borran.

7. DATOS PERSONALES
   · Teléfonos, DNI, emails y firmas son datos personales (RGPD): no enviarlos a servicios externos (IA incluida) si no
     hace falta para la tarea, y nunca a una bolsa de cargas pública.
$guia$;
end $function$;

CREATE OR REPLACE FUNCTION public.marcar_mi_viaje(p_envio uuid, p_estado text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_actual estado_envio; v_orden text[] := array['programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado'];
begin
  if not envio_del_transportista(p_envio) then raise exception 'Ese viaje no es tuyo.' using errcode = '42501'; end if;
  select estado into v_actual from envios where id = p_envio for update;
  if p_estado not in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado') then raise exception 'Estado no válido.'; end if;
  if v_actual::text = p_estado then return; end if;
  -- No se puede dar por cargado ni entregado antes del día de carga.
  if p_estado in ('en_ruta', 'entregado')
     and (select fecha_carga_desde from envios where id = p_envio) > (now() at time zone 'Europe/Madrid')::date then
    raise exception 'Todavía no es el día de carga: no se puede marcar en ruta ni entregado.';
  end if;
  if array_position(v_orden, v_actual::text) is null or array_position(v_orden, p_estado) < array_position(v_orden, v_actual::text) then
    raise exception 'El viaje está % y no puede volver atrás. Si te has equivocado, llámanos al %.', replace(v_actual::text, '_', ' '), tel_dynamo();
  end if;
  update envios set estado = p_estado::estado_envio,
                    fecha_carga_real = case when p_estado in ('en_ruta', 'entregado') then coalesce(fecha_carga_real, (now() at time zone 'Europe/Madrid')::date) else fecha_carga_real end
   where id = p_envio;
end $function$;

CREATE OR REPLACE FUNCTION public.ofertar_envio(p_envio uuid, p_transportista uuid, p_canal text, p_precio numeric, p_banda_pct smallint DEFAULT 10, p_pronto_pago boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_estado estado_envio; v_asig estado_asignacion; v_pp boolean;
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    raise exception 'Solo Dynamo puede ofertar cargas.' using errcode = '42501';
  end if;
  select estado, estado_asignacion into v_estado, v_asig
    from envios where id = p_envio for update;
  if v_estado is null then raise exception 'Ese envío no existe.'; end if;
  if v_estado <> 'programado' then
    raise exception 'Solo se ofertan envíos programados (este está %).', replace(v_estado::text, '_', ' ');
  end if;
  if v_asig = 'confirmada' then
    raise exception 'El envío ya tiene transportista asignado.';
  end if;
  if p_transportista is not null and exists (
       select 1 from transportistas where id = p_transportista
       and estado_operativo <> 'activo') then
    raise exception 'Ese transportista no está activo para ofertar.';
  end if;

  v_pp := p_pronto_pago and coalesce(
            (select pronto_pago from transportistas where id = p_transportista), true);

  insert into envio_ofertas (envio_id, transportista_id, canal, precio_ofertado,
                             banda_pct, pronto_pago, caduca_en)
  values (p_envio, p_transportista, p_canal, p_precio, p_banda_pct, v_pp,
          now() + make_interval(days => (parametro('oferta_dias_caducidad'))::int))
  returning id into v_id;

  perform set_config('dynamo.primera_oferta', 'on', true);
  update envios set estado_asignacion = case when estado_asignacion = 'sin_asignar'
                                             then 'ofertada'::estado_asignacion
                                             else estado_asignacion end
   where id = p_envio;
  perform set_config('dynamo.primera_oferta', '', true);

  perform registrar_hito(p_envio, 'ofertado', null, v_id,
    jsonb_build_object('transportista_id', p_transportista, 'canal', p_canal,
                       'precio', p_precio, 'banda_pct', p_banda_pct, 'pronto_pago', v_pp));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.pago_previo_motivo(p_cliente uuid, p_envio uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c record; n_prev int;
begin
  if not coalesce((parametro('pago_previo_activo') #>> '{}')::boolean, false) then return null; end if;
  select riesgo_efectivo_euros, exento_pago_previo_primer_envio into c from clientes where id = p_cliente;
  if not found then return null; end if;
  if coalesce(c.riesgo_efectivo_euros, 0) <= 0 then
    return case when c.riesgo_efectivo_euros is null then 'Sin crédito: empresa sin clasificar por CESCE'
                else 'Sin crédito: CESCE autoriza 0,00 €' end;
  end if;
  if not c.exento_pago_previo_primer_envio then
    select count(*) into n_prev from envios
     where cliente_id = p_cliente and id is distinct from p_envio and not coalesce(es_manual, false)
       and estado not in ('borrador', 'cancelado')
       and estado_pago_previo <> 'pendiente';   -- un envío sin pagar no cuenta como envío hecho
    if n_prev < parametro_num('pago_previo_primeros_envios', 1) then
      return case when n_prev = 0 then 'Primer envío del cliente' else format('Uno de los %s primeros envíos del cliente', parametro_num('pago_previo_primeros_envios', 1)) end;
    end if;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.parametro(p_clave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  select valor into v from parametros where clave = p_clave;
  if not found then
    raise exception 'Falta el parámetro "%" en la tabla parametros.', p_clave;
  end if;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.regenerar_pin_parada(p_parada uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pin text; v_envio uuid;
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    raise exception 'Solo Dynamo gestiona los PIN.' using errcode = '42501';
  end if;
  select envio_id into v_envio from envio_paradas where id = p_parada;
  if v_envio is null then raise exception 'Esa parada no existe.'; end if;
  if exists (select 1 from envio_parada_pines where parada_id = p_parada
             and validado_en is not null) then
    raise exception 'Ese punto ya está validado: no se regenera su PIN.';
  end if;
  v_pin := pin_aleatorio((parametro('pin_cifras'))::int);
  insert into envio_parada_pines (parada_id, envio_id, pin)
  values (p_parada, v_envio, v_pin)
  on conflict (parada_id) do update
    set pin = excluded.pin, intentos_fallidos = 0, bloqueado = false,
        exigido = true, enviado_en = null, enviado_a = null;
  return v_pin;
end $function$;

CREATE OR REPLACE FUNCTION public.registrar_cambio_email(p_usuario uuid, p_antes text, p_despues text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not es_admin_master() then raise exception 'Solo el Admin Master cambia el email de una cuenta.' using errcode = '42501'; end if;
  if not exists (select 1 from usuarios where id = p_usuario and lower(email) = lower(trim(p_despues))) then
    raise exception 'Ese cambio de email no ha ocurrido.';
  end if;
  insert into auditoria (tabla, registro_id, accion, quien, quien_email, quien_origen, cambios)
  values ('usuarios', p_usuario::text, 'modificacion', auth.uid(),
          (select email from usuarios where id = auth.uid()), 'app',
          jsonb_build_object('email', jsonb_build_object('antes', lower(trim(p_antes)), 'despues', lower(trim(p_despues))),
                             'motivo', 'Cambio de email desde Usuarios (Admin Master)'));
end $function$;

CREATE OR REPLACE FUNCTION public.revisar_precios_programados()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare r record; n int := 0; v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  if not (es_servidor() or es_consola_supabase() or es_equipo_dynamo()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  perform set_config('dynamo.revision_precio', 'on', true);
  for r in select e.id, e.referencia_gx, e.fecha_carga_desde, c.nombre_visible
             from envios e join clientes c on c.id = e.cliente_id
            where e.estado = 'programado' and e.estado_revision_precio = 'pendiente' and e.fecha_revision_precio <= v_hoy
            for update of e skip locked loop
    update envios set estado_revision_precio = 'revisar' where id = r.id;
    perform crear_aviso('dynamo', null, null, 'requiere_revision_precio', 'aviso', 'Toca revisar el precio · #' || coalesce(r.referencia_gx, ''),
      coalesce(r.nombre_visible, 'Cliente') || ' · carga el ' || fecha_texto(r.fecha_carga_desde) || '. Pon el precio definitivo en la ficha.', '/panel/envios?ver=' || r.id, r.id);
    n := n + 1;
  end loop;
  for r in select e.id, e.referencia_gx, c.nombre_visible
             from envios e join clientes c on c.id = e.cliente_id
            where e.estado = 'programado' and e.estado_revision_precio = 'esperando_cliente' and not e.revision_precio_recordada
              and e.revision_precio_en < now() - make_interval(hours => parametro_num('precio_revision_respuesta_horas', 24)::int)
            for update of e skip locked loop
    update envios set revision_precio_recordada = true where id = r.id;
    perform crear_aviso('dynamo', null, null, 'precio_sin_respuesta', 'urgente', 'No contesta a la subida de precio · #' || coalesce(r.referencia_gx, ''),
      coalesce(r.nombre_visible, 'Cliente') || ' no ha aceptado ni cancelado. Llámale.', '/panel/envios?ver=' || r.id, r.id);
    n := n + 1;
  end loop;
  perform set_config('dynamo.revision_precio', 'off', true);
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.validar_pin_manual(p_parada uuid, p_nota text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k record; par record;
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    raise exception 'Solo Dynamo valida un PIN a mano.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_nota, ''))) < 5 then
    raise exception 'Hay que explicar por qué se valida a mano (quién llamó y motivo).';
  end if;
  select * into k from envio_parada_pines where parada_id = p_parada for update;
  if not found then return jsonb_build_object('resultado','no_exige_pin'); end if;
  if k.validado_en is not null then
    return jsonb_build_object('resultado','ya_validado','validado_en', k.validado_en);
  end if;
  select * into par from envio_paradas where id = p_parada;

  update envio_parada_pines set validado_en = now(), validado_modo = 'manual_dynamo',
         validado_por = auth.uid(), validado_nota = trim(p_nota)
   where parada_id = p_parada;
  update envio_paradas set realizado_en = coalesce(realizado_en, now()) where id = p_parada;

  perform registrar_hito(k.envio_id, 'pin_validado_manual', p_parada, null,
    jsonb_build_object('orden', par.orden, 'tipo', par.tipo, 'nota', trim(p_nota),
                       'estaba_bloqueado', k.bloqueado));
  perform registrar_hito(k.envio_id, 'incidencia', p_parada, null,
    jsonb_build_object('motivo', 'PIN validado a mano por Dynamo', 'nota', trim(p_nota),
                       'orden', par.orden));
  return jsonb_build_object('resultado','validado_manual','ahora', now());
end $function$;

CREATE OR REPLACE FUNCTION public.validar_restricciones_envio(p_envio uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_gx text;
  v_r  record;
begin
  select referencia_gx into v_gx from envios where id = p_envio;

  for v_r in select * from restricciones_ruta(p_envio) loop
    if v_r.efecto = 'bloquea'
       or (v_r.efecto = 'solo_admin' and not es_equipo_dynamo()) then
      raise exception 'Envío %, parada % (% en %): %',
        v_gx, v_r.orden, v_r.tipo, v_r.punto, v_r.mensaje;
    end if;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.validar_ruta_envio(p_envio uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare v_total int; v_primera text; v_ultima text; v_gx text;
begin
  select count(*) into v_total from envio_paradas where envio_id = p_envio;
  select referencia_gx into v_gx from envios where id = p_envio;

  if v_total < 2 then
    raise exception 'El envío % necesita al menos 2 paradas (una carga y una descarga); tiene %.',
      v_gx, v_total;
  end if;

  select tipo into v_primera from envio_paradas where envio_id = p_envio order by orden asc  limit 1;
  select tipo into v_ultima  from envio_paradas where envio_id = p_envio order by orden desc limit 1;

  if v_primera <> 'carga' then
    raise exception 'La primera parada del envío % tiene que ser una CARGA (es %).', v_gx, v_primera;
  end if;
  if v_ultima <> 'descarga' then
    raise exception 'La última parada del envío % tiene que ser una DESCARGA (es %).', v_gx, v_ultima;
  end if;
end $function$;

-- ---- Descripciones: «orden de carga» y «plataforma elevadora» (decisiones del usuario) ----
comment on column public.clientes.requiere_plataforma_elevadora_defecto is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | opcional | Si sus envíos llevarían por defecto camión con plataforma elevadora (plataforma elevadora). Hoy ninguna pantalla lo rellena ni lo usa.';
comment on column public.envios.requiere_plataforma_elevadora is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | obligatorio | Necesita camión rígido con plataforma elevadora (plataforma elevadora). En la bolsa sale como Rígido; sin ella, Trailer.';
comment on column public.sitios.tiene_medios_carga is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | opcional | Hay medios de carga/descarga (muelle, carretilla…). Por defecto sí. Si es no, hace falta camión con plataforma elevadora.';
comment on column public.operadores.razon_social is 'formato: texto | rango: no puede estar vacío | lista: no aplica | obligatorio | Nombre fiscal o comercial del transportista del cliente. Sale en su orden de carga y en el CMR del envío manual. Ej. OK: Transportes Ejemplo e Hijos S.L. · Ej. mal: (vacío)';
comment on column public.operadores.url_logo is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Sin uso: el logo para la orden de carga se sube como documento (tabla documentos, tipo logo, con operador_id).';
comment on column public.envios.precio_acordado_operador is 'formato: número decimal (2 decimales) | rango: >= 0; solo si operador_id tiene valor | lista: no aplica | opcional | Solo envíos manuales: lo que el cliente pactó con SU transportista, en euros sin IVA. Opcional. Sale en su orden de carga. Ej. OK: 600.00';
comment on column public.documentos.operador_id is 'formato: uuid | → operadores.id | rango: no aplica | lista: no aplica | opcional | Operador al que pertenece (→ operadores.id): su logo, que sale en la orden de carga.';

-- ---- CIF/NIF y matrículas: siempre guardados igual -------------------------------------
create or replace function fn_normalizar_cif()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.cif is not null then new.cif := nullif(normalizar_id_fiscal(new.cif), ''); end if;
  return new;
end $$;
comment on function public.fn_normalizar_cif() is '[Disparadores] Guarda el CIF/NIF en mayúsculas y sin espacios, puntos ni guiones («B-12.345.678» → «B12345678»). Quién: disparador de clientes, transportistas y operadores.';
revoke execute on function fn_normalizar_cif() from public, anon, authenticated;
drop trigger if exists tg_clientes_normalizar_cif on clientes;
create trigger tg_clientes_normalizar_cif before insert or update of cif on clientes for each row execute function fn_normalizar_cif();
drop trigger if exists tg_transportistas_normalizar_cif on transportistas;
create trigger tg_transportistas_normalizar_cif before insert or update of cif on transportistas for each row execute function fn_normalizar_cif();
drop trigger if exists tg_operadores_normalizar_cif on operadores;
create trigger tg_operadores_normalizar_cif before insert or update of cif on operadores for each row execute function fn_normalizar_cif();

create or replace function fn_vehiculos_normalizar_matricula()
returns trigger language plpgsql set search_path = public as $$
begin
  new.matricula := normalizar_matricula(new.matricula);
  return new;
end $$;
comment on function public.fn_vehiculos_normalizar_matricula() is '[Disparadores] Guarda la matrícula en mayúsculas y sin espacios ni guiones («1234 abc» → «1234ABC»), igual que en los envíos. Quién: disparador de vehiculos.';
revoke execute on function fn_vehiculos_normalizar_matricula() from public, anon, authenticated;
drop trigger if exists tg_vehiculos_normalizar_matricula on vehiculos;
create trigger tg_vehiculos_normalizar_matricula before insert or update of matricula on vehiculos for each row execute function fn_vehiculos_normalizar_matricula();

-- Los ya guardados con otro formato se igualan (solo el formato; el dato es el mismo).
update clientes set cif = cif where cif is distinct from nullif(normalizar_id_fiscal(cif), '');
update transportistas set cif = cif where cif is distinct from nullif(normalizar_id_fiscal(cif), '');
update operadores set cif = cif where cif is distinct from nullif(normalizar_id_fiscal(cif), '');
update vehiculos set matricula = matricula where matricula is distinct from normalizar_matricula(matricula);
