-- =====================================================================================
-- REVISIÓN DEL PRECIO DE LOS ENVÍOS PROGRAMADOS CON MUCHA ANTELACIÓN (usuario, 2026-11-05)
-- «Un precio puesto 200 días antes no tiene sentido; actualizarlo cada día tampoco.» Lo
-- acordado (todo con parámetros):
--   · Antelación máxima para programar (`envio_antelacion_max_dias`, 120). Dynamo sin límite.
--   · Precio CERRADO si al confirmar faltan `precio_cerrado_dias` (7) días o menos: no cambia.
--   · Si faltan más, precio PROVISIONAL: una sola revisión `precio_revision_dias_habiles`
--     (3) días hábiles antes de la carga:
--       - se mueve menos de `precio_revision_margen_pct` (5 %): se queda el de antes;
--       - baja: se aplica solo;
--       - sube: el cliente acepta o cancela SIN COSTE (no cuenta para su suspensión); si no
--         contesta en `precio_revision_respuesta_horas` (24), aviso urgente a Dynamo.
--     Hasta que exista el tarifador, la revisión la hace Dynamo («Para hoy» → «Revisar
--     precio»); después la hará el tarifador llamando a revisar_precio_envio().
--   · Mientras el precio es provisional: no se oferta, ni se publica, ni se asigna camión
--     (Dynamo puede revisar antes si quiere asignar ya).
--   · Previo pago: con precio provisional el plazo para pagar no corre; empieza en la
--     revisión, con el precio definitivo. Si Dynamo marca el pago antes, el precio queda
--     cerrado (ya está cobrado).
--   · Cada precio lleva la fecha y hora en que se puso (envios.precio_calculado_en).
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('envio_antelacion_max_dias', '120', 'Con cuántos días de antelación como máximo puede programar un cliente un envío.'),
  ('precio_cerrado_dias', '7', 'Si al confirmar faltan estos días o menos para la carga, el precio es cerrado. Si faltan más, es provisional y se revisa.'),
  ('precio_revision_dias_habiles', '3', 'Días hábiles antes de la carga en que se revisa el precio provisional.'),
  ('precio_revision_margen_pct', '5', 'Si en la revisión el precio se mueve menos de este %, se queda el de antes.'),
  ('precio_revision_respuesta_horas', '24', 'Horas que tiene el cliente para contestar a una subida de precio antes de avisar a Dynamo para llamarle.')
on conflict (clave) do nothing;

alter table envios
  add column precio_calculado_en      timestamptz,
  add column precio_revision          text check (precio_revision in ('pendiente', 'revisar', 'esperando_cliente', 'hecha')),
  add column precio_revision_fecha    date,
  add column precio_revision_anterior numeric(12,2),
  add column precio_revision_nuevo    numeric(12,2),
  add column precio_revision_en       timestamptz,
  add column precio_revision_recordado boolean not null default false,
  add column cancelacion_sin_coste    boolean not null default false;
comment on column envios.precio_calculado_en is 'Cuándo se puso el precio al cliente que tiene ahora. Lo pone la base de datos.';
comment on column envios.precio_revision is 'Precio provisional: pendiente (espera su fecha), revisar (toca hoy), esperando_cliente (sube: acepta o cancela), hecha (definitivo). null = cerrado desde el principio.';
comment on column envios.cancelacion_sin_coste is 'Cancelado sin coste para el cliente (no aceptó la subida de la revisión): no cuenta para su suspensión.';
update envios set precio_calculado_en = coalesce(modificado_en, creado_en) where importe_cliente is not null;
create index idx_envios_precio_revision on envios (precio_revision, precio_revision_fecha) where precio_revision in ('pendiente', 'revisar', 'esperando_cliente');

create or replace function precio_por_revisar(p text)
returns boolean language sql immutable as $$ select coalesce(p in ('pendiente', 'revisar', 'esperando_cliente'), false) $$;

-- N días hábiles (España) antes de una fecha.
create or replace function dias_habiles_antes(p_fecha date, p_n int)
returns date language plpgsql stable security definer set search_path = public as $$
declare d date := p_fecha; n int := 0;
begin
  while n < greatest(p_n, 0) loop
    d := d - 1;
    if es_dia_habil(d) then n := n + 1; end if;
  end loop;
  return d;
end $$;

-- ---- Antelación máxima -----------------------------------------------------------------
create or replace function fn_envios_aa_fecha_lejana()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_max int := p_num('envio_antelacion_max_dias', 120)::int;
begin
  if new.fecha_carga_desde is not null and v_max > 0
     and new.fecha_carga_desde > (now() at time zone 'Europe/Madrid')::date + v_max
     and (tg_op = 'INSERT' or new.fecha_carga_desde is distinct from old.fecha_carga_desde)
     and not es_servidor() and not es_admin() then
    raise exception 'Como mucho se puede programar con % días de antelación. Para más, llámanos al +34 955 225 945.', v_max using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function fn_envios_aa_fecha_lejana() from public, anon, authenticated;
create trigger tg_envios_aa_fecha_lejana before insert or update of fecha_carga_desde on envios
  for each row execute function fn_envios_aa_fecha_lejana();

-- ---- El guardián del precio (después de tg_envios_aa_previo_pago, antes del plazo de pago)
create or replace function fn_envios_ab_precio_revision()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  -- Sello del precio: lo pone la base de datos.
  if tg_op = 'INSERT' then
    new.precio_calculado_en := case when new.importe_cliente is not null then now() end;
  elsif new.importe_cliente is distinct from old.importe_cliente then
    new.precio_calculado_en := now();
  else
    new.precio_calculado_en := old.precio_calculado_en;
  end if;
  -- Las columnas de la revisión solo las tocan las funciones de la revisión.
  if coalesce(current_setting('dynamo.revision_precio', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.precio_revision := null; new.precio_revision_fecha := null; new.precio_revision_anterior := null;
      new.precio_revision_nuevo := null; new.precio_revision_en := null; new.precio_revision_recordado := false;
      new.cancelacion_sin_coste := false;
    else
      new.precio_revision := old.precio_revision; new.precio_revision_fecha := old.precio_revision_fecha;
      new.precio_revision_anterior := old.precio_revision_anterior; new.precio_revision_nuevo := old.precio_revision_nuevo;
      new.precio_revision_en := old.precio_revision_en; new.precio_revision_recordado := old.precio_revision_recordado;
      new.cancelacion_sin_coste := old.cancelacion_sin_coste and new.estado = 'cancelado';
    end if;
  end if;
  -- Al confirmar o al cambiar la fecha: ¿precio cerrado o provisional?
  if not coalesce(new.es_manual, false) and new.estado = 'programado' and new.fecha_carga_desde is not null
     and new.pago_previo is distinct from 'pagado' and new.transportista_id is null and new.estado_asignacion = 'sin_asignar'
     and (tg_op = 'INSERT' or old.estado = 'borrador' or new.fecha_carga_desde is distinct from old.fecha_carga_desde) then
    if new.fecha_carga_desde - v_hoy > p_num('precio_cerrado_dias', 7) then
      new.precio_revision := 'pendiente';
      new.precio_revision_fecha := dias_habiles_antes(new.fecha_carga_desde, p_num('precio_revision_dias_habiles', 3)::int);
      new.precio_revision_anterior := null; new.precio_revision_nuevo := null; new.precio_revision_en := null; new.precio_revision_recordado := false;
    elsif tg_op = 'UPDATE' and old.estado = 'programado' and new.precio_revision = 'pendiente' then
      -- Se adelanta la fecha y ya entra en el plazo cerrado: toca revisar ya.
      new.precio_revision := 'revisar'; new.precio_revision_fecha := v_hoy;
    end if;
  end if;
  -- Pagado: el precio queda cerrado (ya está cobrado).
  if new.pago_previo = 'pagado' and precio_por_revisar(new.precio_revision) then
    new.precio_revision := 'hecha'; new.precio_revision_en := now();
  end if;
  -- Con precio provisional: ni oferta, ni bolsa, ni camión.
  if precio_por_revisar(new.precio_revision) and new.estado <> 'cancelado' and (
       (new.transportista_id is not null and new.transportista_id is distinct from (case when tg_op = 'UPDATE' then old.transportista_id end))
    or (new.publicado_en_bolsa_en is not null and (tg_op = 'INSERT' or old.publicado_en_bolsa_en is null))
    or (new.estado_asignacion <> 'sin_asignar' and (tg_op = 'INSERT' or old.estado_asignacion = 'sin_asignar'))) then
    raise exception 'Precio provisional: no se puede ofertar, publicar ni asignar hasta revisar el precio (botón «Revisar precio» de la ficha).'
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function fn_envios_ab_precio_revision() from public, anon, authenticated;
create trigger tg_envios_ab_precio_revision before insert or update on envios
  for each row execute function fn_envios_ab_precio_revision();

create or replace function fn_ofertas_precio_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from envios where id = new.envio_id and precio_por_revisar(precio_revision)) then
    raise exception 'Precio provisional: no se puede ofertar hasta revisar el precio.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function fn_ofertas_precio_revision() from public, anon, authenticated;
create trigger tg_ofertas_ab_precio_revision before insert on envio_ofertas
  for each row execute function fn_ofertas_precio_revision();

-- El plazo para pagar no corre mientras el precio es provisional.
create or replace function fn_envios_pago_plazo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.pago_pendiente_desde := case when new.pago_previo = 'pendiente' and not precio_por_revisar(new.precio_revision) then now() end;
  elsif new.pago_previo = 'pendiente' and old.pago_previo is distinct from 'pendiente' then
    new.pago_pendiente_desde := case when precio_por_revisar(new.precio_revision) then null else now() end;
  elsif new.pago_previo = 'pendiente' and new.precio_revision = 'hecha' and old.precio_revision is distinct from 'hecha' then
    new.pago_pendiente_desde := now();          -- precio definitivo: empieza el plazo para pagar
  elsif new.pago_previo = 'pendiente' and precio_por_revisar(new.precio_revision) and not precio_por_revisar(old.precio_revision) then
    new.pago_pendiente_desde := null;           -- vuelve a ser provisional: se paga tras la revisión
  elsif new.pago_pendiente_desde is distinct from old.pago_pendiente_desde and not (es_admin() or es_servidor()) then
    new.pago_pendiente_desde := old.pago_pendiente_desde;
  end if;
  return new;
end $$;

-- ---- La revisión ---------------------------------------------------------------------
-- Dynamo (hoy a mano; mañana el tarifador, como servidor) pone el precio de la revisión.
create or replace function revisar_precio_envio(p_envio uuid, p_nuevo numeric)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare e record; v_margen numeric := p_num('precio_revision_margen_pct', 5); v_res text; v_ref text;
begin
  if not (es_admin() or es_servidor()) then raise exception 'Solo Dynamo revisa el precio.' using errcode = '42501'; end if;
  select id, referencia_gx, cliente_id, estado, importe_cliente, precio_revision into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if e.estado <> 'programado' or not precio_por_revisar(e.precio_revision) then return jsonb_build_object('resultado', 'no_provisional'); end if;
  if p_nuevo is null or p_nuevo <= 0 then return jsonb_build_object('resultado', 'precio_no_valido'); end if;
  p_nuevo := round(p_nuevo, 2);
  v_ref := '#' || coalesce(e.referencia_gx, '');
  perform set_config('dynamo.revision_precio', 'on', true);
  if e.importe_cliente is null or e.importe_cliente = 0 or abs(p_nuevo - e.importe_cliente) * 100 / e.importe_cliente < v_margen then
    update envios set precio_revision = 'hecha', precio_revision_en = now(), precio_revision_anterior = importe_cliente, precio_revision_nuevo = p_nuevo,
                      importe_cliente = coalesce(importe_cliente, p_nuevo) where id = p_envio;
    v_res := 'mantenido';
    perform crear_aviso('cliente', e.cliente_id, null, 'precio_confirmado', 'ok', 'Precio confirmado · ' || v_ref,
      'Hemos revisado el precio antes de la carga y se mantiene: ' || euros_txt(coalesce(e.importe_cliente, p_nuevo)) || ' + IVA.', '/panel/envios?ver=' || e.id, e.id);
  elsif p_nuevo < e.importe_cliente then
    update envios set precio_revision = 'hecha', precio_revision_en = now(), precio_revision_anterior = importe_cliente, precio_revision_nuevo = p_nuevo,
                      importe_cliente = p_nuevo where id = p_envio;
    v_res := 'bajado';
    perform crear_aviso('cliente', e.cliente_id, null, 'precio_bajado', 'ok', 'Tu envío baja de precio · ' || v_ref,
      'Al revisarlo antes de la carga, el precio baja de ' || euros_txt(e.importe_cliente) || ' a ' || euros_txt(p_nuevo) || ' + IVA.', '/panel/envios?ver=' || e.id, e.id);
  else
    update envios set precio_revision = 'esperando_cliente', precio_revision_en = now(), precio_revision_anterior = importe_cliente,
                      precio_revision_nuevo = p_nuevo, precio_revision_recordado = false where id = p_envio;
    v_res := 'subida';
    perform crear_aviso('cliente', e.cliente_id, null, 'precio_subida', 'urgente', 'Nuevo precio de tu envío · ' || v_ref,
      'El precio sube de ' || euros_txt(e.importe_cliente) || ' a ' || euros_txt(p_nuevo) || ' + IVA. Acéptalo o cancélalo sin coste desde la ficha del envío.',
      '/panel/envios?ver=' || e.id, e.id);
  end if;
  perform set_config('dynamo.revision_precio', 'off', true);
  return jsonb_build_object('resultado', v_res);
end $$;
revoke execute on function revisar_precio_envio(uuid, numeric) from public, anon;
grant execute on function revisar_precio_envio(uuid, numeric) to authenticated;

-- El cliente acepta la subida o cancela sin coste.
create or replace function responder_subida_precio(p_envio uuid, p_acepta boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare e record;
begin
  select id, referencia_gx, cliente_id, estado, precio_revision, precio_revision_nuevo into e from envios where id = p_envio for update;
  if not found or not (e.cliente_id = cliente_del_usuario() or es_admin()) then
    raise exception 'Ese envío no existe o no es tuyo.' using errcode = '42501';
  end if;
  if e.estado <> 'programado' or e.precio_revision is distinct from 'esperando_cliente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
  perform set_config('dynamo.revision_precio', 'on', true);
  if coalesce(p_acepta, false) then
    update envios set importe_cliente = precio_revision_nuevo, precio_revision = 'hecha', precio_revision_en = now() where id = p_envio;
    perform crear_aviso('dynamo', null, null, 'precio_aceptado', 'info', 'Acepta el nuevo precio · #' || coalesce(e.referencia_gx, ''),
      'Precio definitivo: ' || euros_txt(e.precio_revision_nuevo) || ' + IVA. Ya se puede ofertar.', '/panel/envios?ver=' || e.id, e.id);
  else
    update envios set estado = 'cancelado', cancelacion_sin_coste = true where id = p_envio;
    perform registrar_hito(p_envio, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', 'No acepta la subida de precio de la revisión (cancelación sin coste)', 'por', 'cliente'));
  end if;
  perform set_config('dynamo.revision_precio', 'off', true);
  return jsonb_build_object('resultado', case when p_acepta then 'aceptado' else 'cancelado' end);
end $$;
revoke execute on function responder_subida_precio(uuid, boolean) from public, anon;
grant execute on function responder_subida_precio(uuid, boolean) to authenticated;

-- Cada hora: los que llegan a su fecha de revisión pasan a «revisar» (aviso a Dynamo) y
-- las subidas sin respuesta, aviso urgente para llamar.
create or replace function revisar_precios_programados()
returns integer language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare r record; n int := 0; v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  if not (es_servidor() or es_consola_supabase() or es_admin()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  perform set_config('dynamo.revision_precio', 'on', true);
  for r in select e.id, e.referencia_gx, e.fecha_carga_desde, c.nombre_visible
             from envios e join clientes c on c.id = e.cliente_id
            where e.estado = 'programado' and e.precio_revision = 'pendiente' and e.precio_revision_fecha <= v_hoy
            for update of e skip locked loop
    update envios set precio_revision = 'revisar' where id = r.id;
    perform crear_aviso('dynamo', null, null, 'precio_revisar', 'aviso', 'Toca revisar el precio · #' || coalesce(r.referencia_gx, ''),
      coalesce(r.nombre_visible, 'Cliente') || ' · carga el ' || to_char(r.fecha_carga_desde, 'DD/MM') || '. Pon el precio definitivo en la ficha.', '/panel/envios?ver=' || r.id, r.id);
    n := n + 1;
  end loop;
  for r in select e.id, e.referencia_gx, c.nombre_visible
             from envios e join clientes c on c.id = e.cliente_id
            where e.estado = 'programado' and e.precio_revision = 'esperando_cliente' and not e.precio_revision_recordado
              and e.precio_revision_en < now() - make_interval(hours => p_num('precio_revision_respuesta_horas', 24)::int)
            for update of e skip locked loop
    update envios set precio_revision_recordado = true where id = r.id;
    perform crear_aviso('dynamo', null, null, 'precio_sin_respuesta', 'urgente', 'No contesta a la subida de precio · #' || coalesce(r.referencia_gx, ''),
      coalesce(r.nombre_visible, 'Cliente') || ' no ha aceptado ni cancelado. Llámale.', '/panel/envios?ver=' || r.id, r.id);
    n := n + 1;
  end loop;
  perform set_config('dynamo.revision_precio', 'off', true);
  return n;
end $$;
revoke execute on function revisar_precios_programados() from public, anon;
grant execute on function revisar_precios_programados() to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('dynamo-revision-precios', '7 * * * *', 'select public.revisar_precios_programados()');
    exception when others then
      raise notice 'No se pudo programar la revisión de precios (%).', sqlerrm;
    end;
  end if;
end $$;

-- Lo que ve el cliente (y Dynamo) de la revisión de su envío.
create or replace function revision_precio_envio(p_envio uuid)
returns table (precio_calculado_en timestamptz, precio_revision text, precio_revision_fecha date,
               precio_revision_anterior numeric, precio_revision_nuevo numeric, precio_revision_en timestamptz, margen_pct numeric)
language sql stable security definer set search_path = public as $$
  select e.precio_calculado_en, e.precio_revision, e.precio_revision_fecha, e.precio_revision_anterior, e.precio_revision_nuevo,
         e.precio_revision_en, p_num('precio_revision_margen_pct', 5)
    from envios e
   where e.id = p_envio and (ve_todo() or e.cliente_id = cliente_del_usuario())
     and (e.solicitud_estado is distinct from 'pendiente_precio')
$$;
revoke execute on function revision_precio_envio(uuid) from public, anon;
grant execute on function revision_precio_envio(uuid) to authenticated;

-- Pagos: con el precio provisional no se paga todavía.
drop function if exists pagos_envio(uuid);
create function pagos_envio(p_envio uuid default null)
returns table (envio_id uuid, referencia_gx text, referencia_cliente text, estado text, pago_previo text, pago_motivo text,
               pago_metodo text, pagado_en timestamptz, base numeric, iva numeric, total numeric, pago_limite timestamptz,
               precio_provisional boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.referencia_gx, e.referencia_cliente, e.estado::text, e.pago_previo, e.pago_motivo, e.pago_metodo, e.pagado_en, i.base, i.iva, i.total,
         case when e.pago_previo = 'pendiente' and e.pago_pendiente_desde is not null then pago_limite(e.pago_pendiente_desde) end,
         precio_por_revisar(e.precio_revision)
    from envios e cross join lateral pago_envio_importes(e.id) i
   where e.pago_previo <> 'no_requerido'
     and (p_envio is null or e.id = p_envio)
     and (ve_todo() or e.cliente_id = cliente_del_usuario())
$$;
revoke execute on function pagos_envio(uuid) from public, anon;
grant execute on function pagos_envio(uuid) to authenticated;

-- Cancelar sin coste (no acepta la subida): no cuenta para la suspensión automática.
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
      end as motivo) r
   where r.motivo is not null;
end $$;

-- Las reglas, para el asistente de nuevo envío (antelación máxima y aviso de precio provisional).
create or replace function reglas_precio_envio()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('antelacion_max_dias', p_num('envio_antelacion_max_dias', 120), 'cerrado_dias', p_num('precio_cerrado_dias', 7),
                            'revision_dias_habiles', p_num('precio_revision_dias_habiles', 3), 'margen_pct', p_num('precio_revision_margen_pct', 5))
$$;
revoke execute on function reglas_precio_envio() from public, anon;
grant execute on function reglas_precio_envio() to authenticated;
