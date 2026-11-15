-- AVISOS A SITIOS EN DÍAS HÁBILES (usuario, 2026-11-15): los tramos «2 días antes» y
-- «víspera» se cuentan ahora en DÍAS HÁBILES del país del sitio, no en días de
-- calendario, y los avisos NO salen en sábado, domingo ni festivo (quien los lee no
-- está). Si la carga es un lunes, la víspera es el VIERNES; si entre medias hay un
-- festivo nacional (tabla `festivos`, editable desde el panel, con los nacionales
-- perpetuos y la Semana Santa calculada), también se salta. El aviso del MISMO día
-- sale siempre, sea el día que sea: el camión va ese día.
--   · Víspera (d1) = hoy es hábil y no queda ningún día hábil entre hoy y la fecha.
--   · 2 días antes (d2) = hoy es hábil y queda exactamente un día hábil entre medias.
-- La cuenta vive en una función pura (`tramo_aviso_parada`) para poder probarla con
-- fechas fijas. El país es el de la parada; para sitios fuera de España cuentan sus
-- fines de semana y los festivos de su país que Dynamo añada a la tabla.

-- ---- 1. El tramo que toca, como función pura (sin horas: eso lo pone el encolador) ----
create or replace function public.tramo_aviso_parada(p_hoy date, p_fecha date, p_pais char(2) default 'ES')
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_fecha = p_hoy then 'd0'
    when p_fecha < p_hoy or not es_dia_habil(p_hoy, p_pais) then null
    else case (select count(*) from generate_series(p_hoy + 1, p_fecha - 1, interval '1 day') g
                where es_dia_habil(g::date, p_pais))
           when 0 then 'd1'
           when 1 then 'd2'
           else null
         end
  end
$$;
revoke execute on function public.tramo_aviso_parada(date, date, char) from public, anon, authenticated;
comment on function public.tramo_aviso_parada(date, date, char) is '[Gestión interna] Qué tramo del aviso al sitio toca HOY para una recogida o entrega en esa fecha, contando en días hábiles del país (fines de semana y tabla festivos): d0 el mismo día (siempre, sea hábil o no), d1 la víspera hábil, d2 dos días hábiles antes, y null si hoy no es hábil o no toca. Quién: encolar_avisos_paradas; nadie por la API. Argumentos: p_hoy: fecha de hoy (Madrid) · p_fecha: fecha de la recogida o entrega · p_pais: país del sitio en ISO.';

-- ---- 2. El encolador, contando en días hábiles ----------------------------------------
-- Copia de la versión de 20261114010000: cambian el tramo (tramo_aviso_parada), la
-- horquilla de búsqueda (hasta 10 días, por puentes y findes) y el país de la parada.
-- Gana un argumento opcional p_hoy SOLO para las pruebas (fechas fijas, deterministas
-- cualquier día que corran); la tarea programada sigue llamando sin argumentos.
drop function public.encolar_avisos_paradas();
create function public.encolar_avisos_paradas(p_hoy date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0; v_cnt int; r record; v_tramo text; v_rec boolean;
  hoy date := coalesce(p_hoy, (now() at time zone 'Europe/Madrid')::date);
  ahora time := (now() at time zone 'Europe/Madrid')::time;
  h_ini int := greatest(0, least(23, parametro_num('aviso_parada_ventana_inicio', 10)::int));
  h_fin int := greatest(0, least(24, parametro_num('aviso_parada_ventana_fin', 16)::int));
  h_dia int := greatest(0, least(23, parametro_num('aviso_parada_hora_mismo_dia', 8)::int));
  en_ventana boolean;
begin
  en_ventana := ahora >= make_time(h_ini, 0, 0) and (h_fin >= 24 or ahora < make_time(h_fin, 0, 0));
  for r in
    select e.id as envio, e.referencia_gx, e.matricula_camion, e.matricula_remolque, e.conductor_nombre,
           c.razon_social as cliente,
           p.id as parada, p.tipo as tipo_parada, p.nombre_empresa, p.direccion, p.codigo_postal, p.poblacion,
           p.pais_codigo_iso as pais_sitio,
           s.emails_avisos,
           case when p.tipo = 'carga' then coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde)
                else e.fecha_entrega_estimada end as fecha_obj
      from envios e
      join clientes c on c.id = e.cliente_id
      join envio_paradas p on p.envio_id = e.id
      join sitios s on s.id = p.sitio_id
     where e.transportista_id is not null
       and not coalesce(e.es_manual, false)
       and e.estado not in ('borrador', 'cancelado', 'entregado')
       and cardinality(s.emails_avisos) > 0
       -- Hasta 10 días vista: «2 días hábiles antes» puede caer lejos en el calendario
       -- cuando hay fin de semana y puente por medio.
       and (case when p.tipo = 'carga' then coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde)
                 else e.fecha_entrega_estimada end) between hoy and hoy + 10
  loop
    -- Qué tramo toca AHORA, en días hábiles del país del sitio; el mismo día desde su
    -- hora, los otros dos solo dentro de la ventana diaria.
    v_tramo := tramo_aviso_parada(hoy, r.fecha_obj, r.pais_sitio);
    v_tramo := case when v_tramo = 'd0' and ahora >= make_time(h_dia, 0, 0) then 'd0'
                    when v_tramo in ('d1', 'd2') and en_ventana then v_tramo end;
    continue when v_tramo is null;
    v_rec := r.tipo_parada = 'carga';
    insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
    values ('aviso_parada:' || r.envio || ':' || r.parada || ':' || v_tramo || ':' || r.fecha_obj,
            'aviso_parada', r.envio, array_to_string(r.emails_avisos, ','),
            format('%s prevista el %s · de parte de %s · Dynamo',
                   case when v_rec then 'Recogida' else 'Entrega' end,
                   to_char(r.fecha_obj, 'DD/MM/YYYY'), r.cliente),
            texto_aviso_parada(v_rec, r.cliente, r.nombre_empresa, r.direccion, r.codigo_postal,
                               r.poblacion, r.fecha_obj, r.matricula_camion, r.matricula_remolque,
                               r.conductor_nombre))
    on conflict (clave) do nothing;
    get diagnostics v_cnt = row_count; n := n + v_cnt;
  end loop;
  return n;
end $$;
revoke execute on function public.encolar_avisos_paradas(date) from public, anon, authenticated;
comment on function public.encolar_avisos_paradas(date) is '[Gestión interna] Encola los avisos de recogida y entrega a los sitios de la ruta (a sus emails de aviso), cada uno UNA sola vez por tramo y fecha, contando en DÍAS HÁBILES del país del sitio (fines de semana y tabla festivos): 2 días hábiles antes y la víspera hábil dentro de la ventana diaria (aviso_parada_ventana_inicio/fin, Madrid), y el mismo día desde aviso_parada_hora_mismo_dia, sea el día que sea. En sábado, domingo o festivo no sale ningún aviso anticipado. Solo envíos de Dynamo con transportista asignado. SIEMPRE «de parte de <cliente>»: la discreción comercial protege la ruta, que el aviso no lleva, no al cliente que manda el camión. Devuelve cuántos encoló. Quién: la tarea programada; nadie por la API. Argumentos: p_hoy: solo para las pruebas, fija el día desde el que se cuenta (vacío = hoy en Madrid).';
