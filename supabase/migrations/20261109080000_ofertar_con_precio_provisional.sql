-- =====================================================================================
-- EL PRECIO PROVISIONAL YA NO BLOQUEA OFERTAR NI ASIGNAR (usuario, 2026-11-09)
-- =====================================================================================
-- «Lo del precio provisional no debe afectar a poder compartir enlace o crear oferta».
-- Hasta ahora, un envío programado con mucha antelación (precio provisional: se revisa
-- solo al llegar su fecha) no se podía ofertar, publicar en bolsa ni asignar. Fuera el
-- bloqueo:
--   · Se puede crear la oferta/enlace, publicar en bolsa y asignar camión con el precio
--     provisional.
--   · Al ASIGNAR transportista, el precio del cliente queda definitivo en ese momento
--     (igual que al pagar por adelantado): con el camión cerrado, el precio ya no flota.
--   · Sin camión, todo sigue igual: al llegar su fecha, la tarea horaria lo deja
--     definitivo solo, y el previo pago sigue esperando a la revisión.
--   · El veto al crear ofertas (fn_ofertas_precio_revision) desaparece con su trigger.
-- =====================================================================================

drop trigger if exists tg_ofertas_ab_precio_revision on public.envio_ofertas;
drop function public.fn_ofertas_precio_revision();

CREATE OR REPLACE FUNCTION public.fn_envios_ab_precio_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  -- Sello del precio: lo pone la base de datos.
  if tg_op = 'INSERT' then
    new.precio_calculado_en := case when new.importe_cliente is not null then now() end;
  elsif new.importe_cliente is distinct from old.importe_cliente then
    new.precio_calculado_en := now();
  else
    new.precio_calculado_en := old.precio_calculado_en;
  end if;
  -- Las columnas de la revisión solo las tocan las funciones de la revisión.
  if coalesce(current_setting('dynamo.revision_precio', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.estado_revision_precio := null; new.fecha_revision_precio := null; new.importe_revision_anterior := null;
      new.importe_revision_nuevo := null; new.revision_precio_en := null; new.revision_precio_recordada := false;
      new.cancelacion_sin_coste := false;
    else
      new.estado_revision_precio := old.estado_revision_precio; new.fecha_revision_precio := old.fecha_revision_precio;
      new.importe_revision_anterior := old.importe_revision_anterior; new.importe_revision_nuevo := old.importe_revision_nuevo;
      new.revision_precio_en := old.revision_precio_en; new.revision_precio_recordada := old.revision_precio_recordada;
      new.cancelacion_sin_coste := old.cancelacion_sin_coste and new.estado = 'cancelado';
    end if;
  end if;
  -- Al confirmar o al cambiar la fecha: ¿precio cerrado o provisional?
  if not coalesce(new.es_manual, false) and new.estado = 'programado' and new.fecha_carga_desde is not null
     and new.estado_pago_previo is distinct from 'pagado' and new.transportista_id is null and new.estado_asignacion = 'sin_asignar'
     and (tg_op = 'INSERT' or old.estado = 'borrador' or new.fecha_carga_desde is distinct from old.fecha_carga_desde)
     and (tg_op = 'INSERT' or old.estado_revision_precio is distinct from 'esperando_cliente') then
    if new.fecha_carga_desde - v_hoy > parametro_num('precio_cerrado_dias', 7) then
      new.estado_revision_precio := 'pendiente';
      new.fecha_revision_precio := dias_habiles_antes(new.fecha_carga_desde, parametro_num('precio_revision_dias_habiles', 3)::int);
      new.importe_revision_anterior := null; new.importe_revision_nuevo := null; new.revision_precio_en := null; new.revision_precio_recordada := false;
    elsif tg_op = 'UPDATE' and old.estado = 'programado' and new.estado_revision_precio = 'pendiente' then
      -- Se adelanta la fecha y ya entra en el plazo cerrado: toca revisar ya.
      new.estado_revision_precio := 'revisar'; new.fecha_revision_precio := v_hoy;
    end if;
  end if;
  -- Pagado: el precio queda cerrado (ya está cobrado).
  if new.estado_pago_previo = 'pagado' and precio_por_revisar(new.estado_revision_precio) then
    new.estado_revision_precio := 'hecha'; new.revision_precio_en := now();
  end if;
  -- Con camión asignado, el precio queda definitivo (igual que al pagar): el precio
  -- provisional ya NO bloquea ofertar, publicar ni asignar (usuario, 2026-11-09); solo
  -- significa que, sin camión, se ajustaría solo al llegar su fecha.
  if new.transportista_id is not null and new.estado <> 'cancelado' and precio_por_revisar(new.estado_revision_precio) then
    new.estado_revision_precio := 'hecha'; new.revision_precio_en := now();
  end if;
  return new;
end $function$;
