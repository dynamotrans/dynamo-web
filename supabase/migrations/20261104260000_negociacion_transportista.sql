-- =====================================================================================
-- NEGOCIACIÓN DEL TRANSPORTISTA: interruptor general y requisitos (usuario, 2026-11-04)
--
-- Al aceptar una carga por su enlace, el transportista puede proponer otro precio dentro
-- de la banda de la oferta («contraoferta»). Ahora solo se le deja si:
--   · está encendida para todos (`contraoferta_transportista_activa`), y
--   · la carga lleva al menos N minutos creada en la plataforma (`negociacion_min_creada_min`),
--   · lleva al menos N minutos publicada en la bolsa de cargas, si lo está (`negociacion_min_bolsa_min`),
--   · y faltan como mucho N horas para cargar (`negociacion_max_horas_carga`).
-- Un requisito a 0 no se aplica. Si no se cumple, la página no enseña la negociación y
-- la base de datos no admite un precio distinto del ofertado (sí aceptar al precio).
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('contraoferta_transportista_activa', 'true',
   'Negociación del TRANSPORTISTA (proponer otro precio al aceptar una carga): encendida o apagada para todos.'),
  ('negociacion_min_creada_min', '45',
   'Negociación del transportista: minutos que tiene que llevar la carga creada en la plataforma para poder negociar. 0 = no se aplica.'),
  ('negociacion_min_bolsa_min', '45',
   'Negociación del transportista: minutos que tiene que llevar la carga publicada en la bolsa (si lo está) para poder negociar. 0 = no se aplica.'),
  ('negociacion_max_horas_carga', '48',
   'Negociación del transportista: solo si faltan como mucho estas horas para el día de carga (cargas urgentes). 0 = no se aplica.')
on conflict (clave) do nothing;

-- ¿Se puede negociar esta carga ahora? Nulo = sí; si no, el motivo.
create or replace function negociacion_bloqueada(p_envio uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare e record; m numeric;
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
  return null;
end $$;
revoke execute on function negociacion_bloqueada(uuid) from public, anon, authenticated;

-- Para la página pública de la carga (con su enlace): ¿enseño la negociación?
create or replace function negociacion_publica(p_token uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare t record;
begin
  select * into t from oferta_de_token(p_token);
  if t.envio_id is null then return false; end if;
  return negociacion_bloqueada(t.envio_id) is null;
end $$;
revoke execute on function negociacion_publica(uuid) from public;
grant execute on function negociacion_publica(uuid) to anon, authenticated;

-- El guardián: una reserva que se acepta (o pasa a revisión) a un precio distinto del
-- ofertado solo si la negociación está permitida. La aprobación de Dynamo (desde
-- «pendiente de revisión») no pasa por aquí.
create or replace function fn_reservas_negociacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_base numeric; v_precio numeric; v_motivo text;
begin
  if old.estado <> 'viva' or new.estado not in ('pendiente_revision', 'aceptada') then return new; end if;
  v_precio := case when new.estado = 'aceptada' then new.precio_aceptado else new.precio_propuesto end;
  if new.oferta_id is not null then select precio_ofertado into v_base from envio_ofertas where id = new.oferta_id; end if;
  if v_base is null then select importe_transportista into v_base from envios where id = new.envio_id; end if;
  if v_precio is null or v_base is null or v_precio = v_base then return new; end if;
  v_motivo := negociacion_bloqueada(new.envio_id);
  if v_motivo is not null then
    raise exception 'Ahora no se puede negociar el precio de esta carga: %', v_motivo using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function fn_reservas_negociacion() from public, anon, authenticated;
create trigger tg_reservas_negociacion before update on envio_reservas
  for each row execute function fn_reservas_negociacion();
