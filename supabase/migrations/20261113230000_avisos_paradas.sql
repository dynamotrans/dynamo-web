-- =====================================================================================
-- AVISOS DE RECOGIDA Y ENTREGA A LOS SITIOS DE LA RUTA (tarea 88, usuario 2026-11-13)
-- =====================================================================================
-- El cliente dice dónde se carga y dónde se entrega: a veces su almacén, a veces los de
-- sus proveedores o sus clientes. Cada SITIO de la ruta con emails de aviso recibe un
-- email TRANSACCIONAL «de parte de <cliente>»: recogeremos / entregaremos mercancía en
-- vuestra dirección tal día, con las matrículas si ya se saben.
--
-- CALENDARIO (decisión del usuario): 2 días antes y la víspera, en la ventana de 10:00
-- a 16:00 (Madrid); y el MISMO día a partir de las 8:00. Si el envío se programa tarde
-- (p. ej. a las 20:00 para dentro de 2 días), ese día ya no entra: el primer aviso cae
-- al día siguiente en la ventana. Horas en Parámetros.
--
-- REGLAS: solo con TRANSPORTISTA ASIGNADO (con o sin matrículas — sin camión el aviso
-- no sirve de nada); nunca con discreción comercial ni en envíos manuales; ni una
-- palabra comercial (solo el pie de Dynamo); clave única por envío, parada, tramo y
-- fecha (si la fecha se mueve, se vuelve a avisar con la nueva).
--
-- ANULACIONES: envío cancelado → email de anulación a cada sitio YA AVISADO; parada
-- quitada de la ruta → email solo a ese sitio. Los avisos pendientes de lo anulado
-- quedan «omitido». Sustituye al aviso de evento del 20261113220000 (el servidor web
-- ya no manda ninguno: todo va por este reloj).

-- ---- 0. El registro admite los dos tipos nuevos --------------------------------------
alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'aviso_entrega', 'aviso_parada', 'aviso_parada_cancelada'));
comment on column public.emails_enviados.tipo is 'formato: texto | rango: no aplica | lista: matriculas · vispera · orden_carga · firma_cmr · cmr_completo · difusion · difusion_fin · aviso_entrega · aviso_parada · aviso_parada_cancelada | obligatorio | Qué aviso es. Ej. OK: matriculas';

-- ---- 1. Las horas, en Parámetros ------------------------------------------------------
insert into parametros (clave, valor, descripcion) values
  ('aviso_parada_ventana_inicio', '10',
   'Hora (Madrid) a la que ABRE la ventana diaria de avisos de recogida/entrega a los sitios (los de 2 dias antes y la vispera).'),
  ('aviso_parada_ventana_fin', '16',
   'Hora (Madrid) a la que CIERRA esa ventana diaria de avisos a los sitios.'),
  ('aviso_parada_hora_mismo_dia', '8',
   'Hora (Madrid) a partir de la cual se manda el aviso del MISMO dia de la recogida o la entrega.')
on conflict (clave) do nothing;

-- ---- 2. El texto de un aviso (recogida o entrega) -------------------------------------
create or replace function public.texto_aviso_parada(
  p_recogida boolean, p_cliente text, p_sitio text, p_direccion text, p_codpostal text,
  p_poblacion_sitio text, p_fecha date, p_mat_camion text, p_mat_remolque text, p_conductor text)
returns text language sql stable set search_path = public as $$
  select format('<p>Hola,</p>'
    || '<p>Somos <strong>Dynamo</strong>, operador de transporte. De parte de <strong>%s</strong>, %s en vuestras instalaciones:</p>'
    || '<p><strong>%s</strong>%s</p>'
    || '<p>%s prevista: <strong>%s</strong>.%s</p>'
    || '<p>Os lo adelantamos para que podáis organizar la %s. Si ese día hay algún impedimento (horario, acceso, cita previa), respondednos a este email o llamadnos y lo cuadramos.</p>'
    || '<p>— %s · %s · %s</p>',
    escapar_html(p_cliente),
    case when p_recogida then 'pasaremos a <strong>recoger mercancía</strong>' else 'os <strong>entregaremos mercancía</strong>' end,
    escapar_html(p_sitio),
    case when coalesce(p_direccion, '') <> '' or coalesce(p_poblacion_sitio, '') <> ''
         then '<br>' || escapar_html(trim(both ', ' from coalesce(p_direccion, '') || ', ' || trim(coalesce(p_codpostal, '') || ' ' || coalesce(p_poblacion_sitio, '')))) else '' end,
    case when p_recogida then 'Recogida' else 'Entrega' end,
    to_char(p_fecha, 'DD/MM/YYYY'),
    case when p_mat_camion is not null
         then format(' Camión: matrícula <strong>%s</strong>%s%s.', escapar_html(p_mat_camion),
                     case when p_mat_remolque is not null then ' · remolque ' || escapar_html(p_mat_remolque) else '' end,
                     case when p_conductor is not null then ' · conductor ' || escapar_html(p_conductor) else '' end)
         else ' Os adelantaremos la matrícula del camión en cuanto esté anotada.' end,
    case when p_recogida then 'carga' else 'descarga' end,
    escapar_html(coalesce(parametro('dynamo_razon_social') #>> '{}', '')),
    escapar_html(coalesce(parametro('dynamo_email') #>> '{}', '')),
    escapar_html(coalesce(parametro('dynamo_telefono') #>> '{}', '')))
$$;
revoke execute on function public.texto_aviso_parada(boolean, text, text, text, text, text, date, text, text, text) from public, anon, authenticated;
comment on function public.texto_aviso_parada(boolean, text, text, text, text, text, date, text, text, text) is '[Gestión interna] Monta el HTML del aviso de recogida o entrega a un sitio de la ruta: de parte de qué cliente, en qué dirección, qué día y con qué camión (o que la matrícula se adelantará). Solo texto operativo más el pie de Dynamo. Quién: funciones internas. Argumentos: p_recogida: true recogida, false entrega · p_cliente, p_sitio, p_direccion, p_codpostal, p_poblacion_sitio: textos · p_fecha: día previsto · p_mat_camion, p_mat_remolque, p_conductor: del envío, opcionales.';

-- ---- 3. Encolar los avisos que tocan ahora --------------------------------------------
create or replace function public.encolar_avisos_paradas()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0; v_cnt int; r record; v_tramo text; v_rec boolean; v_asunto text;
  hoy date := (now() at time zone 'Europe/Madrid')::date;
  ahora time := (now() at time zone 'Europe/Madrid')::time;
  h_ini int := greatest(0, least(23, parametro_num('aviso_parada_ventana_inicio', 10)::int));
  h_fin int := greatest(0, least(24, parametro_num('aviso_parada_ventana_fin', 16)::int));
  h_dia int := greatest(0, least(23, parametro_num('aviso_parada_hora_mismo_dia', 8)::int));
  en_ventana boolean;
begin
  en_ventana := ahora >= make_time(h_ini, 0, 0) and (h_fin >= 24 or ahora < make_time(h_fin, 0, 0));
  for r in
    select e.id as envio, e.referencia_gx, e.matricula_camion, e.matricula_remolque, e.conductor_nombre,
           c.razon_social as cliente,
           p.id as parada, p.tipo as tipo_parada, p.nombre_empresa, p.direccion, p.codigo_postal, p.poblacion,
           s.emails_avisos,
           case when p.tipo = 'carga' then coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde)
                else e.fecha_entrega_estimada end as fecha_obj
      from envios e
      join clientes c on c.id = e.cliente_id
      join envio_paradas p on p.envio_id = e.id
      join sitios s on s.id = p.sitio_id
     where e.transportista_id is not null
       and not coalesce(e.es_manual, false)
       and not coalesce(e.discrecion_comercial, false)
       and e.estado not in ('borrador', 'cancelado', 'entregado')
       and cardinality(s.emails_avisos) > 0
       and (case when p.tipo = 'carga' then coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde)
                 else e.fecha_entrega_estimada end) between hoy and hoy + 2
  loop
    -- Qué tramo toca AHORA: mismo día desde su hora; 1 y 2 días antes solo en la ventana.
    v_tramo := case when r.fecha_obj = hoy and ahora >= make_time(h_dia, 0, 0) then 'd0'
                    when r.fecha_obj = hoy + 1 and en_ventana then 'd1'
                    when r.fecha_obj = hoy + 2 and en_ventana then 'd2' end;
    continue when v_tramo is null;
    v_rec := r.tipo_parada = 'carga';
    v_asunto := format('%s prevista el %s · de parte de %s · Dynamo',
                       case when v_rec then 'Recogida' else 'Entrega' end,
                       to_char(r.fecha_obj, 'DD/MM/YYYY'), r.cliente);
    insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
    values ('aviso_parada:' || r.envio || ':' || r.parada || ':' || v_tramo || ':' || r.fecha_obj,
            'aviso_parada', r.envio, array_to_string(r.emails_avisos, ','), v_asunto,
            texto_aviso_parada(v_rec, r.cliente, r.nombre_empresa, r.direccion, r.codigo_postal,
                               r.poblacion, r.fecha_obj, r.matricula_camion, r.matricula_remolque, r.conductor_nombre))
    on conflict (clave) do nothing;
    get diagnostics v_cnt = row_count; n := n + v_cnt;
  end loop;
  return n;
end $$;
revoke execute on function public.encolar_avisos_paradas() from public, anon, authenticated;
comment on function public.encolar_avisos_paradas() is '[Gestión interna] Encola los avisos de recogida y entrega a los sitios de la ruta (a sus emails de aviso), cada uno UNA sola vez por tramo y fecha: 2 días antes y la víspera en la ventana diaria (aviso_parada_ventana_inicio/fin, Madrid) y el mismo día desde aviso_parada_hora_mismo_dia. Solo envíos con transportista asignado, de Dynamo y sin discreción comercial. Devuelve cuántos encoló. Quién: la tarea programada; nadie por la API. Argumentos: ninguno.';

-- ---- 4. Anulaciones --------------------------------------------------------------------
-- Un sitio YA AVISADO de un envío tiene al menos un aviso_parada pendiente o enviado.
-- OJO: recibe los datos de la parada como argumentos porque desde el disparador de
-- borrado la fila YA no existe (solo queda OLD).
create or replace function public.encolar_anulacion_parada(
  p_envio uuid, p_parada uuid, p_tipo text, p_nombre text, p_poblacion_sitio text, p_sitio uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- Solo se anula lo que se avisó.
  if p_sitio is null then return; end if;
  if not exists (select 1 from emails_enviados x
                  where x.clave like 'aviso_parada:' || p_envio || ':' || p_parada || ':%'
                    and x.estado in ('pendiente', 'enviado')) then return; end if;
  select e.referencia_gx, c.razon_social as cliente,
         p_tipo as tipo_parada, p_nombre as nombre_empresa, p_poblacion_sitio as poblacion,
         (select s.emails_avisos from sitios s where s.id = p_sitio) as emails_avisos,
         case when p_tipo = 'carga' then coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde)
              else e.fecha_entrega_estimada end as fecha_obj
    into r
    from envios e
    join clientes c on c.id = e.cliente_id
   where e.id = p_envio;
  if r is null or coalesce(cardinality(r.emails_avisos), 0) = 0 then return; end if;
  insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
  values ('aviso_parada_cancelada:' || p_envio || ':' || p_parada, 'aviso_parada_cancelada', p_envio,
          array_to_string(r.emails_avisos, ','),
          format('Anulada la %s prevista%s · de parte de %s · Dynamo',
                 case when r.tipo_parada = 'carga' then 'recogida' else 'entrega' end,
                 case when r.fecha_obj is not null then ' el ' || to_char(r.fecha_obj, 'DD/MM/YYYY') else '' end, r.cliente),
          format('<p>Hola,</p><p><strong>%s</strong> ha anulado la <strong>%s</strong> prevista%s en vuestras instalaciones (<strong>%s</strong>%s). Disculpad las molestias.</p><p>— %s · %s · %s</p>',
                 escapar_html(r.cliente),
                 case when r.tipo_parada = 'carga' then 'recogida' else 'entrega' end,
                 case when r.fecha_obj is not null then ' el <strong>' || to_char(r.fecha_obj, 'DD/MM/YYYY') || '</strong>' else '' end,
                 escapar_html(r.nombre_empresa),
                 case when r.poblacion is not null then ', ' || escapar_html(r.poblacion) else '' end,
                 escapar_html(coalesce(parametro('dynamo_razon_social') #>> '{}', '')),
                 escapar_html(coalesce(parametro('dynamo_email') #>> '{}', '')),
                 escapar_html(coalesce(parametro('dynamo_telefono') #>> '{}', ''))))
  on conflict (clave) do nothing;
  -- Los avisos pendientes de esa parada ya no proceden.
  update emails_enviados set estado = 'omitido', error = 'La recogida o entrega se anuló antes de mandarlo.'
   where clave like 'aviso_parada:' || p_envio || ':' || p_parada || ':%' and estado = 'pendiente';
end $$;
revoke execute on function public.encolar_anulacion_parada(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
comment on function public.encolar_anulacion_parada(uuid, uuid, text, text, text, uuid) is '[Gestión interna] Si un sitio de la ruta YA fue avisado de una recogida o entrega, le encola el email de anulación (envío cancelado o parada quitada de la ruta) y deja en «omitido» sus avisos pendientes. Si nunca se le avisó, no hace nada. Recibe los datos de la parada como argumentos porque al quitarla la fila ya no existe. Quién: los disparadores de cancelación; nadie por la API. Argumentos: p_envio: envios.id · p_parada: envio_paradas.id · p_tipo: carga o descarga · p_nombre, p_poblacion_sitio: de la parada · p_sitio: sitios.id.';

-- Envío CANCELADO → anulación a cada sitio avisado.
create or replace function public.fn_envios_avisos_cancelado()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.estado = 'cancelado' and old.estado is distinct from 'cancelado' then
    for p in select id, tipo, nombre_empresa, poblacion, sitio_id from envio_paradas where envio_id = new.id loop
      perform encolar_anulacion_parada(new.id, p.id, p.tipo::text, p.nombre_empresa, p.poblacion, p.sitio_id);
    end loop;
  end if;
  return new;
end $$;
create trigger tg_envios_avisos_cancelado
  after update of estado on envios
  for each row execute function fn_envios_avisos_cancelado();
comment on function public.fn_envios_avisos_cancelado() is '[Gestión interna] Disparador: al pasar un envío a cancelado, encola el email de anulación a cada sitio de la ruta que ya había sido avisado de su recogida o entrega. Quién: disparador de envios. Argumentos: ninguno.';

-- Parada QUITADA de la ruta (con el envío vivo) → anulación solo a ese sitio.
create or replace function public.fn_paradas_aviso_quitada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Si el envío entero se está borrando (datos de prueba) o ya está cancelado (lo cubre
  -- el disparador de envíos), aquí no se hace nada.
  if exists (select 1 from envios e where e.id = old.envio_id and e.estado <> 'cancelado') then
    perform encolar_anulacion_parada(old.envio_id, old.id, old.tipo::text, old.nombre_empresa, old.poblacion, old.sitio_id);
  end if;
  return old;
end $$;
create trigger tg_paradas_aviso_quitada
  after delete on envio_paradas
  for each row execute function fn_paradas_aviso_quitada();
comment on function public.fn_paradas_aviso_quitada() is '[Gestión interna] Disparador: al quitar una parada de la ruta de un envío vivo, encola el email de anulación a ese sitio si ya había sido avisado. Con el envío cancelado o borrado no hace nada. Quién: disparador de envio_paradas. Argumentos: ninguno.';

-- ---- 5. El que manda la cola respeta las anulaciones ----------------------------------
-- Igual que antes, con UNA diferencia: el email de anulación de un envío cancelado SÍ
-- se manda (antes, cualquier pendiente de un envío cancelado quedaba omitido — correcto
-- para el resto de avisos, pero la anulación existe justo PORQUE se canceló).
create or replace function public.enviar_emails_pendientes()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_token text; v_req bigint; n int := 0; v_status int; v_body text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return 0; end if;
  if not exists (select 1 from pg_namespace where nspname = 'vault') then return 0; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v_token using 'postmark_token';
  if v_token is null or v_token = '' then return 0; end if;

  for r in select id, peticion_id from emails_enviados
            where estado = 'enviado' and postmark_id is null and peticion_id is not null
              and enviado_en > now() - interval '1 day'
  loop
    begin
      execute 'select status_code, content::text from net._http_response where id = $1' into v_status, v_body using r.peticion_id;
      if v_status is not null then
        if v_status between 200 and 299 then
          update emails_enviados set postmark_id = coalesce(v_body::jsonb ->> 'MessageID', 'ok') where id = r.id;
        else
          update emails_enviados set estado = 'error', error = left('Postmark ' || v_status || ': ' || coalesce(v_body, ''), 500) where id = r.id;
        end if;
      end if;
    exception when others then null;
    end;
  end loop;

  for r in select x.* from emails_enviados x where x.estado = 'pendiente' order by x.creado_en limit 20
  loop
    if r.envio_id is not null and r.tipo <> 'aviso_parada_cancelada'
       and exists (select 1 from envios e where e.id = r.envio_id and e.estado = 'cancelado') then
      update emails_enviados set estado = 'omitido', error = 'El envío se canceló antes de mandarlo.' where id = r.id;
      continue;
    end if;
    execute $q$select net.http_post(
        url := 'https://api.postmarkapp.com/email',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json', 'X-Postmark-Server-Token', $1),
        body := $2)$q$
      into v_req
      using v_token, jsonb_build_object('From', format('Dynamo <%s>', parametro('dynamo_email') #>> '{}'), 'To', r.destinatario,
                                        'Subject', r.asunto, 'HtmlBody', r.cuerpo_html, 'MessageStream', 'outbound');
    update emails_enviados set estado = 'enviado', enviado_en = now(), peticion_id = v_req where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
comment on function public.enviar_emails_pendientes() is '[Gestión interna] Manda los emails pendientes de la cola por la API de Postmark con pg_net (el token vive en el Vault de Supabase, secreto postmark_token) y, en cada pasada, anota la respuesta de la tanda anterior (MessageID o error de Postmark). Un envío cancelado entre medias queda omitido — salvo el propio email de anulación, que se manda. Sin pg_net, sin Vault o sin token, no hace nada (el PostgreSQL local de pruebas). Devuelve cuántos mandó. Quién: la tarea programada; nadie por la API. Argumentos: ninguno.';

-- ---- 6. La pasada completa incluye los avisos a los sitios ----------------------------
create or replace function public.procesar_emails_operativos()
returns int language plpgsql security definer set search_path = public as $$
begin
  perform encolar_avisos_operativos();
  perform encolar_avisos_paradas();
  return enviar_emails_pendientes();
end $$;
comment on function public.procesar_emails_operativos() is '[Gestión interna] La pasada completa de los emails operativos: encola lo que toque (matrículas, víspera y los avisos de recogida/entrega a los sitios) y manda la cola. La llama pg_cron cada 10 minutos. Quién: la tarea programada; nadie por la API. Argumentos: ninguno.';
