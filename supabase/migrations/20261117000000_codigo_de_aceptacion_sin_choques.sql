-- =====================================================================================
-- EL CÓDIGO DE ACEPTACIÓN NO CHOCA NUNCA, NI EN EL MISMO INSTANTE (usuario, 2026-11-17)
-- =====================================================================================
-- Dos envíos nunca pueden tener el mismo código a la vez: lo impide el índice único de
-- envios.codigo_aceptacion. Pero el código se elegía mirando solo lo ya guardado: si dos
-- envíos se creaban EN EL MISMO INSTANTE y el azar les daba el mismo número, ninguno veía
-- al otro, y el segundo fallaba al guardarse (había que volver a pulsar).
--
-- AHORA el código se APUNTA en el momento de repartirlo, en la misma lista de los códigos
-- retirados (que ya impedía volver a repartirlos durante 30 días). Esa lista tiene clave
-- única: si dos altas simultáneas sacan el mismo número, la segunda espera a la primera,
-- ve que ya está cogido y saca otro, sola. No hay error ni hay que repetir nada.
--
-- De paso, un código no vuelve a repartirse en los 30 días siguientes a haberse repartido
-- (antes: a haberse retirado). La casilla de la web no cambia: primero busca la carga viva
-- con ese código; la lista solo decide entre «ya no está disponible» y «código incorrecto».

do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.generar_codigo_aceptacion()'::regprocedure);
  n := replace(v, 'exit when not exists (select 1 from envios where codigo_aceptacion = v)
          and not exists (select 1 from codigos_carga_retirados where codigo = v);',
    'continue when exists (select 1 from envios where codigo_aceptacion = v);
    -- Se apunta AL REPARTIRLO: si otro alta simultánea ha sacado el mismo, aquí se espera a
    -- que termine y, si lo ha cogido, no se inserta nada y se saca otro.
    insert into codigos_carga_retirados (codigo) values (v) on conflict (codigo) do nothing;
    exit when found;');
  if n = v then raise exception 'generar_codigo_aceptacion: no encuentro dónde comprueba que el código está libre'; end if;
  execute n;
end $$;
comment on function public.generar_codigo_aceptacion() is '[Ayudantes internos] Devuelve un código de aceptación de carga nuevo: 6 cifras al azar (no empieza por 0, ni todas iguales, ni en escalera) que no tiene ningún otro envío y que no se ha repartido ni retirado en los últimos 30 días. Lo apunta al repartirlo en codigos_carga_retirados, cuya clave única hace que dos altas simultáneas no puedan sacar el mismo. Quién: el disparador de envíos.';
comment on table public.codigos_carga_retirados is '[Ofertas y transportistas] Códigos de aceptación de carga repartidos o retirados en los últimos 30 días. Se apuntan al repartirse (para que dos altas simultáneas no saquen el mismo) y se vuelve a anotar la fecha al dejar de usarse (envío cancelado o entregado, o código cambiado al quedarse el envío sin transportista). Mientras están aquí no se vuelven a repartir, y sirven para que la casilla de la web conteste «esa carga ya no está disponible» en vez de «código incorrecto». Solo lo lee Dynamo.';
comment on column public.codigos_carga_retirados.codigo is 'formato: texto de 6 cifras (no empieza por 0) | rango: 100000 a 999999 | lista: no aplica | automático | El código de aceptación repartido o retirado. Ej. OK: 482913';
comment on column public.codigos_carga_retirados.retirado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se repartió ese código o, si ya dejó de usarse, cuándo dejó de usarse. A los 30 días la fila se borra y el número queda libre.';
