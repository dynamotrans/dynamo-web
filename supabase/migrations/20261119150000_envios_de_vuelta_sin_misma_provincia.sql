-- CARGAS DE VUELTA: NADA DENTRO DE LA MISMA PROVINCIA (usuario, 2026-11-19).
-- No se ofrecen envíos que empiezan y acaban en la misma provincia, ni que vuelven a la
-- provincia de donde sale el bloque. Si descarga en su propia base, el grupo «hacia tu base»
-- queda vacío (solo serían cargas dentro de esa provincia). Cuando la provincia de donde
-- viene es la de su base, todo sale en el grupo 1 («hacia tu base»), sin repetir el 2.

create or replace function envios_de_vuelta(p_envio uuid, p_max int default 25, p_tramo text default 'descarga')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e envios%rowtype; v_dest record; v_org record; v_base record; v_dia date;
begin
  if coalesce(current_setting('role', true), 'none') not in ('none', 'service_role', 'postgres') and not ve_todo() then
    raise exception 'Solo el equipo de Dynamo.' using errcode = '42501';
  end if;
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
         limit greatest(1, least(coalesce(p_max, 25), 50))
      ) x), '[]'::jsonb));
end $$;
revoke all on function envios_de_vuelta(uuid, int, text) from public, anon;
grant execute on function envios_de_vuelta(uuid, int, text) to authenticated;
comment on function envios_de_vuelta(uuid, int, text) is '[Ofertas y transportistas] Cargas de vuelta para el email de la orden de carga ({tramo, dia, desde, cargas}; null sin datos): envíos libres de la bolsa. Tramo «descarga»: salen de la provincia de la última descarga el día de la descarga. Tramo «regreso»: salen de la provincia de origen 2 días hábiles después del día de carga (el grupo 2 es la misma ruta). Orden: hacia la base del transportista, hacia la provincia de donde venía, hacia provincias limítrofes de su base y, desde provincias limítrofes de donde descarga, hacia esos mismos destinos (nada más); primero las del MISMO tipo que este envío (completo o grupaje) con sus 4 grupos y luego las del otro tipo; máximo p_max (25). Quién: el equipo de Dynamo y el servidor (clave de servicio). Argumentos: p_envio: el envío de la orden; p_max: cuántas como mucho; p_tramo: descarga o regreso.';
