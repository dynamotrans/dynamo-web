-- =====================================================================================
-- EL TRANSPORTISTA SUBE LA DOCUMENTACIÓN DE SU EMPRESA (Mi cuenta)
-- =====================================================================================
-- Hoja del CIF, seguro CMR, tarjeta de transporte, DNI y otros (máx. 5, la regla que ya
-- existe). Así no hay que pedírsela por email cada vez que caduca. Lo que suba queda a su
-- nombre y lo revisa Dynamo (no puede borrarlo: los documentos solo se retiran desde Dynamo).
drop policy if exists documentos_ins_ficha_transportista on documentos;
create policy documentos_ins_ficha_transportista on documentos for insert with check (
  tipo in ('hoja_cif', 'seguro_cmr', 'tarjeta_transporte', 'dni', 'otro')
  and transportista_id is not null and transportista_id = transportista_del_usuario()
  and envio_id is null and incidencia_id is null and almacenamiento_id is null
  and penalizacion_id is null and operador_id is null and usuario_id is null
);
