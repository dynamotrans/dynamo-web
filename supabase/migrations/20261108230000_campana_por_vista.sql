-- =====================================================================================
-- CAMPANA Y NÚMEROS DEL MENÚ SEGÚN LA VISTA «VER COMO» (usuario 2026-11-08)
-- =====================================================================================
-- Con «Ver como» un cliente o un transportista, la campana y los números del menú
-- lateral enseñaban los contadores GLOBALES de Dynamo (23 incidencias, 27 pagos…), no
-- los de esa empresa. Las Novedades ya iban filtradas (mis_avisos); faltaban los
-- contadores: contadores_panel() gana p_cliente / p_transportista opcionales, que solo
-- atiende el equipo de Dynamo. Con p_cliente devuelve los números QUE VERÍA ese cliente
-- (misma forma que su rama) y con p_transportista los de ese transportista; un cliente
-- o transportista que los pase los tiene ignorados (siempre lo suyo).
--
-- Añadir parámetros con valor por defecto crea OTRA función con el mismo nombre, así
-- que primero se quita la firma vieja.
-- =====================================================================================

drop function if exists contadores_panel();
create or replace function contadores_panel(p_cliente uuid default null, p_transportista uuid default null)
returns jsonb language plpgsql stable set search_path = public as $$
declare v_rol rol_usuario;
begin
  select rol into v_rol from usuarios where id = auth.uid() and estado = 'activa';
  if v_rol is null then return '{}'::jsonb; end if;

  if v_rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then
    -- «Ver como» un cliente: sus números, los mismos que vería él (misma forma que su rama).
    if p_cliente is not null then
      return jsonb_build_object(
        'envios_sin_asignar', (select count(*) from envios where cliente_id = p_cliente and estado = 'programado' and not es_manual and estado_asignacion is distinct from 'confirmada'),
        'envios_sin_pagar',   (select count(*) from envios where cliente_id = p_cliente and estado = 'programado' and estado_pago_previo = 'pendiente'),
        'incidencias',        (select count(*) from incidencias where cliente_id = p_cliente and estado in ('abierto', 'en_curso')),
        'penalizaciones',     (select count(*) from penalizaciones p join envios e on e.id = p.envio_id
                                where e.cliente_id = p_cliente and p.importe_cliente is not null and p.estado = 'pendiente_confirmar'),
        'alm_sin_confirmar',  (select count(*) from almacenamientos where cliente_id = p_cliente and estado = 'pendiente_confirmar'),
        'alm_sin_pagar',      (select count(*) from almacenamientos where cliente_id = p_cliente and requiere_pago_previo and pagado_en is null and estado <> 'cancelado'));
    end if;
    -- «Ver como» un transportista: lo que vería él (sus incidencias y sus penalizaciones).
    if p_transportista is not null then
      return jsonb_build_object(
        'incidencias',        (select count(*) from incidencias where transportista_id = p_transportista and cliente_id is null and estado in ('abierto', 'en_curso')),
        'penalizaciones',     (select count(*) from penalizaciones p join envios e on e.id = p.envio_id
                                where e.transportista_id = p_transportista and p.importe_transportista is not null and p.estado = 'pendiente_confirmar'));
    end if;
    return jsonb_build_object(
      'envios_sin_asignar', (select count(*) from envios where estado = 'programado' and not es_manual and transportista_id is null and estado_pago_previo <> 'pendiente'),
      'envios_sin_pagar',   (select count(*) from envios where estado = 'programado' and estado_pago_previo = 'pendiente'),
      'incidencias',        (select count(*) from incidencias where estado in ('abierto', 'en_curso')),
      'penalizaciones',     (select count(*) from penalizaciones where estado = 'pendiente_confirmar'),
      'alm_sin_confirmar',  (select count(*) from almacenamientos where estado = 'pendiente_confirmar'),
      'alm_sin_pagar',      (select count(*) from almacenamientos where requiere_pago_previo and pagado_en is null and estado <> 'cancelado'),
      'altas',              (select count(*) from usuarios where estado = 'pendiente_verificacion' and cliente_id is null and transportista_id is null));
  elsif v_rol = 'cliente' then
    return jsonb_build_object(
      'envios_sin_asignar', cuenta_mis_envios_sin_asignar(),
      'envios_sin_pagar',   (select count(*) from pagos_envio(null) p where p.estado_pago_previo = 'pendiente' and p.estado = 'programado'),
      'incidencias',        (select count(*) from incidencias where estado in ('abierto', 'en_curso')),
      'penalizaciones',     (select count(*) from mis_penalizaciones() p where p.estado = 'pendiente_confirmar'),
      'alm_sin_confirmar',  (select count(*) from almacenamientos where estado = 'pendiente_confirmar'),
      'alm_sin_pagar',      (select count(*) from almacenamientos where requiere_pago_previo and pagado_en is null and estado <> 'cancelado'));
  else
    return jsonb_build_object(
      'incidencias',        (select count(*) from incidencias where estado in ('abierto', 'en_curso')),
      'penalizaciones',     (select count(*) from mis_penalizaciones_transportista() p where p.estado = 'pendiente_confirmar'));
  end if;
end $$;
revoke execute on function contadores_panel(uuid, uuid) from public, anon;
grant execute on function contadores_panel(uuid, uuid) to authenticated;
comment on function public.contadores_panel(uuid, uuid) is
  '[Panel] Los números de la campana y del menú lateral (envíos sin asignar / sin pagar, incidencias y penalizaciones abiertas, almacenamientos sin confirmar / sin pagar, altas), según quién llama. Quién: Dynamo ve los globales, o los de UNA empresa con p_cliente / p_transportista («Ver como»); un cliente o transportista siempre los suyos (los parámetros se ignoran). Argumentos: p_cliente · p_transportista (solo Dynamo).';
