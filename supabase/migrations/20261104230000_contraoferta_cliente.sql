-- =====================================================================================
-- CONTRAOFERTA DEL CLIENTE (pedido del usuario el 2026-11-04)
--
-- Hasta ahora solo había contraoferta del TRANSPORTISTA (`contraoferta_auto_pct`, al
-- aceptar una carga por su enlace). Ahora el CLIENTE, si su ficha tiene marcado «Puede
-- hacer contraoferta de precio», puede proponer un precio MÁS BAJO al que le damos:
--   · hasta `contraoferta_cliente_auto_pct` % de rebaja → aceptado al instante (su envío
--     queda confirmado a ese precio, como si aceptara el nuestro);
--   · entre eso y `contraoferta_cliente_max_pct` % → lo revisa Dynamo (aprobar o
--     rechazar; si se rechaza, el cliente puede aceptar nuestro precio o cancelar);
--   · más rebaja que el máximo → no se admite.
-- Al proponer, el cliente acepta las condiciones generales igual que al aceptar.
-- Los porcentajes NO se enseñan al cliente.
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('contraoferta_cliente_auto_pct', '5',
   'Contraoferta del CLIENTE a nuestro precio: hasta este % de rebaja se acepta sola, al instante. Por encima, la revisa Dynamo.'),
  ('contraoferta_cliente_max_pct', '15',
   'Contraoferta del CLIENTE: rebaja máxima que se admite (%). Más, ni se envía a revisión.')
on conflict (clave) do nothing;
update parametros set descripcion =
  'Contraoferta del TRANSPORTISTA al aceptar una carga por su enlace: hasta este % de diferencia con el precio ofertado se acepta sola, al instante. Por encima (dentro de la banda de la oferta), la revisa Dynamo.'
 where clave = 'contraoferta_auto_pct';

alter table envios drop constraint if exists envios_solicitud_estado_check;
alter table envios add constraint envios_solicitud_estado_check
  check (solicitud_estado in ('pendiente_precio', 'precio_propuesto', 'contraoferta', 'aceptada', 'rechazada'));
drop index if exists idx_envios_solicitudes;
create index idx_envios_solicitudes on envios (solicitud_estado) where solicitud_estado in ('pendiente_precio', 'precio_propuesto', 'contraoferta');

alter table envios
  add column contraoferta_cliente     numeric(12,2) check (contraoferta_cliente > 0),
  add column contraoferta_cliente_en  timestamptz,
  add column precio_inicial_cliente   numeric(12,2);   -- el precio que dimos, si el cliente consiguió otro
comment on column envios.contraoferta_cliente is 'Precio (sin IVA) que propuso el cliente frente al nuestro. Ver solicitud_estado.';

-- Solo Dynamo (o el servidor, o estas funciones) tocan estas columnas.
create or replace function fn_envios_contraoferta_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.contraoferta_cliente, new.contraoferta_cliente_en, new.precio_inicial_cliente)
     is distinct from (old.contraoferta_cliente, old.contraoferta_cliente_en, old.precio_inicial_cliente)
     and not es_servidor() and not es_admin()
     and coalesce(current_setting('dynamo.contraoferta_cliente', true), '') <> 'on' then
    raise exception 'La contraoferta solo se hace desde «Proponer otro precio».' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function fn_envios_contraoferta_cliente() from public, anon, authenticated;
create trigger tg_envios_contraoferta_cliente before update on envios
  for each row execute function fn_envios_contraoferta_cliente();

-- ---- ¿Puede este cliente contraofertar, y qué ha propuesto? (para su ficha) ----------
create or replace function mi_contraoferta(p_envio uuid)
returns table (permitida boolean, propuesta numeric, propuesta_en timestamptz, precio_inicial numeric)
language sql stable security definer set search_path = public as $$
  select c.permite_contraoferta, e.contraoferta_cliente, e.contraoferta_cliente_en, e.precio_inicial_cliente
    from envios e join clientes c on c.id = e.cliente_id
   where e.id = p_envio and envio_del_cliente(p_envio)
$$;
revoke execute on function mi_contraoferta(uuid) from public, anon;
grant execute on function mi_contraoferta(uuid) to authenticated;

-- ---- El cliente propone un precio más bajo -----------------------------------------
create or replace function contraofertar_precio_solicitud(p_envio uuid, p_importe numeric)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e envios%rowtype; v_permitida boolean; v_rebaja numeric; v_auto numeric; v_max numeric; v_p numeric := round(p_importe, 2);
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  select permite_contraoferta into v_permitida from clientes where id = e.cliente_id;
  if not coalesce(v_permitida, false) then return jsonb_build_object('resultado', 'no_permitida'); end if;
  if e.solicitud_estado <> 'precio_propuesto' or e.estado <> 'borrador' then return jsonb_build_object('resultado', 'no_esperando'); end if;
  if e.precio_valido_hasta < now() then
    update envios set solicitud_estado = 'pendiente_precio', precio_valido_hasta = null where id = p_envio;
    return jsonb_build_object('resultado', 'caducado');
  end if;
  if e.fecha_carga_desde <= current_date then return jsonb_build_object('resultado', 'fecha_pasada'); end if;
  if v_p is null or v_p <= 0 then return jsonb_build_object('resultado', 'precio_no_valido'); end if;
  if v_p >= e.importe_cliente then return jsonb_build_object('resultado', 'no_es_rebaja'); end if;

  v_rebaja := (e.importe_cliente - v_p) * 100 / e.importe_cliente;
  v_auto := p_num('contraoferta_cliente_auto_pct', 5);
  v_max  := p_num('contraoferta_cliente_max_pct', 15);
  if v_rebaja > v_max then return jsonb_build_object('resultado', 'demasiado_lejos'); end if;

  perform set_config('dynamo.contraoferta_cliente', 'on', true);
  if v_rebaja <= v_auto then
    update envios set precio_inicial_cliente = importe_cliente, importe_cliente = v_p,
                      contraoferta_cliente = v_p, contraoferta_cliente_en = now(),
                      solicitud_estado = 'aceptada', condiciones_aceptadas_en = now(), estado = 'programado'
     where id = p_envio;
    perform registrar_hito(p_envio, 'contraoferta_resuelta', null, null,
      jsonb_build_object('de', 'cliente', 'precio_base', e.importe_cliente, 'precio_propuesto', v_p, 'decision', 'aceptada_auto'));
    perform set_config('dynamo.contraoferta_cliente', 'off', true);
    return jsonb_build_object('resultado', 'aceptada');
  end if;
  update envios set contraoferta_cliente = v_p, contraoferta_cliente_en = now(),
                    solicitud_estado = 'contraoferta', condiciones_aceptadas_en = now()
   where id = p_envio;
  perform registrar_hito(p_envio, 'contraoferta_propuesta', null, null,
    jsonb_build_object('de', 'cliente', 'precio_base', e.importe_cliente, 'precio_propuesto', v_p));
  perform set_config('dynamo.contraoferta_cliente', 'off', true);
  return jsonb_build_object('resultado', 'pendiente_revision');
end $$;
revoke execute on function contraofertar_precio_solicitud(uuid, numeric) from public, anon;
grant execute on function contraofertar_precio_solicitud(uuid, numeric) to authenticated;

-- ---- Dynamo resuelve la contraoferta del cliente ------------------------------------
create or replace function resolver_contraoferta_cliente(p_envio uuid, p_aprobar boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e envios%rowtype; v_horas int;
begin
  if not es_admin() then raise exception 'Solo Dynamo resuelve las contraofertas.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if not found or e.solicitud_estado <> 'contraoferta' or e.estado <> 'borrador' then
    return jsonb_build_object('resultado', 'no_pendiente');
  end if;
  if p_aprobar then
    if e.fecha_carga_desde <= current_date then return jsonb_build_object('resultado', 'fecha_pasada'); end if;
    update envios set precio_inicial_cliente = importe_cliente, importe_cliente = contraoferta_cliente,
                      solicitud_estado = 'aceptada', estado = 'programado'
     where id = p_envio;
  else
    -- Vuelve a nuestro precio, con su validez renovada, para que pueda aceptarlo o cancelar.
    select coalesce((select (valor #>> '{}')::int from parametros where clave = 'solicitud_validez_horas'), 24) into v_horas;
    update envios set solicitud_estado = 'precio_propuesto', condiciones_aceptadas_en = null,
                      precio_valido_hasta = greatest(coalesce(precio_valido_hasta, now()), now() + make_interval(hours => v_horas))
     where id = p_envio;
  end if;
  perform registrar_hito(p_envio, 'contraoferta_resuelta', null, null,
    jsonb_build_object('de', 'cliente', 'precio_base', e.importe_cliente, 'precio_propuesto', e.contraoferta_cliente,
                       'decision', case when p_aprobar then 'aprobada' else 'rechazada' end));
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke execute on function resolver_contraoferta_cliente(uuid, boolean) from public, anon;
grant execute on function resolver_contraoferta_cliente(uuid, boolean) to authenticated;

-- ---- Cancelar también cierra una contraoferta abierta -------------------------------
create or replace function cancelar_mi_envio(p_envio uuid, p_motivo text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_estado estado_envio; v_pen numeric;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select estado into v_estado from envios where id = p_envio for update;
  if v_estado = 'cancelado' then raise exception 'El envío ya está cancelado.'; end if;
  if v_estado not in ('borrador', 'programado') then
    raise exception 'El camión ya va hacia la carga: para cancelar, llámanos al +34 955 225 945.';
  end if;
  update envios set estado = 'cancelado',
                    solicitud_estado = case when solicitud_estado in ('pendiente_precio', 'precio_propuesto', 'contraoferta') then 'rechazada' else solicitud_estado end
   where id = p_envio;
  if nullif(trim(p_motivo), '') is not null then
    perform registrar_hito(p_envio, 'incidencia', null, null, jsonb_build_object('motivo_cancelacion', left(trim(p_motivo), 500), 'por', 'cliente'));
  end if;
  select importe_cliente into v_pen from penalizaciones
   where envio_id = p_envio and generada_auto and estado = 'pendiente_confirmar' order by creado_en desc limit 1;
  return jsonb_build_object('resultado', 'cancelado', 'penalizacion', v_pen is not null, 'importe', v_pen);
end $$;
