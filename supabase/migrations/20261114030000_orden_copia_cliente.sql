-- =====================================================================================
-- LA ORDEN DE CARGA EN COPIA CLIENTE + ECONOMÍA SOLO CON SU CLAVE (usuario, 2026-11-14)
-- =====================================================================================
-- (1) La pestaña «Para el cliente» del diálogo de compartir mandaba solo texto con el
-- enlace de firma del e-CMR: el cliente no tenía PDF propio. Ahora la orden sale
-- también en COPIA CLIENTE: el mismo documento pero con SU precio (importe_cliente +
-- IVA) y SIN los datos ni el precio del transportista (solo matrículas y conductor).
-- (2) De paso se tapa un agujero que ya existía: datos_orden_por_cmr (anon) devolvía
-- el JSON completo — con importe_transportista y el propio transportista_id, que es la
-- clave de la copia económica — a CUALQUIERA con el token del e-CMR (que también
-- tienen los sitios que firman y el cliente). Ahora recibe la clave y devuelve SOLO la
-- economía de esa clave: con la del transportista, su importe; con la del cliente, el
-- suyo con IVA y el bloque del cliente; sin clave o con una ajena, ningún precio y
-- ningún id. Las claves solo viajan en el enlace que Dynamo manda a cada destinatario.

-- ---- 1. orden_carga_json: bloque del cliente + importe_cliente + iva_pct -------------
-- (Sigue siendo interna: revocada a anon/authenticated; el recorte lo hace la 2.)
create or replace function orden_carga_json(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e envios%rowtype; t transportistas%rowtype; cli clientes%rowtype; c record;
begin
  select * into e from envios where id = p_envio;
  if e.operador_id is not null or e.estado in ('borrador', 'cancelado') then raise exception 'Este envío no tiene orden de carga.'; end if;
  select * into t from transportistas where id = e.transportista_id;
  select * into cli from clientes where id = e.cliente_id;
  select x.nombre, x.telefono, x.email into c from contactos x where x.transportista_id = t.id
   order by (x.funcion = 'trafico') desc, x.es_principal desc limit 1;
  return jsonb_build_object(
    'envio', jsonb_build_object(
      'id', e.id, 'referencia_gx', e.referencia_gx, 'referencia_cliente', e.referencia_cliente, 'estado', e.estado,
      'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta, 'fecha_carga_real', e.fecha_carga_real,
      'fecha_carga_prevista', e.fecha_carga_prevista,
      'fecha_entrega_estimada', e.fecha_entrega_estimada, 'descripcion_mercancia', e.descripcion_mercancia,
      'toneladas', e.toneladas, 'metros_lineales', e.metros_lineales, 'tipo_carga', e.tipo_carga, 'paletizado', e.paletizado,
      'num_bultos', e.num_bultos, 'embalaje', e.embalaje, 'volumen_m3', e.volumen_m3,
      'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera, 'carga_techo', e.carga_techo,
      'requiere_plataforma_elevadora', e.requiere_plataforma_elevadora, 'requiere_nima', e.requiere_nima, 'adr', e.adr,
      'discrecion_comercial', e.discrecion_comercial, 'importe_transportista', e.importe_transportista,
      'importe_cliente', e.importe_cliente, 'iva_pct', e.iva_pct,
      'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
      'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono,
      'transportista_nima', e.transportista_nima, 'plazo_pago_transportista', t.plazo_pago_dias, 'es_manual', false),
    'porteador', jsonb_build_object(
      'nombre', coalesce(t.nombre_visible, t.razon_social), 'razon_social', t.razon_social, 'cif', t.cif, 'codigo', t.codigo,
      'direccion', t.direccion, 'codigo_postal', t.codigo_postal, 'poblacion', t.poblacion, 'provincia', t.provincia,
      'pais_codigo_iso', t.pais_codigo_iso, 'telefono', c.telefono, 'email', c.email, 'contacto', c.nombre),
    'cliente', jsonb_build_object(
      'nombre', coalesce(cli.nombre_visible, cli.razon_social), 'razon_social', cli.razon_social, 'cif', cli.cif,
      'direccion', cli.direccion, 'codigo_postal', cli.codigo_postal, 'poblacion', cli.poblacion,
      'provincia', cli.provincia, 'pais_codigo_iso', cli.pais_codigo_iso),
    'paradas', paradas_viaje_json(e.id),
    'pronto_pago', coalesce((select r.pronto_pago from envio_reservas r where r.envio_id = e.id and r.transportista_id = t.id
                              and r.estado = 'aceptada' order by r.cerrada_en desc limit 1), false),
    'parametros', (select jsonb_object_agg(clave, valor) from parametros
                    where clave in ('pronto_pago_pct', 'pronto_pago_minimo', 'pronto_pago_dias', 'plazo_pago_transportista_dias')),
    'dynamo', datos_dynamo()
  );
end $$;
revoke execute on function orden_carga_json(uuid) from public, anon, authenticated;
comment on function public.orden_carga_json(uuid) is '[Envíos] Devuelve en JSON todo lo que necesita el PDF de la orden de carga de un envío de Dynamo: envío (con el día de carga elegido, fecha_carga_prevista, y los dos importes: importe_transportista para la copia completa e importe_cliente con iva_pct para la copia cliente), porteador con su contacto de tráfico, el bloque del cliente ordenante (para la copia cliente), paradas, pronto pago aceptado, parámetros de pago y los datos fijos de Dynamo. Rechaza envíos manuales, borradores y cancelados. Quién: funciones internas (datos_orden_por_cmr, que recorta la economía según la clave, y la descarga del panel). Argumentos: p_envio: envios.id.';

-- ---- 2. El recorte común: fuera la economía del cliente --------------------------------
-- Lo usan datos_orden_por_cmr (sin la clave del cliente) y las dos órdenes del
-- transportista (su panel y el enlace de la oferta), que reutilizan orden_carga_json.
create or replace function orden_sin_economia_cliente(p_json jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_set(p_json, '{envio}', (p_json->'envio') - 'importe_cliente' - 'iva_pct') - 'cliente'
$$;
revoke execute on function orden_sin_economia_cliente(jsonb) from public, anon, authenticated;
comment on function public.orden_sin_economia_cliente(jsonb) is '[Gestión interna] Quita del JSON de orden_carga_json la economía del cliente (envio.importe_cliente, envio.iva_pct y el bloque cliente), para las salidas que ve el transportista o quien no acredita la clave del cliente. Quién: funciones internas. Argumentos: p_json: el JSON de orden_carga_json.';

-- ---- 3. datos_orden_por_cmr: la clave decide qué economía sale -----------------------
-- Cambia la firma (se añade p_clave con valor por defecto): fuera la de 1 argumento
-- para no dejar una sobrecarga duplicada.
drop function if exists public.datos_orden_por_cmr(uuid);
create function public.datos_orden_por_cmr(p_token uuid, p_clave uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v cmr_enlaces%rowtype; e envios%rowtype; j jsonb; v_rol text;
begin
  select * into v from cmr_enlaces where token = p_token and not revocado and caduca_en > now();
  if not found then
    raise exception 'Este enlace no es válido: ha caducado o se ha retirado.' using errcode = '42501';
  end if;
  select * into e from envios where id = v.envio_id;
  if not found or e.estado = 'cancelado' then
    raise exception 'Este envío está cancelado: ya no hace falta su orden de carga.' using errcode = '42501';
  end if;
  if e.operador_id is not null then
    raise exception 'Los envíos manuales no tienen orden de carga de Dynamo.' using errcode = '42501';
  end if;
  if e.transportista_id is null then
    raise exception 'Este envío aún no tiene transportista asignado.' using errcode = '42501';
  end if;
  v_rol := case when p_clave is not null and p_clave = e.transportista_id then 'transportista'
                when p_clave is not null and p_clave = e.cliente_id then 'cliente' end;
  j := orden_carga_json(v.envio_id);
  -- El precio del transportista SOLO con su clave; el del cliente (y su bloque) SOLO
  -- con la suya. Sin clave (o con una ajena) no sale ninguna economía ni ningún id.
  if v_rol is distinct from 'transportista' then
    j := jsonb_set(j, '{envio}', (j->'envio') - 'importe_transportista');
  end if;
  if v_rol is distinct from 'cliente' then
    j := orden_sin_economia_cliente(j);
  else
    -- Con la clave del cliente tampoco salen los datos del transportista (criterio de
    -- la plataforma: el cliente solo ve matrículas y conductor) ni sus condiciones.
    j := jsonb_set(j, '{envio}', (j->'envio') - 'plazo_pago_transportista' - 'transportista_nima')
         - 'porteador' - 'pronto_pago' - 'parametros';
  end if;
  return j || jsonb_build_object('clave_rol', v_rol);
end $$;
revoke execute on function public.datos_orden_por_cmr(uuid, uuid) from public;
grant execute on function public.datos_orden_por_cmr(uuid, uuid) to anon, authenticated;
comment on function public.datos_orden_por_cmr(uuid, uuid) is '[Envíos] Devuelve el JSON de la orden de carga de un envío (orden_carga_json recortado según la clave, más clave_rol) a partir del enlace público de su e-CMR, para la descarga /cmr/<token>/orden que Dynamo comparte. Con la clave del transportista (su id) salen su importe y clave_rol transportista; con la del cliente (su id), importe_cliente con iva_pct, el bloque del cliente y clave_rol cliente (y sin el porteador ni sus condiciones de pago: el cliente solo ve matrículas y conductor); sin clave o con una ajena no sale ninguna economía ni ningún id (antes devolvía importe_transportista y transportista_id a cualquiera con el token). Cada clave solo viaja en el enlace que Dynamo manda a su destinatario. Rechaza enlaces revocados o caducados, envíos cancelados o manuales y envíos sin transportista. Quién: cualquiera con el enlace (anon). Argumentos: p_token: cmr_enlaces.token · p_clave: transportistas.id o clientes.id, opcional.';

-- ---- 4. Las órdenes del transportista no llevan la economía del cliente ---------------
-- Devuelven orden_carga_json tal cual; con los campos nuevos filtrarían el precio del
-- cliente al transportista (lo cazan los guardianes 74 y 81 de la suite).
create or replace function public.datos_orden_transportista(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not envio_del_transportista(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  return orden_sin_economia_cliente(orden_carga_json(p_envio));
end $$;
comment on function public.datos_orden_transportista(p_envio uuid) is '[Ofertas y transportistas] Datos completos de la orden de carga de un viaje, para el transportista asignado (desde su panel), sin la economía del cliente (su importe, su IVA y su bloque se recortan). Quién: transportista del envío. Argumentos: p_envio: envios.id.';

create or replace function public.datos_orden_publica(p_reserva uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r envio_reservas%rowtype;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'aceptada'
     or not exists (select 1 from envios e where e.id = r.envio_id and e.transportista_id = r.transportista_id) then
    raise exception 'Esa orden de carga no es tuya.' using errcode = '42501';
  end if;
  if not enlace_carga_vigente(r.envio_id) then
    raise exception 'Este envío ya ha terminado: la orden de carga ya no está disponible en este enlace.' using errcode = '42501';
  end if;
  return orden_sin_economia_cliente(orden_carga_json(r.envio_id));
end $$;
comment on function public.datos_orden_publica(p_reserva uuid) is '[Ofertas y transportistas] Enlace público de una carga aceptada: datos completos de la orden de carga para el transportista, sin la economía del cliente (su importe, su IVA y su bloque se recortan). Solo si la reserva está aceptada y el envío sigue asignado a ese transportista. Quién: público con reserva aceptada. Argumentos: p_reserva: envio_reservas.id.';
