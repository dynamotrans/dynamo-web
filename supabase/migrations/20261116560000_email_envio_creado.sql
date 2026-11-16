-- =====================================================================================
-- EMAIL «ENVÍO CREADO» AL CLIENTE (usuario, 2026-11-16)
-- =====================================================================================
-- «Me llega el recordatorio de carga, pero el de creación de envío no.» No existía: al
-- crear un envío solo salía el aviso de la campana a Dynamo. Desde hoy, cuando un envío
-- de Dynamo queda confirmado (deja de ser solicitud), sale un email «Envío #GX creado» con
-- la ruta, la fecha de carga, la mercancía, el precio y el enlace a su ficha.
--
-- A QUIÉN (igual lo cree el cliente o Dynamo en su nombre): al usuario del cliente del
-- envío y a sus emails de copia; si el cliente no tiene usuario en la plataforma, a quien
-- creó el envío. Como todos los avisos, lleva copia a Dynamo. El recordatorio de la
-- víspera («Mañana cargamos tu envío») usa desde hoy los MISMOS destinatarios: antes iba
-- solo a quien creó el envío, así que si lo creaba Dynamo el cliente no lo recibía.
--
-- Una sola vez por envío (clave única). No sale en los envíos de gestión directa (el
-- cliente con su propio transportista), como el resto de avisos de carga.

-- 1. El tipo nuevo ----------------------------------------------------------------------
alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida',
                  'envio_aceptado', 'alta_pendiente', 'deca', 'cuenta_activada', 'cuenta_reactivada',
                  'cambio_email', 'envio_creado'));
comment on column public.emails_enviados.tipo is 'formato: texto | rango: no aplica | lista: matriculas · vispera · orden_carga · firma_cmr · cmr_completo · difusion · difusion_fin · difusion_recordatorio · aviso_entrega · aviso_parada · aviso_parada_cancelada · cuenta_suspendida · envio_aceptado · alta_pendiente · deca (el DeCA en PDF al transportista, en cada versión) · cuenta_activada (al usuario, cuando Dynamo confirma su alta) · cuenta_reactivada (al usuario, cada vez que su cuenta suspendida vuelve a estar activa) · cambio_email (a la dirección antigua y a la nueva, cuando cambia el email de acceso de una cuenta) · envio_creado (al cliente, cuando su envío queda confirmado) | obligatorio | Qué aviso es. Ej. OK: matriculas';

-- 2. A quién se escribe sobre un envío ----------------------------------------------------
create or replace function emails_cliente_envio(p_envio uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    -- El usuario (o usuarios) del cliente del envío, con sus emails de copia.
    (select string_agg(distinct x.email, ',')
       from envios e
       join usuarios u on u.cliente_id = e.cliente_id and u.rol = 'cliente' and u.estado in ('activa', 'suspendida')
       cross join lateral unnest(array[u.email::text] || coalesce(u.emails_copia_avisos::text[], '{}')) as x(email)
      where e.id = p_envio and nullif(btrim(x.email), '') is not null),
    -- Sin usuario del cliente: quien creó el envío.
    (select array_to_string(array[u.email::text] || coalesce(u.emails_copia_avisos::text[], '{}'), ',')
       from envios e join usuarios u on u.id = e.creado_por where e.id = p_envio))
$$;
revoke execute on function emails_cliente_envio(uuid) from public, anon, authenticated;
comment on function public.emails_cliente_envio(uuid) is '[Gestión interna] Direcciones a las que se escribe al cliente sobre un envío, separadas por comas: el usuario del cliente del envío (activo o en solo lectura) con sus emails de copia; si el cliente no tiene usuario, quien creó el envío. Quién: nadie la llama desde fuera; la usan los avisos por email. Argumentos: p_envio: el envío.';

-- 3. El email, al quedar confirmado el envío ------------------------------------------------
create or replace function fn_email_envio_creado()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record; v_para text; v_origen text; v_destino text; v_fecha text; v_merc text; v_base text;
begin
  select id, referencia_gx, estado, es_manual, fecha_carga_prevista, fecha_carga_desde, fecha_carga_hasta,
         metros_lineales, toneladas, importe_cliente, estado_pago_previo
    into e from envios where id = new.envio_id;
  if e.id is null or coalesce(e.es_manual, false) or e.estado in ('borrador', 'cancelado') then return null; end if;
  v_para := emails_cliente_envio(e.id);
  if nullif(v_para, '') is null then return null; end if;
  select p.poblacion into v_origen from envio_paradas p where p.envio_id = e.id and p.tipo = 'carga' order by p.orden limit 1;
  select p.poblacion into v_destino from envio_paradas p where p.envio_id = e.id and p.tipo = 'descarga' order by p.orden desc limit 1;
  v_fecha := case
    when e.fecha_carga_prevista is not null then fecha_texto(e.fecha_carga_prevista)
    when e.fecha_carga_desde is null then 'sin fecha todavía'
    when e.fecha_carga_hasta is not null and e.fecha_carga_hasta <> e.fecha_carga_desde
      then 'del ' || fecha_texto(e.fecha_carga_desde) || ' al ' || fecha_texto(e.fecha_carga_hasta)
    else fecha_texto(e.fecha_carga_desde) end;
  v_merc := concat_ws(' · ',
    case when e.metros_lineales is not null then replace(to_char(e.metros_lineales, 'FM990.00'), '.', ',') || ' metros' end,
    case when e.toneladas is not null then replace(to_char(e.toneladas, 'FM990.00'), '.', ',') || ' toneladas' end);
  v_base := coalesce(parametro('url_plataforma') #>> '{}', '');
  insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
  values ('envio_creado:' || e.id, 'envio_creado', e.id, v_para,
    format('Envío #%s creado (%s → %s)', e.referencia_gx, coalesce(v_origen, '—'), coalesce(v_destino, '—')),
    format('<p>Hola,</p><p>Tu envío <strong>#%s</strong> (%s → %s) ya está creado.</p>'
           || '<p><strong>Carga:</strong> %s%s%s</p>%s'
           || '<p>Ahora buscamos el camión. Te avisaremos cuando tenga transportista y matrícula, y la víspera de la carga. '
           || 'Lo sigues en vivo en <a href="%s/panel/envios?ver=%s">la ficha del envío</a>.</p>'
           || '<p>— %s · %s · %s</p>',
           escapar_html(e.referencia_gx), escapar_html(coalesce(v_origen, '—')), escapar_html(coalesce(v_destino, '—')),
           v_fecha,
           case when nullif(v_merc, '') is not null then '<br><strong>Mercancía:</strong> ' || v_merc else '' end,
           case when e.importe_cliente is not null then '<br><strong>Precio:</strong> ' || euros_texto(e.importe_cliente) || ' + IVA' else '' end,
           case when e.estado_pago_previo = 'pendiente'
                then '<p><strong>Pendiente de pago:</strong> el envío queda en firme cuando recibamos el pago. Puedes pagarlo desde su ficha.</p>' else '' end,
           v_base, e.id,
           escapar_html(coalesce(parametro('dynamo_razon_social') #>> '{}', '')), escapar_html(email_dynamo()), escapar_html(tel_dynamo())))
  on conflict (clave) do nothing;
  return null;
end $$;
revoke execute on function fn_email_envio_creado() from public, anon, authenticated;
comment on function public.fn_email_envio_creado() is '[Gestión interna] Disparador de envio_hitos: cuando un envío de Dynamo queda confirmado (hito «confirmado»), encola una sola vez el email «Envío creado» para el cliente (emails_cliente_envio), con la ruta, la fecha de carga, la mercancía, el precio y el enlace a su ficha. No sale en los envíos de gestión directa. Quién: nadie la llama; la ejecuta la base de datos.';

-- Las tres formas de crear un envío (crear_envio, crear_envio_cliente y las solicitudes que
-- el cliente confirma después) guardan primero las paradas y confirman al final: cuando
-- llega el hito «confirmado», la ruta ya está completa.
create trigger tg_hitos_email_envio_creado after insert on envio_hitos
  for each row when (new.hito = 'confirmado') execute function fn_email_envio_creado();

-- 4. La víspera, a los mismos destinatarios -------------------------------------------------
do $$
declare v_oid oid := 'public.encolar_avisos_operativos(timestamptz)'::regprocedure; v_def text; v_nueva text;
begin
  v_def := pg_get_functiondef(v_oid);
  v_nueva := replace(v_def,
    'v_para := array_to_string(r.email || coalesce(r.emails_copia_avisos, ''{}''), '','');',
    'v_para := coalesce(emails_cliente_envio(r.id), array_to_string(r.email || coalesce(r.emails_copia_avisos, ''{}''), '',''));');
  if v_nueva = v_def then raise exception 'No encuentro los destinatarios de la víspera en encolar_avisos_operativos: revisar antes de aplicar.'; end if;
  execute v_nueva;
end $$;
