-- =====================================================================================
-- FILTROS DE LA LISTA DE ENVÍOS, COMO EL MOCKUP (v1.0, usuario 2026-11-08)
-- =====================================================================================
-- La barra de la pantalla de Envíos gana los filtros del mockup: Operador (Dynamo o un
-- operador propio del cliente), Creado por (usuario que dio de alta el envío), Estado
-- (fase del envío o estado del vehículo, solo en Programadas) y Fecha (hoy, mañana,
-- esta semana, un mes…). Para que funcionen con la paginación y el volumen, filtran EN
-- LA BASE DE DATOS: envios_pagina y buscar_envios_pagina ganan parámetros opcionales.
--
-- · p_operador: 'dynamo' (envíos de Dynamo, operador_id vacío) o el uuid de un operador.
-- · p_creado_por: usuarios.id de quien creó el envío.
-- · p_estado: 'programado' | 'hacia_la_carga' | 'cargando' | 'en_ruta' (estado del envío)
--   o 'veh:confirmada' | 'veh:sin_asignar' (estado de la asignación del vehículo).
-- · p_desde / p_hasta: rango sobre la fecha de carga EFECTIVA (envios.fecha_efectiva:
--   real → prevista → primer día de ventana → creación), la misma del cuadro de mando.
-- Las pestañas (envios_pestanas) no cambian: sus contadores son globales, como el mockup.
--
-- Añadir parámetros con valor por defecto crea OTRA función con el mismo nombre, así que
-- primero se quitan las firmas viejas para que ninguna llamada quede ambigua.
-- =====================================================================================


-- =====================================================================================
-- 1. envios_pagina CON LOS FILTROS
-- =====================================================================================
drop function if exists envios_pagina(text, integer, integer, uuid, uuid);
create or replace function envios_pagina(p_pestana text, p_pagina integer default 1, p_por_pagina integer default 20,
  p_cliente uuid default null, p_transportista uuid default null,
  p_operador text default null, p_creado_por uuid default null, p_estado text default null,
  p_desde date default null, p_hasta date default null)
returns table (id uuid, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare a record;
  v_por int := least(greatest(coalesce(p_por_pagina, 20), 1), 200);
  v_off int := (greatest(coalesce(p_pagina, 1), 1) - 1) * least(greatest(coalesce(p_por_pagina, 20), 1), 200);
begin
  select * into a from envios_lista_ambito(p_cliente, p_transportista);
  if not a.v_ok then return; end if;
  return query
  select e.id, count(*) over ()
    from envios e
   where (a.v_cli is null or e.cliente_id = a.v_cli)
     and (a.v_tra is null or e.transportista_id = a.v_tra)
     and case p_pestana
           when 'todas' then true
           when 'entregada' then e.estado = 'entregado'
           when 'cancelada' then e.estado = 'cancelado'
           when 'solicitudes' then e.estado = 'borrador' and e.estado_solicitud in ('pendiente_precio', 'precio_propuesto', 'contraoferta')
           when 'sin-pagar' then e.estado = 'programado' and e.estado_pago_previo = 'pendiente'
           when 'sin-asignar' then e.estado = 'programado' and e.operador_id is null and e.transportista_id is null
                                   and e.estado_pago_previo is distinct from 'pendiente'
           when 'programada' then e.estado in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta')
                                  or (e.estado = 'borrador' and coalesce(e.estado_solicitud, '') not in ('pendiente_precio', 'precio_propuesto', 'contraoferta'))
           else false end
     and (p_operador is null
          or (p_operador = 'dynamo' and e.operador_id is null)
          or (p_operador ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and e.operador_id = p_operador::uuid))
     and (p_creado_por is null or e.creado_por = p_creado_por)
     and (p_estado is null
          or (p_estado in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta') and e.estado = p_estado::estado_envio)
          or (p_estado = 'veh:confirmada' and e.estado_asignacion = 'confirmada')
          or (p_estado = 'veh:sin_asignar' and e.estado_asignacion = 'sin_asignar' and e.estado = 'programado'))
     and (p_desde is null or e.fecha_efectiva >= p_desde)
     and (p_hasta is null or e.fecha_efectiva <= p_hasta)
   order by e.creado_en desc, e.id
   offset v_off limit v_por;
end $$;
revoke execute on function envios_pagina(text, integer, integer, uuid, uuid, text, uuid, text, date, date) from public, anon;
grant execute on function envios_pagina(text, integer, integer, uuid, uuid, text, uuid, text, date, date) to authenticated;
comment on function public.envios_pagina(text, integer, integer, uuid, uuid, text, uuid, text, date, date) is
  '[Envíos] Una página de la lista de Envíos ya filtrada por la base de datos: pestaña (todas, entregada, cancelada, solicitudes, sin-pagar, sin-asignar, programada) y, opcionales, operador (''dynamo'' o un operadores.id), quien lo creó, estado (programado | hacia_la_carga | cargando | en_ruta | veh:confirmada | veh:sin_asignar) y rango de la fecha de carga efectiva. Devuelve ids y el total con esos filtros. Quién: Dynamo ve todo; un cliente o transportista, lo suyo. Argumentos: p_pestana · p_pagina · p_por_pagina (máx 200) · p_cliente/p_transportista (solo Dynamo) · p_operador · p_creado_por · p_estado · p_desde · p_hasta.';


-- =====================================================================================
-- 2. buscar_envios_pagina CON LOS MISMOS FILTROS
-- =====================================================================================
drop function if exists buscar_envios_pagina(text, date, date, integer, integer, uuid, uuid);
create or replace function buscar_envios_pagina(
  p_q text default null, p_desde date default null, p_hasta date default null,
  p_pagina integer default 1, p_por_pagina integer default 100,
  p_cliente uuid default null, p_transportista uuid default null,
  p_operador text default null, p_creado_por uuid default null, p_estado text default null)
returns table (id uuid, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_pal text[];
  v_cli uuid; v_tra uuid; v_quien text;
  v_por int := least(greatest(coalesce(p_por_pagina, 100), 1), 500);
  v_off int := (greatest(coalesce(p_pagina, 1), 1) - 1) * least(greatest(coalesce(p_por_pagina, 100), 1), 500);
begin
  -- La palabra más larga, primero: es la que usa el índice.
  select coalesce(array_agg('%' || replace(replace(replace(lower(unaccent_simple(w)), '\', '\\'), '%', '\%'), '_', '\_') || '%' order by length(w) desc), '{}')
    into v_pal
    from unnest(regexp_split_to_array(trim(coalesce(p_q, '')), '\s+')) w where length(w) > 0;
  if cardinality(v_pal) = 0 and p_desde is null and p_hasta is null
     and p_operador is null and p_creado_por is null and p_estado is null then return; end if;

  if ve_todo() then
    v_quien := 'dynamo'; v_cli := p_cliente; v_tra := p_transportista;
  elsif cliente_del_usuario() is not null then
    v_quien := 'cliente'; v_cli := cliente_del_usuario();
  elsif transportista_del_usuario() is not null then
    v_quien := 'transportista'; v_tra := transportista_del_usuario();
  else
    return;
  end if;

  if v_quien = 'dynamo' and cardinality(v_pal) > 0 then
    -- Dynamo: con el índice de texto (la palabra más larga) y el resto comprobadas después.
    return query
    select e.id, count(*) over ()
      from envios e
     where e.texto_busqueda like v_pal[1] and e.texto_busqueda like all (v_pal)
       and (v_cli is null or e.cliente_id = v_cli)
       and (v_tra is null or e.transportista_id = v_tra)
       and (p_desde is null or coalesce(e.fecha_carga_real, e.fecha_carga_desde) >= p_desde)
       and (p_hasta is null or coalesce(e.fecha_carga_real, e.fecha_carga_desde) <= p_hasta)
       and (p_operador is null
            or (p_operador = 'dynamo' and e.operador_id is null)
            or (p_operador ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and e.operador_id = p_operador::uuid))
       and (p_creado_por is null or e.creado_por = p_creado_por)
       and (p_estado is null
            or (p_estado in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta') and e.estado = p_estado::estado_envio)
            or (p_estado = 'veh:confirmada' and e.estado_asignacion = 'confirmada')
            or (p_estado = 'veh:sin_asignar' and e.estado_asignacion = 'sin_asignar' and e.estado = 'programado'))
     order by coalesce(e.fecha_carga_real, e.fecha_carga_desde) desc nulls last, e.creado_en desc
     offset v_off limit v_por;
  else
    -- Solo filtros (Dynamo), o cliente/transportista (sus envíos, con el texto que ve cada uno).
    return query
    select e.id, count(*) over ()
      from envios e
     where (v_cli is null or e.cliente_id = v_cli)
       and (v_tra is null or e.transportista_id = v_tra)
       and (p_desde is null or coalesce(e.fecha_carga_real, e.fecha_carga_desde) >= p_desde)
       and (p_hasta is null or coalesce(e.fecha_carga_real, e.fecha_carga_desde) <= p_hasta)
       and (p_operador is null
            or (p_operador = 'dynamo' and e.operador_id is null)
            or (p_operador ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and e.operador_id = p_operador::uuid))
       and (p_creado_por is null or e.creado_por = p_creado_por)
       and (p_estado is null
            or (p_estado in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta') and e.estado = p_estado::estado_envio)
            or (p_estado = 'veh:confirmada' and e.estado_asignacion = 'confirmada')
            or (p_estado = 'veh:sin_asignar' and e.estado_asignacion = 'sin_asignar' and e.estado = 'programado'))
       and (cardinality(v_pal) = 0 or envio_texto_propio(e, v_quien) like all (v_pal))
     order by coalesce(e.fecha_carga_real, e.fecha_carga_desde) desc nulls last, e.creado_en desc
     offset v_off limit v_por;
  end if;
end $$;
revoke execute on function buscar_envios_pagina(text, date, date, integer, integer, uuid, uuid, text, uuid, text) from public, anon;
grant execute on function buscar_envios_pagina(text, date, date, integer, integer, uuid, uuid, text, uuid, text) to authenticated;
comment on function public.buscar_envios_pagina(text, date, date, integer, integer, uuid, uuid, text, uuid, text) is
  '[Envíos] Busca envíos en TODOS los años por texto (palabras sin acentos, en cualquier orden) y/o fechas de carga, y ahora también con los filtros de la barra: operador (''dynamo'' o un operadores.id), quien lo creó y estado (como envios_pagina). Devuelve ids y el total, por páginas. Quién: Dynamo ve todo (texto completo); un cliente o transportista busca en lo suyo y solo en el texto que él ve. Argumentos: p_q · p_desde · p_hasta · p_pagina · p_por_pagina (máx 500) · p_cliente/p_transportista (solo Dynamo) · p_operador · p_creado_por · p_estado.';
