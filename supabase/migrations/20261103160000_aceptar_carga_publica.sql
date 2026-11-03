-- =====================================================================================
-- PÁGINA PÚBLICA "ACEPTAR CARGA" (2026-11-03)
-- =====================================================================================
-- El transportista abre el enlace de una oferta SIN iniciar sesión. Las funciones de
-- reserva y aceptación (0010) solo las podía llamar el servidor con la clave de
-- servicio. En vez de darle esa clave al servidor web, se abre una puerta ESTRECHA,
-- con la clave pública y solo lo justo:
--
--   oferta_publica(token)            → ve la oferta: SOLO CP, población y provincia de
--                                      cada punto (ni empresa, ni calle, ni cliente:
--                                      anti-desintermediación). No reserva ni cuenta
--                                      aperturas (los avances de WhatsApp abren enlaces).
--   reservar_envio(token, ip, nav)   → la de siempre: bloquea la carga 3 minutos.
--   aceptar_oferta_publica(reserva, cif, precio, pronto_pago, matrículas, conductor)
--                                    → si la oferta era PARA un transportista, es él
--                                      (el CIF no cuenta); si es de bolsa, se identifica
--                                      con su CIF. Luego, la aceptación de siempre.
--   completar_carga_publica(reserva…) → matrículas y conductor después de aceptar.
--   carga_aceptada_publica(reserva)  → los datos completos de la carga, SOLO a quien la
--                                      aceptó (direcciones, horarios, contactos).
--   liberar_reserva(reserva, motivo) → "no me interesa": la carga queda libre ya.
--
-- El id de la reserva es la llave: solo lo tiene quien reservó (va en una cookie).
-- PENDIENTE antes de producción (PRODUCCION.md): código de confirmación por email al
-- aceptar con un enlace de bolsa (sin él, alguien con el enlace podría aceptar con el
-- CIF de otro transportista) y un límite de peticiones por IP.
-- =====================================================================================

alter table envio_reservas add column pronto_pago boolean not null default false;
comment on column envio_reservas.pronto_pago is
  'El transportista eligio pronto pago al aceptar (si la oferta lo ofrecia).';

insert into parametros (clave, valor, descripcion) values
  ('pronto_pago_pct', '3', 'Descuento (%) del pronto pago al transportista.'),
  ('pronto_pago_minimo', '20', 'Descuento minimo (EUR) del pronto pago.'),
  ('pronto_pago_dias', '5', 'Dias tras la factura en que se paga con pronto pago.'),
  ('plazo_pago_transportista_dias', '60', 'Plazo de pago normal al transportista (para la comparativa).')
on conflict (clave) do nothing;

-- ---- Resolver un enlace: la oferta (personal o de bolsa) o el enlace general --------
create or replace function oferta_de_token(p_token uuid,
  out envio_id uuid, out oferta_id uuid, out oferta_activa boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(o.envio_id, e.id), o.id,
         case when o.id is null then e.id is not null
              else o.estado = 'activa' and o.caduca_en > now() end
    from (select 1) x
    left join envio_ofertas o on o.token = p_token
    left join envios e on o.id is null and e.token_publico = p_token
$$;
revoke execute on function oferta_de_token(uuid) from public, anon, authenticated;

-- ---- Ver la oferta (sin datos que permitan saltarse a Dynamo) -----------------------
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
                        and estado in ('viva', 'pendiente_revision') and hasta > now());

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

-- ---- Aceptar --------------------------------------------------------------------------
create or replace function aceptar_oferta_publica(
  p_reserva uuid, p_cif text, p_precio numeric default null, p_pronto_pago boolean default false,
  p_camion text default null, p_remolque text default null, p_conductor text default null, p_telefono text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; o record; v_t uuid; v_res jsonb; v_tel text;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found then return jsonb_build_object('resultado', 'reserva_no_existe'); end if;
  if r.oferta_id is not null then select * into o from envio_ofertas where id = r.oferta_id; end if;

  -- ¿Quién acepta? La oferta personal ya lo dice; la de bolsa, por su CIF.
  v_t := o.transportista_id;
  if v_t is null then
    if nullif(trim(p_cif), '') is null then return jsonb_build_object('resultado', 'falta_cif'); end if;
    select id into v_t from transportistas where normaliza_id_fiscal(cif) = normaliza_id_fiscal(p_cif);
    if v_t is null then return jsonb_build_object('resultado', 'transportista_no_encontrado'); end if;
  end if;

  v_res := aceptar_reserva(p_reserva, v_t, null, p_precio);
  if v_res ->> 'resultado' in ('aceptada', 'pendiente_revision') then
    update envio_reservas
       set pronto_pago = coalesce(p_pronto_pago, false) and coalesce(o.pronto_pago, true)
     where id = p_reserva;
  end if;
  if v_res ->> 'resultado' = 'aceptada' then
    v_tel := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
    update envios set
      matricula_camion   = coalesce(nullif(upper(regexp_replace(coalesce(p_camion, ''), '[\s-]', '', 'g')), ''), matricula_camion),
      matricula_remolque = coalesce(nullif(upper(regexp_replace(coalesce(p_remolque, ''), '[\s-]', '', 'g')), ''), matricula_remolque),
      conductor_nombre   = coalesce(nullif(trim(p_conductor), ''), conductor_nombre),
      conductor_telefono = coalesce(case when length(replace(v_tel, '+', '')) >= 6 then v_tel end, conductor_telefono),
      transportista_nima = coalesce(transportista_nima, (select nima from transportistas where id = v_t))
     where id = r.envio_id;
  end if;
  return v_res || jsonb_build_object('transportista', (select nombre_visible from transportistas where id = v_t));
end $$;

-- ---- Completar matrículas y conductor después de aceptar ----------------------------
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
  v_tel := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
  update envios set
    matricula_camion   = nullif(upper(regexp_replace(coalesce(p_camion, ''), '[\s-]', '', 'g')), ''),
    matricula_remolque = nullif(upper(regexp_replace(coalesce(p_remolque, ''), '[\s-]', '', 'g')), ''),
    conductor_nombre   = nullif(trim(p_conductor), ''),
    conductor_telefono = case when length(replace(coalesce(v_tel, ''), '+', '')) >= 6 then v_tel end
   where id = r.envio_id;
  return jsonb_build_object('resultado', 'guardado');
end $$;

-- ---- Los datos completos de la carga, solo a quien la aceptó ------------------------
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

-- ---- La puerta: estas, y solo estas, con la clave pública ---------------------------
grant execute on function oferta_publica(uuid)                       to anon, authenticated;
grant execute on function reservar_envio(uuid, inet, text)           to anon, authenticated;
grant execute on function liberar_reserva(uuid, text)                to anon, authenticated;
grant execute on function carga_aceptada_publica(uuid)               to anon, authenticated;
grant execute on function completar_carga_publica(uuid, text, text, text, text) to anon, authenticated;
grant execute on function aceptar_oferta_publica(uuid, text, numeric, boolean, text, text, text, text) to anon, authenticated;
-- aceptar_reserva, cerrar_aceptacion y caducar_reservas siguen siendo solo del servidor:
-- la puerta pública las usa por dentro, con sus comprobaciones.
