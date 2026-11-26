-- PENALIZACIÓN A 0 €: TAMPOCO VA A LA FACTURACIÓN (usuario, 2026-11-26).
-- «La penalización a 0 € en la facturación no sale: si es 0 €, no se genera penalización.»
-- Da la vuelta a lo del 20-nov (línea a 0 € en los dos pedidos). Ahora cada lado va solo con
-- su importe:
--   · El pedido de VENTA lleva la penalización solo si se cobra al cliente (importe > 0).
--   · El pedido de COMPRA la lleva solo si se paga al transportista (importe > 0).
--   · El porte del envío sigue igual en los dos (a 0 € lo marca el control como problema).
-- Al pasarlo a la facturación se cuentan las líneas de CADA pedido por separado, y el control
-- de facturación compara cada pedido con sus propias líneas.

-- ---- 1. Las líneas: el lado a 0 € de una penalización no tiene línea (precio vacío) ---------
create or replace view public.v_lineas_pedido with (security_invoker = true) as
 select e.id as envio_id,
    1 as orden,
    'porte'::tipo_concepto as concepto,
    'Porte ' || e.referencia_gx || ' · ' || coalesce(e.poblacion_origen, '?') || ' (' || coalesce(e.codigo_postal_origen, '') || ') → '
      || coalesce(e.poblacion_destino, '?') || ' (' || coalesce(e.codigo_postal_destino, '') || ')'
      || coalesce(' · ' || fecha_ddmmyyyy(coalesce(e.fecha_carga_real, e.fecha_carga_desde)), '')
      || coalesce(' · ' || e.matricula_camion, '') as descripcion,
    coalesce(e.importe_cliente, 0)::numeric(12,2) as precio_venta,
    coalesce(e.importe_transportista, 0)::numeric(12,2) as precio_compra
   from envios e
  where e.operador_id is null and e.estado <> all (array['borrador'::estado_envio, 'cancelado'::estado_envio])
    and e.transportista_id is not null
union all
 select p.envio_id,
    2 as orden,
    case t.clave when 'paralizacion' then 'paralizacion'::tipo_concepto else 'penalizacion'::tipo_concepto end as concepto,
    t.nombre || ' ' || p.codigo || coalesce(' · ' || p.descripcion, '') as descripcion,
    nullif(coalesce(p.importe_cliente, 0), 0)::numeric(12,2) as precio_venta,
    nullif(coalesce(p.importe_transportista, 0), 0)::numeric(12,2) as precio_compra
   from penalizaciones p
     join tipos_penalizacion t on t.id = p.tipo_id
  where p.estado = 'confirmada'::estado_penalizacion
    and (coalesce(p.importe_cliente, 0) > 0 or coalesce(p.importe_transportista, 0) > 0);
comment on view public.v_lineas_pedido is '[Facturación] Líneas de los pedidos de la facturación, una por concepto: el porte de cada envío de Dynamo con transportista (no borrador ni cancelado), que va a los dos pedidos, y cada penalización o paralización confirmada, que va al pedido de venta solo si se cobra al cliente (precio_venta) y al de compra solo si se paga al transportista (precio_compra). Precio vacío = esa línea no va a ese pedido. Los dos pedidos llevan el mismo número (la referencia GX).';

-- ---- 2. Los ficheros: cada pedido, solo con sus líneas -----------------------------------
do $$ declare v text; k text; cola text; begin
  foreach k in array array['venta', 'compra'] loop
    v := btrim(pg_get_viewdef(('public.v_holded_pedido_' || k)::regclass, true));
    v := regexp_replace(v, ';\s*$', '');
    if position('l.precio_' || k || ' IS NOT NULL' in v) = 0 then
      -- Tras el último JOIN no puede haber ya un WHERE (si lo hay, la vista cambió: revisar a mano).
      cola := substring(v from '(?s).*JOIN(.*)$');
      if cola is null or cola ~* '\mWHERE\M' then raise exception 'v_holded_pedido_%: no sé dónde poner el filtro de precio', k; end if;
      execute 'create or replace view public.v_holded_pedido_' || k || ' with (security_invoker = true) as ' || v
        || E'\n  WHERE l.precio_' || k || ' IS NOT NULL';
    end if;
  end loop;
end $$;

-- ---- 3. Lo pasado a la facturación: las líneas de cada pedido por separado ----------------
-- Lo ya pasado, con la cuenta nueva (solo cambia donde había una penalización a 0 € en ese lado).
update envios e set holded_venta_lineas = (select count(l.precio_venta) from v_lineas_pedido l where l.envio_id = e.id)
 where e.holded_venta_lineas is not null;
update envios e set holded_compra_lineas = (select count(l.precio_compra) from v_lineas_pedido l where l.envio_id = e.id)
 where e.holded_compra_lineas is not null;
comment on column envios.holded_venta_lineas is 'formato: número entero | rango: >= 0 | lista: no aplica | automático | Cuántas líneas (porte, penalizaciones cobradas al cliente) tenía el pedido de venta cuando se pasó a la facturación. Lo pone marcar_exportados(''venta''); si luego entra otra línea, el control de facturación avisa. Vacío = no pasado.';
comment on column envios.holded_compra_lineas is 'formato: número entero | rango: >= 0 | lista: no aplica | automático | Cuántas líneas (porte, penalizaciones pagadas al transportista) tenía el pedido de compra cuando se pasó a la facturación. Lo pone marcar_exportados(''compra''); si luego entra otra línea, el control de facturación avisa. Vacío = no pasado.';

do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.marcar_exportados(text, text[], boolean)'::regprocedure);
  n := replace(d, 'holded_venta_lineas = case when p_fichero <> ''venta'' then e.holded_venta_lineas when not p_valor then null else x.n end',
                  'holded_venta_lineas = case when p_fichero <> ''venta'' then e.holded_venta_lineas when not p_valor then null else x.n_venta end');
  n := replace(n, 'holded_compra_lineas = case when p_fichero <> ''compra'' then e.holded_compra_lineas when not p_valor then null else x.n end',
                  'holded_compra_lineas = case when p_fichero <> ''compra'' then e.holded_compra_lineas when not p_valor then null else x.n_compra end');
  n := replace(n, 'count(l.envio_id)::int as n', 'count(l.precio_venta)::int as n_venta, count(l.precio_compra)::int as n_compra');
  if n = d or position('x.n end' in n) > 0 or position('n_compra' in n) = 0 then raise exception 'marcar_exportados: no encuentro la cuenta de líneas'; end if;
  execute n;

  -- El control: cada pedido con sus propias líneas.
  d := pg_get_functiondef('public.control_facturacion(integer)'::regprocedure);
  n := replace(d, 'cross join lateral (select count(*)::int as n, coalesce(sum(x.precio_venta), 0) as venta',
                  'cross join lateral (select count(*)::int as n, count(x.precio_venta)::int as n_venta, count(x.precio_compra)::int as n_compra, coalesce(sum(x.precio_venta), 0) as venta');
  n := replace(n, 'l.n, l.venta, l.compra', 'l.n, l.n_venta, l.n_compra, l.venta, l.compra');
  n := replace(n, 'b.holded_venta_lineas is not null and b.holded_venta_lineas <> b.n
                       then format(''el pedido de venta tenía %s línea%s y ahora %s'', b.holded_venta_lineas, case when b.holded_venta_lineas = 1 then '''' else ''s'' end, b.n)',
                  'b.holded_venta_lineas is not null and b.holded_venta_lineas <> b.n_venta
                       then format(''el pedido de venta tenía %s línea%s y ahora %s'', b.holded_venta_lineas, case when b.holded_venta_lineas = 1 then '''' else ''s'' end, b.n_venta)');
  n := replace(n, 'b.holded_compra_lineas is not null and b.holded_compra_lineas <> b.n
                       then format(''el pedido de compra tenía %s línea%s y ahora %s'', b.holded_compra_lineas, case when b.holded_compra_lineas = 1 then '''' else ''s'' end, b.n)',
                  'b.holded_compra_lineas is not null and b.holded_compra_lineas <> b.n_compra
                       then format(''el pedido de compra tenía %s línea%s y ahora %s'', b.holded_compra_lineas, case when b.holded_compra_lineas = 1 then '''' else ''s'' end, b.n_compra)');
  n := replace(n, 'or (b.holded_venta_lineas is not null and b.holded_venta_lineas <> b.n)', 'or (b.holded_venta_lineas is not null and b.holded_venta_lineas <> b.n_venta)');
  n := replace(n, 'or (b.holded_compra_lineas is not null and b.holded_compra_lineas <> b.n)', 'or (b.holded_compra_lineas is not null and b.holded_compra_lineas <> b.n_compra)');
  -- Falta un pedido: solo si ese pedido tiene alguna línea.
  n := replace(n, 'from base b where b.holded_pedido_compra is not null and b.holded_pedido_venta is null and b.n > 0',
                  'from base b where b.holded_pedido_compra is not null and b.holded_pedido_venta is null and b.n_venta > 0');
  n := replace(n, 'from base b where b.holded_pedido_venta is not null and b.holded_pedido_compra is null and b.transportista_id is not null and b.n > 0',
                  'from base b where b.holded_pedido_venta is not null and b.holded_pedido_compra is null and b.transportista_id is not null and b.n_compra > 0');
  n := replace(n, 'from base b where b.estado in (''entregado'', ''cancelado'') and b.n > 0 and b.holded_pedido_venta is null',
                  'from base b where b.estado in (''entregado'', ''cancelado'') and b.n_venta > 0 and b.holded_pedido_venta is null');
  n := replace(n, 'from base b where b.estado in (''entregado'', ''cancelado'') and b.n > 0 and b.transportista_id is not null and b.holded_pedido_compra is null',
                  'from base b where b.estado in (''entregado'', ''cancelado'') and b.n_compra > 0 and b.transportista_id is not null and b.holded_pedido_compra is null');
  -- La penalización sin confirmar: ya no se confirma «a 0 €».
  n := replace(n, '(confírmala, aunque sea a 0 €, o anúlala)', '(confírmala o anúlala)');
  if position('b.n >' in n) > 0 or position('<> b.n)' in n) > 0 or position('<> b.n
' in n) > 0 or position('n_compra' in n) = 0 or position('aunque sea a 0' in n) > 0 then
    raise exception 'control_facturacion: queda alguna comparación con el total de líneas de los dos pedidos';
  end if;
  execute n;
end $$;
comment on function public.control_facturacion(integer) is '[Facturación] Control de pedidos: envíos de Dynamo a los que les falta el pedido de venta o el de compra, o una línea (entregado o cancelado con penalización sin pasar a la facturación pasados los días de Parámetros, uno de los dos pedidos pasado y el otro no, entregado sin transportista o con el porte a 0 €, penalización sin confirmar), o que cambiaron después de pasarlos (otro importe u otra línea). Cada pedido se compara con SUS líneas: una penalización solo va al pedido del lado que tiene importe. No mira facturas ni cobros ni el margen. Una fila por envío y problema, con gravedad y total_tipo (cuántos hay de ese problema). Quién: Dynamo (admin o empleado). Argumentos: p_limite: filas máximas por tipo de problema (300 por defecto).';

comment on column penalizaciones.importe_cliente is 'formato: número decimal (2 decimales) | rango: 0 o más | lista: no aplica | opcional | Lo que se cobra al cliente, en euros SIN IVA. 0 (vacío se guarda como 0) = no se le cobra: no la ve y no va a su pedido de venta. Con los dos importes a 0 la penalización no existe. Ej. OK: 150.00 · Ej. mal: -20';
comment on column penalizaciones.importe_transportista is 'formato: número decimal (2 decimales) | rango: 0 o más | lista: no aplica | opcional | Lo que se paga al transportista, en euros SIN IVA. 0 (vacío se guarda como 0) = no se le paga: no la ve y no va a su pedido de compra. El cliente nunca lo ve. Ej. OK: 120.00 · Ej. mal: -5';
