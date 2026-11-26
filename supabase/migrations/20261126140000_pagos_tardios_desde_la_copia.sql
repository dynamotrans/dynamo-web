-- PAGOS TARDÍOS CON LAS FACTURAS DE VERDAD, Y A 60 DÍAS (usuario, 2026-11-26).
-- «A efectos de la plataforma, sí: controlar que no se pasen más de 60 días para pagar. Hay
-- quien paga al contado, a 30 o a 60, pero más de 60 no, porque es el límite legal. En la
-- facturación pongo un vencimiento de 120 días por tener cobertura con la aseguradora, pero el
-- plazo máximo pactado es 60. Si se pasa de 60, cuenta como que paga tarde. Y para saber quién
-- paga por encima de 60 días, que tengo que llamarlo.»
--   · La regla de pagos tardíos (17-nov) ya no se alimenta a mano: sus facturas salen de la
--     copia de facturas emitidas (cada vez que se lee la facturación).
--   · Los días se cuentan SIEMPRE desde la emisión (el vencimiento de la facturación es el de la
--     aseguradora, no el pactado): 60 días.
--   · Una factura pagada de la que aún no se sabe el día del cobro NO cuenta (ni a favor ni en
--     contra) hasta que se sepa: si no, saldría como «sin cobrar».
--   · Lo apuntado a mano se queda; si la misma factura llega de la copia, pasa a ser de la copia.
-- La regla sigue APAGADA (pago_tarde_activo): no quita crédito a nadie hasta que se encienda.

-- ---- 1. Parámetros: 60 días, desde la emisión -------------------------------------------
update parametros set valor = '60'::jsonb, descripcion = 'Pagos tardíos: días que tiene un cliente para pagar una factura, contados desde su emisión (el plazo máximo pactado es 60; el vencimiento a 120 días de la facturación es el de la aseguradora). La que se cobra más tarde, o sigue sin cobrar pasado ese plazo, cuenta como tardía.'
 where clave = 'pago_tarde_dias_max' and valor = '70'::jsonb;
update parametros set valor = 'false'::jsonb where clave = 'pago_tarde_desde_vencimiento';

-- ---- 2. Las facturas de cada cliente, desde la copia ---------------------------------------
create or replace function public.facturas_cliente_desde_copia()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int := 0; v_c uuid;
begin
  if not (es_servidor() or es_consola_supabase()) then raise exception 'Solo el servidor pasa las facturas de la copia.' using errcode = '42501'; end if;
  -- Mientras se pasan, no se revisa cliente a cliente (con la lista a medias saldrían tardías de más).
  perform set_config('dynamo.sin_revisar_pagos', 'on', true);
  -- Lo apuntado a mano que es la misma factura (mismo cliente y número): pasa a ser de la copia.
  update facturas_cliente fc set origen = 'holded', ref_externa = f.ref_externa
    from facturas_emitidas f
   where f.cliente_id = fc.cliente_id and f.numero = fc.numero and fc.ref_externa is null and f.tipo = 'factura'
     and not exists (select 1 from facturas_cliente x where x.ref_externa = f.ref_externa);
  -- Las de la copia que ya no deben estar (anuladas, abonos, o ya no casan con ese cliente).
  delete from facturas_cliente fc
   where fc.origen = 'holded' and fc.ref_externa is not null
     and not exists (select 1 from facturas_emitidas f where f.ref_externa = fc.ref_externa and f.tipo = 'factura'
                       and f.estado <> 'anulada' and f.cliente_id = fc.cliente_id and f.numero is not null);
  -- Nuevas y cambiadas.
  insert into facturas_cliente (cliente_id, numero, fecha_emision, fecha_vencimiento, fecha_cobro, importe, no_cuenta, origen, ref_externa, creado_por)
  select f.cliente_id, left(btrim(f.numero), 60), f.fecha_emision,
         case when f.fecha_vencimiento >= f.fecha_emision then f.fecha_vencimiento end,
         case when f.pendiente <= 0 and f.pagada_el is not null then greatest(f.pagada_el, f.fecha_emision) end,
         greatest(f.total, 0),
         -- Pagada sin saber cuándo: no cuenta hasta que se sepa.
         f.pendiente <= 0 and f.pagada_el is null,
         'holded', f.ref_externa, null
    from facturas_emitidas f
   where f.tipo = 'factura' and f.estado <> 'anulada' and f.cliente_id is not null and nullif(btrim(f.numero), '') is not null
     and not exists (select 1 from facturas_cliente m where m.cliente_id = f.cliente_id and m.numero = left(btrim(f.numero), 60)
                       and m.ref_externa is distinct from f.ref_externa)
  on conflict (ref_externa) where ref_externa is not null do update
     set cliente_id = excluded.cliente_id, numero = excluded.numero, fecha_emision = excluded.fecha_emision,
         fecha_vencimiento = excluded.fecha_vencimiento, fecha_cobro = excluded.fecha_cobro, importe = excluded.importe,
         no_cuenta = excluded.no_cuenta
   where (facturas_cliente.cliente_id, facturas_cliente.numero, facturas_cliente.fecha_emision, facturas_cliente.fecha_vencimiento,
          facturas_cliente.fecha_cobro, facturas_cliente.importe, facturas_cliente.no_cuenta)
         is distinct from (excluded.cliente_id, excluded.numero, excluded.fecha_emision, excluded.fecha_vencimiento,
          excluded.fecha_cobro, excluded.importe, excluded.no_cuenta);
  get diagnostics v_n = row_count;
  perform set_config('dynamo.sin_revisar_pagos', 'off', true);
  -- Y ahora sí, la regla, con todas las facturas puestas (solo si está encendida).
  if coalesce((parametro('pago_tarde_activo') #>> '{}')::boolean, false) then
    for v_c in select distinct cliente_id from facturas_cliente where origen = 'holded' loop
      perform credito_revisar_pagos(v_c);
    end loop;
  end if;
  return v_n;
end $$;
comment on function public.facturas_cliente_desde_copia() is '[Precio y pago] Pasa a facturas_cliente (las que mira la regla de pagos tardíos) las facturas de la copia de la facturación casadas con un cliente: emisión, vencimiento, día del cobro e importe. Quita las que se anularon o dejaron de casar; lo apuntado a mano con el mismo número pasa a ser de la copia. Una pagada sin día de cobro no cuenta hasta que se sepa. Después, si la regla está encendida, revisa a esos clientes. Devuelve cuántas añade o cambia. Quién: servidor. Argumentos: sin argumentos.';
revoke all on function public.facturas_cliente_desde_copia() from public, anon, authenticated;
grant execute on function public.facturas_cliente_desde_copia() to service_role;

-- El disparador de facturas_cliente no revisa mientras se pasan las de la copia.
create or replace function public.fn_facturas_cliente_revisar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('dynamo.sin_revisar_pagos', true), 'off') = 'on' then return null; end if;
  perform credito_revisar_pagos(coalesce(new.cliente_id, old.cliente_id));
  return null;
end $$;
revoke all on function public.fn_facturas_cliente_revisar() from public, anon, authenticated;
comment on function public.fn_facturas_cliente_revisar() is '[Gestión interna] Disparador de facturas_cliente: al apuntar, cambiar o borrar una factura, revisa los pagos de ese cliente (credito_revisar_pagos). No lo hace mientras se pasan en bloque las facturas de la copia (las revisa esa función al terminar). Quién: nadie la llama desde fuera. Argumentos: ninguno.';

comment on table public.facturas_cliente is '[Precio y pago] Facturas emitidas a cada cliente, con su fecha de cobro: sirven para detectar a quien paga tarde y bloquearle el crédito (credito_revisar_pagos). Llegan solas de la copia de la facturación (facturas_cliente_desde_copia); el Admin Master puede apuntar alguna a mano.';
