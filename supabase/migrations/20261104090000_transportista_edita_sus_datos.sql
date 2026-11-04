-- =====================================================================================
-- EL TRANSPORTISTA CAMBIA SUS PROPIOS DATOS (Mi cuenta)
-- =====================================================================================
-- Hasta hoy el transportista veía su empresa y su flota, pero solo Dynamo podía cambiarlas.
-- Ahora él mismo actualiza lo OPERATIVO:
--   · su empresa: NIMA y seguro CMR (compañía, póliza y vencimiento);
--   · su flota: camiones (alta, documentación y baja) y conductores (alta, datos y baja).
-- Lo FISCAL (razón social, CIF, dirección fiscal), la bolsa de carga, el plazo de pago y
-- todo lo interno (estado, valoración, notas) lo sigue cambiando SOLO Dynamo.
--
-- Cómo: funciones con una lista cerrada de campos, no permisos de escritura sobre las
-- tablas. Así el transportista no puede tocar ninguna otra columna aunque llame a la API
-- a mano. Cada función actúa solo sobre SU empresa (transportista_del_usuario(), que exige
-- la cuenta activa). Los sellos y la auditoría los ponen los triggers de siempre: el
-- usuario queda como autor del cambio.
-- =====================================================================================

create or replace function mi_transporte_guardar(
  p_nima text, p_seguro_compania text, p_seguro_poliza text, p_seguro_vence date)
returns void language plpgsql security definer set search_path = public as $$
declare v_t uuid := transportista_del_usuario();
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar estos datos.'; end if;
  if length(coalesce(p_nima, '')) > 40 or length(coalesce(p_seguro_compania, '')) > 120 or length(coalesce(p_seguro_poliza, '')) > 60 then
    raise exception 'Alguno de los datos es demasiado largo.';
  end if;
  update transportistas set
    nima                = nullif(trim(p_nima), ''),
    seguro_cmr_compania = nullif(trim(p_seguro_compania), ''),
    seguro_cmr_poliza   = nullif(trim(p_seguro_poliza), ''),
    seguro_cmr_vence    = p_seguro_vence
  where id = v_t;
end $$;

-- Camión: sin id = alta; con id = actualizar su documentación (la matrícula no cambia:
-- un camión con otra matrícula es otro camión).
create or replace function mi_vehiculo_guardar(
  p_id uuid, p_matricula text, p_tipo tipo_vehiculo, p_itv date, p_seguro date, p_tarjeta date,
  p_adr boolean, p_trampilla boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_t uuid := transportista_del_usuario(); v_id uuid;
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar su flota.'; end if;
  if p_id is null then
    if exists (select 1 from vehiculos where activo and normaliza_matricula(matricula) = normaliza_matricula(p_matricula)) then
      raise exception 'Esa matrícula ya está dada de alta. Si es tuya y no la ves, escríbenos.';
    end if;
    insert into vehiculos (transportista_id, matricula, tipo, itv_vence, seguro_vence, tarjeta_transporte_vence, adr, trampilla)
    values (v_t, upper(trim(p_matricula)), p_tipo, p_itv, p_seguro, p_tarjeta, coalesce(p_adr, false), coalesce(p_trampilla, false))
    returning id into v_id;
  else
    update vehiculos set tipo = p_tipo, itv_vence = p_itv, seguro_vence = p_seguro, tarjeta_transporte_vence = p_tarjeta,
                         adr = coalesce(p_adr, false), trampilla = coalesce(p_trampilla, false)
     where id = p_id and transportista_id = v_t and activo
    returning id into v_id;
    if v_id is null then raise exception 'Ese camión no es de tu flota.'; end if;
  end if;
  return v_id;
end $$;

-- Conductor: sin id = alta; con id = actualizar.
create or replace function mi_conductor_guardar(
  p_id uuid, p_nombre text, p_documento text, p_documento_pais char(2), p_telefono text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_t uuid := transportista_del_usuario(); v_id uuid;
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar su flota.'; end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then raise exception 'Pon el nombre y apellidos del conductor.'; end if;
  if length(p_nombre) > 120 or length(coalesce(p_documento, '')) > 30 then raise exception 'Alguno de los datos es demasiado largo.'; end if;
  if p_id is null then
    insert into conductores (transportista_id, nombre, documento, documento_pais, telefono)
    values (v_t, trim(p_nombre), nullif(upper(trim(p_documento)), ''), coalesce(p_documento_pais, 'ES'), nullif(p_telefono, ''))
    returning id into v_id;
  else
    update conductores set nombre = trim(p_nombre), documento = nullif(upper(trim(p_documento)), ''),
                           documento_pais = coalesce(p_documento_pais, 'ES'), telefono = nullif(p_telefono, '')
     where id = p_id and transportista_id = v_t and activo
    returning id into v_id;
    if v_id is null then raise exception 'Ese conductor no es de tu flota.'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ese DNI / NIE ya está dado de alta en Dynamo (puede que venga también con otra empresa). Si es el mismo conductor, escríbenos y lo enlazamos.';
end $$;

-- Dar de baja (no se borra: los envíos pasados siguen diciendo quién cargó).
create or replace function mi_flota_baja(p_tipo text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_t uuid := transportista_del_usuario(); n integer;
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar su flota.'; end if;
  if p_tipo = 'vehiculo' then
    update vehiculos set activo = false where id = p_id and transportista_id = v_t and activo;
  elsif p_tipo = 'conductor' then
    update conductores set activo = false where id = p_id and transportista_id = v_t and activo;
  else
    raise exception 'Tipo no válido.';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Eso no es de tu flota.'; end if;
end $$;

revoke execute on function mi_transporte_guardar(text, text, text, date) from public, anon;
revoke execute on function mi_vehiculo_guardar(uuid, text, tipo_vehiculo, date, date, date, boolean, boolean) from public, anon;
revoke execute on function mi_conductor_guardar(uuid, text, text, char, text) from public, anon;
revoke execute on function mi_flota_baja(text, uuid) from public, anon;
grant execute on function mi_transporte_guardar(text, text, text, date) to authenticated;
grant execute on function mi_vehiculo_guardar(uuid, text, tipo_vehiculo, date, date, date, boolean, boolean) to authenticated;
grant execute on function mi_conductor_guardar(uuid, text, text, char, text) to authenticated;
grant execute on function mi_flota_baja(text, uuid) to authenticated;
