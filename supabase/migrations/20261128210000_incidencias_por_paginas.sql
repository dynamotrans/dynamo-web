-- INCIDENCIAS POR PÁGINAS DESDE LA BASE DE DATOS (usuario, 2026-11-28: «¿por qué no lo haces
-- ya?»). Hasta hoy la pantalla bajaba hasta 5.000 incidencias y las troceaba en el navegador.
-- Ahora la base de datos filtra (pestaña, buscador, fecha de registro y «Ver como»), cuenta y
-- devuelve solo los ids de la página. Con los permisos de quien llama (cada uno ve las suyas).

create or replace function public.incidencias_pagina(p_pestana text, p_q text, p_desde date, p_hasta date,
  p_cliente uuid, p_transportista uuid, p_pagina int, p_por_pagina int)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_por int := least(greatest(coalesce(p_por_pagina, 20), 1), 5000); v_pag int := greatest(coalesce(p_pagina, 1), 1);
  v_pal text[] := array_remove(regexp_split_to_array(lower(unaccent_simple(btrim(coalesce(p_q, '')))), '\s+'), '');
  r jsonb;
begin
  with base as (
    select i.id, i.creado_en, i.estado::text in ('abierto', 'en_curso') as abierta
      from incidencias i
      left join envios e on e.id = i.envio_id
      left join clientes c on c.id = i.cliente_id
      left join tipos_incidencia t on t.id = i.tipo_id
     where (p_cliente is null or i.cliente_id = p_cliente)
       and (p_transportista is null or i.transportista_id = p_transportista)
       and (p_desde is null or (i.creado_en at time zone 'Europe/Madrid')::date >= p_desde)
       and (p_hasta is null or (i.creado_en at time zone 'Europe/Madrid')::date <= p_hasta)
       -- Todas las palabras tienen que salir en algún dato de la fila (como el buscador de antes).
       and (cardinality(v_pal) = 0 or not exists (
             select 1 from unnest(v_pal) w
              where position(w in lower(unaccent_simple(concat_ws(' ', i.codigo, t.nombre, i.titulo, i.detalle, c.nombre_visible,
                      e.referencia_gx, e.referencia_cliente, e.codigo_postal_origen, e.poblacion_origen, e.codigo_postal_destino, e.poblacion_destino,
                      case i.estado::text when 'abierto' then 'abierta' when 'en_curso' then 'en curso' when 'resuelto' then 'resuelta' when 'cancelado' then 'cancelada' end)))) = 0))
  ), vista as (
    select * from base where coalesce(p_pestana, 'abiertas') = 'todas' or (p_pestana = 'resueltas') <> abierta
  )
  select jsonb_build_object(
      'ids', coalesce((select jsonb_agg(id order by creado_en desc, id) from (select id, creado_en from vista order by creado_en desc, id limit v_por offset (v_pag - 1) * v_por) p), '[]'::jsonb),
      'total', (select count(*) from vista),
      'abiertas', (select count(*) from base where abierta),
      'resueltas', (select count(*) from base where not abierta))
    into r;
  return r;
end $$;
revoke execute on function public.incidencias_pagina(text, text, date, date, uuid, uuid, int, int) from public, anon;
grant execute on function public.incidencias_pagina(text, text, date, date, uuid, uuid, int, int) to authenticated;
comment on function public.incidencias_pagina(text, text, date, date, uuid, uuid, int, int) is '[Incidencias] Una página de la lista de incidencias, filtrada en la base de datos: pestaña (abiertas, resueltas o todas), buscador (todas las palabras, sin acentos, en código, tipo, resumen, detalle, cliente, envío, ruta y estado), fecha de registro (hora de Madrid) y, para «Ver como», el cliente o el transportista. Con los permisos de quien llama: cada uno solo cuenta las que puede ver. Devuelve ids (de la página, de la más nueva a la más vieja), total de la pestaña y cuántas abiertas y resueltas hay con esos filtros. Quién: Dynamo, cliente y transportista (la pantalla Incidencias). Argumentos: p_pestana: abiertas, resueltas o todas · p_q: el texto buscado · p_desde, p_hasta: fechas de registro (vacías = sin límite) · p_cliente, p_transportista: «Ver como» (vacíos = sin filtrar) · p_pagina: desde 1 · p_por_pagina: hasta 5000.';
create index if not exists idx_incidencias_creado on public.incidencias (creado_en desc);
