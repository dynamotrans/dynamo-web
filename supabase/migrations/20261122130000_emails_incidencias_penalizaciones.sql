-- EMAILS DE INCIDENCIAS Y PENALIZACIONES (usuario, 2026-11-22: «cuando crea una incidencia un
-- usuario o la crea el administrador no están llegando correos de incidencias creadas, o de
-- penalizaciones creadas, borradas o resueltas. Todo eso debería notificarse»).
--
-- Hasta ahora solo salía el aviso de la campana (y no en todos los casos). Ahora, además, un email
-- al afectado, con copia a Dynamo como todos (la pone el envío de la cola):
--   INCIDENCIAS (al cliente si es suya; al transportista si es suya):
--     · abierta: «la hemos recibido» si la abre él, o «Dynamo ha abierto una incidencia» si la abre Dynamo;
--     · resuelta: con la resolución;
--     · retirada (estado cancelado).
--   PENALIZACIONES (al cliente por su importe + IVA; al transportista por el suyo):
--     · confirmada (al confirmarla o si nace confirmada);
--     · anulada o borrada, si ya se le había comunicado. Al cliente también la de cancelación
--       automática que se le anunció en el email «Envío cancelado» («Dynamo lo revisa»).
--   Las pendientes de confirmar no se comunican: Dynamo las revisa antes.
-- Nada en los envíos de gestión directa (transportista propio del cliente), como el resto.

-- 1. Los tipos nuevos de email (se añaden a los que ya hay, sin repetirlos).
do $$
declare v_def text; v_lista text[]; v_nuevos text[] := array['incidencia_abierta', 'incidencia_resuelta', 'incidencia_retirada', 'penalizacion', 'penalizacion_anulada'];
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'emails_enviados_tipo_check' and conrelid = 'emails_enviados'::regclass;
  select array_agg(m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  select array_agg(distinct x order by x) into v_lista from unnest(v_lista || v_nuevos) as x;
  alter table emails_enviados drop constraint emails_enviados_tipo_check;
  execute format('alter table emails_enviados add constraint emails_enviados_tipo_check check (tipo = any (%L::text[]))', v_lista);
end $$;

-- 2. Email al afectado por una incidencia.
create or replace function public.fn_email_incidencia(p_inc uuid, p_tipo text, p_clave text, p_titulo text, p_cuerpo text)
returns void language plpgsql security definer set search_path = public as $$
declare i record; v_para text; v_cuerpo text; v_url text := coalesce(parametro('url_plataforma') #>> '{}', '');
begin
  select x.id, x.codigo, x.titulo, x.cliente_id, x.transportista_id, x.envio_id into i from incidencias x where x.id = p_inc;
  if i.id is null then return; end if;
  v_cuerpo := p_cuerpo || format('<p>La puedes seguir en <strong>Incidencias</strong>, dentro de la plataforma.</p><p><a href="%s/panel/incidencias" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">Ver mis incidencias</a></p>', v_url);
  if i.cliente_id is not null then
    if i.envio_id is not null then
      perform fn_email_envio_cliente(i.envio_id, p_clave, p_tipo, p_titulo, v_cuerpo);
    else
      -- Sin envío: a los usuarios del cliente y a su contabilidad.
      v_para := emails_del_cliente(i.cliente_id);
      if nullif(v_para, '') is null then return; end if;
      insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
      values (p_clave, p_tipo, v_para, format('%s · %s', p_titulo, i.codigo),
        format('<p>Hola,</p>%s<p>— %s · %s · %s</p>', v_cuerpo,
               escapar_html(coalesce(parametro('dynamo_razon_social') #>> '{}', '')), escapar_html(email_dynamo()), escapar_html(tel_dynamo())))
      on conflict (clave) do nothing;
    end if;
  elsif i.transportista_id is not null and i.envio_id is not null then
    perform fn_email_envio_transportista(i.envio_id, i.transportista_id, p_clave, p_tipo, p_titulo, v_cuerpo);
  end if;
end $$;
revoke execute on function public.fn_email_incidencia(uuid, text, text, text, text) from public, anon, authenticated;
comment on function public.fn_email_incidencia(uuid, text, text, text, text) is '[Gestión interna] Encola un email sobre una incidencia a quien le afecta: al cliente si es suya (con el detalle de su envío, o sin él si la incidencia no es de un envío) o al transportista si es suya; con el enlace a Incidencias. Una vez por clave. Nada en los envíos de gestión directa. Quién: nadie la llama desde fuera; la usan los disparadores de incidencias. Argumentos: p_inc: la incidencia · p_tipo: tipo de email · p_clave: clave única · p_titulo: principio del asunto · p_cuerpo: el párrafo propio, en HTML.';

create or replace function public.fn_email_incidencias()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol text := (select rol::text from usuarios where id = auth.uid()); v_suya boolean; v_que text; v_detalle text;
begin
  v_que := format('<strong>%s · %s</strong>', escapar_html(new.codigo), escapar_html(new.titulo));
  v_detalle := case when nullif(btrim(new.detalle), '') is not null
                    then '<p><strong>Detalle:</strong> ' || escapar_html(left(btrim(new.detalle), 1500)) || '</p>' else '' end;
  if tg_op = 'INSERT' then
    -- ¿La abre el propio afectado (el cliente o el transportista) o Dynamo?
    v_suya := coalesce(v_rol in ('cliente', 'transportista'), false);
    if new.cliente_id is not null and not v_suya then
      -- Dynamo la abre sobre un cliente: aviso también en su campana.
      perform crear_aviso('cliente', new.cliente_id, null, 'incidencia', 'aviso', 'Incidencia abierta · ' || new.codigo,
        new.titulo, '/panel/incidencias', new.envio_id);
    elsif new.transportista_id is not null and not v_suya then
      perform crear_aviso('transportista', null, new.transportista_id, 'incidencia', 'aviso', 'Incidencia abierta · ' || new.codigo,
        new.titulo, '/panel/incidencias', new.envio_id);
    end if;
    perform fn_email_incidencia(new.id, 'incidencia_abierta', 'incidencia_abierta:' || new.id, 'Incidencia abierta',
      case when v_suya
           then '<p>Hemos recibido tu incidencia ' || v_que || '. La revisamos y te contestamos lo antes posible.</p>'
           else '<p>Hemos abierto una incidencia sobre tu envío: ' || v_que || '.</p>' end || v_detalle);
    return null;
  end if;
  if new.estado = old.estado then return null; end if;
  if new.estado = 'resuelto' then
    perform fn_email_incidencia(new.id, 'incidencia_resuelta', 'incidencia_resuelta:' || new.id || ':' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24MI'),
      'Incidencia resuelta',
      '<p>La incidencia ' || v_que || ' está <strong>resuelta</strong>.</p>'
      || case when nullif(btrim(new.resolucion), '') is not null
              then '<p><strong>Resolución:</strong> ' || escapar_html(left(btrim(new.resolucion), 1500)) || '</p>' else '' end);
  elsif new.estado = 'cancelado' then
    perform fn_email_incidencia(new.id, 'incidencia_retirada', 'incidencia_retirada:' || new.id || ':' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24MI'),
      'Incidencia retirada',
      '<p>La incidencia ' || v_que || ' ha quedado <strong>retirada</strong>: se cierra sin más cambios.</p>');
  end if;
  return null;
end $$;
revoke execute on function public.fn_email_incidencias() from public, anon, authenticated;
comment on function public.fn_email_incidencias() is '[Gestión interna] Disparador de incidencias: al abrirse una, email a quien le afecta («la hemos recibido» si la abre él; «hemos abierto una incidencia» si la abre Dynamo, con aviso también en su campana); al resolverse, email con la resolución; al retirarse (cancelado), email de retirada. Con copia a Dynamo. Quién: nadie la llama; la ejecuta la base de datos.';

drop trigger if exists tg_incidencias_email on incidencias;
create trigger tg_incidencias_email after insert or update of estado on incidencias
  for each row execute function fn_email_incidencias();

-- 3. Email al afectado por una penalización.
create or replace function public.fn_email_penalizacion(p_pen penalizaciones, p_evento text)
returns void language plpgsql security definer set search_path = public as $$
declare e record; v_tipo text; v_clave text; v_desc text; v_min text := to_char(now() at time zone 'utc', 'YYYYMMDDHH24MI');
  v_aviso_cli boolean; v_aviso_tra boolean;
begin
  select id, cliente_id, transportista_id into e from envios where id = p_pen.envio_id;
  if e.id is null then return; end if;
  select nombre into v_tipo from tipos_penalizacion where id = p_pen.tipo_id;
  v_desc := case when nullif(btrim(p_pen.descripcion), '') is not null
                 then '<p><strong>Motivo:</strong> ' || escapar_html(left(btrim(p_pen.descripcion), 1500)) || '</p>' else '' end;
  -- A quién: en «anulada», solo a quien ya se le había comunicado (confirmada; al cliente también
  -- la automática de cancelación, que se le anuncia en el email «Envío cancelado»).
  v_aviso_cli := coalesce(p_pen.importe_cliente, 0) > 0
                 and (p_evento = 'confirmada' or p_pen.estado = 'confirmada' or p_pen.generada_auto);
  v_aviso_tra := coalesce(p_pen.importe_transportista, 0) > 0 and e.transportista_id is not null
                 and (p_evento = 'confirmada' or p_pen.estado = 'confirmada');
  if v_aviso_cli then
    v_clave := case p_evento when 'confirmada' then 'penalizacion:' || p_pen.id || ':cliente'
                             else 'penalizacion_anulada:' || p_pen.id || ':cliente:' || v_min end;
    perform fn_email_envio_cliente(e.id, v_clave,
      case p_evento when 'confirmada' then 'penalizacion' else 'penalizacion_anulada' end,
      case p_evento when 'confirmada' then 'Penalización' else 'Penalización anulada' end,
      case p_evento when 'confirmada'
           then format('<p>Se ha <strong>confirmado una penalización</strong> en tu envío: <strong>%s · %s + IVA</strong> (%s).</p>%s<p>Si no estás de acuerdo, puedes verla y alegar en <strong>Penalizaciones</strong>, dentro de la plataforma.</p>',
                       escapar_html(coalesce(v_tipo, 'Penalización')), euros_texto(p_pen.importe_cliente), escapar_html(p_pen.codigo), v_desc)
           else format('<p>La penalización <strong>%s · %s</strong> (%s + IVA) ha quedado <strong>anulada</strong>: no se te cobrará.</p>',
                       escapar_html(p_pen.codigo), escapar_html(coalesce(v_tipo, 'Penalización')), euros_texto(p_pen.importe_cliente)) end);
    -- Es dinero: va también a su contabilidad.
    update emails_enviados set destinatario = fn_unir_emails(destinatario, emails_contactos_cliente(e.cliente_id, 'contabilidad'))
     where clave = v_clave and estado = 'pendiente';
  end if;
  if v_aviso_tra then
    v_clave := case p_evento when 'confirmada' then 'penalizacion:' || p_pen.id || ':transportista'
                             else 'penalizacion_anulada:' || p_pen.id || ':transportista:' || v_min end;
    perform fn_email_envio_transportista(e.id, e.transportista_id, v_clave,
      case p_evento when 'confirmada' then 'penalizacion' else 'penalizacion_anulada' end,
      case p_evento when 'confirmada' then 'Penalización' else 'Penalización anulada' end,
      case p_evento when 'confirmada'
           then format('<p>Se ha <strong>confirmado una penalización</strong> en este envío: <strong>%s · %s</strong> (%s).</p>%s<p>Si no estás de acuerdo, puedes verla y alegar en <strong>Penalizaciones</strong>, dentro de la plataforma.</p>',
                       escapar_html(coalesce(v_tipo, 'Penalización')), euros_texto(p_pen.importe_transportista), escapar_html(p_pen.codigo), v_desc)
           else format('<p>La penalización <strong>%s · %s</strong> (%s) ha quedado <strong>anulada</strong>: no se te descontará.</p>',
                       escapar_html(p_pen.codigo), escapar_html(coalesce(v_tipo, 'Penalización')), euros_texto(p_pen.importe_transportista)) end);
  end if;
end $$;
revoke execute on function public.fn_email_penalizacion(penalizaciones, text) from public, anon, authenticated;
comment on function public.fn_email_penalizacion(penalizaciones, text) is '[Gestión interna] Encola los emails de una penalización: al cliente (su importe + IVA, también a su contabilidad) y al transportista (su importe), cada uno si tiene importe. Evento «confirmada»: se le comunica, una vez. Evento «anulada»: solo a quien ya se le había comunicado (confirmada; al cliente también la automática de cancelación). Con copia a Dynamo; nada en envíos de gestión directa. Quién: nadie la llama desde fuera; la usa el disparador de penalizaciones. Argumentos: p_pen: la fila de la penalización · p_evento: confirmada o anulada.';

create or replace function public.fn_email_penalizaciones()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'cancelada' then perform fn_email_penalizacion(old, 'anulada'); end if;
    return null;
  end if;
  if new.estado = 'confirmada' and (tg_op = 'INSERT' or old.estado <> 'confirmada') then
    perform fn_email_penalizacion(new, 'confirmada');
  elsif tg_op = 'UPDATE' and new.estado = 'cancelada' and old.estado <> 'cancelada' then
    perform fn_email_penalizacion(old, 'anulada');
  end if;
  return null;
end $$;
revoke execute on function public.fn_email_penalizaciones() from public, anon, authenticated;
comment on function public.fn_email_penalizaciones() is '[Gestión interna] Disparador de penalizaciones: al confirmarse una (o nacer confirmada), email al cliente y al transportista con su importe; al anularse o borrarse, email de anulación a quien ya se le había comunicado. Quién: nadie la llama; la ejecuta la base de datos.';

drop trigger if exists tg_penalizaciones_email on penalizaciones;
create trigger tg_penalizaciones_email after insert or update of estado or delete on penalizaciones
  for each row execute function fn_email_penalizaciones();

-- 4. La campana tampoco avisaba de una penalización que nace ya confirmada (solo al confirmarla).
drop trigger if exists tg_avisos_penalizaciones_alta on penalizaciones;
create trigger tg_avisos_penalizaciones_alta after insert on penalizaciones
  for each row when (new.estado = 'confirmada') execute function fn_avisos_penalizaciones();
