-- =====================================================================================
-- CUADRO DE MANDO: ENVÍOS DIGITALES, MES A MES (usuario, 2026-11-25)
-- =====================================================================================
-- «Este gráfico de "Envíos según cuánto se hacen solos en la plataforma", hazlo con el mismo
-- filtro temporal que tengamos en el Cuadro de mando… barras», como el de Evolución.
--
-- El mismo reparto de cuadro_mando_digital (cuatro casillas que suman los envíos realizados),
-- pero troceado en el tiempo igual que la evolución del cuadro: por día si el periodo es de
-- hasta 62 días y por mes si es más largo, sin huecos (un día o mes sin envíos sale a cero).

create or replace function public.cuadro_mando_digital_serie(p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_desde date := least(p_desde, p_hasta); v_hasta date := greatest(p_desde, p_hasta);
  v_gran text; r jsonb;
begin
  if v_desde is null or v_hasta is null or v_hasta - v_desde > 3700 then raise exception 'Periodo no válido (máximo 10 años).'; end if;
  v_gran := case when v_hasta - v_desde <= 62 then 'dia' else 'mes' end;
  with base as (
    select case when v_gran = 'dia' then e.fecha_efectiva else date_trunc('month', e.fecha_efectiva)::date end as k,
           exists (select 1 from usuarios u where u.id = e.creado_por and u.rol = 'cliente') as por_cliente,
           exists (select 1 from envio_ofertas o
                    where o.envio_id = e.id and o.estado = 'aceptada'
                      and (o.transportista_id is null or o.transportista_id = e.transportista_id)) as por_enlace
      from envios e
     where ve_todo() and not coalesce(e.es_manual, false)
       and e.estado in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado')
       and e.fecha_efectiva between v_desde and v_hasta
  ),
  cubos as (
    select g::date as k from generate_series(
      case when v_gran = 'dia' then v_desde else date_trunc('month', v_desde)::date end,
      v_hasta, case when v_gran = 'dia' then interval '1 day' else interval '1 month' end) g
  ),
  serie as (
    select c.k,
           count(b.k) filter (where b.por_cliente and b.por_enlace) as digital_total,
           count(b.k) filter (where b.por_cliente and not b.por_enlace) as digital_cliente,
           count(b.k) filter (where not b.por_cliente and b.por_enlace) as digital_transportista,
           count(b.k) filter (where not b.por_cliente and not b.por_enlace) as dynamo
      from cubos c left join base b on b.k = c.k
     group by c.k
  )
  select jsonb_build_object('granularidad', v_gran,
           'serie', (select coalesce(jsonb_agg(to_jsonb(s) order by s.k), '[]') from serie s)) into r;
  return r;
end $$;
comment on function public.cuadro_mando_digital_serie(date, date) is '[Gestión interna] Cuadro de mando: el reparto de envíos realizados según cuánto se hicieron solos en la plataforma (full digital, digital cliente, digital transportista y full humano: las mismas cuatro casillas de cuadro_mando_digital), troceado en el tiempo como la evolución del cuadro: por día si el periodo es de hasta 62 días y por mes si es más largo, sin huecos. Devuelve la granularidad y la serie. Quién: el equipo de Dynamo que ve todo (a los demás les sale todo a cero). Argumentos: p_desde, p_hasta: periodo (por día de carga), máximo 10 años.';
revoke execute on function public.cuadro_mando_digital_serie(date, date) from public, anon;
grant execute on function public.cuadro_mando_digital_serie(date, date) to authenticated, service_role;
