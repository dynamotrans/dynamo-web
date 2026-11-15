-- COPIA (CC) A DYNAMO EN LOS EMAILS DEL SISTEMA (usuario, 2026-11-15): todo email que
-- sale de la plataforma lleva en copia el email de Dynamo (Parámetros → dynamo_email),
-- MENOS las ofertas de la difusión a transportistas ('difusion' y
-- 'difusion_recordatorio': serían cientos de copias al día y no aportan nada).
-- Tampoco se añade la copia cuando el destinatario YA es Dynamo (los avisos internos:
-- envío aceptado, alta pendiente, fin de difusión, firmas…), para no duplicar.
-- Copia de la versión de 20261113230000 con el 'Cc' añadido al cuerpo de Postmark; el
-- gemelo del servidor web (enviarEmailOperativo) aplica la misma regla por su lado.
create or replace function public.enviar_emails_pendientes()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_token text; v_req bigint; n int := 0; v_status int; v_body text; v_dyn text; v_cc text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return 0; end if;
  if not exists (select 1 from pg_namespace where nspname = 'vault') then return 0; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v_token using 'postmark_token';
  if v_token is null or v_token = '' then return 0; end if;
  v_dyn := coalesce(parametro('dynamo_email') #>> '{}', '');

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
    -- La copia a Dynamo: en todo menos las ofertas de la difusión, y nunca duplicada.
    v_cc := case when r.tipo in ('difusion', 'difusion_recordatorio') then null
                 when v_dyn = '' then null
                 when position(lower(v_dyn) in lower(r.destinatario)) > 0 then null
                 else v_dyn end;
    execute $q$select net.http_post(
        url := 'https://api.postmarkapp.com/email',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json', 'X-Postmark-Server-Token', $1),
        body := $2)$q$
      into v_req
      using v_token, jsonb_build_object('From', format('Dynamo <%s>', parametro('dynamo_email') #>> '{}'), 'To', r.destinatario,
                                        'Subject', r.asunto, 'HtmlBody', r.cuerpo_html, 'MessageStream', 'outbound')
                     || case when v_cc is not null then jsonb_build_object('Cc', v_cc) else '{}'::jsonb end;
    update emails_enviados set estado = 'enviado', enviado_en = now(), peticion_id = v_req where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
comment on function public.enviar_emails_pendientes() is '[Gestión interna] Manda los emails pendientes de la cola por la API de Postmark con pg_net (el token vive en el Vault de Supabase, secreto postmark_token) y, en cada pasada, anota la respuesta de la tanda anterior (MessageID o error de Postmark). Todo email lleva en copia (Cc) el email de Dynamo, salvo las ofertas de la difusión a transportistas y los que ya van dirigidos a Dynamo. Un envío cancelado entre medias queda omitido — salvo el propio email de anulación, que se manda. Sin pg_net, sin Vault o sin token, no hace nada (el PostgreSQL local de pruebas). Devuelve cuántos mandó. Quién: la tarea programada; nadie por la API. Argumentos: ninguno.';
