-- =====================================================================================
-- ARREGLOS PEQUEÑOS DEL REPASO DEL DICCIONARIO (usuario, 2026-11-05: «empieza y sigue»)
--   · envios_que_cuentan() y factor_automatico() ya no se pueden llamar desde la API: daban
--     el nº de envíos y el descuento de bienvenida de cualquier cliente a quien tuviera su
--     id. Solo las usan los disparadores (que corren con permisos propios).
--   · envios.carga_trasera: por defecto «no», igual que el asistente y las funciones (la
--     tabla decía «sí»).
--   · transportistas: IVA y retención entre 0 y 100, como en clientes.
--   · mi_vehiculo_guardar: el transportista puede corregir la matrícula de un vehículo suyo
--     (si no la tiene otro).
-- =====================================================================================

revoke execute on function envios_que_cuentan(uuid) from authenticated;
revoke execute on function factor_automatico(uuid) from authenticated;

alter table envios alter column carga_trasera set default false;
comment on column public.envios.carga_trasera is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | obligatorio | Se puede cargar por detrás («Detrás» en Wtransnet). Por defecto no (lo marca quien crea el envío). Ej. OK: false';

alter table transportistas
  add constraint ck_transportistas_iva check (iva_porcentaje >= 0 and iva_porcentaje <= 100),
  add constraint ck_transportistas_retencion check (retencion_porcentaje >= 0 and retencion_porcentaje <= 100);

create or replace function mi_vehiculo_guardar(
  p_id uuid, p_matricula text, p_tipo tipo_vehiculo, p_itv date, p_seguro date, p_tarjeta date,
  p_adr boolean, p_trampilla boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_t uuid := transportista_del_usuario(); v_id uuid;
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar su flota.'; end if;
  if p_id is null then
    if exists (select 1 from vehiculos where activo and normaliza_matricula(matricula) = normaliza_matricula(p_matricula)) then
      raise exception 'No se ha podido dar de alta esa matrícula. Si es tuya, escríbenos y lo revisamos.';
    end if;
    insert into vehiculos (transportista_id, matricula, tipo, itv_vence, seguro_vence, tarjeta_transporte_vence, adr, trampilla)
    values (v_t, upper(trim(p_matricula)), p_tipo, p_itv, p_seguro, p_tarjeta, coalesce(p_adr, false), coalesce(p_trampilla, false))
    returning id into v_id;
  else
    -- Corregir la matrícula (p. ej. una errata), si no la tiene otro vehículo. Los envíos
    -- ya hechos conservan la matrícula con la que cargaron.
    if nullif(trim(p_matricula), '') is not null
       and exists (select 1 from vehiculos where activo and id <> p_id and normaliza_matricula(matricula) = normaliza_matricula(p_matricula)) then
      raise exception 'Esa matrícula ya está dada de alta. Si es tuya, escríbenos y lo revisamos.';
    end if;
    update vehiculos set matricula = coalesce(nullif(upper(trim(p_matricula)), ''), matricula),
                         tipo = p_tipo, itv_vence = p_itv, seguro_vence = p_seguro, tarjeta_transporte_vence = p_tarjeta,
                         adr = coalesce(p_adr, false), trampilla = coalesce(p_trampilla, false)
     where id = p_id and transportista_id = v_t and activo
    returning id into v_id;
    if v_id is null then raise exception 'Ese camión no es de tu flota.'; end if;
  end if;
  return v_id;
end $$;
