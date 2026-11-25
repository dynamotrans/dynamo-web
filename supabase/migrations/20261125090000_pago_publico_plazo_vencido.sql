-- =====================================================================================
-- PÁGINA DE PAGO: SI EL PLAZO YA PASÓ, QUE LO DIGA Y DÉ CONTEXTO (usuario, 2026-11-25)
-- =====================================================================================
-- «Aunque haya pasado el plazo, en ese caso debe salir eso de que pasó el plazo… no el login web.»
-- «Debemos poner pantalla de caducado o algo así y algo de más info mínima para darle contexto.»
-- La página pública de pago (/pago/<llave>) de un envío anulado por no pagar decía solo «Este
-- envío está anulado». Ahora pago_publico devuelve además el motivo ('plazo': no llegó el pago a
-- tiempo; 'transferencia': Dynamo no encontró la transferencia avisada), el plazo que había y lo
-- mínimo del envío para situarse: cliente, fecha de carga, paradas (qué son y dónde, sin calle ni
-- empresa), mercancía e importe. Sin horas previstas, sin la cuenta bancaria y sin nada con lo que
-- pagar. Anulado por cualquier otra cosa: como antes, sin más datos.

create or replace function public.pago_publico(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e record; i record; d jsonb; v_limite timestamptz; v_paradas jsonb; v_cli text; v_motivo text;
begin
  if p_token is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  select x.id, x.referencia_gx, x.estado, x.estado_pago_previo, x.pago_pendiente_en, x.pago_a_cuenta, x.pago_avisado_en,
         x.fecha_carga_desde, x.fecha_carga_hasta, x.es_manual, x.estado_revision_precio,
         x.metros_lineales, x.toneladas, x.descripcion_mercancia, x.paletizado, x.cliente_id
    into e from envios x where x.pago_token = p_token;
  if not found then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  if e.estado = 'cancelado' then
    -- Anulado por no pagar: la página dice POR QUÉ (se acabó el plazo, o no nos consta la transferencia),
    -- qué plazo había y lo mínimo del envío para situarse (lo mismo que enseñaba mientras se podía
    -- pagar, sin horas previstas ni datos de la cuenta). Anulado por otra cosa: solo que está anulado.
    select h.datos ->> 'motivo_cancelacion' into v_motivo from envio_hitos h
     where h.envio_id = e.id and h.hito = 'incidencia' and h.datos ->> 'motivo_cancelacion' like 'Anulado sin pago%'
     order by h.cuando desc limit 1;
    if v_motivo is null then return jsonb_build_object('resultado', 'anulado', 'referencia', e.referencia_gx); end if;
    select * into i from pago_envio_importes(e.id);
    select coalesce(jsonb_agg(jsonb_build_object('num', ps.num, 'tipo', ps.tipo, 'codigo_postal', ps.codigo_postal, 'poblacion', ps.poblacion,
             'provincia', ps.provincia, 'pais', ps.pais_codigo_iso, 'prevista', null) order by ps.num), '[]')
      into v_paradas
      from (select p.*, row_number() over (order by p.orden) as num from envio_paradas p where p.envio_id = e.id) ps;
    select nombre_visible into v_cli from clientes where id = e.cliente_id;
    return jsonb_build_object('resultado', 'anulado', 'referencia', e.referencia_gx,
      'motivo', case when v_motivo like '%transferencia%' then 'transferencia' else 'plazo' end,
      'pago_limite', case when e.pago_pendiente_en is not null then pago_limite(e.pago_pendiente_en, e.fecha_carga_desde) end,
      'cliente', v_cli, 'base', i.base, 'iva_pct', i.iva, 'total', i.total,
      'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
      'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas, 'descripcion_mercancia', e.descripcion_mercancia, 'paletizado', e.paletizado,
      'paradas', v_paradas);
  end if;
  if e.estado_pago_previo = 'pagado' then return jsonb_build_object('resultado', 'pagado', 'referencia', e.referencia_gx); end if;
  if e.estado_pago_previo <> 'pendiente' or e.estado <> 'programado' or coalesce(e.es_manual, false)
     or coalesce(precio_por_revisar(e.estado_revision_precio), false) then
    return jsonb_build_object('resultado', 'no_disponible', 'referencia', e.referencia_gx);
  end if;
  select * into i from pago_envio_importes(e.id);
  -- El plazo, con el mismo criterio que la ficha: parado si ya hay algo pagado o la transferencia está avisada.
  if e.pago_pendiente_en is not null and coalesce(e.pago_a_cuenta, 0) = 0 and e.pago_avisado_en is null then
    v_limite := pago_limite(e.pago_pendiente_en, e.fecha_carga_desde);
  end if;
  -- Las paradas: qué es cada una, dónde (sin calle ni empresa) y su hora prevista.
  with et as (select t.parada, t.hora from etapas_envio_interno(e.id) t where t.estado = 'cargando'),
       ps as (select p.*, row_number() over (order by p.orden) as num from envio_paradas p where p.envio_id = e.id)
  select coalesce(jsonb_agg(jsonb_build_object('num', ps.num, 'tipo', ps.tipo, 'codigo_postal', ps.codigo_postal, 'poblacion', ps.poblacion,
           'provincia', ps.provincia, 'pais', ps.pais_codigo_iso, 'prevista', (select et.hora from et where et.parada = ps.num limit 1)) order by ps.num), '[]')
    into v_paradas from ps;
  select nombre_visible into v_cli from clientes where id = e.cliente_id;
  d := datos_dynamo();
  return jsonb_build_object('resultado', 'pendiente', 'referencia', e.referencia_gx, 'cliente', v_cli,
    'base', i.base, 'iva_pct', i.iva, 'total', i.total, 'a_cuenta', coalesce(e.pago_a_cuenta, 0),
    'pendiente', greatest(i.total - coalesce(e.pago_a_cuenta, 0), 0),
    'pago_limite', v_limite, 'avisado_en', e.pago_avisado_en,
    'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
    'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas, 'descripcion_mercancia', e.descripcion_mercancia, 'paletizado', e.paletizado,
    'paradas', v_paradas,
    'transferencia', case when nullif(btrim(coalesce(d ->> 'iban', '')), '') is not null
      then jsonb_build_object('beneficiario', d ->> 'razon_social', 'iban', d ->> 'iban', 'banco', d ->> 'banco', 'bic', d ->> 'bic', 'concepto', 'PRO-' || e.referencia_gx) end);
end $$;
