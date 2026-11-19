-- CARGAS DE VUELTA EN EL EMAIL DE LA ORDEN DE CARGA (usuario, 2026-11-19).
-- Al mandar la orden al transportista (haya aceptado por la web o se la asignemos por
-- teléfono), el email termina con envíos de Dynamo libres que salen de la PROVINCIA donde
-- descarga (su última parada) el MISMO DÍA de la descarga, para que vuelva cargado. Con
-- botón «Ver carga» a la página pública de cada uno. Máximo 15, en este orden:
--   1. hacia la provincia de SU BASE;
--   2. hacia la provincia de donde VENÍA (la primera recogida de este envío);
--   3. hacia provincias LIMÍTROFES de su base;
--   4. el resto, desde esa provincia.
-- Dentro de cada grupo, primero los completos y luego los grupajes; después, el precio más alto.
-- Los mismos envíos que el tablón de la página pública: publicados en bolsa, programados,
-- sin transportista, con precio, y sin una reserva viva.

create or replace function envios_de_vuelta(p_envio uuid, p_max int default 15)
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
  -- Dónde y cuándo descarga (la última parada); de dónde venía (la primera).
  select p.pais_codigo_iso as pais_iso, left(p.codigo_postal, 2) as cp2, p.fecha_desde, p.provincia, p.codigo_postal into v_dest
    from envio_paradas p where p.envio_id = e.id and p.tipo = 'descarga' order by p.orden desc limit 1;
  select p.pais_codigo_iso as pais_iso, left(p.codigo_postal, 2) as cp2 into v_org
    from envio_paradas p where p.envio_id = e.id and p.tipo = 'carga' order by p.orden limit 1;
  select coalesce(t.pais_codigo_iso, 'ES') as pais_iso, left(t.codigo_postal, 2) as cp2 into v_base
    from transportistas t where t.id = e.transportista_id;
  v_dia := coalesce((v_dest.fecha_desde at time zone 'Europe/Madrid')::date, e.fecha_entrega_estimada);
  if v_dest.cp2 is null or v_dia is null then return null; end if;

  return jsonb_build_object('dia', v_dia,
    'desde', jsonb_build_object('codigo_postal', v_dest.codigo_postal, 'provincia', v_dest.provincia, 'pais', v_dest.pais_iso),
    'cargas', coalesce((
    select jsonb_agg(x.j order by x.criterio, x.completo desc, x.precio desc nulls last, x.ref)
      from (
        select c.criterio, (c.tipo_carga = 'completa') as completo, c.importe_transportista as precio, c.referencia_gx as ref,
               jsonb_build_object(
                 'token', c.token_publico, 'referencia', c.referencia_gx, 'criterio', c.criterio,
                 'precio', c.importe_transportista, 'tipo_carga', c.tipo_carga,
                 'metros_lineales', c.metros_lineales, 'toneladas', c.toneladas,
                 'mercancia', c.descripcion_mercancia, 'paletizado', c.paletizado,
                 'fecha_carga_desde', c.fecha_carga_desde, 'fecha_carga_hasta', c.fecha_carga_hasta,
                 'origen', jsonb_build_object('codigo_postal', c.o_cp, 'provincia', c.o_prov, 'pais', c.o_pais),
                 'destino', jsonb_build_object('codigo_postal', c.d_cp, 'provincia', c.d_prov, 'pais', c.d_pais)) as j
          from (
            select x2.*,
                   case when x2.d_pais = v_base.pais_iso and left(x2.d_cp, 2) = v_base.cp2 then 1
                        when x2.d_pais = v_org.pais_iso and left(x2.d_cp, 2) = v_org.cp2 then 2
                        when exists (select 1 from provincias_colindantes pc
                                      where pc.pais_codigo_iso = v_base.pais_iso and pc.cp2 = v_base.cp2
                                        and pc.pais_colindante = x2.d_pais and pc.colinda_con = left(x2.d_cp, 2)) then 3
                        else 4 end as criterio
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
                   and po.pais_codigo_iso = v_dest.pais_iso and left(po.codigo_postal, 2) = v_dest.cp2
                   and not exists (select 1 from envio_reservas r where r.envio_id = o.id and r.estado = 'viva' and r.hasta > now())
              ) x2
          ) c
         order by c.criterio, (c.tipo_carga = 'completa') desc, c.importe_transportista desc nulls last, c.referencia_gx
         limit greatest(1, least(coalesce(p_max, 15), 50))
      ) x), '[]'::jsonb));
end $$;
revoke all on function envios_de_vuelta(uuid, int) from public, anon;
grant execute on function envios_de_vuelta(uuid, int) to authenticated;
comment on function envios_de_vuelta(uuid, int) is '[Ofertas y transportistas] Cargas de vuelta para el email de la orden de carga ({dia, desde, cargas}; null sin datos de la descarga): envíos libres de la bolsa que salen de la provincia de la última descarga el mismo día de la descarga. Orden: hacia la base del transportista, hacia la provincia de donde venía, hacia provincias limítrofes de su base y el resto; completos antes que grupajes; máximo p_max (15). Quién: el equipo de Dynamo y el servidor (clave de servicio). Argumentos: p_envio: el envío de la orden; p_max: cuántas como mucho.';
