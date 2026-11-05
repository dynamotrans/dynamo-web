-- =====================================================================================
-- LA LLAVE DEL ENLACE DE LA CARGA CADUCA POR FECHA (usuario, 2026-11-05)
-- «¿Cómo sabe que el camión está cargando? No lo sabemos: solo sabemos cuándo acepta.
-- Podemos hacer que caduque 24 h después de la fecha de carga.» El estado (cargando,
-- entregado…) solo cambia si alguien lo marca, y con un transportista que entra por el
-- enlace nadie lo marca. Así que la llave vale hasta el FINAL DEL ÚLTIMO DÍA DE CARGA
-- (hora de Madrid) + `enlace_carga_horas_tras_carga` horas (24). Si Dynamo cambia la
-- fecha, la caducidad se mueve con ella. Y deja de valer antes si el envío se entrega o
-- se cancela. El CMR no depende de esto: tiene su propio enlace, que el conductor ya abrió.
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('enlace_carga_horas_tras_carga', '24', 'Horas que sigue valiendo el enlace de la carga del transportista después del final del último día de carga.')
on conflict (clave) do nothing;

create or replace function enlace_carga_vigente(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select e.estado not in ('entregado', 'cancelado')
     and (coalesce(e.fecha_carga_real, e.fecha_carga_hasta, e.fecha_carga_desde) is null
          or now() < ((coalesce(e.fecha_carga_real, e.fecha_carga_hasta, e.fecha_carga_desde) + 1)::timestamp at time zone 'Europe/Madrid')
                     + make_interval(hours => p_num('enlace_carga_horas_tras_carga', 24)::int))
    from envios e where e.id = p_envio
$$;
revoke execute on function enlace_carga_vigente(uuid) from public, anon, authenticated;

create or replace function carga_aceptada_publica(p_reserva uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; e record;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found then return jsonb_build_object('resultado', 'reserva_no_existe'); end if;
  if r.estado = 'pendiente_revision' then
    return jsonb_build_object('resultado', 'pendiente_revision', 'precio_propuesto', r.precio_propuesto);
  end if;
  if r.estado = 'viva' and r.hasta > now() then
    return jsonb_build_object('resultado', 'viva', 'hasta', r.hasta, 'ahora', now());
  end if;
  if r.estado <> 'aceptada' then
    return jsonb_build_object('resultado', case when r.estado = 'viva' then 'caducada' else r.estado end);
  end if;
  select * into e from envios where id = r.envio_id;
  if e.transportista_id is distinct from r.transportista_id then
    return jsonb_build_object('resultado', 'reasignada');
  end if;
  -- La llave caduca al terminar el viaje (entregado o cancelado).
  if not enlace_carga_vigente(e.id) then
    return jsonb_build_object('resultado', 'cerrada', 'estado', e.estado, 'referencia', e.referencia_gx);
  end if;
  return jsonb_build_object(
    'resultado', 'aceptada', 'estado', e.estado,
    'referencia', e.referencia_gx, 'referencia_cliente', e.referencia_cliente,
    'transportista', (select nombre_visible from transportistas where id = r.transportista_id),
    'precio', r.precio_aceptado, 'pronto_pago', r.pronto_pago,
    'pronto_pago_pct', parametro('pronto_pago_pct'), 'pronto_pago_minimo', parametro('pronto_pago_minimo'),
    'pronto_pago_dias', parametro('pronto_pago_dias'), 'plazo_pago_dias', parametro('plazo_pago_transportista_dias'),
    'aceptada_en', r.cerrada_en,
    'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
    'fecha_entrega_estimada', e.fecha_entrega_estimada,
    'descripcion_mercancia', e.descripcion_mercancia, 'metros_lineales', e.metros_lineales,
    'toneladas', e.toneladas, 'tipo_carga', e.tipo_carga, 'paletizado', e.paletizado,
    'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera, 'carga_superior', e.carga_superior,
    'plataforma_elevadora', e.plataforma_elevadora, 'nima_requerido', e.nima_requerido, 'adr', e.adr,
    'discrecion_comercial', e.discrecion_comercial,
    'matricula_camion', e.matricula_camion, 'matricula_remolque', e.matricula_remolque,
    'conductor_nombre', e.conductor_nombre, 'conductor_telefono', e.conductor_telefono,
    'paradas', (select coalesce(jsonb_agg(jsonb_build_object(
        'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion,
        'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia,
        'pais_codigo_iso', p.pais_codigo_iso, 'referencia', p.referencia, 'anotaciones', p.anotaciones,
        'tipo_lugar', l.tipo, 'horarios', l.horarios, 'notas_sitio', l.anotaciones,
        'requiere_cita', coalesce(l.requiere_cita, false), 'tiene_medios_carga', coalesce(l.tiene_medios_carga, true),
        'url_google_maps', l.url_google_maps,
        'contacto', (select jsonb_build_object('nombre', c.nombre, 'telefono', c.telefono)
                       from contactos c where c.lugar_id = p.lugar_id and c.es_principal limit 1))
        order by p.orden), '[]'::jsonb)
      from envio_paradas p left join lugares l on l.id = p.lugar_id where p.envio_id = e.id)
  );
end $$;

create or replace function datos_orden_publica(p_reserva uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r envio_reservas%rowtype;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'aceptada'
     or not exists (select 1 from envios e where e.id = r.envio_id and e.transportista_id = r.transportista_id) then
    raise exception 'Esa orden de carga no es tuya.' using errcode = '42501';
  end if;
  if not enlace_carga_vigente(r.envio_id) then
    raise exception 'Este viaje ya ha terminado: la orden de carga ya no está disponible en este enlace.' using errcode = '42501';
  end if;
  return orden_carga_json(r.envio_id);
end $$;

create or replace function enlace_cmr_publico(p_reserva uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare r envio_reservas%rowtype; v_tok uuid; v_estado estado_envio;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'aceptada'
     or not exists (select 1 from envios e where e.id = r.envio_id and e.transportista_id = r.transportista_id) then
    raise exception 'Ese viaje no es tuyo.' using errcode = '42501';
  end if;
  select estado into v_estado from envios where id = r.envio_id;
  if v_estado in ('cancelado', 'borrador') then raise exception 'Este envío no tiene CMR para firmar.'; end if;
  if v_estado = 'entregado' or not enlace_carga_vigente(r.envio_id) then raise exception 'Este viaje ya ha terminado.' using errcode = '42501'; end if;
  select token into v_tok from cmr_enlaces where envio_id = r.envio_id and not revocado and caduca_en > now();
  if v_tok is null then
    update cmr_enlaces set revocado = true where envio_id = r.envio_id and not revocado;
    insert into cmr_enlaces (envio_id) values (r.envio_id) returning token into v_tok;
  end if;
  return v_tok;
end $$;

create or replace function completar_carga_publica(
  p_reserva uuid, p_camion text, p_remolque text, p_conductor text, p_telefono text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_tel text;
begin
  select * into r from envio_reservas where id = p_reserva and estado = 'aceptada';
  if not found then return jsonb_build_object('resultado', 'no_aceptada'); end if;
  if not exists (select 1 from envios where id = r.envio_id and transportista_id = r.transportista_id
                  and estado in ('programado', 'hacia_la_carga')) then
    return jsonb_build_object('resultado', 'ya_no_se_puede');
  end if;
  if not enlace_carga_vigente(r.envio_id) then return jsonb_build_object('resultado', 'ya_no_se_puede'); end if;
  v_tel := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
  update envios set
    matricula_camion   = nullif(upper(regexp_replace(coalesce(p_camion, ''), '[\s-]', '', 'g')), ''),
    matricula_remolque = nullif(upper(regexp_replace(coalesce(p_remolque, ''), '[\s-]', '', 'g')), ''),
    conductor_nombre   = nullif(trim(p_conductor), ''),
    conductor_telefono = case when length(replace(coalesce(v_tel, ''), '+', '')) >= 6 then v_tel end
   where id = r.envio_id;
  return jsonb_build_object('resultado', 'guardado');
end $$;

comment on function public.enlace_carga_vigente(uuid) is '[Ofertas y transportistas] ¿Sigue valiendo el enlace público de la carga? Hasta el final del último día de carga + enlace_carga_horas_tras_carga horas, y nunca con el envío entregado o cancelado. Quién: solo uso interno. Argumentos: p_envio: envios.id.';
