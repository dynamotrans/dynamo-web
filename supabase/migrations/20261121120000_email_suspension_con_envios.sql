-- Email de cuenta suspendida (usuario, 2026-11-21): cuando la suspensión es por
-- cancelaciones (reglas 4 y 5), el email al buzón de Dynamo dice QUÉ envíos han contado,
-- QUIÉN los canceló y CUÁNDO. Así se ve de un vistazo si fue el cliente o alguien de
-- Dynamo «en nombre del cliente» (por ejemplo, probando con «Ver como cliente»).

-- Los envíos cancelados que cuentan para las reglas 4 (todos desde que empezó a contar) y 5
-- (los de los últimos días del parámetro). MISMO criterio que autosuspension_motivos.
create or replace function public.autosuspension_cancelaciones(p_usuario uuid, p_recientes boolean default false)
returns table(envio_id uuid, referencia_gx text, cancelado_en timestamptz, quien_nombre text, quien_email text, por_dynamo boolean)
language sql stable security definer set search_path = public as $$
  with u as (
    select coalesce(x.autosuspension_desde_en, x.creado_en) as desde from usuarios x where x.id = p_usuario
  ), h as (
    select distinct on (h.envio_id) h.envio_id, h.cuando, h.quien
      from envio_hitos h join envios e on e.id = h.envio_id, u
     where h.hito = 'cancelado'
       and case when p_recientes
                -- Regla 5: las que canceló él (o Dynamo en su nombre) en los últimos días.
                then (h.quien = p_usuario or (e.cancelado_en_nombre_cliente and e.creado_por = p_usuario))
                     and h.cuando >= greatest(u.desde, now() - make_interval(days => parametro_num('autosuspension_cancel_recientes_dias', 10)::int))
                -- Regla 4: de los envíos que creó desde que empezó a contar.
                else (h.quien = p_usuario or e.cancelado_en_nombre_cliente) and e.creado_por = p_usuario and e.creado_en >= u.desde end
       and not e.cancelacion_sin_coste
       and cancelacion_cuenta(e.transportista_id, h.cuando, coalesce(e.fecha_carga_prevista, e.fecha_carga_desde, e.fecha_carga_real))
     order by h.envio_id, h.cuando desc
  )
  select h.envio_id, e.referencia_gx, h.cuando, q.nombre, q.email,
         coalesce(q.rol::text not in ('cliente', 'transportista'), false)
    from h join envios e on e.id = h.envio_id left join usuarios q on q.id = h.quien
   order by h.cuando desc
   limit 50
$$;
revoke execute on function public.autosuspension_cancelaciones(uuid, boolean) from public, anon, authenticated;
comment on function public.autosuspension_cancelaciones(uuid, boolean) is '[Clientes y cuentas] Lista los envíos cancelados que cuentan para la suspensión automática de un usuario, con quién los canceló (nombre, email y si era del equipo de Dynamo, en nombre del cliente) y cuándo; mismo criterio que autosuspension_motivos. Máximo 50, los más recientes primero. Quién: funciones internas (el email de cuenta suspendida). Argumentos: p_usuario: usuarios.id · p_recientes: true = solo los de los últimos días de la regla 5; false = todos los de la regla 4.';

-- El email al buzón de Dynamo: lo de antes y, si la regla es la 4 o la 5, la tabla de envíos.
create or replace function public.fn_usuarios_aviso_suspension()
returns trigger language plpgsql security definer set search_path = public as $function$
declare v_email text := parametro('dynamo_email') #>> '{}';
        v_tabla text := '';
        v_regla5 boolean := coalesce(new.suspension_motivo, '') like '%Regla 5%';
begin
  -- El buzón sale SOLO del parámetro (regla de la casa: nada escrito a mano).
  if v_email is null or v_email = '' then return null; end if;
  -- Reglas de cancelaciones: qué envíos han contado, quién los canceló y cuándo.
  if v_regla5 or coalesce(new.suspension_motivo, '') like '%Regla 4%' then
    select coalesce('<p style="margin:18px 0 6px"><strong>Envíos que han contado</strong></p>'
             || '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">'
             || '<tr><th align="left" style="padding:6px 8px;border-bottom:1px solid #e5e7eb">Envío</th>'
             || '<th align="left" style="padding:6px 8px;border-bottom:1px solid #e5e7eb">Cancelado por</th>'
             || '<th align="left" style="padding:6px 8px;border-bottom:1px solid #e5e7eb">Cuándo</th></tr>'
             || string_agg(format('<tr><td style="padding:6px 8px;border-bottom:1px solid #f1f1f4"><strong>#%s</strong></td>'
                                  || '<td style="padding:6px 8px;border-bottom:1px solid #f1f1f4">%s</td>'
                                  || '<td style="padding:6px 8px;border-bottom:1px solid #f1f1f4;white-space:nowrap">%s</td></tr>',
                                  escapar_html(c.referencia_gx),
                                  case when c.quien_email is null then 'El sistema'
                                       else escapar_html(coalesce(nullif(c.quien_nombre, ''), c.quien_email))
                                            || case when nullif(c.quien_nombre, '') is not null then ' (' || escapar_html(c.quien_email) || ')' else '' end
                                            || case when c.por_dynamo then ' · <strong>equipo de Dynamo, en nombre del cliente</strong>' else '' end end,
                                  to_char(c.cancelado_en at time zone 'Europe/Madrid', 'DD/MM/YY HH24:MI')), '' order by c.cancelado_en desc)
             || '</table>', '')
      into v_tabla
      from autosuspension_cancelaciones(new.id, v_regla5) c;
  end if;
  insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
  values ('cuenta_suspendida:' || new.id || ':' || extract(epoch from coalesce(new.suspendida_en, now()))::bigint,
          'cuenta_suspendida',
          v_email,
          format('Cuenta suspendida automáticamente: %s · Dynamo', new.email),
          format('<p>El sistema ha <strong>suspendido</strong> la cuenta <strong>%s</strong>%s.</p>'
                 || '<p><strong>Motivo:</strong> %s</p>'
                 || '%s'
                 || '<p>Si es un cliente legítimo, se reactiva desde el panel (Usuarios, estado «Activa»): el contador de las reglas vuelve a empezar.</p>'
                 || format('<p><a href="%s/panel/usuarios?q=%s&amp;abrir=%s" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">Revisar la cuenta</a></p>',
                           coalesce(parametro('url_plataforma') #>> '{}', ''), replace(replace(new.email, '%', ''), '+', '%%2B'), new.id),
                 escapar_html(new.email),
                 coalesce((select ' de <strong>' || escapar_html(c.razon_social) || '</strong>' from clientes c where c.id = new.cliente_id), ''),
                 escapar_html(coalesce(new.suspension_motivo, '')),
                 v_tabla))
  on conflict (clave) do nothing;
  return null;
end $function$;
revoke execute on function public.fn_usuarios_aviso_suspension() from public, anon, authenticated;
comment on function public.fn_usuarios_aviso_suspension() is '[Clientes y cuentas] Disparador interno: cuando una cuenta activa pasa a suspendida por la suspensión AUTOMÁTICA (motivo «Automática…»), encola un email al buzón de Dynamo (parámetro dynamo_email) con el usuario, su empresa y el motivo, para que el equipo esté al tanto; si el motivo son las cancelaciones (reglas 4 y 5), añade qué envíos han contado, quién los canceló y cuándo. Una vez por suspensión (clave única). Quién: disparador, nadie lo llama a mano. Argumentos: ninguno.';
