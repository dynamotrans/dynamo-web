-- ENVÍO FACTURADO = SU PEDIDO DE VENTA ESTÁ FACTURADO (usuario, 2026-11-26).
-- «Las facturas no llevan GX porque igual incluyen 7 envíos, 1 o 3… y la API no trae los pedidos
-- de que está compuesta esa factura.» Cierto: la factura solo dice UNO de los pedidos de los que
-- sale. Así que saber si un envío de la plataforma está ya facturado no puede salir de la
-- factura: sale de SU PEDIDO DE VENTA, que lleva su GX y cuyo estado dice si está facturado.
--   · Se guarda la lista de los pedidos de venta YA FACTURADOS de los últimos meses que llevan
--     algún GX (solo el GX y la fecha; se sustituye entera en cada lectura completa).
--   · Un envío a crédito cuyo GX está en esa lista YA NO cuenta como «sin facturar»: lo que se
--     debe de él está en las facturas pendientes (o ya está cobrado). Ni falta ni se duplica.
-- SOLO LECTURA de la facturación: aquí solo se escribe en NUESTRAS tablas.

create table if not exists public.pedidos_venta_facturados (
  ref_externa text primary key check (length(ref_externa) between 1 and 60),
  fecha       date not null,
  envios_gx   text[] not null check (cardinality(envios_gx) > 0),
  leido_en    timestamptz not null default now()
);
create index if not exists pedidos_venta_facturados_gx_idx on public.pedidos_venta_facturados using gin (envios_gx);
comment on table public.pedidos_venta_facturados is '[Precio y pago] Lista de los pedidos de venta YA FACTURADOS en el programa de facturación durante los últimos meses que llevan alguna referencia de envío (GX). Se sustituye entera en cada lectura completa. Sirve para saber que un envío de la plataforma ya está facturado (y no contarlo además como «sin facturar») aunque su factura agrupe varios envíos y no lleve el GX. Lo escribe el servidor; solo lo ve el equipo de Dynamo.';
comment on column public.pedidos_venta_facturados.ref_externa is 'formato: texto | rango: 1 a 60 | lista: no aplica | automático | Identificador del pedido en el programa de facturación.';
comment on column public.pedidos_venta_facturados.fecha is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | automático | Día del pedido.';
comment on column public.pedidos_venta_facturados.envios_gx is 'formato: lista de textos | → envios.referencia_gx (sin obligar) | rango: al menos una; cada una GX y de 4 a 12 cifras | lista: no aplica | automático | Referencias de envío (GX…) que lleva el pedido en su número, su concepto o sus líneas. El envío con esa referencia se da por facturado.';
comment on column public.pedidos_venta_facturados.leido_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se leyó de la facturación.';
alter table public.pedidos_venta_facturados enable row level security;
drop policy if exists pedidos_venta_facturados_sel on public.pedidos_venta_facturados;
create policy pedidos_venta_facturados_sel on public.pedidos_venta_facturados for select using ((select ve_todo()));
revoke all on public.pedidos_venta_facturados from anon, authenticated;
grant select on public.pedidos_venta_facturados to authenticated;
drop trigger if exists tg_mantenimiento on public.pedidos_venta_facturados;
create trigger tg_mantenimiento before insert or update or delete on public.pedidos_venta_facturados
  for each row execute function fn_bloqueo_mantenimiento();

alter table public.facturas_copia_estado add column if not exists pedidos_facturados_en timestamptz;
comment on column public.facturas_copia_estado.pedidos_facturados_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Última vez que se leyó entera de la facturación la lista de pedidos de venta ya facturados. Vacío = nunca.';

create or replace function public.pedidos_venta_facturados_guardar(p_pedidos jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not es_servidor() then raise exception 'Solo el servidor guarda los pedidos de venta facturados.' using errcode = '42501'; end if;
  if p_pedidos is null or jsonb_typeof(p_pedidos) <> 'array' then raise exception 'Los pedidos no tienen la forma esperada.'; end if;
  if jsonb_array_length(p_pedidos) > 20000 then raise exception 'Demasiados pedidos de una vez.'; end if;
  delete from pedidos_venta_facturados where true;
  insert into pedidos_venta_facturados (ref_externa, fecha, envios_gx)
  select distinct on (f.id) f.id, f.fecha, g.gx
    from jsonb_to_recordset(p_pedidos) as f(id text, fecha date, envios_gx text[])
   cross join lateral (select array_agg(distinct upper(x)) as gx from unnest(f.envios_gx) x where upper(x) ~ '^GX[0-9]{4,12}$') g
   where f.id is not null and length(f.id) between 1 and 60 and f.fecha is not null and g.gx is not null
   order by f.id;
  get diagnostics v_n = row_count;
  update facturas_copia_estado set pedidos_facturados_en = now() where id;
  return v_n;
end $$;
comment on function public.pedidos_venta_facturados_guardar(jsonb) is '[Precio y pago] Sustituye la lista de pedidos de venta ya facturados (los que llevan alguna referencia GX) por la que el servidor acaba de leer ENTERA de la facturación. Devuelve cuántos guarda. Quién: servidor. Argumentos: p_pedidos: lista de pedidos (id, fecha, envios_gx: referencias de envío que lleva; los que no llevan ninguna no se guardan).';
revoke all on function public.pedidos_venta_facturados_guardar(jsonb) from public, anon, authenticated;
grant execute on function public.pedidos_venta_facturados_guardar(jsonb) to service_role;

-- El crédito usado: un envío cuyo pedido de venta ya está facturado no cuenta como «sin facturar».
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.credito_usado_de(uuid[], uuid[])'::regprocedure);
  n := replace(d, 'or not exists (select 1 from facturas_emitidas f', 'or (not exists (select 1 from facturas_emitidas f');
  if n = d then raise exception 'credito_usado_de: no encuentro la comprobación de envío facturado'; end if; d := n;
  n := replace(d, 'and f.envios_gx @> array[e.referencia_gx]))',
    'and f.envios_gx @> array[e.referencia_gx])' || E'\n'
    || '                and not exists (select 1 from pedidos_venta_facturados v where v.envios_gx @> array[e.referencia_gx])))');
  if n = d then raise exception 'credito_usado_de: no encuentro el final de la comprobación de envío facturado'; end if;
  execute n;
end $$;
comment on function public.credito_usado_de(uuid[], uuid[]) is '[Precio y pago] EL cálculo del crédito usado de cada cliente, del que tiran todas las reglas y pantallas. Con la deuda real: lo que debe (facturas pendientes de cobro menos abonos sin compensar, nunca menos de 0; no cuenta la factura de envíos pagados por adelantado) más sus envíos a crédito aún sin facturar, con IVA (un envío está facturado si su pedido de venta sale ya facturado en la facturación, o si una factura de la copia lleva su referencia GX, en ella o en el pedido del que salió; la marca manual de facturado no cuenta), más sus pedidos de venta sin facturar que están solo en la facturación (no se suman los que ya tienen factura en la copia, ni los que llevan el GX de un envío de la plataforma o de una factura: cada viaje cuenta una vez). Sin ella (apagada o copia de facturas sin cargar): sus envíos a crédito de los últimos días. Devuelve deuda, sin facturar, su base sin IVA, cuántos envíos son, el total usado, el último día de carga, los días que se miran, y el importe y el número de esos pedidos. Quién: solo otras funciones y el servidor. Argumentos: p_clientes: lista de clientes.id (vacío = todos) · p_sin: envíos.id que no se cuentan.';

-- El resumen: cuántos envíos de la plataforma se dan por facturados por su pedido.
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.deuda_estado()'::regprocedure);
  n := replace(d, $a$'facturas_enlazadas',$a$,
    $a$'pedidos_facturados_en', e.pedidos_facturados_en,
    'pedidos_facturados_gx', (select count(*) from pedidos_venta_facturados),
    'envios_facturados', (select count(*) from envios x where x.estado not in ('borrador', 'cancelado')
                             and exists (select 1 from pedidos_venta_facturados v where v.envios_gx @> array[x.referencia_gx])),
    'facturas_enlazadas',$a$);
  if n = d then raise exception 'deuda_estado: no encuentro dónde añadir los pedidos facturados'; end if;
  execute n;
end $$;
comment on function public.deuda_estado() is '[Precio y pago] Resumen de la copia de facturas emitidas: cuándo se leyó por última vez, si falló, si ya terminó la primera carga, cuántos documentos guarda, desde qué fecha están todos y cuántos hay anteriores a ella (los que debían algo), cuántas facturas tienen deuda, total pendiente (ya restados los abonos sin devolver ni compensar) y vencido, cuántos abonos están pendientes y por cuánto, cuánto corresponde a contactos que no son clientes de la plataforma, si el crédito se calcula con la deuda real, y la foto de pedidos de venta sin facturar (cuándo se leyó, cuántos son, cuánto suman, cuántos son también un envío de la plataforma, cuántos tienen ya factura y por eso no se suman, cuántas facturas se han enlazado con su pedido o están por enlazar) y la lista de pedidos ya facturados (cuándo se leyó, cuántos llevan GX y cuántos envíos de la plataforma se dan por facturados gracias a ella). Quién: equipo de Dynamo o servidor. Argumentos: sin argumentos.';
