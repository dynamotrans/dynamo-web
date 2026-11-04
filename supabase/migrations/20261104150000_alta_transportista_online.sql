-- =====================================================================================
-- ALTA ONLINE DE UN TRANSPORTISTA NUEVO desde el enlace de una carga (decisión 2026-11-04)
-- =====================================================================================
-- Hasta hoy, si el CIF no estaba en Dynamo, la página pública decía «contáctanos». Ahora
-- el transportista se da de alta ahí mismo y acepta la carga. Pero un desconocido NO se
-- queda la carga al instante (estafa del "transportista fantasma": se lleva la mercancía):
--
--   · Su ficha nace como `no_ofertar` (no recibe más ofertas) y con la etiqueta
--     `alta_online`, con lo que dijo y desde dónde (IP) en sus anotaciones.
--   · La carga queda RESERVADA para él en `pendiente_revision` (lo mismo que una
--     contraoferta): nadie más la coge, y Dynamo comprueba CIF, seguro y tarjeta de
--     transporte y la aprueba o la rechaza desde la ficha del envío.
--   · Solo con enlaces de BOLSA (una oferta personal ya va a un transportista conocido),
--     con la reserva viva y dentro de los límites de intentos de la página pública.
--   · Un CIF ya dado de alta no se duplica (regla 10): se le dice que acepte con su CIF.
-- =====================================================================================
create or replace function alta_transportista_publica(
  p_reserva uuid, p_razon_social text, p_cif text, p_pais char(2), p_direccion text, p_codigo_postal text, p_poblacion text,
  p_contacto text, p_telefono text, p_email text, p_bolsa text, p_codigo_bolsa text,
  p_seguro_compania text, p_seguro_poliza text, p_seguro_vence date,
  p_precio numeric default null, p_pronto_pago boolean default false, p_ip inet default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; e record; v_t uuid; v_base numeric; v_banda numeric; v_fd int;
        o_t uuid; o_precio numeric; o_banda numeric; o_pp boolean;
        v_tel text := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
        v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
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

  -- Datos mínimos (la pantalla ya los valida; aquí, por si llaman a la API a mano).
  if length(trim(coalesce(p_razon_social, ''))) not between 2 and 150 then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'razon_social'); end if;
  if length(normaliza_id_fiscal(coalesce(p_cif, ''))) not between 5 and 20 then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'cif'); end if;
  if coalesce(p_pais, '') !~ '^[A-Z]{2}$' then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'pais'); end if;
  if length(trim(coalesce(p_contacto, ''))) not between 2 and 120 then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'contacto'); end if;
  if v_tel is null or v_tel !~ '^\+?[0-9]{6,15}$' then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'telefono'); end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'email'); end if;
  if p_bolsa is not null and p_bolsa not in ('wtransnet', 'teleroute', 'bursa_transport', '123cargo') then return jsonb_build_object('resultado', 'datos_no_validos', 'campo', 'bolsa'); end if;

  if exists (select 1 from transportistas where normaliza_id_fiscal(cif) = normaliza_id_fiscal(p_cif)) then
    return jsonb_build_object('resultado', 'ya_existe');
  end if;

  -- Precio: el de la oferta, o el propuesto dentro de su banda.
  select * into e from envios where id = r.envio_id for update;
  if e.estado <> 'programado' or e.estado_asignacion = 'confirmada' then return jsonb_build_object('resultado', 'tomada'); end if;
  v_base := coalesce(o_precio, e.importe_transportista); v_banda := coalesce(o_banda, 0);
  if v_base is null then return jsonb_build_object('resultado', 'envio_sin_precio'); end if;
  if p_precio is not null and abs(p_precio - v_base) > v_banda then
    return jsonb_build_object('resultado', 'precio_fuera_de_banda', 'minimo', v_base - v_banda, 'maximo', v_base + v_banda);
  end if;

  begin
    insert into transportistas (razon_social, cif, pais_codigo_iso, direccion, codigo_postal, poblacion, estado_operativo,
                                bolsa, codigo_bolsa, seguro_cmr_compania, seguro_cmr_poliza, seguro_cmr_vence, tags, anotaciones)
    values (trim(p_razon_social), upper(trim(p_cif)), p_pais, nullif(trim(p_direccion), ''), nullif(trim(p_codigo_postal), ''), nullif(trim(p_poblacion), ''),
            'no_ofertar', p_bolsa, case when p_bolsa is not null then nullif(trim(p_codigo_bolsa), '') end,
            nullif(trim(p_seguro_compania), ''), nullif(trim(p_seguro_poliza), ''), p_seguro_vence, array['alta_online'],
            format('Alta online desde el enlace de la carga %s el %s%s. PENDIENTE DE VERIFICAR: CIF, seguro CMR y tarjeta de transporte.',
                   e.referencia_gx, to_char(now() at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI'),
                   case when p_ip is not null then ' (IP ' || host(p_ip) || ')' else '' end))
    returning id into v_t;
  exception when unique_violation then
    return jsonb_build_object('resultado', 'ya_existe');
  end;
  insert into contactos (transportista_id, nombre, funcion, telefono, email, es_principal)
  values (v_t, trim(p_contacto), 'trafico', v_tel, v_email, true);

  update envio_reservas set estado = 'pendiente_revision', precio_propuesto = coalesce(p_precio, v_base), transportista_id = v_t,
         pronto_pago = coalesce(p_pronto_pago, false) and coalesce(o_pp, true)
   where id = p_reserva;
  perform registrar_hito(e.id, 'contraoferta_propuesta', null, r.oferta_id,
    jsonb_build_object('reserva_id', p_reserva, 'precio_base', v_base, 'precio_propuesto', coalesce(p_precio, v_base),
                       'alta_online', true, 'transportista', trim(p_razon_social)), 'servidor');
  return jsonb_build_object('resultado', 'alta_pendiente', 'transportista', trim(p_razon_social));
end $$;
revoke execute on function alta_transportista_publica(uuid, text, text, char, text, text, text, text, text, text, text, text, text, text, date, numeric, boolean, inet) from public;
grant execute on function alta_transportista_publica(uuid, text, text, char, text, text, text, text, text, text, text, text, text, text, date, numeric, boolean, inet) to anon, authenticated;
