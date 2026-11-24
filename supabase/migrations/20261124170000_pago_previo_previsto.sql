-- =====================================================================================
-- SABER ANTES DE CREAR SI UN ENVÍO VA A PEDIR PAGO POR ADELANTADO (usuario, 2026-11-24)
-- =====================================================================================
-- «Si sabemos de antemano que no tendrá crédito para ese envío, ¿por qué no ponemos en
-- esa pantalla si está seguro de que va a pagar? Si no va a tramitarlo, que espere y cree
-- el envío más tarde… por evitar crear envíos sin ser luego pagados, bajar la tasa.»
--
-- HASTA AHORA la pantalla de «Confirmar envío» solo avisaba a las cuentas SIN crédito. El
-- cliente con crédito cuyo envío no cabe en lo que le queda, o que está en sus primeros
-- envíos, se enteraba DESPUÉS de crearlo, con el plazo ya corriendo.
--
-- AHORA esta función dice, ANTES de crear, si cada envío nacería «pendiente de pago». Es
-- la misma cuenta que hace pago_previo_motivo() al confirmar, pero con importes en vez de
-- con un envío que todavía no existe:
--     1 · pago por adelantado apagado → ninguno;
--     2 · sin crédito (sin clasificar o 0 €) → todos;
--     3 · primeros envíos del cliente (si no está exento ni tiene el crédito CESCE máximo);
--     4 · lo ya usado + este envío (con IVA) supera su línea de crédito.
-- Con varios importes (Crear varios envíos) los va sumando en orden: el que va a crédito
-- gasta crédito para los siguientes; el que queda pendiente de pago, no.
--
-- Devuelve SOLO sí/no por envío: el cliente no ve importes ni motivos de crédito.
-- Es una PREVISIÓN para avisar: quien decide de verdad sigue siendo el envío al crearse.

create or replace function public.pago_previo_previsto(p_importes numeric[], p_cliente uuid default null)
returns boolean[] language plpgsql stable security definer set search_path = public as $$
declare
  -- El cliente solo pregunta por sí mismo; el equipo de Dynamo, por el cliente que elige.
  v_cliente uuid := case when es_equipo_dynamo() then p_cliente else cliente_del_usuario() end;
  n int := coalesce(array_length(p_importes, 1), 0);
  c record; n_prev int := 0; n_primeros numeric; mira_primeros boolean; mira_credito boolean;
  usado numeric := 0; con_iva numeric; pide boolean; res boolean[] := '{}';
begin
  if n = 0 then return res; end if;
  if n > 50 then raise exception 'Demasiados envíos de una vez.'; end if;
  if v_cliente is null or not coalesce((parametro('pago_previo_activo') #>> '{}')::boolean, false) then
    return array_fill(false, array[n]);
  end if;
  select riesgo_efectivo_euros, exento_pago_previo_primer_envio, riesgo_cesce_euros, coalesce(iva_pct, 21) as iva
    into c from clientes where id = v_cliente;
  if not found then return array_fill(false, array[n]); end if;
  if coalesce(c.riesgo_efectivo_euros, 0) <= 0 then return array_fill(true, array[n]); end if;

  n_primeros := parametro_num('pago_previo_primeros_envios', 1);
  mira_primeros := not c.exento_pago_previo_primer_envio
     and not (parametro_num('pago_previo_cesce_sin_primeros_euros', 0) > 0
              and coalesce(c.riesgo_cesce_euros, 0) >= parametro_num('pago_previo_cesce_sin_primeros_euros', 0));
  if mira_primeros then
    select count(*) into n_prev from envios
     where cliente_id = v_cliente and not coalesce(es_manual, false)
       and estado not in ('borrador', 'cancelado') and estado_pago_previo <> 'pendiente';
  end if;
  mira_credito := coalesce((parametro('credito_limite_exige_pago') #>> '{}')::boolean, true);
  if mira_credito then
    -- Lo usado: lo mismo que cuenta credito_alcanza().
    select coalesce(sum(round(coalesce(x.importe_cliente, 0) * (1 + c.iva / 100), 2)), 0) into usado
      from envios x
     where x.cliente_id = v_cliente and not coalesce(x.es_manual, false)
       and x.estado not in ('borrador', 'cancelado')
       and x.estado_pago_previo in ('no_requerido', 'exento')
       and coalesce(x.fecha_carga_real, x.fecha_carga_desde, x.creado_en::date)
           >= (now() at time zone 'Europe/Madrid')::date - parametro_num('riesgo_dias_asumido', 60)::int;
  end if;

  for i in 1..n loop
    pide := false;
    if mira_primeros and n_prev < n_primeros then
      pide := true;
    elsif mira_credito and p_importes[i] is not null and p_importes[i] > 0 then
      con_iva := round(p_importes[i] * (1 + c.iva / 100), 2);
      if usado + con_iva > c.riesgo_efectivo_euros then pide := true; else usado := usado + con_iva; end if;
    end if;
    if not pide then n_prev := n_prev + 1; end if;   -- el que va a crédito ya cuenta como envío hecho
    res := res || pide;
  end loop;
  return res;
end $$;

comment on function public.pago_previo_previsto(numeric[], uuid) is '[Precio y pago] Previsión, ANTES de crear, de si cada envío (por su importe sin IVA, en orden) nacería pendiente de pago por adelantado: sin crédito, primeros envíos o crédito que no alcanza. Devuelve solo sí/no por envío, sin importes ni motivos. El cliente pregunta por sí mismo; Dynamo, por el cliente indicado.';

revoke all on function public.pago_previo_previsto(numeric[], uuid) from public, anon;
grant execute on function public.pago_previo_previsto(numeric[], uuid) to authenticated, service_role;
