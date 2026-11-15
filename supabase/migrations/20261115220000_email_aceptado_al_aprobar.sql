-- EMAIL «ENVÍO ACEPTADO» TAMBIÉN AL APROBAR DESDE LA REVISIÓN (usuario, 2026-11-15):
-- al aprobar Dynamo una contraoferta o un alta online, la reserva pasa de
-- 'pendiente_revision' a 'aceptada' y el envío queda asignado — en ese instante el
-- transportista ya es «conocido», así que llega el MISMO email de confirmación
-- «Envío #GX aceptado · <transportista>» que en la aceptación directa (con una línea
-- extra que dice que viene de tu aprobación). La clave única 'envio_aceptado:<reserva>'
-- evita repetirlo. Copia de la versión de 20261115210000 con el email movido a un
-- bloque común para los dos caminos a 'aceptada'.
CREATE OR REPLACE FUNCTION public.fn_avisos_reservas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ref text; v_tr text; v_enl text := '/panel/envios?ver=' || new.envio_id;
  v_cif text; v_alta boolean := false;
  v_base text; v_origen text; v_destino text; v_fecha text;
  v_c_nombre text; v_c_tel text; v_c_email text;
begin
  if new.estado = old.estado then return null; end if;
  select '#' || coalesce(referencia_gx, '') into v_ref from envios where id = new.envio_id;
  -- Alta online sin verificar: nació desde el enlace y Dynamo aún no la ha aprobado.
  select nombre_visible, cif,
         ('alta_online' = any (coalesce(tags, '{}'))) and estado_operativo <> 'activo'
    into v_tr, v_cif, v_alta from transportistas where id = new.transportista_id;
  v_tr := coalesce(v_tr, 'Un transportista');

  if old.estado = 'viva' and new.estado = 'pendiente_revision' then
    perform crear_aviso('dynamo', null, null, 'contraoferta_transportista', 'aviso', 'Contraoferta de transportista · ' || v_ref,
      v_tr || ' propone ' || euros_texto(new.precio_propuesto) || '.', v_enl, new.envio_id);
    -- (b) Si además es un transportista NUEVO (alta online sin verificar), email a Dynamo
    -- con sus datos y el enlace para revisar y aceptar: mientras tanto la carga queda en
    -- espera y nadie más puede tomarla.
    if coalesce(v_alta, false) then
      v_base := coalesce(parametro('url_plataforma') #>> '{}', 'https://www.dynamotrans.com');
      select p.poblacion into v_origen from envio_paradas p where p.envio_id = new.envio_id and p.tipo = 'carga' order by p.orden limit 1;
      select p.poblacion into v_destino from envio_paradas p where p.envio_id = new.envio_id and p.tipo = 'descarga' order by p.orden desc limit 1;
      select coalesce(to_char(e.fecha_carga_prevista, 'DD/MM/YYYY'),
                      to_char(e.fecha_carga_desde, 'DD/MM/YYYY') ||
                        case when e.fecha_carga_hasta is not null and e.fecha_carga_hasta <> e.fecha_carga_desde
                             then ' – ' || to_char(e.fecha_carga_hasta, 'DD/MM/YYYY') end,
                      'sin fecha aún')
        into v_fecha from envios e where e.id = new.envio_id;
      select c.nombre, c.telefono, c.email into v_c_nombre, v_c_tel, v_c_email
        from contactos c where c.transportista_id = new.transportista_id
       order by c.es_principal desc, c.creado_en limit 1;
      insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
      values ('alta_pendiente:' || new.id, 'alta_pendiente', new.envio_id, email_dynamo(),
        format('PENDIENTE: aceptar transportista · envío %s', v_ref),
        format('<p><strong>%s</strong> se ha dado de alta desde el enlace de la carga y quiere el envío <strong>%s</strong>. '
               || 'Hasta que no revises y aceptes su alta, la carga queda en espera y nadie más puede tomarla.</p>'
               || '<p><strong>Transportista nuevo (sin verificar)</strong>: %s · CIF %s%s%s%s</p>'
               || '<p><strong>Envío %s</strong>: %s → %s · carga %s · propone <strong>%s + IVA</strong>.</p>'
               || '<p><a href="%s%s"><strong>Revisar y aceptar el alta</strong></a> (en la ficha del envío). '
               || 'Al aprobarla, el envío queda asignado y la orden de carga le llega sola por email.</p>',
               escapar_html(v_tr), v_ref,
               escapar_html(v_tr), escapar_html(coalesce(v_cif, '—')),
               case when v_c_nombre is not null then ' · ' || escapar_html(v_c_nombre) end,
               case when v_c_tel is not null then ' · ' || escapar_html(v_c_tel) end,
               case when v_c_email is not null then ' · ' || escapar_html(v_c_email) end,
               v_ref, escapar_html(coalesce(v_origen, '—')), escapar_html(coalesce(v_destino, '—')),
               v_fecha, coalesce(euros_texto(new.precio_propuesto), '—'),
               v_base, v_enl))
      on conflict (clave) do nothing;
    end if;

  elsif old.estado = 'viva' and new.estado = 'aceptada' then
    perform crear_aviso('dynamo', null, null, 'carga_aceptada', 'ok', 'Envío aceptado · ' || v_ref,
      v_tr || ' la acepta a ' || euros_texto(new.precio_aceptado) || '.', v_enl, new.envio_id);
  elsif old.estado = 'pendiente_revision' and new.estado = 'aceptada' then
    perform crear_aviso('transportista', null, new.transportista_id, 'contraoferta_aceptada', 'ok', 'Aceptamos tu precio · ' || v_ref,
      'El envío es tuyo a ' || euros_texto(new.precio_aceptado) || '.', v_enl, new.envio_id);
  elsif old.estado = 'pendiente_revision' and new.estado = 'rechazada' then
    perform crear_aviso('transportista', null, new.transportista_id, 'contraoferta_rechazada', 'aviso', 'Tu contraoferta no ha salido · ' || v_ref,
      case when new.motivo_cierre is not null then upper(left(new.motivo_cierre, 1)) || substr(new.motivo_cierre, 2) || '.' end, null, new.envio_id);
  end if;

  -- (a) CUALQUIER camino a 'aceptada' (directa o aprobada desde la revisión) deja el
  -- email de confirmación a Dynamo: en ese instante el envío ya tiene transportista.
  if new.estado = 'aceptada' and old.estado in ('viva', 'pendiente_revision') then
    v_base := coalesce(parametro('url_plataforma') #>> '{}', 'https://www.dynamotrans.com');
    select p.poblacion into v_origen from envio_paradas p where p.envio_id = new.envio_id and p.tipo = 'carga' order by p.orden limit 1;
    select p.poblacion into v_destino from envio_paradas p where p.envio_id = new.envio_id and p.tipo = 'descarga' order by p.orden desc limit 1;
    select coalesce(to_char(e.fecha_carga_prevista, 'DD/MM/YYYY'),
                    to_char(e.fecha_carga_desde, 'DD/MM/YYYY') ||
                      case when e.fecha_carga_hasta is not null and e.fecha_carga_hasta <> e.fecha_carga_desde
                           then ' – ' || to_char(e.fecha_carga_hasta, 'DD/MM/YYYY') end,
                    'sin fecha aún')
      into v_fecha from envios e where e.id = new.envio_id;
    insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
    values ('envio_aceptado:' || new.id, 'envio_aceptado', new.envio_id, email_dynamo(),
      format('Envío %s aceptado · %s', v_ref, v_tr),
      format('<p><strong>%s</strong>%s acepta el envío <strong>%s</strong> a <strong>%s + IVA</strong>.</p>'
             || '%s<p>Ruta: %s → %s · carga %s.</p>'
             || '<p><a href="%s%s">Ver la ficha del envío</a>. La orden de carga le llega sola por email.</p>',
             escapar_html(v_tr), case when v_cif is not null then ' (CIF ' || escapar_html(v_cif) || ')' end,
             v_ref, coalesce(euros_texto(new.precio_aceptado), '—'),
             case when old.estado = 'pendiente_revision' then '<p>Aceptado tras tu aprobación en la revisión (contraoferta o alta online).</p>' else '' end,
             escapar_html(coalesce(v_origen, '—')), escapar_html(coalesce(v_destino, '—')), v_fecha,
             v_base, v_enl))
    on conflict (clave) do nothing;
  end if;
  return null;
end $function$;
