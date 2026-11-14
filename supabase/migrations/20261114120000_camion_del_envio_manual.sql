-- =====================================================================================
-- CAMIÓN Y CONDUCTOR DEL ENVÍO MANUAL, EDITABLES EN CUALQUIER MOMENTO (usuario, 14-11)
-- =====================================================================================
-- En un envío manual (transportista propio del cliente) las matrículas y el conductor
-- no tenían ninguna puerta: si no se apuntaban al crear, la orden y el CMR salían con
-- «pendiente de asignar» para siempre (la firma digital, que antes los recogía, ya no
-- existe en manuales). Función para que el CLIENTE dueño del envío (o el equipo de
-- Dynamo) los ponga o cambie cuando quiera — se le olvidó, cambió el camión…— y los
-- documentos que se generen a partir de ahí salgan completos.

create or replace function public.poner_camion_mi_envio_manual(
  p_envio uuid, p_matricula_camion text, p_matricula_remolque text,
  p_conductor_nombre text, p_conductor_telefono text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e record;
        v_mc text := nullif(upper(btrim(coalesce(p_matricula_camion, ''))), '');
        v_mr text := nullif(upper(btrim(coalesce(p_matricula_remolque, ''))), '');
        v_cn text := nullif(btrim(coalesce(p_conductor_nombre, '')), '');
        v_ct text := nullif(regexp_replace(coalesce(p_conductor_telefono, ''), '[^0-9+]', '', 'g'), '');
begin
  select id, es_manual, estado, cliente_id into e from envios where id = p_envio;
  if e.id is null then return jsonb_build_object('resultado', 'no_existe'); end if;
  if not coalesce(e.es_manual, false) then return jsonb_build_object('resultado', 'solo_manuales'); end if;
  if e.estado = 'cancelado' then return jsonb_build_object('resultado', 'cancelado'); end if;
  if not (es_equipo_dynamo() or cliente_del_usuario() = e.cliente_id) then
    raise exception 'Solo el dueño del envío cambia su camión.' using errcode = '42501';
  end if;
  if length(coalesce(v_mc, '')) > 20 or length(coalesce(v_mr, '')) > 20 then
    return jsonb_build_object('resultado', 'matricula_no_valida');
  end if;
  if length(coalesce(v_cn, '')) > 120 or length(coalesce(v_ct, '')) > 20 then
    return jsonb_build_object('resultado', 'conductor_no_valido');
  end if;
  update envios set matricula_camion = v_mc, matricula_remolque = v_mr,
                    conductor_nombre = v_cn, conductor_telefono = v_ct
   where id = p_envio;
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke execute on function public.poner_camion_mi_envio_manual(uuid, text, text, text, text) from public, anon;
grant execute on function public.poner_camion_mi_envio_manual(uuid, text, text, text, text) to authenticated;
comment on function public.poner_camion_mi_envio_manual(p_envio uuid, p_matricula_camion text, p_matricula_remolque text, p_conductor_nombre text, p_conductor_telefono text) is '[Envíos] Pone o cambia el camión y el conductor de un envío MANUAL (transportista propio del cliente), en cualquier momento salvo cancelado: matrícula del camión y del remolque (en mayúsculas), nombre y teléfono del conductor; vacío = se quita. La orden de transporte y el CMR que se generen después los recogen. Devuelve {resultado}. Quién: el cliente dueño del envío o el equipo de Dynamo. Argumentos: p_envio: envios.id; p_matricula_camion, p_matricula_remolque, p_conductor_nombre, p_conductor_telefono: los datos (null o vacío = quitar).';
