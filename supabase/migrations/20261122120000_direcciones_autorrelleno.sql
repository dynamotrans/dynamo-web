-- Código postal ↔ localidad ↔ provincia (usuario, 2026-11-22): al escribir el CP se rellena la
-- localidad (y fuera de España la provincia); al elegir una localidad, la provincia y, si en las
-- fichas esa localidad tiene un solo CP, también el CP. Todo sale de las fichas que existen
-- (sitios, clientes y transportistas) con la misma regla que las provincias: las de las fichas
-- que ve quien escribe + las que han escrito al menos dos empresas distintas o Dynamo.

-- Texto comparable: sin mayúsculas, tildes ni espacios sobrantes.
create or replace function public.texto_comparable(p text)
returns text language sql immutable set search_path = public as $$
  select translate(lower(btrim(coalesce(p, ''))), 'áéíóúüñàèìòùâêîôûçãõ', 'aeiouunaeiouaeioucao')
$$;
comment on function public.texto_comparable(text) is '[Sitios y direcciones] Pasa un texto a minúsculas, sin tildes ni espacios a los lados, para comparar nombres de lugares («SEVILLA» = «sevilla»). Quién: funciones internas. Argumentos: p: el texto.';

-- Código postal comparable: en mayúsculas, sin espacios ni guiones (4999-002 = 4999 002).
create or replace function public.codigo_postal_comparable(p text)
returns text language sql immutable set search_path = public as $$
  select upper(regexp_replace(coalesce(p, ''), '[\s-]', '', 'g'))
$$;
comment on function public.codigo_postal_comparable(text) is '[Sitios y direcciones] Pasa un código postal a mayúsculas y sin espacios ni guiones, para comparar los escritos de formas distintas (4999-002 = 4999 002). Quién: funciones internas. Argumentos: p: el código postal.';

-- Las combinaciones CP + localidad (+ provincia) que se pueden sugerir a cualquiera.
create or replace function public.direcciones_compartidas(p_pais text, p_codigo_postal text default null, p_poblacion text default null)
returns table(codigo_postal text, poblacion text, provincia text) language sql stable security definer set search_path = public as $$
  with f as (
    select btrim(s.codigo_postal) as cod, btrim(s.poblacion) as pob, nullif(btrim(coalesce(s.provincia, '')), '') as prov,
           case when coalesce(u.rol::text not in ('cliente', 'transportista'), false) or s.cliente_id is null then 'dynamo' else 'c:' || s.cliente_id end as quien
      from sitios s left join usuarios u on u.id = s.creado_por
     where not s.borrado and upper(coalesce(s.pais_codigo_iso, 'ES')) = upper(p_pais)
    union all
    select btrim(c.codigo_postal), btrim(c.poblacion), nullif(btrim(coalesce(c.provincia, '')), ''),
           case when coalesce(u.rol::text not in ('cliente', 'transportista'), false) then 'dynamo' else 'c:' || c.id end
      from clientes c left join usuarios u on u.id = c.creado_por
     where upper(coalesce(c.pais_codigo_iso, 'ES')) = upper(p_pais)
    union all
    select btrim(r.codigo_postal), btrim(r.poblacion), nullif(btrim(coalesce(r.provincia, '')), ''),
           case when coalesce(u.rol::text not in ('cliente', 'transportista'), false) then 'dynamo' else 't:' || r.id end
      from transportistas r left join usuarios u on u.id = r.creado_por
     where not r.borrado and upper(coalesce(r.pais_codigo_iso, 'ES')) = upper(p_pais)
  )
  select mode() within group (order by f.cod), mode() within group (order by f.pob), mode() within group (order by f.prov)
    from f
   where auth.uid() is not null
     and coalesce(f.cod, '') <> '' and coalesce(f.pob, '') <> ''
     and (length(btrim(coalesce(p_codigo_postal, ''))) >= 3 or length(btrim(coalesce(p_poblacion, ''))) >= 2)
     and (p_codigo_postal is null or btrim(p_codigo_postal) = '' or codigo_postal_comparable(f.cod) = codigo_postal_comparable(p_codigo_postal))
     and (p_poblacion is null or btrim(p_poblacion) = '' or texto_comparable(f.pob) like texto_comparable(p_poblacion) || '%')
   group by codigo_postal_comparable(f.cod), texto_comparable(f.pob)
  having count(distinct f.quien) >= 2 or bool_or(f.quien = 'dynamo')
   limit 50
$$;
revoke execute on function public.direcciones_compartidas(text, text, text) from public, anon;
grant execute on function public.direcciones_compartidas(text, text, text) to authenticated;
comment on function public.direcciones_compartidas(text, text, text) is '[Sitios y direcciones] Combinaciones de código postal, localidad y provincia de un país que se pueden sugerir a cualquier usuario: las que han escrito al menos dos empresas distintas o el equipo de Dynamo, en sitios, clientes y transportistas. Solo devuelve esos tres datos, nunca de quién es la ficha. Pide un CP (3 caracteres o más) o el principio de una localidad (2 o más). Máximo 50. Quién: usuarios con sesión, a través de direcciones_en_uso. Argumentos: p_pais: código ISO del país · p_codigo_postal: CP exacto (opcional) · p_poblacion: principio de la localidad (opcional).';

-- Sugerencias para el formulario: las de las fichas que ve quien escribe + las compartibles.
create or replace function public.direcciones_en_uso(p_pais text, p_codigo_postal text default null, p_poblacion text default null)
returns table(codigo_postal text, poblacion text, provincia text) language sql stable security invoker set search_path = public as $$
  with t as (
    select btrim(s.codigo_postal) as cod, btrim(s.poblacion) as pob, nullif(btrim(coalesce(s.provincia, '')), '') as prov
      from sitios s where not s.borrado and upper(coalesce(s.pais_codigo_iso, 'ES')) = upper(p_pais)
    union all
    select btrim(c.codigo_postal), btrim(c.poblacion), nullif(btrim(coalesce(c.provincia, '')), '')
      from clientes c where upper(coalesce(c.pais_codigo_iso, 'ES')) = upper(p_pais)
    union all
    select btrim(r.codigo_postal), btrim(r.poblacion), nullif(btrim(coalesce(r.provincia, '')), '')
      from transportistas r where not r.borrado and upper(coalesce(r.pais_codigo_iso, 'ES')) = upper(p_pais)
  ), propias as (
    select * from t
     where coalesce(t.cod, '') <> '' and coalesce(t.pob, '') <> ''
       and (length(btrim(coalesce(p_codigo_postal, ''))) >= 3 or length(btrim(coalesce(p_poblacion, ''))) >= 2)
       and (p_codigo_postal is null or btrim(p_codigo_postal) = '' or codigo_postal_comparable(t.cod) = codigo_postal_comparable(p_codigo_postal))
       and (p_poblacion is null or btrim(p_poblacion) = '' or texto_comparable(t.pob) like texto_comparable(p_poblacion) || '%')
    union all
    select x.codigo_postal, x.poblacion, x.provincia from direcciones_compartidas(p_pais, p_codigo_postal, p_poblacion) x
  )
  select mode() within group (order by p.cod), mode() within group (order by p.pob), mode() within group (order by p.prov)
    from propias p
   group by codigo_postal_comparable(p.cod), texto_comparable(p.pob)
   order by 2, 1
   limit 50
$$;
revoke execute on function public.direcciones_en_uso(text, text, text) from public, anon;
grant execute on function public.direcciones_en_uso(text, text, text) to authenticated;
comment on function public.direcciones_en_uso(text, text, text) is '[Sitios y direcciones] Sugerencias de código postal, localidad y provincia para los formularios de fichas: las de las fichas que ve quien escribe (un cliente, las suyas) más las que han escrito al menos dos empresas distintas o el equipo de Dynamo (direcciones_compartidas). Salen de las fichas que existen. Con un CP, las localidades de ese CP; con el principio de una localidad, las que empiezan así con su CP. Máximo 50. Quién: usuarios con sesión (formularios de sitios, clientes, transportistas y alta de empresa). Argumentos: p_pais: código ISO del país · p_codigo_postal: CP exacto (opcional) · p_poblacion: principio de la localidad (opcional).';
