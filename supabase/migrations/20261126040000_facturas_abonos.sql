-- ABONOS (FACTURAS RECTIFICATIVAS) EN LA COPIA DE FACTURAS EMITIDAS (usuario, 2026-11-26: «ok»).
-- Hasta ahora la copia solo traía las facturas. Un abono es un documento aparte en la
-- facturación (misma forma que una factura), y sin él las cuentas no cuadran: si a un cliente
-- se le factura 1.000 € y se le abona 200 €, debe 800 €, no 1.000 €.
--   · Entran en la MISMA tabla, con `tipo` = abono y los importes EN NEGATIVO.
--   · Un abono con algo pendiente (aún sin devolver ni compensar) RESTA de lo que debe el cliente.
--   · `rectifica`: la factura que corrige, cuando la facturación lo dice.
--   · En la lista salen con su etiqueta «Abono»; hay un filtro «Abonos». Nunca están «vencidos».
-- SOLO LECTURA de la facturación: aquí solo se escribe en NUESTRAS tablas.

-- ---- 1. Las columnas nuevas -------------------------------------------------------------
alter table public.facturas_emitidas
  add column if not exists tipo text not null default 'factura' check (tipo in ('factura', 'abono')),
  add column if not exists rectifica text check (rectifica is null or length(rectifica) between 1 and 60),
  add column if not exists ficha_en timestamptz;
comment on column public.facturas_emitidas.tipo is 'formato: texto | rango: no aplica | lista: factura · abono | automático | Qué documento es: una factura o un abono (factura rectificativa). Los abonos llevan sus importes en negativo.';
comment on column public.facturas_emitidas.rectifica is 'formato: texto | → facturas_emitidas.ref_externa (sin obligar: la factura puede no estar en la copia) | rango: 1 a 60 | lista: no aplica | automático | Solo en los abonos: identificador, en la facturación, de la factura que corrige. Vacío si la facturación no lo dice o aún no se ha leído su ficha.';
comment on column public.facturas_emitidas.ficha_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Última vez que se leyó de la facturación la FICHA completa de este documento (no la lista): la ficha trae sus cobros y, en un abono, la factura que corrige. Sirve para no pedir la misma ficha una y otra vez. Vacío si nunca se ha leído.';
comment on column public.facturas_emitidas.base is 'formato: número con 2 decimales, euros SIN IVA | rango: no aplica | lista: no aplica | automático | Base imponible. En negativo en los abonos.';
comment on column public.facturas_emitidas.iva is 'formato: número con 2 decimales, euros | rango: no aplica | lista: no aplica | automático | Importe del IVA. En negativo en los abonos.';
comment on column public.facturas_emitidas.total is 'formato: número con 2 decimales, euros CON IVA | rango: no aplica | lista: no aplica | automático | Importe total del documento. En negativo en los abonos.';
comment on column public.facturas_emitidas.pendiente is 'formato: número con 2 decimales, euros CON IVA | rango: no aplica | lista: no aplica | automático | Lo que falta por cobrar (el total menos lo ya cobrado), tal como lo dice la facturación. ES LO QUE MANDA PARA LA DEUDA (usuario, 2026-11-25: «importes, más que estado»): una factura debe lo que diga este importe, la llame como la llame el estado. En los abonos, en negativo: lo que falta por devolver o compensar, que RESTA de la deuda del cliente. 0 si está anulada.';
comment on column public.facturas_emitidas.estado is 'formato: texto | rango: no aplica | lista: pendiente · parcial · pagada · anulada · otro | automático | Estado del cobro según la facturación: sin cobrar nada, cobrada en parte, cobrada entera, anulada o borrada, u otro. En un abono: sin devolver, devuelto en parte o devuelto/compensado del todo. Sirve para pintar la lista; la deuda se calcula con el importe pendiente, no con esto. «Vencida» no se guarda: es la que tiene algo pendiente con el vencimiento pasado.';
comment on table public.facturas_emitidas is '[Precio y pago] COPIA de las facturas emitidas por Dynamo y de sus abonos (facturas rectificativas, en negativo), leída del programa de facturación y mantenida al día sola (las pendientes cada pocos minutos, los últimos meses cada noche). De ella salen la lista de facturas de Dynamo y de cada cliente, lo que debe cada cliente y los días que tarda en pagar. Nunca se borra: se va acumulando. Lo escribe el servidor; el equipo de Dynamo la ve entera y cada cliente, las suyas, por la función facturas_lista.';

-- Lo que tiene saldo (a favor o en contra) de cada cliente: para sumar su deuda.
drop index if exists public.facturas_emitidas_por_cobrar_idx;
create index if not exists facturas_emitidas_saldo_idx on public.facturas_emitidas (cliente_id) where pendiente <> 0;

alter table public.facturas_copia_estado add column if not exists abonos_en timestamptz;
comment on column public.facturas_copia_estado.abonos_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Última vez que se leyeron de la facturación los abonos pendientes y los recientes (se hace una vez por hora, no en cada pasada: hay pocos).';

-- DESDE QUÉ DÍA ESTÁ COMPLETA LA COPIA (usuario, 2026-11-26: «¿desde dic 2021 solo hay 632
-- facturas? no me cuadra»). La pantalla decía «desde» la fecha de la factura más antigua, y esa
-- era una de 2021 que sigue en la copia solo porque aún debe algo. Se guarda el día desde el
-- que se trajeron TODAS (la primera carga, o un «Repasar desde una fecha» más antiguo).
alter table public.facturas_copia_estado add column if not exists copia_desde date;
comment on column public.facturas_copia_estado.copia_desde is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | automático | Día desde el que la copia tiene TODAS las facturas emitidas (el comienzo de la primera carga, 12 meses atrás, o el de un «Repasar desde una fecha» más antiguo). Las anteriores a ese día están solo si debían algo. Vacío hasta que termina la primera carga.';
update public.facturas_copia_estado
   set copia_desde = ((carga_completa_en at time zone 'Europe/Madrid')::date - interval '12 months')::date
 where carga_completa_en is not null and copia_desde is null;

-- ---- 2. Guardar lo leído: ahora también abonos ---------------------------------------------
-- p_facturas: cada fila puede traer `tipo` (factura | abono; sin él, factura), `rectifica` y
-- `ficha` (sí = esta fila sale de la ficha completa del documento: se apunta cuándo).
-- Los importes de un abono se guardan SIEMPRE en negativo, vengan como vengan.
create or replace function public.facturas_guardar(p_facturas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not es_servidor() then raise exception 'Solo el servidor guarda la copia de facturas.' using errcode = '42501'; end if;
  if p_facturas is null or jsonb_typeof(p_facturas) <> 'array' then raise exception 'Las facturas no tienen la forma esperada.'; end if;
  if jsonb_array_length(p_facturas) > 5000 then raise exception 'Demasiadas facturas de una vez.'; end if;
  insert into facturas_emitidas (ref_externa, cliente_id, contacto_id, contacto_nombre, cif, numero, fecha_emision, fecha_vencimiento,
                                 base, iva, retencion, total, pendiente, estado, pagada_el, cuenta, tipo, rectifica, ficha_en)
  select distinct on (f.id) f.id, c.id, lower(f.contacto_id), left(f.contacto_nombre, 200), left(hc.cif, 40), left(f.numero, 60), f.emision, f.vence,
         -- En un abono, cada importe en negativo (−|importe|); en una factura, tal cual viene.
         case when f.tipo = 'abono' then -abs(round(coalesce(f.base, 0), 2)) else round(coalesce(f.base, 0), 2) end,
         case when f.tipo = 'abono' then -abs(round(coalesce(f.iva, 0), 2)) else round(coalesce(f.iva, 0), 2) end,
         case when f.tipo = 'abono' then round(abs(coalesce(f.retencion, 0)), 2) else greatest(round(coalesce(f.retencion, 0), 2), 0) end,
         case when f.tipo = 'abono' then -abs(round(coalesce(f.total, 0), 2)) else round(coalesce(f.total, 0), 2) end,
         case when f.estado = 'anulada' then 0
              when f.tipo = 'abono' then -abs(round(coalesce(f.pendiente, 0), 2)) else round(coalesce(f.pendiente, 0), 2) end,
         case when f.estado in ('pendiente', 'parcial', 'pagada', 'anulada') then f.estado else 'otro' end,
         case when f.estado = 'pagada' then f.pagada_el end, left(f.cuenta, 200),
         case when f.tipo = 'abono' then 'abono' else 'factura' end,
         case when f.tipo = 'abono' and length(f.rectifica) between 1 and 60 then lower(f.rectifica) end,
         case when f.ficha then now() end
    from jsonb_to_recordset(p_facturas) as f(id text, numero text, contacto_id text, contacto_nombre text, emision date, vence date,
                                             base numeric, iva numeric, retencion numeric, total numeric, pendiente numeric,
                                             estado text, pagada_el date, cuenta text, tipo text, rectifica text, ficha boolean)
    left join holded_contactos hc on hc.contacto_id = lower(f.contacto_id)
    left join clientes c on nullif(cif_base(hc.cif), '') is not null and cif_base(c.cif) = cif_base(hc.cif)
   where f.id is not null and length(f.id) between 1 and 60 and f.emision is not null
   order by f.id, c.creado_en
  on conflict (ref_externa) do update set
    contacto_id = coalesce(excluded.contacto_id, facturas_emitidas.contacto_id), contacto_nombre = coalesce(excluded.contacto_nombre, facturas_emitidas.contacto_nombre),
    cif = coalesce(excluded.cif, facturas_emitidas.cif),
    cliente_id = case when excluded.cif is not null then excluded.cliente_id else facturas_emitidas.cliente_id end,
    numero = coalesce(excluded.numero, facturas_emitidas.numero), fecha_emision = excluded.fecha_emision, fecha_vencimiento = excluded.fecha_vencimiento,
    base = excluded.base, iva = excluded.iva, retencion = excluded.retencion, total = excluded.total, pendiente = excluded.pendiente,
    estado_desde = case when facturas_emitidas.estado is distinct from excluded.estado then now() else facturas_emitidas.estado_desde end,
    pagada_el = case when excluded.estado = 'pagada' then coalesce(excluded.pagada_el, facturas_emitidas.pagada_el) end,
    estado = excluded.estado, cuenta = coalesce(excluded.cuenta, facturas_emitidas.cuenta), leido_en = now(),
    tipo = excluded.tipo, rectifica = coalesce(excluded.rectifica, facturas_emitidas.rectifica),
    ficha_en = coalesce(excluded.ficha_en, facturas_emitidas.ficha_en);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
comment on function public.facturas_guardar(jsonb) is '[Precio y pago] Añade o actualiza en la copia las facturas emitidas y los abonos que el servidor acaba de leer de la facturación, casando cada uno con su cliente por el CIF de su contacto. Los importes de un abono se guardan en negativo. Nunca borra. Apunta cuándo cambia el estado de cada uno. Devuelve cuántos ha tocado. Quién: servidor. Argumentos: p_facturas: lista de documentos (id, numero, contacto_id, contacto_nombre, emision, vence, base, iva, retencion, total, pendiente, estado, pagada_el, cuenta, tipo: factura o abono, rectifica: la factura que corrige un abono, ficha: sí si sale de la ficha completa del documento).';
revoke all on function public.facturas_guardar(jsonb) from public, anon, authenticated;
grant execute on function public.facturas_guardar(jsonb) to service_role;

-- ---- 3. La lista: etiqueta de abono, la factura que corrige y filtro «Abonos» --------------
-- Se parte de la función tal como está (ya lleva el filtro de 60 días y el nombre de la
-- cuenta) y se le cambian cuatro trozos. Si alguno no está donde se espera, se para.
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.facturas_lista(text, text, date, date, integer, integer, uuid)'::regprocedure);
  n := replace(d, $a$not in ('todas', 'por_cobrar', 'vencida', 'vencida_60', 'pagada', 'anulada')$a$, $a$not in ('todas', 'por_cobrar', 'vencida', 'vencida_60', 'pagada', 'anulada', 'abono')$a$);
  if n = d then raise exception 'facturas_lista: no encuentro la lista de filtros'; end if; d := n;
  -- Un abono con saldo (en negativo) también está «pendiente»: resta de lo que queda por cobrar.
  n := replace(d, $a$when f.pendiente > 0 then 'pendiente'$a$, $a$when f.pendiente <> 0 then 'pendiente'$a$);
  if n = d then raise exception 'facturas_lista: no encuentro el estado pendiente'; end if; d := n;
  n := replace(d, $a$when 'anulada' then b.est = 'anulada'$a$, $a$when 'anulada' then b.est = 'anulada'
             when 'abono' then b.tipo = 'abono'$a$);
  if n = d then raise exception 'facturas_lista: no encuentro el filtro de anuladas'; end if; d := n;
  n := replace(d, $a$'parcial', x.pendiente > 0 and x.pendiente < x.total, $a$,
    $a$'parcial', x.pendiente <> 0 and abs(x.pendiente) < abs(x.total), 'tipo', x.tipo,
            'rectifica', (select r.numero from facturas_emitidas r where r.ref_externa = x.rectifica and (v_cli is null or r.cliente_id = v_cli)), $a$);
  if n = d then raise exception 'facturas_lista: no encuentro la marca de cobro parcial'; end if;
  execute n;
end $$;
comment on function public.facturas_lista(text, text, date, date, integer, integer, uuid) is '[Precio y pago] Una página de facturas emitidas y abonos de la copia, con su estado de cobro (pendiente, vencida, pagada, anulada), si es factura o abono y, en los abonos, el número de la factura que corrigen; más el total de documentos y las sumas (base, importe, por cobrar y vencido) de lo filtrado, donde los abonos restan. Dynamo las ve todas (o las de un cliente) con empresa, CIF y cuenta contable (número y nombre); el cliente, solo las suyas, sin las anuladas. Quién: equipo de Dynamo o cliente. Argumentos: p_q: texto a buscar (nº, empresa, CIF, importe) · p_estado: todas, por_cobrar, vencida (vencimiento pasado), vencida_60 (algo pendiente y más de 60 días desde la emisión), pagada, anulada o abono (solo los abonos) · p_desde, p_hasta: fechas de factura · p_pagina: página (desde 1) · p_por: filas por página (1 a 100) · p_cliente: clientes.id para ver solo uno (solo Dynamo).';

-- Para abrir el PDF: además del número, qué documento es (el abono se pide en otra dirección).
create or replace function public.factura_para_abrir(p_ref text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('numero', coalesce(nullif(f.numero, ''), f.tipo), 'tipo', f.tipo)
    from facturas_emitidas f
   where f.ref_externa = p_ref
     and (ve_todo() or (f.estado <> 'anulada' and f.cliente_id is not null and f.cliente_id = cliente_del_usuario()))
$$;
comment on function public.factura_para_abrir(text) is '[Precio y pago] Dice si quien pregunta puede abrir una factura o un abono de la copia y qué es: el equipo de Dynamo, cualquiera; el cliente, solo los suyos y no anulados. Devuelve su número y su tipo (factura o abono), o nada si no puede. Quién: equipo de Dynamo o cliente. Argumentos: p_ref: identificador del documento en la facturación.';
revoke all on function public.factura_para_abrir(text) from public, anon;
grant execute on function public.factura_para_abrir(text) to authenticated, service_role;

-- ---- 4. Lo que debe cada cliente: los abonos pendientes restan -----------------------------
-- Deuda = suma de importes pendientes de sus facturas MENOS sus abonos aún sin devolver ni
-- compensar. Si el saldo sale a favor del cliente (o a cero), no debe nada y no aparece.
-- Lo vencido no puede ser más que lo que debe en total.
create or replace function public.deuda_clientes(p_clientes uuid[])
returns table (cliente_id uuid, pendiente numeric, vencido numeric, facturas integer, vence_primera date)
language plpgsql stable security definer set search_path = public as $$
declare hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  if not (es_equipo_dynamo() or es_servidor()) then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  return query
    select f.cliente_id, sum(f.pendiente),
           least(coalesce(sum(f.pendiente) filter (where f.pendiente > 0 and f.fecha_vencimiento < hoy), 0), sum(f.pendiente)),
           (count(*) filter (where f.pendiente > 0))::int, min(f.fecha_vencimiento) filter (where f.pendiente > 0)
      from facturas_emitidas f
     where f.cliente_id = any(coalesce(p_clientes, '{}')) and f.estado <> 'anulada' and f.pendiente <> 0
     group by f.cliente_id
    having sum(f.pendiente) > 0;
end $$;
comment on function public.deuda_clientes(uuid[]) is '[Precio y pago] Lo que debe cada cliente según la copia de facturas emitidas: total pendiente de cobro (sus facturas menos sus abonos aún sin devolver ni compensar), cuánto de eso está vencido, cuántas facturas y el vencimiento más antiguo. Solo salen los clientes que deben algo. Quién: equipo de Dynamo o servidor. Argumentos: p_clientes: lista de clientes.id.';

create or replace function public.deuda_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare hoy date := (now() at time zone 'Europe/Madrid')::date; e facturas_copia_estado; r jsonb;
begin
  if not (es_equipo_dynamo() or es_servidor()) then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  select * into e from facturas_copia_estado where id;
  select jsonb_build_object(
      'pendiente', coalesce(sum(pendiente), 0),
      'vencido', coalesce(sum(pendiente) filter (where pendiente > 0 and fecha_vencimiento < hoy), 0),
      'pendiente_clientes', coalesce(sum(pendiente) filter (where cliente_id is not null), 0),
      'pendiente_otros', coalesce(sum(pendiente) filter (where cliente_id is null), 0),
      'facturas_otros', count(*) filter (where cliente_id is null and pendiente > 0),
      'facturas', count(*) filter (where pendiente > 0),
      'abonos', count(*) filter (where pendiente < 0),
      'abonos_importe', coalesce(-sum(pendiente) filter (where pendiente < 0), 0),
      'sin_cliente', count(*) filter (where pendiente > 0 and cliente_id is null and nullif(cif_base(cif), '') is not null),
      'sin_cif', count(*) filter (where pendiente > 0 and nullif(cif_base(cif), '') is null))
    into r from facturas_emitidas where estado <> 'anulada' and pendiente <> 0;
  return r || jsonb_build_object('ultima_en', e.ultima_en, 'ultima_ok_en', e.ultima_ok_en, 'error', e.error,
    'carga_completa_en', e.carga_completa_en, 'cargando', e.carga_completa_en is null and e.barrido_tipo is not null,
    'repaso_en', e.repaso_en, 'en_copia', (select count(*) from facturas_emitidas),
    'desde', coalesce(e.copia_desde, (select min(fecha_emision) from facturas_emitidas)),
    'anteriores', case when e.copia_desde is null then 0 else (select count(*) from facturas_emitidas where fecha_emision < e.copia_desde) end);
end $$;
comment on function public.deuda_estado() is '[Precio y pago] Resumen de la copia de facturas emitidas: cuándo se leyó por última vez, si falló, si ya terminó la primera carga, cuántos documentos guarda, desde qué fecha están todos y cuántos hay anteriores a ella (los que debían algo), cuántas facturas tienen deuda, total pendiente (ya restados los abonos sin devolver ni compensar) y vencido, cuántos abonos están pendientes y por cuánto, y cuánto corresponde a contactos que no son clientes de la plataforma. Quién: equipo de Dynamo o servidor. Argumentos: sin argumentos.';
