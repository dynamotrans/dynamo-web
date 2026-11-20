-- =====================================================================================
-- NOTA AUTOMÁTICA DE CADA TRANSPORTISTA (0 a 10)
-- =====================================================================================
-- Usuario, 2026-11-20 («nota de cada transportista: puntualidad, cancelaciones, incidencias,
-- papeles… vale, hazlo»). Hasta ahora solo había las estrellas que ponen Dynamo y el cliente.
-- Ahora, con lo que ya guardamos, cada noche se calcula una nota de 0 a 10:
--   · puntualidad (35 %): cargó el día previsto y entregó en la fecha estimada;
--   · cancelaciones (25 %): veces que «nos deja tirados» sobre sus cargas;
--   · incidencias (15 %): envíos suyos con alguna incidencia;
--   · valoraciones (25 %): media de las estrellas de Dynamo y de los clientes;
--   · y un punto menos si tiene un camión con la ITV, el seguro o la tarjeta vencidos.
-- Si falta un dato (p. ej. nadie le ha puesto estrellas), su peso se reparte entre los demás.
-- Con menos envíos que el mínimo de Parámetros no hay nota («pocos envíos»).
-- Solo la ve Dynamo. Ordena la oferta escalonada (después de ruta, sede y favoritos).

insert into parametros (clave, valor, descripcion) values
  ('nota_transportista_meses', '12', 'Meses hacia atrás que cuenta la nota automática del transportista (envíos entregados, cancelaciones e incidencias).'),
  ('nota_transportista_min_envios', '3', 'Envíos entregados mínimos en ese periodo para dar nota al transportista; con menos, sale «pocos envíos».')
on conflict (clave) do nothing;

create table if not exists transportista_notas (
  transportista_id uuid primary key references transportistas(id) on delete cascade,
  nota numeric(3,1),
  envios integer not null default 0,
  puntuales integer not null default 0,
  con_fechas integer not null default 0,
  cancelaciones integer not null default 0,
  con_incidencia integer not null default 0,
  valoracion numeric(3,2),
  valoraciones integer not null default 0,
  papeles_vencidos integer not null default 0,
  calculada_en timestamptz not null default now()
);
alter table transportista_notas enable row level security;
drop policy if exists transportista_notas_dynamo on transportista_notas;
create policy transportista_notas_dynamo on transportista_notas for select to authenticated using (ve_todo());
revoke all on transportista_notas from anon;
revoke insert, update, delete on transportista_notas from authenticated;

comment on table transportista_notas is '[Ofertas y transportistas] Nota automática (0 a 10) de cada transportista y sus piezas: puntualidad, cancelaciones, incidencias, valoraciones y papeles vencidos. La rehace cada noche recalcular_notas_transportistas(). Solo la ve Dynamo; el transportista no.';
comment on column transportista_notas.transportista_id is 'formato: uuid | → transportistas.id | rango: no aplica | lista: no aplica | obligatorio | El transportista. Ej. OK: 0b6f…';
comment on column transportista_notas.nota is 'formato: número con 1 decimal | rango: 0 a 10 | lista: no aplica | automático | Nota de 0 a 10. Vacío = pocos envíos para dar nota (Parámetros). Ej. OK: 7.8';
comment on column transportista_notas.envios is 'formato: número entero | rango: >= 0 | lista: no aplica | automático | Envíos de Dynamo entregados por él en el periodo de Parámetros. Ej. OK: 24';
comment on column transportista_notas.puntuales is 'formato: número entero | rango: >= 0 | lista: no aplica | automático | De los que tienen fechas para comparar, cuántos cargó el día previsto (o antes del fin de la ventana) y entregó en la fecha estimada. Ej. OK: 21';
comment on column transportista_notas.con_fechas is 'formato: número entero | rango: >= 0 | lista: no aplica | automático | Envíos entregados con fecha de carga real y fecha prevista para medir la puntualidad. Ej. OK: 23';
comment on column transportista_notas.cancelaciones is 'formato: número entero | rango: >= 0 | lista: no aplica | automático | Veces que «nos dejó tirados» en el periodo (transportista_cancelaciones). Ej. OK: 1';
comment on column transportista_notas.con_incidencia is 'formato: número entero | rango: >= 0 | lista: no aplica | automático | Envíos suyos entregados en el periodo con alguna incidencia (no cancelada). Ej. OK: 2';
comment on column transportista_notas.valoracion is 'formato: número con 2 decimales | rango: 1 a 5 | lista: no aplica | automático | Media de las estrellas de Dynamo y de los clientes (cada voto cuenta igual). Vacío = sin votos. Ej. OK: 4.50';
comment on column transportista_notas.valoraciones is 'formato: número entero | rango: >= 0 | lista: no aplica | automático | Votos que forman esa media. Ej. OK: 9';
comment on column transportista_notas.papeles_vencidos is 'formato: número entero | rango: >= 0 | lista: no aplica | automático | Camiones activos con la ITV, el seguro o la tarjeta de transporte vencidos hoy (resta 1 punto). Ej. OK: 0';
comment on column transportista_notas.calculada_en is 'formato: fecha y hora (con zona) | rango: no aplica | lista: no aplica | automático | Cuándo se calculó. Ej. OK: 2026-11-21 04:37+01';

create or replace function public.recalcular_notas_transportistas(p_transportista uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_meses int := greatest(1, least(60, parametro_num('nota_transportista_meses', 12)::int));
  v_min int := greatest(1, parametro_num('nota_transportista_min_envios', 3)::int);
  v_desde timestamptz := now() - make_interval(months => v_meses);
  hoy date := (now() at time zone 'Europe/Madrid')::date;
  n int;
begin
  if p_transportista is null and mantenimiento_activo() then return 0; end if;
  insert into transportista_notas as tn (transportista_id, nota, envios, puntuales, con_fechas, cancelaciones, con_incidencia,
                                         valoracion, valoraciones, papeles_vencidos, calculada_en)
  select t.id,
         case when e.envios < v_min then null else
           greatest(0, least(10, round((
             10 * (coalesce(0.35 * e.puntuales::numeric / nullif(e.con_fechas, 0), 0)
                   + 0.25 * (1 - least(1, 2 * c.n::numeric / (e.envios + c.n)))
                   + 0.15 * (1 - least(1, 2 * e.con_incidencia::numeric / e.envios))
                   + coalesce(0.25 * (v.media - 1) / 4, 0))
             / (0.40 + case when e.con_fechas > 0 then 0.35 else 0 end + case when v.media is not null then 0.25 else 0 end)
             - case when p.vencidos > 0 then 1 else 0 end)::numeric, 1)))
         end,
         e.envios, e.puntuales, e.con_fechas, c.n, e.con_incidencia, v.media, v.votos, p.vencidos, now()
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
    cross join lateral (
      select count(*)::int as vencidos from vehiculos h
       where h.transportista_id = t.id and h.activo
         and (h.itv_vence < hoy or h.seguro_vence < hoy or h.tarjeta_transporte_vence < hoy)
    ) p
   where (p_transportista is null or t.id = p_transportista) and not coalesce(t.borrado, false)
     -- Sin nada que contar (ni envíos, ni cancelaciones, ni camiones vencidos), no ocupa sitio.
     and (e.envios > 0 or c.n > 0 or p.vencidos > 0 or exists (select 1 from transportista_notas o where o.transportista_id = t.id))
  on conflict (transportista_id) do update set
    nota = excluded.nota, envios = excluded.envios, puntuales = excluded.puntuales, con_fechas = excluded.con_fechas,
    cancelaciones = excluded.cancelaciones, con_incidencia = excluded.con_incidencia, valoracion = excluded.valoracion,
    valoraciones = excluded.valoraciones, papeles_vencidos = excluded.papeles_vencidos, calculada_en = excluded.calculada_en;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.recalcular_notas_transportistas(uuid) from public, anon, authenticated;
comment on function public.recalcular_notas_transportistas(uuid) is '[Ofertas y transportistas] Calcula la nota automática (0 a 10) de los transportistas: puntualidad 35 %, cancelaciones 25 %, incidencias 15 % y valoraciones 25 % (lo que falta reparte su peso entre lo demás), menos 1 punto si tiene un camión con papeles vencidos; sin nota con menos envíos que el mínimo de Parámetros. Cuenta los meses de Parámetros. Devuelve cuántos transportistas tocó. Quién: tarea de cada noche (pg_cron) y servidor. Argumentos: p_transportista: transportistas.id (null = todos).';

-- La oferta escalonada: a igualdad de ruta, sede y favoritos, primero la mejor nota.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.fn_difusion_paso(uuid)'::regprocedure);
  n := replace(v, 't.valoracion_dynamo desc nulls last,',
                  '(select tn.nota from transportista_notas tn where tn.transportista_id = t.id) desc nulls last,
                t.valoracion_dynamo desc nulls last,');
  if n <> v and position('transportista_notas' in v) = 0 then execute n;
  elsif position('transportista_notas' in v) = 0 then raise exception 'fn_difusion_paso: no encuentro el orden por valoración';
  end if;
end $$;

select recalcular_notas_transportistas();

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-notas-transportistas', '37 3 * * *', 'select public.recalcular_notas_transportistas()');
  end if;
end $$;
