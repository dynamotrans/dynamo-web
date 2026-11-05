-- =====================================================================================
-- REVISIÓN DE SEGURIDAD, PUNTOS BAJOS (2026-11-05)
--  · Contraoferta del cliente: una propuesta más baja que el máximo admitido respondía
--    «demasiado lejos» sin coste, así que probando importes se podía adivinar el %
--    máximo. Ahora cada una se apunta y, a la 3.ª en 24 horas, ese envío no admite más
--    propuestas ese día.
--  · Flota del transportista: los mensajes ya no dicen que esa matrícula o ese DNI está
--    en Dynamo «con otra empresa»; uno genérico, y Dynamo lo revisa.
-- =====================================================================================

create table contraoferta_intentos (
  id         bigint generated always as identity primary key,
  envio_id   uuid not null references envios(id) on delete cascade,
  usuario_id uuid references usuarios(id) on delete set null,
  importe    numeric(12,2),
  cuando     timestamptz not null default now()
);
create index idx_contraoferta_intentos on contraoferta_intentos (envio_id, cuando desc);
alter table contraoferta_intentos enable row level security;
create policy contraoferta_intentos_sel on contraoferta_intentos for select to authenticated using (ve_todo());
revoke insert, update, delete on contraoferta_intentos from anon, authenticated;

create or replace function contraofertar_precio_solicitud(p_envio uuid, p_importe numeric)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e envios%rowtype; v_permitida boolean; v_rebaja numeric; v_auto numeric; v_max numeric; v_p numeric := round(p_importe, 2);
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  select permite_contraoferta into v_permitida from clientes where id = e.cliente_id;
  if not coalesce(v_permitida, false) or not coalesce((parametro('contraoferta_cliente_activa') #>> '{}')::boolean, false) then
    return jsonb_build_object('resultado', 'no_permitida');
  end if;
  if e.solicitud_estado <> 'precio_propuesto' or e.estado <> 'borrador' then return jsonb_build_object('resultado', 'no_esperando'); end if;
  if e.precio_valido_hasta < now() then
    update envios set solicitud_estado = 'pendiente_precio', precio_valido_hasta = null where id = p_envio;
    return jsonb_build_object('resultado', 'caducado');
  end if;
  if e.fecha_carga_desde <= current_date then return jsonb_build_object('resultado', 'fecha_pasada'); end if;
  if v_p is null or v_p <= 0 then return jsonb_build_object('resultado', 'precio_no_valido'); end if;
  if v_p >= e.importe_cliente then return jsonb_build_object('resultado', 'no_es_rebaja'); end if;

  v_rebaja := (e.importe_cliente - v_p) * 100 / e.importe_cliente;
  v_auto := p_num('contraoferta_cliente_auto_pct', 5);
  v_max  := p_num('contraoferta_cliente_max_pct', 15);
  -- Propuestas demasiado bajas: se apuntan y, a la 3.ª en 24 h, el envío no admite más
  -- propuestas ese día (así no se puede ir probando hasta dar con el % máximo).
  if (select count(*) from contraoferta_intentos where envio_id = p_envio and cuando > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('resultado', 'demasiados_intentos');
  end if;
  if v_rebaja > v_max then
    insert into contraoferta_intentos (envio_id, usuario_id, importe) values (p_envio, auth.uid(), v_p);
    return jsonb_build_object('resultado', 'demasiado_lejos');
  end if;

  perform set_config('dynamo.contraoferta_cliente', 'on', true);
  if v_rebaja <= v_auto then
    update envios set precio_inicial_cliente = importe_cliente, importe_cliente = v_p,
                      contraoferta_cliente = v_p, contraoferta_cliente_en = now(),
                      solicitud_estado = 'aceptada', condiciones_aceptadas_en = now(), estado = 'programado'
     where id = p_envio;
    perform registrar_hito(p_envio, 'contraoferta_resuelta', null, null,
      jsonb_build_object('de', 'cliente', 'precio_base', e.importe_cliente, 'precio_propuesto', v_p, 'decision', 'aceptada_auto'));
    perform set_config('dynamo.contraoferta_cliente', 'off', true);
    return jsonb_build_object('resultado', 'aceptada');
  end if;
  update envios set contraoferta_cliente = v_p, contraoferta_cliente_en = now(),
                    solicitud_estado = 'contraoferta', condiciones_aceptadas_en = now()
   where id = p_envio;
  perform registrar_hito(p_envio, 'contraoferta_propuesta', null, null,
    jsonb_build_object('de', 'cliente', 'precio_base', e.importe_cliente, 'precio_propuesto', v_p));
  perform set_config('dynamo.contraoferta_cliente', 'off', true);
  return jsonb_build_object('resultado', 'pendiente_revision');
end $$;
revoke execute on function contraofertar_precio_solicitud(uuid, numeric) from public, anon;
grant execute on function contraofertar_precio_solicitud(uuid, numeric) to authenticated;

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
    update vehiculos set tipo = p_tipo, itv_vence = p_itv, seguro_vence = p_seguro, tarjeta_transporte_vence = p_tarjeta,
                         adr = coalesce(p_adr, false), trampilla = coalesce(p_trampilla, false)
     where id = p_id and transportista_id = v_t and activo
    returning id into v_id;
    if v_id is null then raise exception 'Ese camión no es de tu flota.'; end if;
  end if;
  return v_id;
end $$;

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
  raise exception 'No se ha podido dar de alta ese conductor. Escríbenos y lo revisamos.';
end $$;
