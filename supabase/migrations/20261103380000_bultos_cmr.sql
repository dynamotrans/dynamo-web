-- =====================================================================================
-- BULTOS, EMBALAJE Y VOLUMEN (casillas 7, 8 y 12 del CMR)
-- =====================================================================================
-- El CMR pide el número de bultos (7), la clase de embalaje (8) y el volumen (12). Hasta
-- ahora el envío no los guardaba y esas casillas salían con «—». Son opcionales: los
-- rellena Dynamo o el cliente (que es quien sabe lo que carga) desde la ficha del envío.
-- El cliente, solo antes de que empiece la carga y mientras nadie haya firmado el CMR
-- (lo firmado no se cambia). Dynamo, siempre que el envío no esté cancelado.

alter table envios
  add column numero_bultos integer      check (numero_bultos is null or numero_bultos between 1 and 99999),
  add column embalaje      text         check (embalaje is null or length(embalaje) between 1 and 60),
  add column volumen_m3    numeric(7,2) check (volumen_m3 is null or (volumen_m3 > 0 and volumen_m3 <= 500));

comment on column envios.numero_bultos is 'Casilla 7 del CMR: número de bultos (palets, cajas…).';
comment on column envios.embalaje      is 'Casilla 8 del CMR: clase de embalaje (p. ej. «Palet europeo», «Cajas», «Big bag»).';
comment on column envios.volumen_m3    is 'Casilla 12 del CMR: volumen en m³.';

-- Lectura (para la ficha del cliente, que lee sus envíos con mis_envios()).
create or replace function datos_cmr_envio(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e envios%rowtype;
begin
  if not (es_admin() or envio_del_cliente(p_envio) or envio_del_transportista(p_envio)) then
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  select * into e from envios where id = p_envio;
  return jsonb_build_object('numero_bultos', e.numero_bultos, 'embalaje', e.embalaje, 'volumen_m3', e.volumen_m3,
    'firmado', exists (select 1 from firmas_cmr f where f.envio_id = p_envio));
end $$;
revoke execute on function datos_cmr_envio(uuid) from public, anon;
grant execute on function datos_cmr_envio(uuid) to authenticated;

create or replace function poner_datos_cmr(p_envio uuid, p_bultos integer, p_embalaje text, p_volumen numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado estado_envio;
begin
  select estado into v_estado from envios where id = p_envio;
  if not found then raise exception 'Ese envío no existe.'; end if;
  if es_admin() then
    if v_estado = 'cancelado' then raise exception 'El envío está cancelado.'; end if;
  elsif envio_del_cliente(p_envio) then
    if v_estado not in ('borrador', 'programado', 'hacia_la_carga') then
      raise exception 'La carga ya ha empezado: para cambiar estos datos, llama a Dynamo.';
    end if;
    if exists (select 1 from firmas_cmr f where f.envio_id = p_envio) then
      raise exception 'El CMR ya tiene firmas: estos datos ya no se cambian.';
    end if;
  else
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  update envios set numero_bultos = p_bultos, embalaje = nullif(trim(p_embalaje), ''), volumen_m3 = p_volumen
   where id = p_envio;
end $$;
revoke execute on function poner_datos_cmr(uuid, integer, text, numeric) from public, anon;
grant execute on function poner_datos_cmr(uuid, integer, text, numeric) to authenticated;

-- La orden de carga del transportista también los lleva (misma función de 370000, con
-- tres datos más).
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
      'numero_bultos', e.numero_bultos, 'embalaje', e.embalaje, 'volumen_m3', e.volumen_m3,
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
