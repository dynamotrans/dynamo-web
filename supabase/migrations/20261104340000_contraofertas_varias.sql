-- =====================================================================================
-- CONTRAOFERTAS DE TRANSPORTISTAS: VARIAS A LA VEZ (decisión del usuario, 2026-11-04)
-- Antes: una contraoferta pendiente BLOQUEABA la carga («en trámite») hasta que Dynamo
-- respondía. Ahora la carga sigue libre: pueden llegar varias, Dynamo elige cuál aprobar
-- y, al quedarse uno la carga (aprobada o aceptada al precio ofertado), las demás quedan
-- rechazadas con su hito. Solo bloquea la reserva VIVA de 3 minutos (una a la vez, para
-- que dos no acepten a la vez la misma carga).
-- Además se quitan dos requisitos de negociación que el usuario no quiere
-- (negociacion_sin_quitado_dias y negociacion_max_contraofertas_carga).
-- =====================================================================================

drop index if exists ux_reservas_una_activa;
create unique index ux_reservas_una_viva on envio_reservas (envio_id) where estado = 'viva';

-- Pasar a «pendiente de revisión» suelta la carga para los demás.
create or replace function fn_reservas_suelta_carga()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'pendiente_revision' and old.estado = 'viva' then
    update envios set estado_asignacion =
             case when exists (select 1 from envio_ofertas where envio_id = new.envio_id)
                  then 'ofertada'::estado_asignacion else 'sin_asignar'::estado_asignacion end
     where id = new.envio_id and estado_asignacion = 'reservada'
       and not exists (select 1 from envio_reservas where envio_id = new.envio_id and estado = 'viva' and id <> new.id);
  end if;
  return null;
end $$;
revoke execute on function fn_reservas_suelta_carga() from public, anon, authenticated;
create trigger tg_reservas_suelta_carga after update of estado on envio_reservas
  for each row execute function fn_reservas_suelta_carga();

create or replace function reservar_envio(
  p_token uuid, p_ip inet default null, p_navegador text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_envio uuid; v_oferta uuid; e record; v_res record; v_id uuid; v_hasta timestamptz;
begin
  select id into v_envio from envios where token_publico = p_token;
  if v_envio is null then
    select envio_id, id into v_envio, v_oferta from envio_ofertas
     where token = p_token and estado = 'activa' and caduca_en > now();
  end if;
  if v_envio is null then
    return jsonb_build_object('resultado', 'enlace_no_valido', 'ahora', now());
  end if;

  -- La fila del envío bloqueada: a partir de aquí nadie más reserva a la vez.
  select * into e from envios where id = v_envio for update;

  if v_oferta is not null then
    update envio_ofertas set aperturas = aperturas + 1,
                             abierta_en = coalesce(abierta_en, now())
     where id = v_oferta;
  end if;
  perform registrar_hito(v_envio, 'enlace_abierto', null, v_oferta,
                         jsonb_build_object('ip', host(p_ip)), 'servidor');

  if e.estado <> 'programado' or e.estado_asignacion = 'confirmada' then
    return jsonb_build_object('resultado', 'tomada', 'ahora', now(),
                              'asignada_en', e.asignado_en);
  end if;

  perform caducar_reservas(v_envio);

  select * into v_res from envio_reservas
   where envio_id = v_envio and estado = 'viva';
  if found then
    return jsonb_build_object('resultado', 'en_tramite', 'ahora', now(),
                              'hasta', v_res.hasta, 'desde', v_res.desde);
  end if;

  v_hasta := now() + make_interval(mins => (parametro('reserva_minutos'))::int);
  insert into envio_reservas (envio_id, oferta_id, hasta, ip, navegador)
  values (v_envio, v_oferta, v_hasta, p_ip, left(p_navegador, 400))
  returning id into v_id;

  update envios set estado_asignacion = 'reservada' where id = v_envio;
  perform registrar_hito(v_envio, 'reservado', null, v_oferta,
                         jsonb_build_object('reserva_id', v_id), 'servidor');

  return jsonb_build_object('resultado', 'reservada', 'reserva_id', v_id,
                            'ahora', now(), 'hasta', v_hasta);
end $$;

create or replace function caducar_reservas(p_envio uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in update envio_reservas
              set estado = 'caducada', cerrada_en = now(), motivo_cierre = 'tiempo agotado'
            where envio_id = p_envio and estado = 'viva' and hasta < now()
           returning id, oferta_id loop
    perform registrar_hito(p_envio, 'reserva_caducada', null, r.oferta_id,
                           jsonb_build_object('reserva_id', r.id), 'sistema');
  end loop;
  update envios set estado_asignacion =
           case when exists (select 1 from envio_ofertas where envio_id = p_envio)
                then 'ofertada'::estado_asignacion else 'sin_asignar'::estado_asignacion end
   where id = p_envio and estado_asignacion = 'reservada'
     and not exists (select 1 from envio_reservas
                     where envio_id = p_envio and estado = 'viva');
end $$;

create or replace function oferta_publica(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t record; e record; o record; v_motivo text; v_tramite boolean;
begin
  select * into t from oferta_de_token(p_token);
  if t.envio_id is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  select * into e from envios where id = t.envio_id;
  if t.oferta_id is not null then select * into o from envio_ofertas where id = t.oferta_id; end if;

  v_motivo := case
    when e.estado = 'cancelado' then 'cancelado'
    when e.estado <> 'programado' or e.estado_asignacion = 'confirmada' then 'tomada'
    when not t.oferta_activa then 'caducada'
  end;
  v_tramite := exists (select 1 from envio_reservas where envio_id = e.id
                        and estado = 'viva' and hasta > now());

  return jsonb_build_object(
    'resultado', 'ok',
    'disponible', v_motivo is null,
    'motivo', v_motivo,
    'en_tramite', v_tramite,
    'asignada_en', e.asignado_en,
    'referencia', e.referencia_gx,
    'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
    'fecha_entrega_estimada', e.fecha_entrega_estimada,
    'descripcion_mercancia', e.descripcion_mercancia,
    'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas, 'tipo_carga', e.tipo_carga,
    'paletizado', e.paletizado, 'carga_lateral', e.carga_lateral, 'carga_trasera', e.carga_trasera,
    'carga_superior', e.carga_superior, 'plataforma_elevadora', e.plataforma_elevadora,
    'nima_requerido', e.nima_requerido, 'adr', e.adr,
    'precio', coalesce(o.precio_ofertado, e.importe_transportista),
    'banda_euros', coalesce(o.banda_euros, 0),
    'pronto_pago', coalesce(o.pronto_pago, true),
    'pronto_pago_pct', parametro('pronto_pago_pct'), 'pronto_pago_minimo', parametro('pronto_pago_minimo'),
    'pronto_pago_dias', parametro('pronto_pago_dias'), 'plazo_pago_dias', parametro('plazo_pago_transportista_dias'),
    'reserva_minutos', parametro('reserva_minutos'),
    'para_transportista', (select nombre_visible from transportistas where id = o.transportista_id),
    'paradas', (select coalesce(jsonb_agg(jsonb_build_object(
        'orden', p.orden, 'tipo', p.tipo, 'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion,
        'provincia', p.provincia, 'pais_codigo_iso', p.pais_codigo_iso,
        'tipo_lugar', l.tipo, 'horarios', l.horarios,
        'requiere_cita', coalesce(l.requiere_cita, false), 'tiene_medios_carga', coalesce(l.tiene_medios_carga, true))
        order by p.orden), '[]'::jsonb)
      from envio_paradas p left join lugares l on l.id = p.lugar_id where p.envio_id = e.id)
  );
end $$;

create or replace function otras_cargas_publicas(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t record;
begin
  select * into t from oferta_de_token(p_token);
  if t.envio_id is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'fecha_carga_desde', x->>'referencia')
      from (
        select jsonb_build_object(
          'token', e.token_publico, 'referencia', e.referencia_gx,
          'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
          'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas, 'tipo_carga', e.tipo_carga,
          'precio', e.importe_transportista,
          'origen',  (select jsonb_build_object('codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia, 'pais', p.pais_codigo_iso)
                        from envio_paradas p where p.envio_id = e.id order by p.orden limit 1),
          'destino', (select jsonb_build_object('codigo_postal', p.codigo_postal, 'poblacion', p.poblacion, 'provincia', p.provincia, 'pais', p.pais_codigo_iso)
                        from envio_paradas p where p.envio_id = e.id order by p.orden desc limit 1)) as x
          from envios e
         where e.id <> t.envio_id
           and e.publicado_en_bolsa_en is not null
           and e.estado = 'programado' and e.estado_asignacion is distinct from 'confirmada' and e.transportista_id is null
           and e.importe_transportista is not null
           and coalesce(e.fecha_carga_hasta, e.fecha_carga_desde) >= (now() at time zone 'Europe/Madrid')::date
           and not exists (select 1 from envio_reservas r where r.envio_id = e.id
                            and r.estado = 'viva' and r.hasta > now())
         order by e.fecha_carga_desde, e.referencia_gx
         limit 12) s), '[]'::jsonb);
end $$;

create or replace function cerrar_aceptacion(
  p_reserva uuid, p_transportista uuid, p_usuario uuid, p_precio numeric
) returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; o record;
begin
  update envio_reservas set estado = 'aceptada', cerrada_en = now(),
         transportista_id = p_transportista, usuario_id = p_usuario,
         precio_aceptado = p_precio, motivo_cierre = 'aceptada'
   where id = p_reserva returning * into r;

  update envios set transportista_id = p_transportista,
                    importe_transportista = p_precio,
                    estado_asignacion = 'confirmada'
   where id = r.envio_id;

  -- Varias contraofertas a la vez (2026-11-04): al quedarse uno la carga, las demás que
  -- esperaban respuesta quedan rechazadas (cada una con su hito).
  for o in select id, oferta_id, precio_propuesto from envio_reservas
            where envio_id = r.envio_id and estado = 'pendiente_revision' and id <> p_reserva loop
    update envio_reservas set estado = 'rechazada', cerrada_en = now(), motivo_cierre = 'la carga se la ha quedado otro transportista'
     where id = o.id;
    perform registrar_hito(r.envio_id, 'contraoferta_resuelta', null, o.oferta_id,
      jsonb_build_object('reserva_id', o.id, 'precio_propuesto', o.precio_propuesto, 'decision', 'rechazada_otra_aceptada'), 'sistema');
  end loop;
  update envio_ofertas set estado = 'aceptada' where id = r.oferta_id;
  update envio_ofertas set estado = 'cerrada'
   where envio_id = r.envio_id and estado = 'activa' and id is distinct from r.oferta_id;

  return jsonb_build_object('resultado','aceptada','envio_id', r.envio_id,
                            'precio', p_precio, 'ahora', now());
end $$;

delete from parametros where clave in ('negociacion_sin_quitado_dias', 'negociacion_max_contraofertas_carga');

create or replace function negociacion_bloqueada(p_envio uuid, p_transportista uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare e record; m numeric; n int;
begin
  if not coalesce((parametro('contraoferta_transportista_activa') #>> '{}')::boolean, false) then
    return 'La negociación está apagada.';
  end if;
  select creado_en, publicado_en_bolsa_en, fecha_carga_desde into e from envios where id = p_envio;
  if not found then return 'La carga no existe.'; end if;
  m := p_num('negociacion_min_creada_min', 0);
  if m > 0 and e.creado_en > now() - make_interval(mins => m::int) then
    return format('La carga lleva menos de %s minutos creada.', m);
  end if;
  m := p_num('negociacion_min_bolsa_min', 0);
  if m > 0 and e.publicado_en_bolsa_en is not null and e.publicado_en_bolsa_en > now() - make_interval(mins => m::int) then
    return format('La carga lleva menos de %s minutos en la bolsa.', m);
  end if;
  m := p_num('negociacion_max_horas_carga', 0);
  if m > 0 and e.fecha_carga_desde is not null
     and (e.fecha_carga_desde::timestamp at time zone 'Europe/Madrid') > now() + make_interval(hours => m::int) then
    return format('Faltan más de %s horas para cargar.', m);
  end if;
  if p_transportista is not null then
    m := p_num('negociacion_min_cargas_hechas', 0);
    if m > 0 then
      select count(*) into n from envios where transportista_id = p_transportista and estado = 'entregado';
      if n < m then return format('Para negociar hay que haber hecho al menos %s cargas con Dynamo.', m); end if;
    end if;
    if coalesce((parametro('negociacion_una_por_carga') #>> '{}')::boolean, false)
       and exists (select 1 from envio_reservas where envio_id = p_envio and transportista_id = p_transportista
                    and precio_propuesto is not null and estado in ('rechazada', 'pendiente_revision', 'aceptada')) then
      return 'Ya hiciste una contraoferta para esta carga.';
    end if;
  end if;
  return null;
end $$;


create or replace function resolver_contraoferta(p_reserva uuid, p_aprobar boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not (es_admin() or es_servidor()) then
    raise exception 'Solo Dynamo resuelve contraofertas.' using errcode = '42501';
  end if;
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'pendiente_revision' then
    return jsonb_build_object('resultado','no_hay_contraoferta_pendiente');
  end if;
  perform 1 from envios where id = r.envio_id for update;
  -- Si mientras tanto la carga se la ha quedado otro, esta ya no se puede aprobar.
  if p_aprobar and exists (select 1 from envios where id = r.envio_id and (transportista_id is not null or estado_asignacion = 'confirmada')) then
    update envio_reservas set estado = 'rechazada', cerrada_en = now(), motivo_cierre = 'la carga se la ha quedado otro transportista' where id = p_reserva;
    return jsonb_build_object('resultado', 'tomada');
  end if;

  perform registrar_hito(r.envio_id, 'contraoferta_resuelta', null, r.oferta_id,
    jsonb_build_object('reserva_id', p_reserva, 'precio_propuesto', r.precio_propuesto,
                       'decision', case when p_aprobar then 'aprobada' else 'rechazada' end));
  if p_aprobar then
    return cerrar_aceptacion(p_reserva, r.transportista_id, r.usuario_id, r.precio_propuesto);
  end if;

  update envio_reservas set estado = 'rechazada', cerrada_en = now(),
         motivo_cierre = 'contraoferta rechazada' where id = p_reserva;
  perform caducar_reservas(r.envio_id);     -- devuelve el envío a 'ofertada'
  return jsonb_build_object('resultado','rechazada');
end $$;

-- Si Dynamo asigna el transportista a mano, las contraofertas que esperaban quedan rechazadas.
create or replace function fn_envios_rechaza_contraofertas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.transportista_id is not null and new.transportista_id is distinct from old.transportista_id then
    update envio_reservas set estado = 'rechazada', cerrada_en = now(), motivo_cierre = 'la carga se la ha quedado otro transportista'
     where envio_id = new.id and estado = 'pendiente_revision' and transportista_id is distinct from new.transportista_id;
  end if;
  return null;
end $$;
revoke execute on function fn_envios_rechaza_contraofertas() from public, anon, authenticated;
create trigger tg_envios_rechaza_contraofertas after update of transportista_id on envios
  for each row execute function fn_envios_rechaza_contraofertas();
