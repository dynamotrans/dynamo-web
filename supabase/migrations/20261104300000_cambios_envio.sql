-- =====================================================================================
-- CAMBIOS EN UN ENVÍO YA CONFIRMADO (usuario, 2026-11-04)
--
-- 1. Si Dynamo cambia la RUTA, el precio ya no vale: el envío queda marcado «revisar
--    precio» hasta que alguien toque el precio del cliente o del transportista.
-- 2. El CLIENTE puede pedir un cambio desde su ficha:
--    · SIN camión asignado y solo fechas → se aplica al momento (es gratis y nadie tiene
--      el hueco reservado).
--    · CON camión asignado, o si pide algo más que fechas (ruta, mercancía…) → queda
--      PENDIENTE para Dynamo, que lo confirma con el transportista y lo acepta o rechaza.
--    Cancelar sigue igual: gratis sin camión; con camión, gratis hasta las 9:00 del día
--    hábil anterior y después penalización automática (fn_envios_penalizacion_cancelacion).
-- (Reinicio de la ventana de fechas al modificar —«1 a 3 días desde el cambio»— y el
-- precio nuevo automático: con el tarifador.)
-- =====================================================================================

alter table envios
  add column precio_revisar         boolean not null default false,
  add column cambio_cliente         jsonb,            -- {fecha_desde, fecha_hasta, detalle}
  add column cambio_cliente_en      timestamptz,
  add column cambio_cliente_estado  text check (cambio_cliente_estado in ('pendiente', 'aplicado', 'aceptado', 'rechazado')),
  add column cambio_cliente_nota    text;             -- respuesta de Dynamo
comment on column envios.precio_revisar is 'La ruta ha cambiado y el precio aún no se ha revisado.';

-- Guardián: el cliente solo toca estas columnas desde pedir_cambio_envio(); y revisar el
-- precio se apaga solo al tocar cualquiera de los dos precios.
create or replace function fn_envios_cambios()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.precio_revisar, new.cambio_cliente, new.cambio_cliente_en, new.cambio_cliente_estado, new.cambio_cliente_nota)
     is distinct from (old.precio_revisar, old.cambio_cliente, old.cambio_cliente_en, old.cambio_cliente_estado, old.cambio_cliente_nota)
     and not es_servidor() and not es_admin()
     and coalesce(current_setting('dynamo.cambio_envio', true), '') <> 'on' then
    raise exception 'Los cambios se piden con «Pedir un cambio».' using errcode = '42501';
  end if;
  if old.precio_revisar and new.precio_revisar
     and (new.importe_cliente, new.importe_transportista) is distinct from (old.importe_cliente, old.importe_transportista) then
    new.precio_revisar := false;
  end if;
  return new;
end $$;
revoke execute on function fn_envios_cambios() from public, anon, authenticated;
create trigger tg_envios_cambios before update on envios
  for each row execute function fn_envios_cambios();

-- Ruta cambiada → revisar precio.
create or replace function fn_hitos_ruta_cambiada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('dynamo.cambio_envio', 'on', true);
  update envios set precio_revisar = true where id = new.envio_id and estado not in ('entregado', 'cancelado');
  perform set_config('dynamo.cambio_envio', 'off', true);
  return null;
end $$;
revoke execute on function fn_hitos_ruta_cambiada() from public, anon, authenticated;
create trigger tg_hitos_ruta_cambiada after insert on envio_hitos
  for each row when (new.hito = 'ruta_cambiada') execute function fn_hitos_ruta_cambiada();

-- ---- El cliente pide un cambio ------------------------------------------------------
create or replace function pedir_cambio_envio(p_envio uuid, p_desde date, p_hasta date, p_detalle text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e envios%rowtype; v_det text := nullif(trim(coalesce(p_detalle, '')), ''); v_libre boolean; v_fechas boolean;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if coalesce(e.es_manual, false) then return jsonb_build_object('resultado', 'envio_manual'); end if;
  if e.estado <> 'programado' then return jsonb_build_object('resultado', 'no_modificable', 'estado', e.estado); end if;
  if e.cambio_cliente_estado = 'pendiente' then return jsonb_build_object('resultado', 'ya_pendiente'); end if;
  v_fechas := p_desde is not null and (p_desde, coalesce(p_hasta, p_desde)) is distinct from (e.fecha_carga_desde, coalesce(e.fecha_carga_hasta, e.fecha_carga_desde));
  if p_desde is not null and (p_desde <= current_date or coalesce(p_hasta, p_desde) < p_desde or coalesce(p_hasta, p_desde) > current_date + 183) then
    return jsonb_build_object('resultado', 'fechas_no_validas');
  end if;
  if not v_fechas and v_det is null then return jsonb_build_object('resultado', 'sin_cambios'); end if;
  if length(coalesce(v_det, '')) > 1000 then return jsonb_build_object('resultado', 'detalle_largo'); end if;

  v_libre := e.transportista_id is null and e.estado_asignacion = 'sin_asignar';
  perform set_config('dynamo.cambio_envio', 'on', true);
  if v_libre and v_det is null then
    -- Sin camión y solo fechas: se aplica ya.
    update envios set fecha_carga_desde = p_desde, fecha_carga_hasta = coalesce(p_hasta, p_desde),
                      cambio_cliente = jsonb_build_object('fecha_desde', p_desde, 'fecha_hasta', coalesce(p_hasta, p_desde),
                                                          'antes_desde', e.fecha_carga_desde, 'antes_hasta', e.fecha_carga_hasta),
                      cambio_cliente_en = now(), cambio_cliente_estado = 'aplicado', cambio_cliente_nota = null
     where id = p_envio;
    perform set_config('dynamo.cambio_envio', 'off', true);
    return jsonb_build_object('resultado', 'aplicado');
  end if;
  update envios set cambio_cliente = jsonb_build_object('fecha_desde', case when v_fechas then p_desde end,
                                                        'fecha_hasta', case when v_fechas then coalesce(p_hasta, p_desde) end,
                                                        'detalle', v_det, 'con_camion', not v_libre),
                    cambio_cliente_en = now(), cambio_cliente_estado = 'pendiente', cambio_cliente_nota = null
   where id = p_envio;
  perform set_config('dynamo.cambio_envio', 'off', true);
  return jsonb_build_object('resultado', 'pendiente');
end $$;
revoke execute on function pedir_cambio_envio(uuid, date, date, text) from public, anon;
grant execute on function pedir_cambio_envio(uuid, date, date, text) to authenticated;

-- ---- Dynamo resuelve el cambio pedido ------------------------------------------------
-- Al aceptar se aplican las fechas pedidas; la ruta y el precio los cambia Dynamo en la
-- ficha («Cambiar ruta», «Modificar»).
create or replace function resolver_cambio_envio(p_envio uuid, p_aceptar boolean, p_nota text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e envios%rowtype; d date; h date;
begin
  if not es_admin() then raise exception 'Solo Dynamo resuelve los cambios.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if not found or e.cambio_cliente_estado <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
  d := (e.cambio_cliente ->> 'fecha_desde')::date; h := (e.cambio_cliente ->> 'fecha_hasta')::date;
  if p_aceptar and d is not null then
    update envios set fecha_carga_desde = d, fecha_carga_hasta = coalesce(h, d) where id = p_envio;
  end if;
  update envios set cambio_cliente_estado = case when p_aceptar then 'aceptado' else 'rechazado' end,
                    cambio_cliente_nota = nullif(trim(coalesce(p_nota, '')), '')
   where id = p_envio;
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke execute on function resolver_cambio_envio(uuid, boolean, text) from public, anon;
grant execute on function resolver_cambio_envio(uuid, boolean, text) to authenticated;

-- ---- Lo que ve el cliente de su cambio ----------------------------------------------
create or replace function mi_cambio_envio(p_envio uuid)
returns table (cambio jsonb, estado text, en timestamptz, nota text, modificable boolean, con_camion boolean)
language sql stable security definer set search_path = public as $$
  select e.cambio_cliente, e.cambio_cliente_estado, e.cambio_cliente_en, e.cambio_cliente_nota,
         e.estado = 'programado' and not coalesce(e.es_manual, false),
         e.transportista_id is not null or e.estado_asignacion <> 'sin_asignar'
    from envios e where e.id = p_envio and envio_del_cliente(p_envio)
$$;
revoke execute on function mi_cambio_envio(uuid) from public, anon;
grant execute on function mi_cambio_envio(uuid) to authenticated;
