-- =====================================================================================
-- EL EMAIL DE «ENVÍO CREADO» DICE HASTA CUÁNDO SE PUEDE PAGAR (usuario, 2026-11-19)
-- =====================================================================================
-- «En el aviso de pago indica el tiempo que tiene para tramitar el pago… y si no, caduca
-- el envío y la proforma, se anula todo y hay que generar un envío nuevo.»
-- El email de un envío que nace pendiente de pago decía solo «Pendiente de pago». Ahora
-- añade la hora límite (la misma de la ficha: pago_limite) y lo que pasa si se pasa.
-- La regla del plazo NO cambia aquí.
-- =====================================================================================

create or replace function public.fn_email_envio_creado()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare e record; v_limite timestamptz;
begin
  select id, estado, estado_pago_previo, pago_pendiente_en, pago_a_cuenta, fecha_carga_desde, estado_revision_precio
    into e from envios where id = new.envio_id;
  if e.id is null or e.estado in ('borrador', 'cancelado') then return null; end if;
  -- Con el precio todavía provisional el plazo no ha empezado (se pide al revisarlo).
  if e.estado_pago_previo = 'pendiente' and e.pago_pendiente_en is not null and coalesce(e.pago_a_cuenta, 0) = 0
     and not coalesce(precio_por_revisar(e.estado_revision_precio), false) then
    v_limite := pago_limite(e.pago_pendiente_en, e.fecha_carga_desde);
  end if;
  perform fn_email_envio_cliente(e.id, 'envio_creado:' || e.id, 'envio_creado', 'Envío creado',
    '<p>Tu envío ya está <strong>creado</strong>.</p>'
    || case when e.estado_pago_previo = 'pendiente'
            then '<p style="color:#b42318"><strong>Pendiente de pago: el envío queda en firme cuando recibamos el pago. Puedes pagarlo desde su ficha.</strong></p>'
              || case when v_limite is not null
                      then '<p><strong>Plazo para pagar: hasta el ' || fecha_hora_texto(v_limite) || '.</strong> Si no nos llega el pago en ese plazo, '
                        || 'el envío y su proforma se anulan solos y tendrás que crear un envío nuevo, con el precio de ese momento.</p>'
                      else '' end
            else '' end);
  return null;
end $function$;
