-- =====================================================================================
-- REGLA 4 ESTRICTA + EMAIL AL ADMIN CUANDO EL SISTEMA SUSPENDE (usuario, 2026-11-14)
-- =====================================================================================
-- (1) La regla 4 suspendía AL LLEGAR al límite de cancelaciones (1 de 5 = 20 % con
-- límite 20 %): el límite es lo permitido — ahora suspende solo al SUPERARLO (>).
-- (2) Cada vez que el sistema suspende una cuenta (al momento o en el barrido), se
-- encola un email al buzón de Dynamo (parámetro dynamo_email) para estar al tanto.

-- ---- 1. Regla 4: estrictamente por encima del límite ---------------------------------
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
        when m.rol = 'cliente' and m.env_suyos >= greatest(min_env, 1) and m.canc_suyas * 100.0 / m.env_suyos > pct
          then format('Regla 4: ha cancelado %s de sus %s envíos (%s %%; límite %s %%).', m.canc_suyas, m.env_suyos, round(m.canc_suyas * 100.0 / m.env_suyos), pct)
        when m.rol = 'cliente' and m.canc_rec >= n_rec
          then format('Regla 5: %s cancelaciones en %s días (límite %s).', m.canc_rec, d_rec, n_rec)
        when m.rol = 'cliente' and m.max_env_dia is not null and m.env_hoy > m.max_env_dia
          then format('Regla 6: demasiados envíos creados hoy (%s; su límite es %s al día).', m.env_hoy, m.max_env_dia)
      end as motivo) r
   where r.motivo is not null;
end $function$;
comment on function public.autosuspension_motivos(uuid) is '[Clientes y cuentas] Devuelve los usuarios activos (no exentos) que cumplen algún motivo de suspensión automática, con su regla: 1 consultas sin envíos de la empresa, 2 sin entrar, 3 demasiadas consultas, 4 porcentaje de cancelaciones con coste ESTRICTAMENTE por encima del límite (a partir del mínimo de envíos; quedarse en el límite no suspende), 5 cancelaciones recientes, 6 tope individual de envíos al día. Quién: funciones internas de la suspensión automática. Argumentos: p_usuario: usuarios.id, opcional (solo ese usuario).';

-- ---- 2. El registro admite el aviso interno de suspensión ----------------------------
alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'aviso_entrega', 'aviso_parada', 'aviso_parada_cancelada',
                  'cuenta_suspendida'));
comment on column public.emails_enviados.tipo is 'formato: texto | rango: no aplica | lista: matriculas · vispera · orden_carga · firma_cmr · cmr_completo · difusion · difusion_fin · aviso_entrega · aviso_parada · aviso_parada_cancelada · cuenta_suspendida | obligatorio | Qué aviso es. Ej. OK: matriculas';

-- ---- 3. Email al buzón de Dynamo en cada suspensión automática -----------------------
create or replace function public.fn_usuarios_aviso_suspension()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text := parametro('dynamo_email') #>> '{}';
begin
  -- El buzón sale SOLO del parámetro (regla de la casa: nada escrito a mano).
  if v_email is null or v_email = '' then return null; end if;
  insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
  values ('cuenta_suspendida:' || new.id || ':' || extract(epoch from coalesce(new.suspendida_en, now()))::bigint,
          'cuenta_suspendida',
          v_email,
          format('Cuenta suspendida automáticamente: %s · Dynamo', new.email),
          format('<p>El sistema ha <strong>suspendido</strong> la cuenta <strong>%s</strong>%s.</p>'
                 || '<p><strong>Motivo:</strong> %s</p>'
                 || '<p>Si es un cliente legítimo, se reactiva desde el panel (Usuarios, estado «Activa»): el contador de las reglas vuelve a empezar.</p>',
                 escapar_html(new.email),
                 coalesce((select ' de <strong>' || escapar_html(c.razon_social) || '</strong>' from clientes c where c.id = new.cliente_id), ''),
                 escapar_html(coalesce(new.suspension_motivo, ''))))
  on conflict (clave) do nothing;
  return null;
end $$;
revoke execute on function public.fn_usuarios_aviso_suspension() from public, anon, authenticated;
comment on function public.fn_usuarios_aviso_suspension() is '[Clientes y cuentas] Disparador interno: cuando una cuenta activa pasa a suspendida por la suspensión AUTOMÁTICA (motivo «Automática…»), encola un email al buzón de Dynamo (parámetro dynamo_email) con el usuario, su empresa y el motivo, para que el equipo esté al tanto. Una vez por suspensión (clave única). Quién: disparador, nadie lo llama a mano. Argumentos: ninguno.';
drop trigger if exists tg_usuarios_aviso_suspension on usuarios;
create trigger tg_usuarios_aviso_suspension after update of estado on usuarios
  for each row when (old.estado = 'activa' and new.estado = 'suspendida' and new.suspension_motivo like 'Automática%')
  execute function fn_usuarios_aviso_suspension();
