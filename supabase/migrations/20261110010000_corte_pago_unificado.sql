-- =====================================================================================
-- AL PAGAR Y LIBERAR RIGEN LOS MISMOS CORTES QUE AL PEDIR (usuario, 2026-11-10)
-- =====================================================================================
-- Fuera los dos parámetros de «Al pagar y liberar» (primer_dia_corte_pago_fija_hora y
-- primer_dia_corte_pago_ventana_hora): cuando llega el pago previo (o se pasa sin él)
-- y la fecha ya no llega, el primer día posible se calcula con LOS MISMOS cortes que
-- al pedir — la fecha fija con el suyo y cada ventana (1-2, 1-3, 1-4) con el suyo.
--   · primera_fecha_carga() pierde p_al_pagar: queda (p_fija, p_instante,
--     p_ventana_dias). La firma vieja se borra para que no queden dos candidatas, y
--     los tres llamadores pasan a la nueva (crear_envio_cliente, pedir_cambio_envio y
--     el disparador fn_envios_a0_fecha_al_pagar, que ahora pasa los días de SU ventana).
-- =====================================================================================

delete from parametros where clave in ('primer_dia_corte_pago_fija_hora', 'primer_dia_corte_pago_ventana_hora');

-- ---- primera_fecha_carga: sin p_al_pagar (la firma vieja, fuera) -------------------
drop function if exists public.primera_fecha_carga(boolean, timestamp with time zone, boolean, integer);

create or replace function public.primera_fecha_carga(p_fija boolean, p_instante timestamp with time zone default now(),
  p_ventana_dias integer default 3)
 returns date language plpgsql stable security definer set search_path to 'public'
as $function$
declare l timestamp := p_instante at time zone 'Europe/Madrid';
        corte numeric := case
          when p_fija then parametro_num('primer_dia_corte_fija_hora', 12)
          -- Cada ventana con SU hora de corte (usuario, 2026-11-10); al pagar o liberar
          -- rigen estos mismos cortes.
          when coalesce(p_ventana_dias, 3) <= 2 then parametro_num('primer_dia_corte_ventana_1_2_hora', 14)
          when coalesce(p_ventana_dias, 3) >= 4 then parametro_num('primer_dia_corte_ventana_1_4_hora', 14)
          else parametro_num('primer_dia_corte_ventana_1_3_hora', 14) end;
        antes boolean := extract(hour from l) + extract(minute from l) / 60.0 < corte;
begin
  if not p_fija then
    -- VENTANA (usuario, 2026-11-08): puede empezar HOY MISMO si es antes del corte y hoy
    -- es día hábil (los sábados, domingos y festivos nacionales no cuentan); si no, el
    -- siguiente día hábil — nunca salta dos.
    if antes and es_dia_habil(l::date) then return l::date; end if;
    return sumar_dias_habiles(l::date, 1);
  end if;
  return sumar_dias_habiles(l::date, case when antes then 1 else 2 end);
end $function$;
revoke all on function public.primera_fecha_carga(boolean, timestamp with time zone, integer) from public, anon;
grant execute on function public.primera_fecha_carga(boolean, timestamp with time zone, integer) to authenticated, service_role;
comment on function public.primera_fecha_carga(boolean, timestamp with time zone, integer) is '[Calendario y festivos] Primer día en que se puede cargar si se pide (o se paga o libera: rigen los MISMOS cortes) en un instante, contando solo días hábiles (sin sábados, domingos ni festivos nacionales). Ventana: hoy mismo antes de su hora de corte si hoy es hábil; si no, el siguiente día hábil. Fecha fija: el siguiente día hábil antes del corte; después, el otro. Horas de corte en Parámetros: una por ventana (primer_dia_corte_ventana_1_2/1_3/1_4_hora) y la de fecha fija (primer_dia_corte_fija_hora). Quién: cualquier usuario con sesión. Argumentos: p_fija: true = fecha fija, false = ventana · p_instante: cuándo (por defecto, ahora) · p_ventana_dias: días hábiles de la ventana (2, 3 o 4; por defecto 3), para elegir su corte.';

-- ---- Los tres llamadores pasan a la firma nueva ------------------------------------
-- 1) crear_envio_cliente (igual que 20261110000000, con la llamada sin p_al_pagar).
create or replace function crear_envio_cliente(p_datos jsonb, p_paradas jsonb)
returns table (id uuid, referencia_gx text)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cliente uuid := cliente_del_usuario();
  v_importe numeric := round((p_datos ->> 'importe_cliente')::numeric, 2);
  v_id uuid; v_gx text; v_p jsonb; v_orden smallint := 0; v_sitio uuid; l sitios%rowtype;
  v_desde date; v_hasta date; v_vdias int;
begin
  if v_cliente is null or not exists (select 1 from usuarios u where u.id = auth.uid() and u.estado = 'activa') then
    raise exception 'Tu cuenta no puede crear envíos todavía.' using errcode = '42501';
  end if;
  if v_importe is null or v_importe <= 0 or v_importe > 100000 then
    raise exception 'Falta el precio del envío (lo pone el tarifador).';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envío necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como máximo 4 puntos en la ruta (2 paradas además del origen y el destino).';
  end if;
  -- REGLAS DURAS DE LA FECHA (usuario, 2026-11-09): el cliente NUNCA elige fuera de
  -- las reglas, ni saltándose la pantalla — solo días hábiles, y nunca antes del primer
  -- día que permite la hora de corte de SU ventana (cada ventana tiene la suya en
  -- Parámetros; la fecha fija, la suya). Saltárselas es cosa del Admin Master, que no
  -- pasa por aquí (usa crear_envio).
  v_desde := (p_datos ->> 'fecha_carga_desde')::date;
  v_hasta := coalesce((p_datos ->> 'fecha_carga_hasta')::date, v_desde);
  if v_desde is null then raise exception 'Elige una fecha de recogida.'; end if;
  if v_hasta < v_desde then raise exception 'La ventana no puede terminar antes de empezar.'; end if;
  if not es_dia_habil(v_desde) or not es_dia_habil(v_hasta) then
    raise exception 'La recogida solo puede empezar y terminar en un día hábil (sin sábados, domingos ni festivos).';
  end if;
  v_vdias := dias_ventana_carga(v_desde, v_hasta);
  if v_desde < primera_fecha_carga(v_hasta = v_desde, now(), v_vdias) then
    raise exception 'Esa fecha ya no se puede elegir (hora de corte): el primer día posible ahora mismo es el %.',
      to_char(primera_fecha_carga(v_hasta = v_desde, now(), v_vdias), 'DD/MM/YYYY');
  end if;

  insert into envios (cliente_id, referencia_cliente, estado, estado_solicitud, condiciones_aceptadas_en, importe_cliente,
    fecha_carga_desde, fecha_carga_hasta, descripcion_mercancia, toneladas, metros_lineales,
    paletizado, carga_lateral, carga_trasera, carga_techo, requiere_plataforma_elevadora, requiere_nima, adr,
    iva_pct, discrecion_comercial, anotaciones_cliente)
  values (v_cliente, nullif(trim(p_datos ->> 'referencia_cliente'), ''), 'borrador', 'aceptada', now(), v_importe,
    (p_datos ->> 'fecha_carga_desde')::date, (p_datos ->> 'fecha_carga_hasta')::date,
    nullif(trim(p_datos ->> 'descripcion_mercancia'), ''),
    (p_datos ->> 'toneladas')::numeric, (p_datos ->> 'metros_lineales')::numeric,
    coalesce((p_datos ->> 'paletizado')::boolean, true), coalesce((p_datos ->> 'carga_lateral')::boolean, true),
    coalesce((p_datos ->> 'carga_trasera')::boolean, false), coalesce((p_datos ->> 'carga_techo')::boolean, false),
    coalesce((p_datos ->> 'requiere_plataforma_elevadora')::boolean, false), coalesce((p_datos ->> 'requiere_nima')::boolean, false),
    coalesce((p_datos ->> 'adr')::boolean, false), 21,
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
      -- Solo sus sitios o un almacén de Dynamo: nunca la agenda de otro cliente.
      select * into l from sitios where sitios.id = v_sitio and not borrado
         and (es_almacen_dynamo or cliente_id = v_cliente);
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
  perform validar_ruta_envio(v_id);
  -- A programado: el disparador del previo pago decide solo crédito o pendiente de pago,
  -- y los de hitos y seguimiento sellan lo suyo (igual que al aceptar una solicitud).
  update envios set estado = 'programado' where envios.id = v_id;
  return query select v_id, v_gx;
end $$;
revoke all on function crear_envio_cliente(jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function crear_envio_cliente(jsonb, jsonb) to authenticated;
grant execute on function crear_envio_cliente(jsonb, jsonb) to service_role;

-- 2) pedir_cambio_envio (igual que 20261110000000, con la llamada sin p_al_pagar).
CREATE OR REPLACE FUNCTION public.pedir_cambio_envio(p_envio uuid, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_detalle text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e envios%rowtype; v_det text := nullif(trim(coalesce(p_detalle, '')), ''); v_libre boolean; v_fechas boolean;
        v_n int; v_hasta date; v_primer date;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if coalesce(e.es_manual, false) then return jsonb_build_object('resultado', 'envio_manual'); end if;
  if e.estado <> 'programado' then return jsonb_build_object('resultado', 'no_modificable', 'estado', e.estado); end if;
  if e.estado_cambio_cliente = 'pendiente' then return jsonb_build_object('resultado', 'ya_pendiente'); end if;
  -- Se mantiene el tipo de fecha que se eligió (y se pagó): fecha fija = un día; ventana =
  -- los mismos días hábiles. Solo se elige el primer día; el último lo pone la base de datos.
  v_n := dias_ventana_carga(e.fecha_carga_desde, e.fecha_carga_hasta);
  if p_desde is not null then
    if not es_dia_habil(p_desde) then return jsonb_build_object('resultado', 'dia_no_habil'); end if;
    v_hasta := sumar_dias_habiles(p_desde, v_n - 1);
    if p_hasta is not null and p_hasta <> v_hasta then
      return jsonb_build_object('resultado', 'ventana_distinta', 'dias', v_n, 'hasta', v_hasta);
    end if;
    -- El corte de SU ventana (cada una tiene su hora en Parámetros; usuario, 2026-11-10).
    v_primer := primera_fecha_carga(v_n = 1, now(), v_n);
    if p_desde < v_primer then return jsonb_build_object('resultado', 'antes_de_lo_posible', 'primera_fecha', v_primer); end if;
    if v_hasta > (now() at time zone 'Europe/Madrid')::date + 183 then return jsonb_build_object('resultado', 'fechas_no_validas'); end if;
  end if;
  v_fechas := p_desde is not null and (p_desde, v_hasta) is distinct from (e.fecha_carga_desde, coalesce(e.fecha_carga_hasta, e.fecha_carga_desde));
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
    update envios set fecha_carga_desde = p_desde, fecha_carga_hasta = v_hasta,
                      cambio_cliente = jsonb_build_object('fecha_desde', p_desde, 'fecha_hasta', v_hasta,
                                                          'antes_desde', e.fecha_carga_desde, 'antes_hasta', e.fecha_carga_hasta),
                      cambio_cliente_en = now(), estado_cambio_cliente = 'aplicado', cambio_cliente_nota = null
     where id = p_envio;
    perform set_config('dynamo.cambio_envio', 'off', true);
    return jsonb_build_object('resultado', 'aplicado');
  end if;
  update envios set cambio_cliente = jsonb_build_object('fecha_desde', case when v_fechas then p_desde end,
                                                        'fecha_hasta', case when v_fechas then v_hasta end,
                                                        'detalle', v_det, 'con_camion', not v_libre),
                    cambio_cliente_en = now(), estado_cambio_cliente = 'pendiente', cambio_cliente_nota = null
   where id = p_envio;
  perform set_config('dynamo.cambio_envio', 'off', true);
  return jsonb_build_object('resultado', 'pendiente');
end $function$;

-- 3) El disparador de la fecha al pagar: mismos cortes, con los días de SU ventana.
CREATE OR REPLACE FUNCTION public.fn_envios_a0_fecha_al_pagar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_fija boolean; v_primer date; v_n int; v_salto int;
begin
  if new.estado <> 'programado' or new.fecha_carga_desde is null or new.operador_id is not null then return new; end if;
  v_fija := coalesce(new.fecha_carga_hasta, new.fecha_carga_desde) <= new.fecha_carga_desde;
  v_n := dias_ventana_carga(new.fecha_carga_desde, new.fecha_carga_hasta);
  -- Al pagar o liberar rigen los MISMOS cortes que al pedir (usuario, 2026-11-10):
  -- la fecha fija con el suyo y cada ventana con el suyo.
  v_primer := primera_fecha_carga(v_fija, now(), v_n);
  if new.fecha_carga_desde >= v_primer then return new; end if;   -- aún da tiempo: no se toca
  select count(*) into v_salto from generate_series(new.fecha_carga_desde + 1, v_primer, interval '1 day') g where es_dia_habil(g::date);
  new.fecha_carga_desde := v_primer;
  new.fecha_carga_hasta := sumar_dias_habiles(v_primer, v_n - 1);
  if new.fecha_entrega_estimada is not null then
    new.fecha_entrega_estimada := greatest(sumar_dias_habiles(new.fecha_entrega_estimada, v_salto), new.fecha_carga_hasta);
  end if;
  perform registrar_hito(new.id, 'fecha_carga_movida', null, null,
    jsonb_build_object('antes_desde', old.fecha_carga_desde, 'antes_hasta', old.fecha_carga_hasta,
                       'desde', new.fecha_carga_desde, 'hasta', new.fecha_carga_hasta,
                       'motivo', case when new.estado_pago_previo = 'exento' then 'Pasado sin pago previo cuando ya no daba tiempo' else 'Pago recibido cuando ya no daba tiempo' end),
    case when es_servidor() then 'servidor' else 'app' end);
  return new;
end $function$;
