-- =====================================================================================
-- CANCELAR «EN NOMBRE DEL CLIENTE» (usuario, 2026-11-04)
-- Si Dynamo cancela un envío estando en la VISTA DEL CLIENTE («Ver como»), es como si el
-- cliente hubiera llamado para cancelarlo: cuenta para su suspensión automática (reglas 4
-- y 5), a nombre de quien creó el envío. Si cancela desde la gestión interna, es cosa de
-- Dynamo (un error, por ejemplo) y no cuenta.
-- =====================================================================================

alter table envios add column cancelado_en_nombre_cliente boolean not null default false;
comment on column envios.cancelado_en_nombre_cliente is
  'Dynamo lo canceló desde la vista del cliente (a petición suya): cuenta como cancelación del cliente.';

-- Deshacer la cancelación lo limpia.
create or replace function fn_envios_cancelado_en_nombre()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'cancelado' and new.estado <> 'cancelado' then new.cancelado_en_nombre_cliente := false; end if;
  if new.cancelado_en_nombre_cliente and not old.cancelado_en_nombre_cliente and not es_admin() and not es_servidor() then
    raise exception 'Solo Dynamo marca una cancelación en nombre del cliente.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function fn_envios_cancelado_en_nombre() from public, anon, authenticated;
create trigger tg_envios_cancelado_en_nombre before update on envios
  for each row execute function fn_envios_cancelado_en_nombre();

drop function if exists cancelar_envio(uuid, text);
create or replace function cancelar_envio(p_envio uuid, p_motivo text default null, p_en_nombre_cliente boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_estado estado_envio; v_pen numeric; v_creador uuid;
begin
  if not es_admin() then
    raise exception 'Solo Dynamo puede cancelar un envío desde la ficha.' using errcode = '42501';
  end if;
  select estado, creado_por into v_estado, v_creador from envios where id = p_envio for update;
  if v_estado is null then raise exception 'Ese envío no existe.'; end if;
  if v_estado = 'cancelado' then raise exception 'El envío ya está cancelado.'; end if;
  update envios set estado = 'cancelado', cancelado_en_nombre_cliente = coalesce(p_en_nombre_cliente, false) where id = p_envio;
  if nullif(trim(p_motivo), '') is not null then
    perform registrar_hito(p_envio, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', left(trim(p_motivo), 500),
                         'por', case when p_en_nombre_cliente then 'cliente (por teléfono, cancelado por Dynamo)' else 'dynamo' end));
  end if;
  -- En nombre del cliente: se revisa su suspensión automática al momento, como si cancelara él.
  if p_en_nombre_cliente and v_creador is not null then perform autosusp_revisar(v_creador); end if;
  select importe_cliente into v_pen from penalizaciones
   where envio_id = p_envio and generada_auto and estado = 'pendiente_confirmar'
   order by creado_en desc limit 1;
  return jsonb_build_object('penalizacion', v_pen is not null, 'importe', v_pen);
end $$;
revoke execute on function cancelar_envio(uuid, text, boolean) from public, anon;
grant execute on function cancelar_envio(uuid, text, boolean) to authenticated;   -- dentro: solo Dynamo

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
          where h.hito = 'cancelado' and (h.quien = b.id or e.cancelado_en_nombre_cliente) and e.creado_por = b.id and e.creado_en >= b.desde
            and cancelacion_cuenta(e.transportista_id, h.cuando, coalesce(e.fecha_carga_desde, e.fecha_carga_real))) as canc_suyas,
      (select count(distinct h.envio_id) from envio_hitos h join envios e on e.id = h.envio_id
          where h.hito = 'cancelado' and (h.quien = b.id or (e.cancelado_en_nombre_cliente and e.creado_por = b.id))
            and h.cuando >= greatest(b.desde, now() - make_interval(days => d_rec))
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
