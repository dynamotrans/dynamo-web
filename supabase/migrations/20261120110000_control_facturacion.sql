-- =====================================================================================
-- CONTROL DE FACTURACIÓN: cuadre de envíos con los pedidos de venta y de compra
-- =====================================================================================
-- Usuario, 2026-11-20: «lo que más miedo me da es que los envíos que se han creado y se han
-- finalizado… no vaya a estar… si han sido 160 enviados y no los estoy facturando y
-- cobrando a clientes… a vencimiento… a lo mejor sí los estoy pagando a pedidos de compra de
-- transportista… tenemos que tener ciertos controles o verificaciones o algo».
--
-- 1. Al pasar un envío a Holded se guarda el TOTAL que se pasó (venta y compra). Si después
--    cambia el precio, entra una penalización o se cancela, el control lo ve: lo de Holded ya
--    no cuadra con la plataforma.
-- 2. control_facturacion(): la lista de envíos que pueden quedarse sin cobrar o mal cobrados.
-- 3. cuadre_facturacion(): por meses, entregados frente a pedidos pasados y facturados.
-- 4. control_facturacion_resuelto(): «ya lo he corregido en Holded».
-- 5. Cada lunes, si hay algo grave, email a Dynamo con el resumen y el botón al cuadre.
-- Solo envíos de Dynamo: los manuales (transportista propio del cliente) no se facturan.
-- Las dos lecturas van con los permisos del dueño (security definer) y miran ellas mismas que
-- quien pregunta sea de Dynamo: así pueden usar parametro_num y leer todos los envíos.

insert into parametros (clave, valor, descripcion) values
  ('control_facturacion_dias_holded', '3', 'Días desde la entrega a partir de los cuales el control avisa de un envío que aún no está pasado a Holded (pedido de venta o de compra).'),
  ('control_facturacion_dias_factura', '35', 'Días desde la entrega a partir de los cuales el control avisa de un envío pasado a Holded que aún no está facturado al cliente.'),
  ('control_facturacion_email', 'true', 'Si está encendido, cada lunes por la mañana llega a Dynamo un email con el control de facturación cuando hay algo grave (envíos que se pueden quedar sin cobrar).')
on conflict (clave) do nothing;

alter table envios
  add column if not exists holded_venta_total numeric(12,2),
  add column if not exists holded_compra_total numeric(12,2);

comment on column envios.holded_venta_total is 'formato: número decimal (2 decimales) | rango: >= 0 | lista: no aplica | automático | Total del pedido de venta (porte + penalizaciones confirmadas, sin IVA) cuando se pasó a Holded. Lo pone marcar_exportados(''venta''); si luego cambia, el control de facturación avisa. Vacío = no pasado.';
comment on column envios.holded_compra_total is 'formato: número decimal (2 decimales) | rango: >= 0 | lista: no aplica | automático | Total del pedido de compra (porte + penalizaciones confirmadas, sin IVA) cuando se pasó a Holded. Lo pone marcar_exportados(''compra''); si luego cambia, el control de facturación avisa. Vacío = no pasado.';

-- Lo ya pasado antes de hoy se da por bueno con lo que vale ahora.
update envios e set holded_venta_total = coalesce((select sum(l.precio_venta) from v_lineas_pedido l where l.envio_id = e.id), 0)
 where e.holded_pedido_venta is not null and e.holded_venta_total is null;
update envios e set holded_compra_total = coalesce((select sum(l.precio_compra) from v_lineas_pedido l where l.envio_id = e.id), 0)
 where e.holded_pedido_compra is not null and e.holded_compra_total is null;

-- ---- 1. Al marcar como pasado a Holded, se guarda el total --------------------------------
create or replace function public.marcar_exportados(p_fichero text, p_refs text[], p_valor boolean default true)
returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  if not es_equipo_dynamo() then
    raise exception 'Solo el equipo de Dynamo puede marcar exportaciones.' using errcode = '42501';
  end if;
  if p_fichero = 'venta' then
    update envios e set holded_pedido_venta = case when (not p_valor) then null else e.referencia_gx end,
                        holded_venta_total = case when (not p_valor) then null
                          else coalesce((select sum(l.precio_venta) from v_lineas_pedido l where l.envio_id = e.id), 0) end
     where e.referencia_gx = any(p_refs)
       and (case when (not p_valor) then e.holded_pedido_venta is not null else e.holded_pedido_venta is null end);
  elsif p_fichero = 'compra' then
    update envios e set holded_pedido_compra = case when (not p_valor) then null else e.referencia_gx end,
                        holded_compra_total = case when (not p_valor) then null
                          else coalesce((select sum(l.precio_compra) from v_lineas_pedido l where l.envio_id = e.id), 0) end
     where e.referencia_gx = any(p_refs)
       and (case when (not p_valor) then e.holded_pedido_compra is not null else e.holded_pedido_compra is null end);
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
comment on function public.marcar_exportados(text, text[], boolean) is '[Facturación] Marca (o desmarca) como exportados unos envíos por referencia GX: pedido de venta o de compra a facturación (guardando el total que se pasó, para el control de facturación), o publicado en bolsa (se puede volver a publicar si cambió). Devuelve cuántos envíos cambió. Quién: Dynamo (admin o empleado). Argumentos: p_fichero: venta, compra o bolsa · p_refs: array de referencias GX · p_valor (false = quitar la marca): true = desmarcar.';

-- ---- 2. Lo que puede quedarse sin cobrar (o mal cobrado) ----------------------------------
create or replace function public.control_facturacion(p_limite integer default 300)
returns table (envio_id uuid, referencia text, cliente text, transportista text, estado text, tipo text,
               gravedad text, detalle text, importe numeric, fecha date, total_tipo integer)
language plpgsql stable security definer set search_path = public as $$
declare
  d_holded int := greatest(0, parametro_num('control_facturacion_dias_holded', 3)::int);
  d_factura int := greatest(0, parametro_num('control_facturacion_dias_factura', 35)::int);
begin
  if not (es_equipo_dynamo() or es_consola_supabase()) then
    raise exception 'Solo el equipo de Dynamo ve el control de facturación.' using errcode = '42501';
  end if;
  return query
  with base as (
    select e.id, e.referencia_gx, e.estado, e.cliente_id, e.transportista_id,
           e.importe_cliente, e.importe_transportista, e.holded_pedido_venta, e.holded_pedido_compra,
           e.holded_venta_total, e.holded_compra_total, e.facturado_venta, e.facturado_compra,
           e.estado_pago_previo, e.entregado_en,
           coalesce((e.entregado_en at time zone 'Europe/Madrid')::date, e.fecha_carga_real, e.fecha_carga_desde) as dia,
           (select sum(l.precio_venta) from v_lineas_pedido l where l.envio_id = e.id) as venta,
           (select sum(l.precio_compra) from v_lineas_pedido l where l.envio_id = e.id) as compra
      from envios e
     where e.operador_id is null and e.estado <> 'borrador'
       and (e.estado in ('entregado', 'cancelado') or e.holded_pedido_venta is not null or e.holded_pedido_compra is not null
            or e.importe_transportista > e.importe_cliente)
  ), filas as (
    -- Entregado sin precio para el cliente: no sale en el pedido de venta.
    select b.id, 'venta_sin_precio'::text as tipo, 'grave'::text as grav,
           'Entregado sin precio para el cliente: no sale en el pedido de venta y no se le cobraría.'::text as txt,
           b.importe_cliente as imp, b.dia
      from base b where b.estado = 'entregado' and coalesce(b.importe_cliente, 0) <= 0
    union all
    select b.id, 'sin_transportista', 'grave',
           'Entregado sin transportista asignado: no hay pedido de compra. ¿Quién lo llevó?', null, b.dia
      from base b where b.estado = 'entregado' and b.transportista_id is null
    union all
    select b.id, 'compra_sin_precio', 'grave',
           'Entregado sin precio del transportista: no sale en el pedido de compra.', b.importe_transportista, b.dia
      from base b where b.estado = 'entregado' and b.transportista_id is not null and coalesce(b.importe_transportista, 0) <= 0
    union all
    select b.id, 'compra_sin_venta', 'grave',
           'Pasado a Holded como compra (se le paga al transportista) pero no como venta: al cliente no se le cobra.', b.venta, b.dia
      from base b where b.holded_pedido_compra is not null and b.holded_pedido_venta is null and coalesce(b.venta, 0) > 0
    union all
    select b.id, 'compra_facturada_venta_no', 'grave',
           'Tenemos la factura del transportista y al cliente aún no se le ha facturado.', b.venta, b.dia
      from base b where b.facturado_compra and not b.facturado_venta and coalesce(b.venta, 0) > 0
    union all
    select b.id, 'cambio_tras_holded', 'grave',
           'Cambió después de pasarlo a Holded: '
             || concat_ws(' · ',
                  case when b.holded_venta_total is not null and b.holded_venta_total is distinct from coalesce(b.venta, 0)
                       then format('venta %s en Holded, ahora %s', euros_texto(b.holded_venta_total), euros_texto(coalesce(b.venta, 0))) end,
                  case when b.holded_compra_total is not null and b.holded_compra_total is distinct from coalesce(b.compra, 0)
                       then format('compra %s en Holded, ahora %s', euros_texto(b.holded_compra_total), euros_texto(coalesce(b.compra, 0))) end)
             || '. Corrige el pedido en Holded.',
           coalesce(b.venta, 0) - coalesce(b.holded_venta_total, coalesce(b.venta, 0)), b.dia
      from base b
     where (b.holded_venta_total is not null and b.holded_venta_total is distinct from coalesce(b.venta, 0))
        or (b.holded_compra_total is not null and b.holded_compra_total is distinct from coalesce(b.compra, 0))
    union all
    select b.id, 'venta_sin_holded', 'grave',
           format('Entregado hace más de %s días y sin pasar a Holded como venta.', d_holded), b.venta, b.dia
      from base b where b.estado = 'entregado' and b.holded_pedido_venta is null and coalesce(b.venta, 0) > 0
                    and b.entregado_en < now() - make_interval(days => d_holded)
    union all
    select b.id, 'compra_sin_holded', 'revisar',
           format('Entregado hace más de %s días y sin pasar a Holded como compra.', d_holded), b.compra, b.dia
      from base b where b.estado = 'entregado' and b.holded_pedido_compra is null and coalesce(b.compra, 0) > 0
                    and b.entregado_en < now() - make_interval(days => d_holded)
    union all
    select b.id, 'sin_facturar',
           case when b.estado_pago_previo = 'pagado' then 'revisar' else 'grave' end,
           case when b.estado_pago_previo = 'pagado'
                then format('Cobrado por adelantado, pero sin factura emitida pasados %s días de la entrega.', d_factura)
                else format('En Holded pero sin facturar al cliente pasados %s días de la entrega.', d_factura) end,
           b.venta, b.dia
      from base b where b.estado = 'entregado' and b.holded_pedido_venta is not null and not b.facturado_venta
                    and coalesce(b.venta, 0) > 0 and b.entregado_en < now() - make_interval(days => d_factura)
    union all
    select b.id, 'margen_negativo', 'revisar',
           format('Pagamos al transportista %s y cobramos %s.', euros_texto(b.importe_transportista), euros_texto(b.importe_cliente)),
           b.importe_cliente - b.importe_transportista, b.dia
      from base b where b.estado <> 'cancelado' and b.importe_transportista > b.importe_cliente
    union all
    -- La penalización (cancelación con coste, paralización…) no se cobra hasta confirmarla.
    select b.id, 'penalizacion_sin_confirmar', 'revisar',
           format('%s %s sin confirmar desde hace más de %s días: no entra en el pedido hasta confirmarla.', t.nombre, p.codigo, d_holded),
           p.importe_cliente, b.dia
      from penalizaciones p join tipos_penalizacion t on t.id = p.tipo_id join base b on b.id = p.envio_id
     where p.estado = 'pendiente_confirmar' and p.creado_en < now() - make_interval(days => d_holded)
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
revoke execute on function public.control_facturacion(integer) from public, anon;
grant execute on function public.control_facturacion(integer) to authenticated;
comment on function public.control_facturacion(integer) is '[Facturación] Control de facturación: envíos de Dynamo que pueden quedarse sin cobrar o mal cobrados (entregado sin precio o sin transportista, compra pasada a Holded sin su venta, factura del transportista sin facturar al cliente, cambio después de pasarlo a Holded, sin pasar a Holded o sin facturar pasados los días de Parámetros, margen negativo, penalización sin confirmar). Una fila por envío y problema, con gravedad grave o revisar y total_tipo (cuántos hay de ese problema). Quién: Dynamo (admin o empleado). Argumentos: p_limite: filas máximas por tipo de problema (300 por defecto).';

-- ---- 3. Cuadre por meses ------------------------------------------------------------------
create or replace function public.cuadre_facturacion(p_meses integer default 6)
returns table (mes date, entregados integer, venta_en_holded integer, compra_en_holded integer,
               venta_facturados integer, compra_facturados integer, venta numeric, compra numeric,
               cancelados_con_cobro integer)
language plpgsql stable security definer set search_path = public as $$
declare v_desde date := (date_trunc('month', (now() at time zone 'Europe/Madrid')::date)
                         - make_interval(months => greatest(1, least(24, coalesce(p_meses, 6))) - 1))::date;
begin
  if not (es_equipo_dynamo() or es_consola_supabase()) then
    raise exception 'Solo el equipo de Dynamo ve el cuadre de facturación.' using errcode = '42501';
  end if;
  return query
  select date_trunc('month', coalesce(e.fecha_carga_real, e.fecha_carga_desde))::date as m,
         (count(*) filter (where e.estado = 'entregado'))::int,
         (count(*) filter (where e.estado = 'entregado' and e.holded_pedido_venta is not null))::int,
         (count(*) filter (where e.estado = 'entregado' and e.holded_pedido_compra is not null))::int,
         (count(*) filter (where e.estado = 'entregado' and e.facturado_venta))::int,
         (count(*) filter (where e.estado = 'entregado' and e.facturado_compra))::int,
         coalesce(sum(l.v), 0)::numeric, coalesce(sum(l.c), 0)::numeric,
         (count(*) filter (where e.estado = 'cancelado' and l.v > 0))::int
    from envios e
    left join lateral (select sum(x.precio_venta) as v, sum(x.precio_compra) as c from v_lineas_pedido x where x.envio_id = e.id) l on true
   where e.operador_id is null and e.estado in ('entregado', 'cancelado')
     and coalesce(e.fecha_carga_real, e.fecha_carga_desde) >= v_desde
   group by 1
   order by 1 desc;
end $$;
revoke execute on function public.cuadre_facturacion(integer) from public, anon;
grant execute on function public.cuadre_facturacion(integer) to authenticated;
comment on function public.cuadre_facturacion(integer) is '[Facturación] Cuadre por meses (mes de la fecha de carga) de los envíos de Dynamo: entregados, cuántos están pasados a Holded y facturados (venta y compra), importes de venta y de compra (porte + penalizaciones confirmadas, sin IVA) y cancelados con cobro. Quién: Dynamo (admin o empleado). Argumentos: p_meses: cuántos meses hacia atrás contando el actual (1 a 24; 6 por defecto).';

-- ---- 4. «Ya lo he corregido en Holded» ----------------------------------------------------
create or replace function public.control_facturacion_resuelto(p_envio uuid)
returns jsonb language plpgsql set search_path = public as $$
declare v numeric; c numeric; e envios%rowtype;
begin
  if not es_equipo_dynamo() then
    raise exception 'Solo el equipo de Dynamo marca el control de facturación.' using errcode = '42501';
  end if;
  select * into e from envios where id = p_envio;
  if not found then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  select sum(l.precio_venta), sum(l.precio_compra) into v, c from v_lineas_pedido l where l.envio_id = p_envio;
  update envios set
    holded_venta_total = case when holded_pedido_venta is null then null else coalesce(v, 0) end,
    holded_compra_total = case when holded_pedido_compra is null then null else coalesce(c, 0) end,
    -- Cancelado sin nada que cobrar: el pedido se anuló en Holded, ya no está pasado.
    holded_pedido_venta = case when coalesce(v, 0) = 0 and estado = 'cancelado' then null else holded_pedido_venta end,
    holded_pedido_compra = case when coalesce(c, 0) = 0 and estado = 'cancelado' then null else holded_pedido_compra end
   where id = p_envio;
  update envios set holded_venta_total = null where id = p_envio and holded_pedido_venta is null;
  update envios set holded_compra_total = null where id = p_envio and holded_pedido_compra is null;
  return jsonb_build_object('ok', true, 'resultado', 'resuelto', 'venta', coalesce(v, 0), 'compra', coalesce(c, 0));
end $$;
revoke execute on function public.control_facturacion_resuelto(uuid) from public, anon;
grant execute on function public.control_facturacion_resuelto(uuid) to authenticated;
comment on function public.control_facturacion_resuelto(uuid) is '[Facturación] «Ya lo he corregido en Holded»: para un envío que cambió después de pasarlo a Holded, guarda como pasado lo que vale ahora (venta y compra); si está cancelado y no queda nada que cobrar o pagar, lo da por anulado en Holded. Devuelve {ok, resultado: resuelto | no_existe, venta, compra}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id.';

-- El email nuevo a Dynamo.
do $$ declare v_def text; v_com text; begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'emails_enviados_tipo_check' and conrelid = 'public.emails_enviados'::regclass;
  if position('''control_facturacion''' in v_def) = 0 then
    v_def := replace(v_def, '''transportista_suspendido''::text', '''transportista_suspendido''::text, ''control_facturacion''::text');
    if position('''control_facturacion''' in v_def) = 0 then raise exception 'No se ha podido añadir control_facturacion'; end if;
    alter table public.emails_enviados drop constraint emails_enviados_tipo_check;
    execute 'alter table public.emails_enviados add constraint emails_enviados_tipo_check ' || v_def;
  end if;
  v_com := col_description('emails_enviados'::regclass, (select attnum from pg_attribute where attrelid = 'emails_enviados'::regclass and attname = 'tipo'));
  if position('control_facturacion' in v_com) = 0 then
    v_com := replace(v_com, ' · transportista_suspendido (a Dynamo, cuando un transportista queda suspendido por cancelar cargas) · ',
                     ' · transportista_suspendido (a Dynamo, cuando un transportista queda suspendido por cancelar cargas) · control_facturacion (a Dynamo, los lunes, si el control de facturación tiene algo grave) · ');
    if position('control_facturacion' in v_com) = 0 then raise exception 'No se ha podido documentar control_facturacion'; end if;
    execute format('comment on column emails_enviados.tipo is %L', v_com);
  end if;
end $$;

-- ---- 5. Email del lunes a Dynamo ----------------------------------------------------------
create or replace function public.avisar_control_facturacion(p_forzar boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_email text := coalesce(parametro('dynamo_email') #>> '{}', '');
  v_base text := coalesce(parametro('url_plataforma') #>> '{}', '');
  v_clave text := 'control_facturacion:' || to_char(hoy, 'IYYY-IW');
  v_filas text; v_graves int; v_revisar int; v_importe numeric;
begin
  if not p_forzar then
    if not coalesce((parametro('control_facturacion_email') #>> '{}')::boolean, true) then return 0; end if;
    if mantenimiento_activo() then return 0; end if;
  end if;
  if v_email = '' or exists (select 1 from emails_enviados where clave = v_clave) then return 0; end if;
  select count(*) filter (where k.gravedad = 'grave'), count(*) filter (where k.gravedad <> 'grave'),
         sum(k.importe) filter (where k.gravedad = 'grave' and k.tipo in ('venta_sin_holded', 'compra_sin_venta', 'compra_facturada_venta_no', 'sin_facturar'))
    into v_graves, v_revisar, v_importe
    from (select distinct on (c.envio_id, c.tipo) c.* from control_facturacion(100000) c) k;
  if coalesce(v_graves, 0) = 0 then return 0; end if;
  select string_agg(format('<tr><td style="padding:6px 10px;border-bottom:1px solid #eceef3">%s</td><td style="padding:6px 10px;border-bottom:1px solid #eceef3;text-align:right;font-weight:700;color:%s">%s</td></tr>',
                           escapar_html(x.txt), case when x.grav = 'grave' then '#c0262d' else '#b45309' end, x.n), '' order by x.grav, x.n desc)
    into v_filas
    from (select c.gravedad as grav, max(c.total_tipo) as n,
                 case c.tipo
                   when 'venta_sin_precio' then 'Entregados sin precio para el cliente'
                   when 'sin_transportista' then 'Entregados sin transportista'
                   when 'compra_sin_precio' then 'Entregados sin precio del transportista'
                   when 'compra_sin_venta' then 'Compra pasada a Holded sin su venta'
                   when 'compra_facturada_venta_no' then 'Factura del transportista recibida, cliente sin facturar'
                   when 'cambio_tras_holded' then 'Cambiados después de pasarlos a Holded'
                   when 'venta_sin_holded' then 'Entregados sin pasar a Holded como venta'
                   when 'compra_sin_holded' then 'Entregados sin pasar a Holded como compra'
                   when 'sin_facturar' then 'En Holded y sin facturar al cliente'
                   when 'margen_negativo' then 'Con margen negativo'
                   when 'penalizacion_sin_confirmar' then 'Penalizaciones sin confirmar'
                   else c.tipo end as txt
            from control_facturacion(1) c group by c.gravedad, c.tipo) x;
  insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
  values (v_clave, 'control_facturacion', v_email,
    format('Control de facturación: %s envío%s por revisar · Dynamo', v_graves, case when v_graves = 1 then '' else 's' end),
    format('<p>El control de facturación ha encontrado <strong>%s caso%s grave%s</strong>: envíos que se pueden quedar sin cobrar al cliente o con el pedido de Holded mal.%s</p>'
        || '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%%;font-size:14px;margin:6px 0 14px">%s</table>'
        || '<p>Rojo: grave (se puede quedar sin cobrar). Naranja: para revisar.</p>'
        || '<p><a href="%s/panel/exportaciones?ver=cuadre" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">Abrir el control de facturación</a></p>',
      v_graves, case when v_graves = 1 then '' else 's' end, case when v_graves = 1 then '' else 's' end,
      case when coalesce(v_importe, 0) > 0 then format(' Pendiente de cobrar o de facturar: <strong>%s</strong> sin IVA.', euros_texto(v_importe)) else '' end,
      coalesce(v_filas, ''), v_base))
  on conflict (clave) do nothing;
  return 1;
end $$;
revoke execute on function public.avisar_control_facturacion(boolean) from public, anon, authenticated;
comment on function public.avisar_control_facturacion(boolean) is '[Facturación] Tarea de los lunes: si el control de facturación tiene algo grave, manda a Dynamo un email con el resumen por tipo de problema y el botón «Abrir el control de facturación» (uno por semana). Respeta el interruptor control_facturacion_email y el mantenimiento. Quién: tarea programada (pg_cron). Argumentos: p_forzar: true = sin mirar el interruptor ni el mantenimiento (pruebas).';

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-control-facturacion', '41 6-9 * * 1', 'select public.avisar_control_facturacion()');
  end if;
end $$;
