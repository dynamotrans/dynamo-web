-- =====================================================================================
-- NEGOCIACIÓN DEL TRANSPORTISTA: requisitos extra (propuestos el 2026-11-04)
-- Todos APAGADOS al empezar (0 / No); se encienden en Parámetros:
--   · negociacion_min_cargas_hechas      : solo negocia quien ya ha entregado N cargas con Dynamo.
--   · negociacion_una_por_carga          : una sola contraoferta por transportista y carga.
--   · negociacion_sin_quitado_dias       : no negocia quien se ha bajado (o le quitamos) de una
--                                          carga en los últimos N días.
--   · negociacion_max_contraofertas_carga: una carga deja de admitir contraofertas al llegar a N.
-- Los de transportista solo se pueden mirar cuando se sabe quién es (oferta personal o al
-- identificarse al aceptar); la base de datos los impone siempre al aceptar.
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('negociacion_min_cargas_hechas', '0', 'Negociación del transportista: solo si ya ha entregado al menos estas cargas con Dynamo. 0 = no se aplica.'),
  ('negociacion_una_por_carga', 'false', 'Negociación del transportista: una sola contraoferta por transportista y carga (si se le rechaza, solo puede aceptar al precio).'),
  ('negociacion_sin_quitado_dias', '0', 'Negociación del transportista: no negocia si se ha bajado (o se le quitó) de una carga en estos últimos días. 0 = no se aplica.'),
  ('negociacion_max_contraofertas_carga', '0', 'Negociación del transportista: una carga deja de admitir contraofertas al recibir estas. 0 = no se aplica.')
on conflict (clave) do nothing;

drop function if exists negociacion_bloqueada(uuid);
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
  m := p_num('negociacion_max_contraofertas_carga', 0);
  if m > 0 then
    select count(*) into n from envio_reservas where envio_id = p_envio and precio_propuesto is not null;
    if n >= m then return format('La carga ya ha recibido %s contraofertas.', n); end if;
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
    m := p_num('negociacion_sin_quitado_dias', 0);
    if m > 0 and exists (select 1 from envio_hitos where hito = 'transportista_quitado'
                          and datos ->> 'transportista_id' = p_transportista::text
                          and cuando > now() - make_interval(days => m::int)) then
      return format('Te has bajado de una carga en los últimos %s días.', m);
    end if;
  end if;
  return null;
end $$;
revoke execute on function negociacion_bloqueada(uuid, uuid) from public, anon, authenticated;

-- La página pública: si la oferta es personal, ya se sabe quién es.
create or replace function negociacion_publica(p_token uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare t record; v_tr uuid;
begin
  select * into t from oferta_de_token(p_token);
  if t.envio_id is null then return false; end if;
  if t.oferta_id is not null then select transportista_id into v_tr from envio_ofertas where id = t.oferta_id; end if;
  return negociacion_bloqueada(t.envio_id, v_tr) is null;
end $$;

-- El guardián, con el transportista que acepta.
create or replace function fn_reservas_negociacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_base numeric; v_precio numeric; v_motivo text;
begin
  if old.estado <> 'viva' or new.estado not in ('pendiente_revision', 'aceptada') then return new; end if;
  v_precio := case when new.estado = 'aceptada' then new.precio_aceptado else new.precio_propuesto end;
  if new.oferta_id is not null then select precio_ofertado into v_base from envio_ofertas where id = new.oferta_id; end if;
  if v_base is null then select importe_transportista into v_base from envios where id = new.envio_id; end if;
  if v_precio is null or v_base is null or v_precio = v_base then return new; end if;
  v_motivo := negociacion_bloqueada(new.envio_id, new.transportista_id);
  if v_motivo is not null then
    raise exception 'Ahora no se puede negociar el precio de esta carga: %', v_motivo using errcode = '42501';
  end if;
  return new;
end $$;
