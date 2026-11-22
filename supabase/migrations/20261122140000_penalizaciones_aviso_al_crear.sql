-- PENALIZACIONES: AVISO AL CREARLA Y AL CONFIRMARLA; AL TRANSPORTISTA, IMPORTE A SU FAVOR Y SIN CIFRA
-- (usuario, 2026-11-22). Decisiones:
--  1. Se avisa al CREARLA (nace «pendiente de confirmar»: el cliente y el transportista ya la ven en
--     su lista como «En revisión») y otra vez al CONFIRMARLA o ANULARLA (o borrarla).
--  2. El importe al transportista es SIEMPRE A SU FAVOR (paralización, parada adicional,
--     cancelación…: lo que se le paga de más). A él nunca se le habla de «penalización».
--  3. En el email al transportista, SIN CIFRA (la ve al entrar en la plataforma); en su campana, sí.
-- Al cliente: su importe + IVA, también a su contabilidad; si no está conforme, incidencia.
-- La automática de cancelación no repite el aviso de «en revisión» al cliente: ya va en el email
-- «Envío cancelado».

do $$
declare v_def text; v_lista text[];
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'emails_enviados_tipo_check' and conrelid = 'emails_enviados'::regclass;
  -- La lista viene como ARRAY['a'::text, …] o como '{a,b,…}'::text[]: se leen las dos formas.
  if position('{' in v_def) > 0 then
    v_lista := string_to_array(substring(v_def from '\{([^}]*)\}'), ',');
  else
    select array_agg(m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(array_length(v_lista, 1), 0) < 30 then
    raise exception 'No se ha podido leer la lista de tipos de email (%): revisar antes de aplicar.', v_def;
  end if;
  select array_agg(distinct x order by x) into v_lista from unnest(v_lista || array['penalizacion_revision']) as x;
  alter table emails_enviados drop constraint emails_enviados_tipo_check;
  execute format('alter table emails_enviados add constraint emails_enviados_tipo_check check (tipo = any (%L::text[]))', v_lista);
end $$;

create or replace function public.fn_email_penalizacion(p_pen penalizaciones, p_evento text)
returns void language plpgsql security definer set search_path = public as $$
declare e record; v_tipo text; v_clave text; v_desc text; v_ref text; v_min text := to_char(now() at time zone 'utc', 'YYYYMMDDHH24MI');
  v_cli boolean; v_tra boolean;
begin
  select id, cliente_id, transportista_id, referencia_gx into e from envios where id = p_pen.envio_id;
  if e.id is null then return; end if;
  select nombre into v_tipo from tipos_penalizacion where id = p_pen.tipo_id;
  v_tipo := coalesce(v_tipo, 'Penalización');
  v_ref := ' · #' || coalesce(e.referencia_gx, '');
  v_desc := case when nullif(btrim(p_pen.descripcion), '') is not null
                 then '<p><strong>Motivo:</strong> ' || escapar_html(left(btrim(p_pen.descripcion), 1500)) || '</p>' else '' end;
  v_cli := coalesce(p_pen.importe_cliente, 0) > 0
           and not (p_evento = 'revision' and p_pen.generada_auto);   -- la automática ya va en «Envío cancelado»
  v_tra := coalesce(p_pen.importe_transportista, 0) > 0 and e.transportista_id is not null;

  if v_cli then
    v_clave := case p_evento when 'revision' then 'penalizacion_revision:' || p_pen.id || ':cliente'
                             when 'confirmada' then 'penalizacion:' || p_pen.id || ':cliente'
                             else 'penalizacion_anulada:' || p_pen.id || ':cliente:' || v_min end;
    perform crear_aviso('cliente', e.cliente_id, null, 'penalizacion', case p_evento when 'anulada' then 'info' else 'aviso' end,
      case p_evento when 'revision' then 'Penalización en revisión' when 'confirmada' then 'Penalización confirmada' else 'Penalización anulada' end || v_ref,
      v_tipo || ': ' || euros_texto(p_pen.importe_cliente) || ' + IVA.'
      || case p_evento when 'revision' then ' Si no estás conforme, ábrenos una incidencia antes de que la confirmemos.'
                       when 'confirmada' then ' La tienes en Penalizaciones.' else ' No se te cobrará.' end,
      '/panel/penalizaciones', e.id);
    perform fn_email_envio_cliente(e.id, v_clave,
      case p_evento when 'revision' then 'penalizacion_revision' when 'confirmada' then 'penalizacion' else 'penalizacion_anulada' end,
      case p_evento when 'revision' then 'Penalización en revisión' when 'confirmada' then 'Penalización confirmada' else 'Penalización anulada' end,
      case p_evento
        when 'revision' then format('<p>Hemos registrado una <strong>penalización en revisión</strong> en tu envío: <strong>%s · %s + IVA</strong> (%s).</p>%s<p>Todavía no está confirmada. Si no estás conforme, ábrenos una <strong>incidencia</strong> desde la plataforma y la revisamos antes de confirmarla.</p>',
                                    escapar_html(v_tipo), euros_texto(p_pen.importe_cliente), escapar_html(p_pen.codigo), v_desc)
        when 'confirmada' then format('<p>Hemos <strong>confirmado una penalización</strong> en tu envío: <strong>%s · %s + IVA</strong> (%s).</p>%s<p>La tienes en <strong>Penalizaciones</strong>, dentro de la plataforma. Si no estás conforme, ábrenos una incidencia.</p>',
                                      escapar_html(v_tipo), euros_texto(p_pen.importe_cliente), escapar_html(p_pen.codigo), v_desc)
        else format('<p>La penalización <strong>%s · %s</strong> (%s + IVA) ha quedado <strong>anulada</strong>: no se te cobrará.</p>',
                    escapar_html(p_pen.codigo), escapar_html(v_tipo), euros_texto(p_pen.importe_cliente)) end);
    -- Es dinero: va también a su contabilidad.
    update emails_enviados set destinatario = fn_unir_emails(destinatario, emails_contactos_cliente(e.cliente_id, 'contabilidad'))
     where clave = v_clave and estado = 'pendiente';
  end if;

  if v_tra then
    v_clave := case p_evento when 'revision' then 'penalizacion_revision:' || p_pen.id || ':transportista'
                             when 'confirmada' then 'penalizacion:' || p_pen.id || ':transportista'
                             else 'penalizacion_anulada:' || p_pen.id || ':transportista:' || v_min end;
    -- En su campana (dentro de la plataforma) sí va la cifra.
    perform crear_aviso('transportista', null, e.transportista_id, 'penalizacion', case p_evento when 'anulada' then 'info' else 'ok' end,
      case p_evento when 'revision' then 'Importe a tu favor en revisión' when 'confirmada' then 'Importe a tu favor confirmado' else 'Importe a tu favor anulado' end || v_ref,
      v_tipo || ': ' || euros_texto(p_pen.importe_transportista)
      || case p_evento when 'anulada' then '. Ya no se suma a este envío.' else '. Se suma a lo que te pagamos por este envío.' end,
      '/panel/penalizaciones', e.id);
    -- Por email, sin cifra.
    perform fn_email_envio_transportista(e.id, e.transportista_id, v_clave,
      case p_evento when 'revision' then 'penalizacion_revision' when 'confirmada' then 'penalizacion' else 'penalizacion_anulada' end,
      case p_evento when 'revision' then 'Importe a tu favor en revisión' when 'confirmada' then 'Importe a tu favor confirmado' else 'Importe a tu favor anulado' end,
      case p_evento
        when 'revision' then format('<p>Hemos registrado un <strong>importe a tu favor</strong> en este envío por <strong>%s</strong> (%s). Está en revisión: te avisamos cuando lo confirmemos.</p><p>El importe lo ves en la plataforma, en <strong>Penalizaciones</strong>.</p>', escapar_html(lower(v_tipo)), escapar_html(p_pen.codigo))
        when 'confirmada' then format('<p>Hemos <strong>confirmado un importe a tu favor</strong> en este envío por <strong>%s</strong> (%s): se suma a lo que te pagamos por el envío.</p><p>El importe lo ves en la plataforma, en <strong>Penalizaciones</strong>.</p>', escapar_html(lower(v_tipo)), escapar_html(p_pen.codigo))
        else format('<p>El importe a tu favor por <strong>%s</strong> (%s) de este envío ha quedado <strong>anulado</strong>: ya no se suma a lo que te pagamos.</p>', escapar_html(lower(v_tipo)), escapar_html(p_pen.codigo)) end);
  end if;
end $$;
revoke execute on function public.fn_email_penalizacion(penalizaciones, text) from public, anon, authenticated;
comment on function public.fn_email_penalizacion(penalizaciones, text) is '[Gestión interna] Avisa (campana y email) de una penalización a quien tiene importe en ella. Cliente: su importe + IVA (email también a su contabilidad); si no está conforme, incidencia. Transportista: es un importe A SU FAVOR; en la campana con la cifra, en el email sin ella. Eventos: revision (al crearla pendiente; la automática de cancelación no la repite al cliente), confirmada y anulada (anulada o borrada). Con copia a Dynamo; nada en envíos de gestión directa. Quién: nadie la llama desde fuera; la usa el disparador de penalizaciones. Argumentos: p_pen: la fila de la penalización · p_evento: revision, confirmada o anulada.';

create or replace function public.fn_email_penalizaciones()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'cancelada' then perform fn_email_penalizacion(old, 'anulada'); end if;
    return null;
  end if;
  if tg_op = 'INSERT' then
    if new.estado = 'confirmada' then perform fn_email_penalizacion(new, 'confirmada');
    elsif new.estado = 'pendiente_confirmar' then perform fn_email_penalizacion(new, 'revision'); end if;
    return null;
  end if;
  if new.estado = 'confirmada' and old.estado <> 'confirmada' then
    perform fn_email_penalizacion(new, 'confirmada');
  elsif new.estado = 'cancelada' and old.estado <> 'cancelada' then
    perform fn_email_penalizacion(old, 'anulada');
  end if;
  return null;
end $$;
revoke execute on function public.fn_email_penalizaciones() from public, anon, authenticated;
comment on function public.fn_email_penalizaciones() is '[Gestión interna] Disparador de penalizaciones: al crearse (pendiente: «en revisión»; o ya confirmada), al confirmarse y al anularse o borrarse, avisa por campana y email a quien tiene importe (fn_email_penalizacion). Volver a pendiente no avisa. Quién: nadie la llama; la ejecuta la base de datos.';

-- Los avisos de campana van ahora en fn_email_penalizacion: fuera los de antes (decían
-- «penalización… puedes alegar» también al transportista, que cobra ese importe).
drop trigger if exists tg_avisos_penalizaciones on penalizaciones;
drop trigger if exists tg_avisos_penalizaciones_alta on penalizaciones;
drop function if exists public.fn_avisos_penalizaciones();
