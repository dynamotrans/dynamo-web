-- Línea de tiempo del envío completa (usuario, 2026-11-06):
--  · hitos «hacia_la_carga» (sale hacia la recogida) y «cargando» (llega y carga), con su
--    fecha, hora y quién, como el resto; también los ve el cliente (hito_visible_fuera);
--  · cada parada guarda la hora en que se hizo (realizado_en): la del PIN si se validó en
--    el punto; si no, las recogidas al pasar a «En ruta» y las entregas al «Entregado».

CREATE OR REPLACE FUNCTION public.fn_envios_hitos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    perform registrar_hito(new.id, 'creado', null, null,
      jsonb_build_object('estado', new.estado, 'importe_cliente', new.importe_cliente));
    if new.estado not in ('borrador', 'cancelado') then
      perform registrar_hito(new.id, 'confirmado');
    end if;
    return null;
  end if;

  if old.estado = 'borrador' and new.estado not in ('borrador', 'cancelado') then
    perform registrar_hito(new.id, 'confirmado', null, null,
      jsonb_build_object('importe_cliente', new.importe_cliente));
  end if;

  if new.publicado_en_bolsa_en is distinct from old.publicado_en_bolsa_en
     and new.publicado_en_bolsa_en is not null then
    perform registrar_hito(new.id, 'publicado_bolsa');
  end if;

  if new.transportista_id is distinct from old.transportista_id then
    if old.transportista_id is not null then
      perform registrar_hito(new.id, 'transportista_quitado', null, null,
        jsonb_build_object('transportista_id', old.transportista_id));
    end if;
    if new.transportista_id is not null then
      perform registrar_hito(new.id, 'transportista_asignado', null, null,
        jsonb_build_object('transportista_id', new.transportista_id,
                           'importe_transportista', new.importe_transportista));
    end if;
  end if;

  if (new.matricula_camion, new.matricula_remolque)
       is distinct from (old.matricula_camion, old.matricula_remolque)
     and coalesce(new.matricula_camion, new.matricula_remolque) is not null then
    perform registrar_hito(new.id, 'matricula_asignada', null, null,
      jsonb_build_object('camion', new.matricula_camion,
                         'remolque', new.matricula_remolque));
  end if;

  if new.estado is distinct from old.estado then
    if new.estado = 'hacia_la_carga' then perform registrar_hito(new.id, 'hacia_la_carga'); end if;
    if new.estado = 'cargando'       then perform registrar_hito(new.id, 'cargando');       end if;
    if new.estado = 'en_ruta'   then
      perform registrar_hito(new.id, 'cargado');
      -- Hora de cada recogida: si no la puso el PIN en el punto, la del paso a «En ruta».
      update envio_paradas set realizado_en = now()
       where envio_id = new.id and tipo = 'carga' and realizado_en is null;
    end if;
    if new.estado = 'entregado' then
      perform registrar_hito(new.id, 'entregado');
      update envio_paradas set realizado_en = now()
       where envio_id = new.id and realizado_en is null;   -- entregas (y recogidas sin hora)
    end if;
    if new.estado = 'cancelado' then
      perform registrar_hito(new.id, 'cancelado', null, null,
        jsonb_build_object('estado_anterior', old.estado,
                           'tenia_transportista', old.transportista_id is not null));
    end if;
    if old.estado = 'cancelado' then
      perform registrar_hito(new.id, 'cancelacion_deshecha', null, null,
        jsonb_build_object('estado_nuevo', new.estado));
    end if;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.hito_visible_fuera(p tipo_hito)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select p in ('creado','confirmado','transportista_asignado','matricula_asignada','hacia_la_carga','cargando',
               'cargado','entregado','cancelado','cancelacion_deshecha',
               'orden_carga_enviada','cmr_firmado','pin_validado',
               'pin_validado_manual','incidencia','fecha_carga_movida')
$function$;
