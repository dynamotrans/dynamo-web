-- =====================================================================================
-- LOS DATOS DEL CHÓFER VAN CON SU CHÓFER Y LA MATRÍCULA TRAE A SU CHÓFER (usuario, 2026-11-05)
-- «Si borra el conductor y pone uno nuevo: si ese conductor está en la base de datos con
-- su móvil de otros envíos, se pone el suyo; si no tiene, no se pone el del chófer
-- anterior. Si cambia el chófer, se limpia su teléfono/DNI si el nuevo no los tiene. Y si
-- cambia la matrícula, se ponen los datos del chófer de esa matrícula de otras veces; si
-- no hay, vacío, nunca los del otro chófer.»
-- En completar_carga_publica (enlace del transportista):
--   · Mismo chófer y teléfono vacío → se mantiene el teléfono (lo de antes).
--   · Chófer NUEVO → su teléfono es el que escriba; si no escribe, el que tenga ese chófer
--     en la flota de ese transportista; si no tiene, vacío.
--   · Matrícula del camión NUEVA y no escribe chófer → el chófer (y su teléfono) del último
--     viaje de ese camión con ese transportista; si no hay, vacío.
--   · El DNI vive en la ficha del conductor (conductores.documento) y se enlaza por
--     conductor_id, así que cambia con el chófer.
-- flota_sugerencia_publica(): lo mismo para la pantalla (rellena al escribir).
-- Además, el alta automática de la flota solo reutiliza conductores del MISMO transportista.
-- =====================================================================================

-- El chófer conocido de un transportista por su nombre (sin mayúsculas ni acentos).
create or replace function conductor_conocido(p_transportista uuid, p_nombre text)
returns table (nombre text, telefono text, conductor_id uuid)
language sql stable security definer set search_path = public as $$
  select c.nombre::text, c.telefono::text, c.id from conductores c
   where c.activo and c.transportista_id = p_transportista
     and lower(unaccent_simple(trim(c.nombre))) = lower(unaccent_simple(trim(p_nombre)))
   order by (c.telefono is not null) desc, coalesce(c.modificado_en, c.creado_en) desc limit 1
$$;
revoke execute on function conductor_conocido(uuid, text) from public, anon, authenticated;

-- El chófer del último viaje de un camión con un transportista.
create or replace function conductor_de_camion(p_transportista uuid, p_matricula text)
returns table (nombre text, telefono text)
language sql stable security definer set search_path = public as $$
  select coalesce(c.nombre, e.conductor_nombre)::text, coalesce(c.telefono, e.conductor_telefono)::text
    from envios e left join conductores c on c.id = e.conductor_id
   where e.transportista_id = p_transportista and e.estado <> 'cancelado'
     and nullif(trim(e.conductor_nombre), '') is not null
     and normaliza_matricula(e.matricula_camion) = normaliza_matricula(p_matricula)
   order by coalesce(e.fecha_carga_real, e.fecha_carga_desde) desc nulls last, e.creado_en desc limit 1
$$;
revoke execute on function conductor_de_camion(uuid, text) from public, anon, authenticated;

create or replace function completar_carga_publica(
  p_reserva uuid, p_camion text, p_remolque text, p_conductor text, p_telefono text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; e record; v_tel text; v_cam text; v_rem text; v_nom text; k record;
begin
  select * into r from envio_reservas where id = p_reserva and estado = 'aceptada';
  if not found then return jsonb_build_object('resultado', 'no_aceptada'); end if;
  select * into e from envios where id = r.envio_id and transportista_id = r.transportista_id and estado in ('programado', 'hacia_la_carga');
  if not found then return jsonb_build_object('resultado', 'ya_no_se_puede'); end if;
  if not enlace_carga_vigente(r.envio_id) then return jsonb_build_object('resultado', 'ya_no_se_puede'); end if;

  v_cam := nullif(upper(regexp_replace(coalesce(p_camion, ''), '[\s-]', '', 'g')), '');
  v_rem := nullif(upper(regexp_replace(coalesce(p_remolque, ''), '[\s-]', '', 'g')), '');
  v_nom := nullif(trim(p_conductor), '');
  v_tel := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
  if length(replace(coalesce(v_tel, ''), '+', '')) < 6 then v_tel := null; end if;

  if v_nom is null and v_cam is not null
     and normaliza_matricula(v_cam) is distinct from normaliza_matricula(e.matricula_camion) then
    -- Camión nuevo sin chófer escrito: el de ese camión de otras veces, o vacío.
    select * into k from conductor_de_camion(r.transportista_id, v_cam);
    v_nom := k.nombre;                        -- null si ese camión no tiene historial
    v_tel := coalesce(v_tel, k.telefono);
  elsif v_nom is not null and lower(unaccent_simple(v_nom)) is distinct from lower(unaccent_simple(trim(coalesce(e.conductor_nombre, '')))) then
    -- Chófer nuevo: su teléfono, el que tenga en la flota, o vacío (nunca el del anterior).
    if v_tel is null then select telefono into v_tel from conductor_conocido(r.transportista_id, v_nom); end if;
  else
    -- Mismo chófer (o no escribe): lo que llega vacío no borra.
    v_nom := coalesce(v_nom, e.conductor_nombre);
    v_tel := coalesce(v_tel, e.conductor_telefono);
  end if;

  update envios set
    matricula_camion   = coalesce(v_cam, matricula_camion),
    matricula_remolque = coalesce(v_rem, matricula_remolque),
    conductor_nombre   = v_nom,
    conductor_telefono = v_tel
   where id = r.envio_id;
  return jsonb_build_object('resultado', 'guardado', 'conductor', v_nom, 'telefono', v_tel);
end $$;

-- Para la pantalla del enlace: al escribir una matrícula o un chófer, sus datos conocidos.
create or replace function flota_sugerencia_publica(p_reserva uuid, p_matricula text default null, p_conductor text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; k record;
begin
  select x.* into r from envio_reservas x join envios e on e.id = x.envio_id and e.transportista_id = x.transportista_id
   where x.id = p_reserva and x.estado = 'aceptada';
  if not found or not enlace_carga_vigente(r.envio_id) then return jsonb_build_object('resultado', 'no_valida'); end if;
  if nullif(trim(p_matricula), '') is not null then
    select * into k from conductor_de_camion(r.transportista_id, p_matricula);
    return jsonb_build_object('resultado', 'ok', 'conductor', k.nombre, 'telefono', k.telefono);
  elsif nullif(trim(p_conductor), '') is not null then
    select * into k from conductor_conocido(r.transportista_id, p_conductor);
    return jsonb_build_object('resultado', 'ok', 'conductor', coalesce(k.nombre, trim(p_conductor)), 'telefono', k.telefono);
  end if;
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke execute on function flota_sugerencia_publica(uuid, text, text) from public;
grant execute on function flota_sugerencia_publica(uuid, text, text) to anon, authenticated;

create or replace function fn_envios_flota_alta()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tipo tipo_vehiculo; v_tel text;
begin
  if new.operador_id is not null then return new; end if;

  -- Camión
  if tg_op = 'INSERT' or new.matricula_camion is distinct from old.matricula_camion then
    new.vehiculo_camion_id := null;
    if nullif(trim(new.matricula_camion), '') is not null then
      select id, tipo into v_id, v_tipo from vehiculos
       where activo and normaliza_matricula(matricula) = normaliza_matricula(new.matricula_camion) limit 1;
      if v_id is null then
        insert into vehiculos (transportista_id, matricula, tipo, trampilla)
        values (new.transportista_id, upper(trim(new.matricula_camion)),
                (case when nullif(trim(new.matricula_remolque), '') is not null then 'tractora'
                     when new.plataforma_elevadora then 'rigido' else 'tractora' end)::tipo_vehiculo,
                coalesce(new.plataforma_elevadora, false))
        returning id into v_id;
        new.vehiculo_camion_id := v_id;
      elsif v_tipo <> 'remolque' then
        new.vehiculo_camion_id := v_id;
        update vehiculos set transportista_id = new.transportista_id where id = v_id and transportista_id is null;
      end if;
    end if;
  end if;

  -- Remolque
  if tg_op = 'INSERT' or new.matricula_remolque is distinct from old.matricula_remolque then
    new.vehiculo_remolque_id := null;
    if nullif(trim(new.matricula_remolque), '') is not null then
      v_id := null;
      select id, tipo into v_id, v_tipo from vehiculos
       where activo and normaliza_matricula(matricula) = normaliza_matricula(new.matricula_remolque) limit 1;
      if v_id is null then
        insert into vehiculos (transportista_id, matricula, tipo)
        values (new.transportista_id, upper(trim(new.matricula_remolque)), 'remolque')
        returning id into v_id;
        new.vehiculo_remolque_id := v_id;
      elsif v_tipo = 'remolque' then
        new.vehiculo_remolque_id := v_id;
      end if;
    end if;
  end if;

  -- Conductor: por nombre (y teléfono, si lo hay), sin distinguir mayúsculas ni acentos.
  if tg_op = 'INSERT' or new.conductor_nombre is distinct from old.conductor_nombre
     or new.conductor_telefono is distinct from old.conductor_telefono then
    new.conductor_id := null;
    if nullif(trim(new.conductor_nombre), '') is not null then
      v_tel := nullif(regexp_replace(coalesce(new.conductor_telefono, ''), '[^0-9+]', '', 'g'), '');
      if v_tel !~ '^\+?[0-9]{6,15}$' then v_tel := null; end if;
      v_id := null;
      -- Solo entre los conductores de ESE transportista (o sin transportista todavía): dos
      -- chóferes con el mismo nombre en empresas distintas son personas distintas.
      select id into v_id from conductores
       where activo and lower(unaccent_simple(trim(nombre))) = lower(unaccent_simple(trim(new.conductor_nombre)))
         and (transportista_id is null or transportista_id is not distinct from new.transportista_id)
         and (v_tel is null or telefono is null or telefono = v_tel)
       order by (transportista_id is not distinct from new.transportista_id) desc, (telefono = v_tel) desc nulls last limit 1;
      if v_id is null then
        insert into conductores (transportista_id, nombre, telefono)
        values (new.transportista_id, trim(new.conductor_nombre), v_tel) returning id into v_id;
      else
        update conductores set telefono = coalesce(telefono, v_tel),
                               transportista_id = coalesce(transportista_id, new.transportista_id)
         where id = v_id and (telefono is null or transportista_id is null);
      end if;
      new.conductor_id := v_id;
    end if;
  end if;
  return new;
end $$;

comment on function public.conductor_conocido(uuid, text) is '[Ayudantes internos] El conductor de un transportista por su nombre (sin mayúsculas ni acentos): nombre, teléfono e id. Quién: solo uso interno. Argumentos: p_transportista: transportistas.id · p_nombre: nombre del chófer.';
comment on function public.conductor_de_camion(uuid, text) is '[Ayudantes internos] El chófer (nombre y teléfono) del último viaje de un camión con un transportista. Quién: solo uso interno. Argumentos: p_transportista: transportistas.id · p_matricula: matrícula del camión.';
comment on function public.flota_sugerencia_publica(uuid, text, text) is '[Ofertas y transportistas] Enlace público de la carga: al escribir una matrícula, el chófer y teléfono de ese camión de otras veces; al escribir un chófer, su teléfono conocido. Solo de la flota del transportista de la reserva y mientras el enlace valga. Quién: público con la reserva aceptada. Argumentos: p_reserva: envio_reservas.id · p_matricula · p_conductor.';

-- Lo mismo para la ficha de Dynamo (Asignar transportista).
create or replace function flota_sugerencia(p_transportista uuid, p_matricula text default null, p_conductor text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k record;
begin
  if not (es_admin() or es_servidor()) then raise exception 'Solo Dynamo.' using errcode = '42501'; end if;
  if nullif(trim(p_matricula), '') is not null then
    select * into k from conductor_de_camion(p_transportista, p_matricula);
    return jsonb_build_object('conductor', k.nombre, 'telefono', k.telefono);
  elsif nullif(trim(p_conductor), '') is not null then
    select * into k from conductor_conocido(p_transportista, p_conductor);
    return jsonb_build_object('conductor', coalesce(k.nombre, trim(p_conductor)), 'telefono', k.telefono);
  end if;
  return '{}'::jsonb;
end $$;
revoke execute on function flota_sugerencia(uuid, text, text) from public, anon;
grant execute on function flota_sugerencia(uuid, text, text) to authenticated;
comment on function public.flota_sugerencia(uuid, text, text) is '[Ofertas y transportistas] Ficha de Dynamo (Asignar transportista): al escribir una matrícula, el chófer y teléfono de ese camión de otras veces con ese transportista; al escribir un chófer, su teléfono conocido. Vacío si no hay. Quién: Dynamo y servidor. Argumentos: p_transportista: transportistas.id · p_matricula · p_conductor.';
