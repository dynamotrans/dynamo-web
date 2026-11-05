-- =====================================================================================
-- PLAZO PARA PAGAR UN ENVÍO PENDIENTE DE PAGO (usuario, 2026-11-05)
-- «Cuando hay pago pendiente, le mantengo poder pagar esa proforma/envío esas X horas; si
-- no, ese envío-proforma se autoanula, y debe cotizar de nuevo y dejar pendiente de pago
-- otra vez al precio que calcule el tarifador.»
--   · Parámetro `previo_pago_horas` (24): horas para pagar desde que el envío queda
--     pendiente de pago (envios.pago_pendiente_desde, la pone la base de datos).
--   · caducar_pagos_pendientes() (pg_cron, cada 15 min): anula los que pasan del plazo
--     (+45 min de margen, lo que puede durar abierta la página de pago de Stripe). No
--     cuenta como cancelación del cliente (la hace el sistema). Aviso al cliente con el
--     enlace para volver a pedirlo, y a Dynamo.
--   · Dynamo puede ampliar el plazo (ampliar_plazo_pago), p. ej. si el cliente dice que
--     ya ha hecho la transferencia.
--   · Un pago con tarjeta que llega con el envío ya anulado no lo reactiva: aviso urgente
--     a Dynamo para devolverlo.
-- (Distinto de `solicitud_validez_horas`: lo que vale el precio que Dynamo da a mano a una
-- solicitud, hasta que llegue el tarifador.)
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('previo_pago_horas', '24', 'Horas que tiene el cliente para pagar un envío pendiente de pago. Pasado el plazo, el envío se anula solo.')
on conflict (clave) do nothing;

alter table envios add column pago_pendiente_desde timestamptz;
comment on column envios.pago_pendiente_desde is 'Desde cuándo está pendiente de pago (para el plazo de previo_pago_horas). La pone la base de datos.';
update envios set pago_pendiente_desde = now() where pago_previo = 'pendiente' and estado = 'programado';

-- La pone la base de datos: al quedar pendiente de pago, «ahora». Nadie la toca salvo
-- Dynamo o el servidor (para ampliar el plazo).
create or replace function fn_envios_pago_plazo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.pago_pendiente_desde := case when new.pago_previo = 'pendiente' then now() end;
  elsif new.pago_previo = 'pendiente' and old.pago_previo is distinct from 'pendiente' then
    new.pago_pendiente_desde := now();
  elsif new.pago_pendiente_desde is distinct from old.pago_pendiente_desde and not (es_admin() or es_servidor()) then
    new.pago_pendiente_desde := old.pago_pendiente_desde;
  end if;
  return new;
end $$;
revoke execute on function fn_envios_pago_plazo() from public, anon, authenticated;
create trigger tg_envios_zzz_pago_plazo before insert or update on envios
  for each row execute function fn_envios_pago_plazo();

create or replace function pago_limite(p_desde timestamptz)
returns timestamptz language sql stable security definer set search_path = public as $$
  select p_desde + make_interval(hours => p_num('previo_pago_horas', 24)::int)
$$;

-- ---- Anular los que no se pagan a tiempo ---------------------------------------------
create or replace function caducar_pagos_pendientes()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not (es_servidor() or es_consola_supabase() or es_admin()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  for r in select id from envios
            where estado = 'programado' and pago_previo = 'pendiente' and pago_pendiente_desde is not null
              and transportista_id is null
              and now() > pago_limite(pago_pendiente_desde) + interval '45 minutes'
            for update skip locked loop
    update envios set estado = 'cancelado' where id = r.id;
    perform registrar_hito(r.id, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', 'Anulado: no se recibió el pago a tiempo', 'por', 'sistema'), 'servidor');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function caducar_pagos_pendientes() from public, anon;
grant execute on function caducar_pagos_pendientes() to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('dynamo-pagos-caducados', '*/15 * * * *', 'select public.caducar_pagos_pendientes()');
    exception when others then
      raise notice 'No se pudo programar la caducidad de pagos (%).', sqlerrm;
    end;
  end if;
end $$;

-- ---- Dynamo amplía el plazo ----------------------------------------------------------
create or replace function ampliar_plazo_pago(p_envio uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo Dynamo.' using errcode = '42501'; end if;
  update envios set pago_pendiente_desde = now()
   where id = p_envio and estado = 'programado' and pago_previo = 'pendiente';
  return jsonb_build_object('resultado', case when found then 'ok' else 'no_pendiente' end);
end $$;
revoke execute on function ampliar_plazo_pago(uuid) from public, anon;
grant execute on function ampliar_plazo_pago(uuid) to authenticated;

-- ---- Lo que ve el cliente (y Dynamo): con la hora límite para pagar --------------------
drop function if exists pagos_envio(uuid);
create function pagos_envio(p_envio uuid default null)
returns table (envio_id uuid, referencia_gx text, referencia_cliente text, estado text, pago_previo text, pago_motivo text,
               pago_metodo text, pagado_en timestamptz, base numeric, iva numeric, total numeric, pago_limite timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.referencia_gx, e.referencia_cliente, e.estado::text, e.pago_previo, e.pago_motivo, e.pago_metodo, e.pagado_en, i.base, i.iva, i.total,
         case when e.pago_previo = 'pendiente' and e.pago_pendiente_desde is not null then pago_limite(e.pago_pendiente_desde) end
    from envios e cross join lateral pago_envio_importes(e.id) i
   where e.pago_previo <> 'no_requerido'
     and (p_envio is null or e.id = p_envio)
     and (ve_todo() or e.cliente_id = cliente_del_usuario())
$$;
revoke execute on function pagos_envio(uuid) from public, anon;
grant execute on function pagos_envio(uuid) to authenticated;

create or replace function pago_envio_stripe(p_envio uuid, p_pago text, p_centimos bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e record; t numeric;
begin
  if not es_servidor() then raise exception 'Solo el servidor confirma pagos con tarjeta.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if e.stripe_pago = p_pago then return jsonb_build_object('resultado', 'ya_registrado'); end if;
  -- Pago que llega cuando el envío ya está anulado (por ejemplo, fuera de plazo): no lo
  -- reactiva; se avisa a Dynamo para devolverlo en Stripe.
  if e.estado = 'cancelado' then
    perform crear_aviso('dynamo', null, null, 'pago_anulado', 'urgente', 'Pago con tarjeta de un envío anulado · #' || coalesce(e.referencia_gx, ''),
      'Devuélvelo en Stripe (pago ' || p_pago || ') o reactiva el envío si el cliente aún lo quiere.', '/panel/envios?ver=' || e.id, e.id);
    return jsonb_build_object('resultado', 'envio_anulado');
  end if;
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

create or replace function fn_avisos_envios()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rol text := (select rol::text from usuarios where id = auth.uid());
  v_dynamo boolean := coalesce(v_rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura'), false);
  v_por_cliente boolean := coalesce(v_rol = 'cliente', false);
  v_ref text := '#' || coalesce(new.referencia_gx, '');
  v_cli text;
  v_enl text := '/panel/envios?ver=' || new.id;
  o_sol text; o_est estado_envio; o_cam text; o_pago text; o_tr uuid;
begin
  if coalesce(new.es_manual, false) then return null; end if;
  select nombre_visible into v_cli from clientes where id = new.cliente_id;
  v_cli := coalesce(v_cli, 'El cliente');
  if tg_op = 'UPDATE' then
    o_sol := old.solicitud_estado; o_est := old.estado; o_cam := old.cambio_cliente_estado; o_pago := old.pago_previo; o_tr := old.transportista_id;
  end if;

  -- Solicitudes de precio y contraofertas del cliente.
  if new.solicitud_estado is distinct from o_sol then
    if new.solicitud_estado = 'pendiente_precio' then
      perform crear_aviso('dynamo', null, null, 'solicitud', 'aviso', 'Solicitud de precio · ' || v_ref,
        v_cli || case when o_sol = 'precio_propuesto' then ' vuelve a pedir precio (el anterior caducó).' else ' pide precio para un envío.' end, v_enl, new.id);
    elsif new.solicitud_estado = 'precio_propuesto' then
      if o_sol = 'contraoferta' then
        perform crear_aviso('cliente', new.cliente_id, null, 'contraoferta_rechazada', 'aviso', 'Tu propuesta de precio no se ha aceptado · ' || v_ref,
          'Puedes aceptar nuestro precio (' || euros_txt(new.importe_cliente) || ' + IVA) o cancelar sin coste.', v_enl, new.id);
      else
        perform crear_aviso('cliente', new.cliente_id, null, 'precio', 'ok', 'Ya tienes precio · envío ' || v_ref,
          euros_txt(new.importe_cliente) || ' + IVA. Revísalo y acéptalo antes de que caduque.', v_enl, new.id);
      end if;
    elsif new.solicitud_estado = 'contraoferta' then
      perform crear_aviso('dynamo', null, null, 'contraoferta_cliente', 'aviso', 'Contraoferta del cliente · ' || v_ref,
        v_cli || ' propone ' || euros_txt(new.contraoferta_cliente) || ' (le dimos ' || euros_txt(new.importe_cliente) || ').', v_enl, new.id);
    elsif new.solicitud_estado = 'aceptada' and o_sol = 'contraoferta' then
      perform crear_aviso('cliente', new.cliente_id, null, 'contraoferta_aceptada', 'ok', 'Aceptamos tu precio · ' || v_ref,
        'Tu envío queda confirmado a ' || euros_txt(new.importe_cliente) || ' + IVA.', v_enl, new.id);
    end if;
  end if;

  -- El cliente confirma su envío.
  if tg_op = 'UPDATE' and o_est = 'borrador' and new.estado = 'programado' and v_por_cliente then
    perform crear_aviso('dynamo', null, null, 'confirmado', 'info', 'Envío confirmado · ' || v_ref,
      v_cli || ' lo ha confirmado' || case when new.pago_previo = 'pendiente' then ' (pendiente de pago).' else '.' end, v_enl, new.id);
  end if;

  -- Cambios pedidos por el cliente.
  if new.cambio_cliente_estado is distinct from o_cam then
    if new.cambio_cliente_estado = 'pendiente' then
      perform crear_aviso('dynamo', null, null, 'cambio', 'aviso', 'Cambio pedido · ' || v_ref, v_cli || ' pide un cambio en su envío.', v_enl, new.id);
    elsif new.cambio_cliente_estado in ('aceptado', 'rechazado') then
      perform crear_aviso('cliente', new.cliente_id, null, 'cambio_' || new.cambio_cliente_estado,
        case when new.cambio_cliente_estado = 'aceptado' then 'ok' else 'aviso' end,
        'Tu cambio ha sido ' || new.cambio_cliente_estado || ' · ' || v_ref, new.cambio_cliente_nota, v_enl, new.id);
    end if;
  end if;

  -- Pago por adelantado.
  if tg_op = 'UPDATE' and o_pago = 'pendiente' and new.pago_previo = 'pagado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'pagado', 'ok', 'Pago recibido · ' || v_ref, 'Gracias. Ya buscamos camión para tu envío.', v_enl, new.id);
    if not v_dynamo then
      perform crear_aviso('dynamo', null, null, 'pagado', 'ok', 'Pago recibido · ' || v_ref,
        v_cli || ' ha pagado' || case when new.pago_metodo = 'stripe' then ' con tarjeta.' else '.' end || ' Ya se puede asignar.', v_enl, new.id);
    end if;
  elsif tg_op = 'UPDATE' and o_pago = 'pendiente' and new.pago_previo = 'exento' then
    perform crear_aviso('cliente', new.cliente_id, null, 'exento', 'ok', 'Ya no hace falta pagar por adelantado · ' || v_ref, 'Lo pagarás a tu plazo habitual.', v_enl, new.id);
  end if;

  -- Transportista asignado.
  if tg_op = 'UPDATE' and new.transportista_id is not null and new.transportista_id is distinct from o_tr and new.estado <> 'cancelado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'asignado', 'ok', 'Tu envío ya tiene transportista · ' || v_ref, null, v_enl, new.id);
    perform crear_aviso('transportista', null, new.transportista_id, 'asignada', 'ok', 'Carga asignada · ' || v_ref,
      'Revisa los datos y la orden de carga.', v_enl, new.id);
  end if;

  -- En ruta, entregado, cancelado.
  if tg_op = 'UPDATE' and new.estado is distinct from o_est then
    if new.estado = 'en_ruta' then
      perform crear_aviso('cliente', new.cliente_id, null, 'en_ruta', 'info', 'Cargado y en ruta · ' || v_ref, null, v_enl, new.id);
    elsif new.estado = 'entregado' then
      perform crear_aviso('cliente', new.cliente_id, null, 'entregado', 'ok', 'Entregado · ' || v_ref, null, v_enl, new.id);
    elsif new.estado = 'cancelado' then
      if v_por_cliente then
        perform crear_aviso('dynamo', null, null, 'cancelado', case when o_tr is not null then 'urgente' else 'aviso' end,
          'Cancelado por el cliente · ' || v_ref,
          v_cli || ' lo ha cancelado' || case when o_tr is not null then '. Tenía camión: avisa al transportista.' else '.' end, v_enl, new.id);
      elsif auth.uid() is null and new.pago_previo = 'pendiente' then
        -- Anulado por el sistema: pasó el plazo para pagar.
        perform crear_aviso('cliente', new.cliente_id, null, 'pago_caducado', 'aviso', 'Envío anulado: no recibimos el pago · ' || v_ref,
          'Pasó el plazo para pagar. Si aún lo necesitas, vuelve a pedirlo: el precio se recalcula.', '/panel/nuevo-envio?repetir=' || new.id, new.id);
        perform crear_aviso('dynamo', null, null, 'pago_caducado', 'info', 'Anulado por falta de pago · ' || v_ref,
          v_cli || ' no pagó a tiempo.', v_enl, new.id);
      elsif o_est <> 'borrador' then
        perform crear_aviso('cliente', new.cliente_id, null, 'cancelado', 'aviso', 'Envío cancelado · ' || v_ref,
          'Si no lo esperabas, llámanos al +34 955 225 945.', v_enl, new.id);
      end if;
      if o_tr is not null then
        perform crear_aviso('transportista', null, o_tr, 'cancelada', 'urgente', 'Carga cancelada · ' || v_ref,
          'No vayas a cargar. Si tienes dudas, llámanos al +34 955 225 945.', null, new.id);
      end if;
    end if;
  end if;
  return null;
end $$;
