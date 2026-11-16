-- =====================================================================================
-- EL CRÉDITO Y LOS ENVÍOS, SIEMPRE AL DÍA Y EN LOS DOS SENTIDOS (usuario, 2026-11-16)
-- =====================================================================================
-- «Si tengo 2 cargas programadas con crédito y le quito crédito o se le baja y no entran
-- dentro del disponible, automáticamente pasan a pendiente de pago algunas o todas según
-- quepan. Y viceversa: si están en pendiente de pago y se amplía el crédito —a mano o por
-- vencer plazos que liberan crédito— pasarán a programadas las que quepan. Las que están
-- con transportista asignado no las podemos mover.»
--
-- Hasta ahora solo existía un sentido y un momento: al SUBIR el crédito se liberaban los
-- pendientes que cabían (20261116680000). No se miraba al bajarlo, ni cuando el crédito se
-- liberaba solo con el paso de los días, ni lo que ya estaba pendiente de antes.
--
-- AHORA:
--   1. SUBE el crédito (o se concede)  → los pendientes de pago por falta de crédito que ya
--      caben pasan a crédito. (Como antes.)
--   2. BAJA el crédito (o se quita)    → los envíos programados a crédito SIN transportista
--      se vuelven a repartir, del que carga antes al que carga después: los que caben
--      siguen a crédito; los que ya no caben pasan a «pendiente de pago». Aviso urgente a
--      Dynamo y aviso al cliente en cada envío.
--   3. CADA HORA                        → se repasan los pendientes de pago por falta de
--      crédito de todos los clientes: si ya caben (porque han vencido días y se ha liberado
--      crédito, porque se canceló o se pagó otro envío, o porque venían de antes de estas
--      reglas), pasan a crédito.
--
-- NO SE TOCAN NUNCA: los envíos con transportista asignado o con uno asignándose ahora, los
-- que están en curso o entregados, los de transportista propio, los que Dynamo pasó «sin
-- pago previo» a mano, los que Dynamo pidió cobrar por adelantado a mano y los de «primeros
-- envíos». Un envío que pasa a pendiente de pago sigue las reglas de cualquier pago por
-- adelantado (no se oferta ni se asigna hasta pagar; si no se paga en plazo, se anula).

-- ---- 1. Liberar: también los que no tienen motivo anotado (venían de antes) -------------
-- (copiada de 20261116680000; cambian el filtro —entra el motivo vacío— y el texto del aviso,
-- que ya no da por hecho que el crédito se acaba de ampliar)
create or replace function credito_liberar_pendientes(p_cliente uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; m text; n int := 0; v_refs text := ''; v_cli text;
begin
  for r in select id, referencia_gx, pago_motivo from envios
            where cliente_id = p_cliente and estado = 'programado' and estado_pago_previo = 'pendiente'
              and not coalesce(es_manual, false) and coalesce(pago_a_cuenta, 0) = 0 and stripe_cobro_sin_aplicar is null
              and (pago_motivo is null or pago_motivo like 'Sin crédito%' or pago_motivo like 'Crédito insuficiente%')
            order by fecha_carga_desde nulls last, creado_en
            for update skip locked loop
    -- Como si se confirmara ahora: ¿sigue habiendo motivo para cobrarlo por adelantado?
    m := pago_previo_motivo(p_cliente, r.id);
    if m is null then
      update envios set estado_pago_previo = 'exento', pago_resuelto_por = auth.uid(),
                        pago_exento_motivo = 'Crédito disponible: pasa a crédito solo, al caber en la línea del cliente'
       where id = r.id;
      n := n + 1;
      v_refs := v_refs || case when v_refs = '' then '' else ', ' end || '#' || coalesce(r.referencia_gx, '');
    elsif m is distinct from r.pago_motivo then
      update envios set pago_motivo = m where id = r.id;   -- sigue pendiente, con el motivo de ahora
    end if;
  end loop;
  if n > 0 then
    select nombre_visible into v_cli from clientes where id = p_cliente;
    perform crear_aviso('dynamo', null, null, 'credito_libera_pagos', 'aviso',
      case when n = 1 then '1 envío pasa a crédito · ' else n || ' envíos pasan a crédito · ' end || coalesce(v_cli, 'cliente'),
      coalesce(v_cli, 'Este cliente') || ' vuelve a tener crédito disponible (se le ha concedido o ampliado, o se le ha liberado). '
        || case when n = 1 then 'Su envío ' || v_refs || ', que estaba pendiente de pago, ya cabe en su línea: pasa a crédito y ya se puede ofertar y asignar.'
                else 'Sus envíos ' || left(v_refs, 300) || ', que estaban pendientes de pago, ya caben en su línea: pasan a crédito y ya se pueden ofertar y asignar.' end,
      '/panel/clientes?ver=' || p_cliente, null);
  end if;
  return n;
end $$;
comment on function public.credito_liberar_pendientes(uuid) is '[Precio y pago] Repasa los envíos programados de un cliente que están pendientes de pago por falta de crédito (o sin motivo anotado) y pasa a «sin pago previo» los que ya caben en su línea (del que carga antes al que carga después), avisando a Dynamo en la campana. Se llama sola cuando sube el crédito del cliente y en el repaso de cada hora. No toca los pedidos por Dynamo a mano, los de «primeros envíos», los que tienen un pago a cuenta o un cobro con tarjeta sin aplicar, ni los de transportista propio. Devuelve cuántos ha liberado. Quién: nadie la llama desde fuera. Argumentos: p_cliente: clientes.id.';

-- ---- 2. Retirar: al bajar el crédito, los que ya no caben pasan a pendiente de pago ------
create or replace function credito_retirar_sin_hueco(p_cliente uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; m text; n int := 0; v_refs text := ''; v_cli text; v_lim numeric; v_iva numeric;
        v_ids uuid[]; v_fijo numeric; v_acum numeric := 0; v_movidos boolean := false;
begin
  select riesgo_efectivo_euros, iva_pct, nombre_visible into v_lim, v_iva, v_cli from clientes where id = p_cliente;
  if not found then return 0; end if;
  -- Los que se pueden mover: programados a crédito, sin transportista (ni uno asignándose
  -- ahora), y que no pasó «sin pago previo» Dynamo a mano.
  select array_agg(e.id) into v_ids from envios e
   where e.cliente_id = p_cliente and e.estado = 'programado' and not coalesce(e.es_manual, false)
     and e.transportista_id is null and e.importe_cliente is not null
     and (e.estado_pago_previo = 'no_requerido' or (e.estado_pago_previo = 'exento' and e.pago_exento_motivo like 'Crédito disponible:%'))
     and not coalesce(envio_con_transportista(e.id), true);
  if v_ids is null then return 0; end if;
  -- Lo usado que NO se puede mover (la misma cuenta que credito_alcanza, sin los de arriba).
  select coalesce(sum(round(coalesce(x.importe_cliente, 0) * (1 + coalesce(v_iva, 21) / 100), 2)), 0) into v_fijo
    from envios x
   where x.cliente_id = p_cliente and x.id <> all (v_ids) and not coalesce(x.es_manual, false)
     and x.estado not in ('borrador', 'cancelado') and x.estado_pago_previo in ('no_requerido', 'exento')
     and coalesce(x.fecha_carga_real, x.fecha_carga_desde, x.creado_en::date)
         >= (now() at time zone 'Europe/Madrid')::date - parametro_num('riesgo_dias_asumido', 60)::int;
  -- Se reparten del que carga antes al que carga después: el que cabe se queda a crédito.
  for r in select e.id, e.referencia_gx, round(e.importe_cliente * (1 + coalesce(e.iva_pct, v_iva, 21) / 100), 2) as con_iva
             from envios e where e.id = any (v_ids)
            order by e.fecha_carga_desde nulls last, e.creado_en
            for update skip locked loop
    if coalesce(v_lim, 0) <= 0 then
      m := pago_previo_motivo(p_cliente, r.id);                 -- «Sin crédito…» (o nada, si el pago por adelantado está apagado)
    elsif v_fijo + v_acum + r.con_iva <= v_lim then
      m := null;                                                -- cabe: sigue a crédito
    else
      m := pago_previo_motivo_credito(p_cliente, r.id);         -- «Crédito insuficiente…» (o nada, si está apagado)
    end if;
    if m is null or m like 'Primer%' or m like 'Uno de los%' then
      v_acum := v_acum + r.con_iva;
      continue;
    end if;
    v_movidos := v_movidos or coalesce(envio_asignandose(r.id), false);
    update envios set estado_pago_previo = 'pendiente', pago_motivo = m, pago_exento_motivo = null, pago_resuelto_por = null
     where id = r.id;
    perform crear_aviso('cliente', p_cliente, null, 'pago_requerido', 'aviso', 'Tu envío pasa a pago por adelantado · #' || coalesce(r.referencia_gx, ''),
      'Tu línea de crédito ya no cubre este envío. Para que siga adelante hay que pagarlo por adelantado: tienes la proforma y el pago en su ficha.',
      '/panel/envios?ver=' || r.id, r.id);
    n := n + 1;
    v_refs := v_refs || case when v_refs = '' then '' else ', ' end || '#' || coalesce(r.referencia_gx, '');
  end loop;
  if n > 0 then
    perform crear_aviso('dynamo', null, null, 'credito_retira_envios', 'urgente',
      case when n = 1 then '1 envío pasa a pendiente de pago · ' else n || ' envíos pasan a pendiente de pago · ' end || coalesce(v_cli, 'cliente'),
      'A ' || coalesce(v_cli, 'este cliente') || ' se le ha quitado o reducido el crédito. '
        || case when n = 1 then 'Su envío ' || v_refs || ', que iba a crédito y aún no tenía transportista, ya no cabe en su línea: pasa a pendiente de pago y no sigue hasta que pague (o lo pases tú sin pago previo).'
                else 'Sus envíos ' || left(v_refs, 300) || ', que iban a crédito y aún no tenían transportista, ya no caben en su línea: pasan a pendiente de pago y no siguen hasta que pague (o los pases tú sin pago previo).' end
        || case when v_movidos then ' Alguno ya estaba publicado en la bolsa o con ofertas enviadas: retíralo allí.' else '' end
        || ' Los que ya tienen transportista no se tocan.',
      '/panel/clientes?ver=' || p_cliente, null);
  end if;
  return n;
end $$;
revoke execute on function credito_retirar_sin_hueco(uuid) from public, anon, authenticated;
comment on function public.credito_retirar_sin_hueco(uuid) is '[Precio y pago] Al quitar o reducir el crédito de un cliente: vuelve a repartir sus envíos programados a crédito que aún no tienen transportista (ni uno asignándose), del que carga antes al que carga después; los que caben en la línea nueva siguen a crédito y los que no pasan a «pendiente de pago» (motivo «Sin crédito…» o «Crédito insuficiente…»), con aviso al cliente en cada envío y un aviso urgente a Dynamo. No toca los envíos con transportista, en curso o entregados, los de transportista propio ni los que Dynamo pasó «sin pago previo» a mano. Devuelve cuántos ha pasado a pendiente. Quién: nadie la llama desde fuera. Argumentos: p_cliente: clientes.id.';

-- ---- 3. El disparador del cliente, en los dos sentidos ----------------------------------
create or replace function fn_clientes_credito_libera_pagos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.riesgo_efectivo_euros, 0) > coalesce(old.riesgo_efectivo_euros, 0) then
    perform credito_liberar_pendientes(new.id);
  elsif coalesce(new.riesgo_efectivo_euros, 0) < coalesce(old.riesgo_efectivo_euros, 0) then
    perform credito_retirar_sin_hueco(new.id);
  end if;
  return null;
end $$;
comment on function public.fn_clientes_credito_libera_pagos() is '[Disparadores] Disparador de clientes: cuando cambia el crédito que limita a un cliente (sea de CESCE o el manual de Dynamo). Si sube, libera sus envíos pendientes de pago por falta de crédito que ya caben (credito_liberar_pendientes); si baja o se quita, pasa a pendiente de pago los envíos a crédito sin transportista que ya no caben (credito_retirar_sin_hueco). Quién: se ejecuta sola. Argumentos: sin argumentos.';

-- ---- 4. El repaso de cada hora -----------------------------------------------------------
create or replace function credito_repasar_pendientes()
returns integer language plpgsql security definer set search_path = public as $$
declare c record; n int := 0;
begin
  if not coalesce((parametro('pago_previo_activo') #>> '{}')::boolean, false) then return 0; end if;
  for c in select distinct e.cliente_id from envios e
            where e.estado = 'programado' and e.estado_pago_previo = 'pendiente' and e.cliente_id is not null
              and not coalesce(e.es_manual, false)
              and (e.pago_motivo is null or e.pago_motivo like 'Sin crédito%' or e.pago_motivo like 'Crédito insuficiente%') loop
    n := n + credito_liberar_pendientes(c.cliente_id);
  end loop;
  return n;
end $$;
revoke execute on function credito_repasar_pendientes() from public, anon, authenticated;
comment on function public.credito_repasar_pendientes() is '[Gestión interna] Repaso de cada hora: para cada cliente con envíos pendientes de pago por falta de crédito, mira si ya caben en su línea (porque han vencido días y se ha liberado crédito, porque se canceló o se pagó otro envío, o porque venían de antes) y los pasa a crédito. Devuelve cuántos envíos ha liberado. Quién: la tarea programada. Argumentos: sin argumentos.';

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-credito-repaso', '23 * * * *', 'select public.credito_repasar_pendientes()');
  end if;
end $$;
