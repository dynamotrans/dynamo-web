-- =====================================================================================
-- PLAZO ÚNICO PARA PAGAR Y «HE HECHO LA TRANSFERENCIA» (usuario, 2026-11-19)
-- =====================================================================================
-- «Plazo único de pago, sea el envío con margen o inminente: las horas que pongamos (1, 2
-- o las que sean). Con tarjeta es inmediato; y por transferencia inmediata, que es gratis
-- y tarda segundos, el cliente pulsa "he tramitado el pago, solicito revisión": me llega
-- el aviso, el contador se para y ya depende de mí; no se anula aunque pasen horas. Yo, en
-- Proformas, veo ese estado, miro el banco y, si está, confirmo con el banco como hasta
-- ahora; si no, rechazo —pago no recibido— y se anula el envío.»
--
-- 1 · pago_limite(): SIEMPRE el momento en que queda pendiente más pago_previo_horas. Deja
--     de valer «hasta las 9:00 del día hábil anterior a la carga» (regla del 9-nov) y ya
--     no salta fines de semana: tarjeta y transferencia inmediata funcionan todos los días.
-- 2 · envios.pago_avisado_en: cuándo dijo el cliente que ya hizo la transferencia. Desde
--     ese momento el plazo no corre (pagos_envio deja de dar hora límite) y la anulación
--     automática no lo toca.
-- 3 · avisar_pago_transferencia(): el botón del cliente (o Dynamo en su nombre). Avisa a
--     Dynamo en la campana y manda el email (con su copia a Dynamo, como todos).
-- 4 · rechazar_pago_transferencia(): Dynamo no encuentra el cobro → el envío se anula
--     («Anulado sin pago») y el cliente recibe el aviso de volver a pedirlo.
-- 5 · La anulación automática pasa a revisarse cada 5 minutos, con 10 de cortesía (antes
--     cada 15 con 45): con plazos de una o dos horas, 45 minutos era casi otro plazo.
-- =====================================================================================

alter table public.envios add column if not exists pago_avisado_en timestamptz;
comment on column public.envios.pago_avisado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo avisó el cliente de que ya hizo la transferencia de un envío pendiente de pago (avisar_pago_transferencia). Desde entonces el plazo para pagar no corre y el envío no se anula solo: Dynamo comprueba el banco y lo da por pagado o lo rechaza. Se vacía si el envío vuelve a quedar pendiente de pago.';

-- Si un envío VUELVE a quedar pendiente de pago, el aviso anterior ya no vale.
create or replace function public.fn_envios_pago_avisado_limpia()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.estado_pago_previo = 'pendiente' and old.estado_pago_previo is distinct from 'pendiente' then
    new.pago_avisado_en := null;
  end if;
  return new;
end $function$;
comment on function public.fn_envios_pago_avisado_limpia() is '[Precio y pago] Disparador: al volver un envío a pendiente de pago se borra el aviso de transferencia anterior (pago_avisado_en), para que el plazo vuelva a correr. Quién: uso interno (disparador de envios).';
drop trigger if exists tg_envios_pago_avisado_limpia on public.envios;
create trigger tg_envios_pago_avisado_limpia before update of estado_pago_previo on public.envios
  for each row execute function public.fn_envios_pago_avisado_limpia();

-- ---- 1 · El plazo: siempre las horas del parámetro ------------------------------------
create or replace function public.pago_limite(p_desde timestamp with time zone, p_carga date default null)
 returns timestamp with time zone
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  -- p_carga ya no cuenta (se conserva para quien la sigue pasando).
  select p_desde + make_interval(mins => round(greatest(parametro_num('pago_previo_horas', 24), 0) * 60)::int)
$function$;
comment on function public.pago_limite(timestamp with time zone, date) is '[Precio y pago] Hora límite para pagar un envío con pago previo: el instante en que queda pendiente más las horas del parámetro pago_previo_horas, igual para cualquier envío (tenga la carga lejos o cerca; fines de semana incluidos). Quién: cualquier usuario con sesión. Argumentos: p_desde: desde cuándo está pendiente el pago · p_carga: ya no se usa (se conserva por compatibilidad).';

update public.parametros
   set descripcion = 'Horas para pagar un envío pendiente de pago (tarjeta o transferencia inmediata), contadas desde que queda pendiente; el mismo plazo para todos los envíos. Pasado el plazo se anula solo, salvo que el cliente haya avisado de que ya hizo la transferencia: entonces el plazo se para hasta que Dynamo la valida o la rechaza.'
 where clave = 'pago_previo_horas';

-- ---- 2 · pagos_envio: con el aviso de transferencia, y sin hora límite si lo hay ------
drop function if exists public.pagos_envio(uuid);
create function public.pagos_envio(p_envio uuid default null)
 returns table(envio_id uuid, referencia_gx text, referencia_cliente text, estado text, estado_pago_previo text, pago_motivo text, pago_metodo text, pagado_en timestamp with time zone, base numeric, iva numeric, total numeric, pago_limite timestamp with time zone, precio_provisional boolean, a_cuenta numeric, pendiente numeric, pago_avisado_en timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select e.id, e.referencia_gx, e.referencia_cliente, e.estado::text, e.estado_pago_previo, e.pago_motivo, e.pago_metodo, e.pagado_en, i.base, i.iva, i.total,
         -- El resto de un envío ya pagado en parte no tiene hora límite: no se anula solo.
         -- Y con la transferencia ya avisada el plazo tampoco corre: depende de Dynamo.
         case when e.estado_pago_previo = 'pendiente' and e.pago_pendiente_en is not null and coalesce(e.pago_a_cuenta, 0) = 0
                   and e.pago_avisado_en is null
              then pago_limite(e.pago_pendiente_en, e.fecha_carga_desde) end,
         precio_por_revisar(e.estado_revision_precio),
         coalesce(e.pago_a_cuenta, 0),
         case when e.estado_pago_previo = 'pendiente' then greatest(i.total - coalesce(e.pago_a_cuenta, 0), 0) else 0 end,
         case when e.estado_pago_previo = 'pendiente' then e.pago_avisado_en end
    from envios e cross join lateral pago_envio_importes(e.id) i
   where e.estado_pago_previo <> 'no_requerido'
     and (p_envio is null or e.id = p_envio)
     and (ve_todo() or e.cliente_id = cliente_del_usuario())
$function$;
revoke all on function public.pagos_envio(uuid) from public, anon;
grant execute on function public.pagos_envio(uuid) to authenticated, service_role;
comment on function public.pagos_envio(uuid) is '[Precio y pago] Envíos que requieren pago previo con su situación: estado del pago, motivo, método, cuándo se pagó, base, IVA y total en euros, hora límite para pagar (vacía si el cliente ya avisó de su transferencia: el plazo no corre), si el precio es provisional, lo ya pagado a cuenta (cuando el precio subió al modificar un envío pagado), lo que falta por pagar ahora y cuándo avisó el cliente de que hizo la transferencia. Quién: Dynamo (todos) y el cliente (los suyos). Argumentos: p_envio: envios.id, o vacío para todos.';

-- ---- 5 · La anulación automática: no toca los avisados; 10 minutos de cortesía --------
create or replace function public.caducar_pagos_pendientes()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r record; n int := 0;
begin
  if not (es_servidor() or es_consola_supabase() or es_equipo_dynamo()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  for r in select id from envios
            where estado = 'programado' and estado_pago_previo = 'pendiente' and pago_pendiente_en is not null
              and transportista_id is null and stripe_cobro_sin_aplicar is null and coalesce(pago_a_cuenta, 0) = 0
              and pago_avisado_en is null   -- transferencia avisada: lo decide Dynamo
              and now() > pago_limite(pago_pendiente_en, fecha_carga_desde) + interval '10 minutes'
            for update skip locked loop
    update envios set estado = 'cancelado' where id = r.id;
    perform registrar_hito(r.id, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', 'Anulado sin pago: no se recibió el pago a tiempo', 'por', 'sistema'), 'servidor');
    n := n + 1;
  end loop;
  return n;
end $function$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('dynamo-pagos-caducados', '*/5 * * * *', 'select public.caducar_pagos_pendientes()');
    exception when others then
      raise notice 'No se pudo reprogramar la caducidad de pagos (%).', sqlerrm;
    end;
  end if;
end $$;

-- ---- Emails nuevos -------------------------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'emails_enviados_tipo_check' and conrelid = 'public.emails_enviados'::regclass;
  if v_def is null then raise exception 'No existe emails_enviados_tipo_check'; end if;
  if position('''pago_avisado''' in v_def) = 0 then
    v_def := replace(v_def, '''documento_disponible''::text', '''documento_disponible''::text, ''pago_avisado''::text');
    if position('''pago_avisado''' in v_def) = 0 then raise exception 'No se ha podido añadir pago_avisado a emails_enviados_tipo_check'; end if;
    alter table public.emails_enviados drop constraint emails_enviados_tipo_check;
    execute 'alter table public.emails_enviados add constraint emails_enviados_tipo_check ' || v_def;
  end if;
end $$;

-- ---- 3 · El cliente avisa de que ya ha hecho la transferencia -------------------------
create or replace function public.avisar_pago_transferencia(p_envio uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare e record; v_ref text; v_cli text;
begin
  select id, cliente_id, referencia_gx, estado, estado_pago_previo, pago_avisado_en, es_manual, estado_revision_precio
    into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  -- Solo el cliente dueño del envío, o Dynamo en su nombre (se lo dicen por teléfono).
  if not (es_equipo_dynamo() or (cliente_del_usuario() is not null and e.cliente_id = cliente_del_usuario())) then
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  if es_equipo_dynamo() and es_solo_lectura() then raise exception 'Tu usuario es de solo lectura.' using errcode = '42501'; end if;
  if e.estado <> 'programado' or e.estado_pago_previo <> 'pendiente' or coalesce(e.es_manual, false) then
    return jsonb_build_object('resultado', 'no_pendiente');
  end if;
  if coalesce(precio_por_revisar(e.estado_revision_precio), false) then return jsonb_build_object('resultado', 'precio_provisional'); end if;
  if e.pago_avisado_en is not null then return jsonb_build_object('resultado', 'ya_avisado', 'avisado_en', e.pago_avisado_en); end if;

  update envios set pago_avisado_en = now() where id = p_envio;
  v_ref := '#' || e.referencia_gx;
  select nombre_visible into v_cli from clientes where id = e.cliente_id;
  perform crear_aviso('dynamo', null, null, 'pago_avisado', 'urgente', 'Transferencia avisada: valida el cobro · ' || v_ref,
    coalesce(v_cli, 'El cliente') || ' dice que ya ha hecho la transferencia (PRO-' || e.referencia_gx || '). Mira el banco y márcala como recibida, o recházala si no ha llegado. El plazo para pagar está parado.',
    '/panel/envios?ver=' || p_envio, p_envio);
  perform crear_aviso('cliente', e.cliente_id, null, 'pago_avisado', 'info', 'Estamos validando tu transferencia · ' || v_ref,
    'Hemos recibido tu aviso. El plazo para pagar queda parado mientras comprobamos el cobro.', '/panel/envios?ver=' || p_envio, p_envio);
  perform fn_email_envio_cliente(p_envio, 'pago_avisado:' || p_envio || ':' || extract(epoch from now())::bigint, 'pago_avisado', 'Transferencia avisada: la estamos validando',
    '<p>Hemos recibido tu aviso de que ya has hecho la <strong>transferencia</strong> de este envío (concepto <strong>PRO-' || e.referencia_gx || '</strong>).</p>'
    || '<p><strong>El plazo para pagar queda parado</strong>: el envío no se anula mientras comprobamos el cobro en el banco. En cuanto lo validemos pasa a programación y te avisamos.</p>'
    || '<p>Si no nos consta la transferencia, el envío se anulará y te lo diremos.</p>');
  return jsonb_build_object('resultado', 'ok');
end $function$;
revoke all on function public.avisar_pago_transferencia(uuid) from public, anon;
grant execute on function public.avisar_pago_transferencia(uuid) to authenticated, service_role;
comment on function public.avisar_pago_transferencia(uuid) is '[Precio y pago] El cliente avisa de que ya ha hecho la transferencia de un envío pendiente de pago: apunta pago_avisado_en (el plazo para pagar deja de correr y el envío no se anula solo), avisa a Dynamo en la campana y manda el email de «la estamos validando». Dynamo la da después por recibida (registrar_transferencia_envio) o la rechaza (rechazar_pago_transferencia). Quién: el cliente dueño del envío, o Dynamo en su nombre. Argumentos: p_envio: el envío pendiente de pago.';

-- ---- 4 · Dynamo no encuentra el cobro: se anula ---------------------------------------
create or replace function public.rechazar_pago_transferencia(p_envio uuid, p_motivo text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare e record; v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo rechaza un pago.' using errcode = '42501'; end if;
  if es_solo_lectura() then raise exception 'Tu usuario es de solo lectura.' using errcode = '42501'; end if;
  select id, estado, estado_pago_previo, transportista_id, pago_a_cuenta, es_manual into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if e.estado <> 'programado' or e.estado_pago_previo <> 'pendiente' or coalesce(e.es_manual, false) then
    return jsonb_build_object('resultado', 'no_pendiente');
  end if;
  -- Con dinero ya cobrado a cuenta o con camión puesto no se anula de un toque: se cancela como cualquier envío.
  if coalesce(e.pago_a_cuenta, 0) > 0 then return jsonb_build_object('resultado', 'con_pago_a_cuenta'); end if;
  if e.transportista_id is not null then return jsonb_build_object('resultado', 'con_transportista'); end if;
  -- El aviso al cliente de «anulado sin pago» lo pone fn_avisos_envios al ver esta marca.
  perform set_config('dynamo.pago_rechazado', '1', true);
  update envios set estado = 'cancelado' where id = p_envio;
  perform set_config('dynamo.pago_rechazado', '', true);
  perform registrar_hito(p_envio, 'incidencia', null, null,
    jsonb_build_object('motivo_cancelacion', 'Anulado sin pago: no nos consta la transferencia' || coalesce(' (' || v_motivo || ')', ''), 'por', 'dynamo'), 'app');
  return jsonb_build_object('resultado', 'ok');
end $function$;
revoke all on function public.rechazar_pago_transferencia(uuid, text) from public, anon;
grant execute on function public.rechazar_pago_transferencia(uuid, text) to authenticated, service_role;
comment on function public.rechazar_pago_transferencia(uuid, text) is '[Precio y pago] Dynamo rechaza el pago de un envío pendiente de pago porque no le consta la transferencia: el envío queda anulado sin pago (no cuenta como cancelación del cliente) y el cliente recibe el aviso de volver a pedirlo. No vale con dinero ya cobrado a cuenta ni con transportista asignado. Quién: equipo de Dynamo (no los de solo lectura). Argumentos: p_envio: el envío · p_motivo: nota opcional que queda en el historial.';

-- El aviso de «anulado sin pago» también cuando lo anula Dynamo al rechazar el pago.
do $$
declare v_def text; v_nueva text;
begin
  select pg_get_functiondef('public.fn_avisos_envios()'::regprocedure) into v_def;
  if position('dynamo.pago_rechazado' in v_def) > 0 then return; end if;   -- ya está
  v_nueva := replace(v_def,
    $q$elsif auth.uid() is null and new.estado_pago_previo = 'pendiente' then$q$,
    $q$elsif new.estado_pago_previo = 'pendiente' and (auth.uid() is null or coalesce(current_setting('dynamo.pago_rechazado', true), '') = '1') then$q$);
  v_nueva := replace(v_nueva,
    $q$'Pasó el plazo para pagar. Si aún lo necesitas, vuelve a pedirlo: el precio se recalcula.'$q$,
    $q$case when coalesce(current_setting('dynamo.pago_rechazado', true), '') = '1' then 'No nos consta tu transferencia.' else 'Pasó el plazo para pagar.' end || ' Si aún lo necesitas, vuelve a pedirlo: el precio se recalcula.'$q$);
  v_nueva := replace(v_nueva,
    $q$v_cli || ' no pagó a tiempo.'$q$,
    $q$v_cli || case when coalesce(current_setting('dynamo.pago_rechazado', true), '') = '1' then ': pago rechazado, no consta la transferencia.' else ' no pagó a tiempo.' end$q$);
  if v_nueva = v_def or position('No nos consta tu transferencia' in v_nueva) = 0 or position('pago rechazado' in v_nueva) = 0 then
    raise exception 'fn_avisos_envios() no tiene el texto esperado: revisar la migración';
  end if;
  execute v_nueva;
end $$;
