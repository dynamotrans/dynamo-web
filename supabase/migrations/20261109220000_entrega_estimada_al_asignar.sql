-- =====================================================================================
-- DÍA DE ENTREGA (ESTIMADO) AL ASIGNAR TRANSPORTISTA (usuario, 2026-11-09)
-- =====================================================================================
-- La entrega estimada se elige en la MISMA pantalla de asignación, debajo del día en
-- que carga (la pantalla ofrece del mismo día de carga a +7 días hábiles y la exige).
--   · asignar_transportista() gana p_fecha_entrega_estimada. En la BASE DE DATOS es
--     OPCIONAL a propósito: la aceptación pública por enlace también asigna camión y
--     ahí no hay entrega estimada (la pone Dynamo después). Si llega, no puede ser
--     anterior al día en que carga; si no llega, se conserva la que hubiera.
--   · Al QUITAR el transportista se limpia (como el día previsto): dependía de ese
--     camión y de ese día. Siempre es ESTIMADA: también decide cuándo se oculta al
--     cliente el contacto del conductor.
-- =====================================================================================

-- La firma cambia: fuera la vieja para que PostgREST no tenga dos candidatas.
drop function if exists asignar_transportista(uuid, uuid, numeric, text, text, text, text, date);

create or replace function asignar_transportista(p_envio uuid, p_transportista uuid, p_importe_transportista numeric default null,
  p_matricula_camion text default null, p_matricula_remolque text default null, p_conductor_nombre text default null,
  p_conductor_telefono text default null, p_fecha_carga_prevista date default null, p_fecha_entrega_estimada date default null)
returns jsonb language plpgsql set search_path = public as $$
declare v_t record; v_e record; v_tel text := regexp_replace(coalesce(p_conductor_telefono, ''), '[^0-9+]', '', 'g');
  n int; v_fp date;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo asigna transportistas.' using errcode = '42501'; end if;
  select estado_operativo into v_t from transportistas where id = p_transportista;
  if not found then return jsonb_build_object('ok', false, 'resultado', 'transportista_no_existe'); end if;
  if v_t.estado_operativo = 'suspendido' then return jsonb_build_object('ok', false, 'resultado', 'transportista_suspendido'); end if;
  if p_importe_transportista is not null and p_importe_transportista < 0 then return jsonb_build_object('ok', false, 'resultado', 'importe_no_valido'); end if;
  select fecha_carga_desde, fecha_carga_hasta, fecha_carga_prevista into v_e from envios where id = p_envio;
  if not found then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  -- Con ventana, el día en que carga es obligatorio y dentro de la ventana; con fecha fija, esa.
  if v_e.fecha_carga_desde is not null and v_e.fecha_carga_desde = coalesce(v_e.fecha_carga_hasta, v_e.fecha_carga_desde) then
    v_fp := v_e.fecha_carga_desde;
  else
    v_fp := coalesce(p_fecha_carga_prevista, v_e.fecha_carga_prevista);
    if v_fp is null then return jsonb_build_object('ok', false, 'resultado', 'falta_fecha_prevista'); end if;
    if v_e.fecha_carga_desde is not null and (v_fp < v_e.fecha_carga_desde or v_fp > coalesce(v_e.fecha_carga_hasta, v_e.fecha_carga_desde)) then
      return jsonb_build_object('ok', false, 'resultado', 'fecha_fuera_de_ventana');
    end if;
  end if;
  -- La entrega estimada nunca puede ser anterior al día en que carga.
  if p_fecha_entrega_estimada is not null and p_fecha_entrega_estimada < v_fp then
    return jsonb_build_object('ok', false, 'resultado', 'entrega_antes_de_cargar');
  end if;
  update envios set transportista_id = p_transportista, estado_asignacion = 'confirmada', importe_transportista = p_importe_transportista,
         matricula_camion = nullif(upper(regexp_replace(coalesce(p_matricula_camion, ''), '[\s-]', '', 'g')), ''),
         matricula_remolque = nullif(upper(regexp_replace(coalesce(p_matricula_remolque, ''), '[\s-]', '', 'g')), ''),
         conductor_nombre = nullif(trim(coalesce(p_conductor_nombre, '')), ''),
         conductor_telefono = case when length(replace(v_tel, '+', '')) >= 6 then v_tel end,
         fecha_carga_prevista = v_fp,
         fecha_entrega_estimada = coalesce(p_fecha_entrega_estimada, fecha_entrega_estimada),
         -- Otro día: la etapa marcada a mano de antes ya no vale.
         ancla_paso = case when v_fp is distinct from fecha_carga_prevista and estado = 'programado' then null else ancla_paso end,
         ancla_hora = case when v_fp is distinct from fecha_carga_prevista and estado = 'programado' then null else ancla_hora end
   where id = p_envio;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  return jsonb_build_object('ok', true, 'resultado', 'asignado');
end $$;
revoke execute on function asignar_transportista(uuid, uuid, numeric, text, text, text, text, date, date) from public, anon;
grant execute on function asignar_transportista(uuid, uuid, numeric, text, text, text, text, date, date) to authenticated, service_role;
comment on function public.asignar_transportista(uuid, uuid, numeric, text, text, text, text, date, date) is '[Envíos] Asigna a mano un transportista a un envío (queda confirmado), con su precio, matrículas, conductor, el día en que carga y el día de entrega (SIEMPRE estimado). No deja uno suspendido. Devuelve {ok, resultado: asignado | no_existe | transportista_no_existe | transportista_suspendido | importe_no_valido | falta_fecha_prevista | fecha_fuera_de_ventana | entrega_antes_de_cargar}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_transportista: transportistas.id · p_importe_transportista: euros sin IVA (opcional) · p_matricula_camion, p_matricula_remolque (opcionales; se guardan en mayúsculas y sin espacios) · p_conductor_nombre, p_conductor_telefono (opcionales; teléfono con prefijo) · p_fecha_carga_prevista: día en que carga, obligatorio si el envío tiene ventana (dentro de ella; con fecha fija se ignora) · p_fecha_entrega_estimada: día de entrega estimado, nunca anterior al día en que carga (la pantalla de asignación lo exige; la aceptación por enlace no lo manda y se conserva el que hubiera).';

-- ---- Al quitar el transportista, la entrega estimada se limpia también ---------------------
-- (copiada de 20261109190000_oferta_enlace_automatica; se añade solo esa limpieza)
CREATE OR REPLACE FUNCTION public.fn_envios_ac_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t record;
begin
  if new.transportista_id is not null and new.transportista_id is distinct from old.transportista_id then
    select estado_operativo, nima into t from transportistas where id = new.transportista_id;
    if t.estado_operativo = 'suspendido' and not es_consola_supabase() then
      raise exception 'Ese transportista está suspendido: no se le pueden dar envíos.';
    end if;
    new.estado_asignacion := 'confirmada';
    -- El NIMA es el del transportista nuevo (salvo que quien asigna ponga otro).
    if new.transportista_nima is not distinct from old.transportista_nima then new.transportista_nima := t.nima; end if;
  elsif new.transportista_id is null and old.transportista_id is not null then
    -- Sin transportista no quedan su camión, su conductor ni su precio.
    new.matricula_camion := null; new.matricula_remolque := null; new.conductor_nombre := null; new.conductor_telefono := null;
    new.vehiculo_camion_id := null; new.vehiculo_remolque_id := null; new.conductor_id := null;
    new.transportista_nima := null; new.importe_transportista := null;
    new.fecha_carga_prevista := null; new.ancla_paso := null; new.ancla_hora := null;
    -- La entrega estimada dependía de ese camión y ese día: fuera también (usuario, 2026-11-09).
    new.fecha_entrega_estimada := null;
    if new.estado_asignacion = 'confirmada' then
      -- La oferta-enlace automática no cuenta: si es lo único vivo, vuelve a «sin asignar».
      new.estado_asignacion := case when exists (select 1 from envio_ofertas o where o.envio_id = new.id and o.estado = 'activa' and o.caduca_en > now()
                                                   and not (o.transportista_id is null and o.canal = 'enlace'))
                                    then 'ofertada' else 'sin_asignar' end;
    end if;
  end if;
  return new;
end $function$;
