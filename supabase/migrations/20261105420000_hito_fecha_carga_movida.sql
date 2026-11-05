-- =====================================================================================
-- Hito nuevo «fecha_carga_movida»: al recibir el pago previo tarde, la carga pasa al primer
-- día posible (lo usa la migración siguiente, 20261105420100_fecha_carga_al_pagar).
-- Va sola porque un valor nuevo de un tipo no se puede usar en la misma transacción.
-- =====================================================================================
alter type public.tipo_hito add value if not exists 'fecha_carga_movida';
comment on column public.envio_hitos.hito is 'formato: lista cerrada (tipo_hito) | rango: no aplica | lista: creado, confirmado, publicado_bolsa, transportista_asignado, transportista_quitado, matricula_asignada, cargado, entregado, cancelado, cancelacion_deshecha, ofertado, enlace_abierto, reservado, reserva_caducada, reserva_liberada, contraoferta_propuesta, contraoferta_resuelta, orden_carga_enviada, cmr_firmado, pin_enviado, pin_validado, pin_validado_manual, pin_fuera_de_orden, pin_bloqueado, incidencia, ruta_cambiada, fecha_carga_movida | obligatorio | Qué pasó (creado, confirmado, transportista_asignado, cargado, entregado, cancelado, ofertado, reservado, pin_validado, ruta_cambiada, fecha_carga_movida (el pago llegó tarde y la carga pasó al primer día posible)…). Cliente y transportista solo ven algunos.';
