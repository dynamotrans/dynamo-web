-- =====================================================================================
-- TEXTOS: «ENVÍO» PARA TODO Y DECISIONES DEL USUARIO (2026-11-05)
--   · «envío» también en lo que ve el transportista (avisos, errores, motivos de cierre):
--     ni «carga» ni «viaje» para el envío. Se quedan los del acto de cargar («hacia la
--     carga», «día de carga», «orden de carga», «bolsa de cargas»…). Los nombres internos
--     (enlaces /carga, *_carga_publica, mis_viajes) no cambian.
--   · Cancelado por no pagar a tiempo = «Anulado sin pago».
--   · El camión completo se nombra por el camión: tráiler completo o rígido completo.
--   · Horarios: «Lunes a jueves 8:00–14:00 y 15:00–17:30 · viernes 8:00–14:00».
--   · Clientes «Activo» (no «Validado»).
-- Solo cambian textos: las funciones se rehacen con su mismo nombre, argumentos y permisos.
-- El histórico (motivos ya guardados, hitos) no se toca.
-- otras_cargas_publicas devuelve además requiere_plataforma_elevadora, para poder decir
-- «Rígido completo» en el tablón del transportista.
-- Generada a partir de la base de datos.
-- =====================================================================================


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
            format('Alta online desde el enlace del envío %s el %s. Datos dados: %s %s, CIF %s, teléfono %s. '
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

CREATE OR REPLACE FUNCTION public.caducar_pagos_pendientes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0;
begin
  if not (es_servidor() or es_consola_supabase() or es_equipo_dynamo()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  for r in select id from envios
            where estado = 'programado' and estado_pago_previo = 'pendiente' and pago_pendiente_en is not null
              and transportista_id is null and stripe_cobro_sin_aplicar is null
              and now() > pago_limite(pago_pendiente_en) + interval '45 minutes'
            for update skip locked loop
    update envios set estado = 'cancelado' where id = r.id;
    perform registrar_hito(r.id, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', 'Anulado sin pago: no se recibió el pago a tiempo', 'por', 'sistema'), 'servidor');
    n := n + 1;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.cerrar_aceptacion(p_reserva uuid, p_transportista uuid, p_usuario uuid, p_precio numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; o record;
begin
  perform pg_advisory_xact_lock(hashtext('dynamo_pronto_pago'));   -- línea de pronto pago
  update envio_reservas set estado = 'aceptada', cerrada_en = now(),
         transportista_id = p_transportista, usuario_id = p_usuario,
         precio_aceptado = p_precio, motivo_cierre = 'aceptada'
   where id = p_reserva returning * into r;

  update envios set transportista_id = p_transportista,
                    importe_transportista = p_precio,
                    estado_asignacion = 'confirmada'
   where id = r.envio_id;

  -- Varias contraofertas a la vez (2026-11-04): al quedarse uno la carga, las demás que
  -- esperaban respuesta quedan rechazadas (cada una con su hito).
  for o in select id, oferta_id, precio_propuesto from envio_reservas
            where envio_id = r.envio_id and estado = 'pendiente_revision' and id <> p_reserva loop
    update envio_reservas set estado = 'rechazada', cerrada_en = now(), motivo_cierre = 'el envío se lo ha quedado otro transportista'
     where id = o.id;
    perform registrar_hito(r.envio_id, 'contraoferta_resuelta', null, o.oferta_id,
      jsonb_build_object('reserva_id', o.id, 'precio_propuesto', o.precio_propuesto, 'decision', 'rechazada_otra_aceptada'), 'sistema');
  end loop;
  update envio_ofertas set estado = 'aceptada' where id = r.oferta_id;
  update envio_ofertas set estado = 'cerrada'
   where envio_id = r.envio_id and estado = 'activa' and id is distinct from r.oferta_id;

  return jsonb_build_object('resultado','aceptada','envio_id', r.envio_id,
                            'precio', p_precio, 'ahora', now());
end $function$;

CREATE OR REPLACE FUNCTION public.datos_orden_publica(p_reserva uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r envio_reservas%rowtype;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'aceptada'
     or not exists (select 1 from envios e where e.id = r.envio_id and e.transportista_id = r.transportista_id) then
    raise exception 'Esa orden de carga no es tuya.' using errcode = '42501';
  end if;
  if not enlace_carga_vigente(r.envio_id) then
    raise exception 'Este envío ya ha terminado: la orden de carga ya no está disponible en este enlace.' using errcode = '42501';
  end if;
  return orden_carga_json(r.envio_id);
end $function$;

CREATE OR REPLACE FUNCTION public.datos_orden_transportista(p_envio uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not envio_del_transportista(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  return orden_carga_json(p_envio);
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
    perform crear_aviso('transportista', null, e.transportista_id, 'reactivada', 'urgente', 'Envío reactivado · #' || coalesce(e.referencia_gx, ''),
      'El envío que se canceló vuelve a estar en pie a tu nombre. Confírmalo con Dynamo: ' || tel_dynamo() || '.', '/panel/envios?ver=' || e.id, e.id);
  end if;
  return v_antes;
end $function$;

CREATE OR REPLACE FUNCTION public.enlace_cmr_publico(p_reserva uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r envio_reservas%rowtype; v_tok uuid; v_estado estado_envio;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'aceptada'
     or not exists (select 1 from envios e where e.id = r.envio_id and e.transportista_id = r.transportista_id) then
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  select estado into v_estado from envios where id = r.envio_id;
  if v_estado in ('cancelado', 'borrador') then raise exception 'Este envío no tiene CMR para firmar.'; end if;
  if v_estado = 'entregado' or not enlace_carga_vigente(r.envio_id) then raise exception 'Este envío ya ha terminado.' using errcode = '42501'; end if;
  select token into v_tok from cmr_enlaces where envio_id = r.envio_id and not revocado and caduca_en > now();
  if v_tok is null then
    update cmr_enlaces set revocado = true where envio_id = r.envio_id and not revocado;
    insert into cmr_enlaces (envio_id) values (r.envio_id) returning token into v_tok;
  end if;
  return v_tok;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_avisos_cuenta_activada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.estado = 'pendiente_verificacion' and new.estado = 'activa' then
    if new.cliente_id is not null then
      perform crear_aviso('cliente', new.cliente_id, null, 'cuenta_activada', 'ok', 'Cuenta activada',
        coalesce(new.nombre, new.email) || ' ya puede pedir envíos y ver los de la empresa. ¡Bienvenido a Dynamo!', '/panel/nuevo-envio', null);
    elsif new.transportista_id is not null then
      perform crear_aviso('transportista', null, new.transportista_id, 'cuenta_activada', 'ok', 'Cuenta activada',
        coalesce(new.nombre, new.email) || ' ya puede ver sus envíos en Dynamo.', '/panel/envios', null);
    end if;
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
    perform crear_aviso('transportista', null, new.transportista_id, 'asignada', 'ok', 'Envío asignado · ' || v_ref,
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
        perform crear_aviso('dynamo', null, null, 'pago_caducado', 'info', 'Anulado sin pago · ' || v_ref,
          v_cli || ' no pagó a tiempo.', v_enl, new.id);
      elsif o_est <> 'borrador' then
        perform crear_aviso('cliente', new.cliente_id, null, 'cancelado', 'aviso', 'Envío cancelado · ' || v_ref,
          'Si no lo esperabas, llámanos al ' || tel_dynamo() || '.', v_enl, new.id);
      end if;
      if o_tr is not null then
        perform crear_aviso('transportista', null, o_tr, 'cancelada', 'urgente', 'Envío cancelado · ' || v_ref,
          'No vayas a cargar. Si tienes dudas, llámanos al ' || tel_dynamo() || '.', null, new.id);
      end if;
    end if;
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
    perform crear_aviso('dynamo', null, null, 'carga_aceptada', 'ok', 'Envío aceptado · ' || v_ref,
      v_tr || ' la acepta a ' || euros_texto(new.precio_aceptado) || '.', v_enl, new.envio_id);
  elsif old.estado = 'pendiente_revision' and new.estado = 'aceptada' then
    perform crear_aviso('transportista', null, new.transportista_id, 'contraoferta_aceptada', 'ok', 'Aceptamos tu precio · ' || v_ref,
      'El envío es tuyo a ' || euros_texto(new.precio_aceptado) || '.', v_enl, new.envio_id);
  elsif old.estado = 'pendiente_revision' and new.estado = 'rechazada' then
    perform crear_aviso('transportista', null, new.transportista_id, 'contraoferta_rechazada', 'aviso', 'Tu contraoferta no ha salido · ' || v_ref,
      case when new.motivo_cierre is not null then upper(left(new.motivo_cierre, 1)) || substr(new.motivo_cierre, 2) || '.' end, null, new.envio_id);
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_ac_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t record;
begin
  if new.transportista_id is not null and new.transportista_id is distinct from old.transportista_id then
    select estado_operativo, nima into t from transportistas where id = new.transportista_id;
    if t.estado_operativo = 'suspendido' and not es_consola_supabase() then
      raise exception 'Ese transportista está suspendido: no se le pueden dar envíos.';
    end if;
    new.estado_asignacion := 'confirmada';
    -- El NIMA es el del transportista nuevo (salvo que quien asigna ponga otro).
    if new.transportista_nima is not distinct from old.transportista_nima then new.transportista_nima := t.nima; end if;
  elsif new.transportista_id is null and old.transportista_id is not null then
    -- Sin transportista no quedan su camión, su conductor ni su precio.
    new.matricula_camion := null; new.matricula_remolque := null; new.conductor_nombre := null; new.conductor_telefono := null;
    new.vehiculo_camion_id := null; new.vehiculo_remolque_id := null; new.conductor_id := null;
    new.transportista_nima := null; new.importe_transportista := null;
    if new.estado_asignacion = 'confirmada' then
      new.estado_asignacion := case when exists (select 1 from envio_ofertas o where o.envio_id = new.id and o.estado = 'activa' and o.caduca_en > now())
                                    then 'ofertada' else 'sin_asignar' end;
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_cancelado_rechaza_reservas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.estado = 'cancelado' and old.estado <> 'cancelado' then
    update envio_reservas set estado = 'rechazada', cerrada_en = now(), motivo_cierre = 'el envío se ha cancelado'
     where envio_id = new.id and estado = 'pendiente_revision';
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_envios_rechaza_contraofertas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.transportista_id is not null and new.transportista_id is distinct from old.transportista_id then
    update envio_reservas set estado = 'rechazada', cerrada_en = now(), motivo_cierre = 'el envío se lo ha quedado otro transportista'
     where envio_id = new.id and estado = 'pendiente_revision' and transportista_id is distinct from new.transportista_id;
  end if;
  return null;
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
    raise exception 'Ahora no se puede negociar el precio de este envío: %', lower(left(v_motivo, 1)) || substr(v_motivo, 2) using errcode = '42501';
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
   · Envío = el transporte que pide el cliente. En todas las pantallas se llama «envío», también para el transportista
     (2026-11-05). Algunos nombres internos aún dicen carga o viaje (enlaces /carga, funciones
     *_carga_publica, mis_viajes): son el mismo registro de envios.
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

CREATE OR REPLACE FUNCTION public.horario_texto(p_sitio uuid, p_temporada text DEFAULT 'general'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  dias text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  dia int; t text; prev text := null; desde int := null; hasta int := null;
  partes text[] := '{}';
begin
  for dia in 1..8 loop
    if dia <= 7 then
      select string_agg(to_char(abre, 'FMHH24:MI') || '–' || to_char(cierra, 'FMHH24:MI'), ' y ' order by abre)
        into t from sitio_horarios where sitio_id = p_sitio and temporada = p_temporada and dia_semana = dia;
    else
      t := '#fin';
    end if;
    if t is distinct from prev then
      if prev is not null then
        partes := partes || (dias[desde] || case when hasta = desde + 1 then ' y ' || dias[hasta] when hasta > desde then ' a ' || dias[hasta] else '' end || ' ' || prev);
      end if;
      prev := t; desde := dia;
    end if;
    hasta := dia;
  end loop;
  t := nullif(array_to_string(partes, ' · '), '');
  return upper(left(t, 1)) || substr(t, 2);
end $function$;

CREATE OR REPLACE FUNCTION public.marcar_mi_viaje(p_envio uuid, p_estado text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_actual estado_envio; v_orden text[] := array['programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado'];
begin
  if not envio_del_transportista(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select estado into v_actual from envios where id = p_envio for update;
  if p_estado not in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado') then raise exception 'Estado no válido.'; end if;
  if v_actual::text = p_estado then return; end if;
  -- No se puede dar por cargado ni entregado antes del día de carga.
  if p_estado in ('en_ruta', 'entregado')
     and (select fecha_carga_desde from envios where id = p_envio) > (now() at time zone 'Europe/Madrid')::date then
    raise exception 'Todavía no es el día de carga: no se puede marcar en ruta ni entregado.';
  end if;
  if array_position(v_orden, v_actual::text) is null or array_position(v_orden, p_estado) < array_position(v_orden, v_actual::text) then
    raise exception 'El envío está % y no puede volver atrás. Si te has equivocado, llámanos al %.', replace(v_actual::text, '_', ' '), tel_dynamo();
  end if;
  update envios set estado = p_estado::estado_envio,
                    fecha_carga_real = case when p_estado in ('en_ruta', 'entregado') then coalesce(fecha_carga_real, (now() at time zone 'Europe/Madrid')::date) else fecha_carga_real end
   where id = p_envio;
end $function$;

CREATE OR REPLACE FUNCTION public.negociacion_bloqueada(p_envio uuid, p_transportista uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e record; m numeric; n int;
begin
  if not coalesce((parametro('contraoferta_transportista_activa') #>> '{}')::boolean, false) then
    return 'La negociación está apagada.';
  end if;
  select creado_en, publicado_en_bolsa_en, fecha_carga_desde into e from envios where id = p_envio;
  if not found then return 'El envío no existe.'; end if;
  m := parametro_num('negociacion_min_creada_min', 0);
  if m > 0 and e.creado_en > now() - make_interval(mins => m::int) then
    return format('El envío lleva menos de %s minutos creado.', m);
  end if;
  m := parametro_num('negociacion_min_bolsa_min', 0);
  if m > 0 and e.publicado_en_bolsa_en is not null and e.publicado_en_bolsa_en > now() - make_interval(mins => m::int) then
    return format('El envío lleva menos de %s minutos en la bolsa.', m);
  end if;
  m := parametro_num('negociacion_max_horas_carga', 0);
  if m > 0 and e.fecha_carga_desde is not null
     and (e.fecha_carga_desde::timestamp at time zone 'Europe/Madrid') > now() + make_interval(hours => m::int) then
    return format('Faltan más de %s horas para cargar.', m);
  end if;
  if p_transportista is not null then
    m := parametro_num('negociacion_min_cargas_hechas', 0);
    if m > 0 then
      select count(*) into n from envios where transportista_id = p_transportista and estado = 'entregado';
      if n < m then return format('Para negociar hay que haber hecho al menos %s envíos con Dynamo.', m); end if;
    end if;
    if coalesce((parametro('negociacion_una_por_carga') #>> '{}')::boolean, false)
       and exists (select 1 from envio_reservas where envio_id = p_envio and transportista_id = p_transportista
                    and precio_propuesto is not null and estado in ('rechazada', 'pendiente_revision', 'aceptada')) then
      return 'Ya hiciste una contraoferta para este envío.';
    end if;
  end if;
  return null;
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
    raise exception 'Solo Dynamo puede ofertar envíos.' using errcode = '42501';
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

CREATE OR REPLACE FUNCTION public.orden_carga_json(p_envio uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e envios%rowtype; t transportistas%rowtype; c record;
begin
  select * into e from envios where id = p_envio;
  if e.operador_id is not null or e.estado in ('borrador', 'cancelado') then raise exception 'Este envío no tiene orden de carga.'; end if;
  select * into t from transportistas where id = e.transportista_id;
  select x.nombre, x.telefono, x.email into c from contactos x where x.transportista_id = t.id
   order by (x.funcion = 'trafico') desc, x.es_principal desc limit 1;
  return jsonb_build_object(
    'envio', jsonb_build_object(
      'id', e.id, 'referencia_gx', e.referencia_gx, 'referencia_cliente', e.referencia_cliente, 'estado', e.estado,
      'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta, 'fecha_carga_real', e.fecha_carga_real,
      'fecha_entrega_estimada', e.fecha_entrega_estimada, 'descripcion_mercancia', e.descripcion_mercancia,
      'toneladas', e.toneladas, 'metros_lineales', e.metros_lineales, 'tipo_carga', e.tipo_carga, 'paletizado', e.paletizado,
      'num_bultos', e.num_bultos, 'embalaje', e.embalaje, 'volumen_m3', e.volumen_m3,
      'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera, 'carga_techo', e.carga_techo,
      'requiere_plataforma_elevadora', e.requiere_plataforma_elevadora, 'requiere_nima', e.requiere_nima, 'adr', e.adr,
      'discrecion_comercial', e.discrecion_comercial, 'importe_transportista', e.importe_transportista,
      'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
      'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono,
      'transportista_nima', e.transportista_nima, 'plazo_pago_transportista', t.plazo_pago_dias, 'es_manual', false),
    'porteador', jsonb_build_object(
      'nombre', coalesce(t.nombre_visible, t.razon_social), 'razon_social', t.razon_social, 'cif', t.cif, 'codigo', t.codigo,
      'direccion', t.direccion, 'codigo_postal', t.codigo_postal, 'poblacion', t.poblacion, 'provincia', t.provincia,
      'pais_codigo_iso', t.pais_codigo_iso, 'telefono', c.telefono, 'email', c.email, 'contacto', c.nombre),
    'paradas', paradas_viaje_json(e.id),
    'pronto_pago', coalesce((select r.pronto_pago from envio_reservas r where r.envio_id = e.id and r.transportista_id = t.id
                              and r.estado = 'aceptada' order by r.cerrada_en desc limit 1), false),
    'parametros', (select jsonb_object_agg(clave, valor) from parametros
                    where clave in ('pronto_pago_pct', 'pronto_pago_minimo', 'pronto_pago_dias', 'plazo_pago_transportista_dias')),
    'dynamo', datos_dynamo()
  );
end $function$;

CREATE OR REPLACE FUNCTION public.otras_cargas_publicas(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t record;
begin
  select * into t from oferta_de_token(p_token);
  if t.envio_id is null then return '[]'::jsonb; end if;
  -- Solo con el enlace de una carga reciente (no vale cualquier enlace antiguo).
  if not exists (select 1 from envios where id = t.envio_id
                  and coalesce(fecha_carga_hasta, fecha_carga_desde, creado_en::date) >= (now() at time zone 'Europe/Madrid')::date - parametro_num('tablon_enlace_dias', 14)::int) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(x order by x->>'fecha_carga_desde', x->>'referencia')
      from (
        select jsonb_build_object(
          'token', e.token_publico, 'referencia', e.referencia_gx,
          'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
          'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas, 'tipo_carga', e.tipo_carga, 'requiere_plataforma_elevadora', e.requiere_plataforma_elevadora,
          'precio', e.importe_transportista,
          'origen',  (select jsonb_build_object('codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia, 'pais', p.pais_codigo_iso)
                        from envio_paradas p where p.envio_id = e.id order by p.orden limit 1),
          'destino', (select jsonb_build_object('codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia, 'pais', p.pais_codigo_iso)
                        from envio_paradas p where p.envio_id = e.id order by p.orden desc limit 1)) as x
          from envios e
         where e.id <> t.envio_id
           and e.publicado_en_bolsa_en is not null
           and e.estado = 'programado' and e.estado_asignacion is distinct from 'confirmada' and e.transportista_id is null
           and e.importe_transportista is not null
           and coalesce(e.fecha_carga_hasta, e.fecha_carga_desde) >= (now() at time zone 'Europe/Madrid')::date
           and not exists (select 1 from envio_reservas r where r.envio_id = e.id
                            and r.estado = 'viva' and r.hasta > now())
         order by e.fecha_carga_desde, e.referencia_gx
         limit 12) s), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.poner_datos_cmr(p_envio uuid, p_bultos integer, p_embalaje text, p_volumen numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_estado estado_envio;
begin
  select estado into v_estado from envios where id = p_envio;
  if not found then raise exception 'Ese envío no existe.'; end if;
  if es_equipo_dynamo() then
    if v_estado = 'cancelado' then raise exception 'El envío está cancelado.'; end if;
  elsif envio_del_cliente(p_envio) then
    if v_estado not in ('borrador', 'programado', 'hacia_la_carga') then
      raise exception 'El envío ya ha empezado: para cambiar estos datos, llama a Dynamo.';
    end if;
    if exists (select 1 from firmas_cmr f where f.envio_id = p_envio) then
      raise exception 'El CMR ya tiene firmas: estos datos ya no se cambian.';
    end if;
  else
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  update envios set num_bultos = p_bultos, embalaje = nullif(trim(p_embalaje), ''), volumen_m3 = p_volumen
   where id = p_envio;
end $function$;

CREATE OR REPLACE FUNCTION public.resolver_contraoferta(p_reserva uuid, p_acepta boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    raise exception 'Solo Dynamo resuelve contraofertas.' using errcode = '42501';
  end if;
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'pendiente_revision' then
    return jsonb_build_object('resultado','no_hay_contraoferta_pendiente');
  end if;
  perform 1 from envios where id = r.envio_id for update;
  -- Con el envío bloqueado, la reserva otra vez y bloqueada: si mientras tanto otra persona
  -- (o la caducidad) la ha cerrado, ya no se resuelve.
  select * into r from envio_reservas where id = p_reserva for update;
  if r.estado <> 'pendiente_revision' then
    return jsonb_build_object('resultado','no_hay_contraoferta_pendiente');
  end if;
  -- Envío cancelado o ya en marcha: la contraoferta ya no tiene sentido.
  if p_acepta and exists (select 1 from envios where id = r.envio_id and estado <> 'programado') then
    update envio_reservas set estado = 'rechazada', cerrada_en = now(), motivo_cierre = 'el envío ya no está disponible' where id = p_reserva;
    return jsonb_build_object('resultado', 'no_disponible');
  end if;
  -- Si mientras tanto la carga se la ha quedado otro, esta ya no se puede aprobar.
  if p_acepta and exists (select 1 from envios where id = r.envio_id and (transportista_id is not null or estado_asignacion = 'confirmada')) then
    update envio_reservas set estado = 'rechazada', cerrada_en = now(), motivo_cierre = 'el envío se lo ha quedado otro transportista' where id = p_reserva;
    return jsonb_build_object('resultado', 'tomada');
  end if;

  perform registrar_hito(r.envio_id, 'contraoferta_resuelta', null, r.oferta_id,
    jsonb_build_object('reserva_id', p_reserva, 'precio_propuesto', r.precio_propuesto,
                       'decision', case when p_acepta then 'aprobada' else 'rechazada' end));
  if p_acepta then
    return cerrar_aceptacion(p_reserva, r.transportista_id, r.usuario_id, r.precio_propuesto);
  end if;

  update envio_reservas set estado = 'rechazada', cerrada_en = now(),
         motivo_cierre = 'contraoferta rechazada' where id = p_reserva;
  perform caducar_reservas(r.envio_id);     -- devuelve el envío a 'ofertada'
  return jsonb_build_object('resultado','rechazada');
end $function$;

-- ---- Restricciones de servicio: «camión completo», no «carga completa» --------------
update public.restricciones_servicio
   set mensaje = replace(mensaje, 'solo hacemos camión completo, no grupaje. Cambia el envío a carga completa o escríbenos.',
                                  'solo hacemos camión completo (tráiler o rígido), no grupaje. Cambia el tipo de carga a camión completo o escríbenos.')
 where mensaje like '%Cambia el envío a carga completa%';

-- ---- Resúmenes de horario de los sitios con el formato nuevo -------------------------
update public.sitios s
   set horarios = horario_texto(s.id, 'general'), horarios_verano = horario_texto(s.id, 'verano')
 where (s.horarios, s.horarios_verano) is distinct from (horario_texto(s.id, 'general'), horario_texto(s.id, 'verano'));

-- ---- Diccionario ---------------------------------------------------------------------
comment on column public.sitios.horarios is 'formato: texto | rango: no aplica | lista: no aplica | automático | Resumen legible del horario general, sacado de sitio_horarios. Lo escribe la base de datos: lo que se escriba a mano se sustituye. Ej. OK: Lunes a jueves 8:00–14:00 y 15:00–17:30 · viernes 8:00–14:00';
comment on column public.sitios.horarios_verano is 'formato: texto | rango: no aplica | lista: no aplica | automático | Resumen legible del horario de verano, sacado de sitio_horarios. Lo escribe la base de datos. Ej. OK: Lunes a viernes 7:30–15:00';
comment on column public.clientes.estado is 'formato: lista cerrada (estado_cuenta) | rango: no aplica | lista: activa, suspendida, pendiente_verificacion | opcional | Estado de la empresa en su ficha (activa = «Activo», pendiente_verificacion = «Pendiente», suspendida = «Suspendido»). Es una etiqueta para Dynamo: quién puede entrar lo decide el estado de cada usuario.';
comment on column public.envios.metros_lineales is 'formato: número decimal (2 decimales) | rango: mayor que 0, 2 decimales | lista: no aplica | opcional | Metros lineales de camión que ocupa la carga. Con 13,30 o más es camión completo (tráiler; con plataforma elevadora, rígido). Ej. OK: 13.60 · Ej. mal: -2';
