-- MAPA GENERAL DE LOS ENVÍOS EN CURSO (usuario, 2026-11-22): todos los camiones a la vez, en el
-- panel de Dynamo (todos) y en el del cliente (los suyos). Solo lo que está en programación o en
-- marcha: programado, yendo a la carga, cargando y en ruta. Los entregados y los cancelados no
-- salen. Cada envío con lo mismo que su mapa propio (mapa_envio: paradas con coordenadas y la
-- posición estimada del camión) más su id y, para Dynamo, el cliente.
create or replace function public.mapa_envios_en_curso()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_dynamo boolean := es_equipo_dynamo() or ve_todo(); v_cli uuid := cliente_del_usuario();
begin
  if not v_dynamo and v_cli is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(mapa_envio(e.id) || jsonb_build_object('id', e.id,
             'cliente', case when v_dynamo then c.nombre_visible end,
             'fecha_carga', coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde))
           order by coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde), e.referencia_gx)
      from (select x.* from envios x
             where x.estado in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta')
               and (v_dynamo or x.cliente_id = v_cli)
             order by (x.estado = 'programado'), coalesce(x.fecha_carga_real, x.fecha_carga_prevista, x.fecha_carga_desde)
             limit 400) e
      left join clientes c on c.id = e.cliente_id), '[]'::jsonb);
end $$;
revoke execute on function public.mapa_envios_en_curso() from public, anon;
grant execute on function public.mapa_envios_en_curso() to authenticated;
comment on function public.mapa_envios_en_curso() is '[Envíos] Mapa general: los envíos en programación o en marcha (programado, yendo a la carga, cargando, en ruta; nunca entregados ni cancelados), cada uno con su mapa (mapa_envio: paradas con coordenadas y posición estimada del camión), su id, su fecha de carga y, solo para Dynamo, el cliente. Primero los que están en marcha; como mucho 400. Quién: Dynamo (todos) y el cliente (los suyos); a los demás, lista vacía. Argumentos: sin argumentos.';
