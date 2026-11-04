-- =====================================================================================
-- REVISIÓN DE SEGURIDAD DE LAS MIGRACIONES DEL 2026-11-04
-- Dos revisores independientes repasaron las 30 migraciones del día. Sin escaladas de
-- privilegios ni fugas entre empresas; sí estos huecos de reglas de negocio, que se cierran:
--
--  1. Previo pago: un envío pendiente de pago (que nunca se paga) contaba como «primer
--     envío hecho» y libraba al siguiente. Ahora solo cuentan los que no están pendientes.
--  2. Cambios del cliente: «sin camión» no basta. Si la carga está publicada en bolsa, con
--     ofertas enviadas o con un transportista reservando o contraofertando, ya se está
--     asignando: hay que llamar. Y pasada la hora límite (9:00 del día hábil anterior) el
--     cliente tampoco mueve las fechas solo: así no puede «alejar» la carga para cancelar
--     tarde sin que cuente.
--  3. Reservas del CMR: la parada y el papel se comprueban como al firmar, no se anotan en
--     una casilla ya firmada ni en un envío cancelado, y como mucho 10 por envío.
--  4. Contraofertas: no se aprueba una sobre un envío que ya no está programado, y al
--     cancelar el envío las pendientes quedan rechazadas (con aviso al transportista).
--  5. Alta online de transportistas: cada CIF o código de bolsa que ya existe cuenta como
--     intento fallido (no se pueden ir probando CIFs), cada alta cuenta en el límite
--     diario de la carga, y como mucho 3 altas pendientes por carga y 30 al día en total.
--  6. Tablón de «otras cargas»: el enlace tiene que ser de una carga reciente (fecha de
--     carga de hace 14 días o menos), no vale cualquier enlace antiguo.
--  7. Cuentas: las copias de avisos, el email y las anotaciones internas de una cuenta ya
--     no las cambia su dueño (solo Dynamo o el sistema). Y el estado del Admin Master solo
--     desde la consola de Supabase, tampoco con la clave de servicio.
-- =====================================================================================

-- ---- 1. Previo pago -----------------------------------------------------------------
create or replace function pago_previo_motivo(p_cliente uuid, p_envio uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare c record; n_prev int;
begin
  if not coalesce((parametro('previo_pago_activo') #>> '{}')::boolean, false) then return null; end if;
  select riesgo_efectivo_euros, sin_pago_previo_primer_envio into c from clientes where id = p_cliente;
  if not found then return null; end if;
  if coalesce(c.riesgo_efectivo_euros, 0) <= 0 then
    return case when c.riesgo_efectivo_euros is null then 'Sin crédito: empresa sin clasificar por CESCE'
                else 'Sin crédito: CESCE autoriza 0' end;
  end if;
  if not c.sin_pago_previo_primer_envio then
    select count(*) into n_prev from envios
     where cliente_id = p_cliente and id is distinct from p_envio and not coalesce(es_manual, false)
       and estado not in ('borrador', 'cancelado')
       and pago_previo <> 'pendiente';   -- un envío sin pagar no cuenta como envío hecho
    if n_prev < p_num('previo_pago_primeros_envios', 1) then
      return case when n_prev = 0 then 'Primer envío del cliente' else format('Uno de los %s primeros envíos del cliente', p_num('previo_pago_primeros_envios', 1)) end;
    end if;
  end if;
  return null;
end $$;
revoke execute on function pago_previo_motivo(uuid, uuid) from public, anon, authenticated;

-- ---- 2. Cambios del cliente -------------------------------------------------------------
-- ¿Se está asignando ya este envío? (camión, ofertas, bolsa o un transportista reservando)
create or replace function envio_asignandose(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select e.transportista_id is not null or e.estado_asignacion <> 'sin_asignar' or e.publicado_en_bolsa_en is not null
         or exists (select 1 from envio_reservas r where r.envio_id = e.id and r.estado in ('viva', 'pendiente_revision'))
         or exists (select 1 from envio_ofertas o where o.envio_id = e.id and o.estado = 'activa' and o.caduca_en > now())
    from envios e where e.id = p_envio
$$;
revoke execute on function envio_asignandose(uuid) from public, anon, authenticated;

create or replace function pedir_cambio_envio(p_envio uuid, p_desde date, p_hasta date, p_detalle text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e envios%rowtype; v_det text := nullif(trim(coalesce(p_detalle, '')), ''); v_libre boolean; v_fechas boolean;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if coalesce(e.es_manual, false) then return jsonb_build_object('resultado', 'envio_manual'); end if;
  if e.estado <> 'programado' then return jsonb_build_object('resultado', 'no_modificable', 'estado', e.estado); end if;
  if e.cambio_cliente_estado = 'pendiente' then return jsonb_build_object('resultado', 'ya_pendiente'); end if;
  v_fechas := p_desde is not null and (p_desde, coalesce(p_hasta, p_desde)) is distinct from (e.fecha_carga_desde, coalesce(e.fecha_carga_hasta, e.fecha_carga_desde));
  if p_desde is not null and (p_desde <= current_date or coalesce(p_hasta, p_desde) < p_desde or coalesce(p_hasta, p_desde) > current_date + 183) then
    return jsonb_build_object('resultado', 'fechas_no_validas');
  end if;
  if not v_fechas and v_det is null then return jsonb_build_object('resultado', 'sin_cambios'); end if;
  if length(coalesce(v_det, '')) > 1000 then return jsonb_build_object('resultado', 'detalle_largo'); end if;

  v_libre := not coalesce(envio_asignandose(p_envio), true);
  -- Con camión asignado o asignándose no se modifica desde la plataforma: hay que llamar.
  if not v_libre then return jsonb_build_object('resultado', 'con_camion'); end if;
  -- Pasada la hora límite para cancelar gratis, tampoco: hay que llamar.
  if e.fecha_carga_desde is not null and now() >= corte_cancelacion(e.fecha_carga_desde) then
    return jsonb_build_object('resultado', 'fuera_de_plazo');
  end if;
  perform set_config('dynamo.cambio_envio', 'on', true);
  if v_libre and v_det is null then
    -- Sin camión y solo fechas: se aplica ya.
    update envios set fecha_carga_desde = p_desde, fecha_carga_hasta = coalesce(p_hasta, p_desde),
                      cambio_cliente = jsonb_build_object('fecha_desde', p_desde, 'fecha_hasta', coalesce(p_hasta, p_desde),
                                                          'antes_desde', e.fecha_carga_desde, 'antes_hasta', e.fecha_carga_hasta),
                      cambio_cliente_en = now(), cambio_cliente_estado = 'aplicado', cambio_cliente_nota = null
     where id = p_envio;
    perform set_config('dynamo.cambio_envio', 'off', true);
    return jsonb_build_object('resultado', 'aplicado');
  end if;
  update envios set cambio_cliente = jsonb_build_object('fecha_desde', case when v_fechas then p_desde end,
                                                        'fecha_hasta', case when v_fechas then coalesce(p_hasta, p_desde) end,
                                                        'detalle', v_det, 'con_camion', not v_libre),
                    cambio_cliente_en = now(), cambio_cliente_estado = 'pendiente', cambio_cliente_nota = null
   where id = p_envio;
  perform set_config('dynamo.cambio_envio', 'off', true);
  return jsonb_build_object('resultado', 'pendiente');
end $$;
revoke execute on function pedir_cambio_envio(uuid, date, date, text) from public, anon;
grant execute on function pedir_cambio_envio(uuid, date, date, text) to authenticated;

-- Para la ficha del cliente: con_camion = asignado, asignándose o fuera de plazo (sale
-- «Necesito cambiar algo» → llamar).
create or replace function mi_cambio_envio(p_envio uuid)
returns table (cambio jsonb, estado text, en timestamptz, nota text, modificable boolean, con_camion boolean)
language sql stable security definer set search_path = public as $$
  select e.cambio_cliente, e.cambio_cliente_estado, e.cambio_cliente_en, e.cambio_cliente_nota,
         e.estado = 'programado' and not coalesce(e.es_manual, false),
         coalesce(envio_asignandose(e.id), false)
           or (e.fecha_carga_desde is not null and now() >= corte_cancelacion(e.fecha_carga_desde))
    from envios e where e.id = p_envio and envio_del_cliente(p_envio)
$$;
revoke execute on function mi_cambio_envio(uuid) from public, anon;
grant execute on function mi_cambio_envio(uuid) to authenticated;

-- ---- 3. Reservas del CMR ------------------------------------------------------------------
create or replace function anotar_reservas_cmr(p_token uuid, p_parada uuid, p_rol text, p_texto text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_envio uuid; v_texto text := trim(coalesce(p_texto, '')); v_inc uuid; v_quien text; v_tipo text;
begin
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  if p_rol not in ('remitente', 'transportista', 'destinatario') then return jsonb_build_object('resultado', 'rol_no_valido'); end if;
  if (select estado from envios where id = v_envio) = 'cancelado' then return jsonb_build_object('resultado', 'cancelado'); end if;
  -- La misma casilla que al firmar: remitente en una recogida, destinatario en una entrega,
  -- transportista sin parada. Y nunca en una casilla ya firmada.
  if p_rol = 'transportista' then
    if p_parada is not null then return jsonb_build_object('resultado', 'parada_no_valida'); end if;
  else
    select tipo into v_tipo from envio_paradas where id = p_parada and envio_id = v_envio;
    if v_tipo is null or (p_rol = 'remitente' and v_tipo <> 'carga') or (p_rol = 'destinatario' and v_tipo <> 'descarga') then
      return jsonb_build_object('resultado', 'parada_no_valida');
    end if;
  end if;
  if exists (select 1 from firmas_cmr where envio_id = v_envio and rol = p_rol and parada_id is not distinct from p_parada) then
    return jsonb_build_object('resultado', 'ya_firmada');
  end if;
  if (select count(*) from cmr_reservas where envio_id = v_envio) >= 10 then
    return jsonb_build_object('resultado', 'demasiadas');
  end if;
  if length(v_texto) < 3 or length(v_texto) > 1000 then return jsonb_build_object('resultado', 'texto_no_valido'); end if;
  if (select count(*) from cmr_reservas where envio_id = v_envio and rol = p_rol and parada_id is not distinct from p_parada) >= 3 then
    return jsonb_build_object('resultado', 'demasiadas');
  end if;
  v_quien := case p_rol when 'remitente' then 'el cargador' when 'transportista' then 'el conductor' else 'el destinatario' end;
  insert into incidencias (tipo_id, envio_id, cliente_id, titulo, detalle)
  values ((select id from tipos_incidencia where clave = 'siniestro'), v_envio, (select cliente_id from envios where id = v_envio),
          format('Reservas en el CMR (%s)', v_quien), v_texto)
  returning id into v_inc;
  insert into cmr_reservas (envio_id, parada_id, rol, texto, incidencia_id) values (v_envio, p_parada, p_rol, v_texto, v_inc);
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke execute on function anotar_reservas_cmr(uuid, uuid, text, text) from public;
grant execute on function anotar_reservas_cmr(uuid, uuid, text, text) to anon, authenticated;

-- ---- 4. Contraofertas ------------------------------------------------------------------
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
  -- Envío cancelado o ya en marcha: la contraoferta ya no tiene sentido.
  if p_aprobar and exists (select 1 from envios where id = r.envio_id and estado <> 'programado') then
    update envio_reservas set estado = 'rechazada', cerrada_en = now(), motivo_cierre = 'la carga ya no está disponible' where id = p_reserva;
    return jsonb_build_object('resultado', 'no_disponible');
  end if;
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
revoke execute on function resolver_contraoferta(uuid, boolean) from public, anon;

create or replace function fn_envios_cancelado_rechaza_reservas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'cancelado' and old.estado <> 'cancelado' then
    update envio_reservas set estado = 'rechazada', cerrada_en = now(), motivo_cierre = 'la carga se ha cancelado'
     where envio_id = new.id and estado = 'pendiente_revision';
  end if;
  return null;
end $$;
revoke execute on function fn_envios_cancelado_rechaza_reservas() from public, anon, authenticated;
create trigger tg_envios_cancelado_rechaza_reservas after update of estado on envios
  for each row execute function fn_envios_cancelado_rechaza_reservas();

-- ---- 5. Alta online de transportistas -------------------------------------------------
create or replace function alta_transportista_publica(
  p_reserva uuid, p_bolsa text, p_codigo_bolsa text, p_pais char(2), p_cif text, p_telefono text,
  p_precio numeric default null, p_pronto_pago boolean default false, p_ip inet default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; e record; v_t uuid; v_base numeric; v_banda numeric; v_fd int;
        o_t uuid; o_precio numeric; o_banda numeric; o_pp boolean;
        v_tel text := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
        v_cod text := nullif(trim(coalesce(p_codigo_bolsa, '')), '');
        v_cif text := upper(trim(coalesce(p_cif, '')));
        v_nombre_bolsa text; v_fr int;
begin
  select * into r from envio_reservas where id = p_reserva for update;
  if not found then return jsonb_build_object('resultado', 'reserva_no_existe'); end if;
  if r.estado <> 'viva' or r.hasta < now() then return jsonb_build_object('resultado', 'reserva_caducada'); end if;
  if r.oferta_id is not null then
    select transportista_id, precio_ofertado, banda_euros, pronto_pago into o_t, o_precio, o_banda, o_pp from envio_ofertas where id = r.oferta_id;
  end if;
  if o_t is not null then return jsonb_build_object('resultado', 'oferta_personal'); end if;

  select count(*) into v_fd from intentos_carga_publica where envio_id = r.envio_id and cuando > now() - interval '24 hours';
  if v_fd >= coalesce((parametro('carga_publica_max_fallos_dia') #>> '{}')::int, 20) then
    return jsonb_build_object('resultado', 'demasiados_intentos');
  end if;
  -- Topes de altas online: 3 pendientes por carga y 30 al día en total.
  if (select count(*) from envio_reservas rr join transportistas tt on tt.id = rr.transportista_id
       where rr.envio_id = r.envio_id and rr.estado = 'pendiente_revision' and 'alta_online' = any (tt.tags)) >= 3
     or (select count(*) from transportistas where 'alta_online' = any (tags) and creado_en > now() - interval '24 hours') >= 30 then
    return jsonb_build_object('resultado', 'demasiadas_altas');
  end if;

  -- Los cuatro datos (la pantalla ya los valida; aquí, por si llaman a la API a mano).
  if coalesce(p_bolsa, '') not in ('wtransnet', 'teleroute', 'bursa_transport', '123cargo') then
    return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'bolsa');
  end if;
  if v_cod is null or length(v_cod) > 30 then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'codigo_bolsa'); end if;
  if coalesce(p_pais, '') !~ '^[A-Z]{2}$' then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'pais'); end if;
  if length(normaliza_id_fiscal(v_cif)) not between 5 and 20 then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'cif'); end if;
  if v_tel is null or v_tel !~ '^\+?[0-9]{6,15}$' then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'telefono'); end if;

  -- Ya está en Dynamo (por CIF o por su código en esa bolsa): no se duplica.
  -- Cada intento con un CIF o código que ya existe cuenta como fallo (como en la
  -- aceptación normal): al llegar al máximo por reserva, se pierde la reserva.
  if exists (select 1 from transportistas where normaliza_id_fiscal(cif) = normaliza_id_fiscal(v_cif))
     or exists (select 1 from transportistas where bolsa = p_bolsa and lower(trim(codigo_bolsa)) = lower(v_cod)) then
    insert into intentos_carga_publica (envio_id, reserva_id, motivo, ip) values (r.envio_id, p_reserva, 'alta_ya_existe', p_ip);
    select count(*) into v_fr from intentos_carga_publica where reserva_id = p_reserva;
    if v_fr >= coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) then
      perform liberar_reserva(p_reserva, 'demasiados intentos de alta');
      return jsonb_build_object('resultado', 'demasiados_intentos');
    end if;
    return jsonb_build_object('resultado', case when exists (select 1 from transportistas where normaliza_id_fiscal(cif) = normaliza_id_fiscal(v_cif))
                                                then 'ya_existe' else 'ya_existe_bolsa' end);
  end if;

  -- Precio: el de la oferta, o el propuesto dentro de su banda.
  select * into e from envios where id = r.envio_id for update;
  if e.estado <> 'programado' or e.estado_asignacion = 'confirmada' then return jsonb_build_object('resultado', 'tomada'); end if;
  v_base := coalesce(o_precio, e.importe_transportista); v_banda := coalesce(o_banda, 0);
  if v_base is null then return jsonb_build_object('resultado', 'envio_sin_precio'); end if;
  if p_precio is not null and abs(p_precio - v_base) > v_banda then
    return jsonb_build_object('resultado', 'precio_fuera_de_banda', 'minimo', v_base - v_banda, 'maximo', v_base + v_banda);
  end if;

  v_nombre_bolsa := case p_bolsa when 'wtransnet' then 'Wtransnet' when 'teleroute' then 'Teleroute'
                                 when 'bursa_transport' then 'Bursa Transport' else '123cargo' end;
  begin
    -- La razón social es obligatoria en la tabla: hasta que Dynamo la copie de la bolsa,
    -- lleva un nombre provisional que dice de dónde sacarla.
    insert into transportistas (razon_social, cif, pais_codigo_iso, estado_operativo, bolsa, codigo_bolsa, tags, anotaciones)
    values (format('Pendiente de completar (%s %s)', v_nombre_bolsa, v_cod), v_cif, p_pais, 'no_ofertar', p_bolsa, v_cod, array['alta_online'],
            format('Alta online desde el enlace de la carga %s el %s%s. Datos dados: %s %s, CIF %s, teléfono %s. '
                   'PENDIENTE: comprobar que está en %s y completar razón social, dirección, seguro y email desde su ficha de la bolsa.',
                   e.referencia_gx, to_char(now() at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI'),
                   case when p_ip is not null then ' (IP ' || host(p_ip) || ')' else '' end,
                   v_nombre_bolsa, v_cod, v_cif, v_tel, v_nombre_bolsa))
    returning id into v_t;
  exception when unique_violation then
    return jsonb_build_object('resultado', 'ya_existe');
  end;
  -- Cada alta cuenta en el límite diario de intentos de la carga.
  insert into intentos_carga_publica (envio_id, reserva_id, motivo, ip) values (r.envio_id, p_reserva, 'alta_online', p_ip);
  insert into contactos (transportista_id, funcion, telefono, es_principal)
  values (v_t, 'trafico', v_tel, true);

  update envio_reservas set estado = 'pendiente_revision', precio_propuesto = coalesce(p_precio, v_base), transportista_id = v_t,
         pronto_pago = coalesce(p_pronto_pago, false) and coalesce(o_pp, true)
   where id = p_reserva;
  perform registrar_hito(e.id, 'contraoferta_propuesta', null, r.oferta_id,
    jsonb_build_object('reserva_id', p_reserva, 'precio_base', v_base, 'precio_propuesto', coalesce(p_precio, v_base),
                       'alta_online', true, 'bolsa', p_bolsa, 'codigo_bolsa', v_cod, 'cif', v_cif), 'servidor');
  return jsonb_build_object('resultado', 'alta_pendiente');
end $$;
revoke execute on function alta_transportista_publica(uuid, text, text, char, text, text, numeric, boolean, inet) from public;
grant execute on function alta_transportista_publica(uuid, text, text, char, text, text, numeric, boolean, inet) to anon, authenticated;

-- ---- 6. Tablón de otras cargas -----------------------------------------------------------
create or replace function otras_cargas_publicas(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t record;
begin
  select * into t from oferta_de_token(p_token);
  if t.envio_id is null then return '[]'::jsonb; end if;
  -- Solo con el enlace de una carga reciente (no vale cualquier enlace antiguo).
  if not exists (select 1 from envios where id = t.envio_id
                  and coalesce(fecha_carga_hasta, fecha_carga_desde, creado_en::date) >= (now() at time zone 'Europe/Madrid')::date - 14) then
    return '[]'::jsonb;
  end if;
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

-- ---- 7. Cuentas -------------------------------------------------------------------------
create or replace function fn_usuarios_campos_protegidos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_yo_rol rol_usuario;
begin
  if new.rol is distinct from old.rol
     and (old.cliente_id is not null or old.transportista_id is not null)
     and new.rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then
    raise exception 'Un email de % no puede pasar a %. Hay que borrar el usuario y darlo de alta de nuevo.',
      old.rol, new.rol using errcode = '42501';
  end if;

  -- El estado de un Admin Master: solo desde la consola de Supabase (tampoco con la clave de servicio).
  if old.rol = 'admin' and new.estado is distinct from old.estado and not es_consola_supabase() then
    raise exception 'El estado de un Admin Master solo se cambia desde Supabase.' using errcode = '42501';
  end if;
  -- Copias de avisos, email y anotaciones internas: Dynamo o el sistema, no el dueño de la cuenta.
  if (new.copias_avisos, new.email, new.anotaciones) is distinct from (old.copias_avisos, old.email, old.anotaciones)
     and not (es_servidor() or es_consola_supabase() or es_admin()) then
    raise exception 'Esos datos de la cuenta solo los cambia Dynamo.' using errcode = '42501';
  end if;

  if es_servidor() or autosusp_en_curso(old, new) then return new; end if;
  select rol into v_yo_rol from usuarios where id = auth.uid() and estado = 'activa';

  -- Estado de la cuenta (2026-11-04): nadie se suspende a sí mismo, el Admin Master solo
  -- se toca desde Supabase, y una cuenta no vuelve a «pendiente de verificación».
  if new.estado is distinct from old.estado then
    if new.id = auth.uid() then
      raise exception 'Nadie puede cambiar el estado de su propia cuenta.' using errcode = '42501';
    end if;
    if old.rol = 'admin' then
      raise exception 'El estado de un Admin Master solo se cambia desde Supabase.' using errcode = '42501';
    end if;
    if new.estado = 'pendiente_verificacion' then
      raise exception 'Una cuenta no puede volver a «pendiente de verificación»: o activa o suspendida.' using errcode = '42501';
    end if;
  end if;

  if (new.rol, new.estado, new.cliente_id, new.transportista_id,
      new.limite_consultas_precio_diario, new.limite_cargas_diario)
     is distinct from
     (old.rol, old.estado, old.cliente_id, old.transportista_id,
      old.limite_consultas_precio_diario, old.limite_cargas_diario) then
    if v_yo_rol is null or v_yo_rol not in ('admin', 'empleado') then
      raise exception 'Solo Dynamo puede cambiar el rol, el estado o la empresa de una cuenta.'
        using errcode = '42501';
    end if;
    if new.rol is distinct from old.rol and new.id = auth.uid() then
      raise exception 'Nadie puede cambiar su propio rol.' using errcode = '42501';
    end if;
    if new.rol in ('admin', 'admin_lectura') and new.rol is distinct from old.rol and v_yo_rol <> 'admin' then
      raise exception 'Solo el Admin Master puede conceder el rol %.', new.rol using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke execute on function fn_usuarios_campos_protegidos() from public, anon, authenticated;

-- ---- Higiene: funciones de trigger que no se llaman a mano ------------------------------
do $$ declare f text; begin
  foreach f in array array['fn_almacenamientos_campos_cliente()', 'fn_documentos_recurso()', 'fn_envios_valoracion_cliente()'] loop
    if to_regprocedure(f) is not null then execute format('revoke execute on function %s from public, anon, authenticated', f); end if;
  end loop;
end $$;
