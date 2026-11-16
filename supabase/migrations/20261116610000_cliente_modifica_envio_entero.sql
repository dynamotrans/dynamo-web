-- =====================================================================================
-- EL CLIENTE MODIFICA SU ENVÍO ENTERO, COMO SI FUERA UNO NUEVO (usuario, 2026-11-16)
-- =====================================================================================
-- «Si modifica es como una ruta nueva básicamente… recalcula todo de nuevo.»
--
-- El botón «Modificar envío» de la ficha del cliente abre el mismo asistente de «Nuevo
-- envío», ya relleno, y al guardar se aplica todo de una vez: ruta, mercancía, fechas y
-- el precio que el tarifador ha vuelto a calcular. Ya no hay que «pedir un cambio» y
-- esperar: mientras no haya transportista, el cliente lo cambia él.
--
-- REGLAS (las mismas del botón, comprobadas aquí porque la pantalla no manda):
--   · Solo su envío, programado, de Dynamo (no los de transportista propio).
--   · Solo SIN TRANSPORTISTA (ni asignado ni aceptándolo ahora): envio_con_transportista.
--   · Las fechas siguen las reglas de un envío nuevo (días hábiles, horas de corte). Una
--     fecha que no se toca se respeta tal cual.
--   · PASADA LA HORA LÍMITE PARA CANCELAR GRATIS, LA FECHA YA NO SE CAMBIA DESDE AQUÍ: si
--     no, el cliente alejaría la carga y después cancelaría «a tiempo» sin que cuente
--     (revisión de seguridad del 2026-11-04). Lo demás sí se puede cambiar.
--   · Si el envío ya está PAGADO por adelantado y el cambio mueve el precio, no se puede
--     desde aquí: hay que ajustar el pago con Dynamo (lo mismo que ya impide la base de
--     datos al equipo). Con el pago aún pendiente, el importe a pagar pasa a ser el nuevo.
--
-- QUÉ PASA DESPUÉS, solo:
--   · El cliente recibe el email «Envío modificado» (ya existía).
--   · Dynamo recibe un aviso en la campana con el antes → ahora del precio, para revisar
--     el precio del transportista y, si ya estaba en la bolsa o con ofertas enviadas,
--     actualizarlo allí.
--   · La oferta escalonada sigue al envío (ya lo hacía: fechas y ruta nuevas).

-- ---- 1. Cambiar las paradas de un envío, sin mirar quién lo pide ----------------------
-- Es el cuerpo de cambiar_ruta_envio tal como está hoy en la base de datos, sin la
-- comprobación de «solo el equipo de Dynamo». No se llama desde fuera: la usan las
-- funciones que ya han comprobado el permiso (aquí, modificar_envio_cliente).
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.cambiar_ruta_envio(uuid, jsonb)'::regprocedure);
  n := replace(v, 'FUNCTION public.cambiar_ruta_envio(', 'FUNCTION public.ruta_envio_reemplazar(');
  if n = v then raise exception 'cambiar_ruta_envio: no encuentro la cabecera para copiarla'; end if;
  v := n;
  n := replace(v, E'  if not es_equipo_dynamo() then\n    raise exception ''Solo el equipo de Dynamo puede cambiar la ruta.'' using errcode = ''42501'';\n  end if;\n', '');
  if n = v then raise exception 'cambiar_ruta_envio: no encuentro la comprobación de permiso para quitarla'; end if;
  execute n;
end $$;
revoke execute on function ruta_envio_reemplazar(uuid, jsonb) from public, anon, authenticated;
comment on function public.ruta_envio_reemplazar(uuid, jsonb) is '[Ayudantes internos] Cambia las paradas de un envío (mantiene las que traen id, crea las demás, quita las que no vienen) y anota el hito ruta_cambiada. Es cambiar_ruta_envio sin la comprobación de permiso: solo la llaman funciones que ya lo han comprobado. Quién: nadie la llama desde fuera. Argumentos: p_envio: el envío · p_paradas: la ruta nueva, en orden.';

-- ---- 2. El cliente modifica su envío entero --------------------------------------------
create or replace function modificar_envio_cliente(p_envio uuid, p_datos jsonb, p_paradas jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e envios%rowtype;
  v_importe numeric := round((p_datos ->> 'importe_cliente')::numeric, 2);
  v_desde date; v_hasta date; v_vdias int; v_fechas boolean; v_cli text; v_movia boolean;
begin
  if not envio_del_cliente(p_envio)
     or not exists (select 1 from usuarios u where u.id = auth.uid() and u.estado = 'activa') then
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  select * into e from envios where id = p_envio for update;
  if coalesce(e.es_manual, false) then
    raise exception 'Es un envío con tu propio transportista: se modifica desde su ficha.';
  end if;
  if e.estado <> 'programado' then
    raise exception 'El envío ya no se puede modificar desde aquí (está %). Contáctanos y lo vemos.', replace(e.estado::text, '_', ' ');
  end if;
  if coalesce(envio_con_transportista(p_envio), true) then
    raise exception 'Tu envío ya tiene transportista asignado: no se puede modificar desde aquí. Contáctanos y lo vemos.';
  end if;
  if e.estado_cambio_cliente = 'pendiente' then
    raise exception 'Ya tienes un cambio pendiente en este envío: espera a que te contestemos.';
  end if;
  if v_importe is null or v_importe <= 0 or v_importe > 100000 then
    raise exception 'Falta el precio del envío (lo pone el tarifador).';
  end if;

  -- Fechas: las de un envío nuevo. La que no se toca, se respeta.
  v_desde := (p_datos ->> 'fecha_carga_desde')::date;
  v_hasta := coalesce((p_datos ->> 'fecha_carga_hasta')::date, v_desde);
  if v_desde is null then raise exception 'Elige una fecha de recogida.'; end if;
  if v_hasta < v_desde then raise exception 'La ventana no puede terminar antes de empezar.'; end if;
  v_fechas := (v_desde, v_hasta) is distinct from (e.fecha_carga_desde, coalesce(e.fecha_carga_hasta, e.fecha_carga_desde));
  if v_fechas then
    if e.fecha_carga_desde is not null and now() >= corte_cancelacion(e.fecha_carga_desde) then
      raise exception 'Falta poco para la carga: la fecha ya no se puede cambiar desde aquí. Contáctanos y lo vemos.';
    end if;
    if not es_dia_habil(v_desde) or not es_dia_habil(v_hasta) then
      raise exception 'La recogida solo puede empezar y terminar en un día hábil (sin sábados, domingos ni festivos).';
    end if;
    v_vdias := dias_ventana_carga(v_desde, v_hasta);
    if v_desde < primera_fecha_carga(v_hasta = v_desde, now(), v_vdias) then
      raise exception 'Esa fecha ya no se puede elegir (hora de corte): el primer día posible ahora mismo es el %.',
        to_char(primera_fecha_carga(v_hasta = v_desde, now(), v_vdias), 'DD/MM/YYYY');
    end if;
  end if;

  if e.estado_pago_previo = 'pagado' and v_importe is distinct from e.importe_cliente then
    raise exception 'Este envío ya está pagado por adelantado y el cambio modifica el precio: contáctanos para ajustar el pago.';
  end if;

  v_movia := coalesce(envio_asignandose(p_envio), false);
  perform set_config('dynamo.cambio_envio', 'on', true);
  -- La ruta, solo si ha cambiado (las paradas que siguen conservan su referencia y sus anotaciones).
  if p_paradas is not null then perform ruta_envio_reemplazar(p_envio, p_paradas); end if;
  update envios set
    referencia_cliente = nullif(trim(p_datos ->> 'referencia_cliente'), ''),
    fecha_carga_desde = v_desde,
    fecha_carga_hasta = case when v_fechas then (p_datos ->> 'fecha_carga_hasta')::date else fecha_carga_hasta end,
    descripcion_mercancia = nullif(trim(p_datos ->> 'descripcion_mercancia'), ''),
    toneladas = (p_datos ->> 'toneladas')::numeric, metros_lineales = (p_datos ->> 'metros_lineales')::numeric,
    paletizado = coalesce((p_datos ->> 'paletizado')::boolean, true), carga_lateral = coalesce((p_datos ->> 'carga_lateral')::boolean, true),
    carga_trasera = coalesce((p_datos ->> 'carga_trasera')::boolean, false), carga_techo = coalesce((p_datos ->> 'carga_techo')::boolean, false),
    requiere_plataforma_elevadora = coalesce((p_datos ->> 'requiere_plataforma_elevadora')::boolean, false),
    requiere_nima = coalesce((p_datos ->> 'requiere_nima')::boolean, false), adr = coalesce((p_datos ->> 'adr')::boolean, false),
    discrecion_comercial = coalesce((p_datos ->> 'discrecion_comercial')::boolean, false),
    anotaciones_cliente = left(nullif(trim(p_datos ->> 'anotaciones_cliente'), ''), 1000),
    importe_cliente = v_importe,
    -- Un precio recalculado por el tarifador deja de ser «fijado a mano».
    precio_fijado_a_mano = case when v_importe is distinct from e.importe_cliente then false else precio_fijado_a_mano end
   where id = p_envio;
  perform set_config('dynamo.cambio_envio', 'off', true);

  -- Dynamo se entera siempre: hay que revisar el precio del transportista.
  select nombre_visible into v_cli from clientes where id = e.cliente_id;
  perform crear_aviso('dynamo', null, null, 'envio_modificado_cliente', 'aviso', 'Envío modificado por el cliente · #' || coalesce(e.referencia_gx, ''),
    coalesce(v_cli, 'El cliente') || ' ha modificado su envío'
      || case when p_paradas is not null then ' (ruta nueva)' else '' end
      || case when v_fechas then '. Carga: ' || envio_fecha_carga_texto(v_desde, v_hasta, null) else '' end
      || case when v_importe is distinct from e.importe_cliente
              then '. Precio: ' || euros_texto(e.importe_cliente) || ' → ' || euros_texto(v_importe) else '. El precio no cambia' end
      || '. Revisa el precio del transportista'
      || case when v_movia then ' y actualízalo en la bolsa y en las ofertas enviadas.' else '.' end,
    '/panel/envios?ver=' || p_envio, p_envio);
  return jsonb_build_object('resultado', 'modificado', 'precio_antes', e.importe_cliente, 'precio_ahora', v_importe);
end $$;
revoke execute on function modificar_envio_cliente(uuid, jsonb, jsonb) from public, anon;
grant execute on function modificar_envio_cliente(uuid, jsonb, jsonb) to authenticated;
comment on function public.modificar_envio_cliente(uuid, jsonb, jsonb) is '[Envíos] El cliente modifica su envío entero desde el asistente, como si fuera uno nuevo: ruta, mercancía, fechas y el precio recalculado por el tarifador. Solo su envío de Dynamo, programado y sin transportista (ni asignado ni aceptándolo ahora). Las fechas siguen las reglas de un envío nuevo; pasada la hora límite de cancelación la fecha ya no se cambia; con el envío pagado por adelantado no se puede cambiar el precio. Avisa a Dynamo en la campana. Devuelve {resultado: modificado, precio_antes, precio_ahora}. Quién: cliente dueño del envío. Argumentos: p_envio: envios.id · p_datos: los mismos campos que crear_envio_cliente · p_paradas: la ruta nueva (como cambiar_ruta_envio), o null si la ruta no cambia.';
