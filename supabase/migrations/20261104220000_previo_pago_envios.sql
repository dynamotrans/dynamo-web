-- =====================================================================================
-- PREVIO PAGO DE LOS ENVÍOS (decidido por el usuario el 2026-11-04, sin n8n)
--
-- Un envío que necesita pago previo nace «Pendiente de pago» y NO se puede ofertar,
-- publicar en bolsa ni asignar a un transportista hasta que:
--   · se paga con tarjeta (Stripe; lo marca SOLO el servidor al confirmar Stripe), o
--   · Dynamo marca que ha llegado la transferencia, o
--   · Dynamo lo pasa SIN pago previo (cobro a vencimiento: empresa conocida, CESCE
--     positivo…), dejando el motivo.
-- Después queda «Pendiente de asignar», como cualquier otro.
--
-- Quién necesita pago previo (se decide al confirmar el envío, de borrador a programado):
--   1. el cliente SIN crédito disponible (CESCE sin clasificar o límite 0), siempre;
--   2. los PRIMEROS envíos de cualquier cliente (parámetro `previo_pago_primeros_envios`,
--      1 = solo el primero), salvo que su ficha tenga marcado «sin pago previo del
--      primer envío» (empresa conocida con crédito).
-- Los envíos registrados a mano con transportistas propios del cliente nunca.
-- Interruptor general: `previo_pago_activo`.
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('previo_pago_activo', 'true', 'Previo pago de envíos: encendido o apagado (sin crédito y primeros envíos).'),
  ('previo_pago_primeros_envios', '1', 'Cuántos de los primeros envíos de cada cliente se pagan por adelantado (1 = solo el primero; 0 = ninguno).')
on conflict (clave) do nothing;

-- ---- Cliente: excepción del primer envío (solo Dynamo; la tabla solo la cambia Dynamo) --
alter table clientes add column sin_pago_previo_primer_envio boolean not null default false;
comment on column clientes.sin_pago_previo_primer_envio is
  'Empresa conocida: su primer envío no exige pago previo. No le libra si NO tiene crédito disponible.';

-- ---- Envío: estado del pago previo --------------------------------------------------
alter table envios
  add column pago_previo        text not null default 'no_requerido'
                                 check (pago_previo in ('no_requerido', 'pendiente', 'pagado', 'exento')),
  add column pago_motivo        text,           -- por qué se pide (sin crédito / primer envío / Dynamo)
  add column pago_metodo        text check (pago_metodo in ('stripe', 'transferencia')),
  add column pagado_en          timestamptz,
  add column pago_resuelto_por  uuid references auth.users(id) on delete set null,
  add column pago_exento_motivo text,
  add column stripe_pago        text;           -- id del pago en Stripe (payment_intent)
comment on column envios.pago_previo is
  'no_requerido · pendiente (no se oferta ni se asigna) · pagado (Stripe o transferencia) · exento (Dynamo lo pasa a cobro a vencimiento).';
create index idx_envios_pago_pendiente on envios (cliente_id) where pago_previo = 'pendiente';

-- ¿Por qué necesitaría pago previo este envío? Nulo = no lo necesita.
create or replace function pago_previo_motivo(p_cliente uuid, p_envio uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare c record; n_prev int;
begin
  if not coalesce((parametro('previo_pago_activo') #>> '{}')::boolean, false) then return null; end if;
  select riesgo_efectivo_euros, sin_pago_previo_primer_envio into c from clientes where id = p_cliente;
  if not found then return null; end if;
  if coalesce(c.riesgo_efectivo_euros, 0) <= 0 then
    return case when c.riesgo_efectivo_euros is null then 'Sin crédito: empresa sin clasificar por CESCE'
                else 'Sin crédito: CESCE autoriza 0' end;
  end if;
  if not c.sin_pago_previo_primer_envio then
    select count(*) into n_prev from envios
     where cliente_id = p_cliente and id is distinct from p_envio and not coalesce(es_manual, false)
       and estado not in ('borrador', 'cancelado');
    if n_prev < p_num('previo_pago_primeros_envios', 1) then
      return case when n_prev = 0 then 'Primer envío del cliente' else format('Uno de los %s primeros envíos del cliente', p_num('previo_pago_primeros_envios', 1)) end;
    end if;
  end if;
  return null;
end $$;
revoke execute on function pago_previo_motivo(uuid, uuid) from public, anon, authenticated;

-- ---- El guardián del envío ---------------------------------------------------------
-- 1. Solo Dynamo (o el servidor) toca las columnas del pago.
-- 2. Al confirmar el envío (borrador → programado) decide si necesita pago previo.
-- 3. Mientras esté pendiente de pago: ni transportista, ni oferta, ni bolsa.
create or replace function fn_envios_aa_previo_pago()
returns trigger language plpgsql security definer set search_path = public as $$
declare m text; dynamo boolean := es_servidor() or es_admin();
begin
  if tg_op = 'UPDATE' and not dynamo
     and (new.pago_previo, new.pago_motivo, new.pago_metodo, new.pagado_en, new.pago_resuelto_por, new.pago_exento_motivo, new.stripe_pago)
         is distinct from
         (old.pago_previo, old.pago_motivo, old.pago_metodo, old.pagado_en, old.pago_resuelto_por, old.pago_exento_motivo, old.stripe_pago) then
    raise exception 'Solo Dynamo marca el pago de un envío.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not dynamo then
    new.pago_previo := 'no_requerido'; new.pago_motivo := null; new.pago_metodo := null; new.pagado_en := null;
    new.pago_resuelto_por := null; new.pago_exento_motivo := null; new.stripe_pago := null;
  end if;

  if not coalesce(new.es_manual, false) and new.estado = 'programado' and new.pago_previo = 'no_requerido'
     and (tg_op = 'INSERT' or old.estado = 'borrador') then
    m := pago_previo_motivo(new.cliente_id, new.id);
    if m is not null then new.pago_previo := 'pendiente'; new.pago_motivo := m; end if;
  end if;

  if new.pago_previo = 'pendiente' and (
       (new.transportista_id is not null and new.transportista_id is distinct from (case when tg_op = 'UPDATE' then old.transportista_id end))
    or (new.publicado_en_bolsa_en is not null and (tg_op = 'INSERT' or old.publicado_en_bolsa_en is null))
    or (new.estado_asignacion <> 'sin_asignar' and (tg_op = 'INSERT' or old.estado_asignacion = 'sin_asignar'))) then
    raise exception 'Envío pendiente de pago: no se puede ofertar, publicar ni asignar hasta que esté pagado (o Dynamo lo pase sin pago previo).'
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function fn_envios_aa_previo_pago() from public, anon, authenticated;
create trigger tg_envios_aa_previo_pago before insert or update on envios
  for each row execute function fn_envios_aa_previo_pago();

-- Ofertas: tampoco con el pago pendiente.
create or replace function fn_ofertas_previo_pago()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from envios where id = new.envio_id and pago_previo = 'pendiente') then
    raise exception 'Envío pendiente de pago: no se puede ofertar hasta que esté pagado (o Dynamo lo pase sin pago previo).'
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function fn_ofertas_previo_pago() from public, anon, authenticated;
create trigger tg_ofertas_aa_previo_pago before insert on envio_ofertas
  for each row execute function fn_ofertas_previo_pago();

-- ---- Importes del pago (base, IVA del cliente y total) -------------------------------
create or replace function pago_envio_importes(p_envio uuid)
returns table (base numeric, iva numeric, total numeric) language sql stable security definer set search_path = public as $$
  select round(coalesce(e.importe_cliente, 0), 2),
         coalesce(c.iva_porcentaje, 21),
         round(coalesce(e.importe_cliente, 0) * (1 + coalesce(c.iva_porcentaje, 21) / 100), 2)
    from envios e join clientes c on c.id = e.cliente_id
   where e.id = p_envio
$$;
revoke execute on function pago_envio_importes(uuid) from public, anon, authenticated;

-- ---- Dynamo marca el pago -----------------------------------------------------------
--   'transferencia' : pendiente → pagado (ha llegado la transferencia)
--   'exento'        : pendiente → exento (sin pago previo, cobro a vencimiento; motivo obligatorio)
--   'requerir'      : no_requerido → pendiente (Dynamo exige pago previo a este envío)
--   'deshacer'      : pagado o exento → pendiente (solo si aún no tiene transportista)
create or replace function marcar_pago_envio(p_envio uuid, p_accion text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e record; v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not es_admin() then raise exception 'Solo Dynamo marca el pago de un envío.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if coalesce(e.es_manual, false) then return jsonb_build_object('resultado', 'envio_manual'); end if;

  if p_accion = 'transferencia' then
    if e.pago_previo <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
    update envios set pago_previo = 'pagado', pago_metodo = 'transferencia', pagado_en = now(), pago_resuelto_por = auth.uid()
     where id = p_envio;
  elsif p_accion = 'exento' then
    if e.pago_previo <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
    if v_motivo is null or length(v_motivo) < 3 then return jsonb_build_object('resultado', 'falta_motivo'); end if;
    update envios set pago_previo = 'exento', pago_exento_motivo = left(v_motivo, 500), pago_resuelto_por = auth.uid()
     where id = p_envio;
  elsif p_accion = 'requerir' then
    if e.pago_previo <> 'no_requerido' then return jsonb_build_object('resultado', 'ya_tiene_pago'); end if;
    if e.transportista_id is not null or e.estado_asignacion <> 'sin_asignar' or e.publicado_en_bolsa_en is not null then
      return jsonb_build_object('resultado', 'ya_ofertado');
    end if;
    update envios set pago_previo = 'pendiente', pago_motivo = coalesce(v_motivo, 'Pedido por Dynamo') where id = p_envio;
  elsif p_accion = 'deshacer' then
    if e.pago_previo not in ('pagado', 'exento') then return jsonb_build_object('resultado', 'nada_que_deshacer'); end if;
    if e.pago_metodo = 'stripe' then return jsonb_build_object('resultado', 'pagado_con_tarjeta'); end if;
    if e.transportista_id is not null or e.estado_asignacion <> 'sin_asignar' or e.publicado_en_bolsa_en is not null then
      return jsonb_build_object('resultado', 'ya_ofertado');
    end if;
    update envios set pago_previo = 'pendiente', pago_metodo = null, pagado_en = null, pago_resuelto_por = null, pago_exento_motivo = null
     where id = p_envio;
  else
    return jsonb_build_object('resultado', 'accion_no_valida');
  end if;
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke execute on function marcar_pago_envio(uuid, text, text) from public, anon;
grant execute on function marcar_pago_envio(uuid, text, text) to authenticated;   -- dentro: solo Dynamo

-- ---- Stripe confirma un pago (SOLO el servidor, con la clave de servicio) -------------
-- Comprueba que el importe cobrado (en céntimos) es el total del envío.
create or replace function pago_envio_stripe(p_envio uuid, p_pago text, p_centimos bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e record; t numeric;
begin
  if not es_servidor() then raise exception 'Solo el servidor confirma pagos con tarjeta.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if e.stripe_pago = p_pago then return jsonb_build_object('resultado', 'ya_registrado'); end if;
  if e.pago_previo <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente', 'estado', e.pago_previo); end if;
  select total into t from pago_envio_importes(p_envio);
  if round(t * 100) <> p_centimos then
    return jsonb_build_object('resultado', 'importe_distinto', 'esperado', round(t * 100), 'cobrado', p_centimos);
  end if;
  update envios set pago_previo = 'pagado', pago_metodo = 'stripe', pagado_en = now(), stripe_pago = p_pago where id = p_envio;
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke execute on function pago_envio_stripe(uuid, text, bigint) from public, anon, authenticated;
grant execute on function pago_envio_stripe(uuid, text, bigint) to service_role;

-- ---- Lo que ve el cliente de sus pagos (y Dynamo de cualquiera) ----------------------
create or replace function pagos_envio(p_envio uuid default null)
returns table (envio_id uuid, referencia_gx text, referencia_cliente text, estado text, pago_previo text, pago_motivo text,
               pago_metodo text, pagado_en timestamptz, base numeric, iva numeric, total numeric)
language sql stable security definer set search_path = public as $$
  select e.id, e.referencia_gx, e.referencia_cliente, e.estado::text, e.pago_previo, e.pago_motivo, e.pago_metodo, e.pagado_en, i.base, i.iva, i.total
    from envios e cross join lateral pago_envio_importes(e.id) i
   where e.pago_previo <> 'no_requerido'
     and (p_envio is null or e.id = p_envio)
     and (ve_todo() or e.cliente_id = cliente_del_usuario())
$$;
revoke execute on function pagos_envio(uuid) from public, anon;
grant execute on function pagos_envio(uuid) to authenticated;

-- ---- Contadores: «sin pagar» y «sin asignar» ya no cuenta los pendientes de pago ------
create or replace function contadores_panel()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_rol rol_usuario;
begin
  select rol into v_rol from usuarios where id = auth.uid() and estado = 'activa';
  if v_rol is null then return '{}'::jsonb; end if;

  if v_rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then
    return jsonb_build_object(
      'envios_sin_asignar', (select count(*) from envios where estado = 'programado' and not es_manual and transportista_id is null and pago_previo <> 'pendiente'),
      'envios_sin_pagar',   (select count(*) from envios where estado = 'programado' and pago_previo = 'pendiente'),
      'incidencias',        (select count(*) from incidencias where estado in ('abierto', 'en_curso')),
      'penalizaciones',     (select count(*) from penalizaciones where estado = 'pendiente_confirmar'),
      'alm_sin_confirmar',  (select count(*) from almacenamientos where estado = 'pendiente_confirmar'),
      'alm_sin_pagar',      (select count(*) from almacenamientos where pago_adelantado and pagado_en is null and estado <> 'cancelado'),
      'altas',              (select count(*) from usuarios where estado = 'pendiente_verificacion' and cliente_id is null and transportista_id is null));
  elsif v_rol = 'cliente' then
    return jsonb_build_object(
      'envios_sin_asignar', (select count(*) from mis_envios() e where e.estado = 'programado' and not e.es_manual
                                and coalesce(e.estado_asignacion::text, '') <> 'confirmada'),
      'envios_sin_pagar',   (select count(*) from pagos_envio(null) p where p.pago_previo = 'pendiente' and p.estado = 'programado'),
      'incidencias',        (select count(*) from incidencias where estado in ('abierto', 'en_curso')),
      'penalizaciones',     (select count(*) from mis_penalizaciones() p where p.estado = 'pendiente_confirmar'),
      'alm_sin_confirmar',  (select count(*) from almacenamientos where estado = 'pendiente_confirmar'),
      'alm_sin_pagar',      (select count(*) from almacenamientos where pago_adelantado and pagado_en is null and estado <> 'cancelado'));
  else
    return jsonb_build_object(
      'incidencias',        (select count(*) from incidencias where estado in ('abierto', 'en_curso')),
      'penalizaciones',     (select count(*) from mis_penalizaciones_transportista() p where p.estado = 'pendiente_confirmar'));
  end if;
end $$;
