-- =====================================================================================
-- ENVÍO MANUAL TAMBIÉN DESDE «VER COMO» UN CLIENTE (usuario 2026-11-08)
-- =====================================================================================
-- En Nuevo envío, el combo de operador (Dynamo por defecto, o un transportista propio
-- del cliente) sale ahora también en la vista «Ver como» un cliente. Para que al elegir
-- un operador propio el gestor pueda REGISTRAR ese envío manual en nombre del cliente,
-- crear_envio_manual gana p_cliente opcional: solo lo atiende un gestor de Dynamo
-- (es_equipo_dynamo: admin o empleado, los roles de solo lectura no escriben); a un cliente se le ignora y sigue
-- creando únicamente lo suyo, con sus propios operadores. El resto del cuerpo es el
-- vigente (el de «hoy es el día de Madrid»), sin cambios.
--
-- Añadir un parámetro con valor por defecto crea OTRA función con el mismo nombre, así
-- que primero se quita la firma vieja.
-- =====================================================================================

drop function if exists crear_envio_manual(jsonb, jsonb);
create or replace function public.crear_envio_manual(p_datos jsonb, p_paradas jsonb, p_cliente uuid default null)
 RETURNS TABLE(id uuid, referencia_gx text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- Con «Ver como» un cliente, un GESTOR de Dynamo (es_equipo_dynamo: admin o empleado;
  -- los roles de lectura no) registra el envío manual PARA ese cliente; a un cliente se
  -- le ignora el parámetro.
  v_cliente uuid := coalesce(case when es_equipo_dynamo() then p_cliente end, cliente_del_usuario());
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
revoke all on function public.crear_envio_manual(jsonb, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.crear_envio_manual(jsonb, jsonb, uuid) to authenticated;
grant execute on function public.crear_envio_manual(jsonb, jsonb, uuid) to service_role;
comment on function public.crear_envio_manual(jsonb, jsonb, uuid) is '[Envíos] Crea un envío «manual»: lo mueve un operador de transporte propio del cliente (no lo gestiona Dynamo), para tener sus papeles y seguimiento en la plataforma. Fecha de recogida de hoy en adelante. Queda programado. Devuelve id y referencia GX. Quién: un cliente (siempre el suyo, p_cliente se le ignora) o un gestor de Dynamo con p_cliente («Ver como» ese cliente). Argumentos: p_datos: jsonb {operador_id (uno de los operadores del cliente, obligatorio), fecha_carga_desde, fecha_carga_hasta, referencia_cliente, mercancía, toneladas, metros_lineales, opciones de carga, precio_acordado_operador, discrecion_comercial, anotaciones_cliente (máx. 1000)} · p_paradas: array de 2 a 4 {tipo, sitio_id o dirección, guardar_en_agenda, contacto_nombre, contacto_telefono, referencia} · p_cliente (solo gestores de Dynamo).';
