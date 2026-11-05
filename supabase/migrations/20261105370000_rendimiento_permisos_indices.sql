-- =====================================================================================
-- RENDIMIENTO CON MUCHOS DATOS (revisión de calidad, 2026-11-05)
-- 1. Permisos: las reglas de cada tabla llamaban a es_equipo_dynamo(), ve_todo(),
--    cliente_del_usuario(), transportista_del_usuario()… UNA VEZ POR FILA. Escritas como
--    (select f()) Postgres las calcula UNA VEZ POR CONSULTA (recomendación de Supabase): con
--    decenas de miles de filas, las listas van varias veces más rápidas. Lo que permiten no
--    cambia (mismas funciones, mismo resultado).
-- 2. Índices para las listas que se ordenan por fecha de alta, y fuera uno repetido.
-- =====================================================================================

alter policy ofertas_admin on public.envio_ofertas using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy reservas_admin_sel on public.envio_reservas using ((select es_equipo_dynamo()));
alter policy pines_admin_sel on public.envio_parada_pines using ((select es_equipo_dynamo()));
alter policy pin_intentos_admin_sel on public.pin_intentos using ((select es_equipo_dynamo()));
alter policy usuarios_sel on public.usuarios using (((select es_equipo_dynamo()) OR (id = (select auth.uid())) OR ((cliente_id IS NOT NULL) AND (cliente_id = (select cliente_del_usuario()))) OR ((transportista_id IS NOT NULL) AND (transportista_id = (select transportista_del_usuario())))));
alter policy usuarios_upd on public.usuarios using (((select es_equipo_dynamo()) OR (id = (select auth.uid())))) with check (((select es_equipo_dynamo()) OR (id = (select auth.uid()))));
alter policy usuarios_admin_ins on public.usuarios with check ((select es_equipo_dynamo()));
alter policy vehiculos_sel on public.vehiculos using (((select es_equipo_dynamo()) OR ((transportista_id IS NOT NULL) AND (transportista_id = (select transportista_del_usuario())))));
alter policy vehiculos_admin on public.vehiculos using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy festivos_sel on public.festivos using (((select auth.uid()) IS NOT NULL));
alter policy festivos_admin on public.festivos using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy penalizaciones_ve_todo on public.penalizaciones using ((select ve_todo()));
alter policy pin_intentos_ve_todo on public.pin_intentos using ((select ve_todo()));
alter policy restricciones_servicio_ve_todo on public.restricciones_servicio using ((select ve_todo()));
alter policy tipos_incidencia_ve_todo on public.tipos_incidencia using ((select ve_todo()));
alter policy sitios_ins on public.sitios with check (((select es_equipo_dynamo()) OR ((cliente_id = (select cliente_del_usuario())) AND (NOT es_almacen_dynamo))));
alter policy recargos_tipo_sitio_ve_todo on public.recargos_tipo_sitio using ((select ve_todo()));
alter policy operadores_sel on public.operadores using (((select es_equipo_dynamo()) OR (cliente_id = (select cliente_del_usuario()))));
alter policy operadores_ins on public.operadores with check (((select es_equipo_dynamo()) OR (cliente_id = (select cliente_del_usuario()))));
alter policy operadores_upd on public.operadores using (((select es_equipo_dynamo()) OR (cliente_id = (select cliente_del_usuario())))) with check (((select es_equipo_dynamo()) OR (cliente_id = (select cliente_del_usuario()))));
alter policy operadores_del on public.operadores using ((select es_equipo_dynamo()));
alter policy tipos_incidencia_sel on public.tipos_incidencia using (((select auth.uid()) IS NOT NULL));
alter policy tipos_incidencia_admin on public.tipos_incidencia using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy incidencias_sel on public.incidencias using (((select es_equipo_dynamo()) OR (cliente_id = (select cliente_del_usuario()))));
alter policy conductores_sel on public.conductores using (((select es_equipo_dynamo()) OR ((transportista_id IS NOT NULL) AND (transportista_id = (select transportista_del_usuario())))));
alter policy conductores_admin on public.conductores using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy incidencias_upd on public.incidencias using (((select es_equipo_dynamo()) OR ((cliente_id = (select cliente_del_usuario())) AND (estado = 'abierto'::estado_incidencia)))) with check (((select es_equipo_dynamo()) OR ((cliente_id = (select cliente_del_usuario())) AND (estado = ANY (ARRAY['abierto'::estado_incidencia, 'cancelado'::estado_incidencia])))));
alter policy tipos_penalizacion_sel on public.tipos_penalizacion using (((select auth.uid()) IS NOT NULL));
alter policy tipos_penalizacion_admin on public.tipos_penalizacion using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy penalizaciones_admin on public.penalizaciones using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy alm_sel on public.almacenamientos using (((select es_equipo_dynamo()) OR (cliente_id = (select cliente_del_usuario()))));
alter policy alm_ins on public.almacenamientos with check (((select es_equipo_dynamo()) OR ((cliente_id = (select cliente_del_usuario())) AND (estado = 'pendiente_confirmar'::estado_almacenamiento))));
alter policy alm_upd on public.almacenamientos using (((select es_equipo_dynamo()) OR ((cliente_id = (select cliente_del_usuario())) AND (estado = 'pendiente_confirmar'::estado_almacenamiento)))) with check (((select es_equipo_dynamo()) OR ((cliente_id = (select cliente_del_usuario())) AND (estado = ANY (ARRAY['pendiente_confirmar'::estado_almacenamiento, 'cancelado'::estado_almacenamiento])))));
alter policy auditoria_admin_sel on public.auditoria using ((select es_equipo_dynamo()));
alter policy restricciones_admin on public.restricciones_servicio using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy recargos_admin on public.recargos_tipo_sitio using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy documentos_upd on public.documentos using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy envios_admin on public.envios using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy paradas_admin on public.envio_paradas using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy incidencias_ins on public.incidencias with check (((select es_equipo_dynamo()) OR ((cliente_id = (select cliente_del_usuario())) AND ((envio_id IS NULL) OR envio_del_cliente(envio_id)))));
alter policy clientes_admin on public.clientes using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy transportistas_admin on public.transportistas using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy contactos_sel on public.contactos using (((select es_equipo_dynamo()) OR ((cliente_id IS NOT NULL) AND (cliente_id = (select cliente_del_usuario()))) OR ((sitio_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM sitios l
  WHERE ((l.id = contactos.sitio_id) AND (l.cliente_id = (select cliente_del_usuario())))))) OR ((transportista_id IS NOT NULL) AND (transportista_id = (select transportista_del_usuario())) AND (funcion <> 'contabilidad'::funcion_contacto))));
alter policy contactos_ins on public.contactos with check (((select es_equipo_dynamo()) OR ((cliente_id IS NOT NULL) AND (cliente_id = (select cliente_del_usuario()))) OR ((sitio_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM sitios l
  WHERE ((l.id = contactos.sitio_id) AND (l.cliente_id = (select cliente_del_usuario())))))) OR ((transportista_id IS NOT NULL) AND (transportista_id = (select transportista_del_usuario())) AND (funcion <> 'contabilidad'::funcion_contacto))));
alter policy contactos_upd on public.contactos using (((select es_equipo_dynamo()) OR ((cliente_id IS NOT NULL) AND (cliente_id = (select cliente_del_usuario()))) OR ((sitio_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM sitios l
  WHERE ((l.id = contactos.sitio_id) AND (l.cliente_id = (select cliente_del_usuario())))))) OR ((transportista_id IS NOT NULL) AND (transportista_id = (select transportista_del_usuario())) AND (funcion <> 'contabilidad'::funcion_contacto)))) with check (((select es_equipo_dynamo()) OR ((cliente_id IS NOT NULL) AND (cliente_id = (select cliente_del_usuario()))) OR ((sitio_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM sitios l
  WHERE ((l.id = contactos.sitio_id) AND (l.cliente_id = (select cliente_del_usuario())))))) OR ((transportista_id IS NOT NULL) AND (transportista_id = (select transportista_del_usuario())) AND (funcion <> 'contabilidad'::funcion_contacto))));
alter policy contactos_del on public.contactos using (((select es_equipo_dynamo()) OR ((cliente_id IS NOT NULL) AND (cliente_id = (select cliente_del_usuario()))) OR ((sitio_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM sitios l
  WHERE ((l.id = contactos.sitio_id) AND (l.cliente_id = (select cliente_del_usuario()))))))));
alter policy distancias_l_admin on public.distancias_sitios using ((select es_equipo_dynamo()));
alter policy distancias_cp_admin on public.distancias_cp using ((select es_equipo_dynamo()));
alter policy cmr_enlaces_dynamo on public.cmr_enlaces using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy operadores_ve_todo on public.operadores using ((select ve_todo()));
alter policy sitios_ve_todo on public.sitios using ((select ve_todo()));
alter policy incidencias_transportista_sel on public.incidencias using (((transportista_id IS NOT NULL) AND (transportista_id = (select transportista_del_usuario())) AND (cliente_id IS NULL)));
alter policy incidencias_transportista_ins on public.incidencias with check (((transportista_id = (select transportista_del_usuario())) AND (cliente_id IS NULL) AND (envio_id IS NOT NULL) AND envio_del_transportista(envio_id)));
alter policy incidencias_transportista_upd on public.incidencias using (((transportista_id = (select transportista_del_usuario())) AND (cliente_id IS NULL) AND (estado = 'abierto'::estado_incidencia))) with check (((transportista_id = (select transportista_del_usuario())) AND (cliente_id IS NULL) AND (estado = ANY (ARRAY['abierto'::estado_incidencia, 'cancelado'::estado_incidencia]))));
alter policy documentos_ins_incidencia_transportista on public.documentos with check (((tipo = ANY (ARRAY['foto_incidencia'::text, 'adjunto'::text])) AND (incidencia_id IS NOT NULL) AND (envio_id IS NULL) AND (transportista_id IS NULL) AND (almacenamiento_id IS NULL) AND (penalizacion_id IS NULL) AND (operador_id IS NULL) AND (usuario_id IS NULL) AND (EXISTS ( SELECT 1
   FROM incidencias i
  WHERE ((i.id = documentos.incidencia_id) AND (i.transportista_id = (select transportista_del_usuario())) AND (i.cliente_id IS NULL))))));
alter policy documentos_sel_incidencia_transportista on public.documentos using (((NOT borrado) AND (incidencia_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM incidencias i
  WHERE ((i.id = documentos.incidencia_id) AND (i.transportista_id = (select transportista_del_usuario())) AND (i.cliente_id IS NULL))))));
alter policy parametros_ve_todo on public.parametros using ((select ve_todo()));
alter policy documentos_ins_ficha_transportista on public.documentos with check (((tipo = ANY (ARRAY['hoja_cif'::text, 'seguro_cmr'::text, 'tarjeta_transporte'::text, 'dni'::text, 'otro'::text])) AND (transportista_id IS NOT NULL) AND (transportista_id = (select transportista_del_usuario())) AND (envio_id IS NULL) AND (incidencia_id IS NULL) AND (almacenamiento_id IS NULL) AND (penalizacion_id IS NULL) AND (operador_id IS NULL) AND (usuario_id IS NULL)));
alter policy intentos_carga_admin_sel on public.intentos_carga_publica using ((select es_equipo_dynamo()));
alter policy parametros_leer on public.parametros using ((select es_equipo_dynamo()));
alter policy parametros_alta on public.parametros with check ((select es_admin_master()));
alter policy parametros_cambio on public.parametros using ((select es_admin_master())) with check ((select es_admin_master()));
alter policy parametros_baja on public.parametros using ((select es_admin_master()));
alter policy almacenamientos_ve_todo on public.almacenamientos using ((select ve_todo()));
alter policy auditoria_ve_todo on public.auditoria using ((select ve_todo()));
alter policy clientes_ve_todo on public.clientes using ((select ve_todo()));
alter policy cmr_enlaces_ve_todo on public.cmr_enlaces using ((select ve_todo()));
alter policy conductores_ve_todo on public.conductores using ((select ve_todo()));
alter policy contactos_ve_todo on public.contactos using ((select ve_todo()));
alter policy distancias_cp_ve_todo on public.distancias_cp using ((select ve_todo()));
alter policy documentos_ve_todo on public.documentos using ((select ve_todo()));
alter policy envio_hitos_ve_todo on public.envio_hitos using ((select ve_todo()));
alter policy envio_ofertas_ve_todo on public.envio_ofertas using ((select ve_todo()));
alter policy envio_parada_pines_ve_todo on public.envio_parada_pines using ((select ve_todo()));
alter policy envio_paradas_ve_todo on public.envio_paradas using ((select ve_todo()));
alter policy envio_reservas_ve_todo on public.envio_reservas using ((select ve_todo()));
alter policy envios_ve_todo on public.envios using ((select ve_todo()));
alter policy festivos_ve_todo on public.festivos using ((select ve_todo()));
alter policy firmas_cmr_ve_todo on public.firmas_cmr using ((select ve_todo()));
alter policy incidencias_ve_todo on public.incidencias using ((select ve_todo()));
alter policy intentos_carga_publica_ve_todo on public.intentos_carga_publica using ((select ve_todo()));
alter policy tipos_penalizacion_ve_todo on public.tipos_penalizacion using ((select ve_todo()));
alter policy transportistas_ve_todo on public.transportistas using ((select ve_todo()));
alter policy usuarios_ve_todo on public.usuarios using ((select ve_todo()));
alter policy vehiculos_ve_todo on public.vehiculos using ((select ve_todo()));
alter policy documentos_sel_recurso on public.documentos using ((es_recurso AND (NOT borrado) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.estado = 'activa'::estado_cuenta))))));
alter policy consultas_precio_leer on public.consultas_precio using ((select ve_todo()));
alter policy conexion_minutos_leer on public.conexion_minutos using (((select ve_todo()) OR (usuario_id = (select auth.uid()))));
alter policy cmr_reservas_sel on public.cmr_reservas using (((select ve_todo()) OR envio_del_cliente(envio_id) OR envio_del_transportista(envio_id)));
alter policy avisos_sel on public.avisos using (((select ve_todo()) OR ((para = 'cliente'::text) AND (cliente_id = (select cliente_del_usuario()))) OR ((para = 'transportista'::text) AND (transportista_id = (select transportista_del_usuario())))));
alter policy avisos_vistos_sel on public.avisos_vistos using ((usuario_id = (select auth.uid())));
alter policy notas_internas_sel on public.notas_internas using ((select ve_todo()));
alter policy notas_internas_ins on public.notas_internas with check ((select es_equipo_dynamo()));
alter policy notas_internas_upd on public.notas_internas using ((select es_equipo_dynamo())) with check ((select es_equipo_dynamo()));
alter policy notas_internas_del on public.notas_internas using ((select es_equipo_dynamo()));
alter policy contraoferta_intentos_sel on public.contraoferta_intentos using ((select ve_todo()));
alter policy hitos_sel on public.envio_hitos using (((select es_equipo_dynamo()) OR (select ve_todo())));
alter policy firmas_sel on public.firmas_cmr using (((select es_equipo_dynamo()) OR (select ve_todo())));
alter policy documentos_sel on public.documentos using (((select es_equipo_dynamo()) OR ((NOT borrado) AND (visible_cliente OR ((creado_por = (select auth.uid())) AND (tipo = ANY (ARRAY['foto_incidencia'::text, 'adjunto'::text])))) AND (envio_del_cliente(envio_id) OR (EXISTS ( SELECT 1
   FROM incidencias i
  WHERE ((i.id = documentos.incidencia_id) AND (i.cliente_id = (select cliente_del_usuario()))))) OR (EXISTS ( SELECT 1
   FROM almacenamientos a
  WHERE ((a.id = documentos.almacenamiento_id) AND (a.cliente_id = (select cliente_del_usuario()))))))) OR ((NOT borrado) AND (tipo = 'logo'::text) AND (EXISTS ( SELECT 1
   FROM operadores o
  WHERE ((o.id = documentos.operador_id) AND (o.cliente_id = (select cliente_del_usuario())))))) OR ((NOT borrado) AND (usuario_id = (select auth.uid()))) OR ((NOT borrado) AND ((select transportista_del_usuario()) IS NOT NULL) AND ((transportista_id = (select transportista_del_usuario())) OR (envio_del_transportista(envio_id) AND ((tipo = ANY (ARRAY['orden_transporte'::text, 'cmr'::text, 'cmr_firmado'::text, 'albaran'::text, 'gps_tacografo'::text])) OR (creado_por = (select auth.uid()))))))));
alter policy documentos_ins on public.documentos with check (((select es_equipo_dynamo()) OR ((storage_ruta ~~ (('u/'::text || ((select auth.uid()))::text) || '/%'::text)) AND (((tipo = ANY (ARRAY['foto_incidencia'::text, 'adjunto'::text])) AND (incidencia_id IS NOT NULL) AND (envio_id IS NULL) AND (transportista_id IS NULL) AND (almacenamiento_id IS NULL) AND (penalizacion_id IS NULL) AND (operador_id IS NULL) AND (usuario_id IS NULL) AND (EXISTS ( SELECT 1
   FROM incidencias i
  WHERE ((i.id = documentos.incidencia_id) AND (i.cliente_id = (select cliente_del_usuario())))))) OR ((tipo = 'logo'::text) AND (operador_id IS NOT NULL) AND (envio_id IS NULL) AND (incidencia_id IS NULL) AND (transportista_id IS NULL) AND (almacenamiento_id IS NULL) AND (penalizacion_id IS NULL) AND (usuario_id IS NULL) AND (EXISTS ( SELECT 1
   FROM operadores o
  WHERE ((o.id = documentos.operador_id) AND (o.cliente_id = (select cliente_del_usuario())))))) OR ((tipo = ANY (ARRAY['hoja_cif'::text, 'dni'::text, 'otro'::text])) AND (usuario_id = (select auth.uid())) AND (envio_id IS NULL) AND (incidencia_id IS NULL) AND (transportista_id IS NULL) AND (almacenamiento_id IS NULL) AND (penalizacion_id IS NULL) AND (operador_id IS NULL))))));
alter policy documentos_ins_transportista on public.documentos with check (((tipo = ANY (ARRAY['albaran'::text, 'cmr_firmado'::text, 'foto_incidencia'::text, 'gps_tacografo'::text, 'adjunto'::text])) AND (storage_ruta ~~ (('u/'::text || ((select auth.uid()))::text) || '/%'::text)) AND (envio_id IS NOT NULL) AND envio_del_transportista(envio_id) AND (incidencia_id IS NULL) AND (transportista_id IS NULL) AND (almacenamiento_id IS NULL) AND (penalizacion_id IS NULL) AND (operador_id IS NULL) AND (usuario_id IS NULL)));
alter policy distancias_sitios_ve_todo on public.distancias_sitios using ((select ve_todo()));
alter policy sitio_horarios_del on public.sitio_horarios using (((select es_equipo_dynamo()) OR (EXISTS ( SELECT 1
   FROM sitios l
  WHERE ((l.id = sitio_horarios.sitio_id) AND (l.cliente_id = (select cliente_del_usuario())))))));
alter policy sitio_horarios_ins on public.sitio_horarios with check (((select es_equipo_dynamo()) OR (EXISTS ( SELECT 1
   FROM sitios l
  WHERE ((l.id = sitio_horarios.sitio_id) AND (l.cliente_id = (select cliente_del_usuario())))))));
alter policy sitio_horarios_upd on public.sitio_horarios using (((select es_equipo_dynamo()) OR (EXISTS ( SELECT 1
   FROM sitios l
  WHERE ((l.id = sitio_horarios.sitio_id) AND (l.cliente_id = (select cliente_del_usuario()))))))) with check (((select es_equipo_dynamo()) OR (EXISTS ( SELECT 1
   FROM sitios l
  WHERE ((l.id = sitio_horarios.sitio_id) AND (l.cliente_id = (select cliente_del_usuario())))))));
alter policy sitios_del on public.sitios using ((select es_equipo_dynamo()));
alter policy sitios_sel on public.sitios using (((select es_equipo_dynamo()) OR ((NOT borrado) AND es_almacen_dynamo AND ((select auth.uid()) IS NOT NULL)) OR (cliente_id = (select cliente_del_usuario()))));
alter policy sitios_upd on public.sitios using (((select es_equipo_dynamo()) OR (cliente_id = (select cliente_del_usuario())))) with check (((select es_equipo_dynamo()) OR ((cliente_id = (select cliente_del_usuario())) AND (NOT es_almacen_dynamo))));

-- ---- Índices ----------------------------------------------------------------------
create index if not exists idx_envios_estado_creado on public.envios (estado, creado_en desc);
create index if not exists idx_envios_cliente_creado on public.envios (cliente_id, creado_en desc);
comment on index public.idx_envios_estado_creado is 'Listas de envíos por estado ordenadas por fecha de alta (lo más nuevo primero).';
comment on index public.idx_envios_cliente_creado is 'Envíos de un cliente ordenados por fecha de alta (mis_envios, ficha del cliente).';
-- Igual que el índice único ux_envio_paradas_orden (envio_id, orden): sobraba.
drop index if exists public.idx_paradas_envio;
