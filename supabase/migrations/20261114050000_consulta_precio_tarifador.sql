-- =====================================================================================
-- EL TARIFADOR VUELVE A CONTAR LAS CONSULTAS DE PRECIO (usuario, 2026-11-14)
-- =====================================================================================
-- El contador de «Consultas de precio» (consultas_precio, los límites de uso de la
-- regla 3 y la pantalla «Uso de Dynamo») lo alimentaba el disparador del flujo viejo de
-- solicitudes (estado_solicitud = 'pendiente_precio'), que ya no se usa desde que el
-- tarifador da el precio al instante: el contador se quedaba a 0 para siempre y el
-- límite estaba muerto. Nueva función para que la web registre UNA consulta cada vez
-- que el tarifador enseña un precio a un cliente (una por ruta, no por cada ajuste).

create or replace function public.registrar_consulta_precio()
returns void language plpgsql security definer set search_path = public as $$
declare v_cli uuid := cliente_del_usuario();
begin
  -- Solo cuentan los clientes: el equipo de Dynamo consulta precios sin límite.
  if es_equipo_dynamo() or v_cli is null then return; end if;
  insert into consultas_precio (usuario_id, cliente_id, origen) values (auth.uid(), v_cli, 'tarifador');
end $$;
revoke execute on function public.registrar_consulta_precio() from public, anon;
grant execute on function public.registrar_consulta_precio() to authenticated;
comment on function public.registrar_consulta_precio() is '[Precio y pago] Registra en consultas_precio una consulta del tarifador del cliente que llama (origen tarifador), para los límites de uso de la suspensión automática y la pantalla «Uso de Dynamo». La web la llama una vez por ruta consultada, no por cada ajuste. Para el equipo de Dynamo o un usuario sin cliente no hace nada. Quién: cliente (cuenta activa). Argumentos: ninguno.';
