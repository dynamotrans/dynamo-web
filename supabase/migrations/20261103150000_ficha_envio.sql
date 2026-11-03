-- =====================================================================================
-- FICHA DEL ENVÍO: CANCELAR Y DESHACER LA CANCELACIÓN (Dynamo) — 2026-11-03
-- =====================================================================================
-- La ficha del envío del panel tiene "Cancelar envío" y "Deshacer cancelación" (mockup).
-- Lo demás de la ficha (asignar transportista, cambiar de fase, modificar datos) son
-- cambios normales en `envios` que Dynamo ya puede hacer y que los triggers vigilan
-- (hitos con su hora, penalización automática, vehículos…).
--
--   cancelar_envio(envio, motivo)   → lo cancela y deja el motivo en el historial.
--                                     La penalización (si toca: con camión y fuera de
--                                     plazo) la pone el trigger de siempre.
--   deshacer_cancelacion(envio)     → vuelve al estado que tenía antes de cancelarse;
--                                     la penalización automática sin tocar se retira.
-- =====================================================================================

create or replace function cancelar_envio(p_envio uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_estado estado_envio; v_pen numeric;
begin
  if not es_admin() then
    raise exception 'Solo Dynamo puede cancelar un envío desde la ficha.' using errcode = '42501';
  end if;
  select estado into v_estado from envios where id = p_envio for update;
  if v_estado is null then raise exception 'Ese envío no existe.'; end if;
  if v_estado = 'cancelado' then raise exception 'El envío ya está cancelado.'; end if;
  update envios set estado = 'cancelado' where id = p_envio;
  if nullif(trim(p_motivo), '') is not null then
    perform registrar_hito(p_envio, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', left(trim(p_motivo), 500)));
  end if;
  select importe_cliente into v_pen from penalizaciones
   where envio_id = p_envio and generada_auto and estado = 'pendiente_confirmar'
   order by creado_en desc limit 1;
  return jsonb_build_object('penalizacion', v_pen is not null, 'importe', v_pen);
end $$;

create or replace function deshacer_cancelacion(p_envio uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_estado estado_envio; v_antes text;
begin
  if not es_admin() then
    raise exception 'Solo Dynamo puede deshacer una cancelación.' using errcode = '42501';
  end if;
  select estado into v_estado from envios where id = p_envio for update;
  if v_estado is distinct from 'cancelado' then raise exception 'El envío no está cancelado.'; end if;
  -- El estado de antes, del hito de la cancelación (el más reciente).
  select datos ->> 'estado_anterior' into v_antes from envio_hitos
   where envio_id = p_envio and hito = 'cancelado' order by cuando desc limit 1;
  if v_antes is null or v_antes in ('borrador', 'cancelado') then v_antes := 'programado'; end if;
  update envios set estado = v_antes::estado_envio where id = p_envio;
  return v_antes;
end $$;

revoke execute on function cancelar_envio(uuid, text)    from public, anon;
revoke execute on function deshacer_cancelacion(uuid)    from public, anon;
comment on function cancelar_envio(uuid, text) is
  'Ficha del envio (Dynamo): cancela y guarda el motivo en el historial. Devuelve si se ha '
  'generado penalizacion automatica (con camion asignado y fuera de plazo) y su importe.';
comment on function deshacer_cancelacion(uuid) is
  'Ficha del envio (Dynamo): vuelve al estado que tenia antes de cancelarse. La penalizacion '
  'automatica sin editar se retira sola (trigger).';
