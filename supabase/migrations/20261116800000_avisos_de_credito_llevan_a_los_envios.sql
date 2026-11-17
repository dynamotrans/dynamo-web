-- =====================================================================================
-- LOS AVISOS DE CRÉDITO LLEVAN A LOS ENVÍOS, NO A LA FICHA DEL CLIENTE (usuario, 2026-11-17)
-- =====================================================================================
-- «Al pulsar "2 envíos pasan a pendiente de pago" me lleva a una pantalla que no tiene
-- nada que ver» — abría la ficha de edición del cliente. El aviso habla de ENVÍOS, así que
-- lleva a ellos:
--   · un solo envío  → su ficha;
--   · varios, a pendiente de pago → la pestaña «Pendientes de pago» de Envíos;
--   · varios, a crédito → la pestaña «Programados» de Envíos.

do $$ declare v text; n text; begin
  -- Al bajar el crédito: pasan a pendiente de pago.
  v := pg_get_functiondef('public.credito_retirar_sin_hueco(uuid)'::regprocedure);
  n := replace(v, $a$'/panel/clientes?ver=' || p_cliente, null);$a$,
    $b$coalesce(case when n = 1 then '/panel/envios?ver=' || (select e.id::text from envios e where e.cliente_id = p_cliente and '#' || e.referencia_gx = v_refs limit 1) end, '/panel/envios?f=sin-pagar'), null);$b$);
  if n = v then raise exception 'credito_retirar_sin_hueco: no encuentro el enlace del aviso'; end if;
  execute n;
  -- Al volver a caber: pasan a crédito (Programados).
  v := pg_get_functiondef('public.credito_liberar_pendientes(uuid)'::regprocedure);
  n := replace(v, $a$'/panel/clientes?ver=' || p_cliente, null);$a$,
    $b$coalesce(case when n = 1 then '/panel/envios?ver=' || (select e.id::text from envios e where e.cliente_id = p_cliente and '#' || e.referencia_gx = v_refs limit 1) end, '/panel/envios?f=programada'), null);$b$);
  if n = v then raise exception 'credito_liberar_pendientes: no encuentro el enlace del aviso'; end if;
  execute n;
end $$;

-- Los avisos que ya están en la campana: que tampoco abran la ficha del cliente.
update avisos set enlace = '/panel/envios?f=sin-pagar'
 where tipo = 'credito_retira_envios' and enlace like '/panel/clientes?ver=%';
update avisos set enlace = '/panel/envios?f=programada'
 where tipo = 'credito_libera_pagos' and enlace like '/panel/clientes?ver=%';
