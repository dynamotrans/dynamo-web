-- EMAIL AL CLIENTE CUANDO SU ALBARÁN O SU CMR FIRMADO YA ESTÁ DISPONIBLE (usuario, 2026-11-18).
--
-- La ficha del envío le dice al cliente: «El albarán y el CMR firmado aparecen aquí en cuanto
-- los tengamos y se te notificará por email». Hasta ahora solo salía el aviso de la campana
-- (fn_avisos_documentos); el email no existía. Ahora, en el mismo momento —cuando el
-- documento pasa a ser visible para el cliente—, se le encola además un email con el enlace
-- a su ficha (fn_email_envio_cliente: una vez por documento, con copia a Dynamo como todos, y
-- nada en los envíos de gestión directa).

alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida',
                  'envio_aceptado', 'alta_pendiente', 'deca', 'cuenta_activada', 'cuenta_reactivada',
                  'cambio_email', 'envio_creado', 'envio_modificado', 'envio_cancelado', 'envio_matriculas',
                  'envio_reactivado', 'credito_cambio', 'credito_aviso', 'proforma_calculo',
                  'transportista_cancelado', 'transportista_retirado', 'transportista_modificado',
                  'credito_bloqueo', 'resumen_sitio', 'documento_disponible'));

create or replace function public.fn_avisos_documentos()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record; v_que text;
begin
  if new.envio_id is null or not new.visible_cliente or new.tipo not in ('albaran', 'cmr_firmado') then return null; end if;
  if tg_op = 'UPDATE' and old.visible_cliente then return null; end if;
  select id, referencia_gx, cliente_id into e from envios where id = new.envio_id;
  v_que := case new.tipo when 'albaran' then 'Albarán disponible' else 'CMR firmado disponible' end;
  perform crear_aviso('cliente', e.cliente_id, null, 'documento', 'info',
    v_que || ' · #' || coalesce(e.referencia_gx, ''),
    'Lo tienes en la ficha del envío, en Documentos.', '/panel/envios?ver=' || e.id, e.id);
  -- Y por email (una vez por documento).
  perform fn_email_envio_cliente(e.id, 'documento_disponible:' || new.id, 'documento_disponible', v_que,
    case new.tipo when 'albaran'
         then '<p>Ya tienes el <strong>albarán</strong> de tu envío.</p>'
         else '<p>Ya tienes el <strong>CMR firmado</strong> de tu envío.</p>' end
    || '<p>Lo puedes ver y descargar en la ficha del envío, en el apartado <strong>Documentos</strong>.</p>');
  return null;
end $$;
