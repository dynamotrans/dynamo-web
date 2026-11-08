-- =====================================================================================
-- ANTICIPOS DE PRONTO PAGO POR PÁGINAS (usuario, 2026-11-09)
-- =====================================================================================
-- La ventana «Línea de pronto pago» del Dashboard admin listaba TODOS los anticipos de
-- la ventana (60 días) incrustados en el propio estado (pronto_pago_estado): con 84 ya
-- era incómoda y con 500 inviable — y además viajaban enteros en cada carga del
-- dashboard, se abriera la ventana o no.
--   · pronto_pago_estado_interno() deja de incrustar la lista: devuelve anticipos_n
--     (cuántos hay en la ventana). La suma (usado / disponible / activo) no cambia,
--     que es lo que usan las reglas de la base de datos al crear ofertas.
--   · pronto_pago_anticipos(p_pagina, p_por_pagina): la lista por páginas con su total,
--     solo para Dynamo (misma receta que sitios_pagina: count(*) over + offset/limit).
--     La pantalla la pide al abrir la ventana y pagina de 10 en 10.
-- =====================================================================================

create or replace function pronto_pago_estado_interno()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_linea numeric; v_on boolean; v_dias int; v_usado numeric; v_n bigint;
begin
  v_linea := (parametro('pronto_pago_linea_euros'))::text::numeric;
  v_on    := (parametro('pronto_pago_encendido'))::text::boolean;
  v_dias  := (parametro('pronto_pago_ventana_dias'))::text::int;
  select coalesce(sum(r.precio_aceptado - pronto_pago_descuento(r.precio_aceptado)), 0), count(r.id)
    into v_usado, v_n
    from envio_reservas r
    join envios e on e.id = r.envio_id
   where r.estado = 'aceptada' and r.pronto_pago and r.cerrada_en > now() - make_interval(days => v_dias)
     and e.estado <> 'cancelado';
  return jsonb_build_object(
    'linea', v_linea, 'encendido', v_on, 'ventana_dias', v_dias, 'usado', v_usado,
    'disponible', greatest(v_linea - v_usado, 0),
    'activo', v_on and v_linea - v_usado >= (parametro('pronto_pago_minimo'))::text::numeric,
    'anticipos_n', v_n);
end $$;
comment on function public.pronto_pago_estado_interno() is '[Ayudantes internos] Estado completo de la línea de pronto pago (para las reglas de la base de datos): línea, interruptor, ventana, usado, disponible, activo y cuántos anticipos hay en la ventana (anticipos_n; el detalle, en pronto_pago_anticipos). Quién: solo uso interno.';

comment on function public.pronto_pago_estado() is '[Precio y pago] Situación de la línea de pronto pago a transportistas: línea total, si está encendida, ventana de días, cuánto se ha anticipado, cuánto queda, si se puede ofrecer ahora y cuántos anticipos hay (anticipos_n). El detalle por páginas, en pronto_pago_anticipos. Quién: cualquier usuario con sesión (el detalle, solo Dynamo: a los demás solo les llega «activo»). Argumentos: sin argumentos.';

-- ---- La lista de anticipos, por páginas y solo para Dynamo ---------------------------------
create function public.pronto_pago_anticipos(p_pagina integer default 1, p_por_pagina integer default 10)
returns table (cuando timestamptz, envio text, transportista text, importe numeric, descuento numeric, anticipado numeric, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_dias int := (parametro('pronto_pago_ventana_dias'))::text::int;
  v_por int := least(greatest(coalesce(p_por_pagina, 10), 1), 100);
  v_off int := (greatest(coalesce(p_pagina, 1), 1) - 1) * least(greatest(coalesce(p_por_pagina, 10), 1), 100);
begin
  if not ve_todo() then return; end if;
  return query
  select r.cerrada_en, e.referencia_gx, t.nombre_visible,
         r.precio_aceptado, pronto_pago_descuento(r.precio_aceptado),
         r.precio_aceptado - pronto_pago_descuento(r.precio_aceptado),
         count(*) over ()
    from envio_reservas r
    join envios e on e.id = r.envio_id
    left join transportistas t on t.id = r.transportista_id
   where r.estado = 'aceptada' and r.pronto_pago and r.cerrada_en > now() - make_interval(days => v_dias)
     and e.estado <> 'cancelado'
   order by r.cerrada_en desc, r.id
   offset v_off limit v_por;
end $$;
revoke all on function public.pronto_pago_anticipos(integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.pronto_pago_anticipos(integer, integer) to authenticated, service_role;
comment on function public.pronto_pago_anticipos(integer, integer) is '[Precio y pago] Anticipos con pronto pago de la ventana vigente (pronto_pago_ventana_dias), por páginas y del más reciente al más antiguo: cuándo se cerró, nº de envío, transportista, importe, descuento y lo anticipado, más el total de la ventana para el paginador. Quién: Dynamo (a los demás no les devuelve filas). Argumentos: p_pagina: página (desde 1) · p_por_pagina: filas por página (máx. 100, 10 por defecto).';
