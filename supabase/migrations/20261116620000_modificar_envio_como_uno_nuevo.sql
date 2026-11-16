-- =====================================================================================
-- MODIFICAR UN ENVÍO SIN TRANSPORTISTA ES COMO HACER UNO NUEVO, TAMBIÉN LA FECHA
-- (usuario, 2026-11-16)
-- =====================================================================================
-- «Sin transportista asignado ni había coste, ¿no? ¿Qué más da? Si cancelar no tenía
-- coste, modificar tampoco. ES COMO UN NUEVO ENVÍO. NO LIEMOS.»
--
-- La migración anterior (20261116610000) dejaba cambiarlo todo menos una cosa: pasada la
-- hora límite para cancelar gratis, la fecha de carga ya no se podía mover desde la
-- ficha. Se quita. Mientras el envío no tenga transportista, el cliente cambia también
-- la fecha, con las reglas de siempre de un envío nuevo (días hábiles y horas de corte:
-- si pide cargar hoy o mañana con fecha fija, entra con sus cortes y su precio).
--
-- QUÉ SE PIERDE, para que conste: una cancelación tardía sin camión no cuesta dinero,
-- pero sí cuenta para la suspensión automática por cancelaciones (regla del 2026-11-04).
-- Ahora un cliente podría alejar la fecha y cancelar después sin que le cuente. Es poca
-- cosa y Dynamo se entera siempre: cada modificación deja su aviso en la campana.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.modificar_envio_cliente(uuid, jsonb, jsonb)'::regprocedure);
  n := replace(v, E'    if e.fecha_carga_desde is not null and now() >= corte_cancelacion(e.fecha_carga_desde) then\n      raise exception ''Falta poco para la carga: la fecha ya no se puede cambiar desde aquí. Contáctanos y lo vemos.'';\n    end if;\n', '');
  if n = v then raise exception 'modificar_envio_cliente: no encuentro el bloqueo de la fecha para quitarlo'; end if;
  execute n;
end $$;
comment on function public.modificar_envio_cliente(uuid, jsonb, jsonb) is '[Envíos] El cliente modifica su envío entero desde el asistente, como si fuera uno nuevo: ruta, mercancía, fechas y el precio recalculado por el tarifador. Solo su envío de Dynamo, programado y sin transportista (ni asignado ni aceptándolo ahora). Las fechas siguen las reglas de un envío nuevo (días hábiles y horas de corte); con el envío pagado por adelantado no se puede cambiar el precio. Avisa a Dynamo en la campana. Devuelve {resultado: modificado, precio_antes, precio_ahora}. Quién: cliente dueño del envío. Argumentos: p_envio: envios.id · p_datos: los mismos campos que crear_envio_cliente · p_paradas: la ruta nueva (como cambiar_ruta_envio), o null si la ruta no cambia.';
