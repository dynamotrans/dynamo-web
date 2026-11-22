-- Provincias (usuario, 2026-11-22):
--  1. Fuera de España la provincia se escribe, pero se SUGIEREN las que ya usan las fichas de ese
--     país (sitios, clientes, transportistas y transportistas propios). La lista sale de las
--     fichas que existen en ese momento: si una provincia deja de usarse en todas, desaparece.
--  2. Limpieza de España: la provincia de cada ficha pasa a la forma de la lista de 52, sacada de
--     su código postal (manda el CP) o, sin CP válido, si coincide sin mayúsculas ni tildes.

-- La provincia española de un código postal (sus dos primeras cifras); null si no es español válido.
create or replace function public.provincia_de_codigo_postal(p_codigo text)
returns text language sql immutable set search_path = public as $$
  select case substr(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'), 1, 2)
    when '01' then 'Álava' when '02' then 'Albacete' when '03' then 'Alicante' when '04' then 'Almería'
    when '05' then 'Ávila' when '06' then 'Badajoz' when '07' then 'Baleares' when '08' then 'Barcelona'
    when '09' then 'Burgos' when '10' then 'Cáceres' when '11' then 'Cádiz' when '12' then 'Castellón'
    when '13' then 'Ciudad Real' when '14' then 'Córdoba' when '15' then 'A Coruña' when '16' then 'Cuenca'
    when '17' then 'Girona' when '18' then 'Granada' when '19' then 'Guadalajara' when '20' then 'Gipuzkoa'
    when '21' then 'Huelva' when '22' then 'Huesca' when '23' then 'Jaén' when '24' then 'León'
    when '25' then 'Lleida' when '26' then 'La Rioja' when '27' then 'Lugo' when '28' then 'Madrid'
    when '29' then 'Málaga' when '30' then 'Murcia' when '31' then 'Navarra' when '32' then 'Ourense'
    when '33' then 'Asturias' when '34' then 'Palencia' when '35' then 'Las Palmas' when '36' then 'Pontevedra'
    when '37' then 'Salamanca' when '38' then 'Santa Cruz de Tenerife' when '39' then 'Cantabria' when '40' then 'Segovia'
    when '41' then 'Sevilla' when '42' then 'Soria' when '43' then 'Tarragona' when '44' then 'Teruel'
    when '45' then 'Toledo' when '46' then 'Valencia' when '47' then 'Valladolid' when '48' then 'Bizkaia'
    when '49' then 'Zamora' when '50' then 'Zaragoza' when '51' then 'Ceuta' when '52' then 'Melilla'
  end
  where regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g') ~ '^\d{5}$'
$$;
comment on function public.provincia_de_codigo_postal(text) is '[Sitios y direcciones] Devuelve la provincia española (con su nombre de la lista de 52) que corresponde a un código postal de 5 cifras, por sus dos primeras cifras; vacío si no es un CP español válido. Quién: cualquiera (cálculo puro). Argumentos: p_codigo: código postal, p. ej. 41016.';

-- La forma de la lista de una provincia escrita a mano («SEVILLA», «cadiz»), o null si no es ninguna.
create or replace function public.provincia_de_lista(p_nombre text)
returns text language sql immutable set search_path = public as $$
  select l.n from unnest(array['Álava','Albacete','Alicante','Almería','Ávila','Badajoz','Baleares','Barcelona','Burgos',
    'Cáceres','Cádiz','Castellón','Ciudad Real','Córdoba','A Coruña','Cuenca','Girona','Granada','Guadalajara','Gipuzkoa',
    'Huelva','Huesca','Jaén','León','Lleida','La Rioja','Lugo','Madrid','Málaga','Murcia','Navarra','Ourense','Asturias',
    'Palencia','Las Palmas','Pontevedra','Salamanca','Santa Cruz de Tenerife','Cantabria','Segovia','Sevilla','Soria',
    'Tarragona','Teruel','Toledo','Valencia','Valladolid','Bizkaia','Zamora','Zaragoza','Ceuta','Melilla']) as l(n)
  where translate(lower(l.n), 'áéíóúüñ', 'aeiouun') = translate(lower(btrim(coalesce(p_nombre, ''))), 'áéíóúüñ', 'aeiouun')
  limit 1
$$;
comment on function public.provincia_de_lista(text) is '[Sitios y direcciones] Devuelve el nombre de la lista de 52 provincias que coincide con un texto sin contar mayúsculas ni tildes («SEVILLA» → Sevilla); vacío si no coincide con ninguna. Quién: cualquiera (cálculo puro). Argumentos: p_nombre: la provincia escrita.';

-- Sugerencias de provincia para un país: las que usan las fichas que ve quien pregunta (con sus
-- permisos: un cliente, las suyas; Dynamo, todas). Sin repetir mayúsculas: la forma más usada.
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
  )
  select mode() within group (order by p) from t group by lower(p) order by 1 limit 300
$$;
revoke execute on function public.provincias_en_uso(text) from public, anon;
grant execute on function public.provincias_en_uso(text) to authenticated;
comment on function public.provincias_en_uso(text) is '[Sitios y direcciones] Lista de provincias que ya usan las fichas de un país (sitios, clientes, transportistas y transportistas propios), para sugerirlas al escribir la provincia fuera de España. Sale de las fichas que existen en ese momento: si una deja de usarse en todas, desaparece. Con los permisos de quien pregunta (un cliente ve las de sus fichas). Sin repetir por mayúsculas, máximo 300. Quién: usuarios con sesión (formularios de fichas). Argumentos: p_pais: código ISO del país, p. ej. PT.';

-- Limpieza de España: deja cada provincia con la forma de la lista. Devuelve cuántas fichas cambia.
create or replace function public.normalizar_provincias_es()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; k integer;
begin
  update sitios set provincia = coalesce(provincia_de_codigo_postal(codigo_postal), provincia_de_lista(provincia))
   where upper(coalesce(pais_codigo_iso, 'ES')) = 'ES'
     and coalesce(provincia_de_codigo_postal(codigo_postal), provincia_de_lista(provincia)) is not null
     and provincia is distinct from coalesce(provincia_de_codigo_postal(codigo_postal), provincia_de_lista(provincia));
  get diagnostics k = row_count; n := n + k;
  update clientes set provincia = coalesce(provincia_de_codigo_postal(codigo_postal), provincia_de_lista(provincia))
   where upper(coalesce(pais_codigo_iso, 'ES')) = 'ES'
     and coalesce(provincia_de_codigo_postal(codigo_postal), provincia_de_lista(provincia)) is not null
     and provincia is distinct from coalesce(provincia_de_codigo_postal(codigo_postal), provincia_de_lista(provincia));
  get diagnostics k = row_count; n := n + k;
  update transportistas set provincia = coalesce(provincia_de_codigo_postal(codigo_postal), provincia_de_lista(provincia))
   where upper(coalesce(pais_codigo_iso, 'ES')) = 'ES'
     and coalesce(provincia_de_codigo_postal(codigo_postal), provincia_de_lista(provincia)) is not null
     and provincia is distinct from coalesce(provincia_de_codigo_postal(codigo_postal), provincia_de_lista(provincia));
  get diagnostics k = row_count; n := n + k;
  -- Los transportistas propios no tienen código postal: solo por coincidencia del nombre.
  update operadores set provincia = provincia_de_lista(provincia)
   where upper(coalesce(pais_codigo_iso, 'ES')) = 'ES' and provincia_de_lista(provincia) is not null
     and provincia is distinct from provincia_de_lista(provincia);
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;
revoke execute on function public.normalizar_provincias_es() from public, anon, authenticated;
comment on function public.normalizar_provincias_es() is '[Sitios y direcciones] Limpieza de las provincias de España: en sitios, clientes y transportistas pone la provincia de su código postal (manda el CP) o, sin CP válido, la de la lista que coincide sin mayúsculas ni tildes; en los transportistas propios, solo por coincidencia. No toca las de fuera de España ni las que no sabe arreglar. Devuelve cuántas fichas cambia. Quién: funciones internas y la migración de limpieza; nadie desde la plataforma. Argumentos: ninguno.';

select public.normalizar_provincias_es();
