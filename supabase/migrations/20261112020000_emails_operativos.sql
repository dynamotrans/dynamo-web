-- =====================================================================================
-- EMAILS OPERATIVOS, FASE 1 (usuario, 2026-11-12: «mails de nueva orden de carga,
-- petición de matrículas si 2 horas antes de la carga no están anotadas, recordatorios
-- de que mañana cargamos…»). Esta migración pone la BASE y los dos avisos DE RELOJ:
--
--   · Tabla `emails_enviados`: cola y registro de TODO email operativo (también los
--     que mande el servidor web), con clave única anti-duplicados. Solo lo lee Dynamo.
--   · `encolar_avisos_operativos()`: detecta y encola, con su asunto y su cuerpo ya
--     montados — (a) MATRÍCULAS: envío de Dynamo con transportista y sin matrícula a
--     2 horas o menos de la hora de carga de la 1.ª parada (su cita, o las 8:00 del
--     día de carga si no hay cita) → email al transportista con el enlace del CMR,
--     donde se anotan; (b) VÍSPERA: a partir de las 17:00, recordatorio al creador
--     del envío (y sus emails de copia) de que mañana se carga.
--   · `enviar_emails_pendientes()`: manda la cola por la API de Postmark con pg_net,
--     con el token guardado en el Vault de Supabase (secreto `postmark_token`), y en
--     la pasada siguiente anota la respuesta (MessageID o error). Sin pg_net o sin
--     Vault (el PostgreSQL local de pruebas), no hace nada y la cola espera.
--   · Tarea pg_cron cada 10 minutos.
--
-- Los avisos DE EVENTO (orden de carga al asignar, firmas del CMR con PDF) los manda
-- el servidor web con el mismo registro; vienen en su propio cambio.
-- =====================================================================================

-- ---- 0. La URL pública de la plataforma, editable en Parámetros ---------------------
insert into parametros (clave, valor, descripcion) values
  ('url_plataforma', '"https://dynamo-web-git-pruebas-dynamotrans-projects.vercel.app"',
   'URL pública de la plataforma, SIN barra final: con ella se montan los enlaces de los emails operativos (página de firmas del CMR, panel). Al pasar a producción, cambiarla por https://www.dynamotrans.com')
on conflict (clave) do nothing;

-- ---- 1. El registro/cola ------------------------------------------------------------
create table emails_enviados (
  id            uuid primary key default gen_random_uuid(),
  clave         text not null unique,
  tipo          text not null check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo')),
  envio_id      uuid references envios(id) on delete set null,
  destinatario  text not null,
  asunto        text not null,
  cuerpo_html   text not null,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'error', 'omitido')),
  error         text,
  peticion_id   bigint,
  postmark_id   text,
  creado_en     timestamptz not null default now(),
  enviado_en    timestamptz
);
create index ix_emails_enviados_pendientes on emails_enviados (creado_en) where estado = 'pendiente';
create index ix_emails_enviados_envio on emails_enviados (envio_id);
-- Sin activar_rastro: es un registro operativo que ya es su propia auditoría (quién,
-- qué y cuándo); auditar cada insert duplicaría las filas sin aportar nada.
alter table emails_enviados enable row level security;
create policy emails_enviados_lee_dynamo on emails_enviados for select to authenticated using (ve_todo());
-- Sin políticas de escritura: por la API no escribe NADIE (ni Dynamo). Escriben las
-- funciones de abajo (security definer) y el servidor web (service_role).

comment on table public.emails_enviados is '[Gestión interna] Registro y cola de los emails operativos de la plataforma (petición de matrículas, recordatorio de víspera, orden de carga, firmas del CMR): cada aviso con su clave única (no se duplica), su destinatario, su contenido y cómo acabó (pendiente, enviado, error u omitido). Encola encolar_avisos_operativos(), manda enviar_emails_pendientes() por Postmark, y el servidor web añade los suyos. Quién: solo lo lee el equipo de Dynamo; no se escribe por la API.';
comment on column public.emails_enviados.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único del email operativo.';
comment on column public.emails_enviados.clave is 'formato: texto | rango: no aplica | lista: no aplica | obligatorio | Clave única anti-duplicados del aviso, p. ej. matriculas:<envio_id> o vispera:<envio_id>:<fecha>. Ej. OK: matriculas:0b818…';
comment on column public.emails_enviados.tipo is 'formato: texto | rango: no aplica | lista: matriculas · vispera · orden_carga · firma_cmr · cmr_completo | obligatorio | Qué aviso es. Ej. OK: matriculas';
comment on column public.emails_enviados.envio_id is 'formato: UUID | rango: no aplica | lista: no aplica | opcional | Envío al que se refiere el aviso, si aplica. Ej. OK: 0b818…';
comment on column public.emails_enviados.destinatario is 'formato: texto | rango: no aplica | lista: no aplica | obligatorio | A quién va (uno o varios emails separados por comas); «—» si no se encontró ninguno (queda en error). Ej. OK: trafico@transportes.com';
comment on column public.emails_enviados.asunto is 'formato: texto | rango: no aplica | lista: no aplica | obligatorio | Asunto del email tal y como se manda. Ej. OK: Faltan las matrículas · envío #2026-18';
comment on column public.emails_enviados.cuerpo_html is 'formato: HTML | rango: no aplica | lista: no aplica | obligatorio | Cuerpo del email tal y como se manda (auditoría de lo enviado).';
comment on column public.emails_enviados.estado is 'formato: texto | rango: no aplica | lista: pendiente · enviado · error · omitido | obligatorio | Cómo va: pendiente (en cola), enviado (entregado a Postmark), error (sin destinatario o Postmark lo rechazó), omitido (el envío se canceló antes de mandarlo). Ej. OK: enviado';
comment on column public.emails_enviados.error is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Por qué quedó en error u omitido, en palabras llanas.';
comment on column public.emails_enviados.peticion_id is 'formato: número entero | rango: no aplica | lista: no aplica | opcional | Id de la petición de pg_net con la que se mandó (para leer la respuesta de Postmark en la pasada siguiente).';
comment on column public.emails_enviados.postmark_id is 'formato: texto | rango: no aplica | lista: no aplica | opcional | MessageID que devolvió Postmark al aceptarlo (trazabilidad en su panel).';
comment on column public.emails_enviados.creado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se encoló. La pone la base de datos.';
comment on column public.emails_enviados.enviado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | opcional | Cuándo se entregó a Postmark.';

-- ---- 2. Escape mínimo de HTML para textos que vienen de datos -----------------------
create or replace function public.escapar_html(t text)
returns text language sql immutable as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;
revoke execute on function public.escapar_html(text) from public, anon;
comment on function public.escapar_html(text) is '[Gestión interna] Escapa &, < y > para incrustar un texto de la base de datos en el HTML de un email operativo. Quién: funciones internas. Argumentos: t: texto | opcional.';

-- ---- 3. Encolar los avisos de reloj -------------------------------------------------
create or replace function public.encolar_avisos_operativos()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0; v_cnt int; r record; v_tok uuid; v_para text; v_hora timestamptz;
  base_url text := coalesce(parametro('url_plataforma') #>> '{}', '');
  -- Los datos de Dynamo salen de Parámetros (una sola fuente), nunca escritos a mano.
  d_firma text := coalesce(parametro('dynamo_razon_social') #>> '{}', '');
  d_email text := coalesce(parametro('dynamo_email') #>> '{}', '');
  d_tel   text := coalesce(parametro('dynamo_telefono') #>> '{}', '');
begin
  -- (a) MATRÍCULAS: envío de Dynamo con transportista, sin matrícula, a 2 h o menos de
  -- la hora de carga de la 1.ª parada (su cita; sin cita, las 8:00 del día de carga).
  -- La ventana se cierra 4 h después de la hora: más tarde ya no tiene sentido avisar.
  for r in
    select e.id, e.referencia_gx, e.transportista_id,
           coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde) as fecha,
           (select p.fecha_desde from envio_paradas p where p.envio_id = e.id and p.tipo = 'carga' order by p.orden limit 1) as cita,
           (select p.poblacion  from envio_paradas p where p.envio_id = e.id and p.tipo = 'carga' order by p.orden limit 1) as origen
      from envios e
     where e.estado in ('programado', 'hacia_la_carga') and not coalesce(e.es_manual, false)
       and e.transportista_id is not null and e.matricula_camion is null
       and coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde)
           between (now() at time zone 'Europe/Madrid')::date - 1 and (now() at time zone 'Europe/Madrid')::date + 1
  loop
    v_hora := coalesce(r.cita, ((r.fecha::text || ' 08:00')::timestamp at time zone 'Europe/Madrid'));
    continue when now() < v_hora - interval '2 hours' or now() > v_hora + interval '4 hours';
    select c.email into v_para from contactos c
     where c.transportista_id = r.transportista_id and c.email is not null
     order by c.es_principal desc, c.creado_en limit 1;
    -- El enlace del CMR del envío (se crea si no hay uno vivo): ahí se anotan las
    -- matrículas al firmar la cabecera.
    select token into v_tok from cmr_enlaces where envio_id = r.id and not revocado and caduca_en > now() limit 1;
    if v_tok is null then insert into cmr_enlaces (envio_id) values (r.id) returning token into v_tok; end if;
    insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html, estado, error)
    values ('matriculas:' || r.id, 'matriculas', r.id, coalesce(v_para, '—'),
      format('Faltan las matrículas · envío #%s · carga a las %s', r.referencia_gx, to_char(v_hora at time zone 'Europe/Madrid', 'HH24:MI')),
      format('<p>Hola,</p><p>El envío <strong>#%s</strong> carga a las <strong>%s</strong>%s y todavía no tenemos las <strong>matrículas del camión</strong>.</p>'
             || '<p><a href="%s/cmr/%s">Anótalas aquí</a> (se piden al firmar la cabecera del CMR), o respóndenos a este email. Urgencias 24 h: %s.</p>'
             || '<p>— %s · %s</p>',
             escapar_html(r.referencia_gx), to_char(v_hora at time zone 'Europe/Madrid', 'HH24:MI'),
             case when r.origen is not null then ' en ' || escapar_html(r.origen) else '' end, base_url, v_tok,
             escapar_html(d_tel), escapar_html(d_firma), escapar_html(d_email)),
      case when v_para is null then 'error' else 'pendiente' end,
      case when v_para is null then 'El transportista no tiene ningún contacto con email: avisar a mano.' end)
    on conflict (clave) do nothing;
    get diagnostics v_cnt = row_count; n := n + v_cnt;
  end loop;

  -- (b) VÍSPERA: a partir de las 17:00 (Madrid), recordatorio al creador del envío (y
  -- sus emails de copia) de que MAÑANA se carga. Solo envíos de Dynamo programados.
  if (now() at time zone 'Europe/Madrid')::time >= time '17:00' then
    for r in
      select e.id, e.referencia_gx, u.email, u.emails_copia_avisos,
             coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde) as fecha,
             (select p.poblacion from envio_paradas p where p.envio_id = e.id and p.tipo = 'carga' order by p.orden limit 1) as origen,
             (select p.poblacion from envio_paradas p where p.envio_id = e.id and p.tipo = 'descarga' order by p.orden desc limit 1) as destino
        from envios e join usuarios u on u.id = e.creado_por
       where e.estado = 'programado' and not coalesce(e.es_manual, false)
         and coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde) = (now() at time zone 'Europe/Madrid')::date + 1
    loop
      v_para := array_to_string(r.email || coalesce(r.emails_copia_avisos, '{}'), ',');
      insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
      values ('vispera:' || r.id || ':' || r.fecha, 'vispera', r.id, v_para,
        format('Mañana cargamos tu envío #%s (%s → %s)', r.referencia_gx, coalesce(r.origen, '—'), coalesce(r.destino, '—')),
        format('<p>Hola,</p><p>Recordatorio: <strong>mañana, %s</strong>, cargamos tu envío <strong>#%s</strong> (%s → %s).</p>'
               || '<p>Ten la mercancía lista en el punto de carga. Lo sigues en vivo en <a href="%s/panel/envios">tu panel</a>.</p>'
               || '<p>— %s · %s · %s</p>',
               to_char(r.fecha, 'DD/MM/YYYY'), escapar_html(r.referencia_gx), escapar_html(coalesce(r.origen, '—')),
               escapar_html(coalesce(r.destino, '—')), base_url, escapar_html(d_firma), escapar_html(d_email), escapar_html(d_tel)))
      on conflict (clave) do nothing;
      get diagnostics v_cnt = row_count; n := n + v_cnt;
    end loop;
  end if;
  return n;
end $$;
revoke execute on function public.encolar_avisos_operativos() from public, anon, authenticated;
comment on function public.encolar_avisos_operativos() is '[Gestión interna] Encola los emails operativos de reloj, cada uno UNA sola vez (clave única): la petición de matrículas al transportista a 2 horas o menos de la hora de carga de la 1.ª parada (su cita, o las 8:00 del día de carga) con el enlace del CMR, y el recordatorio de víspera al creador del envío (y sus emails de copia) a partir de las 17:00. Devuelve cuántos encoló. Quién: la tarea programada; nadie por la API. Argumentos: ninguno.';

-- ---- 4. Mandar la cola por Postmark (pg_net + Vault) --------------------------------
-- Las llamadas a net.* y vault.* van en SQL dinámico a propósito: en el PostgreSQL
-- local de pruebas esos esquemas no existen y la función debe crearse y no hacer nada.
create or replace function public.enviar_emails_pendientes()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_token text; v_req bigint; n int := 0; v_status int; v_body text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return 0; end if;
  if not exists (select 1 from pg_namespace where nspname = 'vault') then return 0; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v_token using 'postmark_token';
  if v_token is null or v_token = '' then return 0; end if;

  -- Cerrar la tanda anterior: anotar qué contestó Postmark a cada petición.
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
    exception when others then null;   -- pg_net purga respuestas viejas: se queda como enviado
    end;
  end loop;

  for r in select x.* from emails_enviados x where x.estado = 'pendiente' order by x.creado_en limit 20
  loop
    -- Si el envío se canceló entre el encolado y el envío, el aviso ya no procede.
    if r.envio_id is not null and exists (select 1 from envios e where e.id = r.envio_id and e.estado = 'cancelado') then
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
revoke execute on function public.enviar_emails_pendientes() from public, anon, authenticated;
comment on function public.enviar_emails_pendientes() is '[Gestión interna] Manda los emails pendientes de la cola por la API de Postmark con pg_net (el token vive en el Vault de Supabase, secreto postmark_token) y, en cada pasada, anota la respuesta de la tanda anterior (MessageID o error de Postmark). Un envío cancelado entre medias queda omitido. Sin pg_net, sin Vault o sin token, no hace nada (el PostgreSQL local de pruebas). Devuelve cuántos mandó. Quién: la tarea programada; nadie por la API. Argumentos: ninguno.';

create or replace function public.procesar_emails_operativos()
returns int language plpgsql security definer set search_path = public as $$
begin
  perform encolar_avisos_operativos();
  return enviar_emails_pendientes();
end $$;
revoke execute on function public.procesar_emails_operativos() from public, anon, authenticated;
comment on function public.procesar_emails_operativos() is '[Gestión interna] La pasada completa de los emails operativos: encola lo que toque y manda la cola. La llama pg_cron cada 10 minutos. Quién: la tarea programada; nadie por la API. Argumentos: ninguno.';

-- ---- 5. La tarea, cada 10 minutos ---------------------------------------------------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-emails-operativos', '*/10 * * * *', 'select public.procesar_emails_operativos()');
  end if;
end $$;
