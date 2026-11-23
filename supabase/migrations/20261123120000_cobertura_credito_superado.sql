-- COBERTURA DE CRÉDITO: estado «superado» (usuario, 2026-11-23: «si ya consumió, debemos poner
-- otro estado: ha superado el crédito disponible; conforme se vayan pagando facturas se irá
-- liberando crédito»). Hasta ahora el indicador del cliente decía «Con crédito disponible»
-- aunque un envío se le hubiera quedado pendiente de pago por no caberle en el crédito.
--
--   sinclasif  · sin clasificar (riesgo sin informar)
--   nulo       · crédito 0: pago por anticipado (rojo)
--   superado   · tiene crédito, pero ya lo ha consumido, o tiene un envío esperando el pago
--                porque no le cabía (naranja)
--   disponible · con crédito disponible (verde)
--
-- Sigue sin dar importes: solo el estado.
create or replace function public.mi_cobertura_credito()
returns text
language sql
stable security definer
set search_path to 'public'
as $$
  select case
           when c.riesgo_efectivo_euros is null then 'sinclasif'
           when c.riesgo_efectivo_euros <= 0    then 'nulo'
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

comment on function public.mi_cobertura_credito() is '[Precio y pago] Estado de crédito del cliente que llama, sin importes: disponible, superado (tiene crédito pero lo ha consumido o tiene un envío pendiente de pago por no caberle), nulo (sin crédito: pago por anticipado) o sinclasif (sin clasificar). Quién: cliente. Argumentos: sin argumentos.';
