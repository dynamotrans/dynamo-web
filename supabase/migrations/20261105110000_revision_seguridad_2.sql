-- =====================================================================================
-- SEGUNDA REVISIÓN DE SEGURIDAD (cambios del 4 y 5 de noviembre) — 2026-11-05
--  1. Historial: en almacenamientos (y el resto de tablas que no son envíos) el cliente
--     veía el antes/después de TODOS los campos, y la auditoría anterior al 04-11 guarda
--     las notas internas de Dynamo. Ahora, para quien no es Dynamo, se quitan los campos
--     internos de cada tabla (historial_campos_internos).
--  2. Exportar mis datos: las firmas del CMR se cruzan por el email que teclea quien firma
--     (no verificado): ya no se exporta su nombre ni su documento, solo fecha y papel.
--  3. horario_del_dia / horario_sitio_txt: leían el horario de cualquier sitio. Pasan a
--     los permisos de quien llama (la seguridad por filas de lugares ya filtra). Dentro de
--     las funciones del sistema que los usan siguen funcionando igual.
--  4. Las fechas genéricas del verano de los almacenes no las podía leer un cliente
--     (Parámetros es solo de Dynamo): nueva verano_sitios_fechas().
-- =====================================================================================

create or replace function historial_campos_internos(p_tabla text)
returns text[] language sql immutable as $$
  select case p_tabla
    when 'almacenamientos' then array['anotaciones']
    else array[]::text[] end
$$;

create or replace function historial_registro(p_tabla text, p_id uuid)
returns table (cuando timestamptz, accion text, campos text[], cambios jsonb, quien_nombre text, quien_email text, quien_tipo text)
language plpgsql stable security definer set search_path = public as $$
declare v_dynamo boolean := ve_todo(); v_cli uuid := cliente_del_usuario(); v_ok boolean;
begin
  if p_tabla not in ('envios', 'incidencias', 'almacenamientos', 'lugares', 'operadores') then return; end if;
  if not v_dynamo then
    if v_cli is null then return; end if;
    v_ok := case p_tabla
      when 'envios'          then exists (select 1 from envios where id = p_id and cliente_id = v_cli)
      when 'incidencias'     then exists (select 1 from incidencias where id = p_id and cliente_id = v_cli)
      when 'almacenamientos' then exists (select 1 from almacenamientos where id = p_id and cliente_id = v_cli)
      when 'lugares'         then exists (select 1 from lugares where id = p_id and cliente_id = v_cli)
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
     where x.tabla = p_tabla and x.registro_id = p_id::text
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
end $$;
revoke execute on function historial_registro(text, uuid) from public, anon;
grant execute on function historial_registro(text, uuid) to authenticated;

create or replace function exportar_datos_usuario(p_usuario uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := coalesce(p_usuario, auth.uid()); u usuarios%rowtype;
begin
  if v is null then raise exception 'Sin sesión.' using errcode = '42501'; end if;
  if v <> auth.uid() and not ve_todo() then raise exception 'Solo tus datos.' using errcode = '42501'; end if;
  select * into u from usuarios where id = v;
  if not found then return null; end if;
  return jsonb_build_object(
    'generado_en', now(),
    'responsable', jsonb_build_object('empresa', (select valor #>> '{}' from parametros where clave = 'dynamo_razon_social'),
                                      'contacto', 'info@dynamotrans.com'),
    'cuenta', jsonb_build_object('email', u.email, 'nombre', u.nombre, 'telefono', u.telefono, 'documento', u.documento,
                                 'cargo', u.cargo, 'idioma', u.idioma, 'rol', u.rol, 'estado', u.estado,
                                 'suspension_motivo', u.suspension_motivo, 'creado_en', u.creado_en, 'ultima_conexion', u.ultima_conexion,
                                 'copias_avisos', u.copias_avisos),
    'empresa', coalesce((select jsonb_build_object('tipo', 'cliente', 'nombre', nombre_visible, 'cif', cif) from clientes where id = u.cliente_id),
                        (select jsonb_build_object('tipo', 'transportista', 'nombre', nombre_visible, 'cif', cif) from transportistas where id = u.transportista_id)),
    'como_contacto', coalesce((select jsonb_agg(jsonb_build_object('nombre', c.nombre, 'cargo', c.cargo, 'telefono', c.telefono, 'email', c.email, 'recibe_avisos', c.recibe_avisos))
                                 from contactos c where lower(c.email) = lower(u.email)), '[]'),
    'envios_creados', coalesce((select jsonb_agg(jsonb_build_object('referencia', e.referencia_gx, 'creado_en', e.creado_en, 'estado', e.estado,
                                   'fecha_carga', e.fecha_carga_desde) order by e.creado_en)
                                 from envios e where e.creado_por = v), '[]'),
    -- Firmas del CMR con su email: solo fecha y papel (el email lo teclea quien firma y no
    -- se verifica: el nombre y el documento podrían ser de otra persona).
    'firmas_cmr_con_tu_email', coalesce((select jsonb_agg(jsonb_build_object('firmado_en', f.firmado_en, 'papel', f.rol))
                              from firmas_cmr f where u.email is not null and lower(f.email) = lower(u.email)), '[]'),
    'consultas_precio_12_meses', (select count(*) from consultas_precio where usuario_id = v),
    'tiempo_conectado_12_meses', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'minutos', minutos) order by dia)
                                             from conexion_minutos where usuario_id = v), '[]'),
    'nota', 'Esto es lo que la plataforma de Dynamo guarda sobre ti. Las anotaciones internas del equipo y los registros de seguridad se facilitan a petición por email a info@dynamotrans.com.'
  );
end $$;
revoke execute on function exportar_datos_usuario(uuid) from public, anon;
grant execute on function exportar_datos_usuario(uuid) to authenticated;

create or replace function horario_del_dia(p_lugar uuid, p_fecha date)
returns table (abre time, cierra time, temporada text)
language sql stable security invoker set search_path = public as $$
  select h.abre, h.cierra, h.temporada
    from lugares l join lugar_horarios h on h.lugar_id = l.id
   where l.id = p_lugar
     and h.dia_semana = extract(isodow from p_fecha)::int
     and h.temporada = case when l.verano_activo and en_temporada(p_fecha, l.verano_desde, l.verano_hasta) then 'verano' else 'general' end
   order by h.abre
$$;

create or replace function horario_sitio_txt(p_lugar uuid, p_fecha date)
returns text language sql stable security invoker set search_path = public as $$
  select case when l.verano_activo and p_fecha is not null and l.horarios_verano is not null
                   and en_temporada(p_fecha, l.verano_desde, l.verano_hasta)
              then l.horarios_verano || ' (horario de verano)'
              else l.horarios end
    from lugares l where l.id = p_lugar
$$;

create or replace function verano_sitios_fechas()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'desde', coalesce((select valor #>> '{}' from parametros where clave = 'verano_sitios_desde'), '05-25'),
    'hasta', coalesce((select valor #>> '{}' from parametros where clave = 'verano_sitios_hasta'), '09-15'))
$$;
revoke execute on function verano_sitios_fechas() from public, anon;
grant execute on function verano_sitios_fechas() to authenticated;
