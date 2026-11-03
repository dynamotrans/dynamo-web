-- =====================================================================================
-- ORDEN DE CARGA DESDE EL ENLACE PÚBLICO (/carga/<enlace>), sin cuenta
-- =====================================================================================
-- El transportista que acepta una carga desde el enlace (sin usuario en la plataforma)
-- puede abrir su orden de carga en PDF desde la misma página. La llave es la RESERVA
-- aceptada (va en una cookie de esa página, solo la tiene quien aceptó), igual que
-- carga_aceptada_publica(). Lo que devuelve es lo mismo que ve el transportista con
-- cuenta en su panel (datos_orden_transportista): su viaje, sin datos del cliente.
--
-- Para no tener dos copias del contenido de la orden, se saca a una función interna
-- (sin permisos para nadie) y las dos puertas la llaman tras comprobar cada una lo suyo.

create or replace function orden_carga_json(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e envios%rowtype; t transportistas%rowtype; c record;
begin
  select * into e from envios where id = p_envio;
  if e.operador_id is not null or e.estado in ('borrador', 'cancelado') then raise exception 'Este viaje no tiene orden de carga.'; end if;
  select * into t from transportistas where id = e.transportista_id;
  select x.nombre, x.telefono, x.email into c from contactos x where x.transportista_id = t.id
   order by (x.funcion = 'trafico') desc, x.es_principal desc limit 1;
  return jsonb_build_object(
    'envio', jsonb_build_object(
      'id', e.id, 'referencia_gx', e.referencia_gx, 'referencia_cliente', e.referencia_cliente, 'estado', e.estado,
      'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta, 'fecha_carga_real', e.fecha_carga_real,
      'fecha_entrega_estimada', e.fecha_entrega_estimada, 'descripcion_mercancia', e.descripcion_mercancia,
      'toneladas', e.toneladas, 'metros_lineales', e.metros_lineales, 'tipo_carga', e.tipo_carga, 'paletizado', e.paletizado,
      'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera, 'carga_superior', e.carga_superior,
      'plataforma_elevadora', e.plataforma_elevadora, 'nima_requerido', e.nima_requerido, 'adr', e.adr,
      'discrecion_comercial', e.discrecion_comercial, 'importe_transportista', e.importe_transportista,
      'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
      'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono,
      'transportista_nima', e.transportista_nima, 'plazo_pago_transportista', t.plazo_pago_dias, 'es_manual', false),
    'porteador', jsonb_build_object(
      'nombre', coalesce(t.nombre_visible, t.razon_social), 'razon_social', t.razon_social, 'cif', t.cif, 'codigo', t.codigo,
      'direccion', t.direccion, 'codigo_postal', t.codigo_postal, 'poblacion', t.poblacion, 'provincia', t.provincia,
      'pais_codigo_iso', t.pais_codigo_iso, 'telefono', c.telefono, 'email', c.email, 'contacto', c.nombre),
    'paradas', paradas_viaje_json(e.id),
    'pronto_pago', coalesce((select r.pronto_pago from envio_reservas r where r.envio_id = e.id and r.transportista_id = t.id
                              and r.estado = 'aceptada' order by r.cerrada_en desc limit 1), false),
    'parametros', (select jsonb_object_agg(clave, valor) from parametros
                    where clave in ('pronto_pago_pct', 'pronto_pago_minimo', 'pronto_pago_dias', 'plazo_pago_transportista_dias')),
    'dynamo', datos_dynamo()
  );
end $$;
revoke execute on function orden_carga_json(uuid) from public, anon, authenticated;

-- La puerta del panel (con cuenta): la misma comprobación de antes.
create or replace function datos_orden_transportista(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not envio_del_transportista(p_envio) then raise exception 'Ese viaje no es tuyo.' using errcode = '42501'; end if;
  return orden_carga_json(p_envio);
end $$;
revoke execute on function datos_orden_transportista(uuid) from public, anon;
grant execute on function datos_orden_transportista(uuid) to authenticated;

-- La puerta del enlace (sin cuenta): solo con la reserva ACEPTADA y si el viaje sigue
-- siendo de ese transportista (si Dynamo lo reasigna, la orden vieja deja de servir).
create or replace function datos_orden_publica(p_reserva uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r envio_reservas%rowtype;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'aceptada'
     or not exists (select 1 from envios e where e.id = r.envio_id and e.transportista_id = r.transportista_id) then
    raise exception 'Esa orden de carga no es tuya.' using errcode = '42501';
  end if;
  return orden_carga_json(r.envio_id);
end $$;
revoke execute on function datos_orden_publica(uuid) from public;
grant execute on function datos_orden_publica(uuid) to anon, authenticated;

-- ---- El CMR digital desde el mismo enlace ---------------------------------------------
-- Igual que mi_enlace_cmr() del panel: devuelve el enlace vivo de firma del CMR (o crea
-- uno). Con la misma llave que la orden: la reserva aceptada y el viaje aún suyo.
create or replace function enlace_cmr_publico(p_reserva uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare r envio_reservas%rowtype; v_tok uuid; v_estado estado_envio;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'aceptada'
     or not exists (select 1 from envios e where e.id = r.envio_id and e.transportista_id = r.transportista_id) then
    raise exception 'Ese viaje no es tuyo.' using errcode = '42501';
  end if;
  select estado into v_estado from envios where id = r.envio_id;
  if v_estado in ('cancelado', 'borrador') then raise exception 'Este envío no tiene CMR para firmar.'; end if;
  select token into v_tok from cmr_enlaces where envio_id = r.envio_id and not revocado and caduca_en > now();
  if v_tok is null then
    update cmr_enlaces set revocado = true where envio_id = r.envio_id and not revocado;
    insert into cmr_enlaces (envio_id) values (r.envio_id) returning token into v_tok;
  end if;
  return v_tok;
end $$;
revoke execute on function enlace_cmr_publico(uuid) from public;
grant execute on function enlace_cmr_publico(uuid) to anon, authenticated;
