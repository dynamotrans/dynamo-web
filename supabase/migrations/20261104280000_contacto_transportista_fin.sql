-- =====================================================================================
-- CONTACTO DEL TRANSPORTISTA: deja de verse al terminar el envío (anti-desintermediación)
-- Decisión del usuario (2026-11-04). El cliente deja de ver el nombre y el teléfono del
-- conductor cuando el envío:
--   · está entregado o cancelado (Dynamo puede marcarlo entregado a mano en cuanto le
--     avisan, aunque sea antes de lo previsto), o
--   · han pasado `contacto_transportista_horas_tras_entrega` horas desde el final del día
--     de entrega previsto (por si nadie lo marca).
-- (Visibilidad por empresa: mis_envios ya filtra por la EMPRESA del usuario, no por quién
-- creó el envío; la prueba 106 lo demuestra.)
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('contacto_transportista_horas_tras_entrega', '12',
   'Horas tras el final del día de entrega previsto en que el cliente deja de ver el nombre y el teléfono del conductor (si nadie ha marcado el envío como entregado antes).')
on conflict (clave) do nothing;

create or replace function contacto_transportista_oculto(p_estado estado_envio, p_entrega date)
returns boolean language sql stable security definer set search_path = public as $$
  select p_estado in ('entregado', 'cancelado')
      or (p_entrega is not null
          and now() > ((p_entrega + 1)::timestamp at time zone 'Europe/Madrid')
                      + make_interval(hours => p_num('contacto_transportista_horas_tras_entrega', 12)::int))
$$;
revoke execute on function contacto_transportista_oculto(estado_envio, date) from public, anon, authenticated;

create or replace function mis_envios()
returns table (
  id uuid, referencia_gx text, referencia_cliente text, estado estado_envio,
  estado_asignacion estado_asignacion, es_manual boolean, operador_id uuid,
  precio_acordado_operador numeric,
  fecha_carga_desde date, fecha_carga_hasta date, fecha_carga_real date,
  fecha_entrega_estimada date,
  descripcion_mercancia varchar, toneladas numeric, metros_lineales numeric,
  tipo_carga tipo_carga, paletizado boolean, carga_lateral boolean, carga_superior boolean,
  carga_trasera boolean, plataforma_elevadora boolean, nima_requerido boolean, adr boolean,
  codigo_postal_origen text, poblacion_origen text,
  codigo_postal_destino text, poblacion_destino text,
  num_paradas smallint, importe_cliente numeric, moneda char, iva_aplicado numeric,
  anotaciones_cliente varchar, discrecion_comercial boolean,
  matricula_camion text, matricula_remolque text,
  conductor_nombre text, conductor_telefono text,
  creado_en timestamptz, modificado_en timestamptz, confirmado_en timestamptz,
  asignado_en timestamptz, cargado_en timestamptz, entregado_en timestamptz,
  cancelado_en timestamptz, paradas jsonb,
  solicitud_estado text, precio_valido_hasta timestamptz, condiciones_aceptadas_en timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.referencia_gx, e.referencia_cliente, e.estado, e.estado_asignacion,
         e.es_manual, e.operador_id, e.precio_acordado_operador,
         e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real, e.fecha_entrega_estimada,
         e.descripcion_mercancia, e.toneladas, e.metros_lineales, e.tipo_carga,
         e.paletizado, e.carga_lateral, e.carga_superior, e.carga_trasera,
         e.plataforma_elevadora, e.nima_requerido, e.adr,
         e.codigo_postal_origen, e.poblacion_origen,
         e.codigo_postal_destino, e.poblacion_destino, e.num_paradas,
         -- Mientras Dynamo no proponga precio, el cliente no ve ningún importe.
         case when e.solicitud_estado = 'pendiente_precio' then null else e.importe_cliente end,
         e.moneda, e.iva_aplicado, e.anotaciones_cliente,
         e.discrecion_comercial, e.matricula_camion, e.matricula_remolque,
         case when contacto_transportista_oculto(e.estado, e.fecha_entrega_estimada) then null else e.conductor_nombre end,
         case when contacto_transportista_oculto(e.estado, e.fecha_entrega_estimada) then null else e.conductor_telefono end,
         e.creado_en, e.modificado_en, e.confirmado_en, e.asignado_en, e.cargado_en,
         e.entregado_en, e.cancelado_en, paradas_json(e.id),
         e.solicitud_estado, e.precio_valido_hasta, e.condiciones_aceptadas_en
    from envios e
   where e.cliente_id = cliente_del_usuario()
   order by e.creado_en desc
$$;
revoke execute on function mis_envios() from public, anon;
grant execute on function mis_envios() to authenticated;
