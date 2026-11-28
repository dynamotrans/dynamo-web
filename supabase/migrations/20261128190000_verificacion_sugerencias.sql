-- VERIFICACIÓN DE ALBARANES: SUGERIR EL ENVÍO (usuario, 2026-11-28): «sí, monta lo de sugerir los
-- envíos que encajan». Cuando un albarán llega sin envío (la GX del nombre no existe o no trae),
-- la bandeja propone los envíos que encajan con lo que trae el nombre del archivo: matrículas,
-- CP de origen y de destino y fecha. Dynamo elige uno con un clic (o escribe la GX a mano).

create or replace function public.verificacion_albaran_sugerencias(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d documentos_entrada; v_fecha date; v_mats text[]; v_cp_o text; v_cp_d text;
begin
  if not (es_equipo_dynamo() or ve_todo()) then return '[]'::jsonb; end if;
  select * into d from documentos_entrada where id = p_id and estado = 'pendiente';
  if d.id is null then return '[]'::jsonb; end if;
  v_fecha := case when coalesce(d.datos ->> 'fecha', '') ~ '^\d{4}-\d{2}-\d{2}$' then (d.datos ->> 'fecha')::date end;
  -- Matrículas sin espacios ni guiones, y también sin la R de los remolques (R2252BDK = 2252BDK).
  select array_agg(distinct x) into v_mats from (
    select regexp_replace(upper(m), '[^A-Z0-9]', '', 'g') x from unnest(string_to_array(coalesce(d.datos ->> 'matriculas', ''), '/')) m
    union select regexp_replace(regexp_replace(upper(m), '[^A-Z0-9]', '', 'g'), '^R(?=\d)', '') from unnest(string_to_array(coalesce(d.datos ->> 'matriculas', ''), '/')) m) z
   where length(x) >= 4;
  v_cp_o := substring(coalesce(d.datos ->> 'origen', '') from '^(\d{4,5})');
  v_cp_d := substring(coalesce(d.datos ->> 'destino', '') from '^(\d{4,5})');
  if v_fecha is null and v_mats is null and v_cp_o is null and v_cp_d is null then return '[]'::jsonb; end if;

  return coalesce((select jsonb_agg(to_jsonb(s) - 'puntos' order by s.puntos desc, s.dias, s.referencia) from (select * from (
    select e.id, e.referencia_gx as referencia, e.estado, c.nombre_visible as cliente, t.nombre_visible as transportista,
           coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde) as fecha_carga,
           o.poblacion as origen, de.poblacion as destino,
           m.coinc as matriculas_coinciden, (o.codigo_postal = v_cp_o) as origen_coincide, coalesce(dd.si, false) as destino_coincide,
           abs(coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde) - coalesce(v_fecha, (d.recibido_en at time zone 'Europe/Madrid')::date)) as dias,
           (case when m.coinc then 50 else 0 end)
           + (case when o.codigo_postal = v_cp_o then 20 else 0 end)
           + (case when coalesce(dd.si, false) then 20 else 0 end)
           + (case when v_fecha is null then 0
                   when abs(coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde) - v_fecha) = 0 then 15
                   when abs(coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde) - v_fecha) <= 1 then 10
                   when abs(coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde) - v_fecha) <= 3 then 5 else 0 end) as puntos
      from envios e
      left join clientes c on c.id = e.cliente_id
      left join transportistas t on t.id = e.transportista_id
      left join lateral (select p.codigo_postal, p.poblacion from envio_paradas p where p.envio_id = e.id and p.tipo = 'carga' order by p.orden limit 1) o on true
      left join lateral (select p.poblacion from envio_paradas p where p.envio_id = e.id and p.tipo = 'descarga' order by p.orden desc limit 1) de on true
      left join lateral (select true as si from envio_paradas p where p.envio_id = e.id and p.tipo = 'descarga' and p.codigo_postal = v_cp_d limit 1) dd on true
      cross join lateral (select coalesce(v_mats && array_remove(array[
          regexp_replace(upper(coalesce(e.matricula_camion, '')), '[^A-Z0-9]', '', 'g'),
          regexp_replace(upper(coalesce(e.matricula_remolque, '')), '[^A-Z0-9]', '', 'g'),
          regexp_replace(regexp_replace(upper(coalesce(e.matricula_remolque, '')), '[^A-Z0-9]', '', 'g'), '^R(?=\d)', '')], ''), false) as coinc) m
     where e.estado not in ('borrador', 'cancelado')
       -- Ventana de fechas: la del nombre (o la de llegada) desde 30 días antes hasta 7 después.
       and e.fecha_carga_desde between coalesce(v_fecha, (d.recibido_en at time zone 'Europe/Madrid')::date) - 30
                                   and coalesce(v_fecha, (d.recibido_en at time zone 'Europe/Madrid')::date) + 7
       and (e.id is distinct from d.envio_id)
  ) q where q.puntos >= 20 order by q.puntos desc, q.dias, q.referencia limit 5) s), '[]'::jsonb);
end $$;
revoke execute on function public.verificacion_albaran_sugerencias(uuid) from public, anon;
grant execute on function public.verificacion_albaran_sugerencias(uuid) to authenticated;
comment on function public.verificacion_albaran_sugerencias(uuid) is '[Envíos] Verificación de albaranes: hasta 5 envíos que encajan con un albarán pendiente según lo que trae el nombre del archivo (matrículas del camión o del remolque, CP de origen y de destino, fecha de carga desde 30 días antes hasta 7 después), de más a menos parecido, con qué coincide en cada uno. Sin borradores ni cancelados. Quién: el equipo de Dynamo (a los demás, lista vacía). Argumentos: p_id: documentos_entrada.id.';
