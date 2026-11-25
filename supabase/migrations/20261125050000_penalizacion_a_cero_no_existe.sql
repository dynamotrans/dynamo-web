-- =====================================================================================
-- UNA PENALIZACIÓN A 0 € NO EXISTE (usuario, 2026-11-25)
-- =====================================================================================
-- «Para penalizaciones, si el importe a cliente o transportista es 0 no se le genera la
-- penalización. No existe que tenga valor 0 al crearla.»
--
-- CÓMO ESTABA (decisión del 20-nov): el lado al que no se le cobra o no se le paga se guarda
-- a 0 € y esa penalización se le enseñaba igual («a 0 €»).
--
-- AHORA:
--  1. Con los DOS importes a 0 (o vacíos) la penalización no se crea. A mano da un mensaje;
--     la automática de cancelar fuera de plazo, si el envío no tiene importes, no se genera.
--  2. A quien le toca 0 no le existe: el cliente no ve en su lista (ni en su contador) las
--     penalizaciones que no le cobran nada, y el transportista tampoco las que no le pagan
--     nada. Los emails y avisos ya salían solo con importe mayor que 0.
--
-- LO QUE NO SE TOCA (pendiente de que el usuario lo confirme): la línea a 0 € de esa
-- penalización en el pedido de venta o de compra para la facturación, que el 20-nov pidió
-- para que los dos pedidos lleven las mismas líneas.

create or replace function public.fn_penalizaciones_importe_cero()
returns trigger language plpgsql set search_path = public as $$
begin
  new.importe_cliente := coalesce(new.importe_cliente, 0);
  new.importe_transportista := coalesce(new.importe_transportista, 0);
  if tg_op = 'INSERT' and new.importe_cliente <= 0 and new.importe_transportista <= 0 then
    if new.generada_auto then return null; end if;   -- la automática sin importes: no se genera
    raise exception 'Una penalización a 0 € no existe: pon un importe mayor que 0, al cliente o al transportista.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.fn_penalizaciones_importe_cero() from public, anon, authenticated;
comment on function public.fn_penalizaciones_importe_cero() is '[Facturación] Disparador: el importe de una penalización que no se cobra al cliente (o no se paga al transportista) se guarda como 0, no vacío. Al crearla, si los dos importes son 0 la penalización no existe: a mano da error y la automática (cancelar fuera de plazo) no se genera. Quién: automático (antes de crear o cambiar una penalización). Argumentos: ninguno.';

comment on column penalizaciones.importe_cliente is 'formato: número decimal (2 decimales) | rango: 0 o más | lista: no aplica | opcional | Lo que se cobra al cliente, en euros SIN IVA. Si no se le cobra, 0 (vacío se guarda como 0): entonces para el cliente esa penalización no existe (no la ve ni se le avisa). Los dos importes a 0 no se admiten al crearla. Ej. OK: 150.00 · Ej. mal: -20';
comment on column penalizaciones.importe_transportista is 'formato: número decimal (2 decimales) | rango: 0 o más | lista: no aplica | opcional | Lo que se paga al transportista, en euros SIN IVA. Si no le corresponde, 0 (vacío se guarda como 0): entonces para el transportista esa penalización no existe (no la ve ni se le avisa). El cliente nunca lo ve. Los dos importes a 0 no se admiten al crearla. Ej. OK: 120.00 · Ej. mal: -5';

-- ---- A quien le toca 0 no le aparece ---------------------------------------------------------
create or replace function public.mis_penalizaciones()
returns table (id uuid, codigo text, envio_id uuid, referencia_gx text, tipo text,
               descripcion text, importe_cliente numeric, estado estado_penalizacion,
               creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.codigo, p.envio_id, e.referencia_gx, t.nombre, p.descripcion,
         p.importe_cliente, p.estado, p.creado_en
    from penalizaciones p
    join envios e             on e.id = p.envio_id
    join tipos_penalizacion t on t.id = p.tipo_id
   where e.cliente_id = cliente_del_usuario()
     and p.importe_cliente > 0
     and p.estado <> 'cancelada'
   order by p.creado_en desc
$$;
comment on function public.mis_penalizaciones() is '[Precio y pago] Penalizaciones del cliente que llama (sin las canceladas ni las que no le cobran nada: importe al cliente 0), con su importe al cliente sin IVA, tipo, envío y estado. Quién: cliente. Argumentos: sin argumentos.';

create or replace function public.mis_penalizaciones_transportista()
returns table (id uuid, codigo text, envio_id uuid, referencia_gx text, tipo text,
               descripcion text, importe_transportista numeric, estado estado_penalizacion,
               creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.codigo, p.envio_id, e.referencia_gx, t.nombre, p.descripcion,
         p.importe_transportista, p.estado, p.creado_en
    from penalizaciones p
    join envios e             on e.id = p.envio_id
    join tipos_penalizacion t on t.id = p.tipo_id
   where e.transportista_id = transportista_del_usuario()
     and p.importe_transportista > 0
     and p.estado <> 'cancelada'
   order by p.creado_en desc
$$;
comment on function public.mis_penalizaciones_transportista() is '[Ofertas y transportistas] Penalizaciones del transportista que llama (sin las canceladas ni las que no le pagan nada: importe al transportista 0), con su importe al transportista sin IVA, tipo, envío y estado. Quién: transportista. Argumentos: sin argumentos.';

-- El contador del menú, cuando Dynamo mira «como» un cliente o un transportista: igual.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.contadores_panel(uuid, uuid)'::regprocedure);
  n := replace(replace(v, 'p.importe_cliente is not null and p.estado', 'p.importe_cliente > 0 and p.estado'),
               'p.importe_transportista is not null and p.estado', 'p.importe_transportista > 0 and p.estado');
  if n = v or position('p.importe_cliente > 0' in n) = 0 or position('p.importe_transportista > 0' in n) = 0 then
    raise exception 'contadores_panel: no encuentro los dos filtros de penalizaciones';
  end if;
  execute n;
end $$;
