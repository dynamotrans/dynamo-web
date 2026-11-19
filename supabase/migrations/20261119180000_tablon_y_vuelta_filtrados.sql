-- «OTROS ENVÍOS DISPONIBLES» DE LA PÁGINA DE ACEPTAR CARGA: LOS MISMOS FILTROS QUE EL EMAIL
-- (usuario, 2026-11-19). El transportista no ve todo lo que hay en Dynamo: solo las cargas de
-- vuelta de ESTE envío (las mismas reglas que el email de la orden: desde donde descarga el
-- día de la descarga y de regreso al origen 2 días hábiles después) y SOLO del mismo tipo
-- (completo o grupaje) que el envío que está viendo.
--   · envios_de_vuelta_calculo ya no exige transportista: en la oferta todavía no lo hay, así
--     que sin base solo cuentan «hacia donde venía / la misma ruta» y, desde provincias
--     limítrofes, hacia ahí. Con transportista asignado, también su base. Trae la población.
--   · otras_cargas_publicas: con el enlace de una carga reciente, esas cargas (máx. 50), con
--     la misma forma de siempre para la página.

do $$
declare v_def text; v_nueva text;
begin
  select pg_get_functiondef('public.envios_de_vuelta_calculo(uuid, integer, text)'::regprocedure) into v_def;
  if position('o_pob' in v_def) > 0 then return; end if;
  v_nueva := replace(v_def, '  if not found or e.transportista_id is null then return null; end if;', '  if not found then return null; end if;');
  v_nueva := replace(v_nueva, 'po.codigo_postal as o_cp, po.provincia as o_prov, po.pais_codigo_iso as o_pais,',
                              'po.codigo_postal as o_cp, po.provincia as o_prov, po.pais_codigo_iso as o_pais, po.poblacion as o_pob,');
  v_nueva := replace(v_nueva, 'pd.codigo_postal as d_cp, pd.provincia as d_prov, pd.pais_codigo_iso as d_pais',
                              'pd.codigo_postal as d_cp, pd.provincia as d_prov, pd.pais_codigo_iso as d_pais, pd.poblacion as d_pob');
  v_nueva := replace(v_nueva, '''origen'', jsonb_build_object(''codigo_postal'', c.o_cp, ''provincia'', c.o_prov, ''pais'', c.o_pais)',
                              '''origen'', jsonb_build_object(''codigo_postal'', c.o_cp, ''poblacion'', c.o_pob, ''provincia'', c.o_prov, ''pais'', c.o_pais)');
  v_nueva := replace(v_nueva, '''destino'', jsonb_build_object(''codigo_postal'', c.d_cp, ''provincia'', c.d_prov, ''pais'', c.d_pais)',
                              '''destino'', jsonb_build_object(''codigo_postal'', c.d_cp, ''poblacion'', c.d_pob, ''provincia'', c.d_prov, ''pais'', c.d_pais)');
  if v_nueva = v_def or (length(v_nueva) - length(replace(v_nueva, '_pob', ''))) / 4 < 4
     or position('e.transportista_id is null then return null' in v_nueva) > 0 then
    raise exception 'envios_de_vuelta_calculo() no tiene el texto esperado: revisar la migración';
  end if;
  execute v_nueva;
end $$;

create or replace function otras_cargas_publicas(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare t record; e envios%rowtype;
begin
  select * into t from oferta_de_token(p_token);
  if t.envio_id is null then return '[]'::jsonb; end if;
  select * into e from envios where id = t.envio_id;
  -- Solo con el enlace de una carga reciente (no vale cualquier enlace antiguo).
  if not found or coalesce(e.fecha_carga_hasta, e.fecha_carga_desde, e.creado_en::date)
                  < (now() at time zone 'Europe/Madrid')::date - parametro_num('tablon_enlace_dias', 14)::int then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'token', c ->> 'token', 'referencia', c ->> 'referencia',
             'fecha_carga_desde', c -> 'fecha_carga_desde', 'fecha_carga_hasta', c -> 'fecha_carga_hasta',
             'metros_lineales', c -> 'metros_lineales', 'toneladas', c -> 'toneladas', 'tipo_carga', c ->> 'tipo_carga',
             'requiere_plataforma_elevadora', (select o.requiere_plataforma_elevadora from envios o where o.token_publico = (c ->> 'token')::uuid),
             'precio', c -> 'precio', 'origen', c -> 'origen', 'destino', c -> 'destino')
           order by x.tramo, x.n)
      from (
        select distinct on (c ->> 'token') c, v.tramo, v.n
          from (values (1, envios_de_vuelta_calculo(e.id, 50, 'descarga')), (2, envios_de_vuelta_calculo(e.id, 50, 'regreso'))) as b(tramo, j)
          cross join lateral jsonb_array_elements(coalesce(b.j -> 'cargas', '[]'::jsonb)) with ordinality as v0(c, n)
          cross join lateral (select b.tramo, v0.n) v
         where v0.c ->> 'tipo_carga' is not distinct from e.tipo_carga::text
         order by c ->> 'token', v.tramo, v.n
      ) x(c, tramo, n)
     limit 50), '[]'::jsonb);
end $$;
revoke all on function otras_cargas_publicas(uuid) from public;
grant execute on function otras_cargas_publicas(uuid) to anon, authenticated;
comment on function otras_cargas_publicas(uuid) is '[Ofertas y transportistas] «Otros envíos disponibles» de la página pública de una carga: SOLO las cargas de vuelta de ese envío (las mismas reglas que el email de la orden: desde donde descarga el día de la descarga y de regreso al origen) y del MISMO tipo (completo o grupaje), máx. 50; nunca todo lo que hay en Dynamo. Solo con el enlace de una carga reciente (parámetro tablon_enlace_dias). Sin datos del cliente ni del sitio. Quién: público con el enlace. Argumentos: p_token: el enlace de la carga (oferta o envío).';
