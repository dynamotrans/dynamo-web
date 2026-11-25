-- =====================================================================================
-- CUADRO DE MANDO: CUÁNTO SE HACE SOLO EN LA PLATAFORMA (usuario, 2026-11-25)
-- =====================================================================================
-- «Ponemos nuevos indicadores: Envíos 100 % digital · Envíos digital cliente · Envíos digital
-- transportista · Envíos 100 % Dynamo. Depende de quién crea se contabiliza: si el admin crea
-- el envío y asigna transportista, es 100 % Dynamo; pero si ese envío lo crea Dynamo y el
-- transportista acepta directo en el enlace, es digital transportista.»
--
-- Cada envío REALIZADO del periodo (mismo criterio que el resto del cuadro: envíos de Dynamo,
-- por su día de carga, en marcha o entregados) cae en UNA de cuatro casillas, según dos cosas:
--   · quién lo creó: un usuario del CLIENTE en la plataforma, o Dynamo (también cuando lo
--     crea un gestor en nombre del cliente, o viene de una carga antigua);
--   · cómo llegó el transportista: lo ACEPTÓ él por su enlace (su oferta quedó «aceptada»), o
--     se lo asignó Dynamo a mano.
--        cliente + transportista por enlace → 100 % digital
--        cliente + asignado por Dynamo      → digital cliente
--        Dynamo  + transportista por enlace → digital transportista
--        Dynamo  + asignado por Dynamo      → 100 % Dynamo
-- Las cuatro suman los envíos realizados del periodo.

create or replace function public.cuadro_mando_digital(p_desde date, p_hasta date)
returns jsonb language sql stable security definer set search_path = public as $$
  with base as (
    select exists (select 1 from usuarios u where u.id = e.creado_por and u.rol = 'cliente') as por_cliente,
           exists (select 1 from envio_ofertas o
                    where o.envio_id = e.id and o.estado = 'aceptada'
                      and (o.transportista_id is null or o.transportista_id = e.transportista_id)) as por_enlace
      from envios e
     where ve_todo() and not coalesce(e.es_manual, false)
       and e.estado in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado')
       and e.fecha_efectiva between least(p_desde, p_hasta) and greatest(p_desde, p_hasta)
  )
  select jsonb_build_object(
           'realizados', count(*),
           'digital_total', count(*) filter (where por_cliente and por_enlace),
           'digital_cliente', count(*) filter (where por_cliente and not por_enlace),
           'digital_transportista', count(*) filter (where not por_cliente and por_enlace),
           'dynamo', count(*) filter (where not por_cliente and not por_enlace))
    from base
$$;
comment on function public.cuadro_mando_digital(date, date) is '[Gestión interna] Cuadro de mando: reparto de los envíos realizados de un periodo según cuánto se hizo solo en la plataforma. Cuatro casillas que suman el total: 100 % digital (lo creó el cliente y el transportista aceptó por su enlace), digital cliente (lo creó el cliente y el transportista lo asignó Dynamo), digital transportista (lo creó Dynamo y el transportista aceptó por su enlace) y 100 % Dynamo (lo creó y lo asignó Dynamo). Mismo criterio que cuadro_mando: envíos de Dynamo, por su día de carga, en marcha o entregados. Quién: equipo de Dynamo. Argumentos: p_desde, p_hasta: el periodo.';
revoke execute on function public.cuadro_mando_digital(date, date) from public, anon;
grant execute on function public.cuadro_mando_digital(date, date) to authenticated, service_role;
