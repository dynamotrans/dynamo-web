-- DE QUÉ PEDIDO DE VENTA SALE CADA FACTURA (usuario, 2026-11-26: «ni puede faltar ni puede
-- duplicar»).
-- El crédito usado suma lo que el cliente debe (facturas), sus envíos sin facturar y sus pedidos
-- de venta sin facturar de fuera de la plataforma. Para que un mismo viaje no salga dos veces no
-- basta con fiarse del ESTADO del pedido en la facturación (si un pedido ya facturado siguiera
-- como «pendiente», contaría como pedido y como factura), ni de que la factura lleve escrito el
-- GX (si no lo lleva, el envío de la plataforma contaría como «sin facturar» y como factura).
-- La ficha de cada factura dice de qué pedido de venta salió. Se guarda ese enlace:
--   · un pedido de venta que YA TIENE FACTURA no se suma nunca, diga lo que diga su estado;
--   · el GX que lleva ese pedido (los que salen de la plataforma llevan su GX como número) se
--     apunta en la factura: así el envío de la plataforma queda como facturado aunque la factura
--     no lleve el GX escrito.
-- SOLO LECTURA de la facturación: aquí solo se escribe en NUESTRAS tablas.

alter table public.facturas_emitidas
  add column if not exists pedido_origen text check (pedido_origen is null or length(pedido_origen) between 1 and 60),
  add column if not exists pedido_gx text[];
create index if not exists facturas_emitidas_pedido_origen_idx on public.facturas_emitidas (pedido_origen) where pedido_origen is not null;
comment on column public.facturas_emitidas.pedido_origen is 'formato: texto | → pedidos_venta_pendientes.ref_externa (sin obligar) | rango: 1 a 60 | lista: no aplica | automático | Identificador, en el programa de facturación, del pedido de venta del que salió esta factura (lo dice su ficha). Vacío si aún no se ha leído la ficha o si la factura no salió de un pedido. Un pedido que ya tiene factura no cuenta como «sin facturar».';
comment on column public.facturas_emitidas.pedido_gx is 'formato: lista de textos | → envios.referencia_gx (sin obligar) | rango: cada uno GX y de 4 a 12 cifras | lista: no aplica | automático | Referencias de envío (GX…) que lleva el pedido de venta del que salió la factura (en su número, concepto o líneas). Vacío (sin valor) = ese pedido aún no se ha leído; lista vacía = leído y no lleva ninguna. También se añaden a envios_gx.';
comment on column public.facturas_emitidas.envios_gx is 'formato: lista de textos | → envios.referencia_gx (sin obligar) | rango: cada uno GX y de 4 a 12 cifras | lista: no aplica | automático | Referencias de envío (GX…) que aparecen en el concepto o en las líneas de la factura, más las del pedido de venta del que salió (pedido_gx). Sirven para saber qué envíos están ya facturados. Vacía si no lleva ninguna. Ej. OK: {GX100888878}';

-- facturas_guardar: se parte de la función tal como está y se le añaden los dos datos. Una
-- lectura de la LISTA (sin ficha) no trae el pedido: no borra el que ya se sabía.
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.facturas_guardar(jsonb)'::regprocedure);
  n := replace(d, 'ficha_en, concepto, envios_gx)', 'ficha_en, concepto, envios_gx, pedido_origen, pedido_gx)');
  if n = d then raise exception 'facturas_guardar: no encuentro la lista de columnas'; end if; d := n;
  n := replace(d,
    E'         coalesce((select array_agg(distinct upper(g)) from unnest(f.envios_gx) g where upper(g) ~ ''^GX[0-9]{4,12}$''), ''{}'')\n',
    E'         coalesce((select array_agg(distinct upper(g)) from unnest(coalesce(f.envios_gx, ''{}'') || case when f.tipo = ''abono'' then ''{}'' else coalesce(f.pedido_gx, ''{}'') end) g where upper(g) ~ ''^GX[0-9]{4,12}$''), ''{}''),\n'
    || E'         case when f.tipo = ''abono'' then null else nullif(left(lower(btrim(f.pedido_origen)), 60), '''') end,\n'
    || E'         case when f.pedido_gx is null or f.tipo = ''abono'' then null\n'
    || E'              else coalesce((select array_agg(distinct upper(g)) from unnest(f.pedido_gx) g where upper(g) ~ ''^GX[0-9]{4,12}$''), ''{}'') end\n');
  if n = d then raise exception 'facturas_guardar: no encuentro el final de los datos'; end if; d := n;
  n := replace(d, 'ficha boolean, concepto text, envios_gx text[])', 'ficha boolean, concepto text, envios_gx text[], pedido_origen text, pedido_gx text[])');
  if n = d then raise exception 'facturas_guardar: no encuentro la forma de las filas'; end if; d := n;
  n := replace(d,
    'envios_gx = case when cardinality(excluded.envios_gx) > 0 or excluded.concepto is not null then excluded.envios_gx else facturas_emitidas.envios_gx end;',
    'pedido_origen = coalesce(excluded.pedido_origen, facturas_emitidas.pedido_origen),' || E'\n'
    || '    pedido_gx = coalesce(excluded.pedido_gx, facturas_emitidas.pedido_gx),' || E'\n'
    || '    envios_gx = (select coalesce(array_agg(distinct g), ''{}'') from unnest(' || E'\n'
    || '        (case when cardinality(excluded.envios_gx) > 0 or excluded.concepto is not null then excluded.envios_gx else facturas_emitidas.envios_gx end)' || E'\n'
    || '        || coalesce(excluded.pedido_gx, facturas_emitidas.pedido_gx, ''{}'')) g);');
  if n = d then raise exception 'facturas_guardar: no encuentro el final de la actualización'; end if;
  execute n;
end $$;
comment on function public.facturas_guardar(jsonb) is '[Precio y pago] Añade o actualiza en la copia las facturas emitidas y los abonos que el servidor acaba de leer de la facturación, casando cada uno con su cliente por el CIF de su contacto. Los importes de un abono se guardan en negativo. Nunca borra. Apunta cuándo cambia el estado de cada uno. Devuelve cuántos ha tocado. Quién: servidor. Argumentos: p_facturas: lista de documentos (id, numero, contacto_id, contacto_nombre, emision, vence, base, iva, retencion, total, pendiente, estado, pagada_el, cuenta, tipo: factura o abono, rectifica: la factura que corrige un abono, ficha: sí si sale de la ficha completa del documento, concepto: su concepto, envios_gx: referencias de envío que lleva, pedido_origen: el pedido de venta del que salió, pedido_gx: referencias de envío de ese pedido; sin valor si no se ha leído).';

-- El crédito usado: un pedido de venta que ya tiene factura en la copia no se suma.
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.credito_usado_de(uuid[], uuid[])'::regprocedure);
  n := replace(d, 'and not exists (select 1 from envios e where e.referencia_gx = any(q.envios_gx))',
    'and not exists (select 1 from envios e where e.referencia_gx = any(q.envios_gx))' || E'\n'
    || '       and not exists (select 1 from facturas_emitidas f where f.pedido_origen = lower(q.ref_externa) and f.tipo = ''factura'' and f.estado <> ''anulada'')');
  if n = d then raise exception 'credito_usado_de: no encuentro dónde descartar los pedidos ya facturados'; end if;
  execute n;
end $$;
comment on function public.credito_usado_de(uuid[], uuid[]) is '[Precio y pago] EL cálculo del crédito usado de cada cliente, del que tiran todas las reglas y pantallas. Con la deuda real: lo que debe (facturas pendientes de cobro menos abonos sin compensar, nunca menos de 0; no cuenta la factura de envíos pagados por adelantado) más sus envíos a crédito aún sin facturar (sin factura en la copia que lleve su referencia GX, en ella o en el pedido del que salió; la marca manual de facturado no cuenta), con IVA, más sus pedidos de venta sin facturar que están solo en la facturación (no se suman los que ya tienen factura en la copia, ni los que llevan el GX de un envío de la plataforma o de una factura: cada viaje cuenta una vez). Sin ella (apagada o copia de facturas sin cargar): sus envíos a crédito de los últimos días. Devuelve deuda, sin facturar, su base sin IVA, cuántos envíos son, el total usado, el último día de carga, los días que se miran, y el importe y el número de esos pedidos. Quién: solo otras funciones y el servidor. Argumentos: p_clientes: lista de clientes.id (vacío = todos) · p_sin: envíos.id que no se cuentan.';

-- El resumen: la comprobación a la vista. «pedidos_facturados» = pedidos que la facturación da
-- por pendientes y que ya tienen factura (no se suman); «facturas_por_enlazar» = facturas
-- recientes de las que aún no se ha leído de qué pedido salieron.
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.deuda_estado()'::regprocedure);
  n := replace(d, $a$'pedidos', (select count(*) from pedidos_venta_pendientes),$a$,
    $a$'pedidos', (select count(*) from pedidos_venta_pendientes),
    'pedidos_facturados', (select count(*) from pedidos_venta_pendientes q where exists (select 1 from facturas_emitidas f where f.pedido_origen = lower(q.ref_externa) and f.tipo = 'factura' and f.estado <> 'anulada')),
    'facturas_enlazadas', (select count(*) from facturas_emitidas f where f.pedido_origen is not null),
    'facturas_por_enlazar', (select count(*) from facturas_emitidas f where f.tipo = 'factura' and f.estado <> 'anulada' and f.fecha_emision >= (now() at time zone 'Europe/Madrid')::date - 120
                                and (f.ficha_en is null or (f.pedido_origen is not null and f.pedido_gx is null))),$a$);
  if n = d then raise exception 'deuda_estado: no encuentro dónde añadir el enlace de facturas y pedidos'; end if;
  execute n;
end $$;
comment on function public.deuda_estado() is '[Precio y pago] Resumen de la copia de facturas emitidas: cuándo se leyó por última vez, si falló, si ya terminó la primera carga, cuántos documentos guarda, desde qué fecha están todos y cuántos hay anteriores a ella (los que debían algo), cuántas facturas tienen deuda, total pendiente (ya restados los abonos sin devolver ni compensar) y vencido, cuántos abonos están pendientes y por cuánto, cuánto corresponde a contactos que no son clientes de la plataforma, si el crédito se calcula con la deuda real, y la foto de pedidos de venta sin facturar (cuándo se leyó, cuántos son, cuánto suman, cuántos son también un envío de la plataforma, cuántos tienen ya factura y por eso no se suman, y cuántas facturas se han enlazado con su pedido o están por enlazar). Quién: equipo de Dynamo o servidor. Argumentos: sin argumentos.';
