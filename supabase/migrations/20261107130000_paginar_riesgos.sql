-- =====================================================================================
-- CESCE - Riesgos por páginas desde la base de datos (2026-11-07, preparado para volumen).
--
-- Antes: la pantalla pedía riesgos_clientes() entera (una fila por cliente) y filtraba,
-- ordenaba y sumaba en el navegador. Con miles de clientes eran ~870 KB en cada carga.
-- Ahora: riesgos_pagina(texto, filtro, página, por_página) devuelve solo la página ya
-- buscada, filtrada y ordenada (reusa riesgos_clientes, sin duplicar el cálculo), con el
-- total; y riesgos_totales() da los tres números de arriba (crédito concedido, riesgo
-- asumido y clientes por encima del límite) sobre todos los clientes. Los números son los
-- mismos que calculaba el navegador.
-- =====================================================================================

create or replace function public.riesgos_pagina(
  p_q text default null, p_filtro text default null, p_pagina int default 1, p_por_pagina int default 50)
returns table(cliente_id uuid, nombre text, cif text, riesgo_cesce numeric, plazo_cesce int, riesgo_manual numeric,
              riesgo_efectivo numeric, manda text, envios int, asumido_base numeric, asumido numeric,
              disponible numeric, ultimo_envio date, total bigint)
language sql stable security definer set search_path = public as $$
  with base as (select * from riesgos_clientes()),
  filtrada as (
    select * from base b
     where (p_q is null or unaccent_simple(b.nombre || ' ' || coalesce(b.cif, '')) ilike '%' || unaccent_simple(p_q) || '%')
       and (p_filtro is null or case p_filtro
              when 'con'    then coalesce(b.riesgo_efectivo, 0) > 0
              when 'sin'    then not (coalesce(b.riesgo_efectivo, 0) > 0)
              when 'pasado' then coalesce(b.disponible, 0) < 0 or (not (coalesce(b.riesgo_efectivo, 0) > 0) and b.asumido > 0)
              when 'alto'   then (b.riesgo_efectivo > 0 and b.asumido / b.riesgo_efectivo >= 0.8)
                                 or (not (coalesce(b.riesgo_efectivo, 0) > 0) and b.asumido > 0)
              when 'riesgo' then b.asumido > 0
              else true end)
  ),
  cont as (select count(*) as t from filtrada)
  select f.cliente_id, f.nombre, f.cif, f.riesgo_cesce, f.plazo_cesce, f.riesgo_manual, f.riesgo_efectivo,
         f.manda, f.envios, f.asumido_base, f.asumido, f.disponible, f.ultimo_envio, cont.t
    from filtrada f, cont
   -- Mismo orden que la pantalla: más «uso» del límite primero (sin límite y con riesgo, arriba del todo).
   order by case when coalesce(f.riesgo_efectivo, 0) > 0 then f.asumido / f.riesgo_efectivo
                 when f.asumido > 0 then 1e9 else 0 end desc,
            f.asumido desc, f.nombre
   limit greatest(1, least(p_por_pagina, 200)) offset greatest(0, (p_pagina - 1) * p_por_pagina);
$$;
revoke all on function public.riesgos_pagina(text, text, int, int) from public, anon;
grant execute on function public.riesgos_pagina(text, text, int, int) to authenticated;
comment on function public.riesgos_pagina(text, text, int, int) is '[Clientes y cuentas] Una página de CESCE - Riesgos (reusa riesgos_clientes): busca por nombre o CIF, filtra (con / sin crédito, por encima del límite, 80 % o más usado, con riesgo asumido), ordena por uso del límite y pagina, con el total. A quien no es de Dynamo no le devuelve nada. Quién: Dynamo (también solo lectura). Argumentos: p_q: texto · p_filtro: con|sin|pasado|alto|riesgo|null · p_pagina, p_por_pagina.';

create or replace function public.riesgos_totales()
returns table(limite numeric, asumido numeric, pasados int)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(coalesce(riesgo_efectivo, 0)), 0),
         coalesce(sum(asumido), 0),
         count(*) filter (where coalesce(disponible, 0) < 0)::int
    from riesgos_clientes()
$$;
revoke all on function public.riesgos_totales() from public, anon;
grant execute on function public.riesgos_totales() to authenticated;
comment on function public.riesgos_totales() is '[Clientes y cuentas] Los tres totales de la pantalla CESCE - Riesgos sobre todos los clientes: crédito concedido (suma de límites), riesgo asumido y cuántos clientes están por encima de su límite. A quien no es de Dynamo le da ceros. Quién: Dynamo (también solo lectura). Argumentos: sin argumentos.';
