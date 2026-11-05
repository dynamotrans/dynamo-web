-- =====================================================================================
-- COBERTURA POR PAÍSES: SE PUEDE ESCRIBIR CUALQUIER DIRECCIÓN; LA PLATAFORMA DICE SI SE
-- HACE Y POR QUÉ (decisión del usuario, 2026-11-05)
--
-- «Deberíamos dejar poner [cualquier país] y que sea el tarifador el que filtre y diga si
-- se puede o no esa ruta, y poner el motivo: que trabajamos en X países… y ese no.»
--
-- Hasta hoy solo había la lista de EXCEPCIONES (restricciones_servicio: Suiza como
-- destino, Canarias, Ceuta y Melilla, islas, Gran Bretaña, Irlanda solo completo…), pero
-- no la lista de países en los que SÍ trabajamos: una entrega en Rumanía pasaba.
--   · Parámetro `cobertura_paises`: los países en los que trabajamos (se edita en
--     Parámetros). Un punto fuera de la lista se bloquea con el motivo, nombrando los
--     países en los que sí.
--   · fn_restriccion_punto la mira primero, así que vale para todo lo que ya la usa: al
--     confirmar, al añadir una parada y (mañana) el tarifador.
--   · comprobar_cobertura(): la misma comprobación ANTES de confirmar, para el asistente
--     de Nuevo envío (en cuanto se pone la ruta) — la puede llamar el cliente.
--   · Lo que ya existe no se toca (igual que las restricciones): solo se mira al generar.
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('cobertura_paises', '["ES","PT","FR","DE","IT","NL","BE","LU","AT","PL","CZ","IE","DK","CH"]',
   'Países en los que trabajamos (códigos ISO). Una recogida o entrega fuera de la lista se bloquea con el motivo. Las excepciones (Suiza solo recogidas, islas, Irlanda solo completo…) siguen en Restricciones.')
on conflict (clave) do nothing;

create or replace function pais_nombre(p char(2))
returns text language sql immutable as $$
  select case upper(p)
    when 'ES' then 'España' when 'PT' then 'Portugal' when 'FR' then 'Francia' when 'DE' then 'Alemania'
    when 'IT' then 'Italia' when 'NL' then 'Países Bajos' when 'BE' then 'Bélgica' when 'LU' then 'Luxemburgo'
    when 'AT' then 'Austria' when 'PL' then 'Polonia' when 'CZ' then 'República Checa' when 'IE' then 'Irlanda'
    when 'DK' then 'Dinamarca' when 'CH' then 'Suiza' when 'GB' then 'Reino Unido' when 'MA' then 'Marruecos'
    when 'RO' then 'Rumanía' when 'BG' then 'Bulgaria' when 'HU' then 'Hungría' when 'SK' then 'Eslovaquia'
    when 'SI' then 'Eslovenia' when 'HR' then 'Croacia' when 'GR' then 'Grecia' when 'SE' then 'Suecia'
    when 'NO' then 'Noruega' when 'FI' then 'Finlandia' when 'EE' then 'Estonia' when 'LV' then 'Letonia'
    when 'LT' then 'Lituania' when 'AD' then 'Andorra' when 'TR' then 'Turquía' when 'UA' then 'Ucrania'
    else upper(p) end
$$;

-- Fuera de la lista: un motivo que nombra los países en los que sí trabajamos.
create or replace function fn_fuera_de_cobertura(p_pais char(2))
returns text language sql stable security definer set search_path = public as $$
  with lista as (
    select coalesce((select array(select jsonb_array_elements_text(valor)) from parametros
                      where clave = 'cobertura_paises' and jsonb_typeof(valor) = 'array'), array[]::text[]) l
  )
  select case when cardinality(l) = 0 or upper(p_pais) = any (l) then null
              else format('No trabajamos en %s. Trabajamos en %s. Escríbenos y te buscamos una alternativa.',
                          pais_nombre(p_pais),
                          (select string_agg(pais_nombre(x::char(2)), ', ' order by array_position(l, x)) from unnest(l) x)) end
    from lista
$$;
revoke execute on function fn_fuera_de_cobertura(char) from public, anon, authenticated;

-- La de siempre, ahora con la cobertura delante. SECURITY DEFINER: las reglas solo las lee
-- Dynamo, pero la comprobación tiene que valer igual cuando confirma un cliente.
create or replace function fn_restriccion_punto(
  p_pais        char(2),
  p_cp          text,
  p_tipo_parada text       default 'descarga',
  p_tipo_carga  tipo_carga default null,
  p_fecha       date       default current_date
) returns table (nombre text, efecto text, mensaje text)
language sql stable security definer set search_path = public as $$
  select 'Fuera de cobertura'::text, 'bloquea'::text, fn_fuera_de_cobertura(p_pais)
   where fn_fuera_de_cobertura(p_pais) is not null
  union all
  select * from (
    select r.nombre, r.efecto, r.mensaje
      from restricciones_servicio r
     where r.pais_codigo_iso = upper(p_pais)
       and r.activa
       and p_fecha >= r.vigente_desde
       and (r.vigente_hasta is null or p_fecha <= r.vigente_hasta)
       and (r.prefijos_cp is null
            or (p_cp is not null and exists (select 1 from unnest(r.prefijos_cp) px where normaliza_cp(p_cp) like px || '%')))
       and (r.aplica_a = 'cualquier_punto' or r.aplica_a = p_tipo_parada)
       and (r.tipo_carga is null or r.tipo_carga = p_tipo_carga)
     order by case r.efecto when 'bloquea' then 1 when 'solo_admin' then 2 else 3 end, r.nombre
  ) x
$$;
revoke execute on function fn_restriccion_punto(char, text, text, tipo_carga, date) from public, anon;
grant execute on function fn_restriccion_punto(char, text, text, tipo_carga, date) to authenticated;

-- Antes de confirmar (asistente de Nuevo envío): p_paradas = [{"orden":1,"tipo":"carga",
-- "pais":"ES","codigo_postal":"41001","nombre":"Almacén Norte"}, …]. Devuelve lo que
-- bloquea (o pide a Dynamo) cada parada, con su motivo.
create or replace function comprobar_cobertura(p_paradas jsonb, p_tipo_carga tipo_carga default null)
returns table (orden int, punto text, efecto text, mensaje text)
language sql stable security definer set search_path = public as $$
  select (p ->> 'orden')::int, coalesce(nullif(p ->> 'nombre', ''), p ->> 'codigo_postal', '(parada ' || (p ->> 'orden') || ')'),
         f.efecto, f.mensaje
    from jsonb_array_elements(case when jsonb_typeof(p_paradas) = 'array' then p_paradas else '[]'::jsonb end) p
    cross join lateral fn_restriccion_punto(left(coalesce(p ->> 'pais', 'ES'), 2), p ->> 'codigo_postal',
                                            case when p ->> 'tipo' = 'carga' then 'carga' else 'descarga' end, p_tipo_carga) f
   where f.efecto in ('bloquea', 'solo_admin')
   order by 1
$$;
revoke execute on function comprobar_cobertura(jsonb, tipo_carga) from public, anon;
grant execute on function comprobar_cobertura(jsonb, tipo_carga) to authenticated;
