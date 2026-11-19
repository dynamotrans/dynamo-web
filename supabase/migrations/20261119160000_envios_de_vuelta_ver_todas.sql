-- CARGAS DE VUELTA: 20 DEL MISMO TIPO + 5 DEL OTRO, Y «VER TODAS» (usuario, 2026-11-19).
-- En el email, cada bloque enseña hasta 20 envíos del MISMO tipo que el de la orden
-- (completo o grupaje: quien lleva completos suele volver con completos; quien lleva un
-- grupaje de 3 m se dedica a grupajes) y hasta 5 del otro, cada lista con un botón «Ver
-- todas» a una página pública con todas las de ese tipo para ese tramo. Esa página entra
-- con el mismo enlace que la orden (token del CMR + clave del transportista asignado).
--   · envios_de_vuelta_calculo: el cálculo de siempre, sin permisos (interno), hasta 200.
--   · envios_de_vuelta: igual que antes (solo Dynamo y el servidor), ahora hasta 200.
--   · envios_de_vuelta_enlace: la página pública «Ver todas», con token y clave.

create or replace function envios_de_vuelta_calculo(p_envio uuid, p_max int, p_tramo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e envios%rowtype; v_dest record; v_org record; v_base record; v_dia date;
begin
  select * into e from envios where id = p_envio;
  if not found or e.transportista_id is null then return null; end if;
  if p_tramo not in ('descarga', 'regreso') then raise exception 'Tramo no válido: %', p_tramo using errcode = '22023'; end if;
  select coalesce(t.pais_codigo_iso, 'ES') as pais_iso, left(t.codigo_postal, 2) as cp2 into v_base
    from transportistas t where t.id = e.transportista_id;
  if p_tramo = 'descarga' then
    -- Donde descarga (la última parada), el día de la descarga; «de donde venía» = la 1.ª recogida.
    select p.pais_codigo_iso as pais_iso, left(p.codigo_postal, 2) as cp2, p.fecha_desde, p.provincia, p.codigo_postal into v_dest
      from envio_paradas p where p.envio_id = e.id and p.tipo = 'descarga' order by p.orden desc limit 1;
    select p.pais_codigo_iso as pais_iso, left(p.codigo_postal, 2) as cp2 into v_org
      from envio_paradas p where p.envio_id = e.id and p.tipo = 'carga' order by p.orden limit 1;
    v_dia := coalesce((v_dest.fecha_desde at time zone 'Europe/Madrid')::date, e.fecha_entrega_estimada);
  else
    -- De vuelta en el ORIGEN (la 1.ª recogida) 2 días hábiles después del día de carga;
    -- «de donde venía» = donde descargó: el grupo 2 es la MISMA ruta que este envío.
    select p.pais_codigo_iso as pais_iso, left(p.codigo_postal, 2) as cp2, p.fecha_desde, p.provincia, p.codigo_postal into v_dest
      from envio_paradas p where p.envio_id = e.id and p.tipo = 'carga' order by p.orden limit 1;
    select p.pais_codigo_iso as pais_iso, left(p.codigo_postal, 2) as cp2 into v_org
      from envio_paradas p where p.envio_id = e.id and p.tipo = 'descarga' order by p.orden desc limit 1;
    v_dia := sumar_dias_habiles(coalesce(e.fecha_carga_prevista, (v_dest.fecha_desde at time zone 'Europe/Madrid')::date, e.fecha_carga_desde), 2);
  end if;
  if v_dest.cp2 is null or v_dia is null then return null; end if;

  return jsonb_build_object('tramo', p_tramo, 'dia', v_dia, 'tipo_envio', e.tipo_carga,
    'base', jsonb_build_object('cp2', v_base.cp2, 'pais', v_base.pais_iso),
    'previa', jsonb_build_object('cp2', v_org.cp2, 'pais', v_org.pais_iso),
    'desde', jsonb_build_object('codigo_postal', v_dest.codigo_postal, 'provincia', v_dest.provincia, 'pais', v_dest.pais_iso),
    'cargas', coalesce((
    select jsonb_agg(x.j order by x.otro_tipo, x.criterio, x.pref, x.precio desc nulls last, x.ref)
      from (
        select c.criterio, c.pref, (c.tipo_carga is distinct from e.tipo_carga) as otro_tipo, c.importe_transportista as precio, c.referencia_gx as ref,
               jsonb_build_object(
                 'token', c.token_publico, 'referencia', c.referencia_gx, 'criterio', c.criterio,
                 'precio', c.importe_transportista, 'tipo_carga', c.tipo_carga,
                 'metros_lineales', c.metros_lineales, 'toneladas', c.toneladas,
                 'mercancia', c.descripcion_mercancia, 'paletizado', c.paletizado,
                 'fecha_carga_desde', c.fecha_carga_desde, 'fecha_carga_hasta', c.fecha_carga_hasta,
                 'origen', jsonb_build_object('codigo_postal', c.o_cp, 'provincia', c.o_prov, 'pais', c.o_pais),
                 'destino', jsonb_build_object('codigo_postal', c.d_cp, 'provincia', c.d_prov, 'pais', c.d_pais)) as j
          from (
            -- Grupos 1-3: salen de la provincia «desde» y van hacia su base (1), hacia donde
            -- venía o la misma ruta (2) o hacia provincias limítrofes de su base (3). Grupo 4:
            -- salen de una provincia LIMÍTROFE de «desde» y van hacia cualquiera de esos tres
            -- destinos. Lo demás no sale (usuario, 2026-11-19: fuera «el resto»).
            select x3.*, case when x3.sale_aqui then x3.pref else 4 end as criterio
              from (
            select x2.*,
                   (x2.o_pais = v_dest.pais_iso and left(x2.o_cp, 2) = v_dest.cp2) as sale_aqui,
                   case when x2.d_pais = v_base.pais_iso and left(x2.d_cp, 2) = v_base.cp2 then 1
                        when x2.d_pais = v_org.pais_iso and left(x2.d_cp, 2) = v_org.cp2 then 2
                        when exists (select 1 from provincias_colindantes pc
                                      where pc.pais_codigo_iso = v_base.pais_iso and pc.cp2 = v_base.cp2
                                        and pc.pais_colindante = x2.d_pais and pc.colinda_con = left(x2.d_cp, 2)) then 3
                   end as pref
              from (
                select o.*, po.codigo_postal as o_cp, po.provincia as o_prov, po.pais_codigo_iso as o_pais,
                       pd.codigo_postal as d_cp, pd.provincia as d_prov, pd.pais_codigo_iso as d_pais
                  from envios o
                  join lateral (select * from envio_paradas p where p.envio_id = o.id order by p.orden limit 1) po on true
                  join lateral (select * from envio_paradas p where p.envio_id = o.id order by p.orden desc limit 1) pd on true
                 where o.id <> e.id
                   and o.publicado_en_bolsa_en is not null
                   and o.estado = 'programado' and o.estado_asignacion is distinct from 'confirmada' and o.transportista_id is null
                   and o.importe_transportista is not null and o.token_publico is not null
                   and o.fecha_carga_desde <= v_dia and coalesce(o.fecha_carga_hasta, o.fecha_carga_desde) >= v_dia
                   and ((po.pais_codigo_iso = v_dest.pais_iso and left(po.codigo_postal, 2) = v_dest.cp2)
                        or exists (select 1 from provincias_colindantes pc
                                    where pc.pais_codigo_iso = v_dest.pais_iso and pc.cp2 = v_dest.cp2
                                      and pc.pais_colindante = po.pais_codigo_iso and pc.colinda_con = left(po.codigo_postal, 2)))
                   and not exists (select 1 from envio_reservas r where r.envio_id = o.id and r.estado = 'viva' and r.hasta > now())
              ) x2
              ) x3
             where x3.pref is not null
               -- Nunca un envío que empieza y acaba en la misma provincia, ni uno que vuelve a
               -- la provincia de donde sale este bloque (p. ej. si descarga en su propia base,
               -- «hacia tu base» serían cargas dentro de esa provincia: no tiene sentido).
               and not (x3.d_pais = x3.o_pais and left(x3.d_cp, 2) = left(x3.o_cp, 2))
               and not (x3.d_pais = v_dest.pais_iso and left(x3.d_cp, 2) = v_dest.cp2)
          ) c
         order by (c.tipo_carga is distinct from e.tipo_carga), c.criterio, c.pref, c.importe_transportista desc nulls last, c.referencia_gx
         limit greatest(1, least(coalesce(p_max, 25), 200))
      ) x), '[]'::jsonb));
end $$;
revoke all on function envios_de_vuelta_calculo(uuid, int, text) from public, anon, authenticated;
comment on function envios_de_vuelta_calculo(uuid, int, text) is '[Ofertas y transportistas] El cálculo de las cargas de vuelta (ver envios_de_vuelta), sin comprobar quién llama. Quién: funciones internas. Argumentos: p_envio: el envío de la orden; p_max: cuántas como mucho (hasta 200); p_tramo: descarga o regreso.';

create or replace function envios_de_vuelta(p_envio uuid, p_max int default 25, p_tramo text default 'descarga')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('role', true), 'none') not in ('none', 'service_role', 'postgres') and not ve_todo() then
    raise exception 'Solo el equipo de Dynamo.' using errcode = '42501';
  end if;
  return envios_de_vuelta_calculo(p_envio, p_max, p_tramo);
end $$;
revoke all on function envios_de_vuelta(uuid, int, text) from public, anon;
grant execute on function envios_de_vuelta(uuid, int, text) to authenticated;
comment on function envios_de_vuelta(uuid, int, text) is '[Ofertas y transportistas] Cargas de vuelta para el email de la orden de carga ({tramo, dia, desde, base, previa, tipo_envio, cargas}; null sin datos). Tramo «descarga»: salen de la provincia de la última descarga el día de la descarga. Tramo «regreso»: salen de la provincia de origen 2 días hábiles después del día de carga. Grupos: 1 hacia su base, 2 hacia donde venía (en el regreso, la misma ruta), 3 hacia provincias limítrofes de su base, 4 desde provincias limítrofes de donde sale el bloque hacia esos destinos; nunca dentro de una misma provincia ni de vuelta a la provincia del bloque. Primero las del mismo tipo (completo o grupaje). Quién: el equipo de Dynamo y el servidor (clave de servicio). Argumentos: p_envio: el envío de la orden; p_max: cuántas como mucho (hasta 200); p_tramo: descarga o regreso.';

create or replace function envios_de_vuelta_enlace(p_token uuid, p_clave uuid, p_tramo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v cmr_enlaces%rowtype; e envios%rowtype; j jsonb;
begin
  select * into v from cmr_enlaces where token = p_token and not revocado and caduca_en > now();
  if not found then return jsonb_build_object('resultado', 'no_valido'); end if;
  select * into e from envios where id = v.envio_id;
  if not found or e.operador_id is not null or e.transportista_id is null or e.transportista_id is distinct from p_clave then
    return jsonb_build_object('resultado', 'no_valido');
  end if;
  if p_tramo not in ('descarga', 'regreso') then return jsonb_build_object('resultado', 'no_valido'); end if;
  j := envios_de_vuelta_calculo(e.id, 200, p_tramo);
  return coalesce(j, jsonb_build_object('cargas', '[]'::jsonb)) || jsonb_build_object('resultado', 'ok', 'referencia', e.referencia_gx);
end $$;
revoke all on function envios_de_vuelta_enlace(uuid, uuid, text) from public;
grant execute on function envios_de_vuelta_enlace(uuid, uuid, text) to anon, authenticated;
comment on function envios_de_vuelta_enlace(uuid, uuid, text) is '[Ofertas y transportistas] Página pública «Ver todas las cargas de vuelta» del email de la orden: las mismas cargas que envios_de_vuelta (hasta 200) para el transportista asignado. Devuelve resultado ok / no_valido. Quién: público con el enlace del email (token del CMR y clave del transportista asignado). Argumentos: p_token: cmr_enlaces.token; p_clave: id del transportista asignado; p_tramo: descarga o regreso.';
