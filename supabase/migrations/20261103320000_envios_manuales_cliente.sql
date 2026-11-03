-- =====================================================================================
-- ENVÍOS MANUALES DEL CLIENTE DESDE SU PANEL (etapa B)
-- =====================================================================================
-- El cliente elige, en Nuevo envío, a uno de SUS operadores en vez de a Dynamo. El envío
-- es suyo y Dynamo no interviene: no hay precio de Dynamo ni transportista de Dynamo, solo
-- (si quiere) el precio que ha acordado con su operador. Nace programado. Él lo mueve de
-- estado y saca la ORDEN DE TRANSPORTE en PDF, sin ninguna mención a Dynamo.

create or replace function crear_envio_manual(p_envio jsonb, p_paradas jsonb)
returns table (id uuid, referencia_gx text)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cliente uuid := cliente_del_usuario();
  v_oper uuid := nullif(p_envio ->> 'operador_id', '')::uuid;
  v_id uuid; v_gx text; v_p jsonb; v_orden smallint := 0; v_lugar uuid; l lugares%rowtype;
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
  if (p_envio ->> 'fecha_carga_desde') is null or (p_envio ->> 'fecha_carga_desde')::date < current_date then
    raise exception 'Elige una fecha de recogida de hoy en adelante.';
  end if;
  if (p_envio ->> 'precio_acordado_operador') is not null and (p_envio ->> 'precio_acordado_operador')::numeric < 0 then
    raise exception 'El precio acordado no es válido.';
  end if;

  insert into envios (cliente_id, operador_id, referencia_cliente, estado,
    fecha_carga_desde, fecha_carga_hasta, descripcion_mercancia, toneladas, metros_lineales,
    paletizado, carga_lateral, carga_trasera, carga_superior, plataforma_elevadora, nima_requerido, adr,
    precio_acordado_operador, discrecion_comercial, anotaciones_cliente)
  values (v_cliente, v_oper, nullif(trim(p_envio ->> 'referencia_cliente'), ''), 'borrador',
    (p_envio ->> 'fecha_carga_desde')::date, (p_envio ->> 'fecha_carga_hasta')::date,
    nullif(trim(p_envio ->> 'descripcion_mercancia'), ''),
    (p_envio ->> 'toneladas')::numeric, (p_envio ->> 'metros_lineales')::numeric,
    coalesce((p_envio ->> 'paletizado')::boolean, true), coalesce((p_envio ->> 'carga_lateral')::boolean, true),
    coalesce((p_envio ->> 'carga_trasera')::boolean, false), coalesce((p_envio ->> 'carga_superior')::boolean, false),
    coalesce((p_envio ->> 'plataforma_elevadora')::boolean, false), coalesce((p_envio ->> 'nima_requerido')::boolean, false),
    coalesce((p_envio ->> 'adr')::boolean, false), (p_envio ->> 'precio_acordado_operador')::numeric,
    coalesce((p_envio ->> 'discrecion_comercial')::boolean, false), left(nullif(trim(p_envio ->> 'anotaciones_cliente'), ''), 1000))
  returning envios.id, envios.referencia_gx into v_id, v_gx;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    if (v_p ->> 'tipo') not in ('carga', 'descarga') then raise exception 'Tipo de parada no válido.'; end if;
    v_lugar := nullif(v_p ->> 'lugar_id', '')::uuid;
    if v_lugar is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into lugares (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso)
      values (v_cliente, trim(v_p ->> 'nombre_empresa'), coalesce(nullif(v_p ->> 'tipo_lugar', '')::tipo_lugar, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''), nullif(trim(v_p ->> 'poblacion'), ''),
              nullif(trim(v_p ->> 'provincia'), ''), coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'))
      returning lugares.id into v_lugar;
      if regexp_replace(coalesce(v_p ->> 'contacto_telefono', ''), '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$' then
        insert into contactos (lugar_id, nombre, telefono, es_principal)
        values (v_lugar, nullif(trim(v_p ->> 'contacto_nombre'), ''), regexp_replace(v_p ->> 'contacto_telefono', '[^0-9+]', '', 'g'), true);
      end if;
    end if;
    if v_lugar is not null then
      select * into l from lugares where lugares.id = v_lugar and not borrado and (es_almacen_dynamo or cliente_id = v_cliente);
      if not found then raise exception 'El sitio elegido no existe o no es tuyo.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, lugar_id, nombre_empresa, direccion, codigo_postal, poblacion,
                                 provincia, pais_codigo_iso, lat, lon, referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', v_lugar, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion,
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
end $$;
revoke execute on function crear_envio_manual(jsonb, jsonb) from public, anon;
grant execute on function crear_envio_manual(jsonb, jsonb) to authenticated;


-- El cliente lleva el estado de SU envío manual (lo hace su transportista, no Dynamo).
create or replace function marcar_mi_envio_manual(p_envio uuid, p_estado text, p_precio numeric default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_actual estado_envio; v_manual boolean;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select estado, operador_id is not null into v_actual, v_manual from envios where id = p_envio for update;
  if not v_manual then raise exception 'Este envío lo gestiona Dynamo.' using errcode = '42501'; end if;
  if v_actual = 'cancelado' then raise exception 'El envío está cancelado.'; end if;
  if p_estado not in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado') then raise exception 'Estado no válido.'; end if;
  update envios set estado = p_estado::estado_envio,
                    fecha_carga_real = case when p_estado in ('en_ruta', 'entregado') then coalesce(fecha_carga_real, current_date)
                                            when p_estado = 'programado' then null else fecha_carga_real end,
                    precio_acordado_operador = coalesce(p_precio, precio_acordado_operador)
   where id = p_envio;
end $$;
revoke execute on function marcar_mi_envio_manual(uuid, text, numeric) from public, anon;
grant execute on function marcar_mi_envio_manual(uuid, text, numeric) to authenticated;


-- Lo que lleva la orden de transporte de un envío manual: el cliente (que la emite), su
-- operador y las paradas. Sin nada de Dynamo.
create or replace function datos_orden_manual(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e envios%rowtype; c clientes%rowtype; o operadores%rowtype; k record;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio;
  if e.operador_id is null then raise exception 'Este envío lo gestiona Dynamo.' using errcode = '42501'; end if;
  select * into c from clientes where id = e.cliente_id;
  select * into o from operadores where id = e.operador_id;
  select x.nombre, x.telefono, x.email into k from contactos x where x.cliente_id = c.id
   order by (x.funcion = 'trafico') desc, x.es_principal desc limit 1;
  return jsonb_build_object(
    'envio', jsonb_build_object(
      'id', e.id, 'referencia_gx', e.referencia_gx, 'referencia_cliente', e.referencia_cliente, 'estado', e.estado,
      'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta, 'fecha_carga_real', e.fecha_carga_real,
      'fecha_entrega_estimada', e.fecha_entrega_estimada, 'descripcion_mercancia', e.descripcion_mercancia,
      'toneladas', e.toneladas, 'metros_lineales', e.metros_lineales, 'tipo_carga', e.tipo_carga, 'paletizado', e.paletizado,
      'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera, 'carga_superior', e.carga_superior,
      'plataforma_elevadora', e.plataforma_elevadora, 'nima_requerido', e.nima_requerido, 'adr', e.adr,
      'discrecion_comercial', e.discrecion_comercial, 'precio_acordado_operador', e.precio_acordado_operador,
      'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
      'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono, 'es_manual', true),
    'cliente', jsonb_build_object('nombre', coalesce(c.nombre_visible, c.razon_social), 'razon_social', c.razon_social, 'cif', c.cif,
      'direccion', c.direccion, 'codigo_postal', c.codigo_postal, 'poblacion', c.poblacion, 'provincia', c.provincia,
      'pais_codigo_iso', c.pais_codigo_iso, 'telefono', k.telefono, 'email', k.email, 'contacto', k.nombre),
    'porteador', jsonb_build_object('nombre', o.razon_social, 'razon_social', o.razon_social, 'cif', o.cif,
      'telefono', o.telefono, 'email', o.email, 'contacto', o.persona_contacto),
    'paradas', paradas_viaje_json(e.id)
  );
end $$;
revoke execute on function datos_orden_manual(uuid) from public, anon;
grant execute on function datos_orden_manual(uuid) to authenticated;
