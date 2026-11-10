-- =====================================================================================
-- LA ETAPA MARCADA A MANO RESPETA LA HORA DE LA FIRMA DEL CMR (usuario, 2026-11-10)
-- =====================================================================================
-- Marcar la etapa a mano sigue siendo libre (se puede poner una anterior o posterior,
-- con firmas o sin ellas), PERO la hora de una parada firmada no se inventa: si la
-- etapa elegida es «parada p terminada» (paso 2·p+1; la última es «entregado») y esa
-- parada tiene firma PRINCIPAL del CMR, la hora que se guarda es la de la firma, se
-- escriba lo que se escriba — como que la parada acaba de terminar a su hora real.
-- Ejemplo del usuario: firmada la 3.ª recogida sin firmar la 1.ª ni la 2.ª, al marcar a
-- mano esa parada la hora salta sola a la de la firma. La firma del transportista (al
-- recoger) cuenta como la de la 1.ª parada, igual que en el ancla automática.
-- El hito 'etapa_corregida' lleva entonces por=firma_cmr y el rol del firmante, y la
-- ficha lo enseña como «lo fija la firma del CMR».
-- =====================================================================================

create or replace function marcar_etapa_envio(p_envio uuid, p_paso smallint, p_hora timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e record; v_n int; v_hora timestamptz := coalesce(p_hora, now()); v_antes smallint; c record;
        v_firma timestamptz; v_frol text;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo cambia el estado de un envío.' using errcode = '42501'; end if;
  select x.estado, x.parada_actual, x.transportista_id, x.es_manual, x.operador_id into e from envios x where x.id = p_envio for update;
  if not found then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  if e.estado = 'cancelado' then return jsonb_build_object('ok', false, 'resultado', 'cancelado'); end if;
  if e.estado = 'borrador' then return jsonb_build_object('ok', false, 'resultado', 'borrador'); end if;
  select count(*) into v_n from envio_paradas where envio_id = p_envio;
  if v_n = 0 or p_paso is null or p_paso < 0 or p_paso > 2 * v_n + 1 then return jsonb_build_object('ok', false, 'resultado', 'etapa_no_valida'); end if;
  if p_paso > 0 and e.transportista_id is null and e.operador_id is null then return jsonb_build_object('ok', false, 'resultado', 'sin_transportista'); end if;
  if v_hora < now() - interval '30 days' or v_hora > now() + interval '14 days' then return jsonb_build_object('ok', false, 'resultado', 'hora_no_valida'); end if;
  v_antes := seguimiento_paso(e.estado, e.parada_actual, v_n);

  -- La firma del CMR manda sobre la hora: etapa «parada p terminada» + firma principal
  -- de esa parada → la hora guardada es la de la firma (la del servidor al firmar).
  if p_paso > 1 and p_paso % 2 = 1 then
    select f.firmado_en, f.rol::text into v_firma, v_frol
      from firmas_cmr f
      left join envio_paradas p on p.id = f.parada_id
     where f.envio_id = p_envio and not f.extra
       and ((f.rol in ('remitente', 'destinatario') and p.orden = (p_paso - 1) / 2)
            or (f.rol = 'transportista' and (p_paso - 1) / 2 = 1))
     order by case when f.rol = 'transportista' then 1 else 0 end, f.firmado_en
     limit 1;
    if v_firma is not null then v_hora := v_firma; end if;
  end if;

  update envios set ancla_paso = case when p_paso = 0 then null else p_paso end,
                    ancla_hora = case when p_paso = 0 then null else v_hora end
   where id = p_envio;
  select * into c from seguimiento_calcular(p_envio) s where s.paso = p_paso;
  perform registrar_hito(p_envio, 'etapa_corregida', c.parada_id, null,
    jsonb_build_object('paso', p_paso, 'estado', c.estado, 'parada', c.parada, 'tipo_parada', c.tipo_parada,
                       'hora', v_hora, 'paso_anterior', v_antes)
    || case when v_firma is not null then jsonb_build_object('por', 'firma_cmr', 'rol', v_frol) else '{}'::jsonb end);
  perform seguimiento_aplicar(p_envio, true);
  return jsonb_build_object('ok', true, 'resultado', 'marcada',
    'estado', (select estado from envios where id = p_envio), 'parada_actual', (select parada_actual from envios where id = p_envio),
    'hora_de_firma', v_firma is not null);
end $$;
revoke execute on function marcar_etapa_envio(uuid, smallint, timestamptz) from public, anon;
grant execute on function marcar_etapa_envio(uuid, smallint, timestamptz) to authenticated, service_role;
comment on function public.marcar_etapa_envio(uuid, smallint, timestamptz) is '[Envíos] Dynamo marca a mano en qué etapa está el envío y a qué hora empezó (o empezará: una hora futura atrasa). Desde ahí el automático sigue con los mismos plazos. Hacia delante deja el hito de cada etapa; hacia atrás quita la hora de las paradas que vuelven a quedar por hacer. Si la etapa elegida es una parada terminada CON firma principal del CMR, la hora guardada es la de la firma (se ignora la escrita) y el resultado lo dice con hora_de_firma. Devuelve {ok, resultado: marcada | no_existe | cancelado | borrador | etapa_no_valida | sin_transportista | hora_no_valida, estado, parada_actual, hora_de_firma}. Quién: Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_paso: 0 programado, 1 yendo a la carga, 2·p en la parada p, 2·p−1 en ruta a la parada p, 2·n+1 entregado (ver etapas_envio) · p_hora: cuándo (por defecto, ahora; entre 30 días atrás y 14 adelante).';
