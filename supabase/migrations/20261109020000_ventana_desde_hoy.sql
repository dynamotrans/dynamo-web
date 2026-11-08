-- =====================================================================================
-- LA VENTANA PUEDE EMPEZAR HOY MISMO (usuario, 2026-11-08)
-- =====================================================================================
-- Decisión del usuario: con VENTANA de carga (completo 1 a 3 días · grupaje 1 a 4), se
-- puede elegir el MISMO DÍA como primer día si se pide antes del corte (14:00, hora de
-- Madrid) y hoy es día hábil; pasado el corte, el siguiente día hábil. Cuentan solo los
-- días hábiles: fuera sábados, domingos y festivos nacionales. La FECHA FIJA (y la
-- ventana corta de grupaje) siguen como estaban: corte a las 12:00, primer día el
-- siguiente hábil (o el otro, pasado el corte).
--   1. primera_fecha_carga(): la rama de ventana devuelve hoy antes del corte (si hoy es
--      hábil); si no, el siguiente día hábil. Vale al pedir y al pagar (cada uno con su
--      hora de corte de Parámetros). La web (lib/fechasCarga.ts) hace lo mismo.
--   2. crear_envio_cliente(): el tope duro de la fecha pasa de «a partir de mañana» a
--      «de hoy en adelante» para la ventana; con fecha fija sigue siendo desde mañana.
--      (crear_envio y crear_envio_manual ya aceptaban «de hoy en adelante».)
-- =====================================================================================

create or replace function public.primera_fecha_carga(p_fija boolean, p_instante timestamp with time zone default now(), p_al_pagar boolean default false)
 returns date language plpgsql stable security definer set search_path to 'public'
as $function$
declare l timestamp := p_instante at time zone 'Europe/Madrid';
        corte numeric := case
          when p_al_pagar and p_fija then parametro_num('primer_dia_corte_pago_fija_hora', 12)
          when p_al_pagar then parametro_num('primer_dia_corte_pago_ventana_hora', 14)
          when p_fija then parametro_num('primer_dia_corte_fija_hora', 12)
          else parametro_num('primer_dia_corte_ventana_hora', 14) end;
        antes boolean := extract(hour from l) + extract(minute from l) / 60.0 < corte;
begin
  if not p_fija then
    -- VENTANA (usuario, 2026-11-08): puede empezar HOY MISMO si es antes del corte y hoy
    -- es día hábil (los sábados, domingos y festivos nacionales no cuentan); si no, el
    -- siguiente día hábil.
    if antes and es_dia_habil(l::date) then return l::date; end if;
    return sumar_dias_habiles(l::date, 1);
  end if;
  return sumar_dias_habiles(l::date, case when antes then 1 else 2 end);
end $function$;
comment on function public.primera_fecha_carga(boolean, timestamp with time zone, boolean) is '[Calendario y festivos] Primer día en que se puede cargar si se pide (o se paga) en un instante, contando solo días hábiles (sin sábados, domingos ni festivos nacionales). Ventana: hoy mismo antes de la hora de corte si hoy es hábil; si no, el siguiente día hábil. Fecha fija: el siguiente día hábil antes del corte; después, el otro. Horas de corte en Parámetros, distintas al pedir (primer_dia_corte_fija_hora, primer_dia_corte_ventana_hora) y al pagar o liberar el envío (primer_dia_corte_pago_fija_hora, primer_dia_corte_pago_ventana_hora). Quién: cualquier usuario con sesión. Argumentos: p_fija: true = fecha fija, false = ventana · p_instante: cuándo (por defecto, ahora) · p_al_pagar: true = horas de corte al pagar (por defecto, al pedir).';

-- ---- crear_envio_cliente: la ventana puede empezar hoy; la fecha fija, desde mañana --------
create or replace function crear_envio_cliente(p_datos jsonb, p_paradas jsonb)
returns table (id uuid, referencia_gx text)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cliente uuid := cliente_del_usuario();
  v_importe numeric := round((p_datos ->> 'importe_cliente')::numeric, 2);
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_id uuid; v_gx text; v_p jsonb; v_orden smallint := 0; v_sitio uuid; l sitios%rowtype;
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
  -- Tope duro de la fecha (el corte horario fino lo aplican la pantalla y
  -- primera_fecha_carga): la VENTANA puede empezar hoy; la FECHA FIJA, desde mañana.
  if (p_datos ->> 'fecha_carga_desde') is null or (p_datos ->> 'fecha_carga_desde')::date < v_hoy then
    raise exception 'Elige una fecha de recogida de hoy en adelante.';
  end if;
  if coalesce((p_datos ->> 'fecha_carga_hasta')::date, (p_datos ->> 'fecha_carga_desde')::date) <= (p_datos ->> 'fecha_carga_desde')::date
     and (p_datos ->> 'fecha_carga_desde')::date = v_hoy then
    raise exception 'Con fecha fija, la recogida es a partir de mañana.';
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
comment on function public.crear_envio_cliente(jsonb, jsonb) is '[Envíos] El cliente crea su envío YA CON PRECIO (el del tarifador automático; hasta que el tarifador viva en el servidor, el importe llega de la pantalla y se acota a 0–100.000). Nace programado: el previo pago decide solo si va a crédito o pendiente de pago. Fecha de recogida: con ventana, de hoy en adelante (el corte de las 14:00 lo aplica la pantalla); con fecha fija, a partir de mañana. 2 a 4 paradas; valida la ruta. Devuelve id y referencia GX. Quién: cliente (usuario activo de un cliente). Argumentos: p_datos: jsonb {importe_cliente (obligatorio), fecha_carga_desde, fecha_carga_hasta, referencia_cliente, descripcion_mercancia, toneladas, metros_lineales, paletizado, carga_*, requiere_plataforma_elevadora, requiere_nima, adr, discrecion_comercial, anotaciones_cliente} · p_paradas: array de 2 a 4 {tipo, sitio_id o dirección, guardar_en_agenda, contacto_nombre, contacto_telefono, referencia, anotaciones}.';
