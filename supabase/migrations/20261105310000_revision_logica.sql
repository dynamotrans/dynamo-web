-- =====================================================================================
-- ARREGLOS DE LA REVISIÓN DE LÓGICA Y CONCURRENCIA (2026-11-05)
--  1. Aceptar una carga del tablón (sin oferta) reventaba: «record o is not assigned».
--  2. Pronto pago: la línea se comprueba AL ACEPTAR (con cerrojo), no solo al ofertar.
--  3. Cobro con tarjeta no aplicado (importe distinto o ya pagado): aviso urgente a Dynamo,
--     el envío no se anula por falta de pago, y Dynamo puede darlo por pagado.
--  4. Rechazar el precio de una solicitud (o cancelar un borrador) no cuenta como
--     cancelación para la suspensión automática, ni suma como envío.
--  5. El cliente acepta solo el precio que ha visto (si Dynamo lo cambió, se le avisa).
--  6. Deshacer una cancelación: una solicitud vuelve a solicitud; pendiente de pago, plazo
--     nuevo; con camión, aviso al transportista.
--  7. Marcar el pago solo en envíos activos.
--  8. Un envío pagado no cambia de precio ni de IVA (hay que deshacer antes el pago).
--  9. Cancelar un borrador no lo «confirma» (validación de ruta, hito, confirmado_en).
-- 10. El plazo para pagar no acaba en fin de semana ni festivo.
-- 11. Mover la fecha no borra una subida de precio pendiente de respuesta.
-- 12. «Hoy» en hora de Madrid en las funciones que usaban la fecha UTC.
-- 13. El transportista no marca «en ruta» ni «entregado» antes del día de carga.
-- 14. Índices para lo que crece: envíos por autor y por matrícula del camión.
-- =====================================================================================

alter table envios add column stripe_cobro_sin_aplicar text;
comment on column public.envios.stripe_cobro_sin_aplicar is 'formato: texto | rango: no aplica | lista: no aplica | automático | Id de un cobro con tarjeta (Stripe) que llegó y NO se aplicó solo (importe distinto o envío ya pagado). Mientras tenga valor, el envío no se anula por falta de pago; Dynamo lo da por pagado (marcar_pago_envio «tarjeta») o lo devuelve en Stripe.';

create or replace function aceptar_oferta_publica(
  p_reserva uuid, p_cif text, p_precio numeric default null, p_pronto_pago boolean default false,
  p_camion text default null, p_remolque text default null, p_conductor text default null, p_telefono text default null,
  p_ip inet default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; o_t uuid; o_pp boolean; v_t uuid; v_res jsonb; v_tel text; v_fr int; v_fd int;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found then return jsonb_build_object('resultado', 'reserva_no_existe'); end if;
  if r.oferta_id is not null then select transportista_id, pronto_pago into o_t, o_pp from envio_ofertas where id = r.oferta_id; end if;
  -- Pronto pago: un aceptado a la vez comprueba la línea (ver fn_reservas_pronto_pago_linea).
  if coalesce(p_pronto_pago, false) then perform pg_advisory_xact_lock(hashtext('dynamo_pronto_pago')); end if;

  -- ¿Demasiados fallos con esta carga en 24 h? Bloqueada por enlace.
  select count(*) into v_fd from intentos_carga_publica where envio_id = r.envio_id and cuando > now() - interval '24 hours';
  if v_fd >= coalesce((parametro('carga_publica_max_fallos_dia') #>> '{}')::int, 20) then
    return jsonb_build_object('resultado', 'demasiados_intentos');
  end if;

  v_t := o_t;
  if v_t is null then
    if nullif(trim(p_cif), '') is null then return jsonb_build_object('resultado', 'falta_cif'); end if;
    select id into v_t from transportistas where normaliza_id_fiscal(cif) = normaliza_id_fiscal(p_cif);
    if v_t is null then
      insert into intentos_carga_publica (envio_id, reserva_id, motivo, ip) values (r.envio_id, p_reserva, 'cif_no_encontrado', p_ip);
      select count(*) into v_fr from intentos_carga_publica where reserva_id = p_reserva;
      if v_fr >= coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) then
        perform liberar_reserva(p_reserva, 'demasiados CIF no encontrados');
        return jsonb_build_object('resultado', 'demasiados_intentos');
      end if;
      return jsonb_build_object('resultado', 'transportista_no_encontrado', 'intentos_restantes',
        coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) - v_fr);
    end if;
  end if;

  v_res := aceptar_reserva(p_reserva, v_t, null, p_precio);
  if v_res ->> 'resultado' in ('aceptada', 'pendiente_revision') then
    update envio_reservas
       set pronto_pago = coalesce(p_pronto_pago, false) and coalesce(o_pp, true)
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

create or replace function cerrar_aceptacion(
  p_reserva uuid, p_transportista uuid, p_usuario uuid, p_precio numeric
) returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; o record;
begin
  perform pg_advisory_xact_lock(hashtext('dynamo_pronto_pago'));   -- línea de pronto pago
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


-- La línea de pronto pago, al aceptar (lo que se compromete de verdad).
create or replace function fn_reservas_pronto_pago_linea()
returns trigger language plpgsql security definer set search_path = public as $$
declare est jsonb;
begin
  if new.estado = 'aceptada' and new.pronto_pago and not (old.estado = 'aceptada' and old.pronto_pago) then
    perform pg_advisory_xact_lock(hashtext('dynamo_pronto_pago'));
    est := pronto_pago_estado();
    if not coalesce((est ->> 'activo')::boolean, false)
       or coalesce((est ->> 'disponible')::numeric, 0) < coalesce(new.precio_aceptado, 0) - pronto_pago_descuento(coalesce(new.precio_aceptado, 0)) then
      new.pronto_pago := false;     -- sin línea: se paga a su plazo normal
    end if;
  end if;
  return new;
end $$;
revoke execute on function fn_reservas_pronto_pago_linea() from public, anon, authenticated;
create trigger tg_reservas_pronto_pago_linea before update on envio_reservas
  for each row execute function fn_reservas_pronto_pago_linea();

create or replace function pago_envio_stripe(p_envio uuid, p_pago text, p_centimos bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e record; t numeric;
begin
  if not es_servidor() then raise exception 'Solo el servidor confirma pagos con tarjeta.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if e.stripe_pago = p_pago then return jsonb_build_object('resultado', 'ya_registrado'); end if;
  -- Pago que llega cuando el envío ya está anulado (por ejemplo, fuera de plazo): no lo
  -- reactiva; se avisa a Dynamo para devolverlo en Stripe.
  if e.estado = 'cancelado' then
    perform crear_aviso('dynamo', null, null, 'pago_anulado', 'urgente', 'Pago con tarjeta de un envío anulado · #' || coalesce(e.referencia_gx, ''),
      'Devuélvelo en Stripe (pago ' || p_pago || ') o reactiva el envío si el cliente aún lo quiere.', '/panel/envios?ver=' || e.id, e.id);
    return jsonb_build_object('resultado', 'envio_anulado');
  end if;
  if e.pago_previo <> 'pendiente' then
    -- Cobro de más (ya pagado por transferencia, o dos páginas de pago): avisar para devolverlo.
    update envios set stripe_cobro_sin_aplicar = p_pago where id = p_envio;
    perform crear_aviso('dynamo', null, null, 'pago_no_aplicado', 'urgente', 'Cobro con tarjeta de un envío ya pagado · #' || coalesce(e.referencia_gx, ''),
      'Se ha cobrado ' || euros_txt(p_centimos / 100.0) || ' con tarjeta (pago ' || p_pago || ') y el envío ya estaba ' || e.pago_previo || '. Devuélvelo en Stripe.', '/panel/envios?ver=' || e.id, e.id);
    return jsonb_build_object('resultado', 'no_pendiente', 'estado', e.pago_previo);
  end if;
  select total into t from pago_envio_importes(p_envio);
  if round(t * 100) <> p_centimos then
    -- El importe cambió con la página de pago abierta: el cobro está hecho, así que el
    -- envío NO se anula por falta de pago; Dynamo decide (darlo por pagado o devolverlo).
    update envios set stripe_cobro_sin_aplicar = p_pago where id = p_envio;
    perform crear_aviso('dynamo', null, null, 'pago_no_aplicado', 'urgente', 'Cobro con tarjeta por otro importe · #' || coalesce(e.referencia_gx, ''),
      'Cobrado ' || euros_txt(p_centimos / 100.0) || ', el envío dice ' || euros_txt(t) || ' (pago ' || p_pago || '). Dalo por pagado en la ficha o devuelve la diferencia en Stripe.', '/panel/envios?ver=' || e.id, e.id);
    return jsonb_build_object('resultado', 'importe_distinto', 'esperado', round(t * 100), 'cobrado', p_centimos);
  end if;
  update envios set pago_previo = 'pagado', pago_metodo = 'stripe', pagado_en = now(), stripe_pago = p_pago where id = p_envio;
  return jsonb_build_object('resultado', 'ok');
end $$;

create or replace function caducar_pagos_pendientes()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not (es_servidor() or es_consola_supabase() or es_admin()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  for r in select id from envios
            where estado = 'programado' and pago_previo = 'pendiente' and pago_pendiente_desde is not null
              and transportista_id is null and stripe_cobro_sin_aplicar is null
              and now() > pago_limite(pago_pendiente_desde) + interval '45 minutes'
            for update skip locked loop
    update envios set estado = 'cancelado' where id = r.id;
    perform registrar_hito(r.id, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', 'Anulado: no se recibió el pago a tiempo', 'por', 'sistema'), 'servidor');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function marcar_pago_envio(p_envio uuid, p_accion text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e record; v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not es_admin() then raise exception 'Solo Dynamo marca el pago de un envío.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if coalesce(e.es_manual, false) then return jsonb_build_object('resultado', 'envio_manual'); end if;
  if p_accion in ('transferencia', 'exento', 'requerir', 'tarjeta') and e.estado <> 'programado' then
    return jsonb_build_object('resultado', 'envio_no_activo');
  end if;

  if p_accion = 'transferencia' then
    if e.pago_previo <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
    update envios set pago_previo = 'pagado', pago_metodo = 'transferencia', pagado_en = now(), pago_resuelto_por = auth.uid()
     where id = p_envio;
  elsif p_accion = 'tarjeta' then
    -- Un cobro con tarjeta que no se aplicó solo (importe distinto): Dynamo lo da por bueno.
    if e.pago_previo <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
    if e.stripe_cobro_sin_aplicar is null then return jsonb_build_object('resultado', 'sin_cobro'); end if;
    update envios set pago_previo = 'pagado', pago_metodo = 'stripe', pagado_en = now(), stripe_pago = stripe_cobro_sin_aplicar,
                      stripe_cobro_sin_aplicar = null, pago_resuelto_por = auth.uid()
     where id = p_envio;
  elsif p_accion = 'exento' then
    if e.pago_previo <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
    if v_motivo is null or length(v_motivo) < 3 then return jsonb_build_object('resultado', 'falta_motivo'); end if;
    update envios set pago_previo = 'exento', pago_exento_motivo = left(v_motivo, 500), pago_resuelto_por = auth.uid()
     where id = p_envio;
  elsif p_accion = 'requerir' then
    if e.pago_previo <> 'no_requerido' then return jsonb_build_object('resultado', 'ya_tiene_pago'); end if;
    if e.transportista_id is not null or e.estado_asignacion <> 'sin_asignar' or e.publicado_en_bolsa_en is not null then
      return jsonb_build_object('resultado', 'ya_ofertado');
    end if;
    update envios set pago_previo = 'pendiente', pago_motivo = coalesce(v_motivo, 'Pedido por Dynamo') where id = p_envio;
  elsif p_accion = 'deshacer' then
    if e.pago_previo not in ('pagado', 'exento') then return jsonb_build_object('resultado', 'nada_que_deshacer'); end if;
    if e.pago_metodo = 'stripe' then return jsonb_build_object('resultado', 'pagado_con_tarjeta'); end if;
    if e.transportista_id is not null or e.estado_asignacion <> 'sin_asignar' or e.publicado_en_bolsa_en is not null then
      return jsonb_build_object('resultado', 'ya_ofertado');
    end if;
    update envios set pago_previo = 'pendiente', pago_metodo = null, pagado_en = null, pago_resuelto_por = null, pago_exento_motivo = null
     where id = p_envio;
  else
    return jsonb_build_object('resultado', 'accion_no_valida');
  end if;
  return jsonb_build_object('resultado', 'ok');
end $$;


-- Cancelar un borrador o rechazar el precio de una solicitud: sin coste y no cuenta.
create or replace function fn_envios_ad_cancelar_borrador()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'borrador' and new.estado = 'cancelado' then new.cancelacion_sin_coste := true; end if;
  return new;
end $$;
revoke execute on function fn_envios_ad_cancelar_borrador() from public, anon, authenticated;
create trigger tg_envios_ad_cancelar_borrador before update on envios
  for each row execute function fn_envios_ad_cancelar_borrador();

alter table envios disable trigger user;
update envios e set cancelacion_sin_coste = true
 where e.estado = 'cancelado' and not e.cancelacion_sin_coste
   and (e.solicitud_estado = 'rechazada'
        or exists (select 1 from envio_hitos h where h.envio_id = e.id and h.hito = 'cancelado' and h.datos ->> 'estado_anterior' = 'borrador'));
alter table envios enable trigger user;

drop function if exists responder_precio_solicitud(uuid, boolean);
create or replace function responder_precio_solicitud(p_envio uuid, p_acepta boolean, p_precio_visto numeric default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare e envios%rowtype;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if e.solicitud_estado <> 'precio_propuesto' or e.estado <> 'borrador' then
    raise exception 'Esta solicitud ya no está esperando tu respuesta.';
  end if;
  if not p_acepta then
    update envios set solicitud_estado = 'rechazada', estado = 'cancelado' where id = p_envio;
    return 'rechazada';
  end if;
  -- El precio que el cliente tenía en pantalla: si Dynamo lo ha cambiado mientras, no vale.
  if p_precio_visto is not null and round(p_precio_visto, 2) is distinct from round(e.importe_cliente, 2) then
    return 'precio_cambiado';
  end if;
  if e.precio_valido_hasta < now() then
    update envios set solicitud_estado = 'pendiente_precio', precio_valido_hasta = null where id = p_envio;
    return 'caducado';
  end if;
  if e.fecha_carga_desde <= (now() at time zone 'Europe/Madrid')::date then
    raise exception 'La fecha de recogida ya ha pasado: cancela la solicitud y pide otra.';
  end if;
  update envios set solicitud_estado = 'aceptada', condiciones_aceptadas_en = now(), estado = 'programado' where id = p_envio;
  return 'aceptada';
end $$;
revoke execute on function responder_precio_solicitud(uuid, boolean, numeric) from public, anon;
grant execute on function responder_precio_solicitud(uuid, boolean, numeric) to authenticated;
comment on function public.responder_precio_solicitud(uuid, boolean, numeric) is '[Precio y pago] El cliente acepta o rechaza el precio que Dynamo dio a su solicitud. Si pasa el precio que tenía en pantalla y Dynamo lo ha cambiado, devuelve precio_cambiado (no acepta). Rechazar no tiene coste ni cuenta como cancelación. Quién: cliente dueño del envío. Argumentos: p_envio · p_acepta · p_precio_visto (opcional).';

drop function if exists responder_subida_precio(uuid, boolean);
create or replace function responder_subida_precio(p_envio uuid, p_acepta boolean, p_precio_visto numeric default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare e record;
begin
  select id, referencia_gx, cliente_id, estado, precio_revision, precio_revision_nuevo into e from envios where id = p_envio for update;
  if not found or not (e.cliente_id = cliente_del_usuario() or es_admin()) then
    raise exception 'Ese envío no existe o no es tuyo.' using errcode = '42501';
  end if;
  if e.estado <> 'programado' or e.precio_revision is distinct from 'esperando_cliente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
  if coalesce(p_acepta, false) and p_precio_visto is not null and round(p_precio_visto, 2) is distinct from round(e.precio_revision_nuevo, 2) then
    return jsonb_build_object('resultado', 'precio_cambiado');
  end if;
  perform set_config('dynamo.revision_precio', 'on', true);
  if coalesce(p_acepta, false) then
    update envios set importe_cliente = precio_revision_nuevo, precio_revision = 'hecha', precio_revision_en = now() where id = p_envio;
    perform crear_aviso('dynamo', null, null, 'precio_aceptado', 'info', 'Acepta el nuevo precio · #' || coalesce(e.referencia_gx, ''),
      'Precio definitivo: ' || euros_txt(e.precio_revision_nuevo) || ' + IVA. Ya se puede ofertar.', '/panel/envios?ver=' || e.id, e.id);
  else
    update envios set estado = 'cancelado', cancelacion_sin_coste = true where id = p_envio;
    perform registrar_hito(p_envio, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', 'No acepta la subida de precio de la revisión (cancelación sin coste)', 'por', 'cliente'));
  end if;
  perform set_config('dynamo.revision_precio', 'off', true);
  return jsonb_build_object('resultado', case when p_acepta then 'aceptado' else 'cancelado' end);
end $$;
revoke execute on function responder_subida_precio(uuid, boolean, numeric) from public, anon;
grant execute on function responder_subida_precio(uuid, boolean, numeric) to authenticated;
comment on function public.responder_subida_precio(uuid, boolean, numeric) is '[Precio y pago] El cliente acepta la subida de precio de la revisión o cancela sin coste. Si el precio nuevo no es el que tenía en pantalla, devuelve precio_cambiado. Quién: cliente dueño del envío (o Dynamo). Argumentos: p_envio · p_acepta · p_precio_visto (opcional).';

create or replace function deshacer_cancelacion(p_envio uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_estado estado_envio; v_antes text; e record;
begin
  if not es_admin() then
    raise exception 'Solo Dynamo puede deshacer una cancelación.' using errcode = '42501';
  end if;
  select estado into v_estado from envios where id = p_envio for update;
  if v_estado is distinct from 'cancelado' then raise exception 'El envío no está cancelado.'; end if;
  -- El estado de antes, del hito de la cancelación (el más reciente).
  select datos ->> 'estado_anterior' into v_antes from envio_hitos
   where envio_id = p_envio and hito = 'cancelado' order by cuando desc limit 1;
  if v_antes is null or v_antes = 'cancelado' then v_antes := 'programado'; end if;
  select * into e from envios where id = p_envio;
  if v_antes = 'borrador' then
    -- Era una solicitud (o un borrador): vuelve a serlo, nunca salta a programado sin
    -- precio aceptado, condiciones ni previo pago.
    update envios set estado = 'borrador',
                      solicitud_estado = case when solicitud_estado = 'rechazada' then 'pendiente_precio' else solicitud_estado end
     where id = p_envio;
    return v_antes;
  end if;
  update envios set estado = v_antes::estado_envio where id = p_envio;
  -- Pendiente de pago: plazo nuevo desde ahora (si no, se volvería a anular en minutos).
  if e.pago_previo = 'pendiente' then update envios set pago_pendiente_desde = now() where id = p_envio; end if;
  -- Tenía camión: se le dijo «no vayas a cargar»; ahora hay que avisarle.
  if e.transportista_id is not null then
    perform crear_aviso('transportista', null, e.transportista_id, 'reactivada', 'urgente', 'Carga reactivada · #' || coalesce(e.referencia_gx, ''),
      'La carga que se canceló vuelve a estar en pie a tu nombre. Confírmalo con Dynamo: +34 955 225 945.', '/panel/envios?ver=' || e.id, e.id);
  end if;
  return v_antes;
end $$;

-- Pagado: el precio y el IVA quedan fijos.
create or replace function fn_envios_ae_pagado_precio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.pago_previo = 'pagado' and new.pago_previo = 'pagado'
     and (new.importe_cliente, new.iva_aplicado) is distinct from (old.importe_cliente, old.iva_aplicado) then
    raise exception 'Este envío ya está pagado por adelantado: no se puede cambiar su precio ni su IVA. Deshaz antes el pago (o regulariza la diferencia en la factura).'
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function fn_envios_ae_pagado_precio() from public, anon, authenticated;
create trigger tg_envios_ae_pagado_precio before update on envios
  for each row execute function fn_envios_ae_pagado_precio();

create or replace function fn_envios_validar_al_confirmar()
returns trigger language plpgsql as $$
begin
  if old.estado = 'borrador' and new.estado not in ('borrador', 'cancelado') then
    perform validar_ruta_envio(new.id);                -- estructura (0007): siempre
    if new.operador_id is null then
      perform validar_restricciones_envio(new.id);     -- restricciones (0009): solo Dynamo
    end if;
  end if;
  return new;
end $$;

create or replace function fn_envios_hitos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform registrar_hito(new.id, 'creado', null, null,
      jsonb_build_object('estado', new.estado, 'importe_cliente', new.importe_cliente));
    if new.estado not in ('borrador', 'cancelado') then
      perform registrar_hito(new.id, 'confirmado');
    end if;
    return null;
  end if;

  if old.estado = 'borrador' and new.estado not in ('borrador', 'cancelado') then
    perform registrar_hito(new.id, 'confirmado', null, null,
      jsonb_build_object('importe_cliente', new.importe_cliente));
  end if;

  if new.publicado_en_bolsa_en is distinct from old.publicado_en_bolsa_en
     and new.publicado_en_bolsa_en is not null then
    perform registrar_hito(new.id, 'publicado_bolsa');
  end if;

  if new.transportista_id is distinct from old.transportista_id then
    if old.transportista_id is not null then
      perform registrar_hito(new.id, 'transportista_quitado', null, null,
        jsonb_build_object('transportista_id', old.transportista_id));
    end if;
    if new.transportista_id is not null then
      perform registrar_hito(new.id, 'transportista_asignado', null, null,
        jsonb_build_object('transportista_id', new.transportista_id,
                           'importe_transportista', new.importe_transportista));
    end if;
  end if;

  if (new.matricula_camion, new.matricula_remolque)
       is distinct from (old.matricula_camion, old.matricula_remolque)
     and coalesce(new.matricula_camion, new.matricula_remolque) is not null then
    perform registrar_hito(new.id, 'matricula_asignada', null, null,
      jsonb_build_object('camion', new.matricula_camion,
                         'remolque', new.matricula_remolque));
  end if;

  if new.estado is distinct from old.estado then
    if new.estado = 'en_ruta'   then perform registrar_hito(new.id, 'cargado');   end if;
    if new.estado = 'entregado' then perform registrar_hito(new.id, 'entregado'); end if;
    if new.estado = 'cancelado' then
      perform registrar_hito(new.id, 'cancelado', null, null,
        jsonb_build_object('estado_anterior', old.estado,
                           'tenia_transportista', old.transportista_id is not null));
    end if;
    if old.estado = 'cancelado' then
      perform registrar_hito(new.id, 'cancelacion_deshecha', null, null,
        jsonb_build_object('estado_nuevo', new.estado));
    end if;
  end if;
  return null;
end $$;

create or replace function fn_envios_atajos_hitos()
returns trigger language plpgsql as $$
begin
  -- Al migrar el Sheet se conservan las fechas reales que traiga cada fila.
  if coalesce(current_setting('dynamo.migracion', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Nadie puede inventarse las fechas al crear: las pone esta función.
    new.confirmado_en := case when new.estado not in ('borrador', 'cancelado') then now() end;
    new.primera_oferta_en := null;
    new.asignado_en  := case when new.transportista_id is not null then now() end;
    new.cargado_en   := null; new.entregado_en := null; new.cancelado_en := null;
    return new;
  end if;

  -- En UPDATE no se pueden tocar a mano: se recalculan desde el cambio real.
  new.confirmado_en     := old.confirmado_en;
  new.primera_oferta_en := old.primera_oferta_en;
  new.asignado_en       := old.asignado_en;
  new.cargado_en        := old.cargado_en;
  new.entregado_en      := old.entregado_en;
  new.cancelado_en      := old.cancelado_en;

  if old.estado = 'borrador' and new.estado not in ('borrador', 'cancelado') then
    new.confirmado_en := coalesce(new.confirmado_en, now());
  end if;
  if new.transportista_id is distinct from old.transportista_id then
    new.asignado_en := case when new.transportista_id is not null then now() end;
  end if;
  if new.estado is distinct from old.estado then
    if new.estado = 'en_ruta'   then new.cargado_en   := coalesce(new.cargado_en, now()); end if;
    if new.estado = 'entregado' then new.entregado_en := now(); end if;
    if new.estado = 'cancelado' then new.cancelado_en := now(); end if;
    if old.estado = 'cancelado' then new.cancelado_en := null;  end if;
  end if;
  -- La primera oferta la marca la función de ofertas con este ajuste de sesión.
  if coalesce(current_setting('dynamo.primera_oferta', true), '') = 'on'
     and new.primera_oferta_en is null then
    new.primera_oferta_en := now();
  end if;
  return new;
end $$;

create or replace function pago_limite(p_desde timestamptz)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare t timestamptz := p_desde + make_interval(hours => p_num('previo_pago_horas', 24)::int); i int := 0;
begin
  -- Si el plazo cae en sábado, domingo o festivo, pasa al siguiente día hábil a la misma hora
  -- (una transferencia del viernes por la tarde no llega hasta el lunes).
  while not es_dia_habil((t at time zone 'Europe/Madrid')::date) and i < 10 loop
    t := t + interval '1 day'; i := i + 1;
  end loop;
  return t;
end $$;

create or replace function fn_envios_ab_precio_revision()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  -- Sello del precio: lo pone la base de datos.
  if tg_op = 'INSERT' then
    new.precio_calculado_en := case when new.importe_cliente is not null then now() end;
  elsif new.importe_cliente is distinct from old.importe_cliente then
    new.precio_calculado_en := now();
  else
    new.precio_calculado_en := old.precio_calculado_en;
  end if;
  -- Las columnas de la revisión solo las tocan las funciones de la revisión.
  if coalesce(current_setting('dynamo.revision_precio', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.precio_revision := null; new.precio_revision_fecha := null; new.precio_revision_anterior := null;
      new.precio_revision_nuevo := null; new.precio_revision_en := null; new.precio_revision_recordado := false;
      new.cancelacion_sin_coste := false;
    else
      new.precio_revision := old.precio_revision; new.precio_revision_fecha := old.precio_revision_fecha;
      new.precio_revision_anterior := old.precio_revision_anterior; new.precio_revision_nuevo := old.precio_revision_nuevo;
      new.precio_revision_en := old.precio_revision_en; new.precio_revision_recordado := old.precio_revision_recordado;
      new.cancelacion_sin_coste := old.cancelacion_sin_coste and new.estado = 'cancelado';
    end if;
  end if;
  -- Al confirmar o al cambiar la fecha: ¿precio cerrado o provisional?
  if not coalesce(new.es_manual, false) and new.estado = 'programado' and new.fecha_carga_desde is not null
     and new.pago_previo is distinct from 'pagado' and new.transportista_id is null and new.estado_asignacion = 'sin_asignar'
     and (tg_op = 'INSERT' or old.estado = 'borrador' or new.fecha_carga_desde is distinct from old.fecha_carga_desde)
     and (tg_op = 'INSERT' or old.precio_revision is distinct from 'esperando_cliente') then
    if new.fecha_carga_desde - v_hoy > p_num('precio_cerrado_dias', 7) then
      new.precio_revision := 'pendiente';
      new.precio_revision_fecha := dias_habiles_antes(new.fecha_carga_desde, p_num('precio_revision_dias_habiles', 3)::int);
      new.precio_revision_anterior := null; new.precio_revision_nuevo := null; new.precio_revision_en := null; new.precio_revision_recordado := false;
    elsif tg_op = 'UPDATE' and old.estado = 'programado' and new.precio_revision = 'pendiente' then
      -- Se adelanta la fecha y ya entra en el plazo cerrado: toca revisar ya.
      new.precio_revision := 'revisar'; new.precio_revision_fecha := v_hoy;
    end if;
  end if;
  -- Pagado: el precio queda cerrado (ya está cobrado).
  if new.pago_previo = 'pagado' and precio_por_revisar(new.precio_revision) then
    new.precio_revision := 'hecha'; new.precio_revision_en := now();
  end if;
  -- Con precio provisional: ni oferta, ni bolsa, ni camión.
  if precio_por_revisar(new.precio_revision) and new.estado <> 'cancelado' and (
       (new.transportista_id is not null and new.transportista_id is distinct from (case when tg_op = 'UPDATE' then old.transportista_id end))
    or (new.publicado_en_bolsa_en is not null and (tg_op = 'INSERT' or old.publicado_en_bolsa_en is null))
    or (new.estado_asignacion <> 'sin_asignar' and (tg_op = 'INSERT' or old.estado_asignacion = 'sin_asignar'))) then
    raise exception 'Precio provisional: no se puede ofertar, publicar ni asignar hasta revisar el precio (botón «Revisar precio» de la ficha).'
      using errcode = '42501';
  end if;
  return new;
end $$;

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
  if e.fecha_carga_desde <= (now() at time zone 'Europe/Madrid')::date then return jsonb_build_object('resultado', 'fecha_pasada'); end if;
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

create or replace function crear_solicitud_envio(p_envio jsonb, p_paradas jsonb)
returns table (id uuid, referencia_gx text)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cliente uuid := cliente_del_usuario();
  v_id uuid; v_gx text; v_p jsonb; v_orden smallint := 0; v_lugar uuid; l lugares%rowtype;
begin
  if v_cliente is null or not exists (select 1 from usuarios u where u.id = auth.uid() and u.estado = 'activa') then
    raise exception 'Tu cuenta no puede pedir envíos todavía.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_paradas) <> 'array' or jsonb_array_length(p_paradas) < 2 then
    raise exception 'El envío necesita al menos una recogida y una entrega.';
  end if;
  if jsonb_array_length(p_paradas) > 4 then
    raise exception 'Como máximo 4 puntos en la ruta (2 paradas además del origen y el destino).';
  end if;
  if (p_envio ->> 'fecha_carga_desde') is null or (p_envio ->> 'fecha_carga_desde')::date <= (now() at time zone 'Europe/Madrid')::date then
    raise exception 'Elige una fecha de recogida a partir de mañana.';
  end if;

  insert into envios (cliente_id, referencia_cliente, estado, solicitud_estado,
    fecha_carga_desde, fecha_carga_hasta, descripcion_mercancia, toneladas, metros_lineales,
    paletizado, carga_lateral, carga_trasera, carga_superior, plataforma_elevadora, nima_requerido, adr,
    iva_aplicado, discrecion_comercial, anotaciones_cliente)
  values (v_cliente, nullif(trim(p_envio ->> 'referencia_cliente'), ''), 'borrador', 'pendiente_precio',
    (p_envio ->> 'fecha_carga_desde')::date, (p_envio ->> 'fecha_carga_hasta')::date,
    nullif(trim(p_envio ->> 'descripcion_mercancia'), ''),
    (p_envio ->> 'toneladas')::numeric, (p_envio ->> 'metros_lineales')::numeric,
    coalesce((p_envio ->> 'paletizado')::boolean, true), coalesce((p_envio ->> 'carga_lateral')::boolean, true),
    coalesce((p_envio ->> 'carga_trasera')::boolean, false), coalesce((p_envio ->> 'carga_superior')::boolean, false),
    coalesce((p_envio ->> 'plataforma_elevadora')::boolean, false), coalesce((p_envio ->> 'nima_requerido')::boolean, false),
    coalesce((p_envio ->> 'adr')::boolean, false), 21,
    coalesce((p_envio ->> 'discrecion_comercial')::boolean, false), left(nullif(trim(p_envio ->> 'anotaciones_cliente'), ''), 1000))
  returning envios.id, envios.referencia_gx into v_id, v_gx;

  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_orden := v_orden + 1;
    if (v_p ->> 'tipo') not in ('carga', 'descarga') then raise exception 'Tipo de parada no válido.'; end if;
    v_lugar := nullif(v_p ->> 'lugar_id', '')::uuid;
    if v_lugar is null and coalesce((v_p ->> 'guardar_en_agenda')::boolean, false) then
      insert into lugares (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso)
      values (v_cliente, trim(v_p ->> 'nombre_empresa'), coalesce(nullif(v_p ->> 'tipo_lugar', '')::tipo_lugar, 'almacen_nave'),
              nullif(trim(v_p ->> 'direccion'), ''), nullif(trim(v_p ->> 'codigo_postal'), ''), nullif(trim(v_p ->> 'poblacion'), ''),
              nullif(trim(v_p ->> 'provincia'), ''), coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'))
      returning lugares.id into v_lugar;
      if regexp_replace(coalesce(v_p ->> 'contacto_telefono', ''), '[^0-9+]', '', 'g') ~ '^\+?[0-9]{6,15}$' then
        insert into contactos (lugar_id, nombre, telefono, es_principal)
        values (v_lugar, nullif(trim(v_p ->> 'contacto_nombre'), ''), regexp_replace(v_p ->> 'contacto_telefono', '[^0-9+]', '', 'g'), true);
      end if;
    end if;
    if v_lugar is not null then
      -- Solo sus sitios o un almacén de Dynamo: nunca la agenda de otro cliente.
      select * into l from lugares where lugares.id = v_lugar and not borrado
         and (es_almacen_dynamo or cliente_id = v_cliente);
      if not found then raise exception 'El sitio elegido no existe o no es tuyo.'; end if;
      insert into envio_paradas (envio_id, orden, tipo, lugar_id, nombre_empresa, direccion, codigo_postal, poblacion,
                                 provincia, pais_codigo_iso, lat, lon, referencia, anotaciones)
      values (v_id, v_orden, v_p ->> 'tipo', v_lugar, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion,
              l.provincia, l.pais_codigo_iso, l.lat, l.lon, nullif(trim(v_p ->> 'referencia'), ''), nullif(trim(v_p ->> 'anotaciones'), ''));
    else
      if nullif(trim(v_p ->> 'nombre_empresa'), '') is null or nullif(trim(v_p ->> 'poblacion'), '') is null then
        raise exception 'Al sitio le faltan la empresa o la población.';
      end if;
      insert into envio_paradas (envio_id, orden, tipo, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, referencia)
      values (v_id, v_orden, v_p ->> 'tipo', trim(v_p ->> 'nombre_empresa'), nullif(trim(v_p ->> 'direccion'), ''),
              nullif(trim(v_p ->> 'codigo_postal'), ''), trim(v_p ->> 'poblacion'), nullif(trim(v_p ->> 'provincia'), ''),
              coalesce(nullif(v_p ->> 'pais_codigo_iso', ''), 'ES'), nullif(trim(v_p ->> 'referencia'), ''));
    end if;
  end loop;
  perform validar_ruta_envio(v_id);
  return query select v_id, v_gx;
end $$;

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
  if p_desde is not null and (p_desde <= (now() at time zone 'Europe/Madrid')::date or coalesce(p_hasta, p_desde) < p_desde or coalesce(p_hasta, p_desde) > (now() at time zone 'Europe/Madrid')::date + 183) then
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

create or replace function resolver_contraoferta_cliente(p_envio uuid, p_aprobar boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e envios%rowtype; v_horas int;
begin
  if not es_admin() then raise exception 'Solo Dynamo resuelve las contraofertas.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if not found or e.solicitud_estado <> 'contraoferta' or e.estado <> 'borrador' then
    return jsonb_build_object('resultado', 'no_pendiente');
  end if;
  if p_aprobar then
    if e.fecha_carga_desde <= (now() at time zone 'Europe/Madrid')::date then return jsonb_build_object('resultado', 'fecha_pasada'); end if;
    update envios set precio_inicial_cliente = importe_cliente, importe_cliente = contraoferta_cliente,
                      solicitud_estado = 'aceptada', estado = 'programado'
     where id = p_envio;
  else
    -- Vuelve a nuestro precio, con su validez renovada, para que pueda aceptarlo o cancelar.
    select coalesce((select (valor #>> '{}')::int from parametros where clave = 'solicitud_validez_horas'), 24) into v_horas;
    update envios set solicitud_estado = 'precio_propuesto', condiciones_aceptadas_en = null,
                      precio_valido_hasta = greatest(coalesce(precio_valido_hasta, now()), now() + make_interval(hours => v_horas))
     where id = p_envio;
  end if;
  perform registrar_hito(p_envio, 'contraoferta_resuelta', null, null,
    jsonb_build_object('de', 'cliente', 'precio_base', e.importe_cliente, 'precio_propuesto', e.contraoferta_cliente,
                       'decision', case when p_aprobar then 'aprobada' else 'rechazada' end));
  return jsonb_build_object('resultado', 'ok');
end $$;

create or replace function marcar_mi_viaje(p_envio uuid, p_estado text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_actual estado_envio; v_orden text[] := array['programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado'];
begin
  if not envio_del_transportista(p_envio) then raise exception 'Ese viaje no es tuyo.' using errcode = '42501'; end if;
  select estado into v_actual from envios where id = p_envio for update;
  if p_estado not in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado') then raise exception 'Estado no válido.'; end if;
  if v_actual::text = p_estado then return; end if;
  -- No se puede dar por cargado ni entregado antes del día de carga.
  if p_estado in ('en_ruta', 'entregado')
     and (select fecha_carga_desde from envios where id = p_envio) > (now() at time zone 'Europe/Madrid')::date then
    raise exception 'Todavía no es el día de carga: no se puede marcar en ruta ni entregado.';
  end if;
  if array_position(v_orden, v_actual::text) is null or array_position(v_orden, p_estado) < array_position(v_orden, v_actual::text) then
    raise exception 'El viaje está % y no puede volver atrás. Si te has equivocado, llámanos al +34 955 225 945.', replace(v_actual::text, '_', ' ');
  end if;
  update envios set estado = p_estado::estado_envio,
                    fecha_carga_real = case when p_estado in ('en_ruta', 'entregado') then coalesce(fecha_carga_real, (now() at time zone 'Europe/Madrid')::date) else fecha_carga_real end
   where id = p_envio;
end $$;

create index if not exists idx_envios_creado_por on envios (creado_por) where creado_por is not null;
create index if not exists idx_envios_matricula_camion on envios (transportista_id, normaliza_matricula(matricula_camion)) where matricula_camion is not null;
