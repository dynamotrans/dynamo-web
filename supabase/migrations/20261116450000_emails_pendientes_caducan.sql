-- =====================================================================================
-- LOS EMAILS PENDIENTES CADUCAN A LAS 24 HORAS (2026-11-16, antes de conectar Postmark)
-- =====================================================================================
-- La cola de emails lleva semanas llenándose en pruebas sin poder enviar (todavía no hay
-- token de Postmark). Tal como estaba, el día que se ponga el token saldrían DE GOLPE
-- todos los avisos viejos: ofertas de cargas que ya no existen, vísperas de envíos de hace
-- semanas, altas ya resueltas… a quien toque.
--
-- Regla nueva, para siempre: un email que lleva más de 24 horas pendiente ya no se manda.
-- Queda en el registro como «omitido», con el motivo. Un aviso operativo con un día de
-- retraso (una oferta, una víspera, un cambio) confunde más que ayuda; y si el envío de
-- emails se cae un día entero, al volver no se dispara una ráfaga de avisos caducados.

do $$
declare v_oid oid := 'public.enviar_emails_pendientes()'::regprocedure; v_def text; v_nueva text;
begin
  v_def := pg_get_functiondef(v_oid);
  v_nueva := replace(v_def,
    'if not exists (select 1 from pg_extension where extname = ''pg_net'') then return 0; end if;',
    '-- Lo que lleva más de 24 horas pendiente ya no se manda (queda como omitido).' || chr(10) ||
    '  update emails_enviados set estado = ''omitido'', error = ''Llevaba más de 24 horas sin poder enviarse: ya no se manda.''' || chr(10) ||
    '   where estado = ''pendiente'' and creado_en < now() - interval ''24 hours'';' || chr(10) ||
    '  if not exists (select 1 from pg_extension where extname = ''pg_net'') then return 0; end if;');
  if v_nueva = v_def then raise exception 'No encuentro el comienzo de enviar_emails_pendientes: revisar antes de aplicar.'; end if;
  execute v_nueva;
  execute format('comment on function public.enviar_emails_pendientes() is %L',
    obj_description(v_oid, 'pg_proc') || ' Un email que lleva más de 24 horas pendiente ya no se manda: queda como omitido, con el motivo.');
end $$;

-- Lo acumulado hasta hoy, de una vez (la tarea lo haría igual en su próxima pasada).
update emails_enviados set estado = 'omitido', error = 'Llevaba más de 24 horas sin poder enviarse: ya no se manda.'
 where estado = 'pendiente' and creado_en < now() - interval '24 hours';
