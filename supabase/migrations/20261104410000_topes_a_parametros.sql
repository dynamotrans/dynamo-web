-- =====================================================================================
-- LOS TOPES DE LA REVISIÓN DE SEGURIDAD, A PARÁMETROS (usuario, 2026-11-04)
-- Se pusieron fijos en el código (20261104400000); ahora se cambian en Parámetros:
--   · alta_online_max_pendientes_carga (3) · alta_online_max_dia (30) · tablon_enlace_dias (14)
-- Un valor a 0 en los dos primeros deja la puerta cerrada (ninguna alta online).
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('alta_online_max_pendientes_carga', '3', 'Alta online de transportistas: como mucho estas altas esperando revisión en una misma carga.'),
  ('alta_online_max_dia', '30', 'Alta online de transportistas: como mucho estas altas nuevas en 24 horas, entre todas las cargas.'),
  ('tablon_enlace_dias', '14', 'Tablón de otras cargas: el enlace sirve si su carga es de hace como mucho estos días.')
on conflict (clave) do nothing;

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

create or replace function otras_cargas_publicas(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t record;
begin
  select * into t from oferta_de_token(p_token);
  if t.envio_id is null then return '[]'::jsonb; end if;
  -- Solo con el enlace de una carga reciente (no vale cualquier enlace antiguo).
  if not exists (select 1 from envios where id = t.envio_id
                  and coalesce(fecha_carga_hasta, fecha_carga_desde, creado_en::date) >= (now() at time zone 'Europe/Madrid')::date - p_num('tablon_enlace_dias', 14)::int) then
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
