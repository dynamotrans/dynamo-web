-- =====================================================================================
-- EL CLIENTE VE POR QUÉ SE CANCELÓ: anulado por no pagar dentro del plazo (usuario, 2026-11-24)
-- =====================================================================================
-- «En caso de que se cancele por falta de pago en plazo, ¿podemos poner el motivo en una
-- caja amarilla, diciendo que es cancelado por no abonar dentro del plazo, para que sepa
-- por qué es?»
--
-- El motivo ya queda apuntado en el historial del envío (hito «incidencia» con
-- motivo_cancelacion «Anulado sin pago…», lo deja caducar_pagos_pendientes), pero el
-- cliente no lee los datos de los hitos. Esta función solo contesta sí/no para SU envío.

create or replace function public.envio_anulado_sin_pago(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (envio_del_cliente(p_envio) or ve_todo())
     and exists (select 1 from envios e where e.id = p_envio and e.estado = 'cancelado')
     and exists (select 1 from envio_hitos h
                  where h.envio_id = p_envio and h.hito = 'incidencia'
                    and h.datos ->> 'motivo_cancelacion' like 'Anulado sin pago%')
$$;
comment on function public.envio_anulado_sin_pago(uuid) is '[Precio y pago] true si el envío está cancelado porque el sistema lo anuló al no recibir el pago por adelantado dentro del plazo (lo dice su historial). Solo contesta para un envío del propio cliente o para Dynamo; para cualquier otro, false. Quién: cliente dueño del envío o Dynamo. Argumentos: p_envio: envios.id.';
revoke all on function public.envio_anulado_sin_pago(uuid) from public, anon;
grant execute on function public.envio_anulado_sin_pago(uuid) to authenticated, service_role;
