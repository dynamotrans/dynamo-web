-- =====================================================================================
-- FILTRO DE FECHA DE ENVÍOS: TODA LA VENTANA DE CARGA CUENTA
-- =====================================================================================
-- Usuario, 2026-11-21: «si pongo fecha hoy y la ventana es de viernes a miércoles, debería
-- salir: todavía no se ha asignado el día en que se recoge. Mientras exista ventana y no haya
-- una fecha concreta de recogida, todos los días cuentan como posibles». Hasta ahora el filtro
-- miraba solo el PRIMER día de la ventana (fecha_efectiva). Ahora:
--   · con fecha concreta (la real de carga o la prevista al asignar), cuenta solo ese día;
--   · sin ella, cuenta cualquier día de la ventana (desde … hasta): sale si la ventana se
--     cruza con las fechas del filtro.
-- fecha_efectiva sigue siendo el primer día posible, así que «hasta» sigue usando su índice.
do $$ declare v text; n text;
  viejo_d text := 'and (p_desde is null or e.fecha_efectiva >= p_desde)';
  nuevo_d text := 'and (p_desde is null or (case when e.fecha_carga_real is null and e.fecha_carga_prevista is null then coalesce(e.fecha_carga_hasta, e.fecha_efectiva) else e.fecha_efectiva end) >= p_desde)';
begin
  v := pg_get_functiondef('public.envios_pagina(text, integer, integer, uuid, uuid, text, uuid, text, date, date)'::regprocedure);
  n := replace(v, viejo_d, nuevo_d);
  if n <> v then execute n;
  elsif position('coalesce(e.fecha_carga_hasta, e.fecha_efectiva)' in v) = 0 then raise exception 'envios_pagina: no encuentro el filtro de fechas';
  end if;

  v := pg_get_functiondef('public.buscar_envios_pagina(text, date, date, integer, integer, uuid, uuid, text, uuid, text)'::regprocedure);
  n := replace(v, 'and (p_desde is null or coalesce(e.fecha_carga_real, e.fecha_carga_desde) >= p_desde)', nuevo_d);
  n := replace(n, 'and (p_hasta is null or coalesce(e.fecha_carga_real, e.fecha_carga_desde) <= p_hasta)', 'and (p_hasta is null or e.fecha_efectiva <= p_hasta)');
  if n <> v then execute n;
  elsif position('coalesce(e.fecha_carga_hasta, e.fecha_efectiva)' in v) = 0 then raise exception 'buscar_envios_pagina: no encuentro el filtro de fechas';
  end if;
end $$;
