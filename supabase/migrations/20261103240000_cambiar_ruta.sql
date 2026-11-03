-- =====================================================================================
-- CAMBIAR LA RUTA DE UN ENVÍO YA CREADO (ficha del envío → «Cambiar ruta»)
-- =====================================================================================
-- Hasta ahora, para cambiar un sitio había que cancelar y crear otro envío. Ahora Dynamo
-- puede reescribir la ruta entera de una vez: las paradas que se mantienen (por su id)
-- conservan su historia (PIN, referencia, anotaciones); las que se quitan se borran; las
-- nuevas se crean con la dirección CONGELADA del sitio (como en crear_envio).
--
-- Solo antes de cargar (borrador, programado, hacia la carga) y si nadie ha firmado aún
-- el CMR: una firma se hizo sobre una ruta concreta y no se puede dejar colgando.
-- Queda el hito 'ruta_cambiada' con la ruta de antes y la de después (regla 12), además
-- de la auditoría de cada parada.

alter type tipo_hito add value if not exists 'ruta_cambiada';

create or replace function cambiar_ruta_envio(p_envio uuid, p_paradas jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  e        envios%rowtype;
  v_p      jsonb;
  v_orden  smallint := 0;
  v_id     uuid;
  v_lugar  uuid;
  v_antes  jsonb;
  v_quedan uuid[] := '{}';
  l        lugares%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo el equipo de Dynamo puede cambiar la ruta.' using errcode = '42501';
  end if;
  select * into e from envios where id = p_envio for update;
  if not found then raise exception 'Ese envío no existe.'; end if;
  if e.estado not in ('borrador', 'programado', 'hacia_la_carga') then
    raise exception 'La ruta solo se puede cambiar antes de cargar (el envío está %).', replace(e.estado::text, '_', ' ');
  end if;
  if exists (select 1 from firmas_cmr where envio_id = p_envio) then
    raise exception 'Ya hay firmas en el CMR de este envío: la ruta no se puede cambiar.';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envío necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como máximo 4 puntos en la ruta (2 paradas además del origen y el destino).';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'empresa', nombre_empresa, 'poblacion', poblacion, 'codigo_postal', codigo_postal) order by orden), '[]')
    into v_antes from envio_paradas where envio_id = p_envio;

  -- Las que se mantienen (deben ser de ESTE envío).
  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_id := nullif(v_p ->> 'id', '')::uuid;
    if v_id is not null then
      if not exists (select 1 from envio_paradas where id = v_id and envio_id = p_envio) then
        raise exception 'Una de las paradas no es de este envío.';
      end if;
      v_quedan := v_quedan || v_id;
    end if;
  end loop;

  set constraints all deferred;
  delete from envio_paradas where envio_id = p_envio and not (id = any(v_quedan));
  -- Primero se apartan las que quedan (orden alto), para que las nuevas no choquen.
  update envio_paradas set orden = orden + 100 where envio_id = p_envio;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    v_id := nullif(v_p ->> 'id', '')::uuid;
    if v_id is not null then
      update envio_paradas set orden = v_orden,
             referencia = case when v_p ? 'referencia' then nullif(trim(v_p ->> 'referencia'), '') else referencia end,
             anotaciones = case when v_p ? 'anotaciones' then nullif(trim(v_p ->> 'anotaciones'), '') else anotaciones end
       where id = v_id;
      continue;
    end if;
    if (v_p ->> 'tipo') not in ('carga', 'descarga') then raise exception 'Tipo de parada no válido.'; end if;
    v_lugar := nullif(v_p ->> 'lugar_id', '')::uuid;
    if v_lugar is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into lugares (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, horarios)
      values (e.cliente_id, trim(v_p ->> 'nombre_empresa'), coalesce(nullif(v_p ->> 'tipo_lugar', '')::tipo_lugar, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''), nullif(trim(v_p ->> 'poblacion'), ''),
              nullif(trim(v_p ->> 'provincia'), ''), coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'), nullif(trim(v_p ->> 'horarios'), ''))
      returning id into v_lugar;
    end if;
    if v_lugar is not null then
      select * into l from lugares where id = v_lugar and not borrado
         and (es_almacen_dynamo or cliente_id = e.cliente_id);
      if not found then raise exception 'El sitio elegido no existe o no es de este cliente.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, lugar_id, nombre_empresa, direccion, codigo_postal, poblacion,
                                 provincia, pais_codigo_iso, lat, lon, referencia, anotaciones)
      values (p_envio, v_orden, v_p ->> 'tipo', v_lugar, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion,
              l.provincia, l.pais_codigo_iso, l.lat, l.lon, nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    else
      if nullif(trim(v_p ->> 'nombre_empresa'), '') is null or nullif(trim(v_p ->> 'poblacion'), '') is null then
        raise exception 'Al sitio nuevo le faltan la empresa o la población.';
      end if;
      insert into envio_paradas (envio_id, orden, tipo, nombre_empresa, direccion, codigo_postal, poblacion, provincia,
                                 pais_codigo_iso, referencia, anotaciones)
      values (p_envio, v_orden, v_p ->> 'tipo', trim(v_p ->> 'nombre_empresa'), nullif(trim(v_p ->> 'direccion'), ''),
              nullif(trim(v_p ->> 'codigo_postal'), ''), trim(v_p ->> 'poblacion'), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'), nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    end if;
  end loop;

  if e.estado <> 'borrador' then perform validar_ruta_envio(p_envio); end if;
  perform registrar_hito(p_envio, 'ruta_cambiada', null, null, jsonb_build_object('antes', v_antes,
    'despues', (select jsonb_agg(jsonb_build_object('tipo', tipo, 'empresa', nombre_empresa, 'poblacion', poblacion, 'codigo_postal', codigo_postal) order by orden)
                  from envio_paradas where envio_id = p_envio)));
end $$;
revoke execute on function cambiar_ruta_envio(uuid, jsonb) from public, anon;
grant execute on function cambiar_ruta_envio(uuid, jsonb) to authenticated;
comment on function cambiar_ruta_envio(uuid, jsonb) is
  'Reescribe la ruta de un envío antes de cargar: mantiene las paradas por id, borra las que '
  'faltan y crea las nuevas (dirección congelada). Solo Dynamo; sin firmas de CMR.';
