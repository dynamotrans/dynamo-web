-- =====================================================================================
-- FIRMAS_ENVIO DEVUELVE TAMBIÉN «EXTRA» (usuario, 2026-11-10)
-- =====================================================================================
-- El CMR relleno pasa a llevar una hoja «Registro de firmas» con TODAS las firmas del
-- CMR digital (las de las paradas intermedias y las extra, que no caben en las casillas
-- 22/23/24 del impreso). Para distinguir la firma principal de cada casilla de las
-- añadidas a mano, firmas_envio() devuelve la columna `extra` que ya existe en la tabla.
-- Cambia el tipo de retorno → hay que soltar la función y volverla a crear igual.
-- =====================================================================================

drop function if exists firmas_envio(uuid);
create function firmas_envio(p_envio uuid)
returns table (rol text, parada_id uuid, nombre text, documento text, documento_pais text, documento_validado boolean, firmado_en timestamptz, firma_storage_ruta text, extra boolean)
language sql stable security definer set search_path = public as $$
  select f.rol::text, f.parada_id, f.nombre::text, (case when ve_todo() then f.documento else '•••' || right(f.documento, 4) end)::text,
         f.documento_pais::text, f.documento_validado, f.firmado_en, f.firma_storage_ruta::text, f.extra
    from firmas_cmr f
   where f.envio_id = p_envio and (ve_todo() or envio_del_cliente(p_envio) or envio_del_transportista(p_envio))
   order by f.firmado_en
$$;
revoke execute on function firmas_envio(uuid) from public, anon;
grant execute on function firmas_envio(uuid) to authenticated;
comment on function public.firmas_envio(uuid) is '[CMR y PIN] Las firmas del CMR de un envío, sin IP, navegador ni email; el documento enmascarado salvo para Dynamo; con `extra` para distinguir las firmas añadidas a mano. Quién: cliente o transportista del envío y Dynamo. Argumentos: p_envio: envios.id.';
