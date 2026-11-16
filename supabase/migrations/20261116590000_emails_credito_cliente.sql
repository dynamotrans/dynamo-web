-- =====================================================================================
-- EMAILS DE CRÉDITO AL CLIENTE (usuario, 2026-11-16)
-- =====================================================================================
-- «También pondría emails por tema crédito CESCE. Tanto CESCE como manual, para avisar
-- con límites o cambios, o cercano a agotar, diciendo que liquide facturas para poder
-- seguir dando servicio.»
--
-- DOS AVISOS, los dos al usuario del cliente y sus emails de copia (con copia a Dynamo,
-- como todos):
--
--   1. CAMBIO en su línea de crédito, venga de CESCE o del crédito que pone Dynamo a
--      mano: concedida, ampliada, reducida o retirada.
--   2. USO de la línea: «cerca del límite» (por defecto, al 80 %) y «límite alcanzado»
--      (100 %), pidiéndole que liquide las facturas pendientes para seguir cargando con
--      pago aplazado. Se mira cada vez que confirma un envío y cuando le baja el límite.
--      Como mucho uno de cada tipo cada 15 días.
--
-- SIN IMPORTES: igual que en su panel (mi_cobertura_credito: «nunca importes»), el
-- cliente no ve ni el límite ni lo usado. El «uso» es el mismo cálculo de la pantalla
-- «CESCE - Riesgos»: los envíos de los últimos días (parámetro riesgo_dias_asumido) que
-- no se pagaron por adelantado, con IVA. No son las facturas reales pendientes: por eso
-- el texto dice «si ya están pagadas, no tienes que hacer nada».
--
-- Todo se puede apagar en Parámetros → CESCE - Riesgos.

insert into parametros (clave, valor, descripcion) values
  ('credito_emails_activo', 'true',
   'Emails de crédito al cliente: true = se le avisa por email cuando cambia su línea de crédito y cuando se acerca o llega a su límite. false = no se manda ninguno.'),
  ('credito_aviso_pct', '80',
   'Emails de crédito: porcentaje de la línea de crédito usado a partir del cual se avisa al cliente de que está cerca del límite. Al 100 % se le avisa de que lo ha alcanzado.'),
  ('credito_aviso_dias', '15',
   'Emails de crédito: días que pasan, como mínimo, entre dos avisos iguales de uso de la línea de crédito al mismo cliente.')
on conflict (clave) do nothing;

alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida',
                  'envio_aceptado', 'alta_pendiente', 'deca', 'cuenta_activada', 'cuenta_reactivada',
                  'cambio_email', 'envio_creado', 'envio_modificado', 'envio_cancelado', 'envio_matriculas',
                  'envio_reactivado', 'credito_cambio', 'credito_aviso'));
comment on column public.emails_enviados.tipo is 'formato: texto | rango: no aplica | lista: matriculas · vispera · orden_carga · firma_cmr · cmr_completo · difusion · difusion_fin · difusion_recordatorio · aviso_entrega · aviso_parada · aviso_parada_cancelada · cuenta_suspendida · envio_aceptado · alta_pendiente · deca (el DeCA en PDF al transportista, en cada versión) · cuenta_activada (al usuario, cuando Dynamo confirma su alta) · cuenta_reactivada (al usuario, cada vez que su cuenta suspendida vuelve a estar activa) · cambio_email (a la dirección antigua y a la nueva, cuando cambia el email de acceso de una cuenta) · envio_creado (al cliente, cuando su envío queda confirmado) · envio_modificado (al cliente, con lo que ha cambiado) · envio_cancelado (al cliente) · envio_matriculas (al cliente, al ponerse o cambiar las matrículas con el transportista ya asignado) · envio_reactivado (al cliente, al deshacerse una cancelación que ya se le había comunicado) · credito_cambio (al cliente, cuando cambia su línea de crédito) · credito_aviso (al cliente, cuando se acerca o llega al límite de su línea de crédito) | obligatorio | Qué aviso es. Ej. OK: matriculas';

-- A quién se escribe en un cliente: sus usuarios (activos o en solo lectura) y sus copias.
create or replace function emails_del_cliente(p_cliente uuid)
returns text language sql stable security definer set search_path = public as $$
  select string_agg(distinct x.email, ',')
    from usuarios u
    cross join lateral unnest(array[u.email::text] || coalesce(u.emails_copia_avisos::text[], '{}')) as x(email)
   where u.cliente_id = p_cliente and u.rol = 'cliente' and u.estado in ('activa', 'suspendida')
     and nullif(btrim(x.email), '') is not null
$$;
revoke execute on function emails_del_cliente(uuid) from public, anon, authenticated;
comment on function public.emails_del_cliente(uuid) is '[Gestión interna] Direcciones a las que se escribe a un cliente, separadas por comas: sus usuarios (activos o en solo lectura) con sus emails de copia. Vacío si el cliente no tiene usuario en la plataforma. Quién: nadie la llama desde fuera; la usan los avisos por email. Argumentos: p_cliente: el cliente.';

create or replace function fn_email_credito(p_cliente uuid, p_clave text, p_tipo text, p_asunto text, p_cuerpo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_para text;
begin
  if coalesce((parametro('credito_emails_activo'))::text, 'true') <> 'true' then return; end if;
  v_para := emails_del_cliente(p_cliente);
  if nullif(v_para, '') is null then return; end if;
  insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
  values (p_clave, p_tipo, v_para, p_asunto,
    format('<p>Hola,</p>%s<p>Si tienes cualquier duda, responde a este email o llámanos al %s.</p><p>— %s · %s · %s</p>',
           p_cuerpo, escapar_html(tel_dynamo()),
           escapar_html(coalesce(parametro('dynamo_razon_social') #>> '{}', '')), escapar_html(email_dynamo()), escapar_html(tel_dynamo())))
  on conflict (clave) do nothing;
end $$;
revoke execute on function fn_email_credito(uuid, text, text, text, text) from public, anon, authenticated;
comment on function public.fn_email_credito(uuid, text, text, text, text) is '[Gestión interna] Encola un email de crédito para un cliente (a emails_del_cliente), una vez por clave, con el saludo y la firma de Dynamo. No hace nada si los emails de crédito están apagados (parámetro credito_emails_activo) o el cliente no tiene usuario. Quién: nadie la llama desde fuera. Argumentos: p_cliente; p_clave: la clave única; p_tipo: credito_cambio o credito_aviso; p_asunto; p_cuerpo: el texto propio del aviso, en HTML.';

-- Cuánto lleva usado de su línea (el mismo cálculo que «CESCE - Riesgos»).
create or replace function credito_uso_cliente(p_cliente uuid)
returns table (limite numeric, usado numeric, pct numeric)
language sql stable security definer set search_path = public as $$
  select c.riesgo_efectivo_euros, coalesce(a.total, 0),
         case when coalesce(c.riesgo_efectivo_euros, 0) > 0 then round(coalesce(a.total, 0) * 100 / c.riesgo_efectivo_euros, 1) end
    from clientes c
    left join lateral (
      select sum(round(coalesce(e.importe_cliente, 0) * (1 + coalesce(c.iva_pct, 21) / 100), 2)) as total
        from envios e
       where e.cliente_id = c.id and not coalesce(e.es_manual, false)
         and e.estado not in ('borrador', 'cancelado')
         and e.estado_pago_previo in ('no_requerido', 'exento')
         and coalesce(e.fecha_carga_real, e.fecha_carga_desde, e.creado_en::date)
             >= (now() at time zone 'Europe/Madrid')::date - parametro_num('riesgo_dias_asumido', 60)::int
    ) a on true
   where c.id = p_cliente
$$;
revoke execute on function credito_uso_cliente(uuid) from public, anon, authenticated;
comment on function public.credito_uso_cliente(uuid) is '[Gestión interna] Línea de crédito de un cliente y cuánto lleva usado, con el mismo cálculo que la pantalla «CESCE - Riesgos»: límite (el manual si lo hay; si no, el de CESCE), usado (envíos de los últimos días que no se pagaron por adelantado, con IVA) y porcentaje usado. Quién: nadie la llama desde fuera. Argumentos: p_cliente: el cliente.';

-- 2. El aviso de USO ------------------------------------------------------------------------
create or replace function credito_revisar_uso(p_cliente uuid)
returns void language plpgsql security definer set search_path = public as $$
declare u record; v_aviso numeric := least(99, greatest(1, parametro_num('credito_aviso_pct', 80)));
  v_dias int := greatest(1, parametro_num('credito_aviso_dias', 15)::int);
  v_tramo text := floor(extract(epoch from now()) / 86400 / v_dias)::bigint::text;
begin
  select * into u from credito_uso_cliente(p_cliente);
  if u.pct is null or u.pct < v_aviso then return; end if;
  if u.pct >= 100 then
    -- Si el de «cerca» aún no había salido, sobra: va directamente el de «alcanzado».
    update emails_enviados set estado = 'omitido', error = 'Sustituido por el aviso de límite alcanzado.'
     where clave like 'credito_aviso:' || p_cliente || ':cerca:%' and estado = 'pendiente';
    perform fn_email_credito(p_cliente, 'credito_aviso:' || p_cliente || ':alcanzado:' || v_tramo, 'credito_aviso',
      'Has alcanzado el límite de tu línea de crédito · Dynamo',
      '<p>Has <strong>alcanzado el límite</strong> de tu línea de crédito con Dynamo.</p>'
      || '<p>Para poder seguir dándote servicio con pago aplazado necesitamos que <strong>liquides las facturas pendientes</strong>. '
      || 'Mientras tanto, es posible que te pidamos el pago por adelantado de los próximos envíos.</p>'
      || '<p>Si ya están pagadas, no tienes que hacer nada: lo revisamos nosotros y lo actualizamos.</p>');
  else
    perform fn_email_credito(p_cliente, 'credito_aviso:' || p_cliente || ':cerca:' || v_tramo, 'credito_aviso',
      'Estás cerca del límite de tu línea de crédito · Dynamo',
      '<p>Has usado <strong>buena parte</strong> de tu línea de crédito con Dynamo y estás cerca del límite.</p>'
      || '<p>Para seguir cargando con pago aplazado sin interrupciones, te recomendamos <strong>ponerte al día con las facturas pendientes</strong>.</p>'
      || '<p>Si ya están pagadas, no tienes que hacer nada: lo revisamos nosotros y lo actualizamos.</p>');
  end if;
end $$;
revoke execute on function credito_revisar_uso(uuid) from public, anon, authenticated;
comment on function public.credito_revisar_uso(uuid) is '[Gestión interna] Mira cuánto lleva usado un cliente de su línea de crédito y, si pasa del porcentaje de aviso (parámetro credito_aviso_pct) o llega al 100 %, le encola el email «cerca del límite» o «límite alcanzado». Como mucho uno de cada tipo cada credito_aviso_dias días. Sin importes. Quién: nadie la llama desde fuera. Argumentos: p_cliente: el cliente.';

create or replace function fn_credito_al_confirmar_envio()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cliente uuid;
begin
  select cliente_id into v_cliente from envios
   where id = new.envio_id and not coalesce(es_manual, false) and estado not in ('borrador', 'cancelado')
     and estado_pago_previo in ('no_requerido', 'exento');
  if v_cliente is not null then perform credito_revisar_uso(v_cliente); end if;
  return null;
end $$;
revoke execute on function fn_credito_al_confirmar_envio() from public, anon, authenticated;
comment on function public.fn_credito_al_confirmar_envio() is '[Gestión interna] Disparador de envio_hitos: al confirmarse un envío a crédito (sin pago por adelantado), revisa el uso de la línea de crédito de su cliente por si hay que avisarle. Quién: nadie la llama; la ejecuta la base de datos.';
create trigger tg_hitos_credito_uso after insert on envio_hitos
  for each row when (new.hito = 'confirmado') execute function fn_credito_al_confirmar_envio();

-- 1. El aviso de CAMBIO de la línea -----------------------------------------------------------
create or replace function fn_email_credito_cambio()
returns trigger language plpgsql security definer set search_path = public as $$
declare a numeric := coalesce(old.riesgo_efectivo_euros, 0); n numeric := coalesce(new.riesgo_efectivo_euros, 0);
  v_cesce boolean; v_que text; v_cuerpo text; v_previo boolean := coalesce((parametro('pago_previo_activo'))::text, 'false') = 'true';
begin
  if a = n or (a <= 0 and n <= 0) then return null; end if;
  -- De quién es la línea que queda (o la que se retira): el crédito manual de Dynamo manda sobre CESCE.
  v_cesce := case when n > 0 then coalesce(new.riesgo_manual_euros, 0) = 0 else coalesce(old.riesgo_manual_euros, 0) = 0 end;
  if a <= 0 then
    v_que := 'concedida';
    v_cuerpo := format('<p>Tu empresa ya tiene <strong>línea de crédito</strong> con Dynamo%s.</p><p>Desde ahora tus envíos se pagan <strong>a vencimiento</strong>%s, sin pago por adelantado.</p>',
      case when v_cesce then ', respaldada por CESCE' else '' end,
      case when coalesce(new.plazo_pago_dias, 0) > 0 then format(' (a %s días)', new.plazo_pago_dias) else '' end);
  elsif n <= 0 then
    v_que := 'retirada';
    v_cuerpo := format('<p>Tu línea de crédito con Dynamo%s ha quedado <strong>sin efecto</strong>.</p>%s<p>Los envíos que ya están en curso no cambian. Para recuperarla, mantén al día las facturas pendientes y escríbenos.</p>',
      case when v_cesce then ' (respaldada por CESCE)' else '' end,
      case when v_previo then '<p>Desde ahora los envíos nuevos se pagan <strong>por adelantado</strong>.</p>' else '' end);
  elsif n > a then
    v_que := 'ampliada';
    v_cuerpo := format('<p>Tu línea de crédito con Dynamo%s se ha <strong>ampliado</strong>: tienes más margen para cargar con pago aplazado.</p>',
      case when v_cesce then ' (respaldada por CESCE)' else '' end);
  else
    v_que := 'reducida';
    v_cuerpo := format('<p>Tu línea de crédito con Dynamo%s se ha <strong>reducido</strong>.</p><p>Los envíos que ya están en curso no cambian. Para seguir cargando con pago aplazado, mantén al día las facturas pendientes.</p>',
      case when v_cesce then ' (respaldada por CESCE)' else '' end);
  end if;
  perform fn_email_credito(new.id, 'credito_cambio:' || new.id || ':' || to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISSUS'), 'credito_cambio',
    'Línea de crédito ' || v_que || ' · Dynamo', v_cuerpo);
  -- Con menos límite puede haber quedado cerca del tope (o por encima).
  if v_que = 'reducida' then perform credito_revisar_uso(new.id); end if;
  return null;
end $$;
revoke execute on function fn_email_credito_cambio() from public, anon, authenticated;
comment on function public.fn_email_credito_cambio() is '[Gestión interna] Disparador de clientes: cuando cambia la línea de crédito que limita a un cliente (el crédito manual de Dynamo o, si no lo hay, el de CESCE), le encola el email de línea concedida, ampliada, reducida o retirada, sin importes; si se reduce, revisa además si ha quedado cerca del límite. Quién: nadie la llama; la ejecuta la base de datos.';
create trigger tg_clientes_email_credito after update of riesgo_cesce_euros, riesgo_manual_euros on clientes
  for each row execute function fn_email_credito_cambio();
