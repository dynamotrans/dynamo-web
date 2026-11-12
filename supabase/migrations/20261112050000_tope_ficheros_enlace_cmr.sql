-- =====================================================================================
-- TOPE DE FICHEROS POR ENLACE DEL CMR: de 20 a 60 (2026-11-12)
-- =====================================================================================
-- El tope anti-abuso de 20 ficheros por carpeta cmr/<llave>/ se quedaba corto en la
-- práctica: cada toque de «Aceptar firma» sube un trazo ANTES de registrar la firma
-- (la función lo exige ya subido), así que los intentos que luego no se registran
-- (casilla ya firmada, matrícula no válida, reintentos…) dejan ficheros huérfanos que
-- también cuentan. Con las fotos de reservas (hasta 6 por casilla) y las firmas extra,
-- un envío con varias paradas podía llenar el tope en una tarde — y al llenarse, TODA
-- subida se rechaza y la página solo puede decir «no se ha podido guardar la firma».
-- 60 da holgura real (7 casillas + 3 extra + fotos + reintentos) y sigue acotado.
-- La web, además, ya borra el trazo huérfano cuando la firma no queda registrada.
create or replace function cmr_subida_permitida(p_name text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select cmr_ruta_permitida(p_name)
     and (select count(*) from storage.objects o
           where o.bucket_id = 'documentos' and o.name like 'cmr/' || split_part(p_name, '/', 2) || '/%') < 60
$$;
comment on function public.cmr_subida_permitida(text) is '[CMR y PIN] ¿Se puede subir este trazo de firma? Ruta de un enlace de CMR vivo y menos de 60 ficheros en ese enlace (trazos, fotos de reservas y reintentos incluidos). Quién: política del almacén. Argumentos: p_name: ruta cmr/<llave>/<fichero>.';
