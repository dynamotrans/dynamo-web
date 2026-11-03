-- =====================================================================================
-- CONTADORES DEL PANEL (menú lateral y campana) + COBERTURA DE CRÉDITO DEL CLIENTE
-- =====================================================================================
-- 1. contadores_panel(): los números naranja/rojo del menú lateral y de la campana de
--    notificaciones, en UNA sola llamada por pantalla. Es SECURITY INVOKER a propósito:
--    cuenta solo lo que quien llama ya puede ver (la seguridad por filas hace el filtro),
--    así que no puede chivar nada de otro cliente.
-- 2. mi_cobertura_credito(): el estado de crédito del cliente para el punto de colores
--    de la barra superior (diseño del mockup). Devuelve SOLO el estado, nunca importes:
--    el riesgo CESCE/manual no se enseña al cliente (permisos_por_rol).
--       'disponible' → tiene crédito (riesgo efectivo > 0)
--       'nulo'       → CESCE (o Dynamo) autoriza 0
--       'sinclasif'  → aún no clasificado (sin dato)
--    ('agotado' llegará cuando la deuda viva esté en la plataforma; hoy está en Holded.)
-- =====================================================================================

create or replace function contadores_panel()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_rol rol_usuario;
begin
  select rol into v_rol from usuarios where id = auth.uid() and estado = 'activa';
  if v_rol is null then return '{}'::jsonb; end if;

  if v_rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then
    return jsonb_build_object(
      'envios_sin_asignar', (select count(*) from envios where estado = 'programado' and not es_manual and transportista_id is null),
      'incidencias',        (select count(*) from incidencias where estado in ('abierto', 'en_curso')),
      'penalizaciones',     (select count(*) from penalizaciones where estado = 'pendiente_confirmar'),
      'alm_sin_confirmar',  (select count(*) from almacenamientos where estado = 'pendiente_confirmar'),
      'alm_sin_pagar',      (select count(*) from almacenamientos where pago_adelantado and pagado_en is null and estado <> 'cancelado'),
      'altas',              (select count(*) from usuarios where estado = 'pendiente_verificacion' and cliente_id is null and transportista_id is null));
  elsif v_rol = 'cliente' then
    return jsonb_build_object(
      'envios_sin_asignar', (select count(*) from mis_envios() e where e.estado = 'programado' and not e.es_manual
                                and coalesce(e.estado_asignacion::text, '') <> 'confirmada'),
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
comment on function contadores_panel() is
  'Números del menú lateral y de la campana. SECURITY INVOKER: cuenta solo lo que quien llama puede ver.';
revoke execute on function contadores_panel() from public, anon;
grant execute on function contadores_panel() to authenticated;

create or replace function mi_cobertura_credito()
returns text language sql stable security definer set search_path = public as $$
  select case
           when c.riesgo_efectivo_euros is null then 'sinclasif'
           when c.riesgo_efectivo_euros = 0     then 'nulo'
           else 'disponible'
         end
    from clientes c
   where c.id = cliente_del_usuario()
$$;
comment on function mi_cobertura_credito() is
  'Estado de crédito del cliente que llama (disponible / nulo / sinclasif). Nunca importes.';
revoke execute on function mi_cobertura_credito() from public, anon;
grant execute on function mi_cobertura_credito() to authenticated;
