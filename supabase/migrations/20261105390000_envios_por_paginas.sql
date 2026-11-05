-- =====================================================================================
-- LISTA DE ENVÍOS POR PÁGINAS DESDE LA BASE DE DATOS (revisión de calidad, 2026-11-05)
-- Antes la pantalla leía hasta 6.000 envíos con sus paradas y cortaba 20 en la web: con años
-- de datos se volvería lenta. Ahora la base de datos cuenta cada pestaña y da los ids de la
-- página que toca; la web lee solo esos 20. Mismas reglas que las pestañas de la web
-- (lib/envios.ts → enPestana), mismos permisos que el buscador: Dynamo todo (o el cliente /
-- transportista de «Ver como»), el cliente sus envíos, el transportista sus viajes.
-- =====================================================================================
create or replace function envio_en_pestana(e envios, p_pestana text)
returns boolean language sql stable set search_path = public as $$
  select case p_pestana
    when 'todas' then true
    when 'entregada' then e.estado = 'entregado'
    when 'cancelada' then e.estado = 'cancelado'
    when 'solicitudes' then e.estado = 'borrador' and e.estado_solicitud in ('pendiente_precio', 'precio_propuesto', 'contraoferta')
    when 'sin-pagar' then e.estado = 'programado' and e.estado_pago_previo = 'pendiente'
    when 'sin-asignar' then e.estado = 'programado' and e.operador_id is null and e.transportista_id is null
                            and e.estado_pago_previo is distinct from 'pendiente'
    when 'programada' then e.estado in ('borrador', 'programado', 'hacia_la_carga', 'cargando', 'en_ruta')
                           and not (e.estado = 'borrador' and coalesce(e.estado_solicitud, '') in ('pendiente_precio', 'precio_propuesto', 'contraoferta'))
    else false end
$$;
comment on function public.envio_en_pestana(envios, text) is '[Ayudantes internos] ¿Sale este envío en esta pestaña de la lista? Las mismas reglas que la web (solicitudes, sin-pagar, sin-asignar, programada, entregada, cancelada, todas). Quién: interno. Argumentos: e: la fila del envío · p_pestana: la pestaña.';
revoke execute on function envio_en_pestana(envios, text) from public, anon;

-- Quién mira: Dynamo (con su «Ver como»), el cliente o el transportista.
create or replace function envios_lista_ambito(p_cliente uuid, p_transportista uuid, out v_cli uuid, out v_tra uuid, out v_ok boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  v_ok := true;
  if ve_todo() then v_cli := p_cliente; v_tra := p_transportista;
  elsif cliente_del_usuario() is not null then v_cli := cliente_del_usuario(); v_tra := null;
  elsif transportista_del_usuario() is not null then v_tra := transportista_del_usuario(); v_cli := null;
  else v_ok := false; end if;
end $$;
comment on function public.envios_lista_ambito(uuid, uuid) is '[Ayudantes internos] Qué envíos puede listar quien llama: Dynamo todos (o los de un cliente/transportista si los pide), un cliente los suyos, un transportista sus viajes. Quién: interno.';
revoke execute on function envios_lista_ambito(uuid, uuid) from public, anon, authenticated;

create or replace function envios_pestanas(p_cliente uuid default null, p_transportista uuid default null)
returns table (pestana text, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  select * into a from envios_lista_ambito(p_cliente, p_transportista);
  if not a.v_ok then return; end if;
  return query
  select x.p, count(*) filter (where envio_en_pestana(e, x.p))
    from (values ('solicitudes'), ('sin-pagar'), ('sin-asignar'), ('programada'), ('entregada'), ('cancelada'), ('todas')) x(p)
    cross join lateral (select * from envios e
                         where (a.v_cli is null or e.cliente_id = a.v_cli)
                           and (a.v_tra is null or e.transportista_id = a.v_tra)) e
   group by x.p;
end $$;
revoke execute on function envios_pestanas(uuid, uuid) from public, anon;
grant execute on function envios_pestanas(uuid, uuid) to authenticated;
comment on function public.envios_pestanas(uuid, uuid) is '[Envíos] Cuántos envíos hay en cada pestaña de la lista (solicitudes, sin-pagar, sin-asignar, programada, entregada, cancelada, todas). Quién: Dynamo (todos, o los de un cliente/transportista), cliente (los suyos), transportista (sus viajes). Argumentos: p_cliente, p_transportista: solo Dynamo, para filtrar (opcionales).';

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
     and envio_en_pestana(e, p_pestana)
   order by e.creado_en desc, e.id
   offset v_off limit v_por;
end $$;
revoke execute on function envios_pagina(text, integer, integer, uuid, uuid) from public, anon;
grant execute on function envios_pagina(text, integer, integer, uuid, uuid) to authenticated;
comment on function public.envios_pagina(text, integer, integer, uuid, uuid) is '[Envíos] Los envíos de una pestaña de la lista, por páginas (lo más nuevo primero): devuelve sus ids y el total de la pestaña. Las filas se leen después con mis_envios_por_ids / mis_viajes_por_ids (o la tabla, Dynamo). Quién: Dynamo, cliente (los suyos), transportista (sus viajes). Argumentos: p_pestana: solicitudes, sin-pagar, sin-asignar, programada, entregada, cancelada o todas · p_pagina (desde 1) · p_por_pagina (máx. 200) · p_cliente, p_transportista: solo Dynamo (opcionales).';
