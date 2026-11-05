-- =====================================================================================
-- HOMOGENEIDAD PARA n8n — FASE 1 (revisión del 2026-11-05)
-- 1. Reglas que solo comprobaba la web pasan a la base de datos (n8n escribirá sin la web):
--    · no se da carga a un transportista SUSPENDIDO (disparador de asignación);
--    · al asignar se copia el NIMA del transportista; al quitarlo se limpian camión,
--      conductor y precio del transportista;
--    · un envío no pasa de «programado» sin transportista (salvo envío manual).
-- 2. Funciones para lo que la web hacía escribiendo en tablas: asignar_transportista,
--    quitar_transportista, marcar_estado_envio, revocar_oferta. Devuelven {ok, resultado}.
-- 3. Contrato de errores: «no tienes permiso» siempre con el código 42501 (antes, en seis
--    funciones, salía como error genérico); fuera P0002.
-- 4. Argumentos opcionales con DEFAULT (si no, al omitirlos la API responde PGRST202).
-- 5. mi_empresa() devuelve el IVA del cliente (para enseñar el total correcto al pedir).
-- 6. funciones_api(): argumentos con sus valores por defecto y si se llama sin sesión.
-- 7. guia_automatizaciones() al día: errores, glosario, qué tablas se escriben directo.
-- 8. Descripciones corregidas y las de las funciones de servidor.
-- =====================================================================================

-- ---- Códigos de error (42501 = sin permiso) y argumentos opcionales -----------------
CREATE OR REPLACE FUNCTION public.valorar_mi_envio(p_envio uuid, p_nota smallint, p_comentario text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cli uuid := cliente_del_usuario(); e record;
begin
  if v_cli is null then raise exception 'Solo el cliente del envío lo puede valorar.' using errcode = '42501'; end if;
  select id, estado, es_manual, transportista_id, valoracion_cliente_en into e
    from envios where id = p_envio and cliente_id = v_cli;
  if not found then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  if e.es_manual then raise exception 'Los envíos con tu propio transportista no se valoran aquí.'; end if;
  if e.estado <> 'entregado' or e.transportista_id is null then raise exception 'Podrás valorarlo cuando esté entregado.'; end if;
  if p_nota is null or p_nota not between 1 and 5 then raise exception 'Elige de 1 a 5 estrellas.'; end if;
  if e.valoracion_cliente_en is not null and e.valoracion_cliente_en < now() - interval '30 days' then
    raise exception 'La valoración ya no se puede cambiar (han pasado más de 30 días).';
  end if;
  perform set_config('dynamo.valorando', 'si', true);
  update envios set valoracion_cliente = p_nota,
                    valoracion_cliente_comentario = nullif(trim(left(coalesce(p_comentario, ''), 500)), ''),
                    valoracion_cliente_en = coalesce(valoracion_cliente_en, now())
   where id = p_envio;
  perform set_config('dynamo.valorando', '', true);
  update transportistas t set
    valoracion_clientes = (select round(avg(valoracion_cliente)::numeric, 1) from envios where transportista_id = t.id and valoracion_cliente is not null),
    valoracion_clientes_votos = (select count(*) from envios where transportista_id = t.id and valoracion_cliente is not null)
   where t.id = e.transportista_id;
end $function$;

CREATE OR REPLACE FUNCTION public.registrar_cambio_email(p_usuario uuid, p_antes text, p_despues text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not es_administrador() then raise exception 'Solo el administrador cambia el email de una cuenta.' using errcode = '42501'; end if;
  if not exists (select 1 from usuarios where id = p_usuario and lower(email) = lower(trim(p_despues))) then
    raise exception 'Ese cambio de email no ha ocurrido.';
  end if;
  insert into auditoria (tabla, registro_id, accion, quien, quien_email, quien_origen, cambios)
  values ('usuarios', p_usuario::text, 'modificacion', auth.uid(),
          (select email from usuarios where id = auth.uid()), 'app',
          jsonb_build_object('email', jsonb_build_object('antes', lower(trim(p_antes)), 'despues', lower(trim(p_despues))),
                             'motivo', 'Cambio de email desde Usuarios (Admin Master)'));
end $function$;

CREATE OR REPLACE FUNCTION public.mi_flota_baja(p_tipo text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_t uuid := transportista_del_usuario(); n integer;
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar su flota.' using errcode = '42501'; end if;
  if p_tipo = 'vehiculo' then
    update vehiculos set activo = false where id = p_id and transportista_id = v_t and activo;
  elsif p_tipo = 'conductor' then
    update conductores set activo = false where id = p_id and transportista_id = v_t and activo;
  else
    raise exception 'Tipo no válido.';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Eso no es de tu flota.' using errcode = '42501'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.mi_conductor_guardar(p_id uuid, p_nombre text, p_documento text, p_documento_pais character, p_telefono text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_t uuid := transportista_del_usuario(); v_id uuid;
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar su flota.' using errcode = '42501'; end if;
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
    if v_id is null then raise exception 'Ese conductor no es de tu flota.' using errcode = '42501'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'No se ha podido dar de alta ese conductor. Escríbenos y lo revisamos.';
end $function$;

CREATE OR REPLACE FUNCTION public.mi_vehiculo_guardar(p_id uuid, p_matricula text, p_tipo tipo_vehiculo, p_itv date, p_seguro date, p_tarjeta date, p_adr boolean, p_trampilla boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_t uuid := transportista_del_usuario(); v_id uuid;
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar su flota.' using errcode = '42501'; end if;
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
    if v_id is null then raise exception 'Ese camión no es de tu flota.' using errcode = '42501'; end if;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.mi_transporte_guardar(p_nima text, p_seguro_compania text, p_seguro_poliza text, p_seguro_vence date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_t uuid := transportista_del_usuario();
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar estos datos.' using errcode = '42501'; end if;
  if length(coalesce(p_nima, '')) > 40 or length(coalesce(p_seguro_compania, '')) > 120 or length(coalesce(p_seguro_poliza, '')) > 60 then
    raise exception 'Alguno de los datos es demasiado largo.';
  end if;
  update transportistas set
    nima                = nullif(trim(p_nima), ''),
    seguro_cmr_compania = nullif(trim(p_seguro_compania), ''),
    seguro_cmr_poliza   = nullif(trim(p_seguro_poliza), ''),
    seguro_cmr_vence    = p_seguro_vence
  where id = v_t;
end $function$;

CREATE OR REPLACE FUNCTION public.marcar_sitio_principal(p_cliente uuid, p_sitio uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (es_admin() or p_cliente = cliente_del_usuario()) then
    raise exception 'No tienes permiso para hacer esto.' using errcode = '42501';
  end if;
  update clientes set sitio_defecto_id = p_sitio where id = p_cliente;
  if not found then
    raise exception 'Ese cliente no existe.';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.pedir_cambio_envio(p_envio uuid, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_detalle text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e envios%rowtype; v_det text := nullif(trim(coalesce(p_detalle, '')), ''); v_libre boolean; v_fechas boolean;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if coalesce(e.es_manual, false) then return jsonb_build_object('resultado', 'envio_manual'); end if;
  if e.estado <> 'programado' then return jsonb_build_object('resultado', 'no_modificable', 'estado', e.estado); end if;
  if e.cambio_cliente_estado = 'pendiente' then return jsonb_build_object('resultado', 'ya_pendiente'); end if;
  v_fechas := p_desde is not null and (p_desde, coalesce(p_hasta, p_desde)) is distinct from (e.fecha_carga_desde, coalesce(e.fecha_carga_hasta, e.fecha_carga_desde));
  if p_desde is not null and (p_desde <= (now() at time zone 'Europe/Madrid')::date or coalesce(p_hasta, p_desde) < p_desde or coalesce(p_hasta, p_desde) > (now() at time zone 'Europe/Madrid')::date + 183) then
    return jsonb_build_object('resultado', 'fechas_no_validas');
  end if;
  if not v_fechas and v_det is null then return jsonb_build_object('resultado', 'sin_cambios'); end if;
  if length(coalesce(v_det, '')) > 1000 then return jsonb_build_object('resultado', 'detalle_largo'); end if;

  v_libre := not coalesce(envio_asignandose(p_envio), true);
  -- Con camión asignado o asignándose no se modifica desde la plataforma: hay que llamar.
  if not v_libre then return jsonb_build_object('resultado', 'con_camion'); end if;
  -- Pasada la hora límite para cancelar gratis, tampoco: hay que llamar.
  if e.fecha_carga_desde is not null and now() >= corte_cancelacion(e.fecha_carga_desde) then
    return jsonb_build_object('resultado', 'fuera_de_plazo');
  end if;
  perform set_config('dynamo.cambio_envio', 'on', true);
  if v_libre and v_det is null then
    -- Sin camión y solo fechas: se aplica ya.
    update envios set fecha_carga_desde = p_desde, fecha_carga_hasta = coalesce(p_hasta, p_desde),
                      cambio_cliente = jsonb_build_object('fecha_desde', p_desde, 'fecha_hasta', coalesce(p_hasta, p_desde),
                                                          'antes_desde', e.fecha_carga_desde, 'antes_hasta', e.fecha_carga_hasta),
                      cambio_cliente_en = now(), cambio_cliente_estado = 'aplicado', cambio_cliente_nota = null
     where id = p_envio;
    perform set_config('dynamo.cambio_envio', 'off', true);
    return jsonb_build_object('resultado', 'aplicado');
  end if;
  update envios set cambio_cliente = jsonb_build_object('fecha_desde', case when v_fechas then p_desde end,
                                                        'fecha_hasta', case when v_fechas then coalesce(p_hasta, p_desde) end,
                                                        'detalle', v_det, 'con_camion', not v_libre),
                    cambio_cliente_en = now(), cambio_cliente_estado = 'pendiente', cambio_cliente_nota = null
   where id = p_envio;
  perform set_config('dynamo.cambio_envio', 'off', true);
  return jsonb_build_object('resultado', 'pendiente');
end $function$;

-- ---- 1. Reglas de la asignación y del estado, en la base de datos ---------------------
create or replace function fn_envios_ac_asignacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if new.transportista_id is not null and new.transportista_id is distinct from old.transportista_id then
    select estado_operativo, nima into t from transportistas where id = new.transportista_id;
    if t.estado_operativo = 'suspendido' and not es_consola_supabase() then
      raise exception 'Ese transportista está suspendido: no se le puede dar carga.';
    end if;
    new.estado_asignacion := 'confirmada';
    -- El NIMA es el del transportista nuevo (salvo que quien asigna ponga otro).
    if new.transportista_nima is not distinct from old.transportista_nima then new.transportista_nima := t.nima; end if;
  elsif new.transportista_id is null and old.transportista_id is not null then
    -- Sin transportista no quedan su camión, su conductor ni su precio.
    new.matricula_camion := null; new.matricula_remolque := null; new.conductor_nombre := null; new.conductor_telefono := null;
    new.vehiculo_camion_id := null; new.vehiculo_remolque_id := null; new.conductor_id := null;
    new.transportista_nima := null; new.importe_transportista := null;
    if new.estado_asignacion = 'confirmada' then
      new.estado_asignacion := case when exists (select 1 from envio_ofertas o where o.envio_id = new.id and o.estado = 'activa' and o.caduca_en > now())
                                    then 'ofertada' else 'sin_asignar' end;
    end if;
  end if;
  return new;
end $$;

create or replace function fn_envios_af_estado_con_camion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado') and new.estado is distinct from old.estado
     and new.transportista_id is null and new.operador_id is null and not es_consola_supabase() then   -- operador_id: envío manual (es_manual aún no está calculado aquí)
    raise exception 'Asigna antes el transportista: sin camión el envío no puede ir hacia la carga.';
  end if;
  return new;
end $$;
revoke execute on function fn_envios_af_estado_con_camion() from public, anon, authenticated;
drop trigger if exists tg_envios_af_estado_con_camion on envios;
create trigger tg_envios_af_estado_con_camion before update of estado on envios
  for each row execute function fn_envios_af_estado_con_camion();
comment on function public.fn_envios_af_estado_con_camion() is '[Disparadores] Un envío de Dynamo no pasa de programado (hacia la carga, cargando, en ruta, entregado) sin transportista asignado. Quién: disparador de envios.';
comment on function public.fn_envios_ac_asignacion() is '[Disparadores] Al asignar transportista: no deja dar carga a uno suspendido, marca la asignación como confirmada y copia su NIMA. Al quitarlo: limpia camión, conductor, NIMA y precio del transportista y vuelve a ofertada o sin asignar. Quién: disparador de envios.';

-- ---- 2. Funciones para lo que la web hacía escribiendo en las tablas ----------------
create or replace function asignar_transportista(p_envio uuid, p_transportista uuid, p_importe_transportista numeric default null,
  p_matricula_camion text default null, p_matricula_remolque text default null, p_conductor_nombre text default null, p_conductor_telefono text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_t record; v_tel text := regexp_replace(coalesce(p_conductor_telefono, ''), '[^0-9+]', '', 'g');
  m text; n int;
begin
  if not es_admin() then raise exception 'Solo Dynamo asigna transportistas.' using errcode = '42501'; end if;
  select estado_operativo into v_t from transportistas where id = p_transportista;
  if not found then return jsonb_build_object('ok', false, 'resultado', 'transportista_no_existe'); end if;
  if v_t.estado_operativo = 'suspendido' then return jsonb_build_object('ok', false, 'resultado', 'transportista_suspendido'); end if;
  if p_importe_transportista is not null and p_importe_transportista < 0 then return jsonb_build_object('ok', false, 'resultado', 'importe_no_valido'); end if;
  update envios set transportista_id = p_transportista, estado_asignacion = 'confirmada', importe_transportista = p_importe_transportista,
         matricula_camion = nullif(upper(regexp_replace(coalesce(p_matricula_camion, ''), '[\s-]', '', 'g')), ''),
         matricula_remolque = nullif(upper(regexp_replace(coalesce(p_matricula_remolque, ''), '[\s-]', '', 'g')), ''),
         conductor_nombre = nullif(trim(coalesce(p_conductor_nombre, '')), ''),
         conductor_telefono = case when length(replace(v_tel, '+', '')) >= 6 then v_tel end
   where id = p_envio;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  return jsonb_build_object('ok', true, 'resultado', 'asignado');
end $$;
revoke execute on function asignar_transportista(uuid, uuid, numeric, text, text, text, text) from public, anon;
grant execute on function asignar_transportista(uuid, uuid, numeric, text, text, text, text) to authenticated;
comment on function public.asignar_transportista(uuid, uuid, numeric, text, text, text, text) is '[Envíos] Asigna a mano un transportista a un envío (queda confirmado), con su precio, matrículas y conductor. No deja uno suspendido. Devuelve {ok, resultado: asignado | no_existe | transportista_no_existe | transportista_suspendido | importe_no_valido}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_transportista: transportistas.id · p_importe_transportista: euros sin IVA (opcional) · p_matricula_camion, p_matricula_remolque (opcionales; se guardan en mayúsculas y sin espacios) · p_conductor_nombre, p_conductor_telefono (opcionales; teléfono con prefijo).';

create or replace function quitar_transportista(p_envio uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if not es_admin() then raise exception 'Solo Dynamo asigna transportistas.' using errcode = '42501'; end if;
  update envios set transportista_id = null where id = p_envio and transportista_id is not null;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'resultado', case when exists (select 1 from envios where id = p_envio) then 'sin_transportista' else 'no_existe' end); end if;
  return jsonb_build_object('ok', true, 'resultado', 'quitado');
end $$;
revoke execute on function quitar_transportista(uuid) from public, anon;
grant execute on function quitar_transportista(uuid) to authenticated;
comment on function public.quitar_transportista(uuid) is '[Envíos] Quita el transportista de un envío: se borran también su camión, conductor, NIMA y precio, y el envío vuelve a ofertado o sin asignar. Devuelve {ok, resultado: quitado | no_existe | sin_transportista}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id.';

create or replace function marcar_estado_envio(p_envio uuid, p_estado estado_envio, p_fecha_carga_real date default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare e record;
begin
  if not es_admin() then raise exception 'Solo Dynamo cambia el estado de un envío.' using errcode = '42501'; end if;
  if p_estado not in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado') then return jsonb_build_object('ok', false, 'resultado', 'estado_no_valido'); end if;
  select estado, transportista_id, es_manual into e from envios where id = p_envio;
  if not found then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  if e.estado = 'cancelado' then return jsonb_build_object('ok', false, 'resultado', 'cancelado'); end if;
  if p_estado <> 'programado' and e.transportista_id is null and not e.es_manual then return jsonb_build_object('ok', false, 'resultado', 'sin_transportista'); end if;
  update envios set estado = p_estado, fecha_carga_real = coalesce(p_fecha_carga_real, fecha_carga_real) where id = p_envio;
  return jsonb_build_object('ok', true, 'resultado', 'cambiado');
end $$;
revoke execute on function marcar_estado_envio(uuid, estado_envio, date) from public, anon;
grant execute on function marcar_estado_envio(uuid, estado_envio, date) to authenticated;
comment on function public.marcar_estado_envio(uuid, estado_envio, date) is '[Envíos] Dynamo cambia la fase de un envío (programado, hacia_la_carga, cargando, en_ruta, entregado). Para cancelar: cancelar_envio. Devuelve {ok, resultado: cambiado | no_existe | cancelado | sin_transportista | estado_no_valido}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_estado: la fase nueva · p_fecha_carga_real: día real de carga (opcional).';

create or replace function revocar_oferta(p_oferta uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if not es_admin() then raise exception 'Solo Dynamo gestiona ofertas.' using errcode = '42501'; end if;
  update envio_ofertas set estado = 'revocada' where id = p_oferta and estado = 'activa';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0, 'resultado', case when n > 0 then 'revocada' else 'no_activa' end);
end $$;
revoke execute on function revocar_oferta(uuid) from public, anon;
grant execute on function revocar_oferta(uuid) to authenticated;
comment on function public.revocar_oferta(uuid) is '[Ofertas y tablón] Retira una oferta activa: su enlace deja de valer. Devuelve {ok, resultado: revocada | no_activa}. Quién: Dynamo (admin o empleado). Argumentos: p_oferta: envio_ofertas.id.';

-- ---- 5. mi_empresa() con el IVA del cliente ---------------------------------------
drop function mi_empresa();
create function mi_empresa()
returns table (id uuid, codigo text, razon_social text, nombre_comercial text, cif text, direccion text, poblacion text, codigo_postal text,
  provincia text, pais_codigo_iso character, plazo_pago_dias integer, discrecion_comercial boolean, tipo_camion_defecto tipo_camion,
  forma_carga_defecto forma_carga, plataforma_elevadora_defecto boolean, estado estado_cuenta, iva_porcentaje numeric)
language sql stable security definer set search_path = public as $$
  select c.id, c.codigo, c.razon_social, c.nombre_comercial, c.cif, c.direccion,
         c.poblacion, c.codigo_postal, c.provincia, c.pais_codigo_iso,
         c.plazo_pago_dias, c.discrecion_comercial, c.tipo_camion_defecto,
         c.forma_carga_defecto, c.plataforma_elevadora_defecto, c.estado, c.iva_porcentaje
    from clientes c where c.id = cliente_del_usuario()
$$;
revoke execute on function mi_empresa() from public, anon;
grant execute on function mi_empresa() to authenticated;
comment on function public.mi_empresa() is '[Clientes y cuentas] Ficha de la empresa del cliente que llama: código, razón social, nombre comercial, CIF, dirección, plazo de pago, preferencias por defecto (camión, forma de carga, plataforma, discreción comercial), estado de la cuenta y su % de IVA. Quién: cliente. Argumentos: sin argumentos.';

-- ---- 6. funciones_api(): con los valores por defecto y si se llama sin sesión --------
drop function funciones_api();
create function funciones_api()
returns table (grupo text, funcion text, argumentos text, devuelve text, sin_sesion boolean, descripcion text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (ve_todo() or es_servidor()) then raise exception 'Solo Dynamo.' using errcode = '42501'; end if;
  return query
  select coalesce(substring(obj_description(p.oid, 'pg_proc') from '^\[([^\]]+)\]'), 'Sin grupo'), p.proname::text,
         pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
         has_function_privilege('anon', p.oid, 'execute'), obj_description(p.oid, 'pg_proc')
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'execute')
   order by 1, 2;
end $$;
revoke execute on function funciones_api() from public, anon;
grant execute on function funciones_api() to authenticated;
comment on function public.funciones_api() is '[Sistema y tareas automáticas] Las funciones que se pueden llamar por la API, agrupadas: qué hacen, quién puede, sus argumentos (con los valores por defecto: esos se pueden omitir) y si se llaman sin sesión (enlaces públicos). Las del grupo «Ayudantes internos» no son para automatizar. Quién: Dynamo y servidor.';

-- ---- 7. Guía para n8n y agentes, al día -------------------------------------------
create or replace function guia_automatizaciones()
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if not (ve_todo() or es_servidor()) then raise exception 'Solo Dynamo.' using errcode = '42501'; end if;
  return $guia$
GUÍA PARA AUTOMATIZACIONES (n8n, agentes de IA) — Plataforma Dynamo

1. CÓMO ENTRAR
   · Un usuario de Dynamo propio para las automatizaciones (p. ej. «Automatizaciones n8n», rol EMPLEADO; si solo lee,
     EMPLEADO_LECTURA). n8n inicia sesión con su email y contraseña (Supabase Auth) y llama a la API con ese token: se
     aplican las mismas reglas que en la web y la auditoría dice quién lo hizo.
   · La clave de servicio (service_role) se salta las reglas por fila: solo para tareas de sistema (p. ej. el webhook de
     Stripe → pago_envio_stripe) y nunca en un flujo que hable con terceros. Esas funciones de servidor NO salen en
     funciones_api(); su descripción se lee en el editor de Supabase. Las funciones de Dynamo comprueban «usuario de
     Dynamo»: con la clave de servicio responden «Solo Dynamo»; para ellas, el usuario propio.
   · Credenciales guardadas en n8n, nunca a la vista en los flujos.

2. LLAMAR A UNA FUNCIÓN
   · POST /rest/v1/rpc/<funcion> con los argumentos en JSON por su NOMBRE (p_envio, p_estado…). Los que tienen valor por
     defecto se pueden omitir. Lista completa: POST /rest/v1/rpc/funciones_api (o select * from funciones_api();).
   · Las que devuelven TABLE responden una lista (aunque sea de una fila).

3. ¿HA IDO BIEN? (regla para todas)
   · Error HTTP (4xx/5xx) = no se ha hecho nada. El campo «message» viene en castellano y se puede enseñar.
       - code 42501 → sin permiso (usuario equivocado o rol sin acceso). No reintentar.
       - code 55000 → plataforma en modo mantenimiento. Reintentar más tarde.
       - code PGRST202 → nombre de función o de argumento mal escrito.
       - el resto → la regla del negocio que falla va en «message» (p. ej. «Ese transportista está suspendido»).
   · Respuesta correcta con {resultado: …}: mirar «resultado». Las funciones nuevas traen además {ok: true|false}.
     Los códigos posibles de cada una están en su descripción.
   · Respuesta vacía (void) sin error = hecho.

4. ESCRIBIR: CON FUNCIONES O DIRECTO EN LA TABLA
   · Con FUNCIÓN siempre que exista (aplican previo pago, cobertura, revisión del precio, festivos, plazos…):
     crear un envío de Dynamo → crear_envio · poner precio a una solicitud de un cliente → proponer_precio_solicitud ·
     ofertar a un transportista → ofertar_envio · retirar una oferta → revocar_oferta · asignar o quitar transportista →
     asignar_transportista / quitar_transportista · cambiar la fase → marcar_estado_envio · cancelar → cancelar_envio ·
     revisar el precio de un envío lejano → revisar_precio_envio · marcar una transferencia → marcar_pago_envio ·
     horario de un sitio → guardar_horario / horario_del_dia · ¿hay cobertura? → comprobar_cobertura.
     (crear_solicitud_envio es la petición de un CLIENTE: con el usuario de Dynamo se usa crear_envio.)
   · DIRECTO en la tabla (las reglas las ponen la seguridad por filas y los disparadores): incidencias, penalizaciones,
     almacenamientos, documentos, transportistas, operadores, clientes, sitios y contactos. Al cambiar a mano el precio
     del cliente de un envío (envios.importe_cliente), poner también precio_fijado_a_mano = true.
   · Las columnas «automático» del diccionario las pone la base de datos: no se escriben nunca.

5. LEER
   · Qué significa cada dato: select * from diccionario_datos() where tabla = 'envios';
   · Envíos vistos por el cliente o el transportista: mis_envios(), mis_viajes() (sin datos de la otra parte).

6. GLOSARIO Y CONVENCIONES
   · Envío = el transporte que pide el cliente. En las pantallas del transportista se llama «carga» (antes de aceptarla:
     enlaces /carga, funciones *_carga_publica) y «viaje» (después). Es el mismo registro de envios.
   · Sitio = dirección de recogida o entrega de la agenda (tabla sitios). Polo logístico (futuro) = ciudad de referencia
     del tarifador.
   · Importes en euros SIN IVA salvo que la descripción diga otra cosa (IVA aparte: iva_aplicado / clientes.iva_porcentaje).
   · date = día (hora de Madrid); timestamptz = instante, en ISO 8601 con zona. Columnas *_en = instante.
   · Países en ISO de 2 letras (ES, PT, FR…). Códigos postales como texto (conservan el 0 inicial).
   · Referencia del envío (envios.referencia_gx): la pone la base de datos, GX + número, +7 entre una y la siguiente (la
     primera, GX100888689). Es la «referencia_gx_carga» de las hojas de n8n.
   · Los valores de cada lista cerrada (estados, tipos…) están en el diccionario, columna «lista».
   · Nunca se borra el histórico: los envíos se cancelan, no se borran.

7. DATOS PERSONALES
   · Teléfonos, DNI, emails y firmas son datos personales (RGPD): no enviarlos a servicios externos (IA incluida) si no
     hace falta para la tarea, y nunca a una bolsa de cargas pública.
$guia$;
end $$;

-- ---- 8. Descripciones -------------------------------------------------------------
comment on function public.deshacer_cancelacion(uuid) is '[Envíos] Ficha del envío: devuelve un envío cancelado al estado que tenía antes de cancelarse (programado si no se sabe; una solicitud vuelve a solicitud, con plazo de pago nuevo) y avisa al transportista si lo tenía. Devuelve el estado al que vuelve (texto). Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id (cancelado).';
comment on function public.revisar_precio_envio(uuid, numeric) is '[Precio y pago] Fija el precio definitivo de un envío con precio provisional. Si cambia menos del margen (parámetro, 5 %) se mantiene; si baja, se aplica; si sube más del margen, queda esperando que el cliente acepte o cancele sin coste. Avisa al cliente en cada caso. Devuelve {resultado: mantenido | bajado | subida | no_existe | no_provisional | precio_no_valido}. Quién: Dynamo y servidor. Argumentos: p_envio: envios.id (programado con precio por revisar) · p_nuevo: precio al cliente en euros sin IVA.';
comment on function public.fn_envios_refrescar_ruta() is '[Disparadores] Mantiene en envios codigo_postal_origen/destino, poblacion_origen/destino, num_paradas y km_total a partir de las paradas. Por disparador y no desde la app: así no se pueden desincronizar.';
comment on function public.pago_envio_stripe(uuid, text, bigint) is '[Precio y pago] Aplica un cobro con tarjeta confirmado por Stripe (lo llama el webhook del servidor con la clave de servicio). Si el importe no cuadra o el envío ya no espera el pago, no lo aplica: lo apunta en stripe_cobro_sin_aplicar y avisa a Dynamo. Devuelve {resultado}. Quién: servidor. Argumentos: p_envio: envios.id · p_pago: id del pago en Stripe · p_centimos: importe cobrado en céntimos.';
comment on function public.validar_pin_parada(uuid, text, inet, text) is '[CMR y PIN] Comprueba el PIN de una parada (lo dice el conductor al llegar) y apunta el intento con IP y navegador; demasiados fallos bloquean. Devuelve {resultado}. Quién: servidor. Argumentos: p_parada: envio_paradas.id · p_pin: el PIN · p_ip, p_navegador: de quien lo escribe.';
comment on function public.aceptar_reserva(uuid, uuid, uuid, numeric) is '[Ofertas y tablón] Paso interno de aceptar una carga reservada: comprueba la reserva y el precio y la cierra. Lo usan las funciones públicas del enlace de la carga. Devuelve {resultado}. Quién: servidor (interno). Argumentos: p_reserva: envio_reservas.id · p_transportista: transportistas.id · p_usuario: usuarios.id · p_precio: euros sin IVA.';
comment on function public.cerrar_aceptacion(uuid, uuid, uuid, numeric) is '[Ofertas y tablón] Paso interno: asigna el envío al transportista que aceptó, cierra las demás ofertas y reservas y registra el hito. Devuelve {resultado}. Quién: servidor (interno). Argumentos: p_reserva: envio_reservas.id · p_transportista: transportistas.id · p_usuario: usuarios.id · p_precio: euros sin IVA.';
comment on function public.registrar_hito(uuid, tipo_hito, uuid, uuid, jsonb, text) is '[Envíos] Apunta un hito en la línea de tiempo del envío (envio_hitos). Quién: servidor (interno; los disparadores lo usan). Argumentos: p_envio: envios.id · p_hito: tipo de hito · p_parada, p_oferta: opcionales · p_datos: detalles en JSON · p_origen: app, servidor o sistema.';
comment on function public.parametro(text) is '[Ayudantes internos] Valor de un parámetro de la tabla parametros (en JSON). Quién: servidor (interno). Argumentos: p_clave: parametros.clave.';
comment on function public.tarifa_almacen(uuid) is '[Precio y pago] Precio por semana de almacenaje y del reparto de un almacén de Dynamo. Quién: servidor (interno). Argumentos: p_almacen: sitios.id (almacén de Dynamo).';
comment on view public.v_tablas_sin_rls is 'Control de seguridad: tablas del esquema public sin seguridad por filas (tiene que salir vacía).';
comment on function public.fn_restriccion_punto(character, text, text, tipo_carga, date) is '[Distancias y cobertura] Reglas que afectan a un punto (país + CP + si es carga o descarga + tipo de carga + fecha): fuera de cobertura y restricciones de servicio activas. Devuelve nombre, efecto (bloquea, solo_admin o avisa) y mensaje, las que bloquean primero. Quién: cualquier usuario con sesión. Argumentos: p_pais: ISO 2 letras · p_cp: código postal · p_tipo_parada: carga o descarga (por defecto descarga) · p_tipo_carga (opcional) · p_fecha (por defecto hoy).';
