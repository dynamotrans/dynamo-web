-- =====================================================================================
-- REANCLAR EL SEGUIMIENTO DE LOS ENVÍOS FIRMADOS ANTES DEL DISPARADOR DEL 11-NOV
-- =====================================================================================
-- (usuario 2026-11-11: «¿me explicas por qué todo firmado sale aún en ruta?»)
-- El disparador «la parada firmada más avanzada manda» (20261111140000) solo actúa
-- cuando LLEGA una firma: los envíos que ya tenían todas sus firmas de antes (o que
-- recibieron las últimas minutos antes de aplicarse la migración) se quedaron anclados
-- donde los dejó el disparador viejo — p. ej. «en ruta a la 4.ª» con la última entrega
-- ya firmada desde el día anterior. Nueva reanclar_seguimiento_firmas(): recorre los
-- envíos vivos con firmas principales y camión, calcula la parada firmada MÁS AVANZADA
-- con la MISMA regla que el disparador y, solo si adelanta, ancla ahí (hito
-- etapa_corregida con por=firma_cmr y seguimiento aplicado; con la última entrega
-- firmada, el envío queda ENTREGADO). Se ejecuta UNA VEZ aquí y queda disponible por si
-- hiciera falta otra pasada (solo Dynamo o el servidor; nunca retrocede nada).
-- =====================================================================================

create or replace function reanclar_seguimiento_firmas()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_n int; v_paso smallint; v_antes smallint; v_hora timestamptz; v_rol text; v_parada uuid; v_cuantos int := 0;
begin
  if not es_servidor() and not es_equipo_dynamo() and not es_consola_supabase() then
    raise exception 'Solo Dynamo puede recolocar el seguimiento.' using errcode = '42501';
  end if;
  for r in
    select x.id, x.estado, x.parada_actual from envios x
     where x.estado not in ('cancelado', 'borrador', 'entregado')
       and (x.transportista_id is not null or x.operador_id is not null)
       and exists (select 1 from firmas_cmr f where f.envio_id = x.id and not f.extra)
     for update
  loop
    select count(*) into v_n from envio_paradas where envio_id = r.id;
    if v_n < 2 then continue; end if;
    -- La MISMA regla que fn_firmas_seguimiento (si cambia allí, cambiar aquí):
    -- transportista = 1.ª parada; a igual parada, la primera firma.
    select (2 * f.o + 1)::smallint, f.firmado_en, f.rol, f.parada_id
      into v_paso, v_hora, v_rol, v_parada
      from (select f.firmado_en, f.rol::text as rol, f.parada_id,
                   case when f.rol = 'transportista' then 1 else p.orden end as o
              from firmas_cmr f
              left join envio_paradas p on p.id = f.parada_id
             where f.envio_id = r.id and not f.extra) f
     where f.o is not null
     order by f.o desc, f.firmado_en
     limit 1;
    if v_paso is null then continue; end if;
    v_antes := seguimiento_paso(r.estado, r.parada_actual, v_n);
    if v_paso <= v_antes then continue; end if;
    update envios set ancla_paso = v_paso, ancla_hora = v_hora where id = r.id;
    perform registrar_hito(r.id, 'etapa_corregida', v_parada, null,
      jsonb_build_object('paso', v_paso, 'hora', v_hora, 'paso_anterior', v_antes,
                         'por', 'firma_cmr', 'rol', v_rol), 'servidor');
    perform seguimiento_aplicar(r.id, true);
    v_cuantos := v_cuantos + 1;
  end loop;
  return v_cuantos;
end $$;
revoke all on function reanclar_seguimiento_firmas() from public, anon;
grant execute on function reanclar_seguimiento_firmas() to authenticated, service_role;
comment on function public.reanclar_seguimiento_firmas() is '[Envíos] Pasada de mantenimiento: reancla el seguimiento de los envíos vivos con firmas del CMR a su parada firmada MÁS AVANZADA (la misma regla que el disparador de firmas), solo hacia delante; con la última entrega firmada el envío queda entregado. Para envíos firmados antes del disparador del 11-nov o tras una marca a mano que se quedara atrás. Devuelve cuántos envíos ha movido. Quién: Dynamo (admin) o el servidor. Argumentos: ninguno.';

-- Pasada de UNA VEZ para los envíos que firmaron antes del disparador nuevo.
select reanclar_seguimiento_firmas();
