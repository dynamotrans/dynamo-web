-- =====================================================================================
-- USO DE DYNAMO PARA EL EQUIPO: «VER COMO» CLIENTE Y COLUMNAS EN LA LISTA (2026-11-11)
-- =====================================================================================
-- 1) mi_autosuspension() gana p_cliente: con «Ver como» un cliente, el equipo de Dynamo
--    ve la pantalla «Uso de Dynamo» de ESE cliente (sus contadores y los límites vivos),
--    igual que la ve él. El cliente sigue viendo solo lo suyo (el parámetro se ignora).
-- 2) uso_clientes(p_ids): contadores de uso por cliente para las columnas de la lista
--    de Clientes (consultas hoy/7/30 días, envíos, cancelaciones con coste y usuarios
--    suspendidos), sumando los usuarios de cada empresa, cada uno desde su marca
--    autosuspension_desde_en (la que se pone sola al reactivar: por eso un reactivado
--    sale a 0 y no se vuelve a suspender al instante).
-- 3) clientes_pagina() gana p_orden: ordenar la lista por consultas de los últimos 30
--    días o por cancelaciones con coste (de más a menos), manteniendo buscador, filtro
--    de estado y paginación.
-- =====================================================================================

-- ---- 1. mi_autosuspension(p_cliente): el cliente lo suyo; Dynamo, con «Ver como» -----
drop function if exists public.mi_autosuspension();
create or replace function public.mi_autosuspension(p_cliente uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c_dia   int := parametro_num('autosuspension_consultas_dia', 15);
  c_sem   int := parametro_num('autosuspension_consultas_semana', 30);
  c_mes   int := parametro_num('autosuspension_consultas_mes', 60);
  pct     numeric := parametro_num('autosuspension_cancel_pct', 30);
  min_env int := parametro_num('autosuspension_cancel_min_envios', 5);
  n_rec   int := parametro_num('autosuspension_cancel_recientes', 3);
  d_rec   int := parametro_num('autosuspension_cancel_recientes_dias', 10);
  u record; q1 int; q7 int; q30 int; env int; canc int; rec int; max_dia int;
begin
  if p_cliente is not null and ve_todo() then
    -- El equipo de Dynamo mira a un cliente («Ver como»): el usuario TITULAR de esa
    -- empresa (su cuenta de cliente más antigua), que es el que crea los envíos.
    select x.id, x.rol, x.exento_autosuspension, x.limite_consultas_precio_diario,
           coalesce(x.autosuspension_desde_en, x.creado_en) as desde
      into u from usuarios x where x.cliente_id = p_cliente and x.rol = 'cliente'
     order by x.creado_en limit 1;
    if not found then return null; end if;
  else
    select x.id, x.rol, x.exento_autosuspension, x.limite_consultas_precio_diario,
           coalesce(x.autosuspension_desde_en, x.creado_en) as desde
      into u from usuarios x where x.id = auth.uid();
    if not found or u.rol <> 'cliente' then return null; end if;
  end if;
  max_dia := coalesce(u.limite_consultas_precio_diario, c_dia);
  -- Los MISMOS recuentos que autosuspension_motivos (si cambian allí, cambiar aquí).
  select count(*) into q1  from consultas_precio q where q.usuario_id = u.id and q.cuando >= greatest(u.desde, now() - interval '1 day');
  select count(*) into q7  from consultas_precio q where q.usuario_id = u.id and q.cuando >= greatest(u.desde, now() - interval '7 days');
  select count(*) into q30 from consultas_precio q where q.usuario_id = u.id and q.cuando >= greatest(u.desde, now() - interval '30 days');
  select count(*) into env from envios e where e.creado_por = u.id and e.estado <> 'borrador' and e.creado_en >= u.desde;
  select count(distinct h.envio_id) into canc from envio_hitos h join envios e on e.id = h.envio_id
    where h.hito = 'cancelado' and (h.quien = u.id or e.cancelado_en_nombre_cliente) and e.creado_por = u.id and e.creado_en >= u.desde
      and not e.cancelacion_sin_coste and cancelacion_cuenta(e.transportista_id, h.cuando, coalesce(e.fecha_carga_desde, e.fecha_carga_real));
  select count(distinct h.envio_id) into rec from envio_hitos h join envios e on e.id = h.envio_id
    where h.hito = 'cancelado' and (h.quien = u.id or (e.cancelado_en_nombre_cliente and e.creado_por = u.id))
      and h.cuando >= greatest(u.desde, now() - make_interval(days => d_rec))
      and not e.cancelacion_sin_coste and cancelacion_cuenta(e.transportista_id, h.cuando, coalesce(e.fecha_carga_desde, e.fecha_carga_real));
  return jsonb_build_object(
    'activa', coalesce((parametro('autosuspension_activa') #>> '{}')::boolean, false) and not u.exento_autosuspension,
    'consultas', jsonb_build_object('hoy', q1, 'max_hoy', max_dia, 'semana', q7, 'max_semana', c_sem, 'mes', q30, 'max_mes', c_mes),
    'cancelaciones', jsonb_build_object('propias', canc, 'envios', env, 'max_pct', pct, 'min_envios', min_env,
                                        'recientes', rec, 'max_recientes', n_rec, 'dias_recientes', d_rec));
end $$;
revoke execute on function public.mi_autosuspension(uuid) from public, anon;
grant execute on function public.mi_autosuspension(uuid) to authenticated, service_role;
comment on function public.mi_autosuspension(uuid) is '[Clientes] Lo que un cliente lleva contra las reglas de suspensión automática, con los límites vigentes de Parámetros: consultas de precio de hoy, 7 y 30 días (con su límite personal si lo tiene) y cancelaciones con coste sobre sus envíos y las de los últimos días. El cliente ve lo suyo (p_cliente se ignora); el equipo de Dynamo, con p_cliente, lo del titular de esa empresa («Ver como»). Mismos recuentos que autosuspension_motivos; activa dice si le aplican las reglas. Para otras cuentas devuelve null. Quién: el propio cliente, o Dynamo con p_cliente. Argumentos: p_cliente: clientes.id | opcional.';

-- ---- 2. uso_clientes: contadores por cliente para la lista (solo Dynamo) --------------
create or replace function public.uso_clientes(p_ids uuid[])
returns table (cliente_id uuid, consultas_hoy int, consultas_semana int, consultas_mes int,
               envios int, canceladas int, recientes int, usuarios_suspendidos int)
language plpgsql stable security definer set search_path = public as $$
declare d_rec int := parametro_num('autosuspension_cancel_recientes_dias', 10);
begin
  if not ve_todo() then return; end if;
  return query
  with us as (
    select x.id, x.cliente_id as cid, coalesce(x.autosuspension_desde_en, x.creado_en) as desde,
           (x.estado = 'suspendida') as susp
      from usuarios x where x.cliente_id = any(p_ids) and x.rol = 'cliente'
  ), q as (
    select u.cid,
           count(*) filter (where c.cuando >= greatest(u.desde, now() - interval '1 day'))::int  as q1,
           count(*) filter (where c.cuando >= greatest(u.desde, now() - interval '7 days'))::int as q7,
           count(*)::int as q30
      from us u join consultas_precio c on c.usuario_id = u.id
     where c.cuando >= greatest(u.desde, now() - interval '30 days')
     group by u.cid
  ), e as (
    select u.cid, count(*)::int as env
      from us u join envios ev on ev.creado_por = u.id
     where ev.estado <> 'borrador' and ev.creado_en >= u.desde
     group by u.cid
  ), k as (
    select u.cid,
           count(distinct h.envio_id) filter (where ev.creado_en >= u.desde and (h.quien = u.id or ev.cancelado_en_nombre_cliente))::int as canc,
           count(distinct h.envio_id) filter (where h.cuando >= greatest(u.desde, now() - make_interval(days => d_rec))
                                                and (h.quien = u.id or (ev.cancelado_en_nombre_cliente and ev.creado_por = u.id)))::int as rec
      from us u join envios ev on ev.creado_por = u.id
      join envio_hitos h on h.envio_id = ev.id and h.hito = 'cancelado'
     where not ev.cancelacion_sin_coste
       and cancelacion_cuenta(ev.transportista_id, h.cuando, coalesce(ev.fecha_carga_desde, ev.fecha_carga_real))
     group by u.cid
  ), s as (
    select u.cid, count(*) filter (where u.susp)::int as n from us u group by u.cid
  )
  select i.id, coalesce(q.q1, 0), coalesce(q.q7, 0), coalesce(q.q30, 0),
         coalesce(e.env, 0), coalesce(k.canc, 0), coalesce(k.rec, 0), coalesce(s.n, 0)
    from unnest(p_ids) as i(id)
    left join q on q.cid = i.id
    left join e on e.cid = i.id
    left join k on k.cid = i.id
    left join s on s.cid = i.id;
end $$;
revoke execute on function public.uso_clientes(uuid[]) from public, anon;
grant execute on function public.uso_clientes(uuid[]) to authenticated, service_role;
comment on function public.uso_clientes(uuid[]) is '[Clientes] Contadores de uso por cliente para la lista: consultas de precio de hoy, 7 y 30 días, envíos creados, cancelaciones con coste (totales y de los últimos días) y usuarios suspendidos de la empresa. Suma los usuarios de cada empresa, cada uno desde su marca de reactivación (autosuspension_desde_en), los mismos criterios que autosuspension_motivos. Quién: Dynamo (también solo lectura). Argumentos: p_ids: clientes.id[].';

-- ---- 3. clientes_pagina con orden por uso --------------------------------------------
drop function if exists public.clientes_pagina(text, text, integer, integer);
create or replace function public.clientes_pagina(p_q text default null, p_estado text default null, p_pagina integer default 1, p_por_pagina integer default 20, p_orden text default null)
returns table (id uuid, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_pal text[] := patrones_busqueda(p_q);
  v_por int := least(greatest(coalesce(p_por_pagina, 20), 1), 200);
  v_off int := (greatest(coalesce(p_pagina, 1), 1) - 1) * least(greatest(coalesce(p_por_pagina, 20), 1), 200);
begin
  if not ve_todo() then return; end if;
  if p_orden in ('consultas', 'canceladas') then
    -- Orden por uso: consultas de precio de los últimos 30 días o cancelaciones con
    -- coste (de más a menos), con los mismos criterios que uso_clientes.
    return query
    with cand as (
      select k.id as cid, k.nombre_visible
        from clientes k
       where (cardinality(v_pal) = 0 or (k.texto_busqueda like v_pal[1] and k.texto_busqueda like all (v_pal)))
         and (p_estado is null or p_estado = '' or k.estado::text = p_estado)
    ), us as (
      select x.id, x.cliente_id as cid, coalesce(x.autosuspension_desde_en, x.creado_en) as desde
        from usuarios x join cand on cand.cid = x.cliente_id where x.rol = 'cliente'
    ), m as (
      select u.cid, count(*)::bigint as v
        from us u join consultas_precio c on c.usuario_id = u.id
       where p_orden = 'consultas' and c.cuando >= greatest(u.desde, now() - interval '30 days')
       group by u.cid
      union all
      select u.cid, count(distinct h.envio_id)::bigint
        from us u join envios ev on ev.creado_por = u.id
        join envio_hitos h on h.envio_id = ev.id and h.hito = 'cancelado'
       where p_orden = 'canceladas' and ev.creado_en >= u.desde
         and (h.quien = u.id or ev.cancelado_en_nombre_cliente)
         and not ev.cancelacion_sin_coste
         and cancelacion_cuenta(ev.transportista_id, h.cuando, coalesce(ev.fecha_carga_desde, ev.fecha_carga_real))
       group by u.cid
    )
    select cand.cid, count(*) over ()
      from cand left join (select m.cid, sum(m.v) as v from m group by m.cid) t on t.cid = cand.cid
     order by coalesce(t.v, 0) desc, cand.nombre_visible, cand.cid
     offset v_off limit v_por;
    return;
  end if;
  return query
  select k.id, count(*) over ()
    from clientes k
   where (cardinality(v_pal) = 0 or (k.texto_busqueda like v_pal[1] and k.texto_busqueda like all (v_pal)))
     and (p_estado is null or p_estado = '' or k.estado::text = p_estado)
   order by k.nombre_visible, k.id
   offset v_off limit v_por;
end $$;
revoke execute on function public.clientes_pagina(text, text, integer, integer, text) from public, anon;
grant execute on function public.clientes_pagina(text, text, integer, integer, text) to authenticated, service_role;
comment on function public.clientes_pagina(text, text, integer, integer, text) is '[Clientes] Lista por páginas: ids de la página y total, buscando en nombre, CIF, código, domicilio, sector y contactos (todas las palabras, sin tildes), con filtro de estado. p_orden ordena por uso: consultas (de precio, últimos 30 días) o canceladas (cancelaciones con coste), de más a menos; sin él, por nombre. Quién: Dynamo (también solo lectura). Argumentos: p_q: texto · p_estado: activa | pendiente_verificacion | suspendida · p_pagina, p_por_pagina (máx. 200) · p_orden: consultas | canceladas | opcional.';
