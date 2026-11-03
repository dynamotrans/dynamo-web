-- =====================================================================================
-- EXPORTACIONES: marcar lo que ya se ha pasado a Holded o publicado en la bolsa
-- =====================================================================================
-- La pantalla «Exportaciones» del panel descarga los ficheros de las vistas de la
-- migración 20261103020000. Después de importarlos, Dynamo los MARCA para que la próxima
-- vez salgan solo los nuevos:
--   venta  → envios.pedido_venta_holded  = la referencia GX (el "Num Pedido" del fichero)
--   compra → envios.pedido_compra_holded = la referencia GX
--   bolsa  → envios.publicado_en_bolsa_en = hora del SERVIDOR (dispara el hito
--            'publicado_bolsa', regla 12)
-- Y al revés (p_quitar): por si se marcó por error. Solo Dynamo; con los permisos por
-- fila de quien llama (security invoker).

create or replace function marcar_exportados(p_fichero text, p_refs text[], p_quitar boolean default false)
returns integer language plpgsql volatile security invoker set search_path = public as $$
declare n integer;
begin
  if not es_admin() then
    raise exception 'Solo el equipo de Dynamo puede marcar exportaciones.' using errcode = '42501';
  end if;
  if p_fichero = 'venta' then
    update envios set pedido_venta_holded = case when p_quitar then null else referencia_gx end
     where referencia_gx = any(p_refs)
       and (case when p_quitar then pedido_venta_holded is not null else pedido_venta_holded is null end);
  elsif p_fichero = 'compra' then
    update envios set pedido_compra_holded = case when p_quitar then null else referencia_gx end
     where referencia_gx = any(p_refs)
       and (case when p_quitar then pedido_compra_holded is not null else pedido_compra_holded is null end);
  elsif p_fichero = 'bolsa' then
    update envios set publicado_en_bolsa_en = case when p_quitar then null else now() end
     where referencia_gx = any(p_refs)
       and (case when p_quitar then publicado_en_bolsa_en is not null else publicado_en_bolsa_en is null end);
  else
    raise exception 'Fichero de exportación no válido: %', p_fichero;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function marcar_exportados(text, text[], boolean) from public, anon;
grant execute on function marcar_exportados(text, text[], boolean) to authenticated;
