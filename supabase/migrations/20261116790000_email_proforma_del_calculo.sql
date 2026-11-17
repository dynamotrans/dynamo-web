-- =====================================================================================
-- EMAIL CON LA PROFORMA DEL CÁLCULO ADJUNTA (usuario, 2026-11-16)
-- =====================================================================================
-- «Al pulsar email, que adjunte el PDF, que ahora no lo adjunta.» El botón de enviar el
-- cálculo abría el correo del dispositivo con el texto, y un enlace de correo no puede
-- llevar adjuntos. Ahora lo manda la plataforma, con la proforma en PDF adjunta (sin
-- numerar y no vinculante: no crea ningún envío). Hace falta un tipo nuevo en el registro
-- de emails: proforma_calculo.
alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida',
                  'envio_aceptado', 'alta_pendiente', 'deca', 'cuenta_activada', 'cuenta_reactivada',
                  'cambio_email', 'envio_creado', 'envio_modificado', 'envio_cancelado', 'envio_matriculas',
                  'envio_reactivado', 'credito_cambio', 'credito_aviso', 'proforma_calculo'));
do $$ declare v text := col_description('public.emails_enviados'::regclass,
    (select attnum from pg_attribute where attrelid = 'public.emails_enviados'::regclass and attname = 'tipo'));
  n text;
begin
  n := replace(v, ' | obligatorio | ', ' · proforma_calculo (el precio calculado en Nuevo envío, con la proforma sin numerar en PDF adjunta, a quien lo pida) | obligatorio | ');
  if n = v then raise exception 'emails_enviados.tipo: no encuentro dónde añadir el tipo nuevo al comentario'; end if;
  execute format('comment on column public.emails_enviados.tipo is %L', n);
end $$;
