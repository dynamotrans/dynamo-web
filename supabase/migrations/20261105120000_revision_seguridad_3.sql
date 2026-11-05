-- =====================================================================================
-- TERCERA TANDA DE LA REVISIÓN DE SEGURIDAD (base de datos del 4-5 nov) — 2026-11-05
--  1. Limpieza RGPD incompleta:
--     · la IP y el navegador de las reservas se copiaban a la auditoría (que no caduca):
--       ya no se copian, y la limpieza los quita de las copias de más de 90 días;
--     · el alta online apuntaba la IP en la nota interna: ya no, y la limpieza la quita de
--       las notas de más de 90 días (la IP ya queda en el registro de intentos);
--     · al borrar el teléfono de un conductor sin viajes en 2 años, también la copia de
--       sus envíos (como ya hacía «anonimizar»).
--  2. Borrados dentro de una anonimización: la auditoría ya no guarda la fila borrada.
--  3. horario_texto: solo para las funciones del sistema.
--  4. Resolver una contraoferta de transportista: la reserva se vuelve a leer bloqueada,
--     para que dos personas (o la caducidad) a la vez no la aprueben ya rechazada.
--  5. Contraoferta del cliente: además del tope por envío (3), tope por cliente (6 en 24 h).
-- La auditoría solo admite esta limpieza (marca dynamo.purga, que solo pone la función
-- purgar_datos_personales: Admin Master, servidor o consola).
-- =====================================================================================

create or replace function fn_auditar()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_cambios jsonb := '{}'::jsonb;
  v_accion  text;
  v_id      text;
  v_uid     uuid := auth.uid();
  k         text;
  -- Campos que NO generan entrada de auditoría por sí solos: son el propio sello.
  v_ignorar text[] := array['modificado_en', 'modificado_por']
                       -- Datos técnicos que caducan (RGPD): no se copian a la auditoría.
                       || case tg_table_name when 'envio_reservas' then array['ip', 'navegador'] else array[]::text[] end;
begin
  if tg_op = 'INSERT' then
    v_new     := to_jsonb(new) - v_ignorar;
    v_id      := v_new ->> 'id';
    v_accion  := 'alta';
    v_cambios := jsonb_build_object('despues', v_new - v_ignorar);

  elsif tg_op = 'UPDATE' then
    v_old    := to_jsonb(old);
    v_new    := to_jsonb(new);
    v_id     := v_new ->> 'id';
    v_accion := 'modificacion';
    for k in select jsonb_object_keys(v_new) loop
      if not (k = any (v_ignorar)) and (v_old -> k) is distinct from (v_new -> k) then
        v_cambios := v_cambios || jsonb_build_object(
          k, jsonb_build_object('antes', v_old -> k, 'despues', v_new -> k)
        );
      end if;
    end loop;
    -- Un UPDATE que no cambia nada real no ensucia la auditoría.
    if v_cambios = '{}'::jsonb then
      return new;
    end if;
    -- Anonimización (RGPD): se apunta QUÉ campos se borraron, nunca sus valores.
    if coalesce(current_setting('dynamo.anonimizando', true), '') = 'on' then
      v_cambios := jsonb_build_object('anonimizado', true,
                     'campos', (select jsonb_agg(x order by x) from jsonb_object_keys(v_cambios) x));
    end if;

  else   -- DELETE
    v_old     := to_jsonb(old) - v_ignorar;
    v_id      := v_old ->> 'id';
    v_accion  := 'baja';
    v_cambios := jsonb_build_object('antes', v_old);
    -- Borrado dentro de una anonimización: sin los datos borrados.
    if coalesce(current_setting('dynamo.anonimizando', true), '') = 'on' then
      v_cambios := jsonb_build_object('anonimizado', true, 'borrado', true);
    end if;
  end if;

  insert into auditoria (tabla, registro_id, accion, quien, quien_email, quien_origen, cambios)
  values (
    tg_table_name,
    v_id,
    v_accion,
    v_uid,
    (select u.email from auth.users u where u.id = v_uid),
    case when coalesce(current_setting('dynamo.migracion', true), '') = 'on'
         then 'migracion-sheet' else 'app' end,
    v_cambios
  );

  return coalesce(new, old);
end $$;

create or replace function fn_auditoria_inmutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('dynamo.purga', true), '') = 'on' then return null; end if;
  raise exception
    'La tabla auditoria es append-only (regla 12). Intento de % bloqueado.', tg_op;
end $$;

create or replace function purgar_datos_personales()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb := '{}'; n int;
begin
  if not (es_servidor() or es_consola_supabase() or es_administrador()) then
    raise exception 'Solo el sistema o el Admin Master.' using errcode = '42501';
  end if;
  perform set_config('dynamo.purga', 'on', true);
  perform set_config('dynamo.anonimizando', 'on', true);
  update envio_reservas set ip = null, navegador = null
   where coalesce(cerrada_en, desde) < now() - interval '90 days' and (ip is not null or navegador is not null);
  get diagnostics n = row_count; r := r || jsonb_build_object('reservas_ip', n);
  delete from intentos_carga_publica where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_carga', n);
  delete from pin_intentos where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_pin', n);
  delete from contraoferta_intentos where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_contraoferta', n);
  delete from conexion_minutos where dia < current_date - 365;
  get diagnostics n = row_count; r := r || jsonb_build_object('conexion', n);
  delete from consultas_precio where cuando < now() - interval '12 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('consultas', n);
  with sin_viajes as (
    select c.id from conductores c
     where c.creado_en < now() - interval '2 years'
       and not exists (select 1 from envios e where e.conductor_id = c.id
                        and coalesce(e.fecha_carga_real::date, e.fecha_carga_desde, e.creado_en::date) > current_date - 730)
  ), a as (update conductores set telefono = null where id in (select id from sin_viajes) and telefono is not null returning 1)
  select count(*) into n from a;
  r := r || jsonb_build_object('telefonos_conductores', n);
  -- Y la copia del teléfono que guarda cada envío de esos conductores.
  update envios set conductor_telefono = null
   where conductor_telefono is not null and conductor_id in (
     select c.id from conductores c where c.creado_en < now() - interval '2 years'
        and not exists (select 1 from envios e where e.conductor_id = c.id
                         and coalesce(e.fecha_carga_real::date, e.fecha_carga_desde, e.creado_en::date) > current_date - 730));
  -- IP y navegador de las reservas que se copiaron a la auditoría antes de este cambio.
  update auditoria set cambios = ((cambios #- '{despues,ip}' #- '{despues,navegador}' #- '{antes,ip}' #- '{antes,navegador}') - 'ip' - 'navegador')
   where tabla = 'envio_reservas' and cuando < now() - interval '90 days'
     and (cambios::text like '%"ip"%' or cambios::text like '%"navegador"%');
  get diagnostics n = row_count; r := r || jsonb_build_object('auditoria_ip', n);
  -- La IP que apuntaba el alta online en su nota interna.
  update notas_internas set texto = regexp_replace(texto, ' \(IP [^)]*\)', '', 'g')
   where texto ~ '\(IP ' and creado_en < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('notas_ip', n);
  perform set_config('dynamo.purga', 'off', true);
  perform set_config('dynamo.anonimizando', 'off', true);
  return r;
end $$;
revoke execute on function purgar_datos_personales() from public, anon;
grant execute on function purgar_datos_personales() to authenticated;

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
  -- Topes de altas online (parámetros): pendientes por carga y altas al día en total.
  if (select count(*) from envio_reservas rr join transportistas tt on tt.id = rr.transportista_id
       where rr.envio_id = r.envio_id and rr.estado = 'pendiente_revision' and 'alta_online' = any (tt.tags)) >= p_num('alta_online_max_pendientes_carga', 3)
     or (select count(*) from transportistas where 'alta_online' = any (tags) and creado_en > now() - interval '24 hours') >= p_num('alta_online_max_dia', 30) then
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
            format('Alta online desde el enlace de la carga %s el %s. Datos dados: %s %s, CIF %s, teléfono %s. '
                   'PENDIENTE: comprobar que está en %s y completar razón social, dirección, seguro y email desde su ficha de la bolsa.',
                   e.referencia_gx, to_char(now() at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI'),
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
  -- Con el envío bloqueado, la reserva otra vez y bloqueada: si mientras tanto otra persona
  -- (o la caducidad) la ha cerrado, ya no se resuelve.
  select * into r from envio_reservas where id = p_reserva for update;
  if r.estado <> 'pendiente_revision' then
    return jsonb_build_object('resultado','no_hay_contraoferta_pendiente');
  end if;
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
  -- Propuestas demasiado bajas: se apuntan y, a la 3.ª en 24 h, el envío no admite más
  -- propuestas ese día (así no se puede ir probando hasta dar con el % máximo).
  if (select count(*) from contraoferta_intentos where envio_id = p_envio and cuando > now() - interval '24 hours') >= 3
     or (select count(*) from contraoferta_intentos i join envios x on x.id = i.envio_id
          where x.cliente_id = e.cliente_id and i.cuando > now() - interval '24 hours') >= 6 then
    return jsonb_build_object('resultado', 'demasiados_intentos');
  end if;
  if v_rebaja > v_max then
    insert into contraoferta_intentos (envio_id, usuario_id, importe) values (p_envio, auth.uid(), v_p);
    return jsonb_build_object('resultado', 'demasiado_lejos');
  end if;

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
revoke execute on function contraofertar_precio_solicitud(uuid, numeric) from public, anon;
grant execute on function contraofertar_precio_solicitud(uuid, numeric) to authenticated;

revoke execute on function horario_texto(uuid, text) from public, anon, authenticated;
