-- =====================================================================================
-- EXPORTACIONES: «FACTURADO?» desde el panel y republicar en la bolsa lo modificado
-- =====================================================================================
-- 1. La columna FACTURADO? de los ficheros de Holded se marca desde el panel (venta: ya
--    facturado al cliente; compra: ya llegó la factura del transportista).
-- 2. Un envío ya publicado en la bolsa que se modifica después (otra fecha, otro precio…)
--    vuelve a estar pendiente de publicar: al marcarlo otra vez se sella la hora nueva.

create or replace function marcar_facturados(p_lado text, p_refs text[], p_valor boolean default true)
returns integer language plpgsql volatile security invoker set search_path = public as $$
declare n integer;
begin
  if not es_admin() then raise exception 'Solo el equipo de Dynamo marca la facturación.' using errcode = '42501'; end if;
  if p_lado = 'venta' then
    update envios set facturado_venta = p_valor where referencia_gx = any(p_refs) and facturado_venta <> p_valor;
  elsif p_lado = 'compra' then
    update envios set facturado_compra = p_valor where referencia_gx = any(p_refs) and facturado_compra <> p_valor;
  else
    raise exception 'Lado no válido: %', p_lado;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function marcar_facturados(text, text[], boolean) from public, anon;
grant execute on function marcar_facturados(text, text[], boolean) to authenticated;

-- marcar_exportados: en la bolsa, también se vuelve a publicar lo modificado después.
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
       and (case when p_quitar then publicado_en_bolsa_en is not null
                 else publicado_en_bolsa_en is null or modificado_en > publicado_en_bolsa_en end);
  else
    raise exception 'Fichero de exportación no válido: %', p_fichero;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
