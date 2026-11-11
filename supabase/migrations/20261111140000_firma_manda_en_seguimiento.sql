-- =====================================================================================
-- LA PARADA FIRMADA MÁS AVANZADA MANDA EN EL SEGUIMIENTO (usuario, 2026-11-11)
-- =====================================================================================
-- «Si firma es de parada anterior a otra posterior ya firmada, no cambia el seguimiento
-- a una parada o estado anterior: se queda con la última». El disparador del 2026-11-09
-- ya era solo-hacia-delante, pero cada firma nueva miraba SOLO su propia parada: si
-- Dynamo había marcado a mano una etapa anterior (eso sigue siendo libre) y después
-- llegaba la firma olvidada de una recogida, el ancla saltaba a ESA recogida aunque
-- hubiera entregas posteriores ya firmadas. Ahora cada firma PRINCIPAL ancla a la
-- parada firmada MÁS AVANZADA de todo el envío (la nueva o una anterior), a la hora de
-- la firma de esa parada, y como siempre solo hacia delante: con la última entrega
-- firmada, el envío queda ENTREGADO aunque la firma que acabe de llegar sea de una
-- recogida. Las extra siguen sin mover nada y hace falta camión (transportista u
-- operador) y envío vivo.
--
-- Además, etapas_envio dice ahora si la etapa marcada la FIJÓ UNA FIRMA del CMR
-- (columna nueva `firma`): la línea de tiempo de la ficha enseñaba «marcada a mano»
-- también cuando el ancla venía de una firma, y no es lo mismo.
-- =====================================================================================

create or replace function fn_firmas_seguimiento()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record; v_n int; v_paso smallint; v_antes smallint; v_hora timestamptz; v_rol text; v_parada uuid;
begin
  if new.extra then return null; end if;
  select x.estado, x.parada_actual, x.transportista_id, x.operador_id into e
    from envios x where x.id = new.envio_id for update;
  if e.estado in ('cancelado', 'borrador', 'entregado') then return null; end if;
  if e.transportista_id is null and e.operador_id is null then return null; end if;
  select count(*) into v_n from envio_paradas where envio_id = new.envio_id;
  if v_n < 2 then return null; end if;
  -- La parada firmada MÁS AVANZADA de todo el envío (la firma nueva ya está insertada):
  -- el transportista cuenta como la 1.ª parada; a igual parada, la primera firma.
  select (2 * f.o + 1)::smallint, f.firmado_en, f.rol, f.parada_id
    into v_paso, v_hora, v_rol, v_parada
    from (select f.firmado_en, f.rol::text as rol, f.parada_id,
                 case when f.rol = 'transportista' then 1 else p.orden end as o
            from firmas_cmr f
            left join envio_paradas p on p.id = f.parada_id
           where f.envio_id = new.envio_id and not f.extra) f
   where f.o is not null
   order by f.o desc, f.firmado_en
   limit 1;
  if v_paso is null then return null; end if;
  v_antes := seguimiento_paso(e.estado, e.parada_actual, v_n);
  if v_paso <= v_antes then return null; end if;
  update envios set ancla_paso = v_paso, ancla_hora = v_hora where id = new.envio_id;
  perform registrar_hito(new.envio_id, 'etapa_corregida', v_parada, null,
    jsonb_build_object('paso', v_paso, 'hora', v_hora, 'paso_anterior', v_antes,
                       'por', 'firma_cmr', 'rol', v_rol), 'servidor');
  perform seguimiento_aplicar(new.envio_id, true);
  return null;
end $$;
revoke all on function fn_firmas_seguimiento() from public, anon, authenticated;
comment on function public.fn_firmas_seguimiento() is '[Disparadores] Al registrarse una firma PRINCIPAL del CMR, ancla la etapa del envío a la parada firmada MÁS AVANZADA de todo el envío (no solo la recién firmada), a la hora de la firma de esa parada: remitente de la parada p o transportista → en ruta tras esa parada; destinatario de la última → entregado. Solo hacia delante y solo con camión; las firmas extra no mueven nada. Quién: disparador de firmas_cmr.';

-- etapas_envio con la columna `firma`: la etapa marcada ¿la fijó una firma del CMR?
-- (el último hito «etapa_corregida» de ese paso dice de quién vino el ancla).
drop function if exists etapas_envio(uuid);
create or replace function etapas_envio(p_envio uuid)
returns table (paso smallint, estado estado_envio, parada smallint, tipo_parada text, poblacion text,
               hora timestamptz, km numeric, km_estimado boolean, hecha boolean, actual boolean, marcada boolean, firma boolean)
language plpgsql stable security definer set search_path = public as $$
declare e record; v_n int; v_actual smallint; v_firma boolean := false;
begin
  if not puede_ver_envio(p_envio) then return; end if;
  select x.estado, x.parada_actual, x.ancla_paso into e from envios x where x.id = p_envio;
  select count(*) into v_n from envio_paradas where envio_id = p_envio;
  v_actual := seguimiento_paso(e.estado, e.parada_actual, v_n);
  if e.ancla_paso is not null then
    select h.datos ->> 'por' = 'firma_cmr' into v_firma
      from envio_hitos h
     where h.envio_id = p_envio and h.hito = 'etapa_corregida' and (h.datos ->> 'paso')::smallint = e.ancla_paso
     order by h.cuando desc, h.id desc limit 1;
    v_firma := coalesce(v_firma, false);
  end if;
  return query
    select c.paso, c.estado, c.parada, c.tipo_parada, c.poblacion, c.hora, c.km, c.km_estimado,
           coalesce(c.paso <= v_actual, false), coalesce(c.paso = v_actual, false), coalesce(c.paso = e.ancla_paso, false),
           coalesce(c.paso = e.ancla_paso, false) and v_firma
      from seguimiento_calcular(p_envio) c order by c.paso;
end $$;
revoke execute on function etapas_envio(uuid) from public, anon;
grant execute on function etapas_envio(uuid) to authenticated, service_role;
comment on function public.etapas_envio(uuid) is '[Envíos] Etapas del envío (programado, yendo a la carga, cada parada, en ruta a la siguiente, entregado) con la hora prevista o la real, cuál es la actual, cuál se marcó a mano y si esa marca la fijó una firma del CMR (columna firma). Quién: Dynamo, el cliente dueño o el transportista asignado. Argumentos: p_envio: envios.id.';
