-- NUNCA PRECIO 0 (usuario, 2026-11-15): «no se puede asignar transportista SIN PRECIO …
-- para q no se envien ordenes de carga con precio 0, y para cliente igual, nunca precio 0».
--  1. asignar_transportista exige precio del transportista > 0 (resultado 'falta_precio').
--  2. Guardia en la tabla: ningún envío (salvo los manuales, que mueve un operador propio
--     del cliente) puede quedar con transportista asignado y sin precio o a 0, ni con el
--     precio del cliente a 0. Solo salta cuando ESE dato cambia (alta, asignación o cambio
--     de precio): un envío antiguo con un 0 se puede seguir tocando en lo demás. La consola
--     de Supabase queda fuera (arreglos a mano de Dynamo).

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
  -- Sin precio no hay asignación (usuario, 2026-11-15): la orden de carga nunca sale a 0 €.
  -- Los envíos manuales (transportista propio del cliente) no llevan precio de Dynamo.
  if not coalesce((select es_manual from envios where id = p_envio), false)
     and coalesce(p_importe_transportista, 0) <= 0 then
    return jsonb_build_object('ok', false, 'resultado', 'falta_precio');
  end if;
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
comment on function public.asignar_transportista(uuid, uuid, numeric, text, text, text, text, date, date) is '[Envíos] Asigna a mano un transportista a un envío (queda confirmado), con su precio, matrículas, conductor, el día en que carga y el día de entrega (SIEMPRE estimado). No deja uno suspendido. Devuelve {ok, resultado: asignado | no_existe | transportista_no_existe | transportista_suspendido | importe_no_valido | falta_precio | falta_fecha_prevista | fecha_fuera_de_ventana | entrega_antes_de_cargar}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_transportista: transportistas.id · p_importe_transportista: euros sin IVA, obligatorio y mayor que 0 salvo en envíos manuales · p_matricula_camion, p_matricula_remolque (opcionales; se guardan en mayúsculas y sin espacios) · p_conductor_nombre, p_conductor_telefono (opcionales; teléfono con prefijo) · p_fecha_carga_prevista: día en que carga, obligatorio si el envío tiene ventana (dentro de ella; con fecha fija se ignora) · p_fecha_entrega_estimada: día de entrega estimado, nunca anterior al día en que carga (la pantalla de asignación lo exige; la aceptación por enlace no lo manda y se conserva el que hubiera).';

create or replace function fn_envios_precio_nunca_cero()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.es_manual, false) or es_consola_supabase() then return new; end if;
  if new.importe_cliente is not null and new.importe_cliente <= 0
     and (tg_op = 'INSERT' or new.importe_cliente is distinct from old.importe_cliente) then
    raise exception 'El precio del cliente no puede ser 0: pon un precio mayor que 0.' using errcode = 'P0001';
  end if;
  if new.transportista_id is not null and coalesce(new.importe_transportista, 0) <= 0
     and (tg_op = 'INSERT' or new.transportista_id is distinct from old.transportista_id
          or new.importe_transportista is distinct from old.importe_transportista) then
    raise exception 'No se puede asignar un transportista sin precio: pon su precio (mayor que 0).' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function fn_envios_precio_nunca_cero() from public, anon, authenticated;
comment on function public.fn_envios_precio_nunca_cero() is '[Envíos] Guardia de la tabla envios: nunca un precio a 0. Bloquea que el precio del cliente quede a 0 y que un envío tenga transportista asignado sin precio o con precio 0, cuando ese dato cambia (alta, asignación o cambio de precio). No aplica a los envíos manuales (operador propio del cliente) ni a la consola de Supabase. Quién: el disparador tg_envios_zzzzz_precio_nunca_cero. Argumentos: ninguno (disparador).';
drop trigger if exists tg_envios_zzzzz_precio_nunca_cero on envios;
create trigger tg_envios_zzzzz_precio_nunca_cero before insert or update on envios
  for each row execute function fn_envios_precio_nunca_cero();
