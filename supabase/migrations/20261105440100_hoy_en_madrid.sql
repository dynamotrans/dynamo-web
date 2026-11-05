-- =====================================================================================
-- «HOY» ES EL DÍA DE MADRID EN TODA LA BASE DE DATOS (2026-11-05)
-- Supabase va en hora UTC: current_date es el día UTC, y entre las 00:00 y la 01:00 de
-- Madrid (02:00 en verano) todavía es «ayer». Estas funciones usaban current_date; pasan a
-- (now() at time zone 'Europe/Madrid')::date, como el resto. Ejemplo del fallo: a las 00:30
-- de Madrid, un envío manual para hoy salía como «fecha pasada».
-- Solo cambia eso: mismo nombre, argumentos y permisos.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.marcar_mi_envio_manual(p_envio uuid, p_estado text, p_precio numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_actual estado_envio; v_manual boolean;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select estado, operador_id is not null into v_actual, v_manual from envios where id = p_envio for update;
  if not v_manual then raise exception 'Este envío lo gestiona Dynamo.' using errcode = '42501'; end if;
  if v_actual = 'cancelado' then raise exception 'El envío está cancelado.'; end if;
  if p_estado not in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado') then raise exception 'Estado no válido.'; end if;
  update envios set estado = p_estado::estado_envio,
                    fecha_carga_real = case when p_estado in ('en_ruta', 'entregado') then coalesce(fecha_carga_real, (now() at time zone 'Europe/Madrid')::date)
                                            when p_estado = 'programado' then null else fecha_carga_real end,
                    precio_acordado_operador = coalesce(p_precio, precio_acordado_operador)
   where id = p_envio;
end $function$;

CREATE OR REPLACE FUNCTION public.metricas_usuarios()
 RETURNS TABLE(id uuid, consultas bigint, min_dia integer, min_semana integer, ultimo_latido timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select u.id,
         (select count(*) from consultas_precio q where q.usuario_id = u.id),
         (select coalesce(sum(c.minutos), 0) / 30 from conexion_minutos c where c.usuario_id = u.id and c.dia > (now() at time zone 'Europe/Madrid')::date - 30)::integer,
         (select coalesce(sum(c.minutos), 0) / 4  from conexion_minutos c where c.usuario_id = u.id and c.dia > (now() at time zone 'Europe/Madrid')::date - 28)::integer,
         (select max(c.ultimo) from conexion_minutos c where c.usuario_id = u.id)
    from usuarios u
   where ve_todo()
$function$;

CREATE OR REPLACE FUNCTION public.purgar_datos_personales()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb := '{}'; n int;
begin
  if not (es_servidor() or es_consola_supabase() or es_admin_master()) then
    raise exception 'Solo el sistema o el Admin Master.' using errcode = '42501';
  end if;
  -- Apagada por defecto: no se borra NADA del histórico (decisión del usuario 2026-11-05).
  if not coalesce((parametro('rgpd_limpieza_activa') #>> '{}')::boolean, false) then
    return jsonb_build_object('limpieza', 'desactivada');
  end if;
  perform set_config('dynamo.purga', 'on', true);
  perform set_config('dynamo.anonimizando', 'on', true);
  update envio_reservas set ip = null, navegador = null
   where coalesce(cerrada_en, desde) < now() - interval '90 days' and (ip is not null or navegador is not null);
  get diagnostics n = row_count; r := r || jsonb_build_object('reservas_ip', n);
  delete from intentos_carga_publica where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_carga', n);
  delete from pin_intentos where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_pin', n);
  delete from contraoferta_intentos where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_contraoferta', n);
  delete from conexion_minutos where dia < (now() at time zone 'Europe/Madrid')::date - 365;
  get diagnostics n = row_count; r := r || jsonb_build_object('conexion', n);
  delete from consultas_precio where cuando < now() - interval '12 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('consultas', n);
  -- Teléfono de los conductores sin viajes: SOLO si se activa en Parámetros
  -- (rgpd_telefono_conductor_anios > 0). Por defecto NO se borra: el usuario quiere
  -- conservar los datos de conductores y contactos para portes posteriores (2026-11-05).
  n := 0;
  if parametro_num('rgpd_telefono_conductor_anios', 0) > 0 then
    with sin_viajes as (
      select c.id from conductores c
       where c.creado_en < now() - make_interval(years => parametro_num('rgpd_telefono_conductor_anios', 0)::int)
         and not exists (select 1 from envios e where e.conductor_id = c.id
                          and coalesce(e.fecha_carga_real::date, e.fecha_carga_desde, e.creado_en::date)
                              > (now() at time zone 'Europe/Madrid')::date - (365 * parametro_num('rgpd_telefono_conductor_anios', 0))::int)
    ), a as (update conductores set telefono = null where id in (select id from sin_viajes) and telefono is not null returning 1)
    select count(*) into n from a;
    update envios set conductor_telefono = null
     where conductor_telefono is not null and conductor_id in (select id from conductores where telefono is null);
  end if;
  r := r || jsonb_build_object('telefonos_conductores', n);
  -- IP y navegador de las reservas que se copiaron a la auditoría antes de este cambio.
  update auditoria set cambios = ((cambios #- '{despues,ip}' #- '{despues,navegador}' #- '{antes,ip}' #- '{antes,navegador}') - 'ip' - 'navegador')
   where tabla = 'envio_reservas' and cuando < now() - interval '90 days'
     and (cambios::text like '%"ip"%' or cambios::text like '%"navegador"%');
  get diagnostics n = row_count; r := r || jsonb_build_object('auditoria_ip', n);
  -- La IP que apuntaba el alta online en su nota interna.
  update notas_internas set texto = regexp_replace(texto, ' \(IP [^)]*\)', '', 'g')
   where texto ~ '\(IP ' and creado_en < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('notas_ip', n);
  perform set_config('dynamo.purga', 'off', true);
  perform set_config('dynamo.anonimizando', 'off', true);
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.restriccion_punto(p_pais character, p_cp text, p_tipo_parada text DEFAULT 'descarga'::text, p_tipo_carga tipo_carga DEFAULT NULL::tipo_carga, p_fecha date DEFAULT (now() at time zone 'Europe/Madrid')::date)
 RETURNS TABLE(nombre text, efecto text, mensaje text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 'Fuera de cobertura'::text, 'bloquea'::text, fuera_de_cobertura(p_pais)
   where fuera_de_cobertura(p_pais) is not null
  union all
  select * from (
    select r.nombre, r.efecto, r.mensaje
      from restricciones_servicio r
     where r.pais_codigo_iso = upper(p_pais)
       and r.activa
       and p_fecha >= r.vigente_desde
       and (r.vigente_hasta is null or p_fecha <= r.vigente_hasta)
       and (r.prefijos_cp is null
            or (p_cp is not null and exists (select 1 from unnest(r.prefijos_cp) px where normalizar_cp(p_cp) like px || '%')))
       and (r.aplica_a = 'cualquier_punto' or r.aplica_a = p_tipo_parada)
       and (r.tipo_carga is null or r.tipo_carga = p_tipo_carga)
     order by case r.efecto when 'bloquea' then 1 when 'solo_admin' then 2 else 3 end, r.nombre
  ) x
$function$;

CREATE OR REPLACE FUNCTION public.crear_envio_manual(p_datos jsonb, p_paradas jsonb)
 RETURNS TABLE(id uuid, referencia_gx text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cliente uuid := cliente_del_usuario();
  v_oper uuid := nullif(p_datos ->> 'operador_id', '')::uuid;
  v_id uuid; v_gx text; v_p jsonb; v_orden smallint := 0; v_sitio uuid; l sitios%rowtype;
begin
  if v_cliente is null or not exists (select 1 from usuarios u where u.id = auth.uid() and u.estado = 'activa') then
    raise exception 'Tu cuenta no puede crear envíos todavía.' using errcode = '42501';
  end if;
  if v_oper is null or not exists (select 1 from operadores o where o.id = v_oper and o.cliente_id = v_cliente and not o.borrado) then
    raise exception 'Elige uno de tus operadores de transporte.';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envío necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como máximo 4 puntos en la ruta (2 paradas además del origen y el destino).';
  end if;
  if (p_datos ->> 'fecha_carga_desde') is null or (p_datos ->> 'fecha_carga_desde')::date < (now() at time zone 'Europe/Madrid')::date then
    raise exception 'Elige una fecha de recogida de hoy en adelante.';
  end if;
  if (p_datos ->> 'precio_acordado_operador') is not null and (p_datos ->> 'precio_acordado_operador')::numeric < 0 then
    raise exception 'El precio acordado no es válido.';
  end if;

  insert into envios (cliente_id, operador_id, referencia_cliente, estado,
    fecha_carga_desde, fecha_carga_hasta, descripcion_mercancia, toneladas, metros_lineales,
    paletizado, carga_lateral, carga_trasera, carga_techo, requiere_plataforma_elevadora, requiere_nima, adr,
    precio_acordado_operador, discrecion_comercial, anotaciones_cliente)
  values (v_cliente, v_oper, nullif(trim(p_datos ->> 'referencia_cliente'), ''), 'borrador',
    (p_datos ->> 'fecha_carga_desde')::date, (p_datos ->> 'fecha_carga_hasta')::date,
    nullif(trim(p_datos ->> 'descripcion_mercancia'), ''),
    (p_datos ->> 'toneladas')::numeric, (p_datos ->> 'metros_lineales')::numeric,
    coalesce((p_datos ->> 'paletizado')::boolean, true), coalesce((p_datos ->> 'carga_lateral')::boolean, true),
    coalesce((p_datos ->> 'carga_trasera')::boolean, false), coalesce((p_datos ->> 'carga_techo')::boolean, false),
    coalesce((p_datos ->> 'requiere_plataforma_elevadora')::boolean, false), coalesce((p_datos ->> 'requiere_nima')::boolean, false),
    coalesce((p_datos ->> 'adr')::boolean, false), (p_datos ->> 'precio_acordado_operador')::numeric,
    coalesce((p_datos ->> 'discrecion_comercial')::boolean, false), left(nullif(trim(p_datos ->> 'anotaciones_cliente'), ''), 1000))
  returning envios.id, envios.referencia_gx into v_id, v_gx;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    if (v_p ->> 'tipo') not in ('carga', 'descarga') then raise exception 'Tipo de parada no válido.'; end if;
    v_sitio := nullif(v_p ->> 'sitio_id', '')::uuid;
    if v_sitio is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into sitios (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso)
      values (v_cliente, trim(v_p ->> 'nombre_empresa'), coalesce(nullif(v_p ->> 'tipo_sitio', '')::tipo_sitio, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''), nullif(trim(v_p ->> 'poblacion'), ''),
              nullif(trim(v_p ->> 'provincia'), ''), coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'))
      returning sitios.id into v_sitio;
      if regexp_replace(coalesce(v_p ->> 'contacto_telefono', ''), '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$' then
        insert into contactos (sitio_id, nombre, telefono, es_principal)
        values (v_sitio, nullif(trim(v_p ->> 'contacto_nombre'), ''), regexp_replace(v_p ->> 'contacto_telefono', '[^0-9+]', '', 'g'), true);
      end if;
    end if;
    if v_sitio is not null then
      select * into l from sitios where sitios.id = v_sitio and not borrado and (es_almacen_dynamo or cliente_id = v_cliente);
      if not found then raise exception 'El sitio elegido no existe o no es tuyo.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, sitio_id, nombre_empresa, direccion, codigo_postal, poblacion,
                                 provincia, pais_codigo_iso, lat, lon, referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', v_sitio, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion,
              l.provincia, l.pais_codigo_iso, l.lat, l.lon, nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    else
      if nullif(trim(v_p ->> 'nombre_empresa'), '') is null or nullif(trim(v_p ->> 'poblacion'), '') is null then
        raise exception 'Al sitio le faltan la empresa o la población.';
      end if;
      insert into envio_paradas (envio_id, orden, tipo, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, referencia)
      values (v_id, v_orden, v_p ->> 'tipo', trim(v_p ->> 'nombre_empresa'), nullif(trim(v_p ->> 'direccion'), ''),
              nullif(trim(v_p ->> 'codigo_postal'), ''), trim(v_p ->> 'poblacion'), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'), nullif(trim(v_p ->> 'referencia'), ''));
    end if;
  end loop;
  update envios set estado = 'programado' where envios.id = v_id;   -- comprueba la ruta y sella los hitos
  return query select v_id, v_gx;
end $function$;

CREATE OR REPLACE FUNCTION public.riesgos_clientes()
 RETURNS TABLE(cliente_id uuid, nombre text, cif text, riesgo_cesce numeric, plazo_cesce integer, riesgo_manual numeric, riesgo_efectivo numeric, manda text, envios integer, asumido_base numeric, asumido numeric, disponible numeric, ultimo_envio date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with d as (select parametro_num('riesgo_dias_asumido', 60)::int as dias),
  a as (
    select e.cliente_id, count(*)::int as n,
           sum(coalesce(e.importe_cliente, 0)) as base,
           sum(round(coalesce(e.importe_cliente, 0) * (1 + coalesce(c.iva_pct, 21) / 100), 2)) as total,
           max(coalesce(e.fecha_carga_real, e.fecha_carga_desde)) as ultimo
      from envios e join clientes c on c.id = e.cliente_id, d
     where not coalesce(e.es_manual, false)
       and e.estado not in ('borrador', 'cancelado')
       and e.estado_pago_previo in ('no_requerido', 'exento')          -- lo pagado por adelantado no es riesgo
       and coalesce(e.fecha_carga_real, e.fecha_carga_desde, e.creado_en::date) >= (now() at time zone 'Europe/Madrid')::date - d.dias
     group by e.cliente_id
  )
  select c.id, c.nombre_visible, c.cif, c.riesgo_cesce_euros, c.riesgo_cesce_plazo_dias, c.riesgo_manual_euros,
         c.riesgo_efectivo_euros,
         case when coalesce(c.riesgo_manual_euros, 0) <> 0 then 'manual' when c.riesgo_cesce_euros is not null then 'cesce' else 'ninguno' end,
         coalesce(a.n, 0), coalesce(a.base, 0), coalesce(a.total, 0),
         case when c.riesgo_efectivo_euros is null then null else c.riesgo_efectivo_euros - coalesce(a.total, 0) end,
         a.ultimo
    from clientes c left join a on a.cliente_id = c.id
   where ve_todo()
$function$;
-- Lo mismo en la vista de restricciones vigentes y en dos valores por defecto.
create or replace view public.v_restricciones_vigentes with (security_invoker = true) as
 SELECT nombre,
    pais_codigo_iso,
    prefijos_cp,
    aplica_a,
    COALESCE((tipo_carga)::text, 'cualquiera'::text) AS tipo_carga,
    efecto,
    mensaje,
    vigente_desde
   FROM restricciones_servicio r
  WHERE (activa AND ((now() at time zone 'Europe/Madrid')::date >= vigente_desde) AND ((vigente_hasta IS NULL) OR ((now() at time zone 'Europe/Madrid')::date <= vigente_hasta)))
  ORDER BY pais_codigo_iso, nombre;
alter table public.recargos_tipo_sitio alter column vigente_desde set default ((now() at time zone 'Europe/Madrid')::date);
alter table public.restricciones_servicio alter column vigente_desde set default ((now() at time zone 'Europe/Madrid')::date);
