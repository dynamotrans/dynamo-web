-- =====================================================================================
-- LÍMITE DE ENVÍOS AL DÍA POR USUARIO, APLICADO DE VERDAD (usuario, 2026-11-11:
-- «cabléalo igual que consultas»). La columna usuarios.limite_envios_diario existía y
-- se editaba en la ficha, pero ninguna regla la comprobaba.
--
-- Ahora es la REGLA 6 de la suspensión automática, con la misma mecánica que el límite
-- de consultas (regla 3): el envío que pasa del límite se crea, y la cuenta queda
-- suspendida en ese mismo instante. Diferencias a propósito:
--   · Es un tope SOLO individual: vacío = sin tope (no hay parámetro general).
--   · Cuenta los envíos creados por ese usuario HOY (último día) que no son borrador.
-- Dispara al crear un envío ya efectivo y también cuando un borrador deja de serlo
-- (los envíos del panel nacen como borrador y se confirman después).
-- =====================================================================================

-- ---- 1. La regla 6, dentro de las reglas de siempre ---------------------------------
create or replace function public.autosuspension_motivos(p_usuario uuid default null::uuid)
returns table(usuario_id uuid, email text, motivo text)
language plpgsql stable security definer
set search_path to 'public', 'auth'
as $function$
declare
  d_sin_env int := parametro_num('autosuspension_sin_envios_dias', 45);
  d_acceso  int := parametro_num('autosuspension_sin_acceso_dias', 400);
  c_dia     int := parametro_num('autosuspension_consultas_dia', 15);
  c_sem     int := parametro_num('autosuspension_consultas_semana', 30);
  c_mes     int := parametro_num('autosuspension_consultas_mes', 60);
  pct       numeric := parametro_num('autosuspension_cancel_pct', 30);
  min_env   int := parametro_num('autosuspension_cancel_min_envios', 5);
  n_rec     int := parametro_num('autosuspension_cancel_recientes', 3);
  d_rec     int := parametro_num('autosuspension_cancel_recientes_dias', 10);
begin
  return query
  with base as (
    select u.id, u.email, u.rol, u.cliente_id, u.creado_en,
           coalesce(u.autosuspension_desde_en, u.creado_en) as desde,
           coalesce(u.limite_consultas_precio_diario, c_dia) as max_dia,
           u.limite_envios_diario as max_env_dia,
           au.last_sign_in_at
      from usuarios u left join auth.users au on au.id = u.id
     where u.estado = 'activa' and not u.exento_autosuspension and u.rol in ('cliente', 'transportista')
       and (p_usuario is null or u.id = p_usuario)
  ), m as (
    select b.*,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - interval '1 day'))  as q1,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - interval '7 days')) as q7,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - interval '30 days')) as q30,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - make_interval(days => d_sin_env))) as q_reg1,
      (select count(*) from envios e where e.cliente_id = b.cliente_id and e.estado <> 'borrador'
          and e.estado_solicitud is distinct from 'rechazada' and e.creado_en >= now() - make_interval(days => d_sin_env)) as env_empresa,
      (select count(*) from envios e where e.creado_por = b.id and e.estado <> 'borrador' and e.creado_en >= b.desde) as env_suyos,
      (select count(*) from envios e where e.creado_por = b.id and e.estado <> 'borrador'
          and e.creado_en >= greatest(b.desde, now() - interval '1 day')) as env_hoy,
      (select count(distinct h.envio_id) from envio_hitos h join envios e on e.id = h.envio_id
          where h.hito = 'cancelado' and (h.quien = b.id or e.cancelado_en_nombre_cliente) and e.creado_por = b.id and e.creado_en >= b.desde
            and not e.cancelacion_sin_coste and cancelacion_cuenta(e.transportista_id, h.cuando, coalesce(e.fecha_carga_desde, e.fecha_carga_real))) as canc_suyas,
      (select count(distinct h.envio_id) from envio_hitos h join envios e on e.id = h.envio_id
          where h.hito = 'cancelado' and (h.quien = b.id or (e.cancelado_en_nombre_cliente and e.creado_por = b.id))
            and h.cuando >= greatest(b.desde, now() - make_interval(days => d_rec))
            and not e.cancelacion_sin_coste and cancelacion_cuenta(e.transportista_id, h.cuando, coalesce(e.fecha_carga_desde, e.fecha_carga_real))) as canc_rec
    from base b
  )
  select m.id, m.email, r.motivo
    from m cross join lateral (
      select case
        when m.rol = 'cliente' and m.creado_en <= now() - make_interval(days => d_sin_env) and m.desde <= now() - make_interval(days => d_sin_env)
             and m.q_reg1 > 0 and m.env_empresa = 0
          then format('Regla 1: pide precios (%s en %s días) y su empresa no ha generado ningún envío.', m.q_reg1, d_sin_env)
        when m.creado_en <= now() - make_interval(days => d_acceso)
             and greatest(coalesce(m.last_sign_in_at, m.creado_en), m.desde) <= now() - make_interval(days => d_acceso)
          then format('Regla 2: no entra en la plataforma desde hace más de %s días.', d_acceso)
        when m.rol = 'cliente' and (m.q1 > m.max_dia or m.q7 > c_sem or m.q30 > c_mes)
          then format('Regla 3: demasiadas consultas de precio (%s hoy, %s en 7 días, %s en 30; máximo %s / %s / %s).', m.q1, m.q7, m.q30, m.max_dia, c_sem, c_mes)
        when m.rol = 'cliente' and m.env_suyos >= greatest(min_env, 1) and m.canc_suyas * 100.0 / m.env_suyos >= pct
          then format('Regla 4: ha cancelado %s de sus %s envíos (%s %%; límite %s %%).', m.canc_suyas, m.env_suyos, round(m.canc_suyas * 100.0 / m.env_suyos), pct)
        when m.rol = 'cliente' and m.canc_rec >= n_rec
          then format('Regla 5: %s cancelaciones en %s días (límite %s).', m.canc_rec, d_rec, n_rec)
        when m.rol = 'cliente' and m.max_env_dia is not null and m.env_hoy > m.max_env_dia
          then format('Regla 6: demasiados envíos creados hoy (%s; su límite es %s al día).', m.env_hoy, m.max_env_dia)
      end as motivo) r
   where r.motivo is not null;
end $function$;

-- ---- 2. El disparador: crear un envío (o salir de borrador) revisa al creador --------
create or replace function fn_envios_autosuspension()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform autosuspension_revisar(new.creado_por);
  return null;
end $$;
revoke execute on function fn_envios_autosuspension() from public, anon, authenticated;

drop trigger if exists tg_envios_autosuspension on envios;
create trigger tg_envios_autosuspension after insert on envios
  for each row when (new.creado_por is not null and new.estado <> 'borrador')
  execute function fn_envios_autosuspension();

-- Los envíos del panel nacen como borrador y se confirman con un update de estado.
drop trigger if exists tg_envios_autosuspension_confirmar on envios;
create trigger tg_envios_autosuspension_confirmar after update of estado on envios
  for each row when (old.estado = 'borrador' and new.estado <> 'borrador' and new.creado_por is not null)
  execute function fn_envios_autosuspension();

-- ---- 3. Diccionario -----------------------------------------------------------------
comment on column public.usuarios.limite_envios_diario is 'formato: número entero | rango: mayor que 0 | lista: no aplica | opcional | Tope de envíos creados al día por este usuario (regla 6 de la suspensión automática): el envío que pasa del límite se crea y la cuenta se suspende sola al momento. Vacío = sin tope (no hay parámetro general). Solo Dynamo. Ej. OK: 10 · Ej. mal: 0';
comment on function public.fn_envios_autosuspension() is '[Clientes y cuentas] Disparador interno: al crear un envío efectivo (o cuando un borrador deja de serlo) revisa al creador contra las reglas de suspensión automática (la regla 6, límite individual de envíos al día). Quién: disparador, nadie lo llama a mano. Argumentos: ninguno.';
