-- =====================================================================================
-- LOS EMAILS AL CLIENTE SOBRE SU ENVÍO (usuario, 2026-11-16)
-- =====================================================================================
-- «Y de cancelar envío también, y de modificar con los datos nuevos y el precio, y los
-- datos del envío con algo más de detalle. Si está sin transportista no se manda el
-- recordatorio de carga. Debemos avisar cuando se asigne transportista, y cuando se
-- asignen matrículas; pero si al asignar el transportista ya se pusieron las matrículas,
-- no avises con otro email: irán en el de asignar transportista.»
--
--   · TODOS los emails del envío al cliente llevan el mismo bloque de detalle: la ruta
--     parada a parada, la fecha de carga, la entrega estimada, la mercancía, su
--     referencia, el precio y el transporte (matrículas y conductor, cuando los hay).
--   · Envío CREADO: el de hoy, ahora con ese detalle.
--   · Envío MODIFICADO: qué ha cambiado (antes → ahora: fecha, mercancía, precio, ruta) y
--     el detalle de cómo queda. Los cambios hechos a la vez van en un solo email.
--   · Envío CANCELADO: con el motivo y, si la cancelación genera coste, cuál.
--   · MATRÍCULAS: cuando se ponen (o cambian) con el transportista ya asignado. Si se
--     ponen en la misma asignación, van en el email «Transporte confirmado» (lo manda la
--     web, con la orden de carga adjunta) y este no sale.
--   · VÍSPERA («Mañana cargamos tu envío»): solo si el envío tiene ya transportista.
--
-- Destinatarios: emails_cliente_envio (el usuario del cliente y sus copias). Ninguno sale
-- en los envíos de gestión directa ni en las solicitudes sin confirmar.

-- 1. Los tipos nuevos ---------------------------------------------------------------------
alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida',
                  'envio_aceptado', 'alta_pendiente', 'deca', 'cuenta_activada', 'cuenta_reactivada',
                  'cambio_email', 'envio_creado', 'envio_modificado', 'envio_cancelado', 'envio_matriculas'));
comment on column public.emails_enviados.tipo is 'formato: texto | rango: no aplica | lista: matriculas · vispera · orden_carga · firma_cmr · cmr_completo · difusion · difusion_fin · difusion_recordatorio · aviso_entrega · aviso_parada · aviso_parada_cancelada · cuenta_suspendida · envio_aceptado · alta_pendiente · deca (el DeCA en PDF al transportista, en cada versión) · cuenta_activada (al usuario, cuando Dynamo confirma su alta) · cuenta_reactivada (al usuario, cada vez que su cuenta suspendida vuelve a estar activa) · cambio_email (a la dirección antigua y a la nueva, cuando cambia el email de acceso de una cuenta) · envio_creado (al cliente, cuando su envío queda confirmado) · envio_modificado (al cliente, con lo que ha cambiado) · envio_cancelado (al cliente) · envio_matriculas (al cliente, al ponerse o cambiar las matrículas con el transportista ya asignado) | obligatorio | Qué aviso es. Ej. OK: matriculas';

-- 2. Textos comunes -------------------------------------------------------------------------
create or replace function envio_mercancia_texto(p_metros numeric, p_toneladas numeric, p_tipo_carga text, p_plataforma boolean,
                                                 p_descripcion text, p_adr boolean, p_nima boolean)
returns text language sql immutable set search_path = public as $$
  select concat_ws(' · ',
    case when p_metros is not null then replace(to_char(p_metros, 'FM990.00'), '.', ',') || ' metros' end,
    case when p_toneladas is not null then replace(to_char(p_toneladas, 'FM990.00'), '.', ',') || ' toneladas' end,
    case when p_tipo_carga = 'completa' then case when coalesce(p_plataforma, false) then 'Rígido completo' else 'Tráiler completo' end
         when p_tipo_carga = 'grupaje' then 'Grupaje' end,
    case when coalesce(p_plataforma, false) then 'con plataforma elevadora' end,
    case when coalesce(p_adr, false) then 'ADR' end,
    case when coalesce(p_nima, false) then 'con NIMA' end,
    nullif(btrim(p_descripcion), ''))
$$;
revoke execute on function envio_mercancia_texto(numeric, numeric, text, boolean, text, boolean, boolean) from public, anon, authenticated;
comment on function public.envio_mercancia_texto(numeric, numeric, text, boolean, text, boolean, boolean) is '[Ayudantes internos] La mercancía de un envío en una línea para los emails: metros, toneladas, tipo de carga, plataforma elevadora, ADR, NIMA y descripción. Quién: nadie la llama desde fuera. Argumentos: p_metros, p_toneladas, p_tipo_carga (completa o grupaje), p_plataforma, p_descripcion, p_adr, p_nima.';

create or replace function envio_fecha_carga_texto(p_desde date, p_hasta date, p_prevista date)
returns text language sql immutable set search_path = public as $$
  select case
    when p_prevista is not null then fecha_texto(p_prevista)
    when p_desde is null then 'sin fecha todavía'
    when p_hasta is not null and p_hasta <> p_desde then 'del ' || fecha_texto(p_desde) || ' al ' || fecha_texto(p_hasta)
    else fecha_texto(p_desde) end
$$;
revoke execute on function envio_fecha_carga_texto(date, date, date) from public, anon, authenticated;
comment on function public.envio_fecha_carga_texto(date, date, date) is '[Ayudantes internos] La fecha de carga de un envío para los emails: el día previsto si lo hay; si no, el día o la ventana pedida («del … al …»). Quién: nadie la llama desde fuera. Argumentos: p_desde y p_hasta: la fecha o ventana pedida; p_prevista: el día fijado al asignar.';

-- El bloque de detalle que llevan todos los emails del envío al cliente.
create or replace function envio_detalle_html(p_envio uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare e record; v_ruta text; v_transporte text;
begin
  select * into e from envios where id = p_envio;
  if e.id is null then return ''; end if;
  select string_agg(format('<li><strong>%s</strong> · %s</li>',
           case when p.tipo = 'carga' then 'Recogida' else 'Entrega' end,
           escapar_html(concat_ws(' — ', nullif(btrim(p.nombre_empresa), ''),
             concat_ws(', ', nullif(btrim(p.direccion), ''), nullif(btrim(concat_ws(' ', p.codigo_postal, p.poblacion)), ''),
                       case when p.provincia is distinct from p.poblacion then nullif(btrim(p.provincia), '') end)))), '' order by p.orden)
    into v_ruta from envio_paradas p where p.envio_id = p_envio;
  v_transporte := case
    when e.transportista_id is null then 'buscando camión'
    when e.matricula_camion is null then 'transportista asignado · matrículas pendientes'
    else concat_ws(' · ', 'camión ' || e.matricula_camion,
           case when e.matricula_remolque is not null then 'remolque ' || e.matricula_remolque end,
           case when nullif(btrim(e.conductor_nombre), '') is not null
                then 'conductor ' || btrim(e.conductor_nombre) || coalesce(' (' || nullif(btrim(e.conductor_telefono), '') || ')', '') end) end;
  return format('<p><strong>Datos del envío #%s</strong></p><ol>%s</ol><p><strong>Fecha de carga:</strong> %s%s%s%s%s<br><strong>Transporte:</strong> %s</p>',
    escapar_html(e.referencia_gx), coalesce(v_ruta, ''),
    envio_fecha_carga_texto(e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_prevista),
    case when e.fecha_entrega_estimada is not null then '<br><strong>Entrega estimada:</strong> ' || fecha_texto(e.fecha_entrega_estimada) else '' end,
    '<br><strong>Mercancía:</strong> ' || escapar_html(coalesce(nullif(envio_mercancia_texto(e.metros_lineales, e.toneladas, e.tipo_carga::text,
       e.requiere_plataforma_elevadora, e.descripcion_mercancia, e.adr, e.requiere_nima), ''), '—')),
    case when nullif(btrim(e.referencia_cliente), '') is not null then '<br><strong>Tu referencia:</strong> ' || escapar_html(e.referencia_cliente) else '' end,
    case when e.importe_cliente is not null then '<br><strong>Precio:</strong> ' || euros_texto(e.importe_cliente) || ' + IVA' else '' end,
    escapar_html(v_transporte));
end $$;
revoke execute on function envio_detalle_html(uuid) from public, anon, authenticated;
comment on function public.envio_detalle_html(uuid) is '[Gestión interna] Bloque de detalle de un envío para los emails al cliente: la ruta parada a parada, la fecha de carga, la entrega estimada, la mercancía, su referencia, el precio y el transporte (matrículas y conductor cuando los hay; nunca el nombre del transportista). Quién: nadie la llama desde fuera; la usan los avisos por email. Argumentos: p_envio: el envío.';

-- Lo que necesita la web para escribir al cliente (el email «Transporte confirmado», que
-- lleva la orden de carga adjunta, lo manda ella).
create or replace function datos_email_cliente_envio(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and not es_equipo_dynamo() then
    raise exception 'Solo Dynamo prepara los emails de un envío.' using errcode = '42501';
  end if;
  return jsonb_build_object('para', emails_cliente_envio(p_envio), 'detalle', envio_detalle_html(p_envio));
end $$;
revoke execute on function datos_email_cliente_envio(uuid) from public, anon;
grant execute on function datos_email_cliente_envio(uuid) to authenticated, service_role;
comment on function public.datos_email_cliente_envio(uuid) is '[Envíos] Para escribir al cliente sobre un envío: «para» (las direcciones, separadas por comas) y «detalle» (el bloque de datos del envío, en HTML). Quién: Dynamo y el servidor de la web. Argumentos: p_envio: el envío.';

-- Cabecera y pie comunes.
create or replace function fn_email_envio_cliente(p_envio uuid, p_clave text, p_tipo text, p_titulo text, p_cuerpo text)
returns void language plpgsql security definer set search_path = public as $$
declare e record; v_para text; v_origen text; v_destino text;
begin
  select id, referencia_gx, es_manual into e from envios where id = p_envio;
  if e.id is null or coalesce(e.es_manual, false) then return; end if;
  v_para := emails_cliente_envio(p_envio);
  if nullif(v_para, '') is null then return; end if;
  select p.poblacion into v_origen from envio_paradas p where p.envio_id = p_envio and p.tipo = 'carga' order by p.orden limit 1;
  select p.poblacion into v_destino from envio_paradas p where p.envio_id = p_envio and p.tipo = 'descarga' order by p.orden desc limit 1;
  insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
  values (p_clave, p_tipo, p_envio, v_para,
    format('%s · envío #%s (%s → %s)', p_titulo, e.referencia_gx, coalesce(v_origen, '—'), coalesce(v_destino, '—')),
    format('<p>Hola,</p>%s<!--detalle-->%s<p>Lo sigues en vivo en <a href="%s/panel/envios?ver=%s">la ficha del envío</a>.</p><p>— %s · %s · %s</p>',
           p_cuerpo, envio_detalle_html(p_envio), coalesce(parametro('url_plataforma') #>> '{}', ''), p_envio,
           escapar_html(coalesce(parametro('dynamo_razon_social') #>> '{}', '')), escapar_html(email_dynamo()), escapar_html(tel_dynamo())))
  on conflict (clave) do nothing;
end $$;
revoke execute on function fn_email_envio_cliente(uuid, text, text, text, text) from public, anon, authenticated;
comment on function public.fn_email_envio_cliente(uuid, text, text, text, text) is '[Gestión interna] Encola un email al cliente sobre su envío, una vez por clave: saludo, el cuerpo que se le pasa, el bloque de detalle del envío, el enlace a su ficha y la firma de Dynamo. No hace nada en los envíos de gestión directa. Quién: nadie la llama desde fuera. Argumentos: p_envio; p_clave: la clave única; p_tipo: el tipo de email; p_titulo: principio del asunto; p_cuerpo: el párrafo propio de ese aviso, en HTML.';

-- 3. Envío CREADO, con el detalle -------------------------------------------------------------
create or replace function fn_email_envio_creado()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  select id, estado, estado_pago_previo into e from envios where id = new.envio_id;
  if e.id is null or e.estado in ('borrador', 'cancelado') then return null; end if;
  perform fn_email_envio_cliente(e.id, 'envio_creado:' || e.id, 'envio_creado', 'Envío creado',
    '<p>Tu envío ya está <strong>creado</strong>. Ahora buscamos el camión: te avisaremos cuando tenga transportista y matrículas.</p>'
    || case when e.estado_pago_previo = 'pendiente'
            then '<p><strong>Pendiente de pago:</strong> el envío queda en firme cuando recibamos el pago. Puedes pagarlo desde su ficha.</p>' else '' end);
  return null;
end $$;

-- 4. Envío CANCELADO -----------------------------------------------------------------------
create or replace function fn_email_envio_cancelado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pen numeric; v_motivo text;
begin
  if tg_table_name = 'envio_hitos' then
    -- El motivo se anota justo después de cancelar: se añade al email si aún no ha salido.
    v_motivo := nullif(btrim(new.datos ->> 'motivo_cancelacion'), '');
    if v_motivo is not null then
      update emails_enviados
         set cuerpo_html = replace(cuerpo_html, '<!--motivo-->', '<p><strong>Motivo:</strong> ' || escapar_html(v_motivo) || '</p>')
       where clave = 'envio_cancelado:' || new.envio_id || ':' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24MI') and estado = 'pendiente';
    end if;
    return null;
  end if;
  select importe_cliente into v_pen from penalizaciones
   where envio_id = new.id and generada_auto and estado = 'pendiente_confirmar' and creado_en >= now() - interval '1 minute'
   order by creado_en desc limit 1;
  perform fn_email_envio_cliente(new.id, 'envio_cancelado:' || new.id || ':' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24MI'),
    'envio_cancelado', 'Envío cancelado',
    '<p>Tu envío ha quedado <strong>cancelado</strong>.</p><!--motivo-->'
    || case when v_pen is not null and v_pen > 0
            then format('<p><strong>Coste de la cancelación:</strong> %s + IVA, según las condiciones (se canceló con el camión ya asignado y fuera de plazo). Dynamo lo revisa antes de confirmarlo.</p>', euros_texto(v_pen))
            else '<p>No se ha generado ningún coste de cancelación.</p>' end);
  return null;
end $$;
revoke execute on function fn_email_envio_cancelado() from public, anon, authenticated;
comment on function public.fn_email_envio_cancelado() is '[Gestión interna] Disparador de envios y de envio_hitos: al cancelarse un envío confirmado encola el email «Envío cancelado» para el cliente, con el coste de cancelación si se ha generado; el motivo, que se anota después, se añade al email si aún no ha salido. Quién: nadie la llama; la ejecuta la base de datos.';

-- Va después de tg_envios_penalizacion_cancelacion (orden alfabético): la penalización ya existe.
create trigger tg_envios_y_email_cancelado after update of estado on envios
  for each row when (new.estado = 'cancelado' and old.estado not in ('borrador', 'cancelado') and not coalesce(new.es_manual, false))
  execute function fn_email_envio_cancelado();
create trigger tg_hitos_email_cancelado_motivo after insert on envio_hitos
  for each row when (new.hito = 'incidencia' and new.datos ? 'motivo_cancelacion')
  execute function fn_email_envio_cancelado();

-- 5. Envío MODIFICADO ------------------------------------------------------------------------
create or replace function fn_encolar_email_envio_modificado(p_envio uuid, p_cambios text)
returns void language plpgsql security definer set search_path = public as $$
declare v_clave text := 'envio_modificado:' || p_envio || ':' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24MI'); v_estado estado_envio; v_resto text;
begin
  select estado into v_estado from envios where id = p_envio;
  if v_estado is null or v_estado in ('borrador', 'cancelado') or nullif(p_cambios, '') is null then return; end if;
  if exists (select 1 from emails_enviados where clave = v_clave) then
    -- Otro cambio en la misma operación (o en el mismo minuto, sin haber salido): un solo
    -- email, con todos los cambios y el detalle de cómo queda al final.
    select split_part(cuerpo_html, '<!--detalle-->', 2) into v_resto from emails_enviados where clave = v_clave;
    update emails_enviados
       set cuerpo_html = replace(split_part(cuerpo_html, '<!--detalle-->', 1), '</ul>', p_cambios || '</ul>')
                         || '<!--detalle-->' || envio_detalle_html(p_envio) || substr(v_resto, position('<p>Lo sigues' in v_resto))
     where clave = v_clave and estado = 'pendiente';
    return;
  end if;
  perform fn_email_envio_cliente(p_envio, v_clave, 'envio_modificado', 'Envío modificado',
    '<p>Tu envío se ha <strong>modificado</strong>.</p><p><strong>Qué ha cambiado</strong></p><ul>' || p_cambios || '</ul>');
end $$;
revoke execute on function fn_encolar_email_envio_modificado(uuid, text) from public, anon, authenticated;
comment on function public.fn_encolar_email_envio_modificado(uuid, text) is '[Gestión interna] Encola el email «Envío modificado» para el cliente con la lista de cambios y el detalle de cómo queda el envío. Los cambios de la misma operación (o del mismo minuto, si el email aún no ha salido) se juntan en uno solo. No sale en solicitudes sin confirmar, cancelados ni gestión directa. Quién: nadie la llama desde fuera. Argumentos: p_envio; p_cambios: los cambios, como elementos de lista en HTML.';

create or replace function fn_email_envio_modificado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text := ''; v_antes text; v_ahora text;
begin
  if tg_table_name = 'envio_hitos' then
    perform fn_encolar_email_envio_modificado(new.envio_id, '<li><strong>Ruta:</strong> ha cambiado. Abajo va la ruta nueva.</li>');
    return null;
  end if;
  if (old.fecha_carga_desde, old.fecha_carga_hasta) is distinct from (new.fecha_carga_desde, new.fecha_carga_hasta) then
    v := v || format('<li><strong>Fecha de carga:</strong> antes %s · ahora <strong>%s</strong></li>',
      envio_fecha_carga_texto(old.fecha_carga_desde, old.fecha_carga_hasta, null), envio_fecha_carga_texto(new.fecha_carga_desde, new.fecha_carga_hasta, null));
  end if;
  -- El día previsto y la entrega estimada: solo si CAMBIAN (la primera vez se ponen al asignar).
  if old.fecha_carga_prevista is not null and new.fecha_carga_prevista is distinct from old.fecha_carga_prevista then
    v := v || format('<li><strong>Día de carga previsto:</strong> antes %s · ahora <strong>%s</strong></li>', fecha_texto(old.fecha_carga_prevista), fecha_texto(new.fecha_carga_prevista));
  end if;
  if old.fecha_entrega_estimada is not null and new.fecha_entrega_estimada is distinct from old.fecha_entrega_estimada then
    v := v || format('<li><strong>Entrega estimada:</strong> antes %s · ahora <strong>%s</strong></li>', fecha_texto(old.fecha_entrega_estimada), fecha_texto(new.fecha_entrega_estimada));
  end if;
  v_antes := envio_mercancia_texto(old.metros_lineales, old.toneladas, old.tipo_carga::text, old.requiere_plataforma_elevadora, old.descripcion_mercancia, old.adr, old.requiere_nima);
  v_ahora := envio_mercancia_texto(new.metros_lineales, new.toneladas, new.tipo_carga::text, new.requiere_plataforma_elevadora, new.descripcion_mercancia, new.adr, new.requiere_nima);
  if v_antes is distinct from v_ahora then
    v := v || format('<li><strong>Mercancía:</strong> antes %s · ahora <strong>%s</strong></li>', escapar_html(coalesce(nullif(v_antes, ''), '—')), escapar_html(coalesce(nullif(v_ahora, ''), '—')));
  end if;
  if new.importe_cliente is distinct from old.importe_cliente and new.importe_cliente is not null then
    v := v || case when old.importe_cliente is null
                   then format('<li><strong>Precio:</strong> <strong>%s + IVA</strong></li>', euros_texto(new.importe_cliente))
                   else format('<li><strong>Precio:</strong> antes %s · ahora <strong>%s + IVA</strong></li>', euros_texto(old.importe_cliente), euros_texto(new.importe_cliente)) end;
  end if;
  if v <> '' then perform fn_encolar_email_envio_modificado(new.id, v); end if;
  return null;
end $$;
revoke execute on function fn_email_envio_modificado() from public, anon, authenticated;
comment on function public.fn_email_envio_modificado() is '[Gestión interna] Disparador de envios y de envio_hitos: cuando cambian la fecha de carga, el día previsto, la entrega estimada, la mercancía o el precio de un envío confirmado, o su ruta (hito «ruta cambiada»), encola el email «Envío modificado» para el cliente con el antes y el ahora. Quién: nadie la llama; la ejecuta la base de datos.';

create trigger tg_envios_y_email_modificado after update on envios
  for each row when (old.estado not in ('borrador', 'cancelado') and new.estado not in ('borrador', 'cancelado') and not coalesce(new.es_manual, false))
  execute function fn_email_envio_modificado();
create trigger tg_hitos_email_ruta_cambiada after insert on envio_hitos
  for each row when (new.hito = 'ruta_cambiada') execute function fn_email_envio_modificado();

-- 6. MATRÍCULAS -------------------------------------------------------------------------------
create or replace function fn_email_envio_matriculas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform fn_email_envio_cliente(new.id,
    'envio_matriculas:' || new.id || ':' || new.matricula_camion || ':' || coalesce(new.matricula_remolque, ''), 'envio_matriculas',
    case when old.matricula_camion is null then 'Matrículas asignadas' else 'Matrículas cambiadas' end,
    case when old.matricula_camion is null
         then '<p>Tu envío ya tiene las <strong>matrículas</strong> del camión que lo va a cargar.</p>'
         else '<p>Han <strong>cambiado las matrículas</strong> del camión que va a cargar tu envío.</p>' end
    || format('<p><strong>Camión:</strong> %s%s%s</p>', escapar_html(new.matricula_camion),
         case when new.matricula_remolque is not null then ' · <strong>Remolque:</strong> ' || escapar_html(new.matricula_remolque) else '' end,
         case when nullif(btrim(new.conductor_nombre), '') is not null then ' · <strong>Conductor:</strong> ' || escapar_html(btrim(new.conductor_nombre)) else '' end));
  return null;
end $$;
revoke execute on function fn_email_envio_matriculas() from public, anon, authenticated;
comment on function public.fn_email_envio_matriculas() is '[Gestión interna] Disparador de envios: cuando se ponen o cambian las matrículas de un envío que YA tenía transportista, encola el email de matrículas para el cliente. Si las matrículas se ponen en la misma asignación del transportista no sale: van en el email «Transporte confirmado». Quién: nadie la llama; la ejecuta la base de datos.';

create trigger tg_envios_y_email_matriculas after update of matricula_camion, matricula_remolque on envios
  for each row when (new.matricula_camion is not null and new.transportista_id is not null
                     and old.transportista_id is not distinct from new.transportista_id
                     and (old.matricula_camion, old.matricula_remolque) is distinct from (new.matricula_camion, new.matricula_remolque)
                     and new.estado in ('programado', 'hacia_la_carga', 'cargando') and not coalesce(new.es_manual, false))
  execute function fn_email_envio_matriculas();

-- 7. La VÍSPERA, solo con transportista ---------------------------------------------------------
do $$
declare v_oid oid := 'public.encolar_avisos_operativos(timestamptz)'::regprocedure; v_def text; v_nueva text;
  v_aguja text := 'where e.estado = ''programado'' and not coalesce(e.es_manual, false)';
begin
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_aguja, ''))) / length(v_aguja) <> 1 then
    raise exception 'La condición de la víspera no aparece una sola vez en encolar_avisos_operativos: revisar antes de aplicar.';
  end if;
  v_nueva := replace(v_def, v_aguja, v_aguja || ' and e.transportista_id is not null');
  execute v_nueva;
end $$;
