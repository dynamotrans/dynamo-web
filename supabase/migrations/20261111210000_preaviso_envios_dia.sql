-- =====================================================================================
-- MI USO: también los ENVÍOS DE HOY y su límite personal (usuario, 2026-11-11): para el
-- pre-aviso ámbar del panel al llegar al 80 % del cupo del día («estás cerca del límite;
-- si lo superas, la cuenta se suspende hasta que la revisemos»), que la suspensión
-- automática (reglas 3 y 6) nunca pille por sorpresa a un cliente legítimo.
-- mi_autosuspension() gana la clave `envios_dia` {hoy, max_hoy}: max_hoy es el límite
-- individual de envíos al día (null = sin tope, la regla 6 no le aplica). Misma firma y
-- mismos permisos; el recuento es el MISMO env_hoy de autosuspension_motivos.
-- =====================================================================================
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
  u record; q1 int; q7 int; q30 int; env int; env_hoy int; canc int; rec int; max_dia int;
begin
  if p_cliente is not null and ve_todo() then
    -- El equipo de Dynamo mira a un cliente («Ver como»): el usuario TITULAR de esa
    -- empresa (su cuenta de cliente más antigua), que es el que crea los envíos.
    select x.id, x.rol, x.exento_autosuspension, x.limite_consultas_precio_diario, x.limite_envios_diario,
           coalesce(x.autosuspension_desde_en, x.creado_en) as desde
      into u from usuarios x where x.cliente_id = p_cliente and x.rol = 'cliente'
     order by x.creado_en limit 1;
    if not found then return null; end if;
  else
    select x.id, x.rol, x.exento_autosuspension, x.limite_consultas_precio_diario, x.limite_envios_diario,
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
  select count(*) into env_hoy from envios e where e.creado_por = u.id and e.estado <> 'borrador'
    and e.creado_en >= greatest(u.desde, now() - interval '1 day');
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
    'envios_dia', jsonb_build_object('hoy', env_hoy, 'max_hoy', u.limite_envios_diario),
    'cancelaciones', jsonb_build_object('propias', canc, 'envios', env, 'max_pct', pct, 'min_envios', min_env,
                                        'recientes', rec, 'max_recientes', n_rec, 'dias_recientes', d_rec));
end $$;
revoke execute on function public.mi_autosuspension(uuid) from public, anon;
grant execute on function public.mi_autosuspension(uuid) to authenticated, service_role;
comment on function public.mi_autosuspension(uuid) is '[Clientes] Lo que un cliente lleva contra las reglas de suspensión automática, con los límites vigentes de Parámetros: consultas de precio de hoy, 7 y 30 días (con su límite personal si lo tiene), envíos creados hoy con su límite personal (envios_dia; max_hoy null = sin tope, regla 6) y cancelaciones con coste sobre sus envíos y las de los últimos días. El cliente ve lo suyo (p_cliente se ignora); el equipo de Dynamo, con p_cliente, lo del titular de esa empresa («Ver como»). Mismos recuentos que autosuspension_motivos; activa dice si le aplican las reglas. Para otras cuentas devuelve null. Quién: el propio cliente, o Dynamo con p_cliente. Argumentos: p_cliente: clientes.id | opcional.';
