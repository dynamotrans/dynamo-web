-- EL MAPA GENERAL TARDABA 5 SEGUNDOS EN SALIR (usuario, 2026-11-22). Antes de devolver los
-- envíos, el servidor buscaba en OpenStreetMap las paradas sin coordenadas (1 por segundo) y
-- las que no encontraba las volvía a buscar en CADA carga. Ahora el mapa sale al momento y las
-- coordenadas que faltan se buscan después, aparte: esta función dice cuáles faltan (de los
-- envíos que ve quien pregunta) y las que no se encuentran se apuntan en geo_no_encontrados
-- para no volver a buscarlas en 7 días.

create table if not exists geo_no_encontrados (
  clave       text primary key,
  buscado_en  timestamptz not null default now()
);
comment on table geo_no_encontrados is 'Paradas que el servidor buscó en OpenStreetMap sin encontrar coordenadas: no se vuelven a buscar en 7 días (antes se buscaban en cada carga del mapa y lo hacían lento). Solo la escribe el servidor.';
comment on column geo_no_encontrados.clave is 'formato: texto | rango: hasta 300 caracteres | lista: no aplica | obligatorio | País, código postal y población de la parada, normalizados («ES|41001|sevilla»). Ej. OK: ES|41001|sevilla';
comment on column geo_no_encontrados.buscado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Última vez que se buscó sin encontrarla.';
alter table geo_no_encontrados enable row level security;
-- Sin políticas: solo el servidor (clave de servicio).
revoke all on geo_no_encontrados from anon, authenticated;
drop trigger if exists tg_mantenimiento on geo_no_encontrados;
create trigger tg_mantenimiento before insert or update or delete on geo_no_encontrados
  for each row execute function fn_bloqueo_mantenimiento();

-- Las paradas sin coordenadas de los envíos del mapa general que ve quien pregunta (como
-- mapa_envios_en_curso: Dynamo, todas; el cliente, las suyas), sin repetir y como mucho 40.
create or replace function public.mapa_paradas_sin_coordenadas()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_dynamo boolean := es_equipo_dynamo() or ve_todo(); v_cli uuid := cliente_del_usuario();
begin
  if not v_dynamo and v_cli is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x) from (
      select distinct on (upper(coalesce(p.pais_codigo_iso, 'ES')), upper(regexp_replace(coalesce(p.codigo_postal, ''), '\s', '', 'g')), lower(coalesce(p.poblacion, '')))
             jsonb_build_object('pais', upper(coalesce(p.pais_codigo_iso, 'ES')), 'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion,
                                'provincia', p.provincia, 'direccion', p.direccion) as x
        from (select v.id from envios v
               where v.estado in ('programado', 'hacia_la_carga', 'cargando', 'en_ruta')
                 and (v_dynamo or v.cliente_id = v_cli)
               order by (v.estado = 'programado'), coalesce(v.fecha_carga_real, v.fecha_carga_prevista, v.fecha_carga_desde)
               limit 400) e
        join envio_paradas p on p.envio_id = e.id
        left join sitios s on s.id = p.sitio_id
        left join geo_codigos_postales g on g.pais_codigo_iso = upper(coalesce(p.pais_codigo_iso, 'ES'))
                                        and g.codigo_postal = upper(regexp_replace(coalesce(p.codigo_postal, ''), '\s', '', 'g'))
       where coalesce(p.lat, s.lat, g.lat) is null
         and not exists (select 1 from firmas_cmr f where f.envio_id = p.envio_id and f.parada_id = p.id and f.lat is not null)
         and (coalesce(p.codigo_postal, '') <> '' or coalesce(p.poblacion, '') <> '')
       order by upper(coalesce(p.pais_codigo_iso, 'ES')), upper(regexp_replace(coalesce(p.codigo_postal, ''), '\s', '', 'g')), lower(coalesce(p.poblacion, ''))
       limit 40) y), '[]'::jsonb);
end $$;
revoke execute on function public.mapa_paradas_sin_coordenadas() from public, anon;
grant execute on function public.mapa_paradas_sin_coordenadas() to authenticated;
comment on function public.mapa_paradas_sin_coordenadas() is '[Envíos] Las paradas sin coordenadas de los envíos que salen en el mapa general (como mapa_envios_en_curso), sin repetir y como mucho 40, para que el servidor las busque aparte sin hacer esperar al mapa. Quién: Dynamo (todas) y el cliente (las suyas); a los demás, lista vacía. Argumentos: sin argumentos.';
