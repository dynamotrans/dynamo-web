-- CONTACTO DEL CONDUCTOR: UNA SOLA REGLA (usuario, 2026-11-28): «esto es lo mismo o parecido…
-- vamos a unificar o simplificar. Que no se quede visible una vez que hemos terminado de
-- descargar». Había dos parámetros que se pisaban (el nombre se ocultaba al marcar la entrega y
-- el teléfono seguía 24 h). Ahora nombre y teléfono siguen la MISMA regla y UN parámetro:
--   · el cliente los ve desde el día antes de la carga;
--   · deja de verlos «contacto_transportista_horas_tras_entrega» horas después de marcar el envío
--     como entregado (0 = en el momento de marcar la descarga, lo que pidió el usuario);
--   · si nadie lo marca entregado, esas horas cuentan desde el final del día de entrega previsto;
--   · en los emails nunca van.
-- Fuera el parámetro telefono_conductor_horas_tras_entrega.
update public.parametros set valor = '0'::jsonb,
  descripcion = 'Horas después de marcar el envío como entregado en que el cliente sigue viendo nombre y teléfono del conductor (0 = deja de verlos al marcar la descarga). Si no se marca, cuentan desde el final del día de entrega previsto. Antes de la víspera de la carga no los ve; en los emails nunca van.'
 where clave = 'contacto_transportista_horas_tras_entrega';
delete from public.parametros where clave = 'telefono_conductor_horas_tras_entrega';

create or replace function public.telefono_conductor_visible(p_estado estado_envio, p_carga date, p_entregado_en timestamptz, p_entrega date)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_estado = 'cancelado' then false
    when p_carga is null or now() < ((p_carga - 1)::timestamp at time zone 'Europe/Madrid') then false
    when p_estado = 'entregado' then p_entregado_en is not null
         and now() < p_entregado_en + make_interval(hours => parametro_num('contacto_transportista_horas_tras_entrega', 0)::int)
    else not contacto_transportista_oculto(p_estado, p_entrega) end
$$;
comment on function public.telefono_conductor_visible(estado_envio, date, timestamptz, date) is '[Envíos] Si el cliente puede ver el contacto del conductor (nombre y teléfono): desde el día antes de la carga hasta las horas de Parámetros (contacto_transportista_horas_tras_entrega) tras marcar el envío como entregado (0 = al marcarlo); sin marcar, hasta esas horas tras el día de entrega previsto. Nunca si está anulado. Quién: funciones internas. Argumentos: p_estado: estado del envío; p_carga: día de carga; p_entregado_en: cuándo se marcó entregado; p_entrega: día de entrega previsto.';

-- El NOMBRE del conductor, con la misma regla que el teléfono.
do $$ declare f text; v text; n text; begin
  foreach f in array array['public.mis_envios', 'public.mis_envios_por_ids'] loop
    v := pg_get_functiondef(f::regproc);
    n := replace(v, 'case when contacto_transportista_oculto(e.estado, e.fecha_entrega_estimada) then null else e.conductor_nombre end',
      'case when telefono_conductor_visible(e.estado, coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde), e.entregado_en, e.fecha_entrega_estimada) then e.conductor_nombre end');
    if n = v then raise exception '%: no encuentro el nombre del conductor', f; end if;
    execute n;
  end loop;
end $$;
