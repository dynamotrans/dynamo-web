-- =====================================================================================
-- PROTECCIÓN DE DATOS: BUSCAR A UNA PERSONA EN TODA LA PLATAFORMA (2026-11-05)
-- Para atender una petición RGPD («borrad mis datos», «qué tenéis de mí»): con un email,
-- un teléfono, un DNI o un nombre, salen todas sus fichas — cuenta de usuario, fichas de
-- contacto (de clientes, transportistas y sitios) y conductor —, para exportarlas o
-- anonimizarlas desde la pantalla «Protección de datos». Solo el Admin Master.
-- =====================================================================================

create or replace function buscar_persona(p_texto text)
returns table (tipo text, id uuid, nombre text, email text, telefono text, documento text, empresa text, estado text)
language plpgsql stable security definer set search_path = public as $$
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
                    (select nombre_empresa from lugares where id = c.lugar_id)),
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
end $$;
revoke execute on function buscar_persona(text) from public, anon;
grant execute on function buscar_persona(text) to authenticated;
