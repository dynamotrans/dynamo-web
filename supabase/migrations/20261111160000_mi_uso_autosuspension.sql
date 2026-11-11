-- =====================================================================================
-- EL CLIENTE VE LO QUE LLEVA CONTRA LAS REGLAS DE SUSPENSIÓN (usuario, 2026-11-11)
-- =====================================================================================
-- El texto legal de Nuevo envío decía «3 cancelaciones en los últimos 10 envíos» a
-- pelo, desincronizado de los parámetros reales (que además se cambian en caliente).
-- Nueva mi_autosuspension(): el PROPIO cliente ve, con los mismos cálculos EXACTOS que
-- autosuspension_motivos (reglas 3, 4 y 5), cuánto lleva y cuáles son los límites
-- vigentes — consultas de precio (hoy / 7 días / 30 días, con su límite personal si lo
-- tiene), cancelaciones con coste (las que cuentan: con camión asignado, o tarde) sobre
-- sus envíos y las recientes. Solo devuelve SUS datos (auth.uid()); para cualquier
-- cuenta que no sea de cliente, nada. La usan la pantalla «Uso de Dynamo» del menú del
-- cliente y el aviso legal de Nuevo envío, con los valores vivos de Parámetros.
-- =====================================================================================

create or replace function public.mi_autosuspension()
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
  select x.id, x.rol, x.exento_autosuspension, x.limite_consultas_precio_diario,
         coalesce(x.autosuspension_desde_en, x.creado_en) as desde
    into u from usuarios x where x.id = auth.uid();
  if not found or u.rol <> 'cliente' then return null; end if;
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
revoke execute on function public.mi_autosuspension() from public, anon;
grant execute on function public.mi_autosuspension() to authenticated, service_role;
comment on function public.mi_autosuspension() is '[Clientes] Lo que el PROPIO cliente lleva contra las reglas de suspensión automática, con los límites vigentes de Parámetros: consultas de precio de hoy, 7 y 30 días (con su límite personal si lo tiene) y cancelaciones con coste (las que cuentan) sobre sus envíos y las de los últimos días. Mismos recuentos que autosuspension_motivos; activa dice si a esta cuenta le aplican las reglas. Para cuentas que no son de cliente devuelve null. Quién: el propio usuario (cliente). Argumentos: ninguno.';
