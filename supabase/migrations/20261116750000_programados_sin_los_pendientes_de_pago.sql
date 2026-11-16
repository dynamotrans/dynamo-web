-- =====================================================================================
-- LA PESTAÑA «PROGRAMADOS» YA NO ENSEÑA LOS PENDIENTES DE PAGO (usuario, 2026-11-16)
-- =====================================================================================
-- «Le bajé el crédito y siguen ahí.» Los envíos sí habían pasado a pendiente de pago, pero
-- la pestaña «Programados» listaba todo lo programado, también lo que espera el pago, así
-- que parecía que no se había movido nada. Los pendientes de pago tienen su pestaña.
--
-- AHORA cada envío vivo está en UNA sola de las dos:
--   · «Pendientes de pago»: programado y esperando el pago.
--   · «Programados»: el resto de los vivos (a crédito o ya pagados, y los que están en curso).
-- Al pasar de crédito a pago por adelantado (o al revés), el envío cambia de pestaña.
do $$ declare v text; n text;
  aguja text := 'e.estado in (''programado'', ''hacia_la_carga'', ''cargando'', ''en_ruta'')';
  nueva text := '(e.estado in (''programado'', ''hacia_la_carga'', ''cargando'', ''en_ruta'') and not (e.estado = ''programado'' and e.estado_pago_previo = ''pendiente''))';
  f regprocedure;
begin
  foreach f in array array['public.envios_pestanas(uuid, uuid)'::regprocedure,
                           'public.envios_pagina(text, integer, integer, uuid, uuid, text, uuid, text, date, date)'::regprocedure] loop
    v := pg_get_functiondef(f);
    if (length(v) - length(replace(v, aguja, ''))) / length(aguja) <> 1 then
      raise exception '%: no encuentro (una sola vez) el filtro de la pestaña «programada»', f;
    end if;
    execute replace(v, aguja, nueva);
  end loop;
end $$;

-- La regla suelta de «¿en qué pestaña sale este envío?» (ya no la usan las listas, pero se
-- mantiene al día para quien la llame).
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.envio_en_pestana(envios, text)'::regprocedure);
  n := replace(v, 'when ''programada'' then e.estado in (', 'when ''programada'' then not (e.estado = ''programado'' and e.estado_pago_previo = ''pendiente'') and e.estado in (');
  if n <> v then execute n; end if;
end $$;
