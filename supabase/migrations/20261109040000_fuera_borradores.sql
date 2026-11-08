-- =====================================================================================
-- FUERA EL ESTADO «BORRADOR» (usuario, 2026-11-09: «¿qué es estado borrador?»)
-- =====================================================================================
-- «borrador» era el estado interno del flujo viejo de solicitudes de precio (el envío
-- existía pero no estaba confirmado). Con el flujo retirado ya no debe verse nunca, pero
-- quedaban dos agujeros: la conversión del 2026-11-08 y la red horaria solo cubrían los
-- borradores CON estado de solicitud, y los datos de prueba generan algunos SIN él (le
-- salió uno al usuario con la etiqueta «Borrador»). Aquí:
--   1. revisar_precios_programados(): la red convierte TODOS los borradores, tengan o no
--      estado de solicitud (las recargas de datos de prueba quedan cubiertas).
--   2. Se convierten los borradores que queden ahora mismo, con la misma receta: fecha
--      futura → programado con su precio (o 700 €); si no → cancelado sin coste.
-- =====================================================================================

create or replace function revisar_precios_programados()
  returns integer language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare r record; n int := 0; v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  if not (es_servidor() or es_consola_supabase() or es_equipo_dynamo()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  perform set_config('dynamo.revision_precio', 'on', true);
  -- El precio provisional llega a su fecha: queda DEFINITIVO él solo, sin pedir nada a
  -- Dynamo (usuario 2026-11-08: «que se actualice y punto»). Cuando el tarifador real
  -- viva en el servidor, aquí se recalculará con la tarifa del día antes de fijarlo.
  for r in select e.id from envios e
            where e.estado = 'programado' and e.estado_revision_precio in ('pendiente', 'revisar') and e.fecha_revision_precio <= v_hoy
            for update of e skip locked loop
    update envios set estado_revision_precio = 'hecha', revision_precio_en = now() where id = r.id;
    n := n + 1;
  end loop;
  -- Red de seguridad: un envío en «esperando_cliente» (estado de antes del 2026-11-08,
  -- p. ej. recargas de datos de prueba) se resuelve aplicando la subida y avisando.
  for r in select e.id, e.referencia_gx, e.cliente_id, e.importe_cliente, e.importe_revision_nuevo
             from envios e
            where e.estado = 'programado' and e.estado_revision_precio = 'esperando_cliente'
            for update of e skip locked loop
    update envios set estado_revision_precio = 'hecha', revision_precio_en = now(),
                      importe_cliente = coalesce(r.importe_revision_nuevo, importe_cliente) where id = r.id;
    if r.importe_revision_nuevo is not null then
      perform crear_aviso('cliente', r.cliente_id, null, 'precio_subida', 'urgente', 'Nuevo precio de tu envío · #' || coalesce(r.referencia_gx, ''),
        'Al revisarlo antes de la carga, el precio pasa de ' || euros_texto(r.importe_cliente) || ' a ' || euros_texto(r.importe_revision_nuevo) ||
        ' + IVA. Si no te encaja, puedes cancelar el envío sin coste hasta las 9:00 del día hábil anterior a la carga.', '/panel/envios?ver=' || r.id, r.id);
    end if;
    n := n + 1;
  end loop;
  -- Red de seguridad: BORRADORES rezagados, TODOS (flujo de solicitudes retirado el
  -- 2026-11-08; el estado «borrador» ya no existe de cara a nadie, pero las recargas de
  -- datos de prueba aún lo recrean, con o sin estado_solicitud): con fecha futura pasan a
  -- programado con su precio (o el plano del tarifador si no tenían); si no, se cancelan.
  for r in select e.id, e.fecha_carga_desde from envios e
            where e.estado = 'borrador'
            for update of e skip locked loop
    -- A programado solo si puede (fecha futura Y ruta completa, que la exige el validador);
    -- un borrador sin ruta o con la fecha pasada es basura: cancelado sin coste.
    if r.fecha_carga_desde is not null and r.fecha_carga_desde > v_hoy
       and (select count(*) from envio_paradas p where p.envio_id = r.id) >= 2 then
      update envios set estado_solicitud = 'aceptada', condiciones_aceptadas_en = coalesce(condiciones_aceptadas_en, now()),
                        importe_cliente = coalesce(importe_cliente, 700), estado = 'programado' where id = r.id;
    else
      update envios set estado_solicitud = 'rechazada', estado = 'cancelado', cancelacion_sin_coste = true where id = r.id;
    end if;
    n := n + 1;
  end loop;
  perform set_config('dynamo.revision_precio', 'off', true);
  return n;
end $$;
revoke execute on function revisar_precios_programados() from public, anon;
grant execute on function revisar_precios_programados() to authenticated;
comment on function public.revisar_precios_programados() is
  '[Precio y pago] Tarea de cada hora (pg_cron dynamo-revision-precios): el precio provisional que llega a su fecha queda definitivo él solo (cuando el tarifador viva en el servidor, aquí se recalculará antes de fijarlo); resuelve envíos en «esperando_cliente» aplicando la subida con aviso; y convierte TODOS los borradores rezagados, con o sin estado de solicitud (flujo retirado; el estado «borrador» ya no existe de cara a nadie): futuros a programado con su precio o 700 €, el resto a cancelado sin coste. Devuelve cuántos tocó. Quién: servidor, consola y Dynamo.';

-- ---- 2. Conversión de los borradores que queden ahora mismo --------------------------------
do $$ declare r record; v_hoy date := (now() at time zone 'Europe/Madrid')::date; begin
  perform set_config('dynamo.revision_precio', 'on', true);
  for r in select e.id, e.fecha_carga_desde from envios e where e.estado = 'borrador' loop
    -- A programado solo si puede (fecha futura Y ruta completa, que la exige el validador);
    -- un borrador sin ruta o con la fecha pasada es basura: cancelado sin coste.
    if r.fecha_carga_desde is not null and r.fecha_carga_desde > v_hoy
       and (select count(*) from envio_paradas p where p.envio_id = r.id) >= 2 then
      update envios set estado_solicitud = 'aceptada', condiciones_aceptadas_en = coalesce(condiciones_aceptadas_en, now()),
                        importe_cliente = coalesce(importe_cliente, 700), estado = 'programado' where id = r.id;
    else
      update envios set estado_solicitud = 'rechazada', estado = 'cancelado', cancelacion_sin_coste = true where id = r.id;
    end if;
  end loop;
  perform set_config('dynamo.revision_precio', 'off', true);
end $$;
