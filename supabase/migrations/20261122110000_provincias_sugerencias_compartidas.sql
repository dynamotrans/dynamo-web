-- Sugerencias de provincia fuera de España, «punto medio» (usuario, 2026-11-22): además de las
-- provincias de las fichas que ve quien pregunta, a TODOS se les sugieren las que han escrito
-- al menos DOS empresas distintas o el equipo de Dynamo. Una errata o un texto raro que solo ha
-- escrito un cliente no le sale a nadie más. Solo se comparte el nombre de la provincia.

-- Las provincias «compartibles» de un país (solo el nombre; nunca de quién es la ficha).
create or replace function public.provincias_compartidas(p_pais text)
returns table(provincia text) language sql stable security definer set search_path = public as $$
  with f as (
    -- Quién escribió cada provincia: el equipo de Dynamo ('dynamo') o la empresa dueña de la ficha.
    select btrim(s.provincia) as p,
           case when coalesce(u.rol::text not in ('cliente', 'transportista'), false) or s.cliente_id is null then 'dynamo' else 'c:' || s.cliente_id end as quien
      from sitios s left join usuarios u on u.id = s.creado_por
     where not s.borrado and upper(coalesce(s.pais_codigo_iso, 'ES')) = upper(p_pais) and btrim(coalesce(s.provincia, '')) <> ''
    union all
    select btrim(c.provincia),
           case when coalesce(u.rol::text not in ('cliente', 'transportista'), false) then 'dynamo' else 'c:' || c.id end
      from clientes c left join usuarios u on u.id = c.creado_por
     where upper(coalesce(c.pais_codigo_iso, 'ES')) = upper(p_pais) and btrim(coalesce(c.provincia, '')) <> ''
    union all
    select btrim(r.provincia),
           case when coalesce(u.rol::text not in ('cliente', 'transportista'), false) then 'dynamo' else 't:' || r.id end
      from transportistas r left join usuarios u on u.id = r.creado_por
     where not r.borrado and upper(coalesce(r.pais_codigo_iso, 'ES')) = upper(p_pais) and btrim(coalesce(r.provincia, '')) <> ''
    union all
    select btrim(o.provincia),
           case when coalesce(u.rol::text not in ('cliente', 'transportista'), false) then 'dynamo' else 'c:' || o.cliente_id end
      from operadores o left join usuarios u on u.id = o.creado_por
     where not o.borrado and upper(coalesce(o.pais_codigo_iso, 'ES')) = upper(p_pais) and btrim(coalesce(o.provincia, '')) <> ''
  )
  select mode() within group (order by p) from f
   where auth.uid() is not null
   group by lower(p)
  having count(distinct quien) >= 2 or bool_or(quien = 'dynamo')
   order by 1 limit 300
$$;
revoke execute on function public.provincias_compartidas(text) from public, anon;
grant execute on function public.provincias_compartidas(text) to authenticated;
comment on function public.provincias_compartidas(text) is '[Sitios y direcciones] Provincias de un país que se pueden sugerir a cualquier usuario: las que han escrito al menos dos empresas distintas o el equipo de Dynamo, en sitios, clientes, transportistas y transportistas propios. Solo devuelve el nombre de la provincia (nunca de quién es la ficha); una errata que solo ha escrito un cliente no sale. Sale de las fichas que existen. Máximo 300. Quién: usuarios con sesión, a través de provincias_en_uso. Argumentos: p_pais: código ISO del país, p. ej. PT.';

-- Sugerencias = las de las fichas que ve quien pregunta + las compartibles, sin repetir.
create or replace function public.provincias_en_uso(p_pais text)
returns table(provincia text) language sql stable security invoker set search_path = public as $$
  with t as (
    select btrim(s.provincia) as p from sitios s where not s.borrado and upper(coalesce(s.pais_codigo_iso, 'ES')) = upper(p_pais) and btrim(coalesce(s.provincia, '')) <> ''
    union all
    select btrim(c.provincia) from clientes c where upper(coalesce(c.pais_codigo_iso, 'ES')) = upper(p_pais) and btrim(coalesce(c.provincia, '')) <> ''
    union all
    select btrim(r.provincia) from transportistas r where upper(coalesce(r.pais_codigo_iso, 'ES')) = upper(p_pais) and btrim(coalesce(r.provincia, '')) <> ''
    union all
    select btrim(o.provincia) from operadores o where not o.borrado and upper(coalesce(o.pais_codigo_iso, 'ES')) = upper(p_pais) and btrim(coalesce(o.provincia, '')) <> ''
    union all
    select x.provincia from provincias_compartidas(p_pais) x
  )
  select mode() within group (order by p) from t group by lower(p) order by 1 limit 300
$$;
revoke execute on function public.provincias_en_uso(text) from public, anon;
grant execute on function public.provincias_en_uso(text) to authenticated;
comment on function public.provincias_en_uso(text) is '[Sitios y direcciones] Lista de provincias que se sugieren al escribir la provincia fuera de España: las de las fichas que ve quien pregunta (un cliente, las suyas) más las que han escrito al menos dos empresas distintas o el equipo de Dynamo (provincias_compartidas). Sale de las fichas que existen: si una deja de usarse, desaparece. Sin repetir por mayúsculas, máximo 300. Quién: usuarios con sesión (formularios de fichas). Argumentos: p_pais: código ISO del país, p. ej. PT.';
