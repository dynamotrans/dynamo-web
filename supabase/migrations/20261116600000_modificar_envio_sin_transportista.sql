-- =====================================================================================
-- «MODIFICAR ENVÍO» MIENTRAS NO TENGA TRANSPORTISTA (usuario, 2026-11-16)
-- =====================================================================================
-- «Botón nuevo habilitado, modificar envío, mientras no tenga transportista asignado. Si
-- tiene transportista, cuando pulsa sale mensaje que nos contacte para cambios con
-- transportista asignado: teléfono, mail, WhatsApp y cerrar.»
--
-- ANTES el cliente dejaba de poder modificar en cuanto el envío «se movía»: publicado en
-- la bolsa, con una oferta enviada a algún transportista o pasada la hora límite para
-- cancelar gratis. Con la oferta escalonada por email eso pasa casi siempre varios días
-- antes de la carga, así que en la práctica siempre tocaba llamar.
--
-- AHORA la única barrera es el TRANSPORTISTA: asignado, o aceptando el envío en este
-- momento (una reserva viva o una contraoferta pendiente de revisar: mientras dura, el
-- envío está comprometido con él).
--
-- LO QUE NO CAMBIA (y por qué):
--   · Pasada la hora límite para cancelar gratis, el cambio de fechas NO se aplica solo:
--     queda PENDIENTE para que lo revise Dynamo. Si se aplicara, el cliente alejaría la
--     carga y después cancelaría «a tiempo» sin que cuente (revisión de seguridad del
--     2026-11-04, prueba 117). Dynamo decide.
--   · Pedir algo más que fechas (dirección, mercancía, horario) sigue quedando pendiente.
--
-- Y UNA COSA NUEVA: si el cliente cambia las fechas de un envío que ya estaba publicado en
-- la bolsa o con ofertas enviadas, Dynamo recibe un aviso en la campana para que lo
-- actualice allí (la bolsa externa no se entera sola).

-- ¿Tiene transportista, o hay uno aceptándolo ahora mismo?
create or replace function envio_con_transportista(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select e.transportista_id is not null
         or exists (select 1 from envio_reservas r where r.envio_id = e.id and r.estado in ('viva', 'pendiente_revision'))
    from envios e where e.id = p_envio
$$;
revoke execute on function envio_con_transportista(uuid) from public, anon, authenticated;
comment on function public.envio_con_transportista(uuid) is '[Ayudantes internos] ¿El envío tiene transportista asignado, o hay uno aceptándolo ahora mismo (reserva viva o contraoferta pendiente de revisar)? Es la única barrera para que el cliente lo modifique desde su ficha. Quién: nadie la llama desde fuera. Argumentos: p_envio: el envío.';

-- La ficha del cliente: «con_camion» pasa a ser solo eso, con transportista.
create or replace function mi_cambio_envio(p_envio uuid)
returns table (cambio jsonb, estado text, en timestamptz, nota text, modificable boolean, con_camion boolean)
language sql stable security definer set search_path = public as $$
  select e.cambio_cliente, e.estado_cambio_cliente, e.cambio_cliente_en, e.cambio_cliente_nota,
         e.estado = 'programado' and not coalesce(e.es_manual, false),
         coalesce(envio_con_transportista(e.id), false)
    from envios e where e.id = p_envio and envio_del_cliente(p_envio)
$$;

-- (copiada de 20261110010000_corte_pago_unificado; cambia el final: la barrera es el
-- transportista, y pasado el corte queda pendiente en vez de mandar a llamar)
create or replace function pedir_cambio_envio(p_envio uuid, p_desde date default null, p_hasta date default null, p_detalle text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e envios%rowtype; v_det text := nullif(trim(coalesce(p_detalle, '')), ''); v_fechas boolean;
        v_n int; v_hasta date; v_primer date; v_tarde boolean; v_cli text;
begin
  if not envio_del_cliente(p_envio) then raise exception 'Ese envío no es tuyo.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if coalesce(e.es_manual, false) then return jsonb_build_object('resultado', 'envio_manual'); end if;
  if e.estado <> 'programado' then return jsonb_build_object('resultado', 'no_modificable', 'estado', e.estado); end if;
  if e.estado_cambio_cliente = 'pendiente' then return jsonb_build_object('resultado', 'ya_pendiente'); end if;
  -- Se mantiene el tipo de fecha que se eligió (y se pagó): fecha fija = un día; ventana =
  -- los mismos días hábiles. Solo se elige el primer día; el último lo pone la base de datos.
  v_n := dias_ventana_carga(e.fecha_carga_desde, e.fecha_carga_hasta);
  if p_desde is not null then
    if not es_dia_habil(p_desde) then return jsonb_build_object('resultado', 'dia_no_habil'); end if;
    v_hasta := sumar_dias_habiles(p_desde, v_n - 1);
    if p_hasta is not null and p_hasta <> v_hasta then
      return jsonb_build_object('resultado', 'ventana_distinta', 'dias', v_n, 'hasta', v_hasta);
    end if;
    -- El corte de SU ventana (cada una tiene su hora en Parámetros; usuario, 2026-11-10).
    v_primer := primera_fecha_carga(v_n = 1, now(), v_n);
    if p_desde < v_primer then return jsonb_build_object('resultado', 'antes_de_lo_posible', 'primera_fecha', v_primer); end if;
    if v_hasta > (now() at time zone 'Europe/Madrid')::date + 183 then return jsonb_build_object('resultado', 'fechas_no_validas'); end if;
  end if;
  v_fechas := p_desde is not null and (p_desde, v_hasta) is distinct from (e.fecha_carga_desde, coalesce(e.fecha_carga_hasta, e.fecha_carga_desde));
  if not v_fechas and v_det is null then return jsonb_build_object('resultado', 'sin_cambios'); end if;
  if length(coalesce(v_det, '')) > 1000 then return jsonb_build_object('resultado', 'detalle_largo'); end if;

  -- Con transportista (o con uno aceptándolo ahora) no se modifica desde la plataforma:
  -- hay que llamar. Es la única barrera (usuario, 2026-11-16).
  if coalesce(envio_con_transportista(p_envio), true) then return jsonb_build_object('resultado', 'con_camion'); end if;
  -- Pasada la hora límite para cancelar gratis, el cambio no se aplica solo: lo revisa Dynamo.
  v_tarde := e.fecha_carga_desde is not null and now() >= corte_cancelacion(e.fecha_carga_desde);
  perform set_config('dynamo.cambio_envio', 'on', true);
  if v_det is null and not v_tarde then
    -- Solo fechas y con tiempo: se aplica ya.
    update envios set fecha_carga_desde = p_desde, fecha_carga_hasta = v_hasta,
                      cambio_cliente = jsonb_build_object('fecha_desde', p_desde, 'fecha_hasta', v_hasta,
                                                          'antes_desde', e.fecha_carga_desde, 'antes_hasta', e.fecha_carga_hasta),
                      cambio_cliente_en = now(), estado_cambio_cliente = 'aplicado', cambio_cliente_nota = null
     where id = p_envio;
    perform set_config('dynamo.cambio_envio', 'off', true);
    -- Si ya se estaba moviendo (bolsa u ofertas enviadas), que Dynamo lo sepa.
    if coalesce(envio_asignandose(p_envio), false) then
      select nombre_visible into v_cli from clientes where id = e.cliente_id;
      perform crear_aviso('dynamo', null, null, 'cambio_fechas', 'aviso', 'Fechas cambiadas · #' || coalesce(e.referencia_gx, ''),
        coalesce(v_cli, 'El cliente') || ' ha cambiado la carga a ' || envio_fecha_carga_texto(p_desde, v_hasta, null)
          || ' (antes ' || envio_fecha_carga_texto(e.fecha_carga_desde, e.fecha_carga_hasta, null)
          || '). Ya estaba publicado en la bolsa o con ofertas enviadas: actualízalo allí.',
        '/panel/envios?ver=' || p_envio, p_envio);
    end if;
    return jsonb_build_object('resultado', 'aplicado');
  end if;
  update envios set cambio_cliente = jsonb_build_object('fecha_desde', case when v_fechas then p_desde end,
                                                        'fecha_hasta', case when v_fechas then v_hasta end,
                                                        'detalle', v_det, 'tarde', v_tarde),
                    cambio_cliente_en = now(), estado_cambio_cliente = 'pendiente', cambio_cliente_nota = null
   where id = p_envio;
  perform set_config('dynamo.cambio_envio', 'off', true);
  return jsonb_build_object('resultado', 'pendiente', 'tarde', v_tarde);
end $$;

comment on function public.mi_cambio_envio(p_envio uuid) is '[Envíos] Para el cliente: el cambio que ha pedido en un envío (propuesta, estado, fecha y nota de Dynamo), si el envío aún se puede modificar y si ya tiene transportista (asignado o aceptándolo ahora): en ese caso no se modifica desde la ficha, hay que llamar. Quién: cliente dueño del envío. Argumentos: p_envio: envios.id.';
comment on function public.pedir_cambio_envio(p_envio uuid, p_desde date, p_hasta date, p_detalle text) is '[Envíos] El cliente modifica un envío programado. Se puede mientras no tenga transportista (asignado o aceptándolo ahora): con transportista devuelve con_camion y hay que llamar. Solo fechas y antes de la hora límite de cancelación: se aplica al momento (y avisa a Dynamo si ya estaba en la bolsa o con ofertas enviadas). Con texto de detalle, o pasada esa hora límite: queda pendiente de Dynamo. Las fechas mantienen el tipo que se eligió y se pagó (fecha fija = un día; ventana = los mismos días hábiles): se da el primer día, hábil y no antes de primera_fecha_carga(), y el último lo calcula la base de datos; como mucho a 183 días. Devuelve {resultado} (dia_no_habil, ventana_distinta {dias, hasta}, antes_de_lo_posible {primera_fecha}, fechas_no_validas, con_camion, aplicado, pendiente {tarde}…). Quién: cliente dueño del envío. Argumentos: p_envio: envios.id · p_desde: nuevo primer día de carga (opcional) · p_hasta: último día, solo para comprobar (opcional) · p_detalle: otros cambios en texto (máx. 1000).';
