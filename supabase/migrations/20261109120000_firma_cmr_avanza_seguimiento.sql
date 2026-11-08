-- =====================================================================================
-- LA FIRMA DEL CMR ANCLA EL SEGUIMIENTO (usuario, 2026-11-09)
-- =====================================================================================
-- Una firma del CMR es verdad confirmada: si el remitente firma la casilla 22 de una
-- recogida, esa carga está hecha; si el destinatario firma la 24 de la ÚLTIMA entrega,
-- el envío está ENTREGADO. Hasta ahora la firma solo dejaba su hito y la fase avanzaba
-- por hora prevista, tacógrafo o a mano. Ahora cada firma PRINCIPAL ancla la etapa a la
-- hora de la firma (la del servidor) y el automático sigue desde ahí:
--   · remitente en la recogida p → en ruta hacia la parada p+1 (paso 2·p+1);
--   · transportista (firma al recoger) → como el remitente de la 1.ª parada (paso 3);
--   · destinatario en la entrega p → en ruta a la siguiente, y en la ÚLTIMA → ENTREGADO
--     (con 2·orden+1 salen las tres solas: 2·n+1 es «entregado»).
-- Solo HACIA DELANTE (una firma nunca atrasa lo que ya está más avanzado), solo firmas
-- principales (las extra no mueven nada), y solo con camión (transportista u operador)
-- y el envío vivo. Queda el hito «etapa_corregida» con por=firma_cmr, como al marcar a
-- mano, y la línea de tiempo enseña la hora real de la firma.
-- =====================================================================================

create or replace function fn_firmas_seguimiento()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record; v_n int; v_orden smallint; v_paso smallint; v_antes smallint;
begin
  if new.extra then return null; end if;
  select x.estado, x.parada_actual, x.transportista_id, x.operador_id into e
    from envios x where x.id = new.envio_id for update;
  if e.estado in ('cancelado', 'borrador', 'entregado') then return null; end if;
  if e.transportista_id is null and e.operador_id is null then return null; end if;
  select count(*) into v_n from envio_paradas where envio_id = new.envio_id;
  if v_n < 2 then return null; end if;
  if new.rol = 'transportista' then
    v_orden := 1;
  else
    select p.orden into v_orden from envio_paradas p where p.id = new.parada_id;
    if v_orden is null then return null; end if;
  end if;
  v_paso := (2 * v_orden + 1)::smallint;   -- en ruta a la siguiente; en la última, entregado
  v_antes := seguimiento_paso(e.estado, e.parada_actual, v_n);
  if v_paso <= v_antes then return null; end if;
  update envios set ancla_paso = v_paso, ancla_hora = new.firmado_en where id = new.envio_id;
  perform registrar_hito(new.envio_id, 'etapa_corregida', new.parada_id, null,
    jsonb_build_object('paso', v_paso, 'hora', new.firmado_en, 'paso_anterior', v_antes,
                       'por', 'firma_cmr', 'rol', new.rol), 'servidor');
  perform seguimiento_aplicar(new.envio_id, true);
  return null;
end $$;
revoke all on function fn_firmas_seguimiento() from public, anon, authenticated;
comment on function public.fn_firmas_seguimiento() is '[Disparadores] Al registrarse una firma PRINCIPAL del CMR, ancla la etapa del envío a la hora de la firma (remitente de la parada p o transportista → en ruta tras esa parada; destinatario de la última → entregado), solo hacia delante y solo con camión. Quién: disparador de firmas_cmr.';

create trigger tg_firmas_seguimiento after insert on firmas_cmr
  for each row execute function fn_firmas_seguimiento();
