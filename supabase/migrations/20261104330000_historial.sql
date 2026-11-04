-- =====================================================================================
-- HISTORIAL: QUIÉN HIZO QUÉ Y CUÁNDO, A LA VISTA (usuario, 2026-11-04)
-- «Que todos vean quién toca cosas»: en cada ficha (envío, incidencia, almacenamiento,
-- sitio, transportista propio del cliente) el historial con fecha y hora, la acción
-- (creado, cambio de estado, cancelado, modificado: qué campos) y quién (nombre y email).
-- Sale de la auditoría, que ya guarda cada alta, cambio y baja (append-only).
--
-- Lo ve Dynamo (todo) y el CLIENTE dueño del registro, con dos límites:
--   · de los envíos, solo los campos que el cliente ya ve (nunca el precio del
--     transportista, márgenes ni notas internas);
--   · quién: sus compañeros con nombre y email; el equipo de Dynamo como «Dynamo · nombre»;
--     un transportista solo como «Transportista» (sin datos de contacto).
-- =====================================================================================

-- Campos de un envío que el cliente puede ver cambiar.
create or replace function historial_campos_cliente()
returns text[] language sql immutable as $$
  select array['estado', 'fecha_carga_desde', 'fecha_carga_hasta', 'fecha_carga_real', 'fecha_entrega_estimada',
               'referencia_cliente', 'descripcion_mercancia', 'metros_lineales', 'toneladas', 'tipo_carga', 'paletizado',
               'numero_bultos', 'embalaje', 'volumen_m3', 'importe_cliente', 'anotaciones_cliente', 'discrecion_comercial',
               'matricula_camion', 'matricula_remolque', 'solicitud_estado', 'pago_previo', 'cambio_cliente_estado',
               'adr', 'nima_requerido', 'plataforma_elevadora', 'carga_lateral', 'carga_trasera', 'carga_superior']
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
               where v_dynamo or p_tabla <> 'envios' or k = any (historial_campos_cliente()))
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

-- Para la lista de envíos del cliente: quién creó cada uno y quién lo tocó por última vez.
create or replace function autores_mis_envios()
returns table (envio_id uuid, creado_por text, creado_email text, modificado_por text, modificado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id,
         coalesce(c.nombre, c.email), c.email,
         case when m.rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then 'Dynamo'
              when m.rol = 'transportista' then 'Transportista'
              else coalesce(m.nombre, m.email) end,
         e.modificado_en
    from envios e
    left join usuarios c on c.id = e.creado_por
    left join usuarios m on m.id = e.modificado_por
   where e.cliente_id = cliente_del_usuario()
$$;
revoke execute on function autores_mis_envios() from public, anon;
grant execute on function autores_mis_envios() to authenticated;
