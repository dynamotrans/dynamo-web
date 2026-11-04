-- =====================================================================================
-- SUSPENSIÓN AUTOMÁTICA AL INSTANTE (pedido del usuario el 2026-11-04: «si alguien cancela
-- 234 envíos en un día o pide 3000 tarifas, ¿por qué no salta al momento?»)
--
-- Antes: una revisión cada noche. Ahora:
--   · AL MOMENTO: cada consulta de precio (regla 3) y cada cancelación (reglas 4 y 5)
--     revisan a esa persona en la misma operación. La consulta o la cancelación que pasa
--     del límite se hace, y la cuenta queda suspendida en ese mismo instante.
--   · CADA HORA (minuto 17): la revisión de todas las cuentas, para las reglas que
--     dependen de que pase el tiempo (1: pide precios y no envía; 2: no entra).
-- Revisar a una persona son unas pocas consultas con índice: no se nota.
--
-- La suspensión «al momento» ocurre dentro de la operación del propio cliente, que no
-- puede tocar su estado. Para eso, la función interna marca la transacción
-- (dynamo.autosusp = on) y los dos guardianes de `usuarios` dejan pasar SOLO ese cambio:
-- de activa a suspendida, sin tocar nada más. Lo peor que podría hacer alguien que
-- consiguiera poner esa marca es suspenderse a sí mismo.
-- =====================================================================================

-- ---- 1. Las reglas, en una función interna (para todos o para una persona) -----------
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
          where h.hito = 'cancelado' and h.quien = b.id and e.creado_por = b.id and e.creado_en >= b.desde) as canc_suyas,
      (select count(distinct h.envio_id) from envio_hitos h
          where h.hito = 'cancelado' and h.quien = b.id and h.cuando >= greatest(b.desde, now() - make_interval(days => d_rec))) as canc_rec
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
revoke execute on function autosuspension_motivos(uuid) from public, anon, authenticated;

-- La lista para Parámetros, como antes (solo Dynamo o el servidor).
create or replace function autosuspension_candidatos()
returns table (usuario_id uuid, email text, motivo text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_servidor() and not ve_todo() then return; end if;
  return query select * from autosuspension_motivos(null);
end $$;
revoke execute on function autosuspension_candidatos() from public, anon;
grant execute on function autosuspension_candidatos() to authenticated;   -- dentro: solo Dynamo

-- ---- 2. Revisar a UNA persona y suspenderla si cumple (interna) ----------------------
create or replace function autosusp_revisar(p_usuario uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m text;
begin
  if p_usuario is null then return; end if;
  if not coalesce((parametro('autosusp_activa') #>> '{}')::boolean, false) then return; end if;
  select x.motivo into m from autosuspension_motivos(p_usuario) x limit 1;
  if m is null then return; end if;
  perform set_config('dynamo.autosusp', 'on', true);
  update usuarios set estado = 'suspendida', suspendida_en = now(),
                      suspension_motivo = 'Automática (al momento) · ' || m
   where id = p_usuario and estado = 'activa';
  perform set_config('dynamo.autosusp', 'off', true);
end $$;
revoke execute on function autosusp_revisar(uuid) from public, anon, authenticated;

-- El cambio que deja pasar la marca: solo de activa a suspendida, nada más.
create or replace function autosusp_en_curso(o usuarios, n usuarios)
returns boolean language sql stable set search_path = public as $$
  select coalesce(current_setting('dynamo.autosusp', true), '') = 'on'
     and o.estado = 'activa' and n.estado = 'suspendida'
     and (n.rol, n.cliente_id, n.transportista_id, n.limite_consultas_precio_diario, n.limite_cargas_diario,
          n.sin_autosuspension, n.autosusp_desde, n.email)
         is not distinct from
         (o.rol, o.cliente_id, o.transportista_id, o.limite_consultas_precio_diario, o.limite_cargas_diario,
          o.sin_autosuspension, o.autosusp_desde, o.email)
$$;
revoke execute on function autosusp_en_curso(usuarios, usuarios) from public, anon, authenticated;

-- ---- 3. Los guardianes de `usuarios`, con esa única excepción ------------------------
create or replace function fn_usuarios_aa_autosusp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.sin_autosuspension, new.autosusp_desde, new.suspendida_en, new.suspension_motivo)
     is distinct from (old.sin_autosuspension, old.autosusp_desde, old.suspendida_en, old.suspension_motivo)
     and not es_servidor() and not es_admin() and not autosusp_en_curso(old, new) then
    raise exception 'Solo Dynamo puede cambiar la suspensión de una cuenta.' using errcode = '42501';
  end if;
  if new.estado = 'suspendida' and old.estado is distinct from 'suspendida' then
    new.suspendida_en := coalesce(new.suspendida_en, now());
    new.suspension_motivo := coalesce(new.suspension_motivo, 'Suspendida a mano por Dynamo.');
  elsif new.estado = 'activa' and old.estado = 'suspendida' then
    new.autosusp_desde := now();
    new.suspendida_en := null;
    new.suspension_motivo := null;
  end if;
  return new;
end $$;

create or replace function fn_usuarios_campos_protegidos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_yo_rol rol_usuario;
begin
  if new.rol is distinct from old.rol
     and (old.cliente_id is not null or old.transportista_id is not null)
     and new.rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then
    raise exception 'Un email de % no puede pasar a %. Hay que borrar el usuario y darlo de alta de nuevo.',
      old.rol, new.rol using errcode = '42501';
  end if;

  if es_servidor() or autosusp_en_curso(old, new) then return new; end if;
  select rol into v_yo_rol from usuarios where id = auth.uid() and estado = 'activa';

  if (new.rol, new.estado, new.cliente_id, new.transportista_id,
      new.limite_consultas_precio_diario, new.limite_cargas_diario)
     is distinct from
     (old.rol, old.estado, old.cliente_id, old.transportista_id,
      old.limite_consultas_precio_diario, old.limite_cargas_diario) then
    if v_yo_rol is null or v_yo_rol not in ('admin', 'empleado') then
      raise exception 'Solo Dynamo puede cambiar el rol, el estado o la empresa de una cuenta.'
        using errcode = '42501';
    end if;
    if new.rol is distinct from old.rol and new.id = auth.uid() then
      raise exception 'Nadie puede cambiar su propio rol.' using errcode = '42501';
    end if;
    if new.rol in ('admin', 'admin_lectura') and new.rol is distinct from old.rol and v_yo_rol <> 'admin' then
      raise exception 'Solo el Admin Master puede conceder el rol %.', new.rol using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- ---- 4. Los disparadores: consulta de precio y cancelación ---------------------------
create or replace function fn_consultas_precio_autosusp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform autosusp_revisar(new.usuario_id);
  return null;
end $$;
revoke execute on function fn_consultas_precio_autosusp() from public, anon, authenticated;
create trigger tg_consultas_precio_autosusp after insert on consultas_precio
  for each row execute function fn_consultas_precio_autosusp();

create or replace function fn_envio_hitos_autosusp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform autosusp_revisar(new.quien);
  return null;
end $$;
revoke execute on function fn_envio_hitos_autosusp() from public, anon, authenticated;
create trigger tg_envio_hitos_autosusp after insert on envio_hitos
  for each row when (new.hito = 'cancelado' and new.quien is not null)
  execute function fn_envio_hitos_autosusp();

-- ---- 5. La revisión general: cada hora en vez de cada noche --------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('dynamo-autosuspension', '17 * * * *', 'select public.autosuspender_cuentas()');
    exception when others then
      raise notice 'No se pudo cambiar el reloj de la suspensión (%): sigue el anterior.', sqlerrm;
    end;
  end if;
end $$;
