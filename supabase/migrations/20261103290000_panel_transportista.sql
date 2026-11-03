-- =====================================================================================
-- ETAPA C: EL TRANSPORTISTA EN SU PANEL (2026-11-03)
-- =====================================================================================
-- Lo que necesita un transportista con cuenta para hacer el viaje sin llamar:
--   1. Ver cada parada con su HORARIO, su TELÉFONO de muelle y sus avisos (cita previa,
--      sin medios de carga…): lo mismo que lleva la orden de carga. Nunca el cliente de
--      Dynamo ni lo que paga (mis_viajes sigue sin esas columnas).
--   2. Marcar cómo va el viaje: hacia la carga → cargando → en ruta → entregado (solo
--      hacia delante; los hitos y la hora los pone la base de datos).
--   3. Subir el albarán, el CMR firmado, fotos y el GPS/tacógrafo de SUS viajes.
--   4. Abrir el CMR digital de SU viaje para que firmen en el muelle.

-- ---- 1. Paradas del viaje con lo que hace falta en el muelle ---------------------------
create or replace function paradas_viaje_json(p_envio uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa', p.nombre_empresa,
           'direccion', p.direccion, 'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion,
           'provincia', p.provincia, 'pais_codigo_iso', p.pais_codigo_iso, 'referencia', p.referencia,
           'anotaciones', p.anotaciones, 'fecha_desde', p.fecha_desde, 'fecha_hasta', p.fecha_hasta, 'hora_real', p.hora_real,
           'horarios', l.horarios, 'url_google_maps', l.url_google_maps, 'requiere_cita', coalesce(l.requiere_cita, false),
           'tiene_medios_carga', coalesce(l.tiene_medios_carga, true), 'notas_sitio', l.anotaciones,
           'contacto_nombre', c.nombre, 'contacto_telefono', c.telefono)
           order by p.orden), '[]'::jsonb)
    from envio_paradas p
    left join lugares l on l.id = p.lugar_id
    left join lateral (select nombre, telefono from contactos x where x.lugar_id = p.lugar_id and x.es_principal limit 1) c on true
   where p.envio_id = p_envio
$$;
revoke execute on function paradas_viaje_json(uuid) from public, anon, authenticated;

drop function mis_viajes();
create function mis_viajes()
returns table (
  id uuid, referencia_gx text, estado estado_envio,
  fecha_carga_desde date, fecha_carga_hasta date, fecha_carga_real date,
  fecha_entrega_estimada date,
  descripcion_mercancia varchar, toneladas numeric, metros_lineales numeric,
  tipo_carga tipo_carga, paletizado boolean, carga_lateral boolean, carga_superior boolean,
  carga_trasera boolean, plataforma_elevadora boolean, nima_requerido boolean, adr boolean,
  importe_transportista numeric, moneda char,
  matricula_camion text, matricula_remolque text, conductor_nombre text,
  conductor_telefono text, asignado_en timestamptz, cargado_en timestamptz,
  entregado_en timestamptz, paradas jsonb,
  discrecion_comercial boolean, codigo_postal_origen text, poblacion_origen text,
  codigo_postal_destino text, poblacion_destino text, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.referencia_gx, e.estado,
         e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real, e.fecha_entrega_estimada,
         e.descripcion_mercancia, e.toneladas, e.metros_lineales, e.tipo_carga,
         e.paletizado, e.carga_lateral, e.carga_superior, e.carga_trasera,
         e.plataforma_elevadora, e.nima_requerido, e.adr,
         e.importe_transportista, e.moneda,
         e.matricula_camion, e.matricula_remolque, e.conductor_nombre, e.conductor_telefono,
         e.asignado_en, e.cargado_en, e.entregado_en, paradas_viaje_json(e.id),
         e.discrecion_comercial, e.codigo_postal_origen, e.poblacion_origen,
         e.codigo_postal_destino, e.poblacion_destino, e.creado_en
    from envios e
   where e.transportista_id = transportista_del_usuario()
   order by e.fecha_carga_desde desc nulls last
$$;
revoke execute on function mis_viajes() from public, anon;
grant execute on function mis_viajes() to authenticated;
comment on function mis_viajes() is
  'Viajes asignados al TRANSPORTISTA que llama, con horario y teléfono de cada muelle. Su precio sí; '
  'el del cliente, el margen y la identidad del cliente de Dynamo, nunca.';


-- ---- 2. Marcar cómo va el viaje -------------------------------------------------------
create or replace function marcar_mi_viaje(p_envio uuid, p_estado text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_actual estado_envio; v_orden text[] := array['programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado'];
begin
  if not envio_del_transportista(p_envio) then raise exception 'Ese viaje no es tuyo.' using errcode = '42501'; end if;
  select estado into v_actual from envios where id = p_envio for update;
  if p_estado not in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado') then raise exception 'Estado no válido.'; end if;
  if v_actual::text = p_estado then return; end if;
  if array_position(v_orden, v_actual::text) is null or array_position(v_orden, p_estado) < array_position(v_orden, v_actual::text) then
    raise exception 'El viaje está % y no puede volver atrás. Si te has equivocado, llámanos al +34 955 225 945.', replace(v_actual::text, '_', ' ');
  end if;
  update envios set estado = p_estado::estado_envio,
                    fecha_carga_real = case when p_estado in ('en_ruta', 'entregado') then coalesce(fecha_carga_real, current_date) else fecha_carga_real end
   where id = p_envio;
end $$;
revoke execute on function marcar_mi_viaje(uuid, text) from public, anon;
grant execute on function marcar_mi_viaje(uuid, text) to authenticated;


-- ---- 3. Documentos de sus viajes ---------------------------------------------------------
drop policy if exists documentos_ins_transportista on documentos;
create policy documentos_ins_transportista on documentos for insert with check (
  tipo in ('albaran', 'cmr_firmado', 'foto_incidencia', 'gps_tacografo', 'adjunto')
  and envio_id is not null and envio_del_transportista(envio_id)
  and incidencia_id is null and transportista_id is null and almacenamiento_id is null
  and penalizacion_id is null and operador_id is null and usuario_id is null
);


-- ---- 4. El CMR digital de su viaje (y del cliente, para el remitente) -----------------
-- Devuelve el enlace vivo del envío o crea uno. Para el transportista del viaje y para el
-- cliente del envío (que firma como remitente). No para envíos cancelados.
create or replace function mi_enlace_cmr(p_envio uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_tok uuid; v_estado estado_envio;
begin
  if not (envio_del_transportista(p_envio) or envio_del_cliente(p_envio)) then
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  select estado into v_estado from envios where id = p_envio;
  if v_estado in ('cancelado', 'borrador') then raise exception 'Este envío no tiene CMR para firmar.'; end if;
  select token into v_tok from cmr_enlaces where envio_id = p_envio and not revocado and caduca_en > now();
  if v_tok is null then
    update cmr_enlaces set revocado = true where envio_id = p_envio and not revocado;
    insert into cmr_enlaces (envio_id) values (p_envio) returning token into v_tok;
  end if;
  return v_tok;
end $$;
revoke execute on function mi_enlace_cmr(uuid) from public, anon;
grant execute on function mi_enlace_cmr(uuid) to authenticated;
