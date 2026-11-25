-- =====================================================================================
-- DESHACER EN INCIDENCIAS Y PENALIZACIONES (usuario, 2026-11-25)
-- =====================================================================================
-- «E INCLUYE: incidencias, penalizaciones — 60 segundos.» Hasta ahora el contador de «Anular el
-- cambio» solo existía en los envíos. Sus emails ya esperaban el plazo, pero la incidencia o la
-- penalización no volvía atrás. Ahora, en sus pantallas, las acciones que AVISAN a alguien abren
-- un cambio con la foto de antes y se pueden deshacer mientras corre el plazo
-- (Parámetros → emails_espera_segundos, 60 s):
--   · Incidencia: abrirla (al deshacer queda RETIRADA y no se avisa a nadie, igual que un envío
--     recién creado queda anulado) y cambiarle el estado (resolverla, retirarla, reabrirla: vuelve
--     al estado, la resolución y la fecha de antes).
--   · Penalización: cambiarle el estado (confirmarla, anularla, reabrirla: vuelve al de antes).
-- Lo ven y lo deshacen Dynamo y quien hizo el cambio. Lo que hacen solos los procesos automáticos
-- (sin persona detrás) no abre cambio. Guardar una penalización sin confirmar no avisa a nadie:
-- no lleva contador.

-- ---- 1. El registro de cambios ---------------------------------------------------------------
create table if not exists public.cambios_deshacer (
  id uuid primary key default gen_random_uuid(),
  tabla text not null check (tabla in ('incidencias', 'penalizaciones')),
  fila_id uuid not null,
  usuario_id uuid,
  tipo text not null check (tipo in ('creada', 'estado')),
  antes jsonb,
  creado_en timestamptz not null default now(),
  vence_en timestamptz not null,
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado', 'anulado')),
  anulado_en timestamptz,
  anulado_por uuid
);
create unique index if not exists ux_cambios_deshacer_abierto on public.cambios_deshacer (tabla, fila_id) where estado = 'abierto';
alter table public.cambios_deshacer enable row level security;
drop policy if exists cambios_deshacer_dynamo on public.cambios_deshacer;
create policy cambios_deshacer_dynamo on public.cambios_deshacer for select to authenticated using ((select ve_todo()));
comment on table public.cambios_deshacer is 'Cambios recientes de incidencias y penalizaciones hechos por una persona (abrir una incidencia, cambiar el estado de una incidencia o de una penalización), con la foto de antes. Mientras está abierto (los segundos de emails_espera_segundos) se puede deshacer desde su pantalla: la fila vuelve a como estaba y sus emails y avisos no salen. Es el gemelo de envio_cambios para lo que no es un envío. Solo la escriben los disparadores de incidencias y penalizaciones.';
comment on column public.cambios_deshacer.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador del cambio.';
comment on column public.cambios_deshacer.tabla is 'formato: texto | rango: no aplica | lista: incidencias · penalizaciones | obligatorio | De qué es el cambio. Ej. OK: incidencias. Ej. mal: envios (los envíos van en envio_cambios).';
comment on column public.cambios_deshacer.fila_id is 'formato: uuid | rango: no aplica | lista: no aplica | obligatorio | La incidencia o la penalización cambiada (su id).';
comment on column public.cambios_deshacer.usuario_id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Quién hizo el cambio (auth.uid()): además de Dynamo, es quien puede deshacerlo.';
comment on column public.cambios_deshacer.tipo is 'formato: texto | rango: no aplica | lista: creada · estado | obligatorio | creada = se abrió (al deshacer queda retirada); estado = se le cambió el estado (al deshacer vuelve al de antes).';
comment on column public.cambios_deshacer.antes is 'formato: JSON | rango: no aplica | lista: estado · resolucion · resuelto_en | opcional | Lo que había antes del primer cambio del plazo (vacío al crearla).';
comment on column public.cambios_deshacer.creado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo empezó el cambio.';
comment on column public.cambios_deshacer.vence_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | obligatorio | Hasta cuándo se puede deshacer: cada cambio nuevo de la misma fila lo vuelve a poner a ahora + emails_espera_segundos.';
comment on column public.cambios_deshacer.estado is 'formato: texto | rango: no aplica | lista: abierto · cerrado · anulado | obligatorio | abierto = corre el plazo; cerrado = pasó el plazo y salieron sus emails; anulado = se deshizo.';
comment on column public.cambios_deshacer.anulado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | opcional | Cuándo se deshizo.';
comment on column public.cambios_deshacer.anulado_por is 'formato: uuid | rango: no aplica | lista: no aplica | opcional | Quién lo deshizo.';

-- ---- 2. Abrir (o alargar) un cambio ---------------------------------------------------------
create or replace function public.cambio_deshacer_abrir(p_tabla text, p_fila uuid, p_tipo text, p_antes jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare c cambios_deshacer%rowtype; v_seg int := greatest(0, parametro_num('emails_espera_segundos', 60)::int); v_vence timestamptz;
begin
  if auth.uid() is null or v_seg = 0 or coalesce(current_setting('dynamo.anulando', true), '') = 'on' then return null; end if;
  v_vence := now() + make_interval(secs => v_seg);
  select * into c from cambios_deshacer where tabla = p_tabla and fila_id = p_fila and estado = 'abierto' for update;
  if found and c.vence_en > now() then
    -- Otro cambio dentro del plazo: se junta con el primero (la foto de antes no cambia) y el
    -- plazo vuelve a empezar, también para sus emails.
    update cambios_deshacer set vence_en = v_vence where id = c.id;
    update emails_enviados set enviar_desde = greatest(enviar_desde, v_vence)
     where estado = 'pendiente' and creado_en >= c.creado_en and position(p_fila::text in clave) > 0;
    return c.id;
  end if;
  if found then update cambios_deshacer set estado = 'cerrado' where id = c.id; end if;
  insert into cambios_deshacer (tabla, fila_id, usuario_id, tipo, antes, vence_en)
  values (p_tabla, p_fila, auth.uid(), p_tipo, p_antes, v_vence)
  returning id into c.id;
  return c.id;
end $$;
comment on function public.cambio_deshacer_abrir(text, uuid, text, jsonb) is '[Gestión interna] Abre el cambio de una incidencia o una penalización (o alarga el que ya corre) con la foto de antes, para poder deshacerlo durante emails_espera_segundos. Quién: solo los disparadores de incidencias y penalizaciones, cuando hay una persona detrás. No hace nada con el plazo a 0 ni mientras se está deshaciendo otro cambio.';
revoke all on function public.cambio_deshacer_abrir(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.cambio_deshacer_abrir(text, uuid, text, jsonb) to service_role;

create or replace function public.fn_incidencias_deshacer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform cambio_deshacer_abrir('incidencias', new.id, 'creada', null);
  elsif new.estado is distinct from old.estado then
    perform cambio_deshacer_abrir('incidencias', new.id, 'estado',
      jsonb_build_object('estado', old.estado, 'resolucion', old.resolucion, 'resuelto_en', old.resuelto_en));
  end if;
  return null;
end $$;
drop trigger if exists tg_incidencias_deshacer on public.incidencias;
create trigger tg_incidencias_deshacer after insert or update of estado on public.incidencias
  for each row execute function public.fn_incidencias_deshacer();

create or replace function public.fn_penalizaciones_deshacer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado is distinct from old.estado then
    perform cambio_deshacer_abrir('penalizaciones', new.id, 'estado', jsonb_build_object('estado', old.estado));
  end if;
  return null;
end $$;
drop trigger if exists tg_penalizaciones_deshacer on public.penalizaciones;
create trigger tg_penalizaciones_deshacer after update of estado on public.penalizaciones
  for each row execute function public.fn_penalizaciones_deshacer();
revoke all on function public.fn_incidencias_deshacer() from public, anon, authenticated;
revoke all on function public.fn_penalizaciones_deshacer() from public, anon, authenticated;

-- ---- 3. Lo que está corriendo (para pintar el contador) ----------------------------------------
create or replace function public.cambios_deshacer_pendientes(p_tabla text)
returns table(fila_id uuid, vence_en timestamptz, tipo text, autor text, puede_anular boolean, emails integer)
language sql stable security definer set search_path = public as $$
  select c.fila_id, c.vence_en, c.tipo,
         (select coalesce(nullif(u.nombre, ''), u.email) from usuarios u where u.id = c.usuario_id),
         true,
         (select count(*)::int from emails_enviados x
           where x.estado = 'pendiente' and x.creado_en >= c.creado_en and position(c.fila_id::text in x.clave) > 0)
    from cambios_deshacer c
   where c.tabla = p_tabla and c.estado = 'abierto' and c.vence_en > now()
     and auth.uid() is not null
     and ((select ve_todo()) or c.usuario_id = auth.uid())
   order by c.vence_en desc
   limit 100
$$;
comment on function public.cambios_deshacer_pendientes(text) is '[Gestión interna] Los cambios de incidencias o de penalizaciones que todavía se pueden deshacer (corre su plazo), con cuándo vencen y cuántos emails esperan. Quién: Dynamo los ve todos; el resto, solo los suyos. Para pintar el contador en la lista.';
revoke all on function public.cambios_deshacer_pendientes(text) from public, anon;
grant execute on function public.cambios_deshacer_pendientes(text) to authenticated, service_role;

-- ---- 4. Deshacer ---------------------------------------------------------------------------
create or replace function public.deshacer_cambio(p_tabla text, p_fila uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c cambios_deshacer%rowtype; i incidencias%rowtype; p penalizaciones%rowtype;
begin
  if auth.uid() is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  if p_tabla is null or p_tabla not in ('incidencias', 'penalizaciones') then return jsonb_build_object('resultado', 'nada'); end if;
  select * into c from cambios_deshacer where tabla = p_tabla and fila_id = p_fila and estado = 'abierto' for update;
  if not found then return jsonb_build_object('resultado', 'nada'); end if;
  if not (ve_todo() or c.usuario_id = auth.uid()) then
    raise exception 'Este cambio solo lo puede deshacer quien lo hizo o Dynamo.' using errcode = '42501';
  end if;
  -- Unos segundos de margen por lo que tarda en llegar la pulsación.
  if c.vence_en < now() - interval '3 seconds'
     or exists (select 1 from emails_enviados x where x.estado = 'enviado' and x.creado_en >= c.creado_en and position(p_fila::text in x.clave) > 0) then
    return jsonb_build_object('resultado', 'ya_salio');
  end if;
  perform set_config('dynamo.anulando', 'on', true);
  begin
    if p_tabla = 'incidencias' then
      if c.tipo = 'creada' then
        update incidencias set estado = 'cancelado' where id = p_fila and estado <> 'cancelado';
      else
        update incidencias set estado = (c.antes ->> 'estado')::estado_incidencia, resolucion = c.antes ->> 'resolucion'
         where id = p_fila;
        -- La fecha de resolución de antes (el disparador pone la de ahora al volver a «resuelto»).
        update incidencias set resuelto_en = (c.antes ->> 'resuelto_en')::timestamptz
         where id = p_fila and estado = 'resuelto' and c.antes ->> 'resuelto_en' is not null;
      end if;
      select * into i from incidencias where id = p_fila;
    else
      update penalizaciones set estado = (c.antes ->> 'estado')::estado_penalizacion where id = p_fila;
      select * into p from penalizaciones where id = p_fila;
    end if;
  exception when others then
    perform set_config('dynamo.anulando', '', true);
    return jsonb_build_object('resultado', 'no_se_puede', 'error', sqlerrm);
  end;
  -- Lo que provocó el cambio (y lo que acaba de provocar volver atrás) no sale.
  update emails_enviados set estado = 'omitido', error = 'Cambio deshecho antes de salir: no se manda.'
   where estado = 'pendiente' and creado_en >= c.creado_en and position(p_fila::text in clave) > 0;
  if p_tabla = 'incidencias' then
    delete from avisos a
     where a.creado_en >= c.creado_en and a.enlace = '/panel/incidencias'
       and a.tipo in ('incidencia', 'siniestro', 'incidencia_resuelta')
       and a.envio_id is not distinct from i.envio_id
       and (position(i.codigo in a.titulo) > 0 or position(i.titulo in coalesce(a.texto, '')) > 0);
  else
    delete from avisos a
     where a.creado_en >= c.creado_en and a.enlace = '/panel/penalizaciones' and a.tipo = 'penalizacion'
       and a.envio_id is not distinct from p.envio_id;
  end if;
  update cambios_deshacer set estado = 'anulado', anulado_en = now(), anulado_por = auth.uid() where id = c.id;
  perform set_config('dynamo.anulando', '', true);
  return jsonb_build_object('resultado', 'deshecho', 'tipo', c.tipo);
end $$;
comment on function public.deshacer_cambio(text, uuid) is '[Gestión interna] Deshace el último cambio de una incidencia o una penalización mientras corre su plazo: la incidencia recién abierta queda retirada; un cambio de estado vuelve al de antes; y los emails y avisos de ese cambio no salen. Quién: quien hizo el cambio o Dynamo. Devuelve deshecho, ya_salio (se pasó el plazo), nada o no_se_puede.';
revoke all on function public.deshacer_cambio(text, uuid) from public, anon;
grant execute on function public.deshacer_cambio(text, uuid) to authenticated, service_role;

-- ---- 5. La limpieza, con la de los envíos ----------------------------------------------------
do $$ declare v text; v_ancla text := 'delete from envio_cambios where estado <> ''abierto'' and creado_en < now() - interval ''7 days'';';
begin
  v := pg_get_functiondef('public.enviar_emails_pendientes()'::regprocedure);
  if position(v_ancla in v) = 0 then raise exception 'enviar_emails_pendientes ya no limpia envio_cambios como antes: revisar esta migración'; end if;
  if position('cambios_deshacer' in v) = 0 then
    execute replace(v, v_ancla, v_ancla || E'\n  update cambios_deshacer set estado = ''cerrado'' where estado = ''abierto'' and vence_en < now() - interval ''1 minute'';'
      || E'\n  delete from cambios_deshacer where estado <> ''abierto'' and creado_en < now() - interval ''7 days'';');
  end if;
end $$;
