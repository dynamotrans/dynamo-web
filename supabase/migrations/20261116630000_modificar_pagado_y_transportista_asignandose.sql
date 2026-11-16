-- =====================================================================================
-- MODIFICAR UN ENVÍO YA PAGADO, Y «UN TRANSPORTISTA SE ESTÁ ASIGNANDO» (usuario, 2026-11-16)
-- =====================================================================================
-- 1. PAGO POR ADELANTADO AL MODIFICAR. «Si no había pagado, la proforma se actualiza a lo
--    nuevo. Si ya había pagado y el precio es superior, falta por pagar y no deja proceder
--    hasta pagar el resto. Si sobra, ya nos llamará para devolver; en Holded sabremos por
--    la factura que ha pagado de más y se le devolverá.»
--
--      · SIN PAGAR todavía: el importe a pagar es siempre el del envío tal como está. Ya
--        era así (la proforma y el cobro leen el precio en el momento).
--      · PAGADO y el precio SUBE: lo pagado queda apuntado «a cuenta» (envios.pago_a_cuenta,
--        total con IVA) y el envío vuelve a «pendiente de pago» por la DIFERENCIA. Mientras
--        tanto no se puede ofertar, publicar ni asignar (la misma barrera de siempre). Este
--        resto NO anula el envío por falta de pago: ya hay dinero cobrado; lo lleva Dynamo.
--      · PAGADO y el precio BAJA (o no cambia): sigue pagado. Si baja, Dynamo recibe un
--        aviso con lo pagado de más para devolverlo.
--    Hasta ahora, modificar el precio de un envío pagado estaba prohibido al cliente.
--
-- 2. UN TRANSPORTISTA SE ESTÁ ASIGNANDO. «En esos casos mejor dejar como asignando y
--    bloquear el botón de cancelar o modificar, y se avisa que un transportista se está
--    asignando en este momento.» Mientras hay una reserva en curso (alguien aceptando el
--    envío) o una contraoferta pendiente de revisar, el cliente no puede ni modificar ni
--    cancelar: si no, vería «sin transportista» y cancelaría gratis justo cuando ya hay uno
--    comprometiéndose. Dura lo que dura la reserva (minutos) o hasta que Dynamo resuelve la
--    contraoferta. La ficha lo dice y apaga los dos botones; aquí se comprueba de verdad.

-- ---- 1. Lo pagado a cuenta ------------------------------------------------------------
alter table envios add column pago_a_cuenta numeric(12, 2) check (pago_a_cuenta is null or pago_a_cuenta >= 0);
comment on column public.envios.pago_a_cuenta is 'formato: importe en euros con 2 decimales | rango: 0 o más | lista: no aplica | automático | Importe total (con IVA) ya cobrado por adelantado cuando el cliente modificó el envío y el precio subió: lo que falta por pagar es el total de ahora menos esto. Vacío en los envíos que no han pasado por eso. Lo pone modificar_envio_cliente().';

-- Lo que falta por pagar AHORA de un envío con pago previo: el total menos lo ya pagado a
-- cuenta. Cero si no está pendiente de pago.
create or replace function pago_envio_pendiente(p_envio uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case when e.estado_pago_previo = 'pendiente' then greatest(i.total - coalesce(e.pago_a_cuenta, 0), 0) else 0 end
    from envios e cross join lateral pago_envio_importes(e.id) i
   where e.id = p_envio
$$;
revoke execute on function pago_envio_pendiente(uuid) from public, anon, authenticated;
comment on function public.pago_envio_pendiente(uuid) is '[Precio y pago] Lo que falta por pagar ahora de un envío con pago previo: su total con IVA menos lo ya pagado a cuenta (cuando el precio subió al modificarlo). Cero si no está pendiente de pago. Quién: solo uso interno (pagos_envio y el cobro con tarjeta). Argumentos: p_envio: envios.id.';

-- La consulta de pagos enseña también lo pagado a cuenta y lo que falta.
drop function pagos_envio(uuid);
create function pagos_envio(p_envio uuid default null)
returns table (envio_id uuid, referencia_gx text, referencia_cliente text, estado text, estado_pago_previo text, pago_motivo text, pago_metodo text,
               pagado_en timestamptz, base numeric, iva numeric, total numeric, pago_limite timestamptz, precio_provisional boolean,
               a_cuenta numeric, pendiente numeric)
language sql stable security definer set search_path = public as $$
  select e.id, e.referencia_gx, e.referencia_cliente, e.estado::text, e.estado_pago_previo, e.pago_motivo, e.pago_metodo, e.pagado_en, i.base, i.iva, i.total,
         -- El resto de un envío ya pagado en parte no tiene hora límite: no se anula solo.
         case when e.estado_pago_previo = 'pendiente' and e.pago_pendiente_en is not null and coalesce(e.pago_a_cuenta, 0) = 0
              then pago_limite(e.pago_pendiente_en, e.fecha_carga_desde) end,
         precio_por_revisar(e.estado_revision_precio),
         coalesce(e.pago_a_cuenta, 0),
         case when e.estado_pago_previo = 'pendiente' then greatest(i.total - coalesce(e.pago_a_cuenta, 0), 0) else 0 end
    from envios e cross join lateral pago_envio_importes(e.id) i
   where e.estado_pago_previo <> 'no_requerido'
     and (p_envio is null or e.id = p_envio)
     and (ve_todo() or e.cliente_id = cliente_del_usuario())
$$;
revoke all on function public.pagos_envio(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pagos_envio(uuid) to authenticated;
grant execute on function public.pagos_envio(uuid) to service_role;
comment on function public.pagos_envio(p_envio uuid) is '[Precio y pago] Envíos que requieren pago previo con su situación: estado del pago, motivo, método, cuándo se pagó, base, IVA y total en euros, hora límite para pagar, si el precio es provisional, lo ya pagado a cuenta (cuando el precio subió al modificar un envío pagado) y lo que falta por pagar ahora. Quién: Dynamo (todos) y el cliente (los suyos). Argumentos: p_envio: envios.id, o vacío para todos.';

-- El cobro con tarjeta se compara con lo que FALTA, no con el total.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.pago_envio_stripe(uuid, text, bigint)'::regprocedure);
  n := replace(v, 'select total into t from pago_envio_importes(p_envio);', 't := pago_envio_pendiente(p_envio);');
  if n = v then raise exception 'pago_envio_stripe: no encuentro la comparación del importe'; end if;
  execute n;
end $$;

-- El resto de un envío pagado en parte no se anula solo por falta de pago.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.caducar_pagos_pendientes()'::regprocedure);
  n := replace(v, 'and transportista_id is null and stripe_cobro_sin_aplicar is null', 'and transportista_id is null and stripe_cobro_sin_aplicar is null and coalesce(pago_a_cuenta, 0) = 0');
  if n = v then raise exception 'caducar_pagos_pendientes: no encuentro el filtro para ampliarlo'; end if;
  execute n;
end $$;

-- Los dos guardianes del pago dejan pasar a modificar_envio_cliente (y solo a ella: lo
-- marca con dynamo.modifica_cliente dentro de su transacción).
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.fn_envios_aa_previo_pago()'::regprocedure);
  n := replace(v, 'dynamo boolean := es_servidor() or es_equipo_dynamo();',
                  'dynamo boolean := es_servidor() or es_equipo_dynamo() or coalesce(current_setting(''dynamo.modifica_cliente'', true), '''') = ''on'';');
  if n = v then raise exception 'fn_envios_aa_previo_pago: no encuentro quién puede tocar el pago'; end if;
  execute n;
  v := pg_get_functiondef('public.fn_envios_ae_pagado_precio()'::regprocedure);
  n := replace(v, 'if old.estado_pago_previo = ''pagado'' and new.estado_pago_previo = ''pagado''',
                  'if coalesce(current_setting(''dynamo.modifica_cliente'', true), '''') <> ''on'' and old.estado_pago_previo = ''pagado'' and new.estado_pago_previo = ''pagado''');
  if n = v then raise exception 'fn_envios_ae_pagado_precio: no encuentro la condición para ampliarla'; end if;
  execute n;
end $$;

-- ---- 2. ¿Hay un transportista asignándose ahora mismo? --------------------------------
create or replace function envio_transportista_asignandose(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select e.transportista_id is null
         and exists (select 1 from envio_reservas r where r.envio_id = e.id and r.estado in ('viva', 'pendiente_revision'))
    from envios e where e.id = p_envio
$$;
revoke execute on function envio_transportista_asignandose(uuid) from public, anon, authenticated;
comment on function public.envio_transportista_asignandose(uuid) is '[Ayudantes internos] ¿Hay un transportista asignándose a este envío ahora mismo? Sin transportista todavía, pero con una reserva en curso o una contraoferta pendiente de revisar. Mientras dura, el cliente no puede modificar ni cancelar. Quién: nadie la llama desde fuera. Argumentos: p_envio: el envío.';

-- La ficha del cliente lo necesita para apagar los botones y avisar.
create or replace function mi_envio_asignandose(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(envio_transportista_asignandose(p_envio), false) and envio_del_cliente(p_envio)
$$;
revoke execute on function mi_envio_asignandose(uuid) from public, anon;
grant execute on function mi_envio_asignandose(uuid) to authenticated;
comment on function public.mi_envio_asignandose(uuid) is '[Envíos] Para el cliente: ¿hay un transportista asignándose a su envío en este momento (reserva en curso o contraoferta pendiente)? Mientras dura, la ficha apaga «Modificar envío» y «Cancelar envío». Quién: cliente dueño del envío. Argumentos: p_envio: envios.id.';

-- Cancelar: con un transportista asignándose, no.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.cancelar_mi_envio(uuid, text)'::regprocedure);
  n := replace(v, E'  if v_estado not in (''borrador'', ''programado'') then\n',
                  E'  if coalesce(envio_transportista_asignandose(p_envio), false) then\n    raise exception ''Un transportista se está asignando a tu envío en este momento: ahora no se puede cancelar. Espera unos minutos o llámanos al %.'', tel_dynamo();\n  end if;\n  if v_estado not in (''borrador'', ''programado'') then\n');
  if n = v then raise exception 'cancelar_mi_envio: no encuentro dónde poner la comprobación'; end if;
  execute n;
end $$;

-- ---- 3. Modificar: con el pago y con el aviso de «asignándose» -------------------------
-- (entera: es la de 20261116610000 sin el bloqueo de la fecha que quitó 20261116620000,
-- con el transportista asignándose aparte y el pago por adelantado resuelto)
create or replace function modificar_envio_cliente(p_envio uuid, p_datos jsonb, p_paradas jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e envios%rowtype;
  v_importe numeric := round((p_datos ->> 'importe_cliente')::numeric, 2);
  v_desde date; v_hasta date; v_vdias int; v_fechas boolean; v_cli text; v_movia boolean;
  v_pagado numeric := 0; v_total numeric; v_falta numeric := 0; v_sobra numeric := 0;
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
  if e.transportista_id is not null then
    raise exception 'Tu envío ya tiene transportista asignado: no se puede modificar desde aquí. Contáctanos y lo vemos.';
  end if;
  if coalesce(envio_transportista_asignandose(p_envio), true) then
    raise exception 'Un transportista se está asignando a tu envío en este momento: ahora no se puede modificar. Espera unos minutos o contáctanos.';
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
    if not es_dia_habil(v_desde) or not es_dia_habil(v_hasta) then
      raise exception 'La recogida solo puede empezar y terminar en un día hábil (sin sábados, domingos ni festivos).';
    end if;
    v_vdias := dias_ventana_carga(v_desde, v_hasta);
    if v_desde < primera_fecha_carga(v_hasta = v_desde, now(), v_vdias) then
      raise exception 'Esa fecha ya no se puede elegir (hora de corte): el primer día posible ahora mismo es el %.',
        to_char(primera_fecha_carga(v_hasta = v_desde, now(), v_vdias), 'DD/MM/YYYY');
    end if;
  end if;

  -- Lo que ya lleva pagado por adelantado (total con IVA): todo si está pagado; lo
  -- apuntado a cuenta si ya venía de otra modificación con el resto sin pagar.
  if e.estado_pago_previo = 'pagado' then select total into v_pagado from pago_envio_importes(p_envio);
  elsif e.estado_pago_previo = 'pendiente' then v_pagado := coalesce(e.pago_a_cuenta, 0);
  end if;

  v_movia := coalesce(envio_asignandose(p_envio), false);
  perform set_config('dynamo.cambio_envio', 'on', true);
  perform set_config('dynamo.modifica_cliente', 'on', true);
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

  -- EL PAGO POR ADELANTADO con el precio nuevo.
  if v_pagado > 0 then
    select total into v_total from pago_envio_importes(p_envio);
    if v_total > v_pagado then
      -- Falta la diferencia: vuelve a «pendiente de pago» y no sigue hasta pagarla.
      v_falta := v_total - v_pagado;
      update envios set estado_pago_previo = 'pendiente', pago_a_cuenta = v_pagado,
                        pago_motivo = coalesce(pago_motivo, 'Diferencia por modificar el envío')
       where id = p_envio;
    else
      -- Cubierto con lo ya pagado: pagado. Lo que sobre lo devuelve Dynamo.
      v_sobra := v_pagado - v_total;
      update envios set estado_pago_previo = 'pagado', pagado_en = coalesce(pagado_en, now()) where id = p_envio and estado_pago_previo <> 'pagado';
    end if;
  end if;
  perform set_config('dynamo.modifica_cliente', 'off', true);
  perform set_config('dynamo.cambio_envio', 'off', true);

  -- Dynamo se entera siempre: hay que revisar el precio del transportista.
  select nombre_visible into v_cli from clientes where id = e.cliente_id;
  perform crear_aviso('dynamo', null, null, 'envio_modificado_cliente', case when v_falta > 0 or v_sobra > 0 then 'urgente' else 'aviso' end,
    'Envío modificado por el cliente · #' || coalesce(e.referencia_gx, ''),
    coalesce(v_cli, 'El cliente') || ' ha modificado su envío'
      || case when p_paradas is not null then ' (ruta nueva)' else '' end
      || case when v_fechas then '. Carga: ' || envio_fecha_carga_texto(v_desde, v_hasta, null) else '' end
      || case when v_importe is distinct from e.importe_cliente
              then '. Precio: ' || euros_texto(e.importe_cliente) || ' → ' || euros_texto(v_importe) else '. El precio no cambia' end
      || case when v_falta > 0 then '. YA HABÍA PAGADO ' || euros_texto(v_pagado) || ': le faltan ' || euros_texto(v_falta) || ' (con IVA) y el envío no sigue hasta que los pague'
              when v_sobra > 0 then '. YA HABÍA PAGADO ' || euros_texto(v_pagado) || ': ha pagado ' || euros_texto(v_sobra) || ' de más (con IVA), hay que devolvérselos'
              else '' end
      || '. Revisa el precio del transportista'
      || case when v_movia then ' y actualízalo en la bolsa y en las ofertas enviadas.' else '.' end,
    '/panel/envios?ver=' || p_envio, p_envio);
  return jsonb_build_object('resultado', 'modificado', 'precio_antes', e.importe_cliente, 'precio_ahora', v_importe,
                            'falta_pagar', v_falta, 'pagado_de_mas', v_sobra);
end $$;
comment on function public.modificar_envio_cliente(uuid, jsonb, jsonb) is '[Envíos] El cliente modifica su envío entero desde el asistente, como si fuera uno nuevo: ruta, mercancía, fechas y el precio recalculado por el tarifador. Solo su envío de Dynamo, programado y sin transportista; si hay uno asignándose en ese momento (reserva o contraoferta), tampoco. Las fechas siguen las reglas de un envío nuevo. Pago por adelantado: sin pagar, el importe a pagar pasa a ser el nuevo; ya pagado y el precio sube, lo pagado queda a cuenta y el envío vuelve a pendiente de pago por la diferencia; ya pagado y baja, sigue pagado y Dynamo devuelve lo que sobra. Avisa a Dynamo en la campana. Devuelve {resultado: modificado, precio_antes, precio_ahora, falta_pagar, pagado_de_mas}. Quién: cliente dueño del envío. Argumentos: p_envio: envios.id · p_datos: los mismos campos que crear_envio_cliente · p_paradas: la ruta nueva (como cambiar_ruta_envio), o null si la ruta no cambia.';
