-- =====================================================================================
-- TRANSFERENCIA AVISADA: EMAIL PROPIO A DYNAMO, AL MOMENTO (usuario, 2026-11-25)
-- =====================================================================================
-- «Ese aviso debería llegar a admin para saber rápido en el banco si nos pagó.»
-- Ya le llegaban el aviso urgente de la campana, el envío arriba del todo en la lista y una
-- COPIA del email del cliente («la estamos validando»), que se pierde entre las demás copias
-- y sale con el minuto de espera. Ahora, además, Dynamo recibe su propio email:
--   · asunto que se entiende solo: «Validar cobro · #GX… · 1.210,00 € · Cliente»;
--   · lo que hay que buscar en el banco: importe con IVA, concepto PRO-GX… y quién paga;
--   · botón a la ficha, donde se marca recibida o se rechaza;
--   · sin espera (no hay nada que deshacer: el cliente ya ha avisado).

-- ---- 1. El tipo nuevo -------------------------------------------------------------------------
do $$ declare v_def text; v_lista text[];
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'emails_enviados_tipo_check' and conrelid = 'emails_enviados'::regclass;
  if position('{' in v_def) > 0 then
    v_lista := string_to_array(substring(v_def from '\{([^}]*)\}'), ',');
  else
    select array_agg(m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(array_length(v_lista, 1), 0) < 30 then
    raise exception 'No se ha podido leer la lista de tipos de email (%): revisar antes de aplicar.', v_def;
  end if;
  select array_agg(distinct x order by x) into v_lista from unnest(v_lista || array['pago_avisado_dynamo']) as x;
  alter table emails_enviados drop constraint emails_enviados_tipo_check;
  execute format('alter table emails_enviados add constraint emails_enviados_tipo_check check (tipo = any (%L::text[]))', v_lista);
end $$;

-- ---- 2. Sale al momento, como los de seguridad -------------------------------------------------
create or replace function public.email_sin_espera(p_tipo text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_tipo, '') in ('codigo_firma', 'acceso_nuevo', 'acceso_no_he_sido_yo', 'pago_avisado_dynamo')
$$;
comment on function public.email_sin_espera(text) is '[Ayudantes internos] Si un tipo de email sale al momento, sin el minuto de «Anular el cambio»: el código de firma del CMR, los avisos de seguridad (acceso desde un dispositivo nuevo y «No he sido yo») y el aviso a Dynamo de una transferencia que hay que validar en el banco. Quién: uso interno. Argumentos: p_tipo: tipo de email.';

-- ---- 3. El email a Dynamo ---------------------------------------------------------------------
create or replace function public.fn_email_pago_avisado_dynamo(p_envio uuid, p_por_enlace boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare e record; i record; v_cli text; v_cif text;
  v_email text := coalesce(parametro('dynamo_email') #>> '{}', '');
  v_base text := coalesce(parametro('url_plataforma') #>> '{}', '');
begin
  if v_email = '' then return; end if;
  select x.id, x.referencia_gx, x.cliente_id, x.es_manual into e from envios x where x.id = p_envio;
  if e.id is null or coalesce(e.es_manual, false) then return; end if;
  select c.razon_social, c.cif into v_cli, v_cif from clientes c where c.id = e.cliente_id;
  select * into i from pago_envio_importes(p_envio);
  insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
  values ('pago_avisado_dynamo:' || p_envio || ':' || extract(epoch from now())::bigint, 'pago_avisado_dynamo', p_envio, v_email,
    format('Validar cobro · #%s · %s · %s', e.referencia_gx, euros_texto(i.total), coalesce(v_cli, 'cliente')),
    format('<p><strong>%s</strong>%s dice que ya ha hecho la transferencia de este envío%s.</p>'
        || '<p>Búscala en el banco:</p>'
        || '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px;margin:4px 0 14px">'
        || '<tr><td style="padding:5px 14px 5px 0;color:#5b6072">Importe</td><td style="padding:5px 0;font-weight:700">%s (IVA incluido)</td></tr>'
        || '<tr><td style="padding:5px 14px 5px 0;color:#5b6072">Concepto</td><td style="padding:5px 0;font-weight:700">PRO-%s</td></tr>'
        || '<tr><td style="padding:5px 14px 5px 0;color:#5b6072">Ordenante</td><td style="padding:5px 0;font-weight:700">%s</td></tr></table>'
        || '<p>El plazo para pagar está <strong>parado</strong>: el envío no se anula solo. Si ha llegado, márcala como recibida y el envío pasa a programación; si no consta, recházala y el envío se anula.</p>'
        || '<p><a href="%s/panel/envios?ver=%s" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">Abrir el envío y validar</a></p>'
        || '<!--detalle-->%s',
      escapar_html(coalesce(v_cli, 'El cliente')),
      case when nullif(btrim(coalesce(v_cif, '')), '') is not null then ' (' || escapar_html(v_cif) || ')' else '' end,
      case when p_por_enlace then ', desde el enlace de pago (sin entrar en la plataforma)' else '' end,
      euros_texto(i.total), e.referencia_gx, escapar_html(coalesce(v_cli, '—')), v_base, p_envio, envio_detalle_html(p_envio)))
  on conflict (clave) do nothing;
end $$;
comment on function public.fn_email_pago_avisado_dynamo(uuid, boolean) is '[Ayudantes internos] Encola el email a Dynamo de «transferencia avisada»: asunto con el n.º de envío, el importe con IVA y el cliente; dentro, lo que hay que buscar en el banco (importe, concepto PRO-GX y ordenante) y el botón a la ficha para validarla o rechazarla. Sale al momento. Quién: uso interno (lo llama fn_pago_avisar). Argumentos: p_envio: el envío; p_por_enlace: true si se avisó desde el enlace público de pago.';
revoke all on function public.fn_email_pago_avisado_dynamo(uuid, boolean) from public, anon, authenticated;

-- ---- 4. Se manda al apuntar el aviso ----------------------------------------------------------
do $$ declare v text; v_viejo text := $v$return jsonb_build_object('resultado', 'ok');$v$;
begin
  v := pg_get_functiondef('public.fn_pago_avisar(uuid,boolean)'::regprocedure);
  if position(v_viejo in v) = 0 or position('fn_email_pago_avisado_dynamo' in v) > 0 then
    raise exception 'fn_pago_avisar no es la que se esperaba: revisar esta migración';
  end if;
  execute replace(v, v_viejo, 'perform fn_email_pago_avisado_dynamo(p_envio, p_por_enlace);' || E'\n  ' || v_viejo);
end $$;
revoke all on function public.fn_pago_avisar(uuid, boolean) from public, anon, authenticated;
