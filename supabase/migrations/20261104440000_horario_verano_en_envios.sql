-- =====================================================================================
-- HORARIO DE VERANO TAMBIÉN EN LOS ENVÍOS (2026-11-05)
-- El horario de verano de un sitio (20261104430000) solo salía en su ficha. Ahora, en lo
-- que ve el transportista (Mis viajes y la página pública de la carga), cada parada lleva
-- el horario que le toca según su fecha: el de verano si el sitio lo tiene activo y la
-- fecha cae dentro, con «(horario de verano)»; si no, el general.
-- Fecha de cada parada: la suya si la tiene; si no, la de carga (recogidas) o la de
-- entrega estimada (entregas).
-- =====================================================================================

create or replace function horario_sitio_txt(p_lugar uuid, p_fecha date)
returns text language sql stable security definer set search_path = public as $$
  select case when l.verano_activo and p_fecha is not null and l.horarios_verano is not null
                   and en_temporada(p_fecha, l.verano_desde, l.verano_hasta)
              then l.horarios_verano || ' (horario de verano)'
              else l.horarios end
    from lugares l where l.id = p_lugar
$$;
revoke execute on function horario_sitio_txt(uuid, date) from public, anon;
grant execute on function horario_sitio_txt(uuid, date) to authenticated;

create or replace function paradas_viaje_json(p_envio uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa', p.nombre_empresa,
           'direccion', p.direccion, 'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion,
           'provincia', p.provincia, 'pais_codigo_iso', p.pais_codigo_iso, 'referencia', p.referencia,
           'anotaciones', p.anotaciones, 'fecha_desde', p.fecha_desde, 'fecha_hasta', p.fecha_hasta, 'hora_real', p.hora_real,
           'horarios', horario_sitio_txt(l.id, coalesce((p.fecha_desde at time zone 'Europe/Madrid')::date, case when p.tipo = 'carga' then e.fecha_carga_desde else coalesce(e.fecha_entrega_estimada, e.fecha_carga_desde) end)), 'url_google_maps', l.url_google_maps, 'requiere_cita', coalesce(l.requiere_cita, false),
           'tiene_medios_carga', coalesce(l.tiene_medios_carga, true), 'notas_sitio', l.anotaciones,
           'contacto_nombre', c.nombre, 'contacto_telefono', c.telefono)
           order by p.orden), '[]'::jsonb)
    from envio_paradas p
    join envios e on e.id = p.envio_id
    left join lugares l on l.id = p.lugar_id
    left join lateral (select nombre, telefono from contactos x where x.lugar_id = p.lugar_id and x.es_principal limit 1) c on true
   where p.envio_id = p_envio
$$;
revoke execute on function paradas_viaje_json(uuid) from public, anon, authenticated;

create or replace function oferta_publica(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t record; e record; o record; v_motivo text; v_tramite boolean;
begin
  select * into t from oferta_de_token(p_token);
  if t.envio_id is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  select * into e from envios where id = t.envio_id;
  if t.oferta_id is not null then select * into o from envio_ofertas where id = t.oferta_id; end if;

  v_motivo := case
    when e.estado = 'cancelado' then 'cancelado'
    when e.estado <> 'programado' or e.estado_asignacion = 'confirmada' then 'tomada'
    when not t.oferta_activa then 'caducada'
  end;
  v_tramite := exists (select 1 from envio_reservas where envio_id = e.id
                        and estado = 'viva' and hasta > now());

  return jsonb_build_object(
    'resultado', 'ok',
    'disponible', v_motivo is null,
    'motivo', v_motivo,
    'en_tramite', v_tramite,
    'asignada_en', e.asignado_en,
    'referencia', e.referencia_gx,
    'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
    'fecha_entrega_estimada', e.fecha_entrega_estimada,
    'descripcion_mercancia', e.descripcion_mercancia,
    'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas, 'tipo_carga', e.tipo_carga,
    'paletizado', e.paletizado, 'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera,
    'carga_superior', e.carga_superior, 'plataforma_elevadora', e.plataforma_elevadora,
    'nima_requerido', e.nima_requerido, 'adr', e.adr,
    'precio', coalesce(o.precio_ofertado, e.importe_transportista),
    'banda_euros', coalesce(o.banda_euros, 0),
    'pronto_pago', coalesce(o.pronto_pago, true),
    'pronto_pago_pct', parametro('pronto_pago_pct'), 'pronto_pago_minimo', parametro('pronto_pago_minimo'),
    'pronto_pago_dias', parametro('pronto_pago_dias'), 'plazo_pago_dias', parametro('plazo_pago_transportista_dias'),
    'reserva_minutos', parametro('reserva_minutos'),
    'para_transportista', (select nombre_visible from transportistas where id = o.transportista_id),
    'paradas', (select coalesce(jsonb_agg(jsonb_build_object(
        'orden', p.orden, 'tipo', p.tipo, 'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion,
        'provincia', p.provincia, 'pais_codigo_iso', p.pais_codigo_iso,
        'tipo_lugar', l.tipo, 'horarios', horario_sitio_txt(l.id, coalesce((p.fecha_desde at time zone 'Europe/Madrid')::date, case when p.tipo = 'carga' then e.fecha_carga_desde else coalesce(e.fecha_entrega_estimada, e.fecha_carga_desde) end)),
        'requiere_cita', coalesce(l.requiere_cita, false), 'tiene_medios_carga', coalesce(l.tiene_medios_carga, true))
        order by p.orden), '[]'::jsonb)
      from envio_paradas p left join lugares l on l.id = p.lugar_id where p.envio_id = e.id)
  );
end $$;

