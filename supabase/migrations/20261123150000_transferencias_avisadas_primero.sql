-- Lista de envíos: los que tienen la TRANSFERENCIA AVISADA van arriba del todo (usuario,
-- 2026-11-23: «cuando el envío ya tiene "Transferencia avisada · validar" debe salir al top de
-- ese listado, para entrar, revisarlo y marcarlo»). Son los que esperan una acción de Dynamo:
-- validar o rechazar el cobro. Primero el que más lleva esperando.
--
-- Solo cambia el orden de las pestañas «Pendientes de pago» y «Todas»; el resto sigue igual
-- (por fecha de creación, lo más nuevo arriba). Se cambia la línea del orden, sin reescribir
-- la función entera.
do $do$
declare f text; a text := 'order by e.creado_en desc, e.id'; n int;
begin
  f := pg_get_functiondef('public.envios_pagina(text, integer, integer, uuid, uuid, text, uuid, text, date, date)'::regprocedure);
  n := (length(f) - length(replace(f, a, ''))) / length(a);
  if n <> 1 then raise exception 'envios_pagina: no encuentro la línea del orden exactamente una vez (%).', n; end if;
  execute replace(f, a,
    'order by case when p_pestana in (''sin-pagar'', ''todas'') and e.estado = ''programado'' and e.estado_pago_previo = ''pendiente''
                        and e.pago_avisado_en is not null then e.pago_avisado_en end asc nulls last,
            e.creado_en desc, e.id');
end $do$;
