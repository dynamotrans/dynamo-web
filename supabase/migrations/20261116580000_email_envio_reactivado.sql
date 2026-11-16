-- =====================================================================================
-- EMAIL «ENVÍO REACTIVADO» AL DESHACER UNA CANCELACIÓN (usuario, 2026-11-16)
-- =====================================================================================
-- Al cancelar un envío el cliente recibe «Envío cancelado»; si después Dynamo deshacía la
-- cancelación, no recibía nada y se quedaba creyendo que seguía cancelado. Desde hoy:
--
--   · Al deshacer la cancelación sale «Envío reactivado», con el detalle del envío.
--   · Si el email de «cancelado» AÚN NO había salido (se canceló y se deshizo en
--     segundos, por error), se anula ese y no se manda ninguno de los dos: el cliente no
--     llegó a enterarse y no hay nada que contarle.
--   · Como el resto: al usuario del cliente y sus copias, y no en gestión directa.
--
-- De paso, la clave del email de «cancelado» pasa a llevar el instante exacto de la
-- operación (antes, el minuto): cancelar, deshacer y volver a cancelar dentro del mismo
-- minuto dejaba la segunda cancelación sin email.

alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida',
                  'envio_aceptado', 'alta_pendiente', 'deca', 'cuenta_activada', 'cuenta_reactivada',
                  'cambio_email', 'envio_creado', 'envio_modificado', 'envio_cancelado', 'envio_matriculas',
                  'envio_reactivado'));
comment on column public.emails_enviados.tipo is 'formato: texto | rango: no aplica | lista: matriculas · vispera · orden_carga · firma_cmr · cmr_completo · difusion · difusion_fin · difusion_recordatorio · aviso_entrega · aviso_parada · aviso_parada_cancelada · cuenta_suspendida · envio_aceptado · alta_pendiente · deca (el DeCA en PDF al transportista, en cada versión) · cuenta_activada (al usuario, cuando Dynamo confirma su alta) · cuenta_reactivada (al usuario, cada vez que su cuenta suspendida vuelve a estar activa) · cambio_email (a la dirección antigua y a la nueva, cuando cambia el email de acceso de una cuenta) · envio_creado (al cliente, cuando su envío queda confirmado) · envio_modificado (al cliente, con lo que ha cambiado) · envio_cancelado (al cliente) · envio_matriculas (al cliente, al ponerse o cambiar las matrículas con el transportista ya asignado) · envio_reactivado (al cliente, al deshacerse una cancelación que ya se le había comunicado) | obligatorio | Qué aviso es. Ej. OK: matriculas';

-- El de «cancelado», con la clave al instante de la operación (el resto, igual).
do $$
declare v_oid oid := 'public.fn_email_envio_cancelado()'::regprocedure; v_def text; v_nueva text;
  v_aguja text := 'to_char(now() at time zone ''utc'', ''YYYYMMDDHH24MI'')';
begin
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_aguja, ''))) / length(v_aguja) <> 2 then
    raise exception 'La clave del email de cancelado no aparece dos veces en fn_email_envio_cancelado: revisar antes de aplicar.';
  end if;
  v_nueva := replace(v_def, v_aguja, 'to_char(now() at time zone ''utc'', ''YYYYMMDDHH24MISSUS'')');
  execute v_nueva;
end $$;

create or replace function fn_email_envio_reactivado()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  -- La cancelación no se le llegó a comunicar: se anula ese email y no se manda ninguno.
  update emails_enviados set estado = 'omitido', error = 'La cancelación se deshizo antes de mandarlo.'
   where envio_id = new.id and tipo = 'envio_cancelado' and estado = 'pendiente';
  get diagnostics n = row_count;
  if n > 0 then return null; end if;
  perform fn_email_envio_cliente(new.id, 'envio_reactivado:' || new.id || ':' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISSUS'),
    'envio_reactivado', 'Envío reactivado',
    '<p>Tu envío vuelve a estar <strong>activo</strong>: se ha deshecho la cancelación y sigue adelante con estos datos.</p>');
  return null;
end $$;
revoke execute on function fn_email_envio_reactivado() from public, anon, authenticated;
comment on function public.fn_email_envio_reactivado() is '[Gestión interna] Disparador de envios: al deshacerse la cancelación de un envío encola el email «Envío reactivado» para el cliente, con el detalle del envío. Si el email de «cancelado» aún no había salido, lo anula y no manda ninguno. Quién: nadie la llama; la ejecuta la base de datos.';

create trigger tg_envios_y_email_reactivado after update of estado on envios
  for each row when (old.estado = 'cancelado' and new.estado not in ('borrador', 'cancelado') and not coalesce(new.es_manual, false))
  execute function fn_email_envio_reactivado();
