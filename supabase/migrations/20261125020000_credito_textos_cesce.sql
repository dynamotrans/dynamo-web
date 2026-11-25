-- =====================================================================================
-- CRÉDITO: CUANDO EL «SIN CRÉDITO» VIENE DE CESCE, SE DICE Y SE MANDA A CESCE (usuario, 2026-11-25)
-- =====================================================================================
-- «Esta cuenta no tiene crédito disponible por CESCE: los envíos se pagan por anticipado.
-- ¿No estás conforme con tu crédito? Contacta con CESCE y lo revisan. +34 900 115 000
-- (teléfono gratuito)» · y en el email: «…ha quedado sin efecto por cambios en su
-- clasificación… contacta con CESCE en el teléfono gratuito +34 900 115 000».
--
-- OJO: el «sin crédito» puede venir de dos sitios y no se puede decir lo mismo en los dos:
--   · de CESCE (no hay crédito manual de Dynamo y el de CESCE es 0) → se dice que es por
--     CESCE y se da su teléfono;
--   · de Dynamo (el crédito manual está puesto a 0, también cuando se bloquea por pagos
--     tardíos) → mandar al cliente a CESCE sería falso: se queda el texto de «contáctanos».
-- Por eso hay un estado nuevo, «nulo_cesce», además del «nulo» de siempre.

create or replace function public.mi_cobertura_credito()
returns text
language sql
stable security definer
set search_path to 'public'
as $$
  select case
           when c.riesgo_efectivo_euros is null then 'sinclasif'
           when c.riesgo_efectivo_euros <= 0    then case when c.riesgo_manual_euros is null then 'nulo_cesce' else 'nulo' end
           when coalesce((select u.usado from credito_uso_cliente(c.id) u), 0) >= c.riesgo_efectivo_euros
             or exists (select 1 from envios e
                         where e.cliente_id = c.id and not coalesce(e.es_manual, false)
                           and e.estado not in ('borrador', 'cancelado')
                           and e.estado_pago_previo = 'pendiente'
                           and e.pago_motivo like 'Crédito insuficiente%')
             then 'superado'
           else 'disponible'
         end
    from clientes c
   where c.id = cliente_del_usuario()
$$;
comment on function public.mi_cobertura_credito() is '[Precio y pago] Estado de crédito del cliente que llama, sin importes: disponible, superado (tiene crédito pero lo ha consumido o tiene un envío pendiente de pago por no caberle), nulo_cesce (sin crédito porque CESCE no le da: no hay crédito manual de Dynamo y el de CESCE es 0), nulo (sin crédito por decisión de Dynamo: el crédito manual está a 0) o sinclasif (sin clasificar todavía). En nulo, nulo_cesce y sinclasif se paga por anticipado. Quién: cliente. Argumentos: sin argumentos.';

-- El email de «línea retirada»: si la ha retirado CESCE, lo dice y da el teléfono de CESCE.
create or replace function fn_email_credito_cambio()
returns trigger language plpgsql security definer set search_path = public as $$
declare a numeric := coalesce(old.riesgo_efectivo_euros, 0); n numeric := coalesce(new.riesgo_efectivo_euros, 0);
  v_cesce boolean; v_que text; v_cuerpo text; v_previo boolean := coalesce((parametro('pago_previo_activo'))::text, 'false') = 'true';
  v_por_cesce boolean;
begin
  if a = n or (a <= 0 and n <= 0) then return null; end if;
  -- De quién es la línea que queda (o la que se retira): el crédito manual de Dynamo manda sobre CESCE.
  v_cesce := case when n > 0 then coalesce(new.riesgo_manual_euros, 0) = 0 else coalesce(old.riesgo_manual_euros, 0) = 0 end;
  -- La retira CESCE (y no Dynamo) cuando la línea era la de CESCE y sigue sin haber crédito manual.
  v_por_cesce := v_cesce and new.riesgo_manual_euros is null;
  if a <= 0 then
    v_que := 'concedida';
    v_cuerpo := format('<p>Tu empresa ya tiene <strong>línea de crédito</strong> con Dynamo%s.</p><p>Desde ahora tus envíos se pagan <strong>a vencimiento</strong>%s, sin pago por adelantado.</p>',
      case when v_cesce then ', respaldada por CESCE' else '' end,
      case when coalesce(new.plazo_pago_dias, 0) > 0 then format(' (a %s días)', new.plazo_pago_dias) else '' end);
  elsif n <= 0 and v_por_cesce then
    v_que := 'retirada';
    v_cuerpo := format('<p>Tu línea de crédito con Dynamo (respaldada por CESCE) ha quedado <strong>sin efecto</strong> por cambios en su clasificación.</p>%s<p>Los envíos que ya están en curso no cambian. Para recuperarla, mantén al día las facturas pendientes y contacta con CESCE en el teléfono gratuito <strong>+34 900 115 000</strong>.</p>',
      case when v_previo then '<p>Desde ahora los envíos nuevos se pagan <strong>por adelantado</strong>.</p>' else '' end);
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
comment on function public.fn_email_credito_cambio() is '[Gestión interna] Disparador de clientes: cuando cambia la línea de crédito que limita a un cliente (el crédito manual de Dynamo o, si no lo hay, el de CESCE), le encola el email de línea concedida, ampliada, reducida o retirada, sin importes; si la retira CESCE (no hay crédito manual de Dynamo), el email lo dice y da el teléfono gratuito de CESCE; si se reduce, revisa además si ha quedado cerca del límite. Quién: nadie la llama; la ejecuta la base de datos.';
