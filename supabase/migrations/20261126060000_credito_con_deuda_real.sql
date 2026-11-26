-- EL CRÉDITO USADO, CON LA DEUDA REAL (usuario, 2026-11-25 y 2026-11-26).
-- «El crédito sería el importe pendiente de pago de lo ya facturado + envíos no facturados
-- pendientes de pago.» El 2026-11-26 comprobó contra su facturación que la copia de facturas
-- cuadra al céntimo, que era la condición para dar este paso.
--
-- HASTA AHORA «lo usado» de un cliente era una estimación: sus envíos a crédito de los últimos
-- 60 días, con IVA (parámetro riesgo_dias_asumido), hubiera pagado o no. Un cliente que paga
-- puntual y carga mucho topaba con su límite; uno que debe facturas de hace 4 meses, no.
--
-- AHORA:   usado = lo que DEBE de verdad (suma de importes pendientes de sus facturas, menos
--                  sus abonos sin compensar; nunca menos de 0)
--                + sus envíos a crédito que aún NO están facturados (con IVA).
--   · «Facturado» es un envío cuya referencia (GX…) aparece en el concepto o en las líneas de
--     una factura de la copia. La marca «facturado» de Exportaciones NO cuenta (usuario,
--     2026-11-26: «pueden marcarse en la plataforma que están subidos a la facturación pero
--     allí estén como pedidos de venta sin facturar aún… ¡ojo!»): solo vale la factura.
--   · Cada viaje cuenta UNA vez: como envío de la plataforma mientras no tiene factura, y como
--     factura cuando la tiene. El cruce es la referencia GX.
--   · Lo pagado por adelantado no gasta crédito (usuario, 2026-11-26): ni el envío, ni su
--     factura mientras en la facturación siga «pendiente» porque aún no se le ha apuntado el
--     cobro (el dinero ya entró por la plataforma).
--   · Por si una factura no lleva el GX: un envío deja de contar como «sin facturar» pasados
--     unos días desde su carga (parámetro credito_dias_sin_facturar, 60), para no contarlo dos
--     veces para siempre (en la deuda y como sin facturar).
--   · Se calcula en UN solo sitio (credito_usado_de) y lo usan todas las reglas y pantallas:
--     si cabe un envío, el aviso previo, la retirada de crédito, CESCE - Riesgos, la lista de
--     clientes, la ventana del cliente y los emails de crédito.
--   · Se puede apagar (parámetro credito_deuda_real): vuelve la estimación de antes. Y mientras
--     la copia de facturas no haya terminado su primera carga, también vale la de antes.
-- El cliente sigue sin ver importes de crédito en ningún sitio.

insert into parametros (clave, valor, descripcion) values
  ('credito_deuda_real', 'true',
   'Crédito: true = lo usado de cada cliente es lo que debe de verdad (facturas pendientes de cobro, menos abonos) más sus envíos a crédito aún sin facturar. false = la estimación de antes: sus envíos a crédito de los últimos días (parámetro riesgo_dias_asumido), haya pagado o no.'),
  ('credito_dias_sin_facturar', '60',
   'Crédito: días desde la carga en los que un envío a crédito cuenta como «sin facturar» si la plataforma no ha encontrado su factura. Pasados, se da por facturado (su importe ya estará en lo que debe el cliente). Evita contar dos veces un envío cuya factura no lleva su referencia.')
on conflict (clave) do nothing;

-- ---- 1. Qué envíos lleva cada factura -----------------------------------------------------
alter table public.facturas_emitidas
  add column if not exists concepto text check (concepto is null or length(concepto) <= 600),
  add column if not exists envios_gx text[] not null default '{}';
create index if not exists facturas_emitidas_gx_idx on public.facturas_emitidas using gin (envios_gx);
comment on column public.facturas_emitidas.concepto is 'formato: texto | rango: hasta 600 | lista: no aplica | automático | Concepto de la factura, tal como está en la facturación (recortado). Solo lo ve Dynamo. De él se sacan las referencias de envío.';
comment on column public.facturas_emitidas.envios_gx is 'formato: lista de textos | → envios.referencia_gx (sin obligar) | rango: cada uno GX y de 4 a 12 cifras | lista: no aplica | automático | Referencias de envío (GX…) que aparecen en el concepto o en las líneas de la factura. Sirven para saber qué envíos están ya facturados. Vacía si no lleva ninguna. Ej. OK: {GX100888878}';

-- facturas_guardar: se parte de la función tal como está y se le añaden los dos datos.
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.facturas_guardar(jsonb)'::regprocedure);
  n := replace(d, 'cuenta, tipo, rectifica, ficha_en)', 'cuenta, tipo, rectifica, ficha_en, concepto, envios_gx)');
  if n = d then raise exception 'facturas_guardar: no encuentro la lista de columnas'; end if; d := n;
  n := replace(d, E'         case when f.ficha then now() end\n',
    E'         case when f.ficha then now() end, nullif(left(btrim(f.concepto), 600), ''''),\n'
    || E'         coalesce((select array_agg(distinct upper(g)) from unnest(f.envios_gx) g where upper(g) ~ ''^GX[0-9]{4,12}$''), ''{}'')\n');
  if n = d then raise exception 'facturas_guardar: no encuentro el final de los datos'; end if; d := n;
  n := replace(d, 'tipo text, rectifica text, ficha boolean)', 'tipo text, rectifica text, ficha boolean, concepto text, envios_gx text[])');
  if n = d then raise exception 'facturas_guardar: no encuentro la forma de las filas'; end if; d := n;
  n := replace(d, 'ficha_en = coalesce(excluded.ficha_en, facturas_emitidas.ficha_en);',
    'ficha_en = coalesce(excluded.ficha_en, facturas_emitidas.ficha_en),' || E'\n'
    || '    concepto = coalesce(excluded.concepto, facturas_emitidas.concepto),' || E'\n'
    || '    envios_gx = case when cardinality(excluded.envios_gx) > 0 or excluded.concepto is not null then excluded.envios_gx else facturas_emitidas.envios_gx end;');
  if n = d then raise exception 'facturas_guardar: no encuentro el final de la actualización'; end if;
  execute n;
end $$;
comment on function public.facturas_guardar(jsonb) is '[Precio y pago] Añade o actualiza en la copia las facturas emitidas y los abonos que el servidor acaba de leer de la facturación, casando cada uno con su cliente por el CIF de su contacto. Los importes de un abono se guardan en negativo. Nunca borra. Apunta cuándo cambia el estado de cada uno. Devuelve cuántos ha tocado. Quién: servidor. Argumentos: p_facturas: lista de documentos (id, numero, contacto_id, contacto_nombre, emision, vence, base, iva, retencion, total, pendiente, estado, pagada_el, cuenta, tipo: factura o abono, rectifica: la factura que corrige un abono, ficha: sí si sale de la ficha completa del documento, concepto: su concepto, envios_gx: referencias de envío que lleva).';

-- ---- 2. El cálculo, en un solo sitio --------------------------------------------------------
create or replace function public.credito_con_deuda_real()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((parametro('credito_deuda_real') #>> '{}')::boolean, true)
     and exists (select 1 from facturas_copia_estado where id and carga_completa_en is not null)
$$;
comment on function public.credito_con_deuda_real() is '[Precio y pago] Dice si el crédito usado se calcula con la deuda real (parámetro credito_deuda_real encendido y copia de facturas ya cargada) o con la estimación por días. Quién: cualquiera con sesión o el servidor. Argumentos: sin argumentos.';
revoke all on function public.credito_con_deuda_real() from public, anon;
grant execute on function public.credito_con_deuda_real() to authenticated, service_role;

-- p_clientes: los clientes (vacío = todos). p_sin: envíos que NO se cuentan (el que se está
-- comprobando, o los que se van a recolocar).
create or replace function public.credito_usado_de(p_clientes uuid[], p_sin uuid[] default null)
returns table (cliente_id uuid, deuda numeric, sin_facturar numeric, base numeric, envios integer, usado numeric, ultimo date, dias integer)
language sql stable security definer set search_path = public as $$
  with m as (
    select credito_con_deuda_real() as deuda_real, (now() at time zone 'Europe/Madrid')::date as hoy,
           parametro_num('riesgo_dias_asumido', 60)::int as dias_estimacion,
           greatest(parametro_num('credito_dias_sin_facturar', 60)::int, 1) as dias_sin_facturar),
  cl as (select c.id, coalesce(c.iva_pct, 21) as iva from clientes c where p_clientes is null or c.id = any(p_clientes)),
  -- Lo que debe de verdad: sus facturas menos sus abonos sin compensar; nunca menos de 0.
  -- No cuenta la factura de envíos que se PAGARON POR ADELANTADO en la plataforma: en la
  -- facturación sale «pendiente» hasta que se le apunta el cobro, pero ese dinero ya entró.
  d as (
    select f.cliente_id, greatest(sum(f.pendiente), 0) as deuda
      from facturas_emitidas f, m
     where m.deuda_real and f.cliente_id is not null and (p_clientes is null or f.cliente_id = any(p_clientes))
       and f.estado <> 'anulada' and f.pendiente <> 0
       and not (f.tipo = 'factura' and cardinality(f.envios_gx) > 0
                and exists (select 1 from envios e where e.referencia_gx = any(f.envios_gx) and e.estado_pago_previo = 'pagado')
                and not exists (select 1 from envios e where e.referencia_gx = any(f.envios_gx) and e.estado_pago_previo <> 'pagado'))
     group by f.cliente_id),
  -- Sus envíos a crédito: con la deuda real, solo los que aún no están facturados.
  a as (
    select e.cliente_id, count(*)::int as n, sum(coalesce(e.importe_cliente, 0)) as base,
           sum(round(coalesce(e.importe_cliente, 0) * (1 + cl.iva / 100), 2)) as total,
           max(coalesce(e.fecha_carga_real, e.fecha_carga_desde)) as ultimo
      from envios e join cl on cl.id = e.cliente_id cross join m
     where not coalesce(e.es_manual, false)
       and e.estado not in ('borrador', 'cancelado')
       and e.estado_pago_previo in ('no_requerido', 'exento')          -- lo pagado por adelantado no es crédito usado
       and not coalesce(e.id = any(p_sin), false)
       and coalesce(e.fecha_carga_real, e.fecha_carga_desde, e.creado_en::date)
           >= m.hoy - case when m.deuda_real then m.dias_sin_facturar else m.dias_estimacion end
       and (not m.deuda_real
            or not exists (select 1 from facturas_emitidas f
                            where f.tipo = 'factura' and f.estado <> 'anulada' and f.envios_gx @> array[e.referencia_gx]))
     group by e.cliente_id)
  select cl.id, coalesce(d.deuda, 0), coalesce(a.total, 0), coalesce(a.base, 0), coalesce(a.n, 0),
         coalesce(d.deuda, 0) + coalesce(a.total, 0), a.ultimo,
         case when m.deuda_real then m.dias_sin_facturar else m.dias_estimacion end
    from cl cross join m left join d on d.cliente_id = cl.id left join a on a.cliente_id = cl.id
$$;
comment on function public.credito_usado_de(uuid[], uuid[]) is '[Precio y pago] EL cálculo del crédito usado de cada cliente, del que tiran todas las reglas y pantallas. Con la deuda real: lo que debe (facturas pendientes de cobro menos abonos sin compensar, nunca menos de 0) más sus envíos a crédito aún sin facturar (sin factura en la copia que lleve su referencia GX; la marca manual de facturado no cuenta), con IVA; no cuenta la factura de envíos pagados por adelantado. Sin ella (apagada o copia de facturas sin cargar): sus envíos a crédito de los últimos días. Devuelve deuda, sin facturar, su base sin IVA, cuántos envíos son, el total usado, el último día de carga y los días que se miran. Quién: solo otras funciones y el servidor. Argumentos: p_clientes: lista de clientes.id (vacío = todos) · p_sin: envíos.id que no se cuentan.';
revoke all on function public.credito_usado_de(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.credito_usado_de(uuid[], uuid[]) to service_role;

create or replace function public.credito_usado(p_cliente uuid, p_sin uuid[] default null)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select u.usado from credito_usado_de(array[p_cliente], p_sin) u), 0)
$$;
comment on function public.credito_usado(uuid, uuid[]) is '[Precio y pago] El crédito usado de un cliente (ver credito_usado_de), en euros con IVA. Quién: solo otras funciones y el servidor. Argumentos: p_cliente: clientes.id · p_sin: envíos.id que no se cuentan.';
revoke all on function public.credito_usado(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.credito_usado(uuid, uuid[]) to service_role;

-- ---- 3. Todo lo que contaba «lo usado» por su cuenta, ahora lo pregunta --------------------
create or replace function public.credito_uso_cliente(p_cliente uuid)
returns table (limite numeric, usado numeric, pct numeric)
language sql stable security definer set search_path = public as $$
  select c.riesgo_efectivo_euros, u.usado,
         case when coalesce(c.riesgo_efectivo_euros, 0) > 0 then round(u.usado * 100 / c.riesgo_efectivo_euros, 1) end
    from clientes c cross join lateral (select credito_usado(c.id) as usado) u
   where c.id = p_cliente
$$;

-- ¿Cabe este envío en el crédito que le queda al cliente? Lo usado se cuenta SIN este envío.
create or replace function public.credito_alcanza(p_cliente uuid, p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
           when coalesce(c.riesgo_efectivo_euros, 0) <= 0 then false
           when e.importe_cliente is null then true
           else credito_usado(c.id, array[p_envio]) + round(e.importe_cliente * (1 + coalesce(e.iva_pct, c.iva_pct, 21) / 100), 2) <= c.riesgo_efectivo_euros
         end
    from clientes c
    left join envios e on e.id = p_envio
   where c.id = p_cliente
$$;
comment on function public.credito_alcanza(uuid, uuid) is '[Precio y pago] ¿Cabe un envío en el crédito que le queda al cliente? Lo ya usado (ver credito_usado_de: lo que debe de verdad más sus envíos a crédito sin facturar, sin contar este) más este envío con IVA no supera su línea de crédito. Sin crédito concedido, no cabe. Quién: solo otras funciones. Argumentos: p_cliente: clientes.id · p_envio: envíos.id.';

create or replace function public.consumo_clientes(p_ids uuid[])
returns table (cliente_id uuid, envios integer, consumo numeric, limite numeric, disponible numeric, dias integer)
language sql stable security definer set search_path = public as $$
  select c.id, u.envios, u.usado, c.riesgo_efectivo_euros,
         case when c.riesgo_efectivo_euros is null then null else c.riesgo_efectivo_euros - u.usado end,
         u.dias
    from clientes c join credito_usado_de(p_ids) u on u.cliente_id = c.id
   where c.id = any(p_ids) and ve_todo()
$$;
comment on function public.consumo_clientes(uuid[]) is '[Precio y pago] Consumo de crédito por cliente para la lista de clientes: lo usado (ver credito_usado_de: lo que debe de verdad más sus envíos a crédito sin facturar), cuántos envíos son, su límite y lo que le queda. Quién: equipo de Dynamo. Argumentos: p_ids: lista de clientes.id.';

create or replace function public.riesgos_clientes()
returns table (cliente_id uuid, nombre text, cif text, riesgo_cesce numeric, plazo_cesce integer, riesgo_manual numeric, riesgo_efectivo numeric,
               manda text, envios integer, asumido_base numeric, asumido numeric, disponible numeric, ultimo_envio date)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre_visible, c.cif, c.riesgo_cesce_euros, c.riesgo_cesce_plazo_dias, c.riesgo_manual_euros,
         c.riesgo_efectivo_euros,
         case when c.riesgo_manual_euros is not null then 'manual' when c.riesgo_cesce_euros is not null then 'cesce' else 'ninguno' end,
         coalesce(u.envios, 0), coalesce(u.base, 0), coalesce(u.usado, 0),
         case when c.riesgo_efectivo_euros is null then null else c.riesgo_efectivo_euros - coalesce(u.usado, 0) end,
         u.ultimo
    from clientes c left join credito_usado_de(null) u on u.cliente_id = c.id
   where ve_todo()
$$;
comment on function public.riesgos_clientes() is '[Precio y pago] Todos los clientes con su línea de crédito (CESCE o manual), lo usado (ver credito_usado_de: lo que debe de verdad más sus envíos a crédito sin facturar; «envios» y «asumido_base» son esos envíos y su base sin IVA) y lo disponible. Quién: equipo de Dynamo. Argumentos: sin argumentos.';

-- Las dos funciones largas: se cambia solo el trozo que sumaba los envíos de los últimos días.
do $$ declare d text; i int; j int; ini text; fin text := E'riesgo_dias_asumido'', 60)::int;'; begin
  -- El aviso previo de «este envío irá con pago por adelantado».
  d := pg_get_functiondef('public.pago_previo_previsto(numeric[], uuid)'::regprocedure);
  ini := 'select coalesce(sum(round(coalesce(x.importe_cliente, 0) * (1 + c.iva / 100), 2)), 0) into usado';
  i := position(ini in d);
  if i = 0 then raise exception 'pago_previo_previsto: no encuentro la suma de lo usado'; end if;
  j := position(fin in substr(d, i));
  if j = 0 then raise exception 'pago_previo_previsto: no encuentro el final de la suma'; end if;
  execute left(d, i - 1) || 'usado := credito_usado(v_cliente);' || substr(d, i + j - 1 + length(fin));

  -- Al quitar o reducir el crédito: lo usado que no se puede mover.
  d := pg_get_functiondef('public.credito_retirar_sin_hueco(uuid)'::regprocedure);
  ini := 'select coalesce(sum(round(coalesce(x.importe_cliente, 0) * (1 + coalesce(v_iva, 21) / 100), 2)), 0) into v_fijo';
  i := position(ini in d);
  if i = 0 then raise exception 'credito_retirar_sin_hueco: no encuentro la suma de lo usado'; end if;
  j := position(fin in substr(d, i));
  if j = 0 then raise exception 'credito_retirar_sin_hueco: no encuentro el final de la suma'; end if;
  execute left(d, i - 1) || 'v_fijo := credito_usado(p_cliente, v_ids);' || substr(d, i + j - 1 + length(fin));
end $$;

-- El resumen de la deuda dice además con qué se está calculando el crédito.
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.deuda_estado()'::regprocedure);
  n := replace(d, $a$'desde', coalesce(e.copia_desde,$a$, $a$'credito_real', credito_con_deuda_real(), 'desde', coalesce(e.copia_desde,$a$);
  if n = d then raise exception 'deuda_estado: no encuentro dónde añadir el modo del crédito'; end if;
  execute n;
end $$;
