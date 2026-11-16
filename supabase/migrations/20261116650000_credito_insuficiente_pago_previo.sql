-- =====================================================================================
-- SIN CRÉDITO SUFICIENTE, ESE ENVÍO SE PAGA POR ADELANTADO (usuario, 2026-11-16)
-- =====================================================================================
-- «¿Limita cuando se queda sin crédito? Si quedan 200 € y pide un camión de 400 €, debe
-- pasar a pendiente de pago ese envío.»
--
-- HASTA AHORA el pago por adelantado solo se pedía a quien NO tenía crédito (sin
-- clasificar o con 0 €) y en los primeros envíos. Con crédito concedido, pasarse del
-- límite no frenaba nada: solo salía el email de «límite alcanzado».
--
-- AHORA, al confirmar un envío, se mira si CABE en el crédito que le queda al cliente:
--     lo ya usado + este envío (con IVA) <= su línea de crédito
-- Si no cabe, ESE envío nace «pendiente de pago» (motivo «Crédito insuficiente»), como
-- cualquier otro pago por adelantado: no se oferta ni se asigna hasta que pague o Dynamo
-- lo pase sin pago previo. Los que sí caben siguen yendo a crédito.
--
--   · «Lo usado» es el mismo cálculo de la pantalla CESCE - Riesgos y de los emails de
--     crédito: los envíos de los últimos días (parámetro riesgo_dias_asumido, 60) que no se
--     pagaron por adelantado, con IVA. NO son las facturas reales pendientes: un cliente
--     que paga puntual pero carga mucho puede topar con el límite. Por eso se puede apagar
--     (parámetro credito_limite_exige_pago) y Dynamo puede pasar cualquier envío «sin pago
--     previo» desde su ficha.
--   · La línea que manda es la de siempre: el crédito manual de Dynamo si tiene importe;
--     si no, el de CESCE (clientes.riesgo_efectivo_euros).
--   · También al MODIFICAR: si un envío iba a crédito y con el precio nuevo ya no cabe,
--     pasa a pendiente de pago y Dynamo recibe el aviso.
--   · El cliente no ve importes de crédito en ningún sitio: el motivo no lleva cifras.

insert into parametros (clave, valor, descripcion) values
  ('credito_limite_exige_pago', 'true',
   'Crédito: true = si un envío no cabe en el crédito que le queda al cliente (lo usado + ese envío, con IVA, supera su línea), ese envío se paga por adelantado. false = con crédito concedido nunca se pide pago por adelantado por pasarse del límite.')
on conflict (clave) do nothing;

-- ¿Cabe este envío en el crédito que le queda al cliente? Lo usado se cuenta SIN este envío.
create or replace function credito_alcanza(p_cliente uuid, p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
           when coalesce(c.riesgo_efectivo_euros, 0) <= 0 then false
           when e.importe_cliente is null then true
           else coalesce(u.total, 0) + round(e.importe_cliente * (1 + coalesce(e.iva_pct, c.iva_pct, 21) / 100), 2) <= c.riesgo_efectivo_euros
         end
    from clientes c
    left join envios e on e.id = p_envio
    left join lateral (
      select sum(round(coalesce(x.importe_cliente, 0) * (1 + coalesce(c.iva_pct, 21) / 100), 2)) as total
        from envios x
       where x.cliente_id = c.id and x.id is distinct from p_envio and not coalesce(x.es_manual, false)
         and x.estado not in ('borrador', 'cancelado')
         and x.estado_pago_previo in ('no_requerido', 'exento')
         and coalesce(x.fecha_carga_real, x.fecha_carga_desde, x.creado_en::date)
             >= (now() at time zone 'Europe/Madrid')::date - parametro_num('riesgo_dias_asumido', 60)::int
    ) u on true
   where c.id = p_cliente
$$;
revoke execute on function credito_alcanza(uuid, uuid) from public, anon, authenticated;
comment on function public.credito_alcanza(uuid, uuid) is '[Precio y pago] ¿Cabe un envío en el crédito que le queda al cliente? Lo ya usado (envíos de los últimos días sin pago por adelantado, con IVA, sin contar este) más este envío con IVA no supera su línea de crédito. Sin crédito concedido, no cabe. Quién: solo uso interno. Argumentos: p_cliente: clientes.id · p_envio: envios.id.';

-- El motivo de pago por adelantado por falta de crédito (o nada si cabe o está apagado).
create or replace function pago_previo_motivo_credito(p_cliente uuid, p_envio uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when coalesce((parametro('pago_previo_activo') #>> '{}')::boolean, false)
                   and coalesce((parametro('credito_limite_exige_pago') #>> '{}')::boolean, true)
                   and exists (select 1 from clientes c where c.id = p_cliente and coalesce(c.riesgo_efectivo_euros, 0) > 0)
                   and not coalesce(credito_alcanza(p_cliente, p_envio), true)
              then 'Crédito insuficiente: el envío supera el crédito disponible' end
$$;
revoke execute on function pago_previo_motivo_credito(uuid, uuid) from public, anon, authenticated;
comment on function public.pago_previo_motivo_credito(uuid, uuid) is '[Precio y pago] Si un envío de un cliente con crédito no cabe en lo que le queda, devuelve el motivo «Crédito insuficiente…» (sin importes) para pedirle el pago por adelantado; si cabe, o si está apagado (parámetros pago_previo_activo y credito_limite_exige_pago), nada. Quién: solo uso interno. Argumentos: p_cliente: clientes.id · p_envio: envios.id.';

-- Al confirmar: después de «sin crédito» y de «primeros envíos», se mira si cabe.
do $$ declare v text; n text; aguja text := E'  end if;\n  return null;\nend $function$'; begin
  v := pg_get_functiondef('public.pago_previo_motivo(uuid, uuid)'::regprocedure);
  if (length(v) - length(replace(v, aguja, ''))) / length(aguja) <> 1 then
    raise exception 'pago_previo_motivo: no encuentro (una sola vez) el final para añadir la comprobación del crédito';
  end if;
  n := replace(v, aguja, E'  end if;\n  -- Con crédito, pero este envío no cabe en lo que le queda (usuario, 2026-11-16).\n  return pago_previo_motivo_credito(p_cliente, p_envio);\nend $function$');
  execute n;
end $$;
comment on function public.pago_previo_motivo(uuid, uuid) is '[Precio y pago] Por qué un envío se paga por adelantado, o nada si va a crédito: cliente sin crédito (sin clasificar o con 0 €), uno de sus primeros envíos, o crédito insuficiente (este envío no cabe en lo que le queda). Apagable con el parámetro pago_previo_activo. Quién: solo uso interno (el disparador del pago previo). Argumentos: p_cliente: clientes.id · p_envio: envios.id.';

-- Al modificar: un envío que iba a crédito y con el precio nuevo ya no cabe, pasa a pendiente de pago.
do $$ declare v text; n text; aguja text := E'  perform set_config(''dynamo.modifica_cliente'', ''off'', true);\n'; begin
  v := pg_get_functiondef('public.modificar_envio_cliente(uuid, jsonb, jsonb)'::regprocedure);
  if (length(v) - length(replace(v, aguja, ''))) / length(aguja) <> 1 then
    raise exception 'modificar_envio_cliente: no encuentro dónde añadir la comprobación del crédito';
  end if;
  n := replace(v, aguja,
    E'  -- IBA A CRÉDITO y el precio sube: ¿sigue cabiendo en el crédito que le queda?\n'
    || E'  if e.estado_pago_previo = ''no_requerido'' and v_importe > coalesce(e.importe_cliente, 0)\n'
    || E'     and pago_previo_motivo_credito(e.cliente_id, p_envio) is not null then\n'
    || E'    update envios set estado_pago_previo = ''pendiente'', pago_motivo = pago_previo_motivo_credito(e.cliente_id, p_envio) where id = p_envio;\n'
    || E'    perform crear_aviso(''dynamo'', null, null, ''envio_a_pago_previo'', ''urgente'', ''Envío a pago por adelantado · #'' || coalesce(e.referencia_gx, ''''),\n'
    || E'      ''El cliente ha modificado su envío y, con el precio nuevo, ya no cabe en su crédito: pasa a pendiente de pago y no sigue hasta que pague (o lo pases tú sin pago previo).'',\n'
    || E'      ''/panel/envios?ver='' || p_envio, p_envio);\n'
    || E'  end if;\n'
    || aguja);
  execute n;
end $$;
