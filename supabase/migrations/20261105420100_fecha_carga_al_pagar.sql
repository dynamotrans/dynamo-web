-- =====================================================================================
-- FECHA DE CARGA AL PAGAR (usuario, 2026-11-05)
-- Un envío pendiente de pago no tiene su fecha de carga «activa» hasta que se paga: si el
-- pago llega cuando ya no da tiempo a cargar en la fecha elegida, la carga pasa al primer
-- día posible desde el momento del pago, con las mismas reglas que el tarifador (siguiente
-- día hábil si se paga antes de la hora de corte; si no, el siguiente) y con el MISMO tipo
-- de fecha que se eligió y se pagó: fecha fija sigue siendo un día; una ventana, los mismos
-- días hábiles. La entrega estimada se mueve lo mismo. Queda un hito y se avisa al cliente.
-- Igual cuando Dynamo lo pasa sin pago previo («exento»).
-- Después, el cliente puede cambiar la fecha (pedir_cambio_envio) pero sin cambiar el tipo
-- de fecha, en día hábil y no antes del primer día posible.
-- Horas de corte en Parámetros (antes fijas en la web): fecha fija 12:00, ventana 14:00.
-- =====================================================================================

insert into public.parametros (clave, valor, descripcion) values
  ('primer_dia_corte_fija_hora', '12', 'Hora de corte (Madrid) para cargar el siguiente día hábil con fecha fija: pedido o pagado antes, carga el siguiente día hábil; después, el otro.'),
  ('primer_dia_corte_ventana_hora', '14', 'Hora de corte (Madrid) para empezar la ventana de carga el siguiente día hábil: pedido o pagado antes, empieza el siguiente día hábil; después, el otro.')
on conflict (clave) do nothing;

-- ---- Ayudantes de fechas ---------------------------------------------------------------
create or replace function public.sumar_dias_habiles(p_fecha date, p_n integer)
 returns date language plpgsql stable security definer set search_path to 'public'
as $function$
declare d date := p_fecha; n int := 0;
begin
  while n < greatest(coalesce(p_n, 0), 0) loop
    d := d + 1;
    if es_dia_habil(d) then n := n + 1; end if;
  end loop;
  return d;
end $function$;
revoke all on function public.sumar_dias_habiles(date, integer) from public, anon;
grant execute on function public.sumar_dias_habiles(date, integer) to authenticated, service_role;
comment on function public.sumar_dias_habiles(date, integer) is '[Calendario y festivos] Fecha que queda N días hábiles (España, sin fines de semana ni festivos) después de una fecha dada. Quién: cualquier usuario con sesión. Argumentos: p_fecha: fecha de partida · p_n: número de días hábiles hacia delante (0 = la misma fecha).';

create or replace function public.dias_ventana_carga(p_desde date, p_hasta date)
 returns integer language sql stable security definer set search_path to 'public'
as $function$
  select greatest(1, (select count(*)::int from generate_series(p_desde, coalesce(p_hasta, p_desde), interval '1 day') g
                       where es_dia_habil(g::date)))
$function$;
revoke all on function public.dias_ventana_carga(date, date) from public, anon;
grant execute on function public.dias_ventana_carga(date, date) to authenticated, service_role;
comment on function public.dias_ventana_carga(date, date) is '[Calendario y festivos] Días hábiles de una ventana de carga (1 = fecha fija). Es el tipo de fecha que eligió y pagó el cliente. Quién: cualquier usuario con sesión. Argumentos: p_desde, p_hasta: fechas de carga (sin p_hasta = un día).';

create or replace function public.primera_fecha_carga(p_fija boolean, p_instante timestamp with time zone default now())
 returns date language plpgsql stable security definer set search_path to 'public'
as $function$
declare l timestamp := p_instante at time zone 'Europe/Madrid';
        corte numeric := case when p_fija then parametro_num('primer_dia_corte_fija_hora', 12) else parametro_num('primer_dia_corte_ventana_hora', 14) end;
begin
  return sumar_dias_habiles(l::date, case when extract(hour from l) + extract(minute from l) / 60.0 < corte then 1 else 2 end);
end $function$;
revoke all on function public.primera_fecha_carga(boolean, timestamp with time zone) from public, anon;
grant execute on function public.primera_fecha_carga(boolean, timestamp with time zone) to authenticated, service_role;
comment on function public.primera_fecha_carga(boolean, timestamp with time zone) is '[Calendario y festivos] Primer día en que se puede cargar si se pide (o se paga) en un instante: el siguiente día hábil si es antes de la hora de corte (primer_dia_corte_fija_hora o primer_dia_corte_ventana_hora, hora de Madrid); si no, el siguiente. Las mismas reglas que el tarifador. Quién: cualquier usuario con sesión. Argumentos: p_fija: true = fecha fija, false = ventana · p_instante: cuándo (por defecto, ahora).';

create or replace function public.ventana_texto(p_desde date, p_hasta date)
 returns text language sql stable set search_path to 'public'
as $function$
  select case when p_desde is null then null
              when coalesce(p_hasta, p_desde) <= p_desde then fecha_texto(p_desde)
              else 'del ' || fecha_texto(p_desde) || ' al ' || fecha_texto(p_hasta) end
$function$;
revoke all on function public.ventana_texto(date, date) from public, anon;
grant execute on function public.ventana_texto(date, date) to authenticated, service_role;
comment on function public.ventana_texto(date, date) is '[Ayudantes internos] Fechas de carga en texto: «Vie 10/07/26» o «del Lun 09/11/26 al Mié 11/11/26». Quién: cualquiera con sesión. Argumentos: p_desde, p_hasta: fechas.';

-- ---- Al pagar (o pasar sin pago previo): la carga, al primer día posible -------------------
create or replace function public.fn_envios_a0_fecha_al_pagar()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_fija boolean; v_primer date; v_n int; v_salto int;
begin
  if new.estado <> 'programado' or new.fecha_carga_desde is null or new.operador_id is not null then return new; end if;
  v_fija := coalesce(new.fecha_carga_hasta, new.fecha_carga_desde) <= new.fecha_carga_desde;
  v_primer := primera_fecha_carga(v_fija, now());
  if new.fecha_carga_desde >= v_primer then return new; end if;   -- aún da tiempo: no se toca
  v_n := dias_ventana_carga(new.fecha_carga_desde, new.fecha_carga_hasta);
  select count(*) into v_salto from generate_series(new.fecha_carga_desde + 1, v_primer, interval '1 day') g where es_dia_habil(g::date);
  new.fecha_carga_desde := v_primer;
  new.fecha_carga_hasta := sumar_dias_habiles(v_primer, v_n - 1);
  if new.fecha_entrega_estimada is not null then
    new.fecha_entrega_estimada := greatest(sumar_dias_habiles(new.fecha_entrega_estimada, v_salto), new.fecha_carga_hasta);
  end if;
  perform registrar_hito(new.id, 'fecha_carga_movida', null, null,
    jsonb_build_object('antes_desde', old.fecha_carga_desde, 'antes_hasta', old.fecha_carga_hasta,
                       'desde', new.fecha_carga_desde, 'hasta', new.fecha_carga_hasta,
                       'motivo', case when new.estado_pago_previo = 'exento' then 'Pasado sin pago previo cuando ya no daba tiempo' else 'Pago recibido cuando ya no daba tiempo' end),
    case when es_servidor() then 'servidor' else 'app' end);
  return new;
end $function$;
revoke all on function public.fn_envios_a0_fecha_al_pagar() from public, anon, authenticated;
comment on function public.fn_envios_a0_fecha_al_pagar() is '[Disparadores] Al recibir el pago previo (o pasarlo sin pago previo), si ya no da tiempo a cargar en la fecha elegida, la mueve al primer día posible (primera_fecha_carga) con el mismo tipo de fecha (fija o los mismos días hábiles de ventana) y mueve igual la entrega estimada. Deja el hito fecha_carga_movida.';
create trigger tg_envios_a0_fecha_al_pagar before update on public.envios
  for each row when (old.estado_pago_previo = 'pendiente' and new.estado_pago_previo in ('pagado', 'exento'))
  execute function public.fn_envios_a0_fecha_al_pagar();


-- ---- Funciones que cambian (mismo nombre, argumentos y permisos) ------------------------
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
    perform crear_aviso('cliente', new.cliente_id, null, 'pagado', 'ok', 'Pago recibido · ' || v_ref, 'Gracias. Ya buscamos camión para tu envío.' || case when new.fecha_carga_desde is distinct from old.fecha_carga_desde
        then ' El pago llegó cuando ya no daba tiempo a cargar en la fecha elegida, así que la carga pasa al primer día posible: ' || ventana_texto(new.fecha_carga_desde, new.fecha_carga_hasta) || '.' else '' end, v_enl, new.id);
    if not v_dynamo then
      perform crear_aviso('dynamo', null, null, 'pagado', 'ok', 'Pago recibido · ' || v_ref,
        v_cli || ' ha pagado' || case when new.pago_metodo = 'stripe' then ' con tarjeta.' else '.' end || ' Ya se puede asignar.' || case when new.fecha_carga_desde is distinct from old.fecha_carga_desde
        then ' Pagó tarde: la carga pasa a ' || ventana_texto(new.fecha_carga_desde, new.fecha_carga_hasta) || '.' else '' end, v_enl, new.id);
    end if;
  elsif tg_op = 'UPDATE' and o_pago = 'pendiente' and new.estado_pago_previo = 'exento' then
    perform crear_aviso('cliente', new.cliente_id, null, 'exento', 'ok', 'Ya no hace falta pagar por adelantado · ' || v_ref, 'Lo pagarás a tu plazo habitual.' || case when new.fecha_carga_desde is distinct from old.fecha_carga_desde
        then ' Como ya no daba tiempo a cargar en la fecha elegida, la carga pasa al primer día posible: ' || ventana_texto(new.fecha_carga_desde, new.fecha_carga_hasta) || '.' else '' end, v_enl, new.id);
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

CREATE OR REPLACE FUNCTION public.hito_visible_fuera(p tipo_hito)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select p in ('creado','confirmado','transportista_asignado','matricula_asignada',
               'cargado','entregado','cancelado','cancelacion_deshecha',
               'orden_carga_enviada','cmr_firmado','pin_validado',
               'pin_validado_manual','incidencia','fecha_carga_movida')
$function$;

CREATE OR REPLACE FUNCTION public.pedir_cambio_envio(p_envio uuid, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_detalle text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e envios%rowtype; v_det text := nullif(trim(coalesce(p_detalle, '')), ''); v_libre boolean; v_fechas boolean;
        v_n int; v_hasta date; v_primer date;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if coalesce(e.es_manual, false) then return jsonb_build_object('resultado', 'envio_manual'); end if;
  if e.estado <> 'programado' then return jsonb_build_object('resultado', 'no_modificable', 'estado', e.estado); end if;
  if e.estado_cambio_cliente = 'pendiente' then return jsonb_build_object('resultado', 'ya_pendiente'); end if;
  -- Se mantiene el tipo de fecha que se eligió (y se pagó): fecha fija = un día; ventana =
  -- los mismos días hábiles. Solo se elige el primer día; el último lo pone la base de datos.
  v_n := dias_ventana_carga(e.fecha_carga_desde, e.fecha_carga_hasta);
  if p_desde is not null then
    if not es_dia_habil(p_desde) then return jsonb_build_object('resultado', 'dia_no_habil'); end if;
    v_hasta := sumar_dias_habiles(p_desde, v_n - 1);
    if p_hasta is not null and p_hasta <> v_hasta then
      return jsonb_build_object('resultado', 'ventana_distinta', 'dias', v_n, 'hasta', v_hasta);
    end if;
    v_primer := primera_fecha_carga(v_n = 1);
    if p_desde < v_primer then return jsonb_build_object('resultado', 'antes_de_lo_posible', 'primera_fecha', v_primer); end if;
    if v_hasta > (now() at time zone 'Europe/Madrid')::date + 183 then return jsonb_build_object('resultado', 'fechas_no_validas'); end if;
  end if;
  v_fechas := p_desde is not null and (p_desde, v_hasta) is distinct from (e.fecha_carga_desde, coalesce(e.fecha_carga_hasta, e.fecha_carga_desde));
  if not v_fechas and v_det is null then return jsonb_build_object('resultado', 'sin_cambios'); end if;
  if length(coalesce(v_det, '')) > 1000 then return jsonb_build_object('resultado', 'detalle_largo'); end if;

  v_libre := not coalesce(envio_asignandose(p_envio), true);
  -- Con camión asignado o asignándose no se modifica desde la plataforma: hay que llamar.
  if not v_libre then return jsonb_build_object('resultado', 'con_camion'); end if;
  -- Pasada la hora límite para cancelar gratis, tampoco: hay que llamar.
  if e.fecha_carga_desde is not null and now() >= corte_cancelacion(e.fecha_carga_desde) then
    return jsonb_build_object('resultado', 'fuera_de_plazo');
  end if;
  perform set_config('dynamo.cambio_envio', 'on', true);
  if v_libre and v_det is null then
    -- Sin camión y solo fechas: se aplica ya.
    update envios set fecha_carga_desde = p_desde, fecha_carga_hasta = v_hasta,
                      cambio_cliente = jsonb_build_object('fecha_desde', p_desde, 'fecha_hasta', v_hasta,
                                                          'antes_desde', e.fecha_carga_desde, 'antes_hasta', e.fecha_carga_hasta),
                      cambio_cliente_en = now(), estado_cambio_cliente = 'aplicado', cambio_cliente_nota = null
     where id = p_envio;
    perform set_config('dynamo.cambio_envio', 'off', true);
    return jsonb_build_object('resultado', 'aplicado');
  end if;
  update envios set cambio_cliente = jsonb_build_object('fecha_desde', case when v_fechas then p_desde end,
                                                        'fecha_hasta', case when v_fechas then v_hasta end,
                                                        'detalle', v_det, 'con_camion', not v_libre),
                    cambio_cliente_en = now(), estado_cambio_cliente = 'pendiente', cambio_cliente_nota = null
   where id = p_envio;
  perform set_config('dynamo.cambio_envio', 'off', true);
  return jsonb_build_object('resultado', 'pendiente');
end $function$;

CREATE OR REPLACE FUNCTION public.reglas_precio_envio()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('antelacion_max_dias', parametro_num('envio_antelacion_max_dias', 120), 'cerrado_dias', parametro_num('precio_cerrado_dias', 7),
                            'revision_dias_habiles', parametro_num('precio_revision_dias_habiles', 3), 'margen_pct', parametro_num('precio_revision_margen_pct', 5),
                            'corte_fija_hora', parametro_num('primer_dia_corte_fija_hora', 12), 'corte_ventana_hora', parametro_num('primer_dia_corte_ventana_hora', 14))
$function$;

comment on function public.pedir_cambio_envio(p_envio uuid, p_desde date, p_hasta date, p_detalle text) is '[Envíos] El cliente pide cambiar un envío programado. Solo fechas y sin camión: se aplica al momento. Con texto de detalle: queda pendiente de Dynamo. Con camión asignándose o pasada la hora límite de cancelación, no se puede (hay que llamar). Las fechas mantienen el tipo que se eligió y se pagó (fecha fija = un día; ventana = los mismos días hábiles): se da el primer día, hábil y no antes de primera_fecha_carga(), y el último lo calcula la base de datos; como mucho a 183 días. Devuelve {resultado} (dia_no_habil, ventana_distinta {dias, hasta}, antes_de_lo_posible {primera_fecha}, fechas_no_validas, aplicado, pendiente…). Quién: cliente dueño del envío. Argumentos: p_envio: envios.id · p_desde: nuevo primer día de carga (opcional) · p_hasta: opcional; si se da, tiene que ser el último día que sale con la misma ventana · p_detalle: otros cambios en texto (máx. 1000).';
comment on function public.reglas_precio_envio() is '[Precio y pago] Reglas de precio y fechas para la pantalla de pedir envío (de los parámetros): antelación máxima en días, días con precio cerrado, días hábiles para revisar el precio, margen % de revisión y horas de corte para cargar el siguiente día hábil (fecha fija y ventana). Quién: cualquier usuario con sesión. Argumentos: sin argumentos.';
