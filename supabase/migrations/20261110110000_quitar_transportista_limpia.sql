-- =====================================================================================
-- ENVÍOS HUÉRFANOS: FUERA LOS DATOS DEL TRANSPORTISTA QUE YA NO ESTÁ (usuario, 2026-11-10)
-- =====================================================================================
-- La ficha enseñaba «Transportista asignado el Sáb 07/11/26 · 11:02» (y matrícula,
-- conductor, NIMA, precio y fechas previstas) en envíos SIN transportista. Desde el
-- 2026-11-09 los triggers ya lo impiden: al quitar el transportista,
-- fn_envios_ac_asignacion limpia su camión, conductor, NIMA, precio y fechas
-- (20261109220000) y fn_envios_hitos deja asignado_en en nada (20261102091000).
-- Pero quedaban filas de ANTES de esos triggers (o importadas con el flag de
-- migración) con los datos del transportista que se fue. Esta migración las limpia
-- una vez. No toca funciones ni triggers: ya hacen lo correcto.
--
-- Fuera quedan: los envíos manuales (su transporte lo pone el cliente y no llevan
-- transportista de Dynamo) y los entregados o cancelados (su coste y su historia
-- son contabilidad: no se reescriben).
-- =====================================================================================

do $$
begin
  -- fn_envios_hitos no deja tocar asignado_en a mano salvo con el flag de migración.
  perform set_config('dynamo.migracion', 'on', true);
  update envios
     set asignado_en = null, matricula_camion = null, matricula_remolque = null,
         conductor_nombre = null, conductor_telefono = null, transportista_nima = null,
         vehiculo_camion_id = null, vehiculo_remolque_id = null, conductor_id = null,
         importe_transportista = null, fecha_carga_prevista = null,
         fecha_entrega_estimada = null, ancla_paso = null, ancla_hora = null,
         estado_asignacion = case
           when estado_asignacion = 'confirmada' then
             case when exists (select 1 from envio_ofertas o
                                where o.envio_id = envios.id and o.estado = 'activa' and o.caduca_en > now()
                                  and not (o.transportista_id is null and o.canal = 'enlace'))
                  then 'ofertada'::estado_asignacion else 'sin_asignar'::estado_asignacion end
           else estado_asignacion end
   where transportista_id is null and not es_manual
     and estado not in ('entregado', 'cancelado')
     and asignado_en is not null;
  perform set_config('dynamo.migracion', '', true);
end $$;
