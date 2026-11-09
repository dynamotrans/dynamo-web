-- =====================================================================================
-- LA CARGA ACEPTADA ENSEÑA LA FICHA COMPLETA DE CADA SITIO (usuario, 2026-11-09)
-- =====================================================================================
-- En la página del transportista (carga aceptada), cada parada debe llevar TODOS los
-- detalles del sitio: horario (también el de verano, con sus fechas), teléfono de
-- contacto, cita previa, medios de carga y el PIN. carga_aceptada_publica ya traía
-- horario, cita, medios y contacto; se añade:
--   · horarios_verano + verano_desde/hasta (solo si el sitio lo tiene activo);
--   · requiere_pin (el del sitio o el del cliente, que obliga en todas sus paradas);
--   · el contacto pasa a ser el PRIMER contacto CON teléfono (el principal por delante),
--     en vez de solo el principal (si el principal no tenía teléfono, no salía ninguno).
-- Copiada de su versión vigente (20261106160100_seguimiento_automatico).
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.carga_aceptada_publica(p_reserva uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not enlace_carga_vigente(e.id) then
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
    'fecha_carga_prevista', e.fecha_carga_prevista,
    'fecha_entrega_estimada', e.fecha_entrega_estimada,
    'descripcion_mercancia', e.descripcion_mercancia, 'metros_lineales', e.metros_lineales,
    'toneladas', e.toneladas, 'tipo_carga', e.tipo_carga, 'paletizado', e.paletizado,
    'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera, 'carga_techo', e.carga_techo,
    'requiere_plataforma_elevadora', e.requiere_plataforma_elevadora, 'requiere_nima', e.requiere_nima, 'adr', e.adr,
    'discrecion_comercial', e.discrecion_comercial,
    'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
    'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono,
    'paradas', (select coalesce(jsonb_agg(jsonb_build_object(
        'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion,
        'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia,
        'pais_codigo_iso', p.pais_codigo_iso, 'referencia', p.referencia, 'anotaciones', p.anotaciones,
        'tipo_sitio', l.tipo, 'horarios', l.horarios, 'notas_sitio', l.anotaciones,
        -- El horario de verano solo si el sitio lo tiene activo, con sus fechas (MM-DD).
        'horarios_verano', case when l.verano_activo then l.horarios_verano end,
        'verano_desde', case when l.verano_activo then l.verano_desde end,
        'verano_hasta', case when l.verano_activo then l.verano_hasta end,
        'requiere_cita', coalesce(l.requiere_cita, false), 'tiene_medios_carga', coalesce(l.tiene_medios_carga, true),
        -- El PIN: el del sitio, o el del cliente (que obliga en todas sus paradas).
        'requiere_pin', coalesce(l.requiere_pin, false)
                        or coalesce((select requiere_pin from clientes where id = e.cliente_id), false),
        'url_google_maps', l.url_google_maps,
        -- El primer contacto CON teléfono (el principal por delante).
        'contacto', (select jsonb_build_object('nombre', c.nombre, 'telefono', c.telefono)
                       from contactos c where c.sitio_id = p.sitio_id and c.telefono is not null
                       order by c.es_principal desc, c.creado_en limit 1))
        order by p.orden), '[]'::jsonb)
      from envio_paradas p left join sitios l on l.id = p.sitio_id where p.envio_id = e.id)
  );
end $function$;
