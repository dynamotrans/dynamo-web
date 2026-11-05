-- =====================================================================================
-- LA LLAVE DEL ENLACE DE LA CARGA CADUCA AL TERMINAR EL VIAJE (usuario, 2026-11-05)
-- La reserva (el código del enlace público con el que el transportista acepta la carga)
-- hace de llave. Hasta ahora:
--   · completar_carga_publica (matrículas y conductor) ya solo funcionaba antes de cargar;
--   · liberar_reserva ya no funcionaba con la carga aceptada.
-- Ahora, además, con el envío ENTREGADO o CANCELADO la llave deja de valer del todo: la
-- página de la carga no enseña los datos (ni el conductor), la orden de carga no se
-- descarga y no da el enlace del CMR. Durante la carga y el viaje sigue sirviendo para
-- LEER la orden (dirección y contacto de la descarga) y abrir el CMR: el conductor los
-- necesita hasta descargar.
-- =====================================================================================

create or replace function carga_aceptada_publica(p_reserva uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; e record;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found then return jsonb_build_object('resultado', 'reserva_no_existe'); end if;
  if r.estado = 'pendiente_revision' then
    return jsonb_build_object('resultado', 'pendiente_revision', 'precio_propuesto', r.precio_propuesto);
  end if;
  if r.estado = 'viva' and r.hasta > now() then
    return jsonb_build_object('resultado', 'viva', 'hasta', r.hasta, 'ahora', now());
  end if;
  if r.estado <> 'aceptada' then
    return jsonb_build_object('resultado', case when r.estado = 'viva' then 'caducada' else r.estado end);
  end if;
  select * into e from envios where id = r.envio_id;
  if e.transportista_id is distinct from r.transportista_id then
    return jsonb_build_object('resultado', 'reasignada');
  end if;
  -- La llave caduca al terminar el viaje (entregado o cancelado).
  if e.estado in ('entregado', 'cancelado') then
    return jsonb_build_object('resultado', 'cerrada', 'estado', e.estado, 'referencia', e.referencia_gx);
  end if;
  return jsonb_build_object(
    'resultado', 'aceptada', 'estado', e.estado,
    'referencia', e.referencia_gx, 'referencia_cliente', e.referencia_cliente,
    'transportista', (select nombre_visible from transportistas where id = r.transportista_id),
    'precio', r.precio_aceptado, 'pronto_pago', r.pronto_pago,
    'pronto_pago_pct', parametro('pronto_pago_pct'), 'pronto_pago_minimo', parametro('pronto_pago_minimo'),
    'pronto_pago_dias', parametro('pronto_pago_dias'), 'plazo_pago_dias', parametro('plazo_pago_transportista_dias'),
    'aceptada_en', r.cerrada_en,
    'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
    'fecha_entrega_estimada', e.fecha_entrega_estimada,
    'descripcion_mercancia', e.descripcion_mercancia, 'metros_lineales', e.metros_lineales,
    'toneladas', e.toneladas, 'tipo_carga', e.tipo_carga, 'paletizado', e.paletizado,
    'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera, 'carga_superior', e.carga_superior,
    'plataforma_elevadora', e.plataforma_elevadora, 'nima_requerido', e.nima_requerido, 'adr', e.adr,
    'discrecion_comercial', e.discrecion_comercial,
    'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
    'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono,
    'paradas', (select coalesce(jsonb_agg(jsonb_build_object(
        'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion,
        'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia,
        'pais_codigo_iso', p.pais_codigo_iso, 'referencia', p.referencia, 'anotaciones', p.anotaciones,
        'tipo_lugar', l.tipo, 'horarios', l.horarios, 'notas_sitio', l.anotaciones,
        'requiere_cita', coalesce(l.requiere_cita, false), 'tiene_medios_carga', coalesce(l.tiene_medios_carga, true),
        'url_google_maps', l.url_google_maps,
        'contacto', (select jsonb_build_object('nombre', c.nombre, 'telefono', c.telefono)
                       from contactos c where c.lugar_id = p.lugar_id and c.es_principal limit 1))
        order by p.orden), '[]'::jsonb)
      from envio_paradas p left join lugares l on l.id = p.lugar_id where p.envio_id = e.id)
  );
end $$;

create or replace function datos_orden_publica(p_reserva uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r envio_reservas%rowtype;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'aceptada'
     or not exists (select 1 from envios e where e.id = r.envio_id and e.transportista_id = r.transportista_id) then
    raise exception 'Esa orden de carga no es tuya.' using errcode = '42501';
  end if;
  if exists (select 1 from envios e where e.id = r.envio_id and e.estado in ('entregado', 'cancelado')) then
    raise exception 'Este viaje ya ha terminado: la orden de carga ya no está disponible en este enlace.' using errcode = '42501';
  end if;
  return orden_carga_json(r.envio_id);
end $$;

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
  if v_estado = 'entregado' then raise exception 'Este viaje ya ha terminado.' using errcode = '42501'; end if;
  select token into v_tok from cmr_enlaces where envio_id = r.envio_id and not revocado and caduca_en > now();
  if v_tok is null then
    update cmr_enlaces set revocado = true where envio_id = r.envio_id and not revocado;
    insert into cmr_enlaces (envio_id) values (r.envio_id) returning token into v_tok;
  end if;
  return v_tok;
end $$;
