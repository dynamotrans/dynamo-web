-- =====================================================================================
-- «LUGARES» PASA A LLAMARSE «SITIOS» EN TODA LA BASE DE DATOS (usuario, 2026-11-05)
-- En las pantallas ya se decía «Sitios»; ahora las tablas, columnas, funciones, políticas,
-- disparadores, índices y descripciones dicen lo mismo:
--   lugares → sitios · lugar_horarios → sitio_horarios · distancias_lugares → distancias_sitios
--   recargos_tipo_lugar → recargos_tipo_sitio · tipo_lugar → tipo_sitio · *lugar_id → *sitio_id
--   p_lugar → p_sitio (argumentos de guardar_horario, horario_del_dia…)
-- Los datos no se tocan: solo cambian los nombres. El historial guardado antes del cambio
-- (auditoria.tabla = 'lugares') se sigue viendo en la ficha del sitio.
-- Generada a partir de la base de datos (no se editan funciones a mano): el arnés aplica
-- todas las migraciones y las pruebas usan ya los nombres nuevos.
-- =====================================================================================

-- ---- Tablas, secuencia y tipos -------------------------------------------------------
alter table public.distancias_lugares rename to distancias_sitios;
alter table public.lugar_horarios rename to sitio_horarios;
alter table public.lugares rename to sitios;
alter table public.recargos_tipo_lugar rename to recargos_tipo_sitio;
alter sequence public.seq_lugar_codigo rename to seq_sitio_codigo;
alter type public.tipo_lugar rename to tipo_sitio;
alter type public.tipo_entidad rename value 'lugar' to 'sitio';

-- ---- Columnas -----------------------------------------------------------------------
alter table public.almacenamientos rename column lugar_entrega_id to sitio_entrega_id;
alter table public.clientes rename column lugar_defecto_id to sitio_defecto_id;
alter table public.contactos rename column lugar_id to sitio_id;
alter table public.distancias_sitios rename column lugar_destino_id to sitio_destino_id;
alter table public.distancias_sitios rename column lugar_origen_id to sitio_origen_id;
alter table public.envio_paradas rename column lugar_id to sitio_id;
alter table public.sitio_horarios rename column lugar_id to sitio_id;

-- ---- Restricciones, índices, disparadores y políticas --------------------------------
alter table public.almacenamientos rename constraint almacenamientos_lugar_entrega_id_fkey to almacenamientos_sitio_entrega_id_fkey;
alter table public.distancias_sitios rename constraint ck_distancias_lugares_distintos to ck_distancias_sitios_distintos;
alter table public.sitio_horarios rename constraint ck_lugar_horarios_tramo to ck_sitio_horarios_tramo;
alter table public.sitios rename constraint ck_lugares_borrado to ck_sitios_borrado;
alter table public.sitios rename constraint ck_lugares_dueno to ck_sitios_dueno;
alter table public.sitios rename constraint ck_lugares_precio_solo_dynamo to ck_sitios_precio_solo_dynamo;
alter table public.sitios rename constraint ck_lugares_verano to ck_sitios_verano;
alter table public.clientes rename constraint clientes_lugar_defecto_id_fkey to clientes_sitio_defecto_id_fkey;
alter table public.contactos rename constraint contactos_lugar_id_fkey to contactos_sitio_id_fkey;
alter table public.distancias_sitios rename constraint distancias_lugares_creado_por_fkey to distancias_sitios_creado_por_fkey;
alter table public.distancias_sitios rename constraint distancias_lugares_km_check to distancias_sitios_km_check;
alter table public.distancias_sitios rename constraint distancias_lugares_lugar_destino_id_fkey to distancias_sitios_sitio_destino_id_fkey;
alter table public.distancias_sitios rename constraint distancias_lugares_lugar_origen_id_fkey to distancias_sitios_sitio_origen_id_fkey;
alter table public.distancias_sitios rename constraint distancias_lugares_minutos_check to distancias_sitios_minutos_check;
alter table public.distancias_sitios rename constraint distancias_lugares_modificado_por_fkey to distancias_sitios_modificado_por_fkey;
alter table public.distancias_sitios rename constraint distancias_lugares_pkey to distancias_sitios_pkey;
alter table public.envio_paradas rename constraint envio_paradas_lugar_id_fkey to envio_paradas_sitio_id_fkey;
alter table public.sitios rename constraint fk_lugares_cliente to fk_sitios_cliente;
alter table public.sitio_horarios rename constraint lugar_horarios_creado_por_fkey to sitio_horarios_creado_por_fkey;
alter table public.sitio_horarios rename constraint lugar_horarios_dia_semana_check to sitio_horarios_dia_semana_check;
alter table public.sitio_horarios rename constraint lugar_horarios_lugar_id_fkey to sitio_horarios_sitio_id_fkey;
alter table public.sitio_horarios rename constraint lugar_horarios_modificado_por_fkey to sitio_horarios_modificado_por_fkey;
alter table public.sitio_horarios rename constraint lugar_horarios_pkey to sitio_horarios_pkey;
alter table public.sitio_horarios rename constraint lugar_horarios_temporada_check to sitio_horarios_temporada_check;
alter table public.sitios rename constraint lugares_codigo_key to sitios_codigo_key;
alter table public.sitios rename constraint lugares_creado_por_fkey to sitios_creado_por_fkey;
alter table public.sitios rename constraint lugares_emails_avisos_check to sitios_emails_avisos_check;
alter table public.sitios rename constraint lugares_lat_check to sitios_lat_check;
alter table public.sitios rename constraint lugares_lon_check to sitios_lon_check;
alter table public.sitios rename constraint lugares_modificado_por_fkey to sitios_modificado_por_fkey;
alter table public.sitios rename constraint lugares_nombre_empresa_check to sitios_nombre_empresa_check;
alter table public.sitios rename constraint lugares_pais_codigo_iso_check to sitios_pais_codigo_iso_check;
alter table public.sitios rename constraint lugares_pkey to sitios_pkey;
alter table public.sitios rename constraint lugares_precio_almacenamiento_semana_check to sitios_precio_almacenamiento_semana_check;
alter table public.sitios rename constraint lugares_precio_reparto_check to sitios_precio_reparto_check;
alter table public.sitios rename constraint lugares_verano_desde_check to sitios_verano_desde_check;
alter table public.sitios rename constraint lugares_verano_hasta_check to sitios_verano_hasta_check;
alter table public.recargos_tipo_sitio rename constraint recargos_tipo_lugar_check to recargos_tipo_sitio_check;
alter table public.recargos_tipo_sitio rename constraint recargos_tipo_lugar_pkey to recargos_tipo_sitio_pkey;
alter table public.recargos_tipo_sitio rename constraint recargos_tipo_lugar_porcentaje_check to recargos_tipo_sitio_porcentaje_check;
alter table public.distancias_sitios rename constraint ux_distancias_lugares to ux_distancias_sitios;
alter table public.sitio_horarios rename constraint ux_lugar_horarios to ux_sitio_horarios;
alter index public.idx_contactos_lugar rename to idx_contactos_sitio;
alter index public.idx_distancias_lugares_destino rename to idx_distancias_sitios_destino;
alter index public.idx_distancias_lugares_origen rename to idx_distancias_sitios_origen;
alter index public.idx_lugar_horarios_lugar rename to idx_sitio_horarios_sitio;
alter index public.idx_lugares_busqueda rename to idx_sitios_busqueda;
alter index public.idx_lugares_cliente rename to idx_sitios_cliente;
alter index public.idx_lugares_con_cita rename to idx_sitios_con_cita;
alter index public.idx_lugares_cp rename to idx_sitios_cp;
alter index public.idx_lugares_dynamo rename to idx_sitios_dynamo;
alter index public.idx_lugares_posible_duplicado rename to idx_sitios_posible_duplicado;
alter index public.idx_lugares_provincia rename to idx_sitios_provincia;
alter index public.idx_lugares_sin_medios rename to idx_sitios_sin_medios;
alter index public.idx_lugares_tipo rename to idx_sitios_tipo;
alter index public.idx_paradas_lugar rename to idx_paradas_sitio;
alter index public.ux_contactos_principal_lugar rename to ux_contactos_principal_sitio;
alter trigger tg_auditar_distancias_lugares on public.distancias_sitios rename to tg_auditar_distancias_sitios;
alter trigger tg_auditar_lugar_horarios on public.sitio_horarios rename to tg_auditar_sitio_horarios;
alter trigger tg_auditar_lugares on public.sitios rename to tg_auditar_sitios;
alter trigger tg_clientes_lugar_defecto on public.clientes rename to tg_clientes_sitio_defecto;
alter trigger tg_lugar_horarios_resumen on public.sitio_horarios rename to tg_sitio_horarios_resumen;
alter trigger tg_lugar_horarios_sin_solapes on public.sitio_horarios rename to tg_sitio_horarios_sin_solapes;
alter trigger tg_lugares_campos_dynamo on public.sitios rename to tg_sitios_campos_dynamo;
alter trigger tg_lugares_dueno on public.sitios rename to tg_sitios_dueno;
alter trigger tg_lugares_hora_borrado on public.sitios rename to tg_sitios_hora_borrado;
alter trigger tg_lugares_horario_inicial on public.sitios rename to tg_sitios_horario_inicial;
alter trigger tg_lugares_quitar_principal on public.sitios rename to tg_sitios_quitar_principal;
alter trigger tg_lugares_resumen_horario on public.sitios rename to tg_sitios_resumen_horario;
alter trigger tg_lugares_url_mapa on public.sitios rename to tg_sitios_url_mapa;
alter trigger tg_lugares_version_geo on public.sitios rename to tg_sitios_version_geo;
alter trigger tg_paradas_lugar_del_cliente on public.envio_paradas rename to tg_paradas_sitio_del_cliente;
alter trigger tg_sellar_distancias_lugares on public.distancias_sitios rename to tg_sellar_distancias_sitios;
alter trigger tg_sellar_lugar_horarios on public.sitio_horarios rename to tg_sellar_sitio_horarios;
alter trigger tg_sellar_lugares on public.sitios rename to tg_sellar_sitios;
alter policy distancias_lugares_ve_todo on public.distancias_sitios rename to distancias_sitios_ve_todo;
alter policy lugar_horarios_del on public.sitio_horarios rename to sitio_horarios_del;
alter policy lugar_horarios_ins on public.sitio_horarios rename to sitio_horarios_ins;
alter policy lugar_horarios_sel on public.sitio_horarios rename to sitio_horarios_sel;
alter policy lugar_horarios_upd on public.sitio_horarios rename to sitio_horarios_upd;
alter policy lugares_del on public.sitios rename to sitios_del;
alter policy lugares_ins on public.sitios rename to sitios_ins;
alter policy lugares_sel on public.sitios rename to sitios_sel;
alter policy lugares_upd on public.sitios rename to sitios_upd;
alter policy lugares_ve_todo on public.sitios rename to sitios_ve_todo;
alter policy recargos_tipo_lugar_ve_todo on public.recargos_tipo_sitio rename to recargos_tipo_sitio_ve_todo;

-- ---- Funciones: las que cambian de argumentos se quitan y se vuelven a crear ----------
drop function public.guardar_horario(p_lugar uuid, p_tramos jsonb, p_temporada text);
drop function public.guardar_horario_verano(p_lugar uuid, p_activo boolean, p_desde text, p_hasta text, p_tramos jsonb);
drop function public.horario_del_dia(p_lugar uuid, p_fecha date);
drop function public.horario_sitio_txt(p_lugar uuid, p_fecha date);
drop function public.horario_texto(p_lugar uuid, p_temporada text);
drop function public.marcar_sitio_principal(p_cliente uuid, p_lugar uuid);
drop function public.poner_horario_por_defecto(p_lugar uuid);
alter function public.fn_clientes_lugar_defecto() rename to fn_clientes_sitio_defecto;
alter function public.fn_guardar_km_lugares(p_origen uuid, p_destino uuid, p_km numeric, p_minutos integer, p_proveedor text) rename to fn_guardar_km_sitios;
alter function public.fn_km_lugares(p_origen uuid, p_destino uuid, p_max_edad interval) rename to fn_km_sitios;
alter function public.fn_lugar_horarios_resumen() rename to fn_sitio_horarios_resumen;
alter function public.fn_lugar_horarios_sin_solapes() rename to fn_sitio_horarios_sin_solapes;
alter function public.fn_lugares_campos_dynamo() rename to fn_sitios_campos_dynamo;
alter function public.fn_lugares_dueno() rename to fn_sitios_dueno;
alter function public.fn_lugares_hora_borrado() rename to fn_sitios_hora_borrado;
alter function public.fn_lugares_horario_inicial() rename to fn_sitios_horario_inicial;
alter function public.fn_lugares_quitar_principal() rename to fn_sitios_quitar_principal;
alter function public.fn_lugares_resumen_horario() rename to fn_sitios_resumen_horario;
alter function public.fn_lugares_url_mapa() rename to fn_sitios_url_mapa;
alter function public.fn_lugares_version_geo() rename to fn_sitios_version_geo;
alter function public.fn_paradas_lugar_del_cliente() rename to fn_paradas_sitio_del_cliente;

CREATE OR REPLACE FUNCTION public.almacenes_dynamo_tarifa()
 RETURNS TABLE(id uuid, nombre text, direccion text, codigo_postal text, poblacion text, provincia text, disponible boolean, semana numeric, reparto numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select l.id, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion, l.provincia, l.disponible,
         t.semana, t.reparto
    from sitios l cross join lateral tarifa_almacen(l.id) t
   where l.es_almacen_dynamo and not l.borrado
   order by l.provincia, l.poblacion
$function$;

CREATE OR REPLACE FUNCTION public.buscar_persona(p_texto text)
 RETURNS TABLE(tipo text, id uuid, nombre text, email text, telefono text, documento text, empresa text, estado text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare q text := lower(trim(coalesce(p_texto, ''))); d text;
begin
  if not es_administrador() then raise exception 'Solo el Admin Master.' using errcode = '42501'; end if;
  if length(q) < 3 then return; end if;
  d := regexp_replace(q, '[^0-9a-z]', '', 'g');   -- teléfonos y DNI sin espacios ni guiones
  return query
    select 'usuario'::text, u.id, u.nombre, u.email, u.telefono, u.documento,
           coalesce((select nombre_visible from clientes where id = u.cliente_id), (select nombre_visible from transportistas where id = u.transportista_id), 'Dynamo'),
           u.estado::text
      from usuarios u
     where lower(u.email) like '%' || q || '%' or lower(coalesce(u.nombre, '')) like '%' || q || '%'
        or (length(d) >= 6 and (regexp_replace(lower(coalesce(u.telefono, '')), '[^0-9a-z]', '', 'g') like '%' || d || '%'
                                or regexp_replace(lower(coalesce(u.documento, '')), '[^0-9a-z]', '', 'g') = d))
    union all
    select 'contacto', c.id, c.nombre, c.email, c.telefono, null::text,
           coalesce((select nombre_visible from clientes where id = c.cliente_id), (select nombre_visible from transportistas where id = c.transportista_id),
                    (select nombre_empresa from sitios where id = c.sitio_id)),
           null::text
      from contactos c
     where lower(coalesce(c.email, '')) like '%' || q || '%' or lower(coalesce(c.nombre, '')) like '%' || q || '%'
        or (length(d) >= 6 and regexp_replace(lower(coalesce(c.telefono, '')), '[^0-9a-z]', '', 'g') like '%' || d || '%')
    union all
    select 'conductor', k.id, k.nombre, null::text, k.telefono, k.documento,
           (select nombre_visible from transportistas where id = k.transportista_id),
           case when k.activo then 'activo' else 'de baja' end
      from conductores k
     where lower(k.nombre) like '%' || q || '%'
        or (length(d) >= 6 and (regexp_replace(lower(coalesce(k.telefono, '')), '[^0-9a-z]', '', 'g') like '%' || d || '%'
                                or regexp_replace(lower(coalesce(k.documento, '')), '[^0-9a-z]', '', 'g') = d))
    limit 100;
end $function$;

CREATE OR REPLACE FUNCTION public.cambiar_ruta_envio(p_envio uuid, p_paradas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e        envios%rowtype;
  v_p      jsonb;
  v_orden  smallint := 0;
  v_id     uuid;
  v_sitio  uuid;
  v_antes  jsonb;
  v_quedan uuid[] := '{}';
  l        sitios%rowtype;
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
    v_sitio := nullif(v_p ->> 'sitio_id', '')::uuid;
    if v_sitio is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into sitios (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, horarios)
      values (e.cliente_id, trim(v_p ->> 'nombre_empresa'), coalesce(nullif(v_p ->> 'tipo_sitio', '')::tipo_sitio, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''), nullif(trim(v_p ->> 'poblacion'), ''),
              nullif(trim(v_p ->> 'provincia'), ''), coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'), nullif(trim(v_p ->> 'horarios'), ''))
      returning id into v_sitio;
    end if;
    if v_sitio is not null then
      select * into l from sitios where id = v_sitio and not borrado
         and (es_almacen_dynamo or cliente_id = e.cliente_id);
      if not found then raise exception 'El sitio elegido no existe o no es de este cliente.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, sitio_id, nombre_empresa, direccion, codigo_postal, poblacion,
                                 provincia, pais_codigo_iso, lat, lon, referencia, anotaciones)
      values (p_envio, v_orden, v_p ->> 'tipo', v_sitio, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion,
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
end $function$;

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
        'tipo_sitio', l.tipo, 'horarios', l.horarios, 'notas_sitio', l.anotaciones,
        'requiere_cita', coalesce(l.requiere_cita, false), 'tiene_medios_carga', coalesce(l.tiene_medios_carga, true),
        'url_google_maps', l.url_google_maps,
        'contacto', (select jsonb_build_object('nombre', c.nombre, 'telefono', c.telefono)
                       from contactos c where c.sitio_id = p.sitio_id and c.es_principal limit 1))
        order by p.orden), '[]'::jsonb)
      from envio_paradas p left join sitios l on l.id = p.sitio_id where p.envio_id = e.id)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.cmr_publico(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_envio uuid; e record;
begin
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  select * into e from envios where id = v_envio;
  if e.estado = 'cancelado' then return jsonb_build_object('resultado', 'cancelado', 'referencia', e.referencia_gx); end if;
  return jsonb_build_object(
    'resultado', 'ok',
    'referencia', e.referencia_gx,
    'manual', e.es_manual,
    'remitente', (select razon_social from clientes where id = e.cliente_id),
    'porteador', case when e.es_manual then (select razon_social from operadores where id = e.operador_id)
                      else 'Dynamo Operador de Transportes' end,
    'transportista', (select nombre_visible from transportistas where id = e.transportista_id),
    'matricula', concat_ws(' / ', e.matricula_camion, e.matricula_remolque),
    'conductor', e.conductor_nombre,
    'fecha_carga', coalesce(e.fecha_carga_real, e.fecha_carga_desde),
    'mercancia', e.descripcion_mercancia, 'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas,
    'adr', e.adr,
    'paradas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa', p.nombre_empresa,
        'poblacion', p.poblacion, 'provincia', p.provincia, 'codigo_postal', p.codigo_postal,
        -- Para rellenar de antemano el nombre de quien firma (lo puede cambiar).
        'contacto', (select c.nombre from contactos c where c.sitio_id = p.sitio_id and c.es_principal limit 1))
        order by p.orden), '[]'::jsonb) from envio_paradas p where p.envio_id = e.id),
    'firmas', (select coalesce(jsonb_agg(jsonb_build_object(
        'parada_id', f.parada_id, 'rol', f.rol, 'nombre', f.nombre,
        'documento', '•••' || right(f.documento, 4), 'documento_pais', f.documento_pais,
        'firmado_en', f.firmado_en, 'ruta', f.firma_storage_ruta) order by f.firmado_en), '[]'::jsonb)
        from firmas_cmr f where f.envio_id = e.id)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.crear_envio(p_envio jsonb, p_paradas jsonb)
 RETURNS TABLE(id uuid, referencia_gx text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id      uuid;
  v_gx      text;
  v_cliente uuid := (p_envio ->> 'cliente_id')::uuid;
  v_p       jsonb;
  v_orden   smallint := 0;
  v_sitio   uuid;
  l         sitios%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo el equipo de Dynamo puede crear envios por ahora.' using errcode = '42501';
  end if;
  if v_cliente is null then
    raise exception 'Falta el cliente del envio.';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envio necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como maximo 4 puntos en la ruta (2 paradas ademas del origen y el destino).';
  end if;

  insert into envios (
    cliente_id, referencia_cliente, estado,
    fecha_carga_desde, fecha_carga_hasta,
    descripcion_mercancia, toneladas, metros_lineales,
    paletizado, carga_lateral, carga_trasera, carga_superior,
    plataforma_elevadora, nima_requerido, adr,
    importe_cliente, importe_transportista, precio_fijado_a_mano, iva_aplicado,
    discrecion_comercial, anotaciones_cliente
  ) values (
    v_cliente, nullif(trim(p_envio ->> 'referencia_cliente'), ''), 'borrador',
    (p_envio ->> 'fecha_carga_desde')::date, (p_envio ->> 'fecha_carga_hasta')::date,
    nullif(trim(p_envio ->> 'descripcion_mercancia'), ''),
    (p_envio ->> 'toneladas')::numeric, (p_envio ->> 'metros_lineales')::numeric,
    coalesce((p_envio ->> 'paletizado')::boolean, true),
    coalesce((p_envio ->> 'carga_lateral')::boolean, true),
    coalesce((p_envio ->> 'carga_trasera')::boolean, false),
    coalesce((p_envio ->> 'carga_superior')::boolean, false),
    coalesce((p_envio ->> 'plataforma_elevadora')::boolean, false),
    coalesce((p_envio ->> 'nima_requerido')::boolean, false),
    coalesce((p_envio ->> 'adr')::boolean, false),
    (p_envio ->> 'importe_cliente')::numeric, (p_envio ->> 'importe_transportista')::numeric,
    (p_envio ->> 'importe_cliente') is not null,
    coalesce((p_envio ->> 'iva_aplicado')::numeric, 21),
    coalesce((p_envio ->> 'discrecion_comercial')::boolean, false),
    nullif(trim(p_envio ->> 'anotaciones_cliente'), '')
  ) returning envios.id, envios.referencia_gx into v_id, v_gx;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    v_sitio := nullif(v_p ->> 'sitio_id', '')::uuid;

    -- Sitio nuevo que se quiere en la agenda del cliente: se crea primero.
    if v_sitio is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into sitios (cliente_id, nombre_empresa, tipo, direccion, codigo_postal,
                           poblacion, provincia, pais_codigo_iso, horarios, anotaciones)
      values (v_cliente, trim(v_p ->> 'nombre_empresa'),
              coalesce(nullif(v_p ->> 'tipo_sitio', '')::tipo_sitio, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''),
              nullif(trim(v_p ->> 'poblacion'), ''), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'),
              nullif(trim(v_p ->> 'horarios'), ''), nullif(trim(v_p ->> 'anotaciones_sitio'), ''))
      returning sitios.id into v_sitio;
    end if;

    if v_sitio is not null then
      -- Copia CONGELADA de la dirección del sitio: el CMR de dentro de un año tiene que
      -- seguir diciendo a dónde se fue, aunque el sitio se edite después.
      select * into l from sitios where sitios.id = v_sitio;
      if not found then raise exception 'El sitio elegido no existe o no es de este cliente.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, sitio_id, nombre_empresa, direccion,
                                 codigo_postal, poblacion, provincia, pais_codigo_iso, lat, lon,
                                 referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', v_sitio, l.nombre_empresa, l.direccion,
              l.codigo_postal, l.poblacion, l.provincia, l.pais_codigo_iso, l.lat, l.lon,
              nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    else
      insert into envio_paradas (envio_id, orden, tipo, nombre_empresa, direccion,
                                 codigo_postal, poblacion, provincia, pais_codigo_iso,
                                 referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', nullif(trim(v_p ->> 'nombre_empresa'), ''),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''),
              nullif(trim(v_p ->> 'poblacion'), ''), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'),
              nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    end if;
  end loop;

  -- Confirmar: aquí se comprueban la ruta y las zonas, y se sellan los hitos.
  update envios set estado = 'programado' where envios.id = v_id;

  return query select v_id, v_gx;
end $function$;

CREATE OR REPLACE FUNCTION public.crear_envio_manual(p_envio jsonb, p_paradas jsonb)
 RETURNS TABLE(id uuid, referencia_gx text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cliente uuid := cliente_del_usuario();
  v_oper uuid := nullif(p_envio ->> 'operador_id', '')::uuid;
  v_id uuid; v_gx text; v_p jsonb; v_orden smallint := 0; v_sitio uuid; l sitios%rowtype;
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
    v_sitio := nullif(v_p ->> 'sitio_id', '')::uuid;
    if v_sitio is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into sitios (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso)
      values (v_cliente, trim(v_p ->> 'nombre_empresa'), coalesce(nullif(v_p ->> 'tipo_sitio', '')::tipo_sitio, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''), nullif(trim(v_p ->> 'poblacion'), ''),
              nullif(trim(v_p ->> 'provincia'), ''), coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'))
      returning sitios.id into v_sitio;
      if regexp_replace(coalesce(v_p ->> 'contacto_telefono', ''), '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$' then
        insert into contactos (sitio_id, nombre, telefono, es_principal)
        values (v_sitio, nullif(trim(v_p ->> 'contacto_nombre'), ''), regexp_replace(v_p ->> 'contacto_telefono', '[^0-9+]', '', 'g'), true);
      end if;
    end if;
    if v_sitio is not null then
      select * into l from sitios where sitios.id = v_sitio and not borrado and (es_almacen_dynamo or cliente_id = v_cliente);
      if not found then raise exception 'El sitio elegido no existe o no es tuyo.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, sitio_id, nombre_empresa, direccion, codigo_postal, poblacion,
                                 provincia, pais_codigo_iso, lat, lon, referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', v_sitio, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion,
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
end $function$;

CREATE OR REPLACE FUNCTION public.crear_solicitud_envio(p_envio jsonb, p_paradas jsonb)
 RETURNS TABLE(id uuid, referencia_gx text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cliente uuid := cliente_del_usuario();
  v_id uuid; v_gx text; v_p jsonb; v_orden smallint := 0; v_sitio uuid; l sitios%rowtype;
begin
  if v_cliente is null or not exists (select 1 from usuarios u where u.id = auth.uid() and u.estado = 'activa') then
    raise exception 'Tu cuenta no puede pedir envíos todavía.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envío necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como máximo 4 puntos en la ruta (2 paradas además del origen y el destino).';
  end if;
  if (p_envio ->> 'fecha_carga_desde') is null or (p_envio ->> 'fecha_carga_desde')::date <= (now() at time zone 'Europe/Madrid')::date then
    raise exception 'Elige una fecha de recogida a partir de mañana.';
  end if;

  insert into envios (cliente_id, referencia_cliente, estado, solicitud_estado,
    fecha_carga_desde, fecha_carga_hasta, descripcion_mercancia, toneladas, metros_lineales,
    paletizado, carga_lateral, carga_trasera, carga_superior, plataforma_elevadora, nima_requerido, adr,
    iva_aplicado, discrecion_comercial, anotaciones_cliente)
  values (v_cliente, nullif(trim(p_envio ->> 'referencia_cliente'), ''), 'borrador', 'pendiente_precio',
    (p_envio ->> 'fecha_carga_desde')::date, (p_envio ->> 'fecha_carga_hasta')::date,
    nullif(trim(p_envio ->> 'descripcion_mercancia'), ''),
    (p_envio ->> 'toneladas')::numeric, (p_envio ->> 'metros_lineales')::numeric,
    coalesce((p_envio ->> 'paletizado')::boolean, true), coalesce((p_envio ->> 'carga_lateral')::boolean, true),
    coalesce((p_envio ->> 'carga_trasera')::boolean, false), coalesce((p_envio ->> 'carga_superior')::boolean, false),
    coalesce((p_envio ->> 'plataforma_elevadora')::boolean, false), coalesce((p_envio ->> 'nima_requerido')::boolean, false),
    coalesce((p_envio ->> 'adr')::boolean, false), 21,
    coalesce((p_envio ->> 'discrecion_comercial')::boolean, false), left(nullif(trim(p_envio ->> 'anotaciones_cliente'), ''), 1000))
  returning envios.id, envios.referencia_gx into v_id, v_gx;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    if (v_p ->> 'tipo') not in ('carga', 'descarga') then raise exception 'Tipo de parada no válido.'; end if;
    v_sitio := nullif(v_p ->> 'sitio_id', '')::uuid;
    if v_sitio is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into sitios (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso)
      values (v_cliente, trim(v_p ->> 'nombre_empresa'), coalesce(nullif(v_p ->> 'tipo_sitio', '')::tipo_sitio, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''), nullif(trim(v_p ->> 'poblacion'), ''),
              nullif(trim(v_p ->> 'provincia'), ''), coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'))
      returning sitios.id into v_sitio;
      if regexp_replace(coalesce(v_p ->> 'contacto_telefono', ''), '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$' then
        insert into contactos (sitio_id, nombre, telefono, es_principal)
        values (v_sitio, nullif(trim(v_p ->> 'contacto_nombre'), ''), regexp_replace(v_p ->> 'contacto_telefono', '[^0-9+]', '', 'g'), true);
      end if;
    end if;
    if v_sitio is not null then
      -- Solo sus sitios o un almacén de Dynamo: nunca la agenda de otro cliente.
      select * into l from sitios where sitios.id = v_sitio and not borrado
         and (es_almacen_dynamo or cliente_id = v_cliente);
      if not found then raise exception 'El sitio elegido no existe o no es tuyo.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, sitio_id, nombre_empresa, direccion, codigo_postal, poblacion,
                                 provincia, pais_codigo_iso, lat, lon, referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', v_sitio, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion,
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
  perform validar_ruta_envio(v_id);
  return query select v_id, v_gx;
end $function$;

CREATE OR REPLACE FUNCTION public.enlace_carga_caduca_en(p_envio uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_dia date; v_cierre time;
begin
  select coalesce(fecha_carga_real, fecha_carga_hasta, fecha_carga_desde) into v_dia from envios where id = p_envio;
  if v_dia is null then return null; end if;
  select max(h.cierra) into v_cierre
    from envio_paradas p cross join lateral horario_del_dia(p.sitio_id, v_dia) h
   where p.envio_id = p_envio and p.tipo = 'carga' and p.sitio_id is not null;
  return ((v_dia + coalesce(v_cierre, time '23:59'))::timestamp at time zone 'Europe/Madrid')
         + make_interval(hours => p_num('enlace_carga_horas_tras_carga', 4)::int);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_almacenamientos_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a record;
begin
  if new.cliente_id is null then new.cliente_id := cliente_del_usuario(); end if;

  select es_almacen_dynamo, disponible, borrado into a from sitios where id = new.almacen_id;
  if not coalesce(a.es_almacen_dynamo, false) or a.borrado then
    raise exception 'Hay que elegir un almacen de Dynamo.';
  end if;
  -- "Completo" bloquea ALMACENAR (decisión 2026-07-08), pero solo al pedirlo: no rompe
  -- los almacenamientos que ya estaban dentro.
  if tg_op = 'INSERT' and not a.disponible then
    raise exception 'Este almacen esta COMPLETO y no admite entradas.';
  end if;

  if new.sitio_entrega_id is not null and not exists (
       select 1 from sitios where id = new.sitio_entrega_id
       and (cliente_id = new.cliente_id or es_almacen_dynamo)) then
    raise exception 'La direccion de entrega tiene que ser un sitio de este cliente.';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_clientes_sitio_defecto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.sitio_defecto_id is not null
     and new.sitio_defecto_id is distinct from old.sitio_defecto_id
     and not exists (select 1 from sitios l
                      where l.id = new.sitio_defecto_id
                        and l.cliente_id = new.id and not l.borrado) then
    raise exception 'El sitio principal tiene que ser uno de los sitios de ese cliente.'
      using errcode = '23514';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_guardar_km_sitios(p_origen uuid, p_destino uuid, p_km numeric, p_minutos integer DEFAULT NULL::integer, p_proveedor text DEFAULT 'google_routes'::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_vo integer;
  v_vd integer;
  v_id uuid;
begin
  select version_geo into v_vo from sitios where id = p_origen;
  select version_geo into v_vd from sitios where id = p_destino;

  if v_vo is null or v_vd is null then
    raise exception 'fn_guardar_km_sitios: sitio inexistente (origen=% destino=%)',
      p_origen, p_destino;
  end if;

  insert into distancias_sitios (
    sitio_origen_id, version_origen, sitio_destino_id, version_destino,
    km, minutos, proveedor
  ) values (
    p_origen, v_vo, p_destino, v_vd, p_km, p_minutos, p_proveedor
  )
  on conflict (sitio_origen_id, version_origen, sitio_destino_id, version_destino)
  do update set km        = excluded.km,
                minutos   = excluded.minutos,
                proveedor = excluded.proveedor
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_km_sitios(p_origen uuid, p_destino uuid, p_max_edad interval DEFAULT '1 year'::interval)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  select d.km
    from distancias_sitios d
    join sitios lo on lo.id = d.sitio_origen_id
                   and lo.version_geo = d.version_origen
    join sitios ld on ld.id = d.sitio_destino_id
                   and ld.version_geo = d.version_destino
   where d.sitio_origen_id  = p_origen
     and d.sitio_destino_id = p_destino
     and coalesce(d.modificado_en, d.creado_en) > now() - p_max_edad
   limit 1
$function$;

CREATE OR REPLACE FUNCTION public.fn_sitio_horarios_resumen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v uuid := coalesce(new.sitio_id, old.sitio_id);
begin
  update sitios set horarios = horario_texto(v, 'general'), horarios_verano = horario_texto(v, 'verano') where id = v
     and (horarios, horarios_verano) is distinct from (horario_texto(v, 'general'), horario_texto(v, 'verano'));
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_sitio_horarios_sin_solapes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from sitio_horarios h
              where h.sitio_id = new.sitio_id and h.temporada = new.temporada and h.dia_semana = new.dia_semana
                and h.id <> new.id and h.abre < new.cierra and new.abre < h.cierra) then
    raise exception 'Hay dos tramos del mismo dia que se pisan.' using errcode = '23P01';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_sitios_campos_dynamo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if not es_admin() and not es_servidor() then
    if new.cliente_id is distinct from old.cliente_id
       or new.es_almacen_dynamo is distinct from old.es_almacen_dynamo
       or new.disponible is distinct from old.disponible then
      raise exception 'Ese cambio solo lo puede hacer Dynamo.' using errcode = '42501';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_sitios_dueno()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.cliente_id is null and not new.es_almacen_dynamo then
    new.cliente_id := cliente_del_usuario();
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_sitios_hora_borrado()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.borrado and not old.borrado then new.borrado_en := now();
  elsif not new.borrado and old.borrado then new.borrado_en := null;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_sitios_horario_inicial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform poner_horario_por_defecto(new.id);
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_sitios_quitar_principal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.borrado and not old.borrado then
    update clientes set sitio_defecto_id = null where sitio_defecto_id = new.id;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_sitios_resumen_horario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then new.horarios := null; new.horarios_verano := null;
  else new.horarios := horario_texto(new.id, 'general'); new.horarios_verano := horario_texto(new.id, 'verano'); end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_sitios_url_mapa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (es_admin() or es_servidor()) then
    new.url_google_maps := case when tg_op = 'UPDATE' then old.url_google_maps end;
  end if;
  if new.url_google_maps is not null and new.url_google_maps !~* '^https://' then
    raise exception 'El enlace del mapa tiene que empezar por https://' using errcode = '22023';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_sitios_version_geo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- `is distinct from` y no `<>`: con NULL de por medio, `<>` da NULL (ni true ni
  -- false) y el trigger no saltaría al pasar de "sin coordenadas" a "con coordenadas".
  if new.lat is distinct from old.lat or new.lon is distinct from old.lon then
    new.version_geo := old.version_geo + 1;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_paradas_sitio_del_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.sitio_id is null then return new; end if;
  if not exists (
       select 1 from sitios l join envios e on e.id = new.envio_id
        where l.id = new.sitio_id
          and (l.es_almacen_dynamo or l.cliente_id = e.cliente_id)) then
    raise exception 'Ese sitio no es de este cliente. Usa uno de su agenda o crea uno nuevo.';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.guardar_horario(p_sitio uuid, p_tramos jsonb, p_temporada text DEFAULT 'general'::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if p_temporada not in ('general', 'verano') then raise exception 'Temporada no válida.'; end if;
  if jsonb_typeof(p_tramos) <> 'array' or (p_temporada = 'general' and jsonb_array_length(p_tramos) = 0) then
    raise exception 'El horario es obligatorio: pon al menos un día con su horario.';
  end if;
  if not exists (select 1 from sitios where id = p_sitio) then
    raise exception 'Ese sitio no existe o no es tuyo.' using errcode = '42501';
  end if;
  delete from sitio_horarios where sitio_id = p_sitio and temporada = p_temporada;
  insert into sitio_horarios (sitio_id, temporada, dia_semana, abre, cierra)
  select p_sitio, p_temporada, (t ->> 'dia')::smallint, (t ->> 'abre')::time, (t ->> 'cierra')::time
    from jsonb_array_elements(p_tramos) t;
end $function$;
revoke all on function public.guardar_horario(p_sitio uuid, p_tramos jsonb, p_temporada text) from public, anon, authenticated, service_role;
grant execute on function public.guardar_horario(p_sitio uuid, p_tramos jsonb, p_temporada text) to authenticated;
grant execute on function public.guardar_horario(p_sitio uuid, p_tramos jsonb, p_temporada text) to service_role;
comment on function public.guardar_horario(p_sitio uuid, p_tramos jsonb, p_temporada text) is '[Sitios y horarios] Sustituye entero el horario de un sitio para una temporada (borra los tramos y pone los nuevos). El general no puede quedar vacío. Los tramos de un mismo día no se pueden pisar. Quién: Dynamo o el cliente dueño del sitio (RLS). Argumentos: p_sitio: sitios.id · p_tramos: array jsonb [{dia 1-7 (1 = lunes), abre ''HH:MM'', cierra ''HH:MM''}] · p_temporada: general (por defecto) o verano.';

CREATE OR REPLACE FUNCTION public.guardar_horario_verano(p_sitio uuid, p_activo boolean, p_desde text, p_hasta text, p_tramos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from sitios where id = p_sitio) then
    raise exception 'Ese sitio no existe o no es tuyo.' using errcode = '42501';
  end if;
  if p_activo then
    if coalesce(p_desde, '') !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' or coalesce(p_hasta, '') !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
      raise exception 'Pon las fechas del horario de verano (desde y hasta).';
    end if;
    if jsonb_typeof(p_tramos) <> 'array' or jsonb_array_length(p_tramos) = 0 then
      raise exception 'Pon el horario de verano: al menos un día con su horario.';
    end if;
    perform guardar_horario(p_sitio, p_tramos, 'verano');
  end if;
  update sitios set verano_activo = coalesce(p_activo, false),
                     verano_desde = case when p_activo then p_desde else verano_desde end,
                     verano_hasta = case when p_activo then p_hasta else verano_hasta end
   where id = p_sitio;
end $function$;
revoke all on function public.guardar_horario_verano(p_sitio uuid, p_activo boolean, p_desde text, p_hasta text, p_tramos jsonb) from public, anon, authenticated, service_role;
grant execute on function public.guardar_horario_verano(p_sitio uuid, p_activo boolean, p_desde text, p_hasta text, p_tramos jsonb) to authenticated;
grant execute on function public.guardar_horario_verano(p_sitio uuid, p_activo boolean, p_desde text, p_hasta text, p_tramos jsonb) to service_role;
comment on function public.guardar_horario_verano(p_sitio uuid, p_activo boolean, p_desde text, p_hasta text, p_tramos jsonb) is '[Sitios y horarios] Activa o desactiva el horario de verano de un sitio. Si se activa, exige fechas desde/hasta (MM-DD) y al menos un tramo, y sustituye el horario de verano. Al desactivarlo se guardan las fechas anteriores pero deja de aplicarse. Quién: Dynamo o el cliente dueño del sitio (RLS). Argumentos: p_sitio: sitios.id · p_activo: encender/apagar · p_desde, p_hasta: MM-DD (p. ej. 06-15 y 09-15) · p_tramos: array jsonb [{dia 1-7, abre, cierra}].';

CREATE OR REPLACE FUNCTION public.historial_registro(p_tabla text, p_id uuid)
 RETURNS TABLE(cuando timestamp with time zone, accion text, campos text[], cambios jsonb, quien_nombre text, quien_email text, quien_tipo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_dynamo boolean := ve_todo(); v_cli uuid := cliente_del_usuario(); v_ok boolean;
begin
  if p_tabla not in ('envios', 'incidencias', 'almacenamientos', 'sitios', 'operadores') then return; end if;
  if not v_dynamo then
    if v_cli is null then return; end if;
    v_ok := case p_tabla
      when 'envios'          then exists (select 1 from envios where id = p_id and cliente_id = v_cli)
      when 'incidencias'     then exists (select 1 from incidencias where id = p_id and cliente_id = v_cli)
      when 'almacenamientos' then exists (select 1 from almacenamientos where id = p_id and cliente_id = v_cli)
      when 'sitios'         then exists (select 1 from sitios where id = p_id and cliente_id = v_cli)
      when 'operadores'      then exists (select 1 from operadores where id = p_id and cliente_id = v_cli)
    end;
    if not coalesce(v_ok, false) then return; end if;
  end if;

  return query
  with a as (
    select x.cuando, x.accion, x.quien, x.quien_email,
           case when x.accion = 'modificacion' then
             (select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(x.cambios) k
               where v_dynamo
                  or (p_tabla = 'envios' and k = any (historial_campos_cliente()))
                  or (p_tabla <> 'envios' and not (k = any (historial_campos_internos(p_tabla)))))
           else '{}'::text[] end as campos,
           x.cambios
      from auditoria x
     where (x.tabla = p_tabla or (p_tabla = 'sitios' and x.tabla = 'lugares')) and x.registro_id = p_id::text
  )
  select a.cuando, a.accion, a.campos,
         -- Antes/después: Dynamo todo; el cliente, solo de los campos que puede ver.
         case when a.accion <> 'modificacion' then null
              else (select jsonb_object_agg(k, a.cambios -> k) from unnest(a.campos) k) end,
         case when a.quien is null then 'Sistema'
              when u.rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then
                case when v_dynamo then coalesce(u.nombre, u.email) else 'Dynamo · ' || coalesce(split_part(u.nombre, ' ', 1), 'equipo') end
              when u.rol = 'transportista' then case when v_dynamo then coalesce(u.nombre, u.email) else 'Transportista' end
              else coalesce(u.nombre, a.quien_email, u.email) end,
         case when a.quien is null then null
              when u.rol = 'transportista' and not v_dynamo then null
              when u.rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') and not v_dynamo then null
              else coalesce(a.quien_email, u.email) end,
         case when a.quien is null then 'sistema'
              when u.rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then 'dynamo'
              else coalesce(u.rol::text, 'otro') end
    from a left join usuarios u on u.id = a.quien
   where a.accion <> 'modificacion' or cardinality(a.campos) > 0
   order by a.cuando desc
   limit 300;
end $function$;

CREATE OR REPLACE FUNCTION public.horario_del_dia(p_sitio uuid, p_fecha date)
 RETURNS TABLE(abre time without time zone, cierra time without time zone, temporada text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select h.abre, h.cierra, h.temporada
    from sitios l join sitio_horarios h on h.sitio_id = l.id
   where l.id = p_sitio
     and h.dia_semana = extract(isodow from p_fecha)::int
     and h.temporada = case when l.verano_activo and en_temporada(p_fecha, l.verano_desde, l.verano_hasta) then 'verano' else 'general' end
   order by h.abre
$function$;
revoke all on function public.horario_del_dia(p_sitio uuid, p_fecha date) from public, anon, authenticated, service_role;
grant execute on function public.horario_del_dia(p_sitio uuid, p_fecha date) to authenticated;
grant execute on function public.horario_del_dia(p_sitio uuid, p_fecha date) to service_role;
comment on function public.horario_del_dia(p_sitio uuid, p_fecha date) is '[Sitios y horarios] Horario de un sitio un día concreto (el de verano si lo tiene activo y cae en sus fechas). Devuelve los tramos abre/cierra y la temporada usada. Vacío = cerrado o sin horario. Quién: cualquier usuario con acceso al sitio (RLS). Argumentos: p_sitio: sitios.id · p_fecha: día (date).';

CREATE OR REPLACE FUNCTION public.horario_sitio_txt(p_sitio uuid, p_fecha date)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case when l.verano_activo and p_fecha is not null and l.horarios_verano is not null
                   and en_temporada(p_fecha, l.verano_desde, l.verano_hasta)
              then l.horarios_verano || ' (horario de verano)'
              else l.horarios end
    from sitios l where l.id = p_sitio
$function$;
revoke all on function public.horario_sitio_txt(p_sitio uuid, p_fecha date) from public, anon, authenticated, service_role;
grant execute on function public.horario_sitio_txt(p_sitio uuid, p_fecha date) to authenticated;
grant execute on function public.horario_sitio_txt(p_sitio uuid, p_fecha date) to service_role;
comment on function public.horario_sitio_txt(p_sitio uuid, p_fecha date) is '[Sitios y horarios] Horario de un sitio en texto libre para una fecha: el texto de verano (con «(horario de verano)») si aplica, o el general. Quién: cualquier usuario con acceso al sitio (RLS). Argumentos: p_sitio: sitios.id · p_fecha: día (opcional).';

CREATE OR REPLACE FUNCTION public.horario_texto(p_sitio uuid, p_temporada text DEFAULT 'general'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  letras text[] := array['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  dia int; t text; prev text := null; desde int := null; hasta int := null;
  partes text[] := '{}';
begin
  for dia in 1..8 loop
    if dia <= 7 then
      select string_agg(to_char(abre, 'FMHH24:MI') || '-' || to_char(cierra, 'FMHH24:MI'), ' y ' order by abre)
        into t from sitio_horarios where sitio_id = p_sitio and temporada = p_temporada and dia_semana = dia;
    else
      t := '#fin';
    end if;
    if t is distinct from prev then
      if prev is not null then
        partes := partes || (letras[desde] || case when hasta > desde then '-' || letras[hasta] else '' end || ' ' || prev);
      end if;
      prev := t; desde := dia;
    end if;
    hasta := dia;
  end loop;
  return nullif(array_to_string(partes, ' · '), '');
end $function$;
revoke all on function public.horario_texto(p_sitio uuid, p_temporada text) from public, anon, authenticated, service_role;
grant execute on function public.horario_texto(p_sitio uuid, p_temporada text) to service_role;

CREATE OR REPLACE FUNCTION public.marcar_sitio_principal(p_cliente uuid, p_sitio uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (es_admin() or p_cliente = cliente_del_usuario()) then
    raise exception 'No tienes permiso para hacer esto.' using errcode = '42501';
  end if;
  update clientes set sitio_defecto_id = p_sitio where id = p_cliente;
  if not found then
    raise exception 'Ese cliente no existe.' using errcode = 'P0002';
  end if;
end $function$;
revoke all on function public.marcar_sitio_principal(p_cliente uuid, p_sitio uuid) from public, anon, authenticated, service_role;
grant execute on function public.marcar_sitio_principal(p_cliente uuid, p_sitio uuid) to authenticated;
grant execute on function public.marcar_sitio_principal(p_cliente uuid, p_sitio uuid) to service_role;
comment on function public.marcar_sitio_principal(p_cliente uuid, p_sitio uuid) is '[Sitios y horarios] Estrella de la pantalla Sitios: fija el sitio principal (por defecto) del cliente. Quién: Dynamo o el propio cliente. Argumentos: p_cliente: clientes.id · p_sitio: sitios.id (null = quitar).';

CREATE OR REPLACE FUNCTION public.oferta_publica(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'tipo_sitio', l.tipo, 'horarios', horario_sitio_txt(l.id, coalesce((p.fecha_desde at time zone 'Europe/Madrid')::date, case when p.tipo = 'carga' then e.fecha_carga_desde else coalesce(e.fecha_entrega_estimada, e.fecha_carga_desde) end)),
        'requiere_cita', coalesce(l.requiere_cita, false), 'tiene_medios_carga', coalesce(l.tiene_medios_carga, true))
        order by p.orden), '[]'::jsonb)
      from envio_paradas p left join sitios l on l.id = p.sitio_id where p.envio_id = e.id)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.paradas_json(p_envio uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'orden', p.orden, 'tipo', p.tipo, 'sitio_id', p.sitio_id,
           'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion,
           'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion,
           'provincia', p.provincia, 'pais_codigo_iso', p.pais_codigo_iso,
           'lat', p.lat, 'lon', p.lon, 'fecha_desde', p.fecha_desde,
           'fecha_hasta', p.fecha_hasta, 'hora_real', p.hora_real,
           'referencia', p.referencia, 'anotaciones', p.anotaciones)
           order by p.orden), '[]'::jsonb)
    from envio_paradas p where p.envio_id = p_envio
$function$;

CREATE OR REPLACE FUNCTION public.paradas_viaje_json(p_envio uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    left join sitios l on l.id = p.sitio_id
    left join lateral (select nombre, telefono from contactos x where x.sitio_id = p.sitio_id and x.es_principal limit 1) c on true
   where p.envio_id = p_envio
$function$;

CREATE OR REPLACE FUNCTION public.poner_horario_por_defecto(p_sitio uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into sitio_horarios (sitio_id, dia_semana, abre, cierra)
  select p_sitio, d, t.abre, t.cierra
    from generate_series(1, 4) d,
         (values (time '08:00', time '14:00'), (time '15:00', time '17:30')) t(abre, cierra)
  union all
  select p_sitio, 5, time '08:00', time '14:00'
  on conflict do nothing
$function$;
revoke all on function public.poner_horario_por_defecto(p_sitio uuid) from public, anon, authenticated, service_role;
grant execute on function public.poner_horario_por_defecto(p_sitio uuid) to service_role;
comment on function public.poner_horario_por_defecto(p_sitio uuid) is 'Horario por defecto de un sitio (decision del usuario 2026-11-03): L-J 8:00-14:00 y 15:00-17:30, V 8:00-14:00. Lo recibe todo sitio al nacer; la ficha lo cambia.';

CREATE OR REPLACE FUNCTION public.preparar_pines_envio(p_envio uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  if exists (select 1 from envios where id = p_envio and operador_id is not null) then
    return 0;
  end if;
  insert into envio_parada_pines (parada_id, envio_id, pin)
  select p.id, p.envio_id, pin_aleatorio((parametro('pin_cifras'))::int)
    from envio_paradas p
    join envios   e on e.id = p.envio_id
    join clientes c on c.id = e.cliente_id
    left join sitios l on l.id = p.sitio_id
   where p.envio_id = p_envio
     and (c.exige_pin or coalesce(l.exige_pin, false))
     and not exists (select 1 from envio_parada_pines x where x.parada_id = p.id);
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.sitio_principal(p_cliente uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.sitio_defecto_id from clientes c
   where c.id = p_cliente and (ve_todo() or c.id = cliente_del_usuario())
$function$;

CREATE OR REPLACE FUNCTION public.tarifa_almacen(p_almacen uuid)
 RETURNS TABLE(semana numeric, reparto numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(l.precio_almacenamiento_semana,
                  (select (valor #>> '{}')::numeric from parametros where clave = 'almacen_precio_semana'), 240),
         coalesce(l.precio_reparto,
                  (select (valor #>> '{}')::numeric from parametros where clave = 'almacen_precio_reparto'), 220)
    from sitios l where l.id = p_almacen
$function$;

-- ---- Descripciones (diccionario) ------------------------------------------------------
comment on function public.cambiar_ruta_envio(p_envio uuid, p_paradas jsonb) is '[Envíos] Reescribe las paradas de un envío antes de cargar: mantiene las que llegan con id, borra las que faltan y crea las nuevas (de un sitio guardado o a mano; opcionalmente las guarda en la agenda del cliente). De 2 a 4 puntos. No si ya cargó o el CMR tiene firmas. Valida la ruta y deja un hito con el antes y el después. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_paradas: array jsonb en orden; cada parada {id (si se mantiene), tipo carga|descarga, sitio_id, o nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, guardar_en_agenda, tipo_sitio; referencia, anotaciones}.';
comment on function public.crear_envio(p_envio jsonb, p_paradas jsonb) is '[Envíos] Dynamo crea un envío completo para un cliente con sus paradas en una sola operación y lo deja programado (al confirmar se comprueban ruta y zonas y se sellan los hitos). Puede fijar precio de cliente y de transportista. Devuelve id y referencia GX. Quién: Dynamo (admin o empleado). Argumentos: p_envio: jsonb {cliente_id (obligatorio), referencia_cliente, fecha_carga_desde, fecha_carga_hasta, descripcion_mercancia, toneladas, metros_lineales, paletizado, carga_lateral/trasera/superior, plataforma_elevadora, nima_requerido, adr, importe_cliente, importe_transportista (sin IVA), iva_aplicado, discrecion_comercial, anotaciones_cliente} · p_paradas: array de 2 a 4 paradas {tipo carga|descarga, sitio_id o datos de dirección, guardar_en_agenda, referencia, anotaciones}.';
comment on function public.crear_envio_manual(p_envio jsonb, p_paradas jsonb) is '[Envíos] El cliente crea un envío «manual»: lo mueve con su propio operador de transporte (no lo gestiona Dynamo), para tener sus papeles y seguimiento en la plataforma. Fecha de recogida de hoy en adelante. Queda programado. Devuelve id y referencia GX. Quién: cliente (usuario activo de un cliente). Argumentos: p_envio: jsonb {operador_id (uno de sus operadores, obligatorio), fecha_carga_desde, fecha_carga_hasta, referencia_cliente, mercancía, toneladas, metros_lineales, opciones de carga, precio_acordado_operador, discrecion_comercial, anotaciones_cliente (máx. 1000)} · p_paradas: array de 2 a 4 {tipo, sitio_id o dirección, guardar_en_agenda, contacto_nombre, contacto_telefono, referencia}.';
comment on function public.crear_solicitud_envio(p_envio jsonb, p_paradas jsonb) is '[Envíos] El cliente pide un envío a Dynamo: queda en borrador con la solicitud pendiente de precio, hasta que Dynamo proponga uno (proponer_precio_solicitud). Fecha de recogida a partir de mañana; 2 a 4 paradas; valida la ruta. Devuelve id y referencia GX. Quién: cliente (usuario activo de un cliente). Argumentos: p_envio: jsonb {fecha_carga_desde, fecha_carga_hasta, referencia_cliente, descripcion_mercancia, toneladas, metros_lineales, paletizado, carga_*, plataforma_elevadora, nima_requerido, adr, discrecion_comercial, anotaciones_cliente} · p_paradas: array de 2 a 4 {tipo, sitio_id o dirección, guardar_en_agenda, contacto_nombre, contacto_telefono, referencia, anotaciones}.';
comment on function public.fn_guardar_km_sitios(p_origen uuid, p_destino uuid, p_km numeric, p_minutos integer, p_proveedor text) is '[Distancias y cobertura] Guarda en la caché los km entre dos sitios guardados, sellando la versión de su ubicación (si luego se mueve un sitio, la distancia deja de valer). Devuelve el id. Las reglas por fila no dejan escribir a usuarios: en la práctica solo el servidor. Quién: servidor (con sesión lo frena RLS). Argumentos: p_origen, p_destino: sitios.id · p_km · p_minutos (opcional) · p_proveedor (por defecto google_routes).';
comment on function public.fn_km_sitios(p_origen uuid, p_destino uuid, p_max_edad interval) is '[Distancias y cobertura] Km guardados en la caché entre dos sitios, solo si ninguno se ha movido desde que se calculó; null si no hay o son demasiado viejos. Quién: Dynamo y servidor (RLS: los demás reciben null). Argumentos: p_origen, p_destino: sitios.id · p_max_edad: antigüedad máxima (por defecto 12 meses).';
comment on function public.fn_sitios_version_geo() is 'Sube sitios.version_geo cuando cambian las coordenadas, para invalidar la caché de distancias sin tener que borrar filas.';
comment on function public.historial_registro(p_tabla text, p_id uuid) is '[Avisos y panel] Historial de cambios de una ficha (alta, modificaciones con antes/después, borrado), los más recientes primero (máx. 300). Dynamo lo ve todo; el cliente solo de sus fichas y de los campos que puede ver, y sin nombres de Dynamo ni del transportista. Quién: Dynamo (también solo lectura) o cliente dueño de la ficha. Argumentos: p_tabla: envios, incidencias, almacenamientos, sitios u operadores · p_id: id de la ficha.';
comment on table public.distancias_sitios is 'Caché de km de Google entre dos sitios de la agenda (pareja dirigida A→B + version_geo de cada extremo): al mudarse un sitio la fila vieja deja de valer sola. Las viejas no se borran: justifican con qué km se tarificó cada envío. Solo la escribe el servidor con fn_guardar_km_sitios(); se lee con fn_km_sitios().';
comment on table public.sitio_horarios is 'Horario de cada sitio: una fila por día de la semana y tramo (un día partido son dos filas). Día sin filas = cerrado. Temporada general o de verano. Sirve para horas de llegada y avisos de sitio cerrado. Se guarda con guardar_horario() / guardar_horario_verano(), no fila a fila.';
comment on table public.sitios is 'Agenda de sitios de carga y descarga (almacenes, naves, obras, fincas…). Cada ficha es de un cliente, salvo los almacenes de Dynamo (de nadie, los ven todos). Se escribe directamente; el horario con guardar_horario() / guardar_horario_verano() y la estrella de sitio principal con marcar_sitio_principal().';
comment on table public.recargos_tipo_sitio is 'Catálogo con vigencia del recargo del tarifador según el tipo de sitio (almacén, obra, finca…). Una fila por tipo y fecha de inicio; un cambio de porcentaje es una fila nueva para que lo antiguo se recalcule con el de entonces. Solo Dynamo. Porcentajes provisionales: aún no lo usa ninguna función.';
comment on column public.clientes.sitio_defecto_id is 'formato: uuid | → sitios.id | rango: no aplica | lista: no aplica | opcional | Sitio principal del cliente (la estrella de Sitios) → sitios.id; tiene que ser un sitio suyo. Se pone con marcar_sitio_principal() y se quita solo al borrar el sitio.';
comment on column public.almacenamientos.almacen_id is 'formato: uuid | → sitios.id | rango: no aplica | lista: no aplica | obligatorio | Almacén de Dynamo donde se guarda (→ sitios.id con es_almacen_dynamo, no borrado). Si está Completo no admite altas nuevas.';
comment on column public.almacenamientos.num_repartos is 'formato: número entero | rango: 0 a 20 | lista: no aplica | obligatorio | Repartos urbanos posteriores desde el almacén (0 = recoge el cliente). Si es mayor que 0, hace falta sitio_entrega_id. Ej. OK: 3 · Ej. mal: 25';
comment on column public.almacenamientos.sitio_entrega_id is 'formato: uuid | → sitios.id | rango: no aplica | lista: no aplica | opcional | Sitio de entrega de los repartos (→ sitios.id, del mismo cliente o almacén Dynamo). Obligatorio si num_repartos > 0 y vacío si es 0.';
comment on column public.clientes.exige_pin is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | opcional | Si es true, todos los puntos de carga y descarga de sus envíos exigen que el conductor valide un PIN. También se puede activar solo por sitio (sitios.exige_pin).';
comment on column public.contactos.cliente_id is 'formato: uuid | → clientes.id | rango: no aplica | lista: no aplica | opcional | Cliente al que pertenece → clientes.id. Hay que rellenar exactamente uno de cliente_id, transportista_id o sitio_id. Se borra con el cliente.';
comment on column public.contactos.transportista_id is 'formato: uuid | → transportistas.id | rango: no aplica | lista: no aplica | opcional | Transportista al que pertenece → transportistas.id. Exactamente uno de cliente_id, transportista_id o sitio_id. Se borra con el transportista.';
comment on column public.contactos.sitio_id is 'formato: uuid | → sitios.id | rango: no aplica | lista: no aplica | opcional | Sitio al que pertenece (la persona de esa nave) → sitios.id. Exactamente uno de cliente_id, transportista_id o sitio_id. Se borra con el sitio.';
comment on column public.distancias_sitios.sitio_origen_id is 'formato: uuid | → sitios.id | rango: no aplica | lista: no aplica | obligatorio | Sitio de salida del tramo (→ sitios.id). A→B y B→A se guardan aparte.';
comment on column public.distancias_sitios.version_origen is 'formato: número entero | rango: no aplica | lista: no aplica | automático | version_geo del sitio de origen cuando se pidieron los km. La pone fn_guardar_km_sitios() leyendo la actual.';
comment on column public.distancias_sitios.sitio_destino_id is 'formato: uuid | → sitios.id | rango: no aplica | lista: no aplica | obligatorio | Sitio de llegada del tramo (→ sitios.id); distinto del origen.';
comment on column public.distancias_sitios.version_destino is 'formato: número entero | rango: no aplica | lista: no aplica | automático | version_geo del sitio de destino cuando se pidieron los km. La pone fn_guardar_km_sitios().';
comment on column public.envio_paradas.sitio_id is 'formato: uuid | → sitios.id | rango: no aplica | lista: no aplica | opcional | Sitio de la agenda del cliente o almacén de Dynamo del que sale la dirección (→ sitios.id). Vacío si la dirección se escribió suelta.';
comment on column public.sitio_horarios.sitio_id is 'formato: uuid | → sitios.id | rango: no aplica | lista: no aplica | obligatorio | Sitio al que pertenece el horario (→ sitios.id).';
comment on column public.sitios.tipo is 'formato: lista cerrada (tipo_sitio) | rango: no aplica | lista: almacen_nave, obra_zona_amplia, obra_zona_urbana, finca | obligatorio | Tipo de sitio. De él depende el recargo del tarifador (ver recargos_tipo_sitio). Por defecto almacén/nave.';
comment on column public.sitios.horarios is 'formato: texto | rango: no aplica | lista: no aplica | automático | Resumen legible del horario general, sacado de sitio_horarios. Lo escribe la base de datos: lo que se escriba a mano se sustituye. Ej. OK: L-J 8:00-14:00 y 15:00-17:30 · V 8:00-14:00';
comment on column public.sitios.version_geo is 'formato: número entero | rango: entero desde 1 | lista: no aplica | automático | Versión de las coordenadas: sube sola cuando cambian lat/lon (la empresa se muda). Forma parte de la clave de distancias_sitios, así los km viejos dejan de valer. No tocar a mano.';
comment on column public.sitios.verano_activo is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | opcional | El sitio usa horario de verano (sitio_horarios temporada verano) entre verano_desde y verano_hasta, cada año. Se cambia con guardar_horario_verano().';
comment on column public.sitios.horarios_verano is 'formato: texto | rango: no aplica | lista: no aplica | automático | Resumen legible del horario de verano, sacado de sitio_horarios. Lo escribe la base de datos. Ej. OK: L-V 7:30-15:00';
comment on column public.recargos_tipo_sitio.tipo is 'formato: lista cerrada (tipo_sitio) | rango: no aplica | lista: almacen_nave, obra_zona_amplia, obra_zona_urbana, finca | obligatorio | Tipo de sitio al que se aplica el recargo (el mismo que sitios.tipo). Junto con vigente_desde es la clave.';
comment on type public.tipo_sitio is 'Tipo de punto de carga/descarga: almacen_nave (Almacén / Nave / Campa), obra_zona_amplia, obra_zona_urbana y finca (zona agrícola o rústica). De aquí cuelga el recargo del tarifador: ver recargos_tipo_sitio.';
