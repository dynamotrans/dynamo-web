-- =====================================================================================
-- PLAZO DE PAGO = EL MISMO QUE CANCELAR GRATIS (usuario, 2026-11-09)
-- =====================================================================================
-- El plazo para pagar un envío con pago previo deja de ser «24 horas desde que se pide»
-- y pasa a ser el MISMO tope que la cancelación gratuita: las 9:00 (hora de Madrid) del
-- día hábil anterior al primer día de carga (corte_cancelacion). Si al llegar ese tope no
-- está pagado, el envío se anula solo (caducar_pagos_pendientes, como hasta ahora).
-- Para envíos inminentes (pedidos cuando ese tope ya ha pasado: carga hoy o mañana por la
-- tarde) rige el plazo corto de siempre, pago_previo_horas (24 h, saltando a día hábil):
-- sin él, el envío se anularía en el acto. El pago con tarjeta se marca pagado solo; por
-- transferencia la pantalla del cliente ya pide avisarnos al hacerla.
-- =====================================================================================

drop function public.pago_limite(timestamp with time zone);
create function public.pago_limite(p_desde timestamp with time zone, p_carga date default null)
 returns timestamp with time zone
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare tope timestamptz; t timestamptz; i int := 0;
begin
  -- El tope: las 9:00 del día hábil anterior a la carga (el mismo corte que cancelar
  -- gratis). Solo vale si aún queda por delante cuando el pago se pone pendiente.
  if p_carga is not null then
    tope := corte_cancelacion(p_carga);
    if tope > p_desde then return tope; end if;
  end if;
  -- Envíos inminentes (o sin fecha): el plazo corto de pago_previo_horas; si cae en
  -- sábado, domingo o festivo, pasa al siguiente día hábil a la misma hora.
  t := p_desde + make_interval(hours => parametro_num('pago_previo_horas', 24)::int);
  while not es_dia_habil((t at time zone 'Europe/Madrid')::date) and i < 10 loop
    t := t + interval '1 day'; i := i + 1;
  end loop;
  return t;
end $function$;
revoke all on function public.pago_limite(timestamp with time zone, date) from public, anon;
grant execute on function public.pago_limite(timestamp with time zone, date) to authenticated, service_role;
comment on function public.pago_limite(timestamp with time zone, date) is '[Precio y pago] Hora límite para pagar un envío con pago previo: las 9:00 del día hábil anterior al primer día de carga (el mismo corte que cancelar gratis). Si ese tope ya había pasado al quedar pendiente (envíos inminentes) o no hay fecha, el instante dado más las horas de pago_previo_horas (24 por defecto), saltando a día hábil. Quién: cualquier usuario con sesión. Argumentos: p_desde: desde cuándo está pendiente el pago · p_carga: primer día de carga (opcional).';

update public.parametros
   set descripcion = 'Plazo CORTO de pago, solo para envíos inminentes cuyo tope (las 9:00 del día hábil anterior a la carga) ya ha pasado al pedirse, o sin fecha: horas desde que el envío queda pendiente. Pasado el plazo, el envío se anula solo.'
 where clave = 'pago_previo_horas';

-- ---- La anulación automática y la consulta de pagos usan el tope nuevo ---------------------
CREATE OR REPLACE FUNCTION public.caducar_pagos_pendientes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0;
begin
  if not (es_servidor() or es_consola_supabase() or es_equipo_dynamo()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  for r in select id from envios
            where estado = 'programado' and estado_pago_previo = 'pendiente' and pago_pendiente_en is not null
              and transportista_id is null and stripe_cobro_sin_aplicar is null
              and now() > pago_limite(pago_pendiente_en, fecha_carga_desde) + interval '45 minutes'
            for update skip locked loop
    update envios set estado = 'cancelado' where id = r.id;
    perform registrar_hito(r.id, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', 'Anulado sin pago: no se recibió el pago a tiempo', 'por', 'sistema'), 'servidor');
    n := n + 1;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.pagos_envio(p_envio uuid DEFAULT NULL::uuid)
 RETURNS TABLE(envio_id uuid, referencia_gx text, referencia_cliente text, estado text, estado_pago_previo text, pago_motivo text, pago_metodo text, pagado_en timestamp with time zone, base numeric, iva numeric, total numeric, pago_limite timestamp with time zone, precio_provisional boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.referencia_gx, e.referencia_cliente, e.estado::text, e.estado_pago_previo, e.pago_motivo, e.pago_metodo, e.pagado_en, i.base, i.iva, i.total,
         case when e.estado_pago_previo = 'pendiente' and e.pago_pendiente_en is not null then pago_limite(e.pago_pendiente_en, e.fecha_carga_desde) end,
         precio_por_revisar(e.estado_revision_precio)
    from envios e cross join lateral pago_envio_importes(e.id) i
   where e.estado_pago_previo <> 'no_requerido'
     and (p_envio is null or e.id = p_envio)
     and (ve_todo() or e.cliente_id = cliente_del_usuario())
$function$;
