-- =====================================================================================
-- MÁS AVISOS EN LA CAMPANA (2026-11-05)
-- Los que faltaban para clientes y transportistas:
--   · penalización confirmada → al cliente (con SU importe) y al transportista (con el
--     SUYO); nunca el importe del otro;
--   · incidencia resuelta → a la empresa que la abrió (cliente o transportista);
--   · almacenamiento confirmado o cancelado por Dynamo → al cliente;
--   · albarán o CMR firmado disponible (documento visible para el cliente) → al cliente;
--   · CMR firmado en la entrega (casilla del destinatario) → al cliente;
--   · cuenta activada (alta aprobada) → a su empresa.
-- =====================================================================================

-- ---- Penalizaciones -------------------------------------------------------------------
create or replace function fn_avisos_penalizaciones()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record; v_tipo text;
begin
  if not (new.estado = 'confirmada' and old.estado is distinct from 'confirmada') then return null; end if;
  select id, referencia_gx, cliente_id, transportista_id into e from envios where id = new.envio_id;
  select nombre into v_tipo from tipos_penalizacion where id = new.tipo_id;
  if coalesce(new.importe_cliente, 0) > 0 then
    perform crear_aviso('cliente', e.cliente_id, null, 'penalizacion', 'aviso', 'Penalización · envío #' || coalesce(e.referencia_gx, ''),
      coalesce(v_tipo, 'Penalización') || ': ' || euros_txt(new.importe_cliente) || ' + IVA. Puedes verla y alegar en Penalizaciones.', '/panel/penalizaciones', e.id);
  end if;
  if coalesce(new.importe_transportista, 0) > 0 and e.transportista_id is not null then
    perform crear_aviso('transportista', null, e.transportista_id, 'penalizacion', 'aviso', 'Penalización · carga #' || coalesce(e.referencia_gx, ''),
      coalesce(v_tipo, 'Penalización') || ': ' || euros_txt(new.importe_transportista) || '. Puedes verla y alegar en Penalizaciones.', '/panel/penalizaciones', e.id);
  end if;
  return null;
end $$;
revoke execute on function fn_avisos_penalizaciones() from public, anon, authenticated;
create trigger tg_avisos_penalizaciones after update of estado on penalizaciones
  for each row execute function fn_avisos_penalizaciones();

-- ---- Incidencias resueltas --------------------------------------------------------------
create or replace function fn_avisos_incidencia_resuelta()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol text; v_ref text;
begin
  if not (new.estado = 'resuelto' and old.estado is distinct from 'resuelto') then return null; end if;
  select rol::text into v_rol from usuarios where id = new.creado_por;
  if new.envio_id is not null then select ' · #' || coalesce(referencia_gx, '') into v_ref from envios where id = new.envio_id; end if;
  if v_rol = 'cliente' and new.cliente_id is not null then
    perform crear_aviso('cliente', new.cliente_id, null, 'incidencia_resuelta', 'ok', 'Incidencia resuelta' || coalesce(v_ref, ''),
      new.titulo || coalesce(': ' || left(new.resolucion, 200), ''), '/panel/incidencias', new.envio_id);
  elsif v_rol = 'transportista' and new.transportista_id is not null then
    perform crear_aviso('transportista', null, new.transportista_id, 'incidencia_resuelta', 'ok', 'Incidencia resuelta' || coalesce(v_ref, ''),
      new.titulo || coalesce(': ' || left(new.resolucion, 200), ''), '/panel/incidencias', new.envio_id);
  end if;
  return null;
end $$;
revoke execute on function fn_avisos_incidencia_resuelta() from public, anon, authenticated;
create trigger tg_avisos_incidencia_resuelta after update of estado on incidencias
  for each row execute function fn_avisos_incidencia_resuelta();

-- ---- Almacenamientos ----------------------------------------------------------------------
create or replace function fn_avisos_almacenamientos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_dynamo boolean := coalesce((select rol::text in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') from usuarios where id = auth.uid()), false);
begin
  if new.estado = old.estado or not v_dynamo then return null; end if;
  if new.estado = 'confirmado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'almacen_confirmado', 'ok', 'Almacenamiento confirmado · ' || new.codigo,
      'Entrada el ' || to_char(new.fecha_entrada, 'DD/MM/YYYY') || '.', '/panel/almacenamientos', null);
  elsif new.estado = 'cancelado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'almacen_cancelado', 'aviso', 'Almacenamiento cancelado · ' || new.codigo,
      'Si no lo esperabas, llámanos al +34 955 225 945.', '/panel/almacenamientos', null);
  end if;
  return null;
end $$;
revoke execute on function fn_avisos_almacenamientos() from public, anon, authenticated;
create trigger tg_avisos_almacenamientos after update of estado on almacenamientos
  for each row execute function fn_avisos_almacenamientos();

-- ---- Documentos para el cliente (albarán, CMR firmado) --------------------------------
create or replace function fn_avisos_documentos()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if new.envio_id is null or not new.visible_cliente or new.tipo not in ('albaran', 'cmr_firmado') then return null; end if;
  if tg_op = 'UPDATE' and old.visible_cliente then return null; end if;
  select id, referencia_gx, cliente_id into e from envios where id = new.envio_id;
  perform crear_aviso('cliente', e.cliente_id, null, 'documento', 'info',
    case new.tipo when 'albaran' then 'Albarán disponible' else 'CMR firmado disponible' end || ' · #' || coalesce(e.referencia_gx, ''),
    'Lo tienes en la ficha del envío, en Documentos.', '/panel/envios?ver=' || e.id, e.id);
  return null;
end $$;
revoke execute on function fn_avisos_documentos() from public, anon, authenticated;
create trigger tg_avisos_documentos after insert or update of visible_cliente on documentos
  for each row execute function fn_avisos_documentos();

-- ---- CMR firmado en la entrega --------------------------------------------------------
create or replace function fn_avisos_firmas_cmr()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if new.rol <> 'destinatario' then return null; end if;
  select id, referencia_gx, cliente_id into e from envios where id = new.envio_id;
  perform crear_aviso('cliente', e.cliente_id, null, 'cmr_entrega', 'ok', 'CMR firmado en la entrega · #' || coalesce(e.referencia_gx, ''),
    'Firmado por ' || new.nombre || ' el ' || to_char(new.firmado_en at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') || '.', '/panel/envios?ver=' || e.id, e.id);
  return null;
end $$;
revoke execute on function fn_avisos_firmas_cmr() from public, anon, authenticated;
create trigger tg_avisos_firmas_cmr after insert on firmas_cmr
  for each row execute function fn_avisos_firmas_cmr();

-- ---- Cuenta activada ---------------------------------------------------------------------
create or replace function fn_avisos_cuenta_activada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'pendiente_verificacion' and new.estado = 'activa' then
    if new.cliente_id is not null then
      perform crear_aviso('cliente', new.cliente_id, null, 'cuenta_activada', 'ok', 'Cuenta activada',
        coalesce(new.nombre, new.email) || ' ya puede pedir envíos y ver los de la empresa. ¡Bienvenido a Dynamo!', '/panel/nuevo-envio', null);
    elsif new.transportista_id is not null then
      perform crear_aviso('transportista', null, new.transportista_id, 'cuenta_activada', 'ok', 'Cuenta activada',
        coalesce(new.nombre, new.email) || ' ya puede ver sus viajes en Dynamo.', '/panel/envios', null);
    end if;
  end if;
  return null;
end $$;
revoke execute on function fn_avisos_cuenta_activada() from public, anon, authenticated;
create trigger tg_avisos_cuenta_activada after update of estado on usuarios
  for each row execute function fn_avisos_cuenta_activada();
