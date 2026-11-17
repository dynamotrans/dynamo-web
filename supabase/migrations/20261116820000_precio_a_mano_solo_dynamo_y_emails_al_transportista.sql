-- =====================================================================================
-- DOS DECISIONES DEL USUARIO (2026-11-17)
-- =====================================================================================
-- 1. «¿Quién modifica cuando el precio lo pusiste tú a mano? ADMIN SOLO.» Un envío con el
--    precio fijado a mano por Dynamo es un precio hablado con el cliente: si el cliente lo
--    modificara con el asistente, el tarifador lo recalcularía y se perdería el acuerdo.
--    Desde ahora ese envío solo lo modifica Dynamo; al cliente le sale «contáctanos».
--
-- 2. «Emails al transportista por cancelación o cambios: debe enviarse. Se manda el cambio
--    pero el precio no; para lo que cambie en precios llamaremos.» Hasta ahora el
--    transportista asignado solo se enteraba por teléfono (o por el DeCA, si ya tenía
--    matrículas). Ahora recibe un email cuando su envío:
--      · se CANCELA;
--      · se le RETIRA (deja de estar asignado a su empresa);
--      · se MODIFICA: fecha de carga, día previsto, entrega estimada, mercancía o ruta.
--    NUNCA llevan precios. El de cambios avisa de que, si afecta al precio acordado, le
--    llamamos. No sale en envíos con transportista propio del cliente (ahí Dynamo no
--    interviene), ni por un cambio que ha hecho el propio transportista.

-- ---- 1. Precio a mano: solo Dynamo modifica ---------------------------------------------
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.modificar_envio_cliente(uuid, jsonb, jsonb)'::regprocedure);
  n := replace(v, E'  if e.estado <> ''programado'' then\n',
    E'  if coalesce(e.precio_fijado_a_mano, false) then\n'
    || E'    raise exception ''Este envío tiene un precio acordado con Dynamo: no se puede modificar desde aquí. Contáctanos y lo cambiamos nosotros.'';\n'
    || E'  end if;\n'
    || E'  if e.estado <> ''programado'' then\n');
  if n = v then raise exception 'modificar_envio_cliente: no encuentro dónde poner la regla del precio a mano'; end if;
  execute n;
end $$;
do $$ declare v text := obj_description('public.modificar_envio_cliente(uuid, jsonb, jsonb)'::regprocedure); n text; begin
  n := replace(v, 'programado y sin transportista;', 'programado, sin transportista y sin precio fijado a mano por Dynamo (ese solo lo modifica Dynamo);');
  if n = v then raise exception 'modificar_envio_cliente: no encuentro dónde anotar la regla en su comentario'; end if;
  execute format('comment on function public.modificar_envio_cliente(uuid, jsonb, jsonb) is %L', n);
end $$;

-- La ficha del cliente necesita saberlo para enseñar «contáctanos» en vez del asistente.
drop function mi_cambio_envio(uuid);
create function mi_cambio_envio(p_envio uuid)
returns table (cambio jsonb, estado text, en timestamptz, nota text, modificable boolean, con_camion boolean, precio_a_mano boolean)
language sql stable security definer set search_path = public as $$
  select e.cambio_cliente, e.estado_cambio_cliente, e.cambio_cliente_en, e.cambio_cliente_nota,
         e.estado = 'programado' and not coalesce(e.es_manual, false),
         coalesce(envio_con_transportista(e.id), false),
         coalesce(e.precio_fijado_a_mano, false)
    from envios e where e.id = p_envio and envio_del_cliente(p_envio)
$$;
revoke execute on function mi_cambio_envio(uuid) from public, anon;
grant execute on function mi_cambio_envio(uuid) to authenticated;
comment on function public.mi_cambio_envio(p_envio uuid) is '[Envíos] Para el cliente: el cambio que ha pedido en un envío (propuesta, estado, fecha y nota de Dynamo), si el envío aún se puede modificar, si ya tiene transportista (asignado o aceptándolo ahora) y si su precio lo fijó Dynamo a mano: en esos dos casos no se modifica desde la ficha, hay que llamar. Quién: cliente dueño del envío. Argumentos: p_envio: envios.id.';

-- ---- 2. Emails al transportista ---------------------------------------------------------
alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida',
                  'envio_aceptado', 'alta_pendiente', 'deca', 'cuenta_activada', 'cuenta_reactivada',
                  'cambio_email', 'envio_creado', 'envio_modificado', 'envio_cancelado', 'envio_matriculas',
                  'envio_reactivado', 'credito_cambio', 'credito_aviso', 'proforma_calculo',
                  'transportista_cancelado', 'transportista_retirado', 'transportista_modificado'));
do $$ declare v text := col_description('public.emails_enviados'::regclass,
    (select attnum from pg_attribute where attrelid = 'public.emails_enviados'::regclass and attname = 'tipo'));
  n text;
begin
  n := replace(v, ' | obligatorio | ', ' · transportista_cancelado · transportista_retirado · transportista_modificado (al transportista asignado, cuando su envío se cancela, se le retira o cambia; sin precios) | obligatorio | ');
  if n = v then raise exception 'emails_enviados.tipo: no encuentro dónde añadir los tipos nuevos al comentario'; end if;
  execute format('comment on column public.emails_enviados.tipo is %L', n);
end $$;

-- El detalle del envío para el transportista: ruta, fechas, mercancía y vehículo. SIN
-- precios y sin la referencia interna del cliente.
create or replace function envio_detalle_transportista_html(p_envio uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare e record; v_ruta text;
begin
  select * into e from envios where id = p_envio;
  if e.id is null then return ''; end if;
  select string_agg(format('<li><strong>%s</strong> · %s</li>',
           case when p.tipo = 'carga' then 'Recogida' else 'Entrega' end,
           escapar_html(concat_ws(' — ', nullif(btrim(p.nombre_empresa), ''),
             concat_ws(', ', nullif(btrim(p.direccion), ''), nullif(btrim(concat_ws(' ', p.codigo_postal, p.poblacion)), ''),
                       case when p.provincia is distinct from p.poblacion then nullif(btrim(p.provincia), '') end)))), '' order by p.orden)
    into v_ruta from envio_paradas p where p.envio_id = p_envio;
  return format('<p><strong>Datos del envío #%s</strong></p><ol>%s</ol><p style="margin:24px 0"><strong>Fecha de carga:</strong> %s%s%s%s</p>',
    escapar_html(e.referencia_gx), coalesce(v_ruta, ''),
    envio_fecha_carga_texto(e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_prevista),
    case when e.fecha_entrega_estimada is not null then '<br><strong>Entrega estimada:</strong> ' || fecha_texto(e.fecha_entrega_estimada) else '' end,
    '<br><strong>Mercancía:</strong> ' || escapar_html(coalesce(nullif(envio_mercancia_texto(e.metros_lineales, e.toneladas, e.tipo_carga::text,
       e.requiere_plataforma_elevadora, e.descripcion_mercancia, e.adr, e.requiere_nima), ''), '—')),
    case when e.matricula_camion is not null
         then '<br><strong>Vehículo:</strong> ' || escapar_html(concat_ws(' · ', 'camión ' || e.matricula_camion,
                case when e.matricula_remolque is not null then 'remolque ' || e.matricula_remolque end))
         else '' end);
end $$;
revoke execute on function envio_detalle_transportista_html(uuid) from public, anon, authenticated;
comment on function public.envio_detalle_transportista_html(uuid) is '[Gestión interna] Bloque de detalle de un envío para los emails al transportista: la ruta parada a parada, la fecha de carga, la entrega estimada, la mercancía y las matrículas si las hay. Nunca lleva precios ni la referencia interna del cliente. Quién: nadie la llama desde fuera; la usan los avisos por email. Argumentos: p_envio: el envío.';

-- Encolar un email a un transportista sobre un envío (una vez por clave).
create or replace function fn_email_envio_transportista(p_envio uuid, p_transportista uuid, p_clave text, p_tipo text, p_titulo text, p_cuerpo text, p_cierre text default '')
returns void language plpgsql security definer set search_path = public as $$
declare e record; v_para text; v_origen text; v_destino text;
begin
  select id, referencia_gx, es_manual into e from envios where id = p_envio;
  if e.id is null or coalesce(e.es_manual, false) or p_transportista is null then return; end if;
  select c.email into v_para from contactos c
   where c.transportista_id = p_transportista and nullif(btrim(c.email), '') is not null
   order by (c.funcion::text = 'trafico') desc, c.es_principal desc, c.creado_en limit 1;
  select p.poblacion into v_origen from envio_paradas p where p.envio_id = p_envio and p.tipo = 'carga' order by p.orden limit 1;
  select p.poblacion into v_destino from envio_paradas p where p.envio_id = p_envio and p.tipo = 'descarga' order by p.orden desc limit 1;
  -- Sin email en su ficha: queda registrado como fallo, para que Dynamo le avise a mano.
  insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html, estado, error)
  values (p_clave, p_tipo, p_envio, coalesce(v_para, '—'),
    format('%s · envío #%s (%s → %s)', p_titulo, e.referencia_gx, coalesce(v_origen, '—'), coalesce(v_destino, '—')),
    format('<p>Hola,</p>%s<!--detalle-->%s<!--cierre-->%s<p>Para cualquier duda, llámanos: %s · %s</p><p>— %s</p>',
           p_cuerpo, envio_detalle_transportista_html(p_envio), coalesce(p_cierre, ''),
           escapar_html(tel_dynamo()), escapar_html(email_dynamo()),
           escapar_html(coalesce(parametro('dynamo_razon_social') #>> '{}', ''))),
    case when v_para is null then 'error' else 'pendiente' end,
    case when v_para is null then 'El transportista no tiene email en sus contactos: avisar a mano.' end)
  on conflict (clave) do nothing;
end $$;
revoke execute on function fn_email_envio_transportista(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
comment on function public.fn_email_envio_transportista(uuid, uuid, text, text, text, text, text) is '[Gestión interna] Encola un email a un transportista sobre un envío, una vez por clave: saludo, el cuerpo que se le pasa, el detalle del envío sin precios, un cierre opcional y el contacto de Dynamo. Va al contacto de tráfico del transportista (o al principal); si no tiene email, queda registrado como fallo para avisarle a mano. No hace nada en los envíos con transportista propio del cliente. Quién: nadie la llama desde fuera. Argumentos: p_envio; p_transportista: a quién; p_clave: la clave única; p_tipo: el tipo de email; p_titulo: principio del asunto; p_cuerpo: el párrafo propio de ese aviso, en HTML; p_cierre: párrafo tras el detalle, en HTML.';

-- El de cambios: los de la misma operación (o del mismo minuto, sin haber salido) van juntos.
create or replace function fn_encolar_email_transportista_modificado(p_envio uuid, p_transportista uuid, p_cambios text)
returns void language plpgsql security definer set search_path = public as $$
declare v_clave text := 'transportista_modificado:' || p_envio || ':' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24MI'); v_resto text;
begin
  if p_transportista is null or nullif(p_cambios, '') is null then return; end if;
  if exists (select 1 from emails_enviados where clave = v_clave) then
    select split_part(cuerpo_html, '<!--cierre-->', 2) into v_resto from emails_enviados where clave = v_clave;
    update emails_enviados
       set cuerpo_html = replace(split_part(cuerpo_html, '<!--detalle-->', 1), '</ul>', p_cambios || '</ul>')
                         || '<!--detalle-->' || envio_detalle_transportista_html(p_envio) || '<!--cierre-->' || v_resto
     where clave = v_clave and estado = 'pendiente';
    return;
  end if;
  perform fn_email_envio_transportista(p_envio, p_transportista, v_clave, 'transportista_modificado', 'Envío modificado',
    '<p>El envío que tienes asignado se ha <strong>modificado</strong>.</p><p><strong>Qué ha cambiado</strong></p><ul>' || p_cambios || '</ul>',
    '<p>Si el cambio afecta al precio acordado, <strong>te llamamos</strong> para verlo. La orden de carga actualizada la tienes en tu panel.</p>');
end $$;
revoke execute on function fn_encolar_email_transportista_modificado(uuid, uuid, text) from public, anon, authenticated;
comment on function public.fn_encolar_email_transportista_modificado(uuid, uuid, text) is '[Gestión interna] Encola el email «Envío modificado» para el transportista asignado, con la lista de cambios (sin precios) y el detalle de cómo queda el envío. Los cambios de la misma operación (o del mismo minuto, si el email aún no ha salido) se juntan en uno solo. Quién: nadie la llama desde fuera. Argumentos: p_envio; p_transportista: el asignado; p_cambios: los cambios, como elementos de lista en HTML.';

create or replace function fn_email_transportista_cambios()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text := ''; v_antes text; v_ahora text; e record;
begin
  -- La ruta cambia en envio_paradas: se entera por el hito «ruta cambiada».
  if tg_table_name = 'envio_hitos' then
    select transportista_id, estado, es_manual into e from envios where id = new.envio_id;
    if e.transportista_id is not null and not coalesce(e.es_manual, false)
       and e.estado in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta')
       and e.transportista_id is distinct from transportista_del_usuario() then
      perform fn_encolar_email_transportista_modificado(new.envio_id, e.transportista_id, '<li><strong>Ruta:</strong> ha cambiado. Abajo va la ruta nueva.</li>');
    end if;
    return null;
  end if;

  -- CANCELADO con transportista asignado.
  if new.estado = 'cancelado' then
    perform fn_email_envio_transportista(new.id, old.transportista_id, 'transportista_cancelado:' || new.id || ':' || old.transportista_id || ':' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24MI'),
      'transportista_cancelado', 'Envío CANCELADO',
      '<p>El envío que tenías asignado ha quedado <strong>cancelado</strong>: <strong>no hay que realizar este transporte</strong>.</p>');
    return null;
  end if;
  -- RETIRADO: ya no está asignado a su empresa (se ha quitado o se ha pasado a otro).
  if new.transportista_id is distinct from old.transportista_id then
    perform fn_email_envio_transportista(new.id, old.transportista_id,
      'transportista_retirado:' || new.id || ':' || old.transportista_id || ':' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24MI'),
      'transportista_retirado', 'Envío retirado',
      '<p>Este envío <strong>ya no está asignado a tu empresa</strong>: no hay que realizar este transporte.</p>');
    return null;
  end if;
  -- MODIFICADO (sigue asignado al mismo). Solo mientras está por hacer o en marcha, y no
  -- por un cambio que ha hecho él mismo.
  if new.estado not in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta')
     or new.transportista_id is not distinct from transportista_del_usuario() then
    return null;
  end if;
  if (old.fecha_carga_desde, old.fecha_carga_hasta) is distinct from (new.fecha_carga_desde, new.fecha_carga_hasta) then
    v := v || format('<li><strong>Fecha de carga:</strong> antes %s · ahora <strong>%s</strong></li>',
      envio_fecha_carga_texto(old.fecha_carga_desde, old.fecha_carga_hasta, null), envio_fecha_carga_texto(new.fecha_carga_desde, new.fecha_carga_hasta, null));
  end if;
  if old.fecha_carga_prevista is not null and new.fecha_carga_prevista is distinct from old.fecha_carga_prevista then
    v := v || format('<li><strong>Día de carga previsto:</strong> antes %s · ahora <strong>%s</strong></li>', fecha_texto(old.fecha_carga_prevista), coalesce(fecha_texto(new.fecha_carga_prevista), 'por confirmar'));
  end if;
  if old.fecha_entrega_estimada is not null and new.fecha_entrega_estimada is distinct from old.fecha_entrega_estimada then
    v := v || format('<li><strong>Entrega estimada:</strong> antes %s · ahora <strong>%s</strong></li>', fecha_texto(old.fecha_entrega_estimada), coalesce(fecha_texto(new.fecha_entrega_estimada), 'por confirmar'));
  end if;
  v_antes := envio_mercancia_texto(old.metros_lineales, old.toneladas, old.tipo_carga::text, old.requiere_plataforma_elevadora, old.descripcion_mercancia, old.adr, old.requiere_nima);
  v_ahora := envio_mercancia_texto(new.metros_lineales, new.toneladas, new.tipo_carga::text, new.requiere_plataforma_elevadora, new.descripcion_mercancia, new.adr, new.requiere_nima);
  if v_antes is distinct from v_ahora then
    v := v || format('<li><strong>Mercancía:</strong> antes %s · ahora <strong>%s</strong></li>', escapar_html(coalesce(nullif(v_antes, ''), '—')), escapar_html(coalesce(nullif(v_ahora, ''), '—')));
  end if;
  -- El precio NUNCA va por email: si cambia, Dynamo llama.
  if v <> '' then perform fn_encolar_email_transportista_modificado(new.id, new.transportista_id, v); end if;
  return null;
end $$;
revoke execute on function fn_email_transportista_cambios() from public, anon, authenticated;
comment on function public.fn_email_transportista_cambios() is '[Gestión interna] Disparador de envios y de envio_hitos: avisa por email al transportista asignado cuando su envío se cancela, se le retira (deja de estar asignado a su empresa) o cambia (fecha de carga, día previsto, entrega estimada, mercancía o ruta). Nunca con precios. No avisa en los envíos con transportista propio del cliente ni por un cambio hecho por el propio transportista. Quién: nadie la llama; la ejecuta la base de datos.';

create trigger tg_envios_y_email_transportista after update on envios for each row
  when (old.transportista_id is not null and not coalesce(new.es_manual, false)
        and old.estado not in ('borrador', 'cancelado', 'entregado'))
  execute function fn_email_transportista_cambios();
create trigger tg_hitos_email_transportista_ruta after insert on envio_hitos for each row
  when (new.hito = 'ruta_cambiada')
  execute function fn_email_transportista_cambios();
