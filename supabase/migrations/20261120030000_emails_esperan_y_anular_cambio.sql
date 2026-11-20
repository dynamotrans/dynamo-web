-- LOS EMAILS ESPERAN 30 SEGUNDOS Y EL CAMBIO SE PUEDE ANULAR (usuario, 2026-11-20):
-- «todos deben esperar por posibles cambios introducidos o incluso anulación… un contador en
-- la ficha y en la lista para ver cuánto le falta, e incluso poder deshacer ese cambio
-- pulsando el contador». Decidido con él:
--   · TODOS los emails esperan 30 segundos (Parámetros → emails_espera_segundos), también los
--     que se mandan a mano. Si en ese tiempo hay otro cambio en el mismo envío, el plazo vuelve
--     a empezar y todo sale junto al final.
--   · Cada cambio que hace una persona en un envío (crearlo, modificarlo, cancelarlo, asignarle
--     transportista, tocar su ruta) guarda una FOTO del envío y de sus paradas de antes.
--   · Mientras corre el plazo, Dynamo y quien hizo el cambio ven el contador; al pulsarlo,
--     «¿Anular el cambio realizado?»: el envío vuelve a como estaba (un envío recién creado
--     queda anulado sin coste) y los emails y avisos de ese cambio no salen.
-- Lo hacen solos los procesos automáticos (el seguimiento, la oferta escalonada…): no abren
-- cambio (no hay persona detrás), pero sus emails también esperan los 30 segundos.

insert into parametros (clave, valor, descripcion) values
  ('emails_espera_segundos', '30', 'Segundos que espera cada email antes de salir, para poder anular el cambio que lo provoca (o el propio email). 0 = salen sin esperar y no se pueden anular.')
on conflict (clave) do nothing;

-- ---- 1. La cola de emails: cuándo sale cada uno, quién lo pidió y por dónde ---------------
alter table emails_enviados add column if not exists enviar_desde timestamptz not null default now() + interval '30 seconds';
alter table emails_enviados add column if not exists creado_por uuid;
alter table emails_enviados add column if not exists via text not null default 'bd';
alter table emails_enviados add column if not exists opciones jsonb;
alter table emails_enviados add column if not exists cambio_id uuid;
do $$ begin
  alter table emails_enviados add constraint emails_enviados_via_check check (via in ('bd', 'web'));
exception when duplicate_object then null; end $$;
comment on column public.emails_enviados.enviar_desde is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo puede salir el email: al prepararlo, ahora + emails_espera_segundos; si en ese tiempo se vuelve a cambiar el envío, se retrasa hasta el final del nuevo plazo. Ej. OK: 2026-11-20T10:00:30+01:00';
comment on column public.emails_enviados.creado_por is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Usuario que provocó el email (auth.uid() o el que pasa el servidor web), para que pueda anularlo antes de que salga. Vacío = lo preparó un proceso automático.';
comment on column public.emails_enviados.via is 'formato: texto | rango: no aplica | lista: bd · web | obligatorio | Quién lo manda: bd = la cola de la base de datos; web = el servidor web (con su PDF adjunto) al terminar el plazo; si el servidor no lo manda, la cola lo hace a los 2 minutos.';
comment on column public.emails_enviados.opciones is 'formato: JSON | rango: no aplica | lista: de_nombre · remitente · responder_a · copia · sin_copia_dynamo · texto · adjuntos | opcional | Lo que llevan los emails del servidor web además del cuerpo: nombre del remitente, empresa que firma, responder a, copia, sin copia a Dynamo, versión en texto y los PDF adjuntos (en base64; se borran al mandarlo).';
comment on column public.emails_enviados.cambio_id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | El cambio del envío (envio_cambios) que provocó el email: si se anula el cambio, el email no sale.';
create index if not exists ix_emails_enviados_enviar_desde on emails_enviados (enviar_desde) where estado = 'pendiente';
create index if not exists ix_emails_enviados_envio_pendiente on emails_enviados (envio_id) where estado = 'pendiente';

-- ---- 2. Los cambios de los envíos, con la foto de antes ------------------------------------
create table if not exists envio_cambios (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null references envios(id) on delete cascade,
  usuario_id uuid,
  tipo text not null check (tipo in ('creado', 'modificado', 'cancelado', 'asignado')),
  antes jsonb,
  paradas_antes jsonb,
  creado_en timestamptz not null default now(),
  vence_en timestamptz not null,
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado', 'anulado')),
  anulado_en timestamptz,
  anulado_por uuid
);
create unique index if not exists ux_envio_cambios_abierto on envio_cambios (envio_id) where estado = 'abierto';
alter table envio_cambios enable row level security;
drop policy if exists envio_cambios_dynamo on envio_cambios;
create policy envio_cambios_dynamo on envio_cambios for select to authenticated using (ve_todo());
comment on table public.envio_cambios is 'Cambios recientes de los envíos hechos por una persona (crear, modificar, cancelar, asignar transportista, tocar la ruta), con la foto del envío y de sus paradas de antes. Mientras está abierto (los segundos de emails_espera_segundos) sus emails no salen y se puede anular: el envío vuelve a como estaba. Se borran a los 7 días.';
comment on column public.envio_cambios.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador del cambio.';
comment on column public.envio_cambios.envio_id is 'formato: uuid | rango: no aplica | lista: no aplica | obligatorio | El envío cambiado (envios.id).';
comment on column public.envio_cambios.usuario_id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Quién hizo el cambio (auth.uid()): además de Dynamo, es quien puede anularlo.';
comment on column public.envio_cambios.tipo is 'formato: texto | rango: no aplica | lista: creado · modificado · cancelado · asignado | obligatorio | Qué fue: crear el envío, modificarlo (datos o ruta), cancelarlo o asignarle transportista. Ej. OK: modificado';
comment on column public.envio_cambios.antes is 'formato: JSON | rango: no aplica | lista: no aplica | opcional | La fila del envío tal como estaba antes del primer cambio del plazo (vacío al crearlo).';
comment on column public.envio_cambios.paradas_antes is 'formato: JSON | rango: no aplica | lista: no aplica | opcional | Las paradas del envío tal como estaban antes del primer cambio del plazo (vacío al crearlo).';
comment on column public.envio_cambios.creado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo empezó el cambio.';
comment on column public.envio_cambios.vence_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | obligatorio | Hasta cuándo se puede anular: cada cambio nuevo del mismo envío lo vuelve a poner a ahora + emails_espera_segundos.';
comment on column public.envio_cambios.estado is 'formato: texto | rango: no aplica | lista: abierto · cerrado · anulado | obligatorio | abierto = corre el plazo; cerrado = pasó el plazo y salieron sus emails; anulado = se deshizo.';
comment on column public.envio_cambios.anulado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | opcional | Cuándo se anuló.';
comment on column public.envio_cambios.anulado_por is 'formato: uuid | rango: no aplica | lista: no aplica | opcional | Quién lo anuló.';

-- Las columnas que NO cuentan como un cambio de la persona (las ponen los disparadores o los
-- procesos automáticos) ni se restauran al anular.
create or replace function envio_columnas_tecnicas()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['modificado_en', 'modificado_por', 'texto_busqueda', 'parada_actual', 'seguimiento_automatico', 'ancla_paso',
               'ancla_hora', 'fecha_efectiva', 'distancia_total_km', 'num_paradas', 'codigo_postal_origen', 'poblacion_origen',
               'codigo_postal_destino', 'poblacion_destino', 'estado_asignacion', 'primera_oferta_en', 'publicado_en_bolsa_en',
               'precio_calculado_en', 'fecha_carga_real', 'cargado_en', 'entregado_en', 'valoracion_transportista',
               'valoracion_comentario', 'valoracion_cliente', 'valoracion_cliente_comentario', 'valoracion_cliente_en',
               'facturado_venta', 'facturado_compra', 'holded_pedido_venta', 'holded_pedido_compra', 'codigo_aceptacion',
               'revision_precio_recordada', 'confirmado_en', 'asignado_en', 'cancelado_en', 'tipo_carga', 'margen_euros',
               'es_manual', 'pago_pendiente_en', 'stripe_cobro_sin_aplicar', 'condiciones_aceptadas_en', 'estado']
$$;
comment on function envio_columnas_tecnicas() is '[Gestión interna] Columnas de envios que no cuentan como un cambio hecho por una persona (las rellenan los disparadores o los procesos automáticos). El estado cuenta aparte: solo al cancelar o reactivar y al confirmar un borrador. Quién: los disparadores de envio_cambios. Argumentos: ninguno.';

-- ---- 3. Abrir (o alargar) el cambio de un envío --------------------------------------------
create or replace function envio_cambio_abrir(p_envio uuid, p_tipo text, p_antes jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare c envio_cambios%rowtype; v_seg int := greatest(0, parametro_num('emails_espera_segundos', 30)::int); v_vence timestamptz;
begin
  if auth.uid() is null or v_seg = 0 or coalesce(current_setting('dynamo.anulando', true), '') = 'on' then return null; end if;
  -- El envío se está borrando (sus paradas se van con él): no hay nada que anular.
  if not exists (select 1 from envios where id = p_envio) then return null; end if;
  v_vence := now() + make_interval(secs => v_seg);
  select * into c from envio_cambios where envio_id = p_envio and estado = 'abierto' for update;
  if found and c.vence_en > now() then
    -- Otro cambio dentro del plazo: se junta con el primero (la foto de antes no cambia) y
    -- el plazo vuelve a empezar, también para sus emails.
    update envio_cambios set vence_en = v_vence,
           tipo = case when p_tipo in ('cancelado', 'asignado') then p_tipo else tipo end
     where id = c.id;
    update emails_enviados set enviar_desde = greatest(enviar_desde, v_vence) where cambio_id = c.id and estado = 'pendiente';
    return c.id;
  end if;
  if found then update envio_cambios set estado = 'cerrado' where id = c.id; end if;
  insert into envio_cambios (envio_id, usuario_id, tipo, antes, paradas_antes, vence_en)
  values (p_envio, auth.uid(), p_tipo,
          case when p_tipo = 'creado' then null else coalesce(p_antes, (select to_jsonb(e) from envios e where e.id = p_envio)) end,
          case when p_tipo = 'creado' then null
               else (select coalesce(jsonb_agg(to_jsonb(p) order by p.orden), '[]'::jsonb) from envio_paradas p where p.envio_id = p_envio) end,
          v_vence)
  returning id into c.id;
  return c.id;
end $$;
revoke all on function envio_cambio_abrir(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function envio_cambio_abrir(uuid, text, jsonb) to service_role;
comment on function envio_cambio_abrir(uuid, text, jsonb) is '[Gestión interna] Abre el cambio de un envío hecho por una persona (con la foto de antes) o, si ya hay uno abierto, lo junta y vuelve a empezar el plazo. Sin persona (procesos automáticos) o con emails_espera_segundos = 0, no hace nada. Quién: los disparadores de envios y envio_paradas. Argumentos: p_envio: envios.id · p_tipo: creado, modificado, cancelado o asignado · p_antes: la fila de antes.';

create or replace function fn_envios_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_tec text[] := envio_columnas_tecnicas(); v_tipo text;
begin
  if auth.uid() is null or coalesce(current_setting('dynamo.anulando', true), '') = 'on' then return null; end if;
  if tg_op = 'INSERT' then
    perform envio_cambio_abrir(new.id, 'creado', null);
    return null;
  end if;
  -- Solo lo que cambia una persona: las columnas técnicas no cuentan, y el estado solo al
  -- cancelar, reactivar o confirmar un borrador (no los pasos del viaje).
  if (to_jsonb(new) - v_tec) is not distinct from (to_jsonb(old) - v_tec)
     and not (new.estado is distinct from old.estado
              and (new.estado in ('cancelado', 'borrador') or old.estado in ('cancelado', 'borrador'))) then
    return null;
  end if;
  v_tipo := case when new.estado = 'cancelado' and old.estado <> 'cancelado' then 'cancelado'
                 when new.transportista_id is not null and new.transportista_id is distinct from old.transportista_id then 'asignado'
                 else 'modificado' end;
  perform envio_cambio_abrir(new.id, v_tipo, to_jsonb(old));
  return null;
end $$;
drop trigger if exists tg_aa_envios_cambio on envios;
create trigger tg_aa_envios_cambio after insert or update on envios for each row execute function fn_envios_cambio();

-- Las paradas: ANTES de tocarlas, para que la foto las coja como estaban.
create or replace function fn_envio_paradas_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_tec text[] := array['realizado_en', 'distancia_siguiente_km', 'modificado_en', 'modificado_por', 'lat', 'lon'];
begin
  if auth.uid() is null or coalesce(current_setting('dynamo.anulando', true), '') = 'on' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - v_tec) is not distinct from (to_jsonb(old) - v_tec) then return new; end if;
  perform envio_cambio_abrir(coalesce(new.envio_id, old.envio_id), 'modificado', null);
  return coalesce(new, old);
end $$;
drop trigger if exists tg_aa_envio_paradas_cambio on envio_paradas;
create trigger tg_aa_envio_paradas_cambio before insert or update or delete on envio_paradas for each row execute function fn_envio_paradas_cambio();

-- ---- 4. Cada email nuevo: espera el plazo y se cuelga del cambio abierto de su envío -------
create or replace function fn_emails_espera()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_seg int := greatest(0, parametro_num('emails_espera_segundos', 30)::int); v_vence timestamptz;
begin
  new.creado_por := coalesce(new.creado_por, auth.uid());
  new.enviar_desde := greatest(coalesce(new.enviar_desde, now()), now() + make_interval(secs => v_seg));
  if v_seg = 0 then new.enviar_desde := now(); end if;
  if new.envio_id is not null and new.estado = 'pendiente' then
    select id, vence_en into new.cambio_id, v_vence from envio_cambios
     where envio_id = new.envio_id and estado = 'abierto' and vence_en > now();
    if v_vence is not null then new.enviar_desde := greatest(new.enviar_desde, v_vence); end if;
  end if;
  return new;
end $$;
drop trigger if exists tg_emails_espera on emails_enviados;
create trigger tg_emails_espera before insert on emails_enviados for each row execute function fn_emails_espera();

-- ---- 5. La cola: solo lo que ya ha esperado; los del servidor web, si él no los mandó -------
create or replace function public.enviar_emails_pendientes()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_token text; v_req bigint; n int := 0; v_status int; v_body text; v_dyn text; v_cc text; v_op jsonb;
begin
  -- Lo que lleva más de 24 horas pendiente ya no se manda (queda como omitido).
  update emails_enviados set estado = 'omitido', error = 'Llevaba más de 24 horas sin poder enviarse: ya no se manda.'
   where estado = 'pendiente' and creado_en < now() - interval '24 hours';
  -- Direcciones de prueba (.invalid no existe): no se mandan, para no generar rebotes.
  update emails_enviados set estado = 'omitido', error = 'Dirección de prueba (.invalid): no se envía.'
   where estado = 'pendiente' and destinatario ~* '\.invalid(\s|>|,|;|$)';
  -- Los cambios cuyo plazo ya pasó se cierran; los de hace más de 7 días se borran.
  update envio_cambios set estado = 'cerrado' where estado = 'abierto' and vence_en < now() - interval '1 minute';
  delete from envio_cambios where estado <> 'abierto' and creado_en < now() - interval '7 days';
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

  -- Solo lo que ya ha esperado su plazo. Los del servidor web los manda él; la cola solo los
  -- recoge si a los 2 minutos siguen sin salir.
  for r in select x.* from emails_enviados x where x.estado = 'pendiente'
             and x.enviar_desde <= now()
             and (x.via = 'bd' or x.enviar_desde < now() - interval '2 minutes')
           order by x.enviar_desde limit 100 for update skip locked
  loop
    if r.envio_id is not null and r.tipo <> 'aviso_parada_cancelada'
       and exists (select 1 from envios e where e.id = r.envio_id and e.estado = 'cancelado') then
      update emails_enviados set estado = 'omitido', error = 'El envío se canceló antes de mandarlo.' where id = r.id;
      continue;
    end if;
    v_op := coalesce(r.opciones, '{}'::jsonb);
    -- La copia a Dynamo: en todo menos las ofertas de la difusión, el resumen a los sitios y lo
    -- que el cliente manda a su propio transportista; nunca duplicada.
    v_cc := case when r.tipo in ('difusion', 'difusion_recordatorio', 'resumen_sitio') then null
                 when coalesce((v_op ->> 'sin_copia_dynamo')::boolean, false) then null
                 when v_dyn = '' then null
                 when position(lower(v_dyn) in lower(r.destinatario)) > 0 then null
                 else v_dyn end;
    v_cc := nullif(concat_ws(', ', nullif(v_op ->> 'copia', ''), v_cc), '');
    execute $q$select net.http_post(
        url := 'https://api.postmarkapp.com/email',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json', 'X-Postmark-Server-Token', $1),
        body := $2)$q$
      into v_req
      using v_token, jsonb_build_object('From', format('%s <%s>', coalesce(nullif(v_op ->> 'de_nombre', ''), 'Dynamotrans.com'), parametro('dynamo_email') #>> '{}'),
                                        'To', r.destinatario, 'Subject', r.asunto,
                                        'HtmlBody', email_con_diseno(r.cuerpo_html, nullif(v_op ->> 'remitente', '')),
                                        'MessageStream', case when r.tipo = 'resumen_sitio' then 'broadcast' else 'outbound' end)
                     || case when v_cc is not null then jsonb_build_object('Cc', v_cc) else '{}'::jsonb end
                     || case when nullif(v_op ->> 'responder_a', '') is not null then jsonb_build_object('ReplyTo', v_op ->> 'responder_a') else '{}'::jsonb end
                     || case when nullif(v_op ->> 'texto', '') is not null then jsonb_build_object('TextBody', v_op ->> 'texto') else '{}'::jsonb end
                     || case when jsonb_typeof(v_op -> 'adjuntos') = 'array' then jsonb_build_object('Attachments', v_op -> 'adjuntos') else '{}'::jsonb end;
    update emails_enviados set estado = 'enviado', enviado_en = now(), peticion_id = v_req,
           opciones = case when opciones ? 'adjuntos' then opciones - 'adjuntos' else opciones end
     where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
comment on function public.enviar_emails_pendientes() is '[Gestión interna] Manda por Postmark (pg_net, token en el Vault: postmark_token) los emails de la cola que ya han esperado su plazo (enviar_desde): los de la base de datos y, como respaldo a los 2 minutos, los del servidor web que no salieron. Lleva el diseño común, copia a Dynamo (salvo la difusión, el resumen a los sitios y lo que un cliente manda a su transportista), responder a, texto y adjuntos. Anota la respuesta de la tanda anterior, omite lo de envíos cancelados, lo de más de 24 horas y las direcciones .invalid, cierra los cambios vencidos y borra los de hace 7 días. Sin pg_net, Vault o token no manda nada. Quién: la tarea programada; nadie por la API. Argumentos: ninguno.';

-- Cada 10 segundos (si pg_cron lo admite; si no, sigue la de cada minuto).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('dynamo-emails-enviar', '10 seconds', 'select public.enviar_emails_pendientes()');
    exception when others then null;
    end;
  end if;
end $$;

-- ---- 6. El contador: qué envíos tienen un cambio o un email esperando ---------------------
create or replace function pendientes_envios(p_ids uuid[])
returns table (envio_id uuid, vence_en timestamptz, tipo text, autor text, puede_anular boolean, emails int)
language sql
stable
security definer
set search_path = public
as $$
  select e.id,
         greatest(c.vence_en, m.hasta),
         coalesce(c.tipo, 'email'),
         (select coalesce(nullif(u.nombre, ''), u.email) from usuarios u where u.id = c.usuario_id),
         ve_todo() or c.usuario_id = auth.uid() or (c.id is null and m.mios > 0),
         coalesce(m.n, 0)::int
    from envios e
    left join envio_cambios c on c.envio_id = e.id and c.estado = 'abierto' and c.vence_en > now()
    left join lateral (select count(*) as n, max(x.enviar_desde) as hasta, count(*) filter (where x.creado_por = auth.uid()) as mios
                         from emails_enviados x
                        where x.envio_id = e.id and x.estado = 'pendiente' and x.enviar_desde > now()) m on true
   where e.id = any (p_ids) and cardinality(p_ids) <= 200
     and (ve_todo() or e.cliente_id = cliente_del_usuario() or e.transportista_id = transportista_del_usuario())
     and (c.id is not null or m.n > 0)
     and (ve_todo() or c.usuario_id = auth.uid() or (c.id is null and m.mios > 0))
$$;
revoke all on function pendientes_envios(uuid[]) from public, anon;
grant execute on function pendientes_envios(uuid[]) to authenticated, service_role;
comment on function pendientes_envios(uuid[]) is '[Envíos] Para el contador de la lista y la ficha (máx. 200 ids): los envíos con un cambio reciente o un email esperando su plazo, hasta cuándo, qué fue (creado, modificado, cancelado, asignado o email), quién lo hizo, si quien pregunta lo puede anular y cuántos emails esperan. Quién: Dynamo ve todos; los demás, solo los cambios y emails que hicieron ellos. Argumentos: p_ids: envios.id.';

-- ---- 7. Volver un envío a la foto de antes ---------------------------------------------------
create or replace function envio_restaurar(p_envio uuid, p_antes jsonb, p_paradas jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fuera text[] := array['id', 'referencia_gx', 'token_publico', 'creado_en', 'creado_por', 'modificado_en', 'modificado_por', 'texto_busqueda'];
  v_cols text; v_rcols text; v_pcols text; v_prcols text; p jsonb; v_ahora jsonb; v_antes jsonb;
  v_ptec text[] := array['creado_en', 'creado_por', 'modificado_en', 'modificado_por'];
begin
  if p_antes is not null then
    select string_agg(format('%I', a.attname), ', ' order by a.attnum), string_agg(format('r.%I', a.attname), ', ' order by a.attnum)
      into v_cols, v_rcols
      from pg_attribute a
     where a.attrelid = 'public.envios'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
       and not (a.attname = any (v_fuera));
    if (select to_jsonb(e) from envios e where e.id = p_envio) - v_fuera is distinct from p_antes - v_fuera then
      execute format('update envios e set (%s) = (select %s from jsonb_populate_record(null::envios, $1) r) where e.id = $2', v_cols, v_rcols)
        using p_antes, p_envio;
    end if;
  end if;
  if p_paradas is not null then
    select coalesce(jsonb_agg(to_jsonb(x) - v_ptec order by x.orden), '[]'::jsonb) into v_ahora from envio_paradas x where x.envio_id = p_envio;
    select coalesce(jsonb_agg(y - v_ptec order by (y ->> 'orden')::int), '[]'::jsonb) into v_antes from jsonb_array_elements(p_paradas) y;
    if v_ahora is distinct from v_antes then
      delete from envio_paradas where envio_id = p_envio
         and id not in (select (y ->> 'id')::uuid from jsonb_array_elements(p_paradas) y);
      -- Fuera del camino primero (el orden de cada parada es único en su envío).
      update envio_paradas set orden = orden + 100 where envio_id = p_envio;
      select string_agg(format('%I', a.attname), ', ' order by a.attnum), string_agg(format('r.%I', a.attname), ', ' order by a.attnum)
        into v_pcols, v_prcols
        from pg_attribute a
       where a.attrelid = 'public.envio_paradas'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
         and not (a.attname = any (array['id', 'creado_en', 'creado_por', 'modificado_en', 'modificado_por']));
      for p in select y from jsonb_array_elements(p_paradas) y loop
        if exists (select 1 from envio_paradas where id = (p ->> 'id')::uuid) then
          execute format('update envio_paradas t set (%s) = (select %s from jsonb_populate_record(null::envio_paradas, $1) r) where t.id = $2', v_pcols, v_prcols)
            using p, (p ->> 'id')::uuid;
        else
          insert into envio_paradas select * from jsonb_populate_record(null::envio_paradas, p);
        end if;
      end loop;
    end if;
  end if;
end $$;
revoke all on function envio_restaurar(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function envio_restaurar(uuid, jsonb, jsonb) to service_role;
comment on function envio_restaurar(uuid, jsonb, jsonb) is '[Gestión interna] Devuelve un envío y sus paradas a una foto anterior (la de envio_cambios). Quién: anular_cambio_envio. Argumentos: p_envio: envios.id · p_antes: la fila de antes · p_paradas: las paradas de antes.';

-- ---- 8. «¿Anular el cambio realizado?» -------------------------------------------------------
create or replace function anular_cambio_envio(p_envio uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare c envio_cambios%rowtype; n int;
begin
  if auth.uid() is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  select * into c from envio_cambios where envio_id = p_envio and estado = 'abierto' for update;
  if found then
    if not (ve_todo() or c.usuario_id = auth.uid()) then
      raise exception 'Este cambio solo lo puede anular quien lo hizo o Dynamo.' using errcode = '42501';
    end if;
    -- Unos segundos de margen por lo que tarda en llegar la pulsación.
    if c.vence_en < now() - interval '3 seconds' or exists (select 1 from emails_enviados where cambio_id = c.id and estado = 'enviado') then
      return jsonb_build_object('resultado', 'ya_salio');
    end if;
    perform set_config('dynamo.anulando', 'on', true);
    begin
      if c.tipo = 'creado' then
        update envios set estado = 'cancelado', cancelacion_sin_coste = true where id = p_envio and estado <> 'cancelado';
      else
        perform envio_restaurar(p_envio, c.antes, c.paradas_antes);
      end if;
    exception when others then
      perform set_config('dynamo.anulando', '', true);
      return jsonb_build_object('resultado', 'no_se_puede', 'error', sqlerrm);
    end;
    -- Lo que provocó el cambio (y lo que acaba de provocar volver atrás) no sale.
    delete from penalizaciones where envio_id = p_envio and generada_auto and creado_en >= c.creado_en;
    delete from avisos where envio_id = p_envio and creado_en >= c.creado_en;
    update emails_enviados set estado = 'omitido', error = 'Cambio anulado antes de salir: no se manda.'
     where envio_id = p_envio and estado = 'pendiente' and creado_en >= c.creado_en;
    update envio_cambios set estado = 'anulado', anulado_en = now(), anulado_por = auth.uid() where id = c.id;
    perform set_config('dynamo.anulando', '', true);
    return jsonb_build_object('resultado', 'anulado', 'tipo', c.tipo);
  end if;
  -- Sin cambio abierto: los emails que esperan (los mandados a mano).
  update emails_enviados set estado = 'omitido', error = 'Anulado antes de salir.'
   where envio_id = p_envio and estado = 'pendiente' and enviar_desde > now() - interval '3 seconds'
     and (ve_todo() or creado_por = auth.uid());
  get diagnostics n = row_count;
  return jsonb_build_object('resultado', case when n > 0 then 'email_anulado' else 'nada' end, 'emails', n);
end $$;
revoke all on function anular_cambio_envio(uuid) from public, anon;
grant execute on function anular_cambio_envio(uuid) to authenticated, service_role;
comment on function anular_cambio_envio(uuid) is '[Envíos] «¿Anular el cambio realizado?» del contador: mientras corre el plazo, el envío vuelve a como estaba antes del cambio (uno recién creado queda anulado sin coste) y sus emails, avisos y penalizaciones automáticas no salen. Sin cambio abierto, anula los emails que esperan. Devuelve resultado anulado / email_anulado / ya_salio / no_se_puede / nada. Quién: Dynamo o quien hizo el cambio. Argumentos: p_envio: envios.id.';
