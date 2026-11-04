-- =====================================================================================
-- CON CAMIÓN ASIGNADO, EL CLIENTE NO MODIFICA: LLAMA (usuario, 2026-11-04)
--
-- Hasta ahora, con camión asignado el cambio quedaba «pendiente» para Dynamo. Ahora no se
-- admite: el cliente ve un aviso para que llame URGENTE. Dynamo lo contrasta con el
-- conductor: si es viable, lo cambia Dynamo; si no, se cancela la carga (con los costes
-- según el plazo: gratis hasta las 9:00 del día hábil anterior, después el servicio
-- completo; y cuenta para la suspensión por cancelaciones si la hace en su nombre desde
-- «Ver como» cliente) y se reasigna camión.
-- Modificar nunca tiene coste en sí. Sin camión todo sigue igual (solo fechas → al
-- momento; otra cosa → la revisa Dynamo). Al retarifar con el tarifador, la ventana de
-- carga empezará el día del cambio (pendiente del tarifador).
-- Los cambios que ya estaban pendientes con camión se pueden seguir resolviendo.
-- =====================================================================================

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
  -- Con camión asignado (o asignándose) no se modifica desde la plataforma: hay que llamar.
  if not v_libre then return jsonb_build_object('resultado', 'con_camion'); end if;
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
