-- =====================================================================================
-- CONTRAOFERTA DEL CLIENTE: interruptor general (usuario, 2026-11-04)
-- Se ve y se puede usar solo si están encendidos LOS DOS: el general (Parámetros,
-- `contraoferta_cliente_activa`) y el de la ficha del cliente (`permite_contraoferta`).
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('contraoferta_cliente_activa', 'true',
   'Contraoferta del CLIENTE: encendida o apagada para todos. Encendida, solo la ven los clientes que la tengan activada en su ficha.')
on conflict (clave) do nothing;

create or replace function mi_contraoferta(p_envio uuid)
returns table (permitida boolean, propuesta numeric, propuesta_en timestamptz, precio_inicial numeric)
language sql stable security definer set search_path = public as $$
  select c.permite_contraoferta and coalesce((parametro('contraoferta_cliente_activa') #>> '{}')::boolean, false), e.contraoferta_cliente, e.contraoferta_cliente_en, e.precio_inicial_cliente
    from envios e join clientes c on c.id = e.cliente_id
   where e.id = p_envio and envio_del_cliente(p_envio)
$$;

create or replace function contraofertar_precio_solicitud(p_envio uuid, p_importe numeric)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e envios%rowtype; v_permitida boolean; v_rebaja numeric; v_auto numeric; v_max numeric; v_p numeric := round(p_importe, 2);
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  select permite_contraoferta into v_permitida from clientes where id = e.cliente_id;
  if not coalesce(v_permitida, false) or not coalesce((parametro('contraoferta_cliente_activa') #>> '{}')::boolean, false) then
    return jsonb_build_object('resultado', 'no_permitida');
  end if;
  if e.solicitud_estado <> 'precio_propuesto' or e.estado <> 'borrador' then return jsonb_build_object('resultado', 'no_esperando'); end if;
  if e.precio_valido_hasta < now() then
    update envios set solicitud_estado = 'pendiente_precio', precio_valido_hasta = null where id = p_envio;
    return jsonb_build_object('resultado', 'caducado');
  end if;
  if e.fecha_carga_desde <= current_date then return jsonb_build_object('resultado', 'fecha_pasada'); end if;
  if v_p is null or v_p <= 0 then return jsonb_build_object('resultado', 'precio_no_valido'); end if;
  if v_p >= e.importe_cliente then return jsonb_build_object('resultado', 'no_es_rebaja'); end if;

  v_rebaja := (e.importe_cliente - v_p) * 100 / e.importe_cliente;
  v_auto := p_num('contraoferta_cliente_auto_pct', 5);
  v_max  := p_num('contraoferta_cliente_max_pct', 15);
  if v_rebaja > v_max then return jsonb_build_object('resultado', 'demasiado_lejos'); end if;

  perform set_config('dynamo.contraoferta_cliente', 'on', true);
  if v_rebaja <= v_auto then
    update envios set precio_inicial_cliente = importe_cliente, importe_cliente = v_p,
                      contraoferta_cliente = v_p, contraoferta_cliente_en = now(),
                      solicitud_estado = 'aceptada', condiciones_aceptadas_en = now(), estado = 'programado'
     where id = p_envio;
    perform registrar_hito(p_envio, 'contraoferta_resuelta', null, null,
      jsonb_build_object('de', 'cliente', 'precio_base', e.importe_cliente, 'precio_propuesto', v_p, 'decision', 'aceptada_auto'));
    perform set_config('dynamo.contraoferta_cliente', 'off', true);
    return jsonb_build_object('resultado', 'aceptada');
  end if;
  update envios set contraoferta_cliente = v_p, contraoferta_cliente_en = now(),
                    solicitud_estado = 'contraoferta', condiciones_aceptadas_en = now()
   where id = p_envio;
  perform registrar_hito(p_envio, 'contraoferta_propuesta', null, null,
    jsonb_build_object('de', 'cliente', 'precio_base', e.importe_cliente, 'precio_propuesto', v_p));
  perform set_config('dynamo.contraoferta_cliente', 'off', true);
  return jsonb_build_object('resultado', 'pendiente_revision');
end $$;
