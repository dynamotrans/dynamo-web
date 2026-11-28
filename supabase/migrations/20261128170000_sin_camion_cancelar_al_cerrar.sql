-- SIN CAMIÓN: SE CANCELA AL CERRAR EL SITIO DE CARGA (usuario, 2026-11-28): «para las 12 de la
-- noche mejor no, cancélalo cuando cierre el almacén, porque si no le va a llegar un email a las
-- 12 de la noche». El último día que tiene el cliente para elegir otra fecha termina cuando cierra
-- el primer sitio de carga ese día (su horario, con el de verano si toca; si no tiene, la hora por
-- defecto de la difusión), no a medianoche. Los textos dicen el día y la hora.

do $$
declare v_def text := pg_get_functiondef('public.revisar_envios_sin_camion()'::regprocedure); v_nuevo text;
begin
  v_nuevo := replace(v_def,
    'elsif v_hoy > sumar_dias_habiles((r.sin_camion_desde at time zone ''Europe/Madrid'')::date, v_resp) then',
    'elsif envio_carga_cerrada(r.id, sumar_dias_habiles((r.sin_camion_desde at time zone ''Europe/Madrid'')::date, v_resp)) then');
  if v_nuevo = v_def then raise exception 'revisar_envios_sin_camion: no se ha encontrado la condición de cancelar'; end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, 'fecha_texto(v_limite)',
    'fecha_texto(v_limite) || '' a las '' || to_char(fn_difusion_hora_limite(r.id, v_limite), ''HH24:MI'')');
  if v_nuevo = v_def then raise exception 'revisar_envios_sin_camion: no se ha encontrado la fecha límite en los textos'; end if;
  execute v_nuevo;
end $$;

-- La ficha del cliente: además del día, la hora a la que se cancela.
drop function if exists public.mi_cambio_envio(uuid);
create function public.mi_cambio_envio(p_envio uuid)
returns table(cambio jsonb, estado text, en timestamptz, nota text, modificable boolean, con_camion boolean, precio_a_mano boolean,
              sin_camion_desde timestamptz, sin_camion_cancela date, sin_camion_cancela_hora text)
language sql stable security definer set search_path = public as $$
  select x.cambio_cliente, x.estado_cambio_cliente, x.cambio_cliente_en, x.cambio_cliente_nota,
         x.modificable, x.con_camion, x.precio_a_mano, x.sin_camion_desde, x.limite,
         case when x.limite is not null then to_char(fn_difusion_hora_limite(x.id, x.limite), 'HH24:MI') end
    from (select e.id, e.cambio_cliente, e.estado_cambio_cliente, e.cambio_cliente_en, e.cambio_cliente_nota,
                 e.estado = 'programado' and not coalesce(e.es_manual, false) as modificable,
                 coalesce(envio_con_transportista(e.id), false) as con_camion,
                 coalesce(e.precio_fijado_a_mano, false) as precio_a_mano,
                 e.sin_camion_desde,
                 case when e.sin_camion_desde is not null
                      then sumar_dias_habiles((e.sin_camion_desde at time zone 'Europe/Madrid')::date, greatest(parametro_num('sin_camion_respuesta_dias', 2), 1)::int) end as limite
            from envios e where e.id = p_envio and envio_del_cliente(p_envio)) x
$$;
revoke execute on function public.mi_cambio_envio(uuid) from public, anon;
grant execute on function public.mi_cambio_envio(uuid) to authenticated;
comment on function public.mi_cambio_envio(uuid) is '[Envíos] Para la ficha del cliente: su último cambio pedido (estado, cuándo, nota de Dynamo), si el envío se puede modificar, si ya tiene camión, si el precio lo fijó Dynamo a mano y, si se quedó sin camión, desde cuándo y qué día y a qué hora (cierre del sitio de carga) se cancela solo si no elige otra fecha. Quién: cliente dueño del envío. Argumentos: p_envio: envios.id.';
comment on function public.revisar_envios_sin_camion() is '[Sistema y tareas automáticas] Tarea de cada 15 minutos: envíos programados sin transportista cuyo último día de carga ha terminado (pasado, o hoy con el primer sitio de carga ya cerrado). Con ventana y la casilla marcada, amplía la ventana una vez (sin_camion_ampliar_dias); si no, los deja «Sin camión · elige nueva fecha» con email y aviso al cliente y a Dynamo; si el cliente no contesta en sin_camion_respuesta_dias días hábiles, los cancela sin coste al cerrar el sitio de carga del último de esos días (no a medianoche), con «Repetir envío» en el email y aviso a Dynamo para devolver el pago si estaba pagado. Devuelve cuántos ha tocado. Quién: servidor (tarea automática), consola o Dynamo. Argumentos: sin argumentos.';
