-- =====================================================================================
-- PEDIDOS DE VENTA Y DE COMPRA SIEMPRE A LA PAR (también las líneas a 0 €)
-- =====================================================================================
-- Usuario, 2026-11-20: «el número de envíos generan los mismos pedidos de compra que pedidos
-- de venta… y las mismas numeraciones… al transportista le pago una penalización de 40 euros…
-- al cliente le pongo 0… ponerlo en facturación pero a coste cero, para que sepamos que se está
-- aplicando… y para que el cliente vea que ha habido una penalización, pero se la ha cobrado a
-- 0 euros… No quiero que tú te dediques a ver si se ha cobrado o no, eso lo hace Holded… no
-- quiero dejar ningún envío o penalización o paralización sin generar ese pedido».
--
-- 1. Penalizaciones: el importe que no se cobra (o no se paga) se guarda como 0, no vacío. Así
--    sale su línea a 0 € en el pedido y el cliente la ve (a 0 €).
-- 2. Un envío saca su pedido de venta y su pedido de compra A LA VEZ, con el mismo número (la
--    referencia GX): en cuanto tiene transportista. Toda línea sale aunque valga 0 €.
-- 3. Al pasarlo a Holded se guarda también cuántas líneas se pasaron: una penalización nueva a
--    0 € también se nota.
-- 4. El control solo mira que no falte ningún pedido ni línea, ni que haya cambiado lo pasado.
--    Fuera: margen negativo (es decisión de Dynamo) y lo de facturado o cobrado (es de Holded).

-- ---- 1. Importes de penalización: vacío = 0 ----------------------------------------------
create or replace function public.fn_penalizaciones_importe_cero()
returns trigger language plpgsql set search_path = public as $$
begin
  new.importe_cliente := coalesce(new.importe_cliente, 0);
  new.importe_transportista := coalesce(new.importe_transportista, 0);
  return new;
end $$;
revoke execute on function public.fn_penalizaciones_importe_cero() from public, anon, authenticated;
comment on function public.fn_penalizaciones_importe_cero() is '[Facturación] Disparador: el importe de una penalización que no se cobra al cliente (o no se paga al transportista) se guarda como 0, no vacío, para que su línea salga a 0 € en el pedido de venta (o de compra) y el cliente la vea. Quién: automático (antes de crear o cambiar una penalización). Argumentos: ninguno.';
drop trigger if exists tg_penalizaciones_importe_cero on public.penalizaciones;
create trigger tg_penalizaciones_importe_cero before insert or update of importe_cliente, importe_transportista on public.penalizaciones
  for each row execute function public.fn_penalizaciones_importe_cero();

do $$ begin
  if exists (select 1 from penalizaciones where importe_cliente is null or importe_transportista is null) then
    alter table penalizaciones disable trigger user;
    update penalizaciones set importe_cliente = coalesce(importe_cliente, 0), importe_transportista = coalesce(importe_transportista, 0)
     where importe_cliente is null or importe_transportista is null;
    alter table penalizaciones enable trigger user;
  end if;
end $$;

comment on column penalizaciones.importe_cliente is 'formato: número decimal (2 decimales) | rango: 0 o más | lista: no aplica | opcional | Lo que se cobra al cliente, en euros SIN IVA. Si no se le cobra, 0 (vacío se guarda como 0): la línea sale igual a 0 € en su pedido de venta y el cliente la ve. Ej. OK: 150.00 · Ej. mal: -20';
comment on column penalizaciones.importe_transportista is 'formato: número decimal (2 decimales) | rango: 0 o más | lista: no aplica | opcional | Lo que se paga al transportista, en euros SIN IVA. Si no le corresponde, 0 (vacío se guarda como 0): la línea sale igual a 0 € en su pedido de compra. El cliente nunca lo ve. Ej. OK: 120.00 · Ej. mal: -5';

-- ---- 2. Líneas de pedido: venta y compra a la par -----------------------------------------
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
  -- Con transportista: así el pedido de venta y el de compra nacen a la vez.
  where e.operador_id is null and e.estado <> all (array['borrador'::estado_envio, 'cancelado'::estado_envio])
    and e.transportista_id is not null
union all
 select p.envio_id,
    2 as orden,
    case t.clave when 'paralizacion' then 'paralizacion'::tipo_concepto else 'penalizacion'::tipo_concepto end as concepto,
    t.nombre || ' ' || p.codigo || coalesce(' · ' || p.descripcion, '') as descripcion,
    coalesce(p.importe_cliente, 0)::numeric(12,2) as precio_venta,
    coalesce(p.importe_transportista, 0)::numeric(12,2) as precio_compra
   from penalizaciones p
     join tipos_penalizacion t on t.id = p.tipo_id
  where p.estado = 'confirmada'::estado_penalizacion;
comment on view public.v_lineas_pedido is '[Facturación] Líneas de los pedidos de Holded, una por concepto: el porte de cada envío de Dynamo con transportista (no borrador ni cancelado) y cada penalización o paralización confirmada. Cada línea va a la vez al pedido de venta (precio_venta) y al de compra (precio_compra), con el mismo número de pedido (la referencia GX), aunque valga 0 €.';

-- Los ficheros: fuera el filtro «sin precio no sale» (toda línea sale, también a 0 €).
do $$ declare v text; k text; begin
  foreach k in array array['venta', 'compra'] loop
    v := pg_get_viewdef(('public.v_holded_pedido_' || k)::regclass, true);
    if position('l.precio_' || k || ' IS NOT NULL' in v) > 0 then
      v := regexp_replace(v, '\s*WHERE\s+\(?l\.precio_' || k || ' IS NOT NULL\)?\s*;?\s*$', '');
      if position('IS NOT NULL;' in v) > 0 or right(btrim(v), 1) = ';' then
        raise exception 'v_holded_pedido_%: no encuentro el filtro de precio', k;
      end if;
      execute 'create or replace view public.v_holded_pedido_' || k || ' with (security_invoker = true) as ' || v;
    end if;
  end loop;
end $$;

-- ---- 3. Lo pasado a Holded: total y número de líneas --------------------------------------
alter table envios
  add column if not exists holded_venta_lineas integer,
  add column if not exists holded_compra_lineas integer;
comment on column envios.holded_venta_lineas is 'formato: número entero | rango: >= 0 | lista: no aplica | automático | Cuántas líneas (porte, penalizaciones) tenía el pedido de venta cuando se pasó a Holded. Lo pone marcar_exportados(''venta''); si luego entra otra línea (aunque sea a 0 €), el control de facturación avisa. Vacío = no pasado.';
comment on column envios.holded_compra_lineas is 'formato: número entero | rango: >= 0 | lista: no aplica | automático | Cuántas líneas (porte, penalizaciones) tenía el pedido de compra cuando se pasó a Holded. Lo pone marcar_exportados(''compra''); si luego entra otra línea (aunque sea a 0 €), el control de facturación avisa. Vacío = no pasado.';

-- Lo ya pasado se da por bueno con lo que tiene ahora (también el total: las líneas a 0 € de
-- penalizaciones que antes estaban vacías no cambian el total).
update envios e set holded_venta_lineas = (select count(*) from v_lineas_pedido l where l.envio_id = e.id)
 where e.holded_pedido_venta is not null and e.holded_venta_lineas is null;
update envios e set holded_compra_lineas = (select count(*) from v_lineas_pedido l where l.envio_id = e.id)
 where e.holded_pedido_compra is not null and e.holded_compra_lineas is null;

create or replace function public.marcar_exportados(p_fichero text, p_refs text[], p_valor boolean default true)
returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  if not es_equipo_dynamo() then
    raise exception 'Solo el equipo de Dynamo puede marcar exportaciones.' using errcode = '42501';
  end if;
  if p_fichero in ('venta', 'compra') then
    update envios e set
      holded_pedido_venta = case when p_fichero <> 'venta' then e.holded_pedido_venta when not p_valor then null else e.referencia_gx end,
      holded_venta_total = case when p_fichero <> 'venta' then e.holded_venta_total when not p_valor then null else x.venta end,
      holded_venta_lineas = case when p_fichero <> 'venta' then e.holded_venta_lineas when not p_valor then null else x.n end,
      holded_pedido_compra = case when p_fichero <> 'compra' then e.holded_pedido_compra when not p_valor then null else e.referencia_gx end,
      holded_compra_total = case when p_fichero <> 'compra' then e.holded_compra_total when not p_valor then null else x.compra end,
      holded_compra_lineas = case when p_fichero <> 'compra' then e.holded_compra_lineas when not p_valor then null else x.n end
      from (select e2.id, coalesce(sum(l.precio_venta), 0) as venta, coalesce(sum(l.precio_compra), 0) as compra, count(l.envio_id)::int as n
              from envios e2 left join v_lineas_pedido l on l.envio_id = e2.id
             where e2.referencia_gx = any(p_refs) group by e2.id) x
     where x.id = e.id
       and (case when p_fichero = 'venta' then (case when not p_valor then e.holded_pedido_venta is not null else e.holded_pedido_venta is null end)
                 else (case when not p_valor then e.holded_pedido_compra is not null else e.holded_pedido_compra is null end) end);
  elsif p_fichero = 'bolsa' then
    update envios set publicado_en_bolsa_en = case when (not p_valor) then null else now() end
     where referencia_gx = any(p_refs)
       and (case when (not p_valor) then publicado_en_bolsa_en is not null
                 else publicado_en_bolsa_en is null or modificado_en > publicado_en_bolsa_en end);
  else
    raise exception 'Fichero de exportación no válido: %', p_fichero;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
comment on function public.marcar_exportados(text, text[], boolean) is '[Facturación] Marca (o desmarca) como exportados unos envíos por referencia GX: pedido de venta o de compra a facturación (guardando el total y el número de líneas que se pasaron, para el control de facturación), o publicado en bolsa (se puede volver a publicar si cambió). Devuelve cuántos envíos cambió. Quién: Dynamo (admin o empleado). Argumentos: p_fichero: venta, compra o bolsa · p_refs: array de referencias GX · p_valor (false = quitar la marca): true = desmarcar.';

-- ---- 4. El control: que no falte ningún pedido ni ninguna línea ---------------------------
delete from parametros where clave = 'control_facturacion_dias_factura';

create or replace function public.control_facturacion(p_limite integer default 300)
returns table (envio_id uuid, referencia text, cliente text, transportista text, estado text, tipo text,
               gravedad text, detalle text, importe numeric, fecha date, total_tipo integer)
language plpgsql stable security definer set search_path = public as $$
declare
  d int := greatest(0, parametro_num('control_facturacion_dias_holded', 3)::int);
begin
  if not (es_equipo_dynamo() or es_consola_supabase()) then
    raise exception 'Solo el equipo de Dynamo ve el control de facturación.' using errcode = '42501';
  end if;
  return query
  with base as (
    select e.id, e.referencia_gx, e.estado, e.cliente_id, e.transportista_id,
           e.importe_cliente, e.importe_transportista, e.holded_pedido_venta, e.holded_pedido_compra,
           e.holded_venta_total, e.holded_compra_total, e.holded_venta_lineas, e.holded_compra_lineas,
           coalesce(e.entregado_en, e.cancelado_en) as hecho_en,
           coalesce((coalesce(e.entregado_en, e.cancelado_en) at time zone 'Europe/Madrid')::date, e.fecha_carga_real, e.fecha_carga_desde) as dia,
           l.n, l.venta, l.compra
      from envios e
      cross join lateral (select count(*)::int as n, coalesce(sum(x.precio_venta), 0) as venta, coalesce(sum(x.precio_compra), 0) as compra
                            from v_lineas_pedido x where x.envio_id = e.id) l
     where e.operador_id is null and e.estado <> 'borrador'
       and (e.estado in ('entregado', 'cancelado') or e.holded_pedido_venta is not null or e.holded_pedido_compra is not null)
  ), filas as (
    select b.id, 'venta_sin_precio'::text as tipo, 'grave'::text as grav,
           'Entregado con el porte a 0 € para el cliente: revisa el precio antes de pasar el pedido de venta.'::text as txt,
           b.importe_cliente as imp, b.dia
      from base b where b.estado = 'entregado' and b.transportista_id is not null and coalesce(b.importe_cliente, 0) <= 0
    union all
    select b.id, 'sin_transportista', 'grave',
           'Entregado sin transportista: no tiene ni pedido de venta ni de compra. Asígnale quién lo llevó.', null, b.dia
      from base b where b.estado = 'entregado' and b.transportista_id is null
    union all
    select b.id, 'compra_sin_precio', 'grave',
           'Entregado con el porte a 0 € para el transportista: revisa el precio antes de pasar el pedido de compra.', b.importe_transportista, b.dia
      from base b where b.estado = 'entregado' and b.transportista_id is not null and coalesce(b.importe_transportista, 0) <= 0
    union all
    select b.id, 'compra_sin_venta', 'grave',
           'El pedido de compra está pasado a Holded y el de venta no.', b.venta, b.dia
      from base b where b.holded_pedido_compra is not null and b.holded_pedido_venta is null and b.n > 0
    union all
    select b.id, 'venta_sin_compra', 'grave',
           'El pedido de venta está pasado a Holded y el de compra no.', b.compra, b.dia
      from base b where b.holded_pedido_venta is not null and b.holded_pedido_compra is null and b.transportista_id is not null and b.n > 0
    union all
    select b.id, 'cambio_tras_holded', 'grave',
           'Cambió después de pasarlo a Holded: '
             || concat_ws(' · ',
                  case when b.holded_venta_lineas is not null and b.holded_venta_lineas <> b.n
                       then format('el pedido de venta tenía %s línea%s y ahora %s', b.holded_venta_lineas, case when b.holded_venta_lineas = 1 then '' else 's' end, b.n) end,
                  case when b.holded_venta_total is not null and b.holded_venta_total <> b.venta
                       then format('venta %s en Holded, ahora %s', euros_texto(b.holded_venta_total), euros_texto(b.venta)) end,
                  case when b.holded_compra_lineas is not null and b.holded_compra_lineas <> b.n
                       then format('el pedido de compra tenía %s línea%s y ahora %s', b.holded_compra_lineas, case when b.holded_compra_lineas = 1 then '' else 's' end, b.n) end,
                  case when b.holded_compra_total is not null and b.holded_compra_total <> b.compra
                       then format('compra %s en Holded, ahora %s', euros_texto(b.holded_compra_total), euros_texto(b.compra)) end)
             || '. Corrige el pedido en Holded.',
           b.venta - coalesce(b.holded_venta_total, b.venta), b.dia
      from base b
     where (b.holded_venta_total is not null and b.holded_venta_total <> b.venta)
        or (b.holded_compra_total is not null and b.holded_compra_total <> b.compra)
        or (b.holded_venta_lineas is not null and b.holded_venta_lineas <> b.n)
        or (b.holded_compra_lineas is not null and b.holded_compra_lineas <> b.n)
    union all
    select b.id, 'venta_sin_holded', 'grave',
           format('%s hace más de %s días y sin el pedido de venta en Holded.', case when b.estado = 'cancelado' then 'Cancelado con penalización' else 'Entregado' end, d),
           b.venta, b.dia
      from base b where b.estado in ('entregado', 'cancelado') and b.n > 0 and b.holded_pedido_venta is null
                    and b.hecho_en < now() - make_interval(days => d)
    union all
    select b.id, 'compra_sin_holded', 'grave',
           format('%s hace más de %s días y sin el pedido de compra en Holded.', case when b.estado = 'cancelado' then 'Cancelado con penalización' else 'Entregado' end, d),
           b.compra, b.dia
      from base b where b.estado in ('entregado', 'cancelado') and b.n > 0 and b.transportista_id is not null and b.holded_pedido_compra is null
                    and b.hecho_en < now() - make_interval(days => d)
    union all
    -- Una penalización sin confirmar todavía no tiene su línea en ningún pedido.
    select b.id, 'penalizacion_sin_confirmar', 'grave',
           format('%s %s sin confirmar desde hace más de %s días: aún no está en los pedidos (confírmala, aunque sea a 0 €, o anúlala).', t.nombre, p.codigo, d),
           p.importe_cliente, b.dia
      from penalizaciones p join tipos_penalizacion t on t.id = p.tipo_id join base b on b.id = p.envio_id
     where p.estado = 'pendiente_confirmar' and p.creado_en < now() - make_interval(days => d)
  )
  select f.id, b.referencia_gx, c.razon_social, tr.nombre_visible, b.estado::text,
         f.tipo, f.grav, f.txt, f.imp, f.dia, f.total::int
    from (select f0.*, row_number() over (partition by f0.tipo order by f0.dia nulls last, f0.id) as rn,
                 count(*) over (partition by f0.tipo) as total
            from filas f0) f
    join base b on b.id = f.id
    left join clientes c on c.id = b.cliente_id
    left join transportistas tr on tr.id = b.transportista_id
   where f.rn <= greatest(1, coalesce(p_limite, 300))
   order by case f.grav when 'grave' then 0 else 1 end, f.tipo, f.dia nulls last;
end $$;
comment on function public.control_facturacion(integer) is '[Facturación] Control de pedidos: envíos de Dynamo a los que les falta el pedido de venta o el de compra, o una línea (entregado o cancelado con penalización sin pasar a Holded pasados los días de Parámetros, uno de los dos pedidos pasado y el otro no, entregado sin transportista o con el porte a 0 €, penalización sin confirmar), o que cambiaron después de pasarlos a Holded (otro importe u otra línea, aunque sea a 0 €). No mira facturas ni cobros (eso es de Holded) ni el margen. Una fila por envío y problema, con gravedad y total_tipo (cuántos hay de ese problema). Quién: Dynamo (admin o empleado). Argumentos: p_limite: filas máximas por tipo de problema (300 por defecto).';

-- Cuadre por meses: pedidos de venta frente a pedidos de compra.
drop function if exists public.cuadre_facturacion(integer);
create function public.cuadre_facturacion(p_meses integer default 6)
returns table (mes date, envios integer, con_transportista integer, venta_en_holded integer, compra_en_holded integer,
               penalizaciones integer, venta numeric, compra numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_desde date := (date_trunc('month', (now() at time zone 'Europe/Madrid')::date)
                         - make_interval(months => greatest(1, least(24, coalesce(p_meses, 6))) - 1))::date;
begin
  if not (es_equipo_dynamo() or es_consola_supabase()) then
    raise exception 'Solo el equipo de Dynamo ve el cuadre de facturación.' using errcode = '42501';
  end if;
  return query
  select date_trunc('month', coalesce(e.fecha_carga_real, e.fecha_carga_desde))::date as m,
         count(*)::int,
         (count(*) filter (where e.transportista_id is not null))::int,
         (count(*) filter (where e.holded_pedido_venta is not null))::int,
         (count(*) filter (where e.holded_pedido_compra is not null))::int,
         coalesce(sum(l.pen), 0)::int,
         coalesce(sum(l.v), 0)::numeric, coalesce(sum(l.c), 0)::numeric
    from envios e
    cross join lateral (select count(*) as n, count(*) filter (where x.orden = 2) as pen,
                               sum(x.precio_venta) as v, sum(x.precio_compra) as c
                          from v_lineas_pedido x where x.envio_id = e.id) l
   -- Los entregados, y los cancelados que tienen algo en el pedido (una penalización).
   where e.operador_id is null and (e.estado = 'entregado' or (e.estado = 'cancelado' and l.n > 0))
     and coalesce(e.fecha_carga_real, e.fecha_carga_desde) >= v_desde
   group by 1
   order by 1 desc;
end $$;
revoke execute on function public.cuadre_facturacion(integer) from public, anon;
grant execute on function public.cuadre_facturacion(integer) to authenticated;
comment on function public.cuadre_facturacion(integer) is '[Facturación] Cuadre por meses (mes de la fecha de carga) de los envíos de Dynamo entregados (y los cancelados con penalización): cuántos son, cuántos tienen transportista, cuántos tienen el pedido de venta y el de compra pasados a Holded, cuántas líneas de penalización llevan e importes de venta y de compra (sin IVA). Quién: Dynamo (admin o empleado). Argumentos: p_meses: cuántos meses hacia atrás contando el actual (1 a 24; 6 por defecto).';

create or replace function public.control_facturacion_resuelto(p_envio uuid)
returns jsonb language plpgsql set search_path = public as $$
declare v numeric; c numeric; n int; e envios%rowtype;
begin
  if not es_equipo_dynamo() then
    raise exception 'Solo el equipo de Dynamo marca el control de facturación.' using errcode = '42501';
  end if;
  select * into e from envios where id = p_envio;
  if not found then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  select coalesce(sum(l.precio_venta), 0), coalesce(sum(l.precio_compra), 0), count(*) into v, c, n from v_lineas_pedido l where l.envio_id = p_envio;
  update envios set
    holded_venta_total = case when holded_pedido_venta is null or n = 0 then null else v end,
    holded_venta_lineas = case when holded_pedido_venta is null or n = 0 then null else n end,
    holded_compra_total = case when holded_pedido_compra is null or n = 0 then null else c end,
    holded_compra_lineas = case when holded_pedido_compra is null or n = 0 then null else n end,
    -- Sin ninguna línea (cancelado sin penalización): el pedido se anuló en Holded.
    holded_pedido_venta = case when n = 0 then null else holded_pedido_venta end,
    holded_pedido_compra = case when n = 0 then null else holded_pedido_compra end
   where id = p_envio;
  return jsonb_build_object('ok', true, 'resultado', 'resuelto', 'venta', v, 'compra', c, 'lineas', n);
end $$;
comment on function public.control_facturacion_resuelto(uuid) is '[Facturación] «Ya lo he corregido en Holded»: para un envío que cambió después de pasarlo a Holded, guarda como pasado lo que tiene ahora (importes y líneas de venta y compra); si ya no le queda ninguna línea (cancelado sin penalización), lo da por anulado en Holded. Devuelve {ok, resultado: resuelto | no_existe, venta, compra, lineas}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id.';

-- ---- 5. El email del lunes, con los problemas de ahora ------------------------------------
create or replace function public.avisar_control_facturacion(p_forzar boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_email text := coalesce(parametro('dynamo_email') #>> '{}', '');
  v_base text := coalesce(parametro('url_plataforma') #>> '{}', '');
  v_clave text := 'control_facturacion:' || to_char(hoy, 'IYYY-IW');
  v_filas text; v_graves int;
begin
  if not p_forzar then
    if not coalesce((parametro('control_facturacion_email') #>> '{}')::boolean, true) then return 0; end if;
    if mantenimiento_activo() then return 0; end if;
  end if;
  if v_email = '' or exists (select 1 from emails_enviados where clave = v_clave) then return 0; end if;
  select sum(x.n), string_agg(format('<tr><td style="padding:6px 10px;border-bottom:1px solid #eceef3">%s</td><td style="padding:6px 10px;border-bottom:1px solid #eceef3;text-align:right;font-weight:700;color:#c0262d">%s</td></tr>',
                           escapar_html(x.txt), x.n), '' order by x.n desc)
    into v_graves, v_filas
    from (select max(c.total_tipo) as n,
                 case c.tipo
                   when 'venta_sin_precio' then 'Entregados con el porte a 0 € para el cliente'
                   when 'sin_transportista' then 'Entregados sin transportista (sin pedidos)'
                   when 'compra_sin_precio' then 'Entregados con el porte a 0 € para el transportista'
                   when 'compra_sin_venta' then 'Pedido de compra pasado y el de venta no'
                   when 'venta_sin_compra' then 'Pedido de venta pasado y el de compra no'
                   when 'cambio_tras_holded' then 'Cambiados después de pasarlos a Holded'
                   when 'venta_sin_holded' then 'Sin el pedido de venta en Holded'
                   when 'compra_sin_holded' then 'Sin el pedido de compra en Holded'
                   when 'penalizacion_sin_confirmar' then 'Penalizaciones sin confirmar (aún no están en los pedidos)'
                   else c.tipo end as txt
            from control_facturacion(1) c where c.gravedad = 'grave' group by c.tipo) x;
  if coalesce(v_graves, 0) = 0 then return 0; end if;
  insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
  values (v_clave, 'control_facturacion', v_email,
    format('Control de pedidos: %s caso%s por revisar · Dynamo', v_graves, case when v_graves = 1 then '' else 's' end),
    format('<p>El control de pedidos ha encontrado <strong>%s caso%s</strong>: envíos o penalizaciones a los que les falta el pedido de venta o el de compra, o que han cambiado después de pasarlos a Holded.</p>'
        || '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%%;font-size:14px;margin:6px 0 14px">%s</table>'
        || '<p><a href="%s/panel/exportaciones?ver=cuadre" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">Abrir el control de facturación</a></p>',
      v_graves, case when v_graves = 1 then '' else 's' end, coalesce(v_filas, ''), v_base))
  on conflict (clave) do nothing;
  return 1;
end $$;
