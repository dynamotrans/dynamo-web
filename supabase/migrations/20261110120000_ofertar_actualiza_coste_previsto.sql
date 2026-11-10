-- =====================================================================================
-- OFERTAR CON OTRO PRECIO ACTUALIZA EL COSTE PREVISTO (usuario, 2026-11-10)
-- =====================================================================================
-- «Cuando oferto con otro precio no cambia el precio transportista»: la ficha seguía
-- enseñando el coste previsto del tarifador (p. ej. 600 €) aunque la última oferta
-- saliera a 650 €, y el margen se calculaba con el dato viejo. Ahora ofertar_envio,
-- además de crear la oferta, deja `importe_transportista` en el precio ofertado: es
-- el coste esperado si la aceptan, y `margen_euros` (columna generada) se recalcula
-- solo. Es seguro porque la función ya rechaza envíos con transportista confirmado,
-- así que nunca pisa un precio pactado; con varias ofertas vivas, vale la última.
-- Copia de la versión de 20261105410000 (textos «envío») con ese único cambio.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.ofertar_envio(p_envio uuid, p_transportista uuid, p_canal text, p_precio numeric, p_banda_pct smallint DEFAULT 10, p_pronto_pago boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_estado estado_envio; v_asig estado_asignacion; v_pp boolean;
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    raise exception 'Solo Dynamo puede ofertar envíos.' using errcode = '42501';
  end if;
  select estado, estado_asignacion into v_estado, v_asig
    from envios where id = p_envio for update;
  if v_estado is null then raise exception 'Ese envío no existe.'; end if;
  if v_estado <> 'programado' then
    raise exception 'Solo se ofertan envíos programados (este está %).', replace(v_estado::text, '_', ' ');
  end if;
  if v_asig = 'confirmada' then
    raise exception 'El envío ya tiene transportista asignado.';
  end if;
  if p_transportista is not null and exists (
       select 1 from transportistas where id = p_transportista
       and estado_operativo <> 'activo') then
    raise exception 'Ese transportista no está activo para ofertar.';
  end if;

  v_pp := p_pronto_pago and coalesce(
            (select pronto_pago from transportistas where id = p_transportista), true);

  insert into envio_ofertas (envio_id, transportista_id, canal, precio_ofertado,
                             banda_pct, pronto_pago, caduca_en)
  values (p_envio, p_transportista, p_canal, p_precio, p_banda_pct, v_pp,
          now() + make_interval(days => (parametro('oferta_dias_caducidad'))::int))
  returning id into v_id;

  perform set_config('dynamo.primera_oferta', 'on', true);
  -- El precio ofertado pasa a ser el coste previsto del envío (2026-11-10): sin
  -- transportista confirmado no hay precio pactado que pisar, y el margen de la
  -- ficha se recalcula solo (margen_euros es columna generada).
  update envios set importe_transportista = p_precio,
                    estado_asignacion = case when estado_asignacion = 'sin_asignar'
                                             then 'ofertada'::estado_asignacion
                                             else estado_asignacion end
   where id = p_envio;
  perform set_config('dynamo.primera_oferta', '', true);

  perform registrar_hito(p_envio, 'ofertado', null, v_id,
    jsonb_build_object('transportista_id', p_transportista, 'canal', p_canal,
                       'precio', p_precio, 'banda_pct', p_banda_pct, 'pronto_pago', v_pp));
  return v_id;
end $function$;
comment on function public.ofertar_envio(uuid, uuid, text, numeric, smallint, boolean) is '[Envíos] Crea una oferta de un envío programado a un transportista (o abierta, por enlace o bolsa), con su precio, banda de negociación y pronto pago, y deja ese precio como coste previsto del envío (importe_transportista; el margen se recalcula solo). Rechaza envíos con transportista confirmado o fuera de «programado». Devuelve el id de la oferta. Quién: Dynamo (admin o empleado) o el servidor (n8n). Argumentos: p_envio: envios.id · p_transportista: transportistas.id (opcional; null = oferta abierta) · p_canal: email | whatsapp | enlace | bolsa_* · p_precio: euros sin IVA · p_banda_pct: 0 | 5 | 10 | 30 · p_pronto_pago: si se ofrece pronto pago.';
