-- =====================================================================================
-- NOTA DEL TRANSPORTISTA SIN «PAPELES VENCIDOS»
-- =====================================================================================
-- Usuario, 2026-11-20: «¿Eso de la ITV −1 punto? Ni vamos a controlar nada de documentación de
-- transportistas. Son externos, es cosa suya.» La nota queda en puntualidad, cancelaciones,
-- incidencias y valoraciones; fuera el punto menos por ITV, seguro o tarjeta vencidos.
create or replace function public.recalcular_notas_transportistas(p_transportista uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_meses int := greatest(1, least(60, parametro_num('nota_transportista_meses', 12)::int));
  v_min int := greatest(1, parametro_num('nota_transportista_min_envios', 3)::int);
  v_desde timestamptz := now() - make_interval(months => v_meses);
  n int;
begin
  if p_transportista is null and mantenimiento_activo() then return 0; end if;
  insert into transportista_notas as tn (transportista_id, nota, envios, puntuales, con_fechas, cancelaciones, con_incidencia,
                                         valoracion, valoraciones, calculada_en)
  select t.id,
         case when e.envios < v_min then null else
           greatest(0, least(10, round((
             10 * (coalesce(0.35 * e.puntuales::numeric / nullif(e.con_fechas, 0), 0)
                   + 0.25 * (1 - least(1, 2 * c.n::numeric / (e.envios + c.n)))
                   + 0.15 * (1 - least(1, 2 * e.con_incidencia::numeric / e.envios))
                   + coalesce(0.25 * (v.media - 1) / 4, 0))
             / (0.40 + case when e.con_fechas > 0 then 0.35 else 0 end + case when v.media is not null then 0.25 else 0 end))::numeric, 1)))
         end,
         e.envios, e.puntuales, e.con_fechas, c.n, e.con_incidencia, v.media, v.votos, now()
    from transportistas t
    cross join lateral (
      select count(*)::int as envios,
             (count(*) filter (where x.fecha_carga_real is not null and coalesce(x.fecha_carga_prevista, x.fecha_carga_hasta, x.fecha_carga_desde) is not null))::int as con_fechas,
             (count(*) filter (where x.fecha_carga_real is not null and coalesce(x.fecha_carga_prevista, x.fecha_carga_hasta, x.fecha_carga_desde) is not null
                                 and x.fecha_carga_real <= coalesce(x.fecha_carga_prevista, x.fecha_carga_hasta, x.fecha_carga_desde)
                                 and (x.fecha_entrega_estimada is null or (x.entregado_en at time zone 'Europe/Madrid')::date <= x.fecha_entrega_estimada)))::int as puntuales,
             (count(*) filter (where exists (select 1 from incidencias i where i.envio_id = x.id and i.estado <> 'cancelado')))::int as con_incidencia
        from envios x
       where x.transportista_id = t.id and x.operador_id is null and x.estado = 'entregado' and x.entregado_en >= v_desde
    ) e
    cross join lateral (select count(*)::int as n from transportista_cancelaciones k where k.transportista_id = t.id and k.creado_en >= v_desde) c
    cross join lateral (
      select round(avg(z.v), 2) as media, count(z.v)::int as votos
        from (select x.valoracion_transportista::numeric as v from envios x
               where x.transportista_id = t.id and x.valoracion_transportista is not null and x.entregado_en >= v_desde
              union all
              select x.valoracion_cliente::numeric from envios x
               where x.transportista_id = t.id and x.valoracion_cliente is not null and x.entregado_en >= v_desde) z
    ) v
   where (p_transportista is null or t.id = p_transportista) and not coalesce(t.borrado, false)
     -- Sin nada que contar (ni envíos ni cancelaciones), no ocupa sitio.
     and (e.envios > 0 or c.n > 0 or exists (select 1 from transportista_notas o where o.transportista_id = t.id))
  on conflict (transportista_id) do update set
    nota = excluded.nota, envios = excluded.envios, puntuales = excluded.puntuales, con_fechas = excluded.con_fechas,
    cancelaciones = excluded.cancelaciones, con_incidencia = excluded.con_incidencia, valoracion = excluded.valoracion,
    valoraciones = excluded.valoraciones, calculada_en = excluded.calculada_en;
  get diagnostics n = row_count;
  return n;
end $$;
comment on function public.recalcular_notas_transportistas(uuid) is '[Ofertas y transportistas] Calcula la nota automática (0 a 10) de los transportistas: puntualidad 35 %, cancelaciones 25 %, incidencias 15 % y valoraciones 25 % (lo que falta reparte su peso entre lo demás); sin nota con menos envíos que el mínimo de Parámetros. No mira la documentación del transportista (es cosa suya). Cuenta los meses de Parámetros. Devuelve cuántos transportistas tocó. Quién: tarea de cada noche (pg_cron) y servidor. Argumentos: p_transportista: transportistas.id (null = todos).';

alter table transportista_notas drop column if exists papeles_vencidos;
comment on table transportista_notas is '[Ofertas y transportistas] Nota automática (0 a 10) de cada transportista y sus piezas: puntualidad, cancelaciones, incidencias y valoraciones. La rehace cada noche recalcular_notas_transportistas(). Solo la ve Dynamo; el transportista no.';

select recalcular_notas_transportistas();
