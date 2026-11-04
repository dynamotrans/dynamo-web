-- =====================================================================================
-- ARCHIVOS SUELTOS del almacén privado (bucket `documentos`)
-- =====================================================================================
-- Al subir un archivo, primero va el fichero y después su fila en `documentos` (o en
-- `firmas_cmr`, la imagen de una firma). Si entre medias se corta la conexión, se cierra
-- el navegador o la base de datos rechaza la fila, el fichero se queda SUELTO: ocupa sitio
-- y no lo ve nadie.
--
-- Desde la web no se borra NINGÚN fichero (tienen valor de prueba: regla de la plataforma),
-- así que la limpieza la hace el servidor con la clave de servicio, y solo de lo que de
-- verdad está suelto: sin ninguna fila que lo nombre y con más de 24 horas (para no tocar
-- una subida que está en curso). Esta función solo LISTA; borrar lo hace la Storage API
-- (borrar la fila de storage.objects a mano dejaría el fichero huérfano en el disco).
-- Un documento «quitado» (borrado = true) NO está suelto: su fila sigue y se conserva.
-- =====================================================================================
create or replace function archivos_sueltos(p_horas integer default 24)
returns table (ruta text, creado timestamptz, bytes bigint)
language sql stable security definer set search_path = public, storage as $$
  select o.name, o.created_at, coalesce((o.metadata->>'size')::bigint, 0)
    from storage.objects o
   where o.bucket_id = 'documentos'
     and o.created_at < now() - make_interval(hours => greatest(p_horas, 24))
     and not exists (select 1 from public.documentos d where d.storage_bucket = o.bucket_id and d.storage_ruta = o.name)
     and not exists (select 1 from public.firmas_cmr f where f.firma_storage_ruta = o.name)
   order by o.created_at
   limit 1000
$$;
revoke execute on function archivos_sueltos(integer) from public, anon, authenticated;
grant execute on function archivos_sueltos(integer) to service_role;
