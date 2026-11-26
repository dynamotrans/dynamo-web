-- PEDIDOS DE VENTA SIN FACTURAR, DE LA FACTURACIÓN (usuario, 2026-11-26).
-- «Hay que tener en cuenta los pedidos de venta sin facturar, y eso en la plataforma no lo
-- sabemos. Además no puede duplicarse un envío de la plataforma con un pedido de la facturación
-- del mismo viaje, que sumen doble siendo el mismo. Si pudiéramos cruzar con referencias,
-- identificadores únicos o los GX… es lo suyo.»
--
-- El crédito usado ya suma lo que el cliente debe (facturas) y sus envíos de la plataforma sin
-- facturar. Faltaban los viajes que están en la facturación como PEDIDO DE VENTA aún sin
-- facturar y que NO existen en la plataforma (hechos fuera de ella).
--   · Se guarda una FOTO de los pedidos de venta pendientes (se sustituye entera en cada
--     lectura completa; una lectura fallida o a medias no la toca).
--   · CADA VIAJE CUENTA UNA VEZ, y el cruce es el GX:
--       – el pedido lleva el GX de un envío de la plataforma → NO se suma (ya lo cuenta, o no,
--         el propio envío: si va a crédito y no está facturado);
--       – una factura de la copia lleva ese GX → NO se suma (ya está en lo que debe);
--       – el pedido no lleva ningún GX de la plataforma → se suma.
--   · Solo cuentan los pedidos de los últimos días (el mismo parámetro credito_dias_sin_facturar).
--   · Se puede apagar: parámetro credito_cuenta_pedidos.
-- SOLO LECTURA de la facturación: aquí solo se escribe en NUESTRAS tablas.

insert into parametros (clave, valor, descripcion) values
  ('credito_cuenta_pedidos', 'true',
   'Crédito: true = lo usado de cada cliente suma también sus pedidos de venta que están en la facturación sin facturar y que no son un envío de la plataforma (viajes hechos fuera). false = no se suman.')
on conflict (clave) do nothing;

create table if not exists public.pedidos_venta_pendientes (
  ref_externa     text primary key check (length(ref_externa) between 1 and 60),
  cliente_id      uuid references clientes(id) on delete set null,
  contacto_id     text,
  contacto_nombre text check (contacto_nombre is null or length(contacto_nombre) <= 200),
  cif             text check (cif is null or length(cif) <= 40),
  numero          text check (numero is null or length(numero) <= 60),
  fecha           date not null,
  total           numeric(12,2) not null default 0,
  estado          text not null check (estado in ('pendiente', 'parcial')),
  envios_gx       text[] not null default '{}',
  leido_en        timestamptz not null default now()
);
create index if not exists pedidos_venta_pendientes_cliente_idx on public.pedidos_venta_pendientes (cliente_id);
create index if not exists pedidos_venta_pendientes_gx_idx on public.pedidos_venta_pendientes using gin (envios_gx);
comment on table public.pedidos_venta_pendientes is '[Precio y pago] FOTO de los pedidos de venta que están en el programa de facturación sin facturar (o facturados solo en parte). Se sustituye entera en cada lectura completa. Sirve para que el crédito usado de un cliente cuente también los viajes hechos fuera de la plataforma que aún no tienen factura. Lo escribe el servidor; solo lo ve el equipo de Dynamo.';
comment on column public.pedidos_venta_pendientes.ref_externa is 'formato: texto | rango: 1 a 60 | lista: no aplica | automático | Identificador del pedido en el programa de facturación.';
comment on column public.pedidos_venta_pendientes.cliente_id is 'formato: uuid | → clientes.id | rango: no aplica | lista: no aplica | automático | Cliente de la plataforma al que corresponde, casado por CIF. Vacío si ese contacto no es cliente de la plataforma.';
comment on column public.pedidos_venta_pendientes.contacto_id is 'formato: texto | rango: no aplica | lista: no aplica | automático | Identificador del contacto en el programa de facturación.';
comment on column public.pedidos_venta_pendientes.contacto_nombre is 'formato: texto | rango: hasta 200 | lista: no aplica | automático | Nombre de la empresa según el pedido.';
comment on column public.pedidos_venta_pendientes.cif is 'formato: texto | rango: hasta 40 | lista: no aplica | automático | CIF del contacto (de holded_contactos). Vacío hasta que se consulta.';
comment on column public.pedidos_venta_pendientes.numero is 'formato: texto | rango: hasta 60 | lista: no aplica | automático | Número del pedido en la facturación.';
comment on column public.pedidos_venta_pendientes.fecha is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | automático | Día del pedido.';
comment on column public.pedidos_venta_pendientes.total is 'formato: número con 2 decimales, euros CON IVA | rango: no aplica | lista: no aplica | automático | Importe total del pedido.';
comment on column public.pedidos_venta_pendientes.estado is 'formato: texto | rango: no aplica | lista: pendiente · parcial | automático | Estado del pedido según la facturación: sin facturar, o facturado solo en parte.';
comment on column public.pedidos_venta_pendientes.envios_gx is 'formato: lista de textos | → envios.referencia_gx (sin obligar) | rango: cada uno GX y de 4 a 12 cifras | lista: no aplica | automático | Referencias de envío (GX…) que aparecen en el número, el concepto o las líneas del pedido. Con ellas se evita contar dos veces un viaje que también está en la plataforma.';
comment on column public.pedidos_venta_pendientes.leido_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se leyó esta foto de la facturación.';
alter table public.pedidos_venta_pendientes enable row level security;
drop policy if exists pedidos_venta_pendientes_sel on public.pedidos_venta_pendientes;
create policy pedidos_venta_pendientes_sel on public.pedidos_venta_pendientes for select using ((select ve_todo()));
revoke all on public.pedidos_venta_pendientes from anon, authenticated;
grant select on public.pedidos_venta_pendientes to authenticated;
-- En mantenimiento no se toca (como el resto de la copia de la facturación).
drop trigger if exists tg_mantenimiento on public.pedidos_venta_pendientes;
create trigger tg_mantenimiento before insert or update or delete on public.pedidos_venta_pendientes
  for each row execute function fn_bloqueo_mantenimiento();

alter table public.facturas_copia_estado add column if not exists pedidos_en timestamptz;
comment on column public.facturas_copia_estado.pedidos_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Última vez que se leyó entera de la facturación la foto de pedidos de venta sin facturar. Vacío = nunca (entonces no se cuentan).';

-- La foto entera, de una vez: lo que no viene se quita (ya está facturado, anulado o borrado).
create or replace function public.pedidos_venta_guardar(p_pedidos jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not es_servidor() then raise exception 'Solo el servidor guarda los pedidos de venta.' using errcode = '42501'; end if;
  if p_pedidos is null or jsonb_typeof(p_pedidos) <> 'array' then raise exception 'Los pedidos no tienen la forma esperada.'; end if;
  if jsonb_array_length(p_pedidos) > 10000 then raise exception 'Demasiados pedidos de una vez.'; end if;
  delete from pedidos_venta_pendientes where true;
  insert into pedidos_venta_pendientes (ref_externa, cliente_id, contacto_id, contacto_nombre, cif, numero, fecha, total, estado, envios_gx)
  select distinct on (f.id) f.id, c.id, lower(f.contacto_id), left(f.contacto_nombre, 200), left(hc.cif, 40), left(f.numero, 60), f.fecha,
         round(abs(coalesce(f.total, 0)), 2), case when f.estado = 'parcial' then 'parcial' else 'pendiente' end,
         coalesce((select array_agg(distinct upper(g)) from unnest(f.envios_gx) g where upper(g) ~ '^GX[0-9]{4,12}$'), '{}')
    from jsonb_to_recordset(p_pedidos) as f(id text, numero text, contacto_id text, contacto_nombre text, fecha date, total numeric, estado text, envios_gx text[])
    left join holded_contactos hc on hc.contacto_id = lower(f.contacto_id)
    left join clientes c on nullif(cif_base(hc.cif), '') is not null and cif_base(c.cif) = cif_base(hc.cif)
   where f.id is not null and length(f.id) between 1 and 60 and f.fecha is not null
   order by f.id, c.creado_en;
  get diagnostics v_n = row_count;
  update facturas_copia_estado set pedidos_en = now() where id;
  return v_n;
end $$;
comment on function public.pedidos_venta_guardar(jsonb) is '[Precio y pago] Sustituye la foto de pedidos de venta sin facturar por la que el servidor acaba de leer ENTERA de la facturación, casando cada pedido con su cliente por el CIF de su contacto. Devuelve cuántos guarda. Quién: servidor. Argumentos: p_pedidos: lista de pedidos (id, numero, contacto_id, contacto_nombre, fecha, total, estado: pendiente o parcial, envios_gx: referencias de envío que lleva).';
revoke all on function public.pedidos_venta_guardar(jsonb) from public, anon, authenticated;
grant execute on function public.pedidos_venta_guardar(jsonb) to service_role;

-- ---- El cálculo del crédito usado: ahora con los pedidos de venta sin facturar -------------
drop function if exists public.credito_usado_de(uuid[], uuid[]);
create or replace function public.credito_usado_de(p_clientes uuid[], p_sin uuid[] default null)
returns table (cliente_id uuid, deuda numeric, sin_facturar numeric, base numeric, envios integer, usado numeric, ultimo date, dias integer,
               pedidos numeric, n_pedidos integer)
language sql stable security definer set search_path = public as $$
  with m as (
    select credito_con_deuda_real() as deuda_real, (now() at time zone 'Europe/Madrid')::date as hoy,
           parametro_num('riesgo_dias_asumido', 60)::int as dias_estimacion,
           greatest(parametro_num('credito_dias_sin_facturar', 60)::int, 1) as dias_sin_facturar,
           coalesce((parametro('credito_cuenta_pedidos') #>> '{}')::boolean, true)
             and exists (select 1 from facturas_copia_estado where id and pedidos_en is not null) as con_pedidos),
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
     group by e.cliente_id),
  -- Sus pedidos de venta sin facturar que están SOLO en la facturación (viajes hechos fuera de
  -- la plataforma). El que lleva el GX de un envío de la plataforma, o el de una factura de la
  -- copia, no se suma: ese viaje ya se cuenta por el otro lado.
  p as (
    select q.cliente_id, count(*)::int as n, sum(q.total) as total
      from pedidos_venta_pendientes q, m
     where m.deuda_real and m.con_pedidos and q.cliente_id is not null and (p_clientes is null or q.cliente_id = any(p_clientes))
       and q.fecha >= m.hoy - m.dias_sin_facturar
       and not exists (select 1 from envios e where e.referencia_gx = any(q.envios_gx))
       and not exists (select 1 from facturas_emitidas f where f.tipo = 'factura' and f.estado <> 'anulada' and f.envios_gx && q.envios_gx)
     group by q.cliente_id)
  select cl.id, coalesce(d.deuda, 0), coalesce(a.total, 0), coalesce(a.base, 0), coalesce(a.n, 0),
         coalesce(d.deuda, 0) + coalesce(a.total, 0) + coalesce(p.total, 0), a.ultimo,
         case when m.deuda_real then m.dias_sin_facturar else m.dias_estimacion end,
         coalesce(p.total, 0), coalesce(p.n, 0)
    from cl cross join m left join d on d.cliente_id = cl.id left join a on a.cliente_id = cl.id left join p on p.cliente_id = cl.id
$$;
comment on function public.credito_usado_de(uuid[], uuid[]) is '[Precio y pago] EL cálculo del crédito usado de cada cliente, del que tiran todas las reglas y pantallas. Con la deuda real: lo que debe (facturas pendientes de cobro menos abonos sin compensar, nunca menos de 0; no cuenta la factura de envíos pagados por adelantado) más sus envíos a crédito aún sin facturar (sin factura en la copia que lleve su referencia GX; la marca manual de facturado no cuenta), con IVA, más sus pedidos de venta sin facturar que están solo en la facturación (los que llevan el GX de un envío de la plataforma o de una factura no se suman: cada viaje cuenta una vez). Sin ella (apagada o copia de facturas sin cargar): sus envíos a crédito de los últimos días. Devuelve deuda, sin facturar, su base sin IVA, cuántos envíos son, el total usado, el último día de carga, los días que se miran, y el importe y el número de esos pedidos. Quién: solo otras funciones y el servidor. Argumentos: p_clientes: lista de clientes.id (vacío = todos) · p_sin: envíos.id que no se cuentan.';
revoke all on function public.credito_usado_de(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.credito_usado_de(uuid[], uuid[]) to service_role;

-- El resumen: cuántos pedidos de venta sin facturar hay en la foto, y cuánto, para cuadrarlo
-- con la facturación antes de fiarse de la cifra.
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.deuda_estado()'::regprocedure);
  n := replace(d, $a$'credito_real', credito_con_deuda_real(),$a$,
    $a$'credito_real', credito_con_deuda_real(), 'pedidos_en', e.pedidos_en,
    'pedidos', (select count(*) from pedidos_venta_pendientes),
    'pedidos_importe', (select coalesce(sum(total), 0) from pedidos_venta_pendientes),
    'pedidos_plataforma', (select count(*) from pedidos_venta_pendientes q where exists (select 1 from envios x where x.referencia_gx = any(q.envios_gx))),$a$);
  if n = d then raise exception 'deuda_estado: no encuentro dónde añadir los pedidos de venta'; end if;
  execute n;
end $$;
comment on function public.deuda_estado() is '[Precio y pago] Resumen de la copia de facturas emitidas: cuándo se leyó por última vez, si falló, si ya terminó la primera carga, cuántos documentos guarda, desde qué fecha están todos y cuántos hay anteriores a ella (los que debían algo), cuántas facturas tienen deuda, total pendiente (ya restados los abonos sin devolver ni compensar) y vencido, cuántos abonos están pendientes y por cuánto, cuánto corresponde a contactos que no son clientes de la plataforma, si el crédito se calcula con la deuda real, y la foto de pedidos de venta sin facturar (cuándo se leyó, cuántos son, cuánto suman y cuántos son también un envío de la plataforma). Quién: equipo de Dynamo o servidor. Argumentos: sin argumentos.';
