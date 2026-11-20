-- ---- Transportistas que nos dejan tirados: contador y suspensión automática (usuario, 2026-11-20) --
-- «¿Existen filtros de cancelación de transportista que nos deja tirados? Deberíamos poner
-- límites igual que a clientes… y autosuspenderles el poder aceptar ofertas y cargas online,
-- y contador… y si manualmente asigno este transportista, me salta aviso de su estado».
--   · Al quitar o cambiar un transportista, Dynamo dice el motivo: «nos deja tirados» queda
--     anotado (transportista_cancelaciones) con las horas que faltaban para cargar.
--   · Reglas (Parámetros; usuario: «porcentaje sobre el total, con un mínimo de 5 para
--     calcular… y otra de las últimas 5: 2 cancelaciones de sus últimas 5 no se permite aunque
--     lleve 100 cargas»): una cancelación a menos de X horas de cargar · X cancelaciones entre
--     sus últimas N cargas (con al menos N) · más del X % de todas sus cargas (con al menos X
--     cargas) → pasa solo a «Suspendido · no ofertar ni cargar» y llega un email a Dynamo con «Revisar transportista». Suspendido no recibe
--     ofertas ni puede aceptar cargas por enlace o tablón (ya lo impedían su estado y el disparador).
--   · Dynamo puede asignarlo a mano igualmente, confirmándolo (p_forzar) tras ver el aviso rojo.
--   · Al reactivarlo a mano, el contador vuelve a empezar.

insert into parametros (clave, valor, descripcion) values
  ('transportista_autosuspension', 'true', 'Si está encendido, un transportista que cancela cargas por encima de los límites pasa solo a «Suspendido · no ofertar ni cargar» y se avisa a Dynamo.'),
  ('transportista_cancelacion_horas_urgente', '24', 'Una sola cancelación del transportista a menos de estas horas de la carga basta para suspenderlo.'),
  ('transportista_ultimas_cargas', '5', 'Cuántas de sus últimas cargas se miran para la regla de «últimas cargas» (solo se aplica si ya lleva al menos esas).'),
  ('transportista_ultimas_max_cancelaciones', '2', 'Cancelaciones entre sus últimas cargas con las que queda suspendido (por ejemplo, 2 de las últimas 5), aunque su porcentaje total sea bajo.'),
  ('transportista_cancelaciones_max_pct', '20', 'Porcentaje de cancelaciones sobre el total de sus cargas por encima del cual queda suspendido.'),
  ('transportista_cancelaciones_min_cargas', '5', 'Cargas mínimas para calcular el porcentaje (con menos, no se aplica: que la primera vez que cancela no cuente como un 100 %).')
on conflict (clave) do nothing;

alter table transportistas
  add column if not exists suspension_motivo text,
  add column if not exists suspendido_en timestamptz,
  add column if not exists cancelaciones_desde timestamptz;
comment on column transportistas.suspension_motivo is 'formato: texto | rango: hasta 300 caracteres | lista: no aplica | opcional | SOLO DYNAMO. Por qué quedó suspendido automáticamente (la regla que saltó). Se borra al reactivarlo. Ej. OK: Automática · canceló a 6 h de la carga (límite 24 h)';
comment on column transportistas.suspendido_en is 'formato: fecha y hora (con zona) | rango: no aplica | lista: no aplica | opcional | SOLO DYNAMO. Cuándo quedó suspendido automáticamente por cancelar cargas. Se borra al reactivarlo. Ej. OK: 2026-11-20 10:05+01';
comment on column transportistas.cancelaciones_desde is 'formato: fecha y hora (con zona) | rango: no aplica | lista: no aplica | opcional | SOLO DYNAMO. Desde cuándo cuentan sus cancelaciones para las reglas: se pone al reactivarlo a mano tras una suspensión (el contador vuelve a empezar). Ej. OK: 2026-11-20 10:05+01';

create table if not exists transportista_cancelaciones (
  id uuid primary key default gen_random_uuid(),
  transportista_id uuid not null references transportistas(id) on delete cascade,
  envio_id uuid references envios(id) on delete set null,
  horas_antes numeric(8,1),
  creado_en timestamptz not null default now(),
  creado_por uuid default auth.uid()
);
create index if not exists ix_transportista_cancelaciones_t on transportista_cancelaciones (transportista_id, creado_en);
create index if not exists ix_transportista_cancelaciones_envio on transportista_cancelaciones (envio_id);
alter table transportista_cancelaciones enable row level security;
drop policy if exists transportista_cancelaciones_ver on transportista_cancelaciones;
create policy transportista_cancelaciones_ver on transportista_cancelaciones for select to authenticated using (ve_todo());
revoke all on transportista_cancelaciones from anon;
comment on table transportista_cancelaciones is 'Cada vez que un transportista nos deja tirados (Dynamo lo quita o lo cambia con el motivo «nos deja tirados»): de qué envío y cuántas horas faltaban para cargar. Cuenta para las reglas de suspensión automática. Solo Dynamo lo ve.';
comment on column transportista_cancelaciones.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador. Ej. OK: 0b6f…';
comment on column transportista_cancelaciones.transportista_id is 'formato: uuid | rango: no aplica | lista: no aplica | obligatorio | El transportista que canceló (transportistas.id). Ej. OK: 0b6f…';
comment on column transportista_cancelaciones.envio_id is 'formato: uuid | rango: no aplica | lista: no aplica | opcional | El envío que dejó tirado (envios.id). Ej. OK: 0b6f…';
comment on column transportista_cancelaciones.horas_antes is 'formato: número con 1 decimal | rango: negativo si ya debía haber cargado | lista: no aplica | opcional | Horas que faltaban para el día de carga (00:00 hora de Madrid) cuando canceló. Ej. OK: 18.5';
comment on column transportista_cancelaciones.creado_en is 'formato: fecha y hora (con zona) | rango: no aplica | lista: no aplica | automático | Cuándo se anotó. Ej. OK: 2026-11-20 10:05+01';
comment on column transportista_cancelaciones.creado_por is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Quién de Dynamo lo anotó (usuarios.id). Ej. OK: 0b6f…';

-- El email nuevo a Dynamo.
do $$ declare v_def text; v_com text; begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'emails_enviados_tipo_check' and conrelid = 'public.emails_enviados'::regclass;
  if position('''transportista_suspendido''' in v_def) = 0 then
    v_def := replace(v_def, '''cuenta_suspendida''::text', '''cuenta_suspendida''::text, ''transportista_suspendido''::text');
    if position('''transportista_suspendido''' in v_def) = 0 then raise exception 'No se ha podido añadir transportista_suspendido'; end if;
    alter table public.emails_enviados drop constraint emails_enviados_tipo_check;
    execute 'alter table public.emails_enviados add constraint emails_enviados_tipo_check ' || v_def;
  end if;
  v_com := col_description('emails_enviados'::regclass, (select attnum from pg_attribute where attrelid = 'emails_enviados'::regclass and attname = 'tipo'));
  if position('transportista_suspendido' in v_com) = 0 then
    v_com := replace(v_com, ' · cuenta_suspendida · ', ' · cuenta_suspendida · transportista_suspendido (a Dynamo, cuando un transportista queda suspendido por cancelar cargas) · ');
    execute format('comment on column emails_enviados.tipo is %L', v_com);
  end if;
end $$;

-- Al reactivarlo a mano: el contador vuelve a empezar y se borra el motivo.
create or replace function fn_transportistas_reactivar()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.estado_operativo = 'suspendido' and new.estado_operativo <> 'suspendido' then
    new.cancelaciones_desde := now(); new.suspension_motivo := null; new.suspendido_en := null;
  end if;
  return new;
end $$;
drop trigger if exists tg_transportistas_reactivar on transportistas;
create trigger tg_transportistas_reactivar before update of estado_operativo on transportistas for each row execute function fn_transportistas_reactivar();

-- Cuenta y, si toca, suspende.
create or replace function transportista_revisar_cancelaciones(p_transportista uuid, p_horas numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; v_desde timestamptz; v_n int; v_tot int; v_ult int; v_motivo text; v_email text := parametro('dynamo_email') #>> '{}';
  v_h int := parametro_num('transportista_cancelacion_horas_urgente', 24)::int;
  v_ventana int := greatest(1, parametro_num('transportista_ultimas_cargas', 5)::int);
  v_max_ult int := parametro_num('transportista_ultimas_max_cancelaciones', 2)::int;
  v_pct numeric := parametro_num('transportista_cancelaciones_max_pct', 20);
  v_min int := parametro_num('transportista_cancelaciones_min_cargas', 5)::int;
begin
  select * into t from transportistas where id = p_transportista;
  if t.id is null then return jsonb_build_object('ok', false); end if;
  -- Desde que se le reactivó por última vez (o desde siempre).
  v_desde := coalesce(t.cancelaciones_desde, '-infinity'::timestamptz);
  -- Sus cargas, en orden: las que tiene asignadas y las que nos canceló.
  with ev as (
    select e.asignado_en as cuando, false as cancelada from envios e
     where e.transportista_id = p_transportista and e.asignado_en > v_desde and e.estado <> 'cancelado'
    union all
    select c.creado_en, true from transportista_cancelaciones c where c.transportista_id = p_transportista and c.creado_en > v_desde)
  select count(*) filter (where cancelada), count(*),
         (select count(*) filter (where u.cancelada) from (select cancelada from ev order by cuando desc limit v_ventana) u)
    into v_n, v_tot, v_ult from ev;
  v_motivo := case
    when p_horas is not null and p_horas < v_h then format('canceló a %s h de la carga (límite %s h)', round(greatest(p_horas, 0))::int, v_h)
    when v_tot >= v_ventana and v_ult >= v_max_ult then format('%s cancelaciones en sus últimas %s cargas (límite %s)', v_ult, v_ventana, v_max_ult)
    when v_tot >= v_min and v_n * 100.0 / v_tot > v_pct then format('canceló %s de sus %s cargas (%s %%; límite %s %%)', v_n, v_tot, round(v_n * 100.0 / v_tot), v_pct)
  end;
  if v_motivo is not null and coalesce((parametro('transportista_autosuspension') #>> '{}')::boolean, true) and t.estado_operativo <> 'suspendido' then
    update transportistas set estado_operativo = 'suspendido', suspension_motivo = 'Automática · ' || v_motivo, suspendido_en = now() where id = p_transportista;
    if coalesce(v_email, '') <> '' then
      insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
      values ('transportista_suspendido:' || p_transportista || ':' || extract(epoch from now())::bigint, 'transportista_suspendido', v_email,
        format('Transportista suspendido automáticamente: %s · Dynamo', t.nombre_visible),
        format('<p>El sistema ha <strong>suspendido</strong> al transportista <strong>%s</strong> (%s): ya no recibe ofertas ni puede aceptar cargas.</p>'
            || '<p><strong>Motivo:</strong> %s.</p>'
            || '<p>Lleva <strong>%s cancelaciones</strong> de %s cargas (%s en sus últimas %s). Puedes asignarle envíos a mano igualmente (te saldrá el aviso) o reactivarlo desde su ficha: el contador vuelve a empezar.</p>'
            || '<p><a href="%s/panel/transportistas?ver=%s" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">Revisar transportista</a></p>',
          escapar_html(t.nombre_visible), escapar_html(coalesce(t.cif, '')), escapar_html(v_motivo), v_n, v_tot, v_ult, least(v_ventana, v_tot),
          coalesce(parametro('url_plataforma') #>> '{}', ''), p_transportista))
      on conflict (clave) do nothing;
    end if;
    return jsonb_build_object('ok', true, 'suspendido', true, 'motivo', v_motivo, 'cancelaciones', v_n, 'cargas', v_tot, 'cancelaciones_ultimas', v_ult);
  end if;
  return jsonb_build_object('ok', true, 'suspendido', false, 'cancelaciones', v_n, 'cargas', v_tot, 'cancelaciones_ultimas', v_ult);
end $$;
revoke all on function transportista_revisar_cancelaciones(uuid, numeric) from public, anon, authenticated;
grant execute on function transportista_revisar_cancelaciones(uuid, numeric) to service_role;
comment on function transportista_revisar_cancelaciones(uuid, numeric) is '[Gestión interna] Cuenta las cancelaciones de un transportista (desde su última reactivación) y, si pasa los límites de Parámetros (una a menos de X horas de cargar; X entre sus últimas N cargas; más del X % de todas, con un mínimo de cargas), lo suspende y avisa a Dynamo. Devuelve {ok, suspendido, motivo, cancelaciones, cargas, cancelaciones_ultimas}. Quién: registrar_cancelacion_transportista. Argumentos: p_transportista: transportistas.id · p_horas: horas que faltaban para cargar en la última cancelación.';

create or replace function registrar_cancelacion_transportista(p_envio uuid, p_transportista uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_carga date; v_h numeric;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo anota las cancelaciones de transportistas.' using errcode = '42501'; end if;
  if p_transportista is null or not exists (select 1 from transportistas where id = p_transportista) then
    return jsonb_build_object('ok', false, 'resultado', 'transportista_no_existe'); end if;
  select coalesce(fecha_carga_real, fecha_carga_prevista, fecha_carga_desde) into v_carga from envios where id = p_envio;
  v_h := case when v_carga is null then null
              else round((extract(epoch from ((v_carga::timestamp at time zone 'Europe/Madrid') - now())) / 3600.0)::numeric, 1) end;
  insert into transportista_cancelaciones (transportista_id, envio_id, horas_antes) values (p_transportista, p_envio, v_h);
  return transportista_revisar_cancelaciones(p_transportista, v_h);
end $$;
revoke all on function registrar_cancelacion_transportista(uuid, uuid) from public, anon;
grant execute on function registrar_cancelacion_transportista(uuid, uuid) to authenticated, service_role;
comment on function registrar_cancelacion_transportista(uuid, uuid) is '[Transportistas] Anota que un transportista nos ha dejado tirados en un envío (con las horas que faltaban para cargar) y aplica las reglas de suspensión automática. Devuelve {ok, suspendido, motivo, cancelaciones, cargas, cancelaciones_ultimas}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_transportista: transportistas.id.';

create or replace function cancelaciones_transportistas(p_ids uuid[])
returns table (transportista_id uuid, cancelaciones int, cargas int, cancelaciones_ultimas int, ultimas int, ultima timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, x.n::int, x.tot::int, x.ult::int, least(x.tot, greatest(1, parametro_num('transportista_ultimas_cargas', 5)::int))::int,
         (select max(c.creado_en) from transportista_cancelaciones c where c.transportista_id = t.id)
    from transportistas t
    cross join lateral (
      with ev as (
        select e.asignado_en as cuando, false as cancelada from envios e
         where e.transportista_id = t.id and e.asignado_en > coalesce(t.cancelaciones_desde, '-infinity') and e.estado <> 'cancelado'
        union all
        select c.creado_en, true from transportista_cancelaciones c where c.transportista_id = t.id and c.creado_en > coalesce(t.cancelaciones_desde, '-infinity'))
      select count(*) filter (where cancelada) as n, count(*) as tot,
             (select count(*) filter (where u.cancelada) from (select cancelada from ev order by cuando desc limit greatest(1, parametro_num('transportista_ultimas_cargas', 5)::int)) u) as ult
        from ev) x
   where t.id = any (p_ids) and cardinality(p_ids) <= 200 and ve_todo()
$$;
revoke all on function cancelaciones_transportistas(uuid[]) from public, anon;
grant execute on function cancelaciones_transportistas(uuid[]) to authenticated, service_role;
comment on function cancelaciones_transportistas(uuid[]) is '[Transportistas] Para la ficha del transportista (máx. 200 ids), desde su última reactivación: cuántas veces nos ha dejado tirados, de cuántas cargas, cuántas entre sus últimas cargas (y cuántas se miran) y la última vez. Quién: Dynamo. Argumentos: p_ids: transportistas.id.';

-- Quitar el transportista con su motivo.
drop function if exists quitar_transportista(uuid);
create or replace function quitar_transportista(p_envio uuid, p_motivo text default null)
returns jsonb language plpgsql set search_path = public as $$
declare n int; v_t uuid; r jsonb;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo asigna transportistas.' using errcode = '42501'; end if;
  select transportista_id into v_t from envios where id = p_envio;
  update envios set transportista_id = null where id = p_envio and transportista_id is not null;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'resultado', case when exists (select 1 from envios where id = p_envio) then 'sin_transportista' else 'no_existe' end); end if;
  if p_motivo = 'deja_tirado' then
    r := registrar_cancelacion_transportista(p_envio, v_t);
    return jsonb_build_object('ok', true, 'resultado', 'quitado') || coalesce(r - 'ok', '{}'::jsonb);
  end if;
  return jsonb_build_object('ok', true, 'resultado', 'quitado');
end $$;
revoke all on function quitar_transportista(uuid, text) from public, anon;
grant execute on function quitar_transportista(uuid, text) to authenticated, service_role;
comment on function quitar_transportista(uuid, text) is '[Envíos] Quita el transportista de un envío: se borran también su camión, conductor, NIMA y precio, y el envío vuelve a ofertado o sin asignar. Con p_motivo «deja_tirado» se anota como cancelación suya y se aplican las reglas de suspensión. Devuelve {ok, resultado: quitado | no_existe | sin_transportista, suspendido, motivo, cancelaciones…}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_motivo: deja_tirado | cambio_dynamo (opcional).';

-- Asignar a mano uno suspendido: solo confirmándolo.
do $$ declare v text; n text; c text := obj_description('public.asignar_transportista'::regproc); begin
  if exists (select 1 from pg_proc where proname = 'asignar_transportista' and pg_get_function_identity_arguments(oid) like '%p_forzar%') then
    v := null;   -- ya aplicada
  else
  v := pg_get_functiondef('public.asignar_transportista'::regproc);
  n := replace(v, 'p_fecha_entrega_estimada date DEFAULT NULL::date)', 'p_fecha_entrega_estimada date DEFAULT NULL::date, p_forzar boolean DEFAULT false)');
  n := replace(n, $a$  if v_t.estado_operativo = 'suspendido' then return jsonb_build_object('ok', false, 'resultado', 'transportista_suspendido'); end if;$a$,
    $a$  if v_t.estado_operativo = 'suspendido' and not coalesce(p_forzar, false) then return jsonb_build_object('ok', false, 'resultado', 'transportista_suspendido'); end if;
  -- Dynamo lo asigna a mano igualmente, tras ver el aviso (usuario, 2026-11-20).
  if v_t.estado_operativo = 'suspendido' then perform set_config('dynamo.asignar_suspendido', 'on', true); end if;$a$);
  if n = v or position('p_forzar' in n) = 0 or position('asignar_suspendido' in n) = 0 then raise exception 'asignar_transportista: no encuentro dónde cambiar'; end if;
  drop function public.asignar_transportista(uuid, uuid, numeric, text, text, text, text, date, date);
  execute n;
  revoke all on function public.asignar_transportista(uuid, uuid, numeric, text, text, text, text, date, date, boolean) from public, anon;
  grant execute on function public.asignar_transportista(uuid, uuid, numeric, text, text, text, text, date, date, boolean) to authenticated, service_role;
  execute format('comment on function public.asignar_transportista(uuid, uuid, numeric, text, text, text, text, date, date, boolean) is %L',
    replace(c, 'No deja uno suspendido.', 'Uno suspendido solo con p_forzar (Dynamo lo confirma tras ver el aviso).') || ' · p_forzar: true para asignar a uno suspendido.');
  end if;

  v := pg_get_functiondef('public.fn_envios_ac_asignacion'::regproc);
  n := replace(v, $a$if t.estado_operativo = 'suspendido' and not es_consola_supabase() then$a$,
    $a$if t.estado_operativo = 'suspendido' and not es_consola_supabase() and coalesce(current_setting('dynamo.asignar_suspendido', true), '') <> 'on' then$a$);
  -- Ya aplicada: no se repite.
  if n <> v then execute n; elsif position('asignar_suspendido' in v) = 0 then raise exception 'fn_envios_ac_asignacion: no encuentro la regla del suspendido'; end if;
end $$;
