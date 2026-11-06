-- LISTAS RÁPIDAS CON VOLUMEN (2026-11-06). Encontrado al probar con los datos de prueba
-- (64.000 envíos): la lista de Envíos tardaba 4 s porque envios_pestanas() recorría la
-- tabla entera 7 veces (una por pestaña, con una función por fila) y envios_pagina()
-- filtraba también con una función por fila, que no puede usar índices. Con 60 envíos no se
-- notaba. Ahora:
--  · envios_pestanas(): UNA pasada con count(*) filter (…) y las mismas reglas de siempre
--    (envio_en_pestana sigue existiendo para quien la use);
--  · envios_pagina(): el filtro de cada pestaña escrito sobre columnas, para que entren los
--    índices (estado, creado_en), y uno nuevo para «programados sin camión»;
--  · índices que faltaban en claves ajenas (hallazgo del agente de datos de prueba): sin
--    ellos borrar un envío, vehículo o conductor recorría la tabla hija entera;
--  · índice por día de carga para el cuadro de mando.
-- Mismo resultado que antes (las pruebas 146 y 159 lo comprueban).

create or replace function envios_pestanas(p_cliente uuid default null, p_transportista uuid default null)
returns table (pestana text, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare a record; r record;
begin
  select * into a from envios_lista_ambito(p_cliente, p_transportista);
  if not a.v_ok then return; end if;
  select
    count(*) filter (where e.estado = 'borrador' and e.estado_solicitud in ('pendiente_precio', 'precio_propuesto', 'contraoferta')) as solicitudes,
    count(*) filter (where e.estado = 'programado' and e.estado_pago_previo = 'pendiente') as sin_pagar,
    count(*) filter (where e.estado = 'programado' and e.operador_id is null and e.transportista_id is null
                       and e.estado_pago_previo is distinct from 'pendiente') as sin_asignar,
    count(*) filter (where e.estado in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta')
                        or (e.estado = 'borrador' and coalesce(e.estado_solicitud, '') not in ('pendiente_precio', 'precio_propuesto', 'contraoferta'))) as programada,
    count(*) filter (where e.estado = 'entregado') as entregada,
    count(*) filter (where e.estado = 'cancelado') as cancelada,
    count(*) as todas
    into r
    from envios e
   where (a.v_cli is null or e.cliente_id = a.v_cli)
     and (a.v_tra is null or e.transportista_id = a.v_tra);
  return query values ('solicitudes', r.solicitudes), ('sin-pagar', r.sin_pagar), ('sin-asignar', r.sin_asignar),
                      ('programada', r.programada), ('entregada', r.entregada), ('cancelada', r.cancelada), ('todas', r.todas);
end $$;

create or replace function envios_pagina(p_pestana text, p_pagina integer default 1, p_por_pagina integer default 20,
  p_cliente uuid default null, p_transportista uuid default null)
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
   order by e.creado_en desc, e.id
   offset v_off limit v_por;
end $$;

-- Programados sin camión (pestaña «Sin asignar» y bandeja de hoy), por orden de creación.
create index if not exists idx_envios_sin_camion_creado on envios (creado_en desc)
  where estado = 'programado' and operador_id is null and transportista_id is null;
-- Transportista + creado (lista del transportista por páginas).
create index if not exists idx_envios_transp_creado on envios (transportista_id, creado_en desc) where transportista_id is not null;
-- Día de carga (cuadro de mando y «realizados en el periodo»).
create index if not exists idx_envios_dia_carga on envios ((coalesce(fecha_carga_real, fecha_carga_prevista, fecha_carga_desde)))
  where operador_id is null;

-- Claves ajenas sin índice (borrar un envío, un vehículo o un conductor recorría la tabla hija).
create index if not exists idx_avisos_envio on avisos (envio_id) where envio_id is not null;
create index if not exists idx_consultas_precio_envio on consultas_precio (envio_id) where envio_id is not null;
create index if not exists idx_envios_vehiculo_camion on envios (vehiculo_camion_id) where vehiculo_camion_id is not null;
create index if not exists idx_envios_vehiculo_remolque on envios (vehiculo_remolque_id) where vehiculo_remolque_id is not null;
create index if not exists idx_envios_conductor on envios (conductor_id) where conductor_id is not null;
create index if not exists idx_envio_reservas_transportista on envio_reservas (transportista_id) where transportista_id is not null;
-- Conductor por nombre (fn_envios_flota_alta busca por nombre al asignar camión).
create index if not exists idx_conductores_nombre_norm on conductores (transportista_id, lower(unaccent_simple(nombre)));
