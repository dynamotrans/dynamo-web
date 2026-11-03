-- =====================================================================================
-- CREAR UN ENVÍO DE UNA VEZ (pantalla "Nuevo envío" de la plataforma, 2026-11-03)
-- =====================================================================================
-- El envío nace en borrador, se le ponen las paradas y se confirma: al pasar a
-- "programado" saltan las comprobaciones que ya existen (ruta completa, zonas sin
-- servicio, hitos y sellos de hora). Todo dentro de UNA función para que sea una sola
-- transacción: o se crea entero, o no se crea nada (nunca un envío sin paradas).
--
-- Etapa A (solo Dynamo por dentro): la crea el equipo de Dynamo para un cliente y
-- pone el precio a mano (`precio_fijado_a_mano`). El tarifador llega al final del
-- proyecto y entonces el precio lo calculará el servidor, nunca el navegador.
--
-- Va con los permisos de quien llama (no es SECURITY DEFINER): los permisos por fila
-- deciden. Hoy solo Dynamo puede escribir envíos, así que solo Dynamo puede crearlos.
--
-- De paso, el último nombre que no seguía la convención: `lugares.calle` pasa a
-- `direccion`, como en clientes, transportistas y paradas.
-- =====================================================================================

alter table lugares rename column calle to direccion;
comment on column lugares.direccion is 'Calle y número, SOLO eso (el CP y la población van aparte).';


-- -------------------------------------------------------------------------------------
-- crear_envio(envío, paradas)
-- -------------------------------------------------------------------------------------
-- p_envio: objeto JSON con las columnas del envío (cliente_id, fechas, mercancía,
--   importes…). Solo se leen las columnas de la lista; lo demás se ignora.
-- p_paradas: lista JSON en orden de ruta. Cada parada lleva `tipo` ('carga' o
--   'descarga') y, o bien `lugar_id` (un sitio de la agenda: se copia su dirección,
--   congelada), o bien los datos sueltos (nombre_empresa, direccion, codigo_postal,
--   poblacion, provincia, pais_codigo_iso). Con `guardar_en_agenda: true` el sitio
--   suelto se guarda además en la agenda del cliente. `referencia` y `anotaciones`
--   son de la parada.
create or replace function crear_envio(p_envio jsonb, p_paradas jsonb)
returns table (id uuid, referencia_gx text)
language plpgsql set search_path = public as $$
declare
  v_id      uuid;
  v_gx      text;
  v_cliente uuid := (p_envio ->> 'cliente_id')::uuid;
  v_p       jsonb;
  v_orden   smallint := 0;
  v_lugar   uuid;
  l         lugares%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo el equipo de Dynamo puede crear envios por ahora.' using errcode = '42501';
  end if;
  if v_cliente is null then
    raise exception 'Falta el cliente del envio.';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envio necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como maximo 4 puntos en la ruta (2 paradas ademas del origen y el destino).';
  end if;

  insert into envios (
    cliente_id, referencia_cliente, estado,
    fecha_carga_desde, fecha_carga_hasta,
    descripcion_mercancia, toneladas, metros_lineales,
    paletizado, carga_lateral, carga_trasera, carga_superior,
    plataforma_elevadora, nima_requerido, adr,
    importe_cliente, importe_transportista, precio_fijado_a_mano, iva_aplicado,
    discrecion_comercial, anotaciones_cliente
  ) values (
    v_cliente, nullif(trim(p_envio ->> 'referencia_cliente'), ''), 'borrador',
    (p_envio ->> 'fecha_carga_desde')::date, (p_envio ->> 'fecha_carga_hasta')::date,
    nullif(trim(p_envio ->> 'descripcion_mercancia'), ''),
    (p_envio ->> 'toneladas')::numeric, (p_envio ->> 'metros_lineales')::numeric,
    coalesce((p_envio ->> 'paletizado')::boolean, true),
    coalesce((p_envio ->> 'carga_lateral')::boolean, true),
    coalesce((p_envio ->> 'carga_trasera')::boolean, false),
    coalesce((p_envio ->> 'carga_superior')::boolean, false),
    coalesce((p_envio ->> 'plataforma_elevadora')::boolean, false),
    coalesce((p_envio ->> 'nima_requerido')::boolean, false),
    coalesce((p_envio ->> 'adr')::boolean, false),
    (p_envio ->> 'importe_cliente')::numeric, (p_envio ->> 'importe_transportista')::numeric,
    (p_envio ->> 'importe_cliente') is not null,
    coalesce((p_envio ->> 'iva_aplicado')::numeric, 21),
    coalesce((p_envio ->> 'discrecion_comercial')::boolean, false),
    nullif(trim(p_envio ->> 'anotaciones_cliente'), '')
  ) returning envios.id, envios.referencia_gx into v_id, v_gx;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    v_lugar := nullif(v_p ->> 'lugar_id', '')::uuid;

    -- Sitio nuevo que se quiere en la agenda del cliente: se crea primero.
    if v_lugar is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into lugares (cliente_id, nombre_empresa, tipo, direccion, codigo_postal,
                           poblacion, provincia, pais_codigo_iso, horarios, anotaciones)
      values (v_cliente, trim(v_p ->> 'nombre_empresa'),
              coalesce(nullif(v_p ->> 'tipo_lugar', '')::tipo_lugar, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''),
              nullif(trim(v_p ->> 'poblacion'), ''), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'),
              nullif(trim(v_p ->> 'horarios'), ''), nullif(trim(v_p ->> 'anotaciones_sitio'), ''))
      returning lugares.id into v_lugar;
    end if;

    if v_lugar is not null then
      -- Copia CONGELADA de la dirección del sitio: el CMR de dentro de un año tiene que
      -- seguir diciendo a dónde se fue, aunque el sitio se edite después.
      select * into l from lugares where lugares.id = v_lugar;
      if not found then raise exception 'El sitio elegido no existe o no es de este cliente.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, lugar_id, nombre_empresa, direccion,
                                 codigo_postal, poblacion, provincia, pais_codigo_iso, lat, lon,
                                 referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', v_lugar, l.nombre_empresa, l.direccion,
              l.codigo_postal, l.poblacion, l.provincia, l.pais_codigo_iso, l.lat, l.lon,
              nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    else
      insert into envio_paradas (envio_id, orden, tipo, nombre_empresa, direccion,
                                 codigo_postal, poblacion, provincia, pais_codigo_iso,
                                 referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', nullif(trim(v_p ->> 'nombre_empresa'), ''),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''),
              nullif(trim(v_p ->> 'poblacion'), ''), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'),
              nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    end if;
  end loop;

  -- Confirmar: aquí se comprueban la ruta y las zonas, y se sellan los hitos.
  update envios set estado = 'programado' where envios.id = v_id;

  return query select v_id, v_gx;
end $$;

revoke execute on function crear_envio(jsonb, jsonb) from public, anon;
comment on function crear_envio(jsonb, jsonb) is
  'Crea un envio con sus paradas en una sola transaccion y lo deja programado. Etapa A: '
  'solo Dynamo, con el precio puesto a mano. Las paradas pueden venir de la agenda del '
  'cliente (lugar_id, se copia la direccion congelada) o sueltas.';
