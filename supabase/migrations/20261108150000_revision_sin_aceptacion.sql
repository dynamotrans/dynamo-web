-- =====================================================================================
-- REVISIÓN DE PRECIO SIN ACEPTACIÓN DEL CLIENTE (v1.0, usuario 2026-11-08)
-- =====================================================================================
-- Decisión del usuario: cuando se revisa el precio de un envío programado con mucha
-- antelación y sube más del margen, el precio nuevo SE APLICA SOLO. No hace falta que
-- el cliente lo acepte: se le avisa (campana hoy; email y WhatsApp cuando se conecten
-- las notificaciones) y, como con cualquier envío, puede cancelar sin coste mientras
-- no tenga camión asignado.
--
-- Cambia respecto a 20261105190000_revision_precio.sql:
--   1. revisar_precio_envio: la subida ya no deja el envío en «esperando_cliente»;
--      aplica el precio nuevo (estado «hecha») y avisa al cliente. El envío queda
--      ofertable en el acto.
--   2. responder_subida_precio desaparece (no hay nada que aceptar ni cancelar).
--   3. revisar_precios_programados pierde el recordatorio «no contesta» (ya no hay
--      respuesta que esperar) y gana una red de seguridad: si quedara algún envío en
--      «esperando_cliente» (de antes de este cambio, o de los datos de prueba), le
--      aplica la subida y avisa.
--   4. Fuera el parámetro precio_revision_respuesta_horas (era el plazo de respuesta).
--   5. Los envíos que hoy estén en «esperando_cliente» se convierten ya aquí.
-- El valor «esperando_cliente» sigue siendo válido en la columna (filas antiguas en
-- auditoría y datos de prueba); simplemente ya no se produce, y si aparece, la tarea
-- horaria lo resuelve.
-- Prueba 129 actualizada a este comportamiento.
-- =====================================================================================


-- =====================================================================================
-- 1. LA REVISIÓN APLICA LA SUBIDA DIRECTAMENTE
-- =====================================================================================
create or replace function revisar_precio_envio(p_envio uuid, p_nuevo numeric)
  returns jsonb language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare e record; v_margen numeric := parametro_num('precio_revision_margen_pct', 5); v_res text; v_ref text;
begin
  if not (es_equipo_dynamo() or es_servidor()) then raise exception 'Solo Dynamo revisa el precio.' using errcode = '42501'; end if;
  select id, referencia_gx, cliente_id, estado, importe_cliente, estado_revision_precio into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if e.estado <> 'programado' or not precio_por_revisar(e.estado_revision_precio) then return jsonb_build_object('resultado', 'no_provisional'); end if;
  if p_nuevo is null or p_nuevo <= 0 then return jsonb_build_object('resultado', 'precio_no_valido'); end if;
  p_nuevo := round(p_nuevo, 2);
  v_ref := '#' || coalesce(e.referencia_gx, '');
  perform set_config('dynamo.revision_precio', 'on', true);
  if e.importe_cliente is null or e.importe_cliente = 0 or abs(p_nuevo - e.importe_cliente) * 100 / e.importe_cliente < v_margen then
    update envios set estado_revision_precio = 'hecha', revision_precio_en = now(), importe_revision_anterior = importe_cliente, importe_revision_nuevo = p_nuevo,
                      importe_cliente = coalesce(importe_cliente, p_nuevo) where id = p_envio;
    v_res := 'mantenido';
    perform crear_aviso('cliente', e.cliente_id, null, 'precio_confirmado', 'ok', 'Precio confirmado · ' || v_ref,
      'Hemos revisado el precio antes de la carga y se mantiene: ' || euros_texto(coalesce(e.importe_cliente, p_nuevo)) || ' + IVA.', '/panel/envios?ver=' || e.id, e.id);
  elsif p_nuevo < e.importe_cliente then
    update envios set estado_revision_precio = 'hecha', revision_precio_en = now(), importe_revision_anterior = importe_cliente, importe_revision_nuevo = p_nuevo,
                      importe_cliente = p_nuevo where id = p_envio;
    v_res := 'bajado';
    perform crear_aviso('cliente', e.cliente_id, null, 'precio_bajado', 'ok', 'Tu envío baja de precio · ' || v_ref,
      'Al revisarlo antes de la carga, el precio baja de ' || euros_texto(e.importe_cliente) || ' a ' || euros_texto(p_nuevo) || ' + IVA.', '/panel/envios?ver=' || e.id, e.id);
  else
    -- La subida se aplica directamente: nada que aceptar. El cliente puede cancelar
    -- sin coste mientras el envío no tenga camión asignado (regla general).
    update envios set estado_revision_precio = 'hecha', revision_precio_en = now(), importe_revision_anterior = importe_cliente,
                      importe_revision_nuevo = p_nuevo, importe_cliente = p_nuevo, revision_precio_recordada = false where id = p_envio;
    v_res := 'subida';
    perform crear_aviso('cliente', e.cliente_id, null, 'precio_subida', 'urgente', 'Nuevo precio de tu envío · ' || v_ref,
      'Al revisarlo antes de la carga, el precio pasa de ' || euros_texto(e.importe_cliente) || ' a ' || euros_texto(p_nuevo) ||
      ' + IVA. Si no te encaja, puedes cancelar el envío sin coste mientras no tenga camión asignado.', '/panel/envios?ver=' || e.id, e.id);
  end if;
  perform set_config('dynamo.revision_precio', 'off', true);
  return jsonb_build_object('resultado', v_res);
end $$;
revoke execute on function revisar_precio_envio(uuid, numeric) from public, anon;
grant execute on function revisar_precio_envio(uuid, numeric) to authenticated;
comment on function public.revisar_precio_envio(uuid, numeric) is
  '[Precio y pago] Fija el precio definitivo de un envío con precio provisional. Si cambia menos del margen (parámetro, 5 %) se mantiene; si baja, se aplica; si sube más del margen, TAMBIÉN se aplica (desde 2026-11-08 no requiere aceptación del cliente, que puede cancelar sin coste mientras no haya camión asignado). Avisa al cliente en cada caso. Devuelve {resultado: mantenido | bajado | subida | no_existe | no_provisional | precio_no_valido}. Quién: Dynamo y servidor. Argumentos: p_envio: envios.id (programado con precio por revisar) · p_nuevo: precio al cliente en euros sin IVA.';


-- =====================================================================================
-- 2. FUERA responder_subida_precio Y SU PARÁMETRO DE PLAZO
-- =====================================================================================
drop function if exists responder_subida_precio(uuid, boolean, numeric);
delete from parametros where clave = 'precio_revision_respuesta_horas';


-- =====================================================================================
-- 3. TAREA HORARIA: SIN RECORDATORIO «NO CONTESTA», CON RED DE SEGURIDAD
-- =====================================================================================
create or replace function revisar_precios_programados()
  returns integer language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare r record; n int := 0; v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  if not (es_servidor() or es_consola_supabase() or es_equipo_dynamo()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  perform set_config('dynamo.revision_precio', 'on', true);
  for r in select e.id, e.referencia_gx, e.fecha_carga_desde, c.nombre_visible
             from envios e join clientes c on c.id = e.cliente_id
            where e.estado = 'programado' and e.estado_revision_precio = 'pendiente' and e.fecha_revision_precio <= v_hoy
            for update of e skip locked loop
    update envios set estado_revision_precio = 'revisar' where id = r.id;
    perform crear_aviso('dynamo', null, null, 'requiere_revision_precio', 'aviso', 'Toca revisar el precio · #' || coalesce(r.referencia_gx, ''),
      coalesce(r.nombre_visible, 'Cliente') || ' · carga el ' || fecha_texto(r.fecha_carga_desde) || '. Pon el precio definitivo en la ficha.', '/panel/envios?ver=' || r.id, r.id);
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
        ' + IVA. Si no te encaja, puedes cancelar el envío sin coste mientras no tenga camión asignado.', '/panel/envios?ver=' || r.id, r.id);
    end if;
    n := n + 1;
  end loop;
  perform set_config('dynamo.revision_precio', 'off', true);
  return n;
end $$;
revoke execute on function revisar_precios_programados() from public, anon;
grant execute on function revisar_precios_programados() to authenticated;
comment on function public.revisar_precios_programados() is
  '[Precio y pago] Tarea de cada hora (pg_cron dynamo-revision-precios): los envíos cuyo precio provisional llega a su fecha pasan a «revisar» con aviso a Dynamo; y si queda algún envío en «esperando_cliente» (estado anterior al 2026-11-08), le aplica la subida y avisa al cliente. Devuelve cuántos tocó. Quién: servidor, consola y Dynamo.';


-- =====================================================================================
-- 4. CONVERSIÓN DE LO QUE HUBIERA ESPERANDO
-- =====================================================================================
do $$ declare r record; begin
  perform set_config('dynamo.revision_precio', 'on', true);
  for r in select e.id, e.referencia_gx, e.cliente_id, e.importe_cliente, e.importe_revision_nuevo
             from envios e where e.estado = 'programado' and e.estado_revision_precio = 'esperando_cliente' loop
    update envios set estado_revision_precio = 'hecha', revision_precio_en = now(),
                      importe_cliente = coalesce(r.importe_revision_nuevo, importe_cliente) where id = r.id;
    if r.importe_revision_nuevo is not null then
      perform crear_aviso('cliente', r.cliente_id, null, 'precio_subida', 'urgente', 'Nuevo precio de tu envío · #' || coalesce(r.referencia_gx, ''),
        'Al revisarlo antes de la carga, el precio pasa de ' || euros_texto(r.importe_cliente) || ' a ' || euros_texto(r.importe_revision_nuevo) ||
        ' + IVA. Si no te encaja, puedes cancelar el envío sin coste mientras no tenga camión asignado.', '/panel/envios?ver=' || r.id, r.id);
    end if;
  end loop;
  perform set_config('dynamo.revision_precio', 'off', true);
end $$;
