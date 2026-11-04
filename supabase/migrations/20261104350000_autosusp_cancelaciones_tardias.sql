-- =====================================================================================
-- SUSPENSIÓN AUTOMÁTICA: QUÉ CANCELACIONES CUENTAN (usuario, 2026-11-04)
-- Reglas 4 y 5: ya no cuenta cualquier cancelación del cliente, solo las que «hacen daño»:
--   · con CAMIÓN ASIGNADO (da igual cuándo), o
--   · SIN camión pero TARDE: después de las 9:00 del día hábil anterior a la carga (el
--     mismo corte que la penalización por cancelar).
-- Cancelar sin camión y con tiempo es gratis y no cuenta.
-- =====================================================================================

create or replace function cancelacion_cuenta(p_transportista uuid, p_cuando timestamptz, p_fecha_carga date)
returns boolean language sql stable security definer set search_path = public as $$
  select p_transportista is not null
      or (p_fecha_carga is not null and p_cuando >= corte_cancelacion(p_fecha_carga))
$$;
revoke execute on function cancelacion_cuenta(uuid, timestamptz, date) from public, anon, authenticated;

create or replace function autosuspension_motivos(p_usuario uuid default null)
returns table (usuario_id uuid, email text, motivo text)
language plpgsql stable security definer set search_path = public, auth as $$
declare
  d_sin_env int := p_num('autosusp_sin_envios_dias', 45);
  d_acceso  int := p_num('autosusp_sin_acceso_dias', 400);
  c_dia     int := p_num('autosusp_consultas_dia', 15);
  c_sem     int := p_num('autosusp_consultas_semana', 30);
  c_mes     int := p_num('autosusp_consultas_mes', 60);
  pct       numeric := p_num('autosusp_cancel_pct', 30);
  min_env   int := p_num('autosusp_cancel_min_envios', 5);
  n_rec     int := p_num('autosusp_cancel_recientes', 3);
  d_rec     int := p_num('autosusp_cancel_recientes_dias', 10);
begin
  return query
  with base as (
    select u.id, u.email, u.rol, u.cliente_id, u.creado_en,
           coalesce(u.autosusp_desde, u.creado_en) as desde,
           coalesce(u.limite_consultas_precio_diario, c_dia) as max_dia,
           au.last_sign_in_at
      from usuarios u left join auth.users au on au.id = u.id
     where u.estado = 'activa' and not u.sin_autosuspension and u.rol in ('cliente', 'transportista')
       and (p_usuario is null or u.id = p_usuario)
  ), m as (
    select b.*,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - interval '1 day'))  as q1,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - interval '7 days')) as q7,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - interval '30 days')) as q30,
      (select count(*) from consultas_precio q where q.usuario_id = b.id and q.cuando >= greatest(b.desde, now() - make_interval(days => d_sin_env))) as q_reg1,
      (select count(*) from envios e where e.cliente_id = b.cliente_id and e.estado <> 'borrador'
          and e.solicitud_estado is distinct from 'rechazada' and e.creado_en >= now() - make_interval(days => d_sin_env)) as env_empresa,
      (select count(*) from envios e where e.creado_por = b.id and e.estado <> 'borrador' and e.creado_en >= b.desde) as env_suyos,
      (select count(distinct h.envio_id) from envio_hitos h join envios e on e.id = h.envio_id
          where h.hito = 'cancelado' and h.quien = b.id and e.creado_por = b.id and e.creado_en >= b.desde
            and cancelacion_cuenta(e.transportista_id, h.cuando, coalesce(e.fecha_carga_desde, e.fecha_carga_real))) as canc_suyas,
      (select count(distinct h.envio_id) from envio_hitos h join envios e on e.id = h.envio_id
          where h.hito = 'cancelado' and h.quien = b.id and h.cuando >= greatest(b.desde, now() - make_interval(days => d_rec))
            and cancelacion_cuenta(e.transportista_id, h.cuando, coalesce(e.fecha_carga_desde, e.fecha_carga_real))) as canc_rec
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
      end as motivo) r
   where r.motivo is not null;
end $$;
