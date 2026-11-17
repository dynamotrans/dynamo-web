-- =====================================================================================
-- EL ENLACE PROPIO DEL ENVÍO ABRE SU CARGA (2026-11-17)
-- =====================================================================================
-- Cada envío tiene su enlace público (envios.token_publico): es el que usan la lista «otros
-- envíos disponibles de Dynamo» de la página de aceptar carga y, desde hoy, la casilla del
-- código de aceptación. Pero al abrir la carga con ESE enlace (y no con el de una oferta)
-- la página daba error («labores de mantenimiento»): oferta_publica() leía los datos de una
-- oferta que en ese caso no había cargado. Lo destapó la prueba de navegador del código de
-- aceptación. Ahora, con el enlace del envío, se usa su oferta abierta viva si la tiene
-- (su precio y su margen de negociación) y, si no, los datos del propio envío.

do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.oferta_publica(uuid)'::regprocedure);
  n := replace(v,
    $a$if t.oferta_id is not null then select * into o from envio_ofertas where id = t.oferta_id; end if;$a$,
    $b$if t.oferta_id is not null then
    select * into o from envio_ofertas where id = t.oferta_id;
  else
    -- Con el enlace del propio envío: su oferta abierta viva, si la hay (si no, queda vacía).
    select * into o from envio_ofertas
     where envio_id = e.id and transportista_id is null and estado = 'activa' and caduca_en > now()
     order by creado_en desc limit 1;
  end if;$b$);
  if n = v then raise exception 'oferta_publica: no encuentro la lectura de la oferta'; end if;
  execute n;
end $$;
