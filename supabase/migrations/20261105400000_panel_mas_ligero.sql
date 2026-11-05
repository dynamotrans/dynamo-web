-- =====================================================================================
-- PANEL MÁS LIGERO (revisión de calidad, 2026-11-05)
-- contadores_panel() contaba los envíos sin asignar del cliente recorriendo mis_envios(), que
-- monta las paradas de CADA envío solo para contar. Ahora lo cuenta una función directa. El
-- resto de cuentas no cambia (siguen filtradas por la seguridad de cada tabla).
-- =====================================================================================
create or replace function cuenta_mis_envios_sin_asignar()
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from envios e
   where e.cliente_id = cliente_del_usuario() and e.estado = 'programado' and not e.es_manual
     and e.estado_asignacion is distinct from 'confirmada'
$$;
revoke execute on function cuenta_mis_envios_sin_asignar() from public, anon;
grant execute on function cuenta_mis_envios_sin_asignar() to authenticated;
comment on function public.cuenta_mis_envios_sin_asignar() is '[Envíos] Cuántos envíos programados del cliente que llama están aún sin transportista confirmado (sus envíos manuales no cuentan). Quién: cliente. Argumentos: sin argumentos.';

CREATE OR REPLACE FUNCTION public.contadores_panel()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_rol rol_usuario;
begin
  select rol into v_rol from usuarios where id = auth.uid() and estado = 'activa';
  if v_rol is null then return '{}'::jsonb; end if;

  if v_rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then
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
end $function$;
