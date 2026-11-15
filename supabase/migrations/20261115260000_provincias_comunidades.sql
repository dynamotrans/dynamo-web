-- FESTIVOS AUTONÓMICOS Y LOCALES EN LOS AVISOS A SITIOS (usuario, 2026-11-15):
--   · Tabla fija provincia → comunidad autónoma (las 52, por las 2 primeras cifras del
--     CP, con el código ISO 3166-2 que ya usa festivos.region y el nombre para la UI).
--   · `comunidad_de(pais, cp)` la consulta; `es_dia_habil_sitio` extiende el comprobador
--     de días hábiles con la comunidad del sitio (festivos autonómicos) y su población
--     (festivos locales: «Feria de Sevilla» solo cierra Sevilla capital).
--   · `tramo_aviso_parada` y el encolador de avisos pasan el CP y la población de la
--     parada: un festivo autonómico o local solo afecta a los avisos de SUS sitios.
-- El corte de cancelación y las ventanas de fechas siguen con los nacionales (son plazos
-- del contrato, no del calendario de un almacén concreto).

-- ---- 1. Provincia → comunidad (dato fijo de referencia, como los colindantes) --------
create table provincias_comunidades (
  pais_codigo_iso  char(2) not null default 'ES' check (pais_codigo_iso ~ '^[A-Z]{2}$'),
  cp2              char(2) not null check (cp2 ~ '^[0-9]{2}$'),
  comunidad_iso    text not null check (comunidad_iso ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'),
  comunidad_nombre text not null,
  primary key (pais_codigo_iso, cp2)
);
comment on table provincias_comunidades is
  'A qué comunidad autónoma pertenece cada provincia española (2 primeras cifras del CP). Dato fijo de referencia para aplicar los festivos autonómicos y locales a los avisos de los sitios.';
comment on column provincias_comunidades.pais_codigo_iso is
  'formato: ISO 3166-1 alfa-2 | rango: no aplica | lista: no aplica | obligatorio | País de la provincia. Ej. OK: ES';
comment on column provincias_comunidades.cp2 is
  'formato: 2 cifras del código postal | rango: 01-52 | lista: no aplica | obligatorio | Provincia. Ej. OK: 41';
comment on column provincias_comunidades.comunidad_iso is
  'formato: ISO 3166-2 | rango: no aplica | lista: no aplica | obligatorio | Comunidad autónoma, el mismo código que festivos.region. Ej. OK: ES-AN';
comment on column provincias_comunidades.comunidad_nombre is
  'formato: texto | rango: no aplica | lista: no aplica | obligatorio | Nombre de la comunidad para la pantalla de festivos. Ej. OK: Andalucía';
alter table provincias_comunidades enable row level security;
create policy provincias_comunidades_lee on provincias_comunidades for select to authenticated using (true);

insert into provincias_comunidades (cp2, comunidad_iso, comunidad_nombre) values
  ('04', 'ES-AN', 'Andalucía'), ('11', 'ES-AN', 'Andalucía'), ('14', 'ES-AN', 'Andalucía'),
  ('18', 'ES-AN', 'Andalucía'), ('21', 'ES-AN', 'Andalucía'), ('23', 'ES-AN', 'Andalucía'),
  ('29', 'ES-AN', 'Andalucía'), ('41', 'ES-AN', 'Andalucía'),
  ('22', 'ES-AR', 'Aragón'), ('44', 'ES-AR', 'Aragón'), ('50', 'ES-AR', 'Aragón'),
  ('33', 'ES-AS', 'Asturias'),
  ('07', 'ES-IB', 'Illes Balears'),
  ('35', 'ES-CN', 'Canarias'), ('38', 'ES-CN', 'Canarias'),
  ('39', 'ES-CB', 'Cantabria'),
  ('05', 'ES-CL', 'Castilla y León'), ('09', 'ES-CL', 'Castilla y León'), ('24', 'ES-CL', 'Castilla y León'),
  ('34', 'ES-CL', 'Castilla y León'), ('37', 'ES-CL', 'Castilla y León'), ('40', 'ES-CL', 'Castilla y León'),
  ('42', 'ES-CL', 'Castilla y León'), ('47', 'ES-CL', 'Castilla y León'), ('49', 'ES-CL', 'Castilla y León'),
  ('02', 'ES-CM', 'Castilla-La Mancha'), ('13', 'ES-CM', 'Castilla-La Mancha'), ('16', 'ES-CM', 'Castilla-La Mancha'),
  ('19', 'ES-CM', 'Castilla-La Mancha'), ('45', 'ES-CM', 'Castilla-La Mancha'),
  ('08', 'ES-CT', 'Cataluña'), ('17', 'ES-CT', 'Cataluña'), ('25', 'ES-CT', 'Cataluña'), ('43', 'ES-CT', 'Cataluña'),
  ('06', 'ES-EX', 'Extremadura'), ('10', 'ES-EX', 'Extremadura'),
  ('15', 'ES-GA', 'Galicia'), ('27', 'ES-GA', 'Galicia'), ('32', 'ES-GA', 'Galicia'), ('36', 'ES-GA', 'Galicia'),
  ('28', 'ES-MD', 'Madrid'),
  ('30', 'ES-MC', 'Murcia'),
  ('31', 'ES-NC', 'Navarra'),
  ('01', 'ES-PV', 'País Vasco'), ('20', 'ES-PV', 'País Vasco'), ('48', 'ES-PV', 'País Vasco'),
  ('26', 'ES-RI', 'La Rioja'),
  ('03', 'ES-VC', 'Comunitat Valenciana'), ('12', 'ES-VC', 'Comunitat Valenciana'), ('46', 'ES-VC', 'Comunitat Valenciana'),
  ('51', 'ES-CE', 'Ceuta'), ('52', 'ES-ML', 'Melilla');

-- ---- 2. La comunidad de un CP --------------------------------------------------------
create or replace function public.comunidad_de(p_pais char(2), p_cp text)
returns text language sql stable set search_path = public as $$
  select comunidad_iso from provincias_comunidades
   where pais_codigo_iso = upper(coalesce(p_pais, 'ES'))
     and cp2 = left(regexp_replace(coalesce(p_cp, ''), '\D', '', 'g'), 2)
$$;
revoke execute on function public.comunidad_de(char, text) from public, anon;
comment on function public.comunidad_de(char, text) is '[Ayudantes internos] La comunidad autónoma (código ISO 3166-2, como festivos.region) de un código postal español por sus 2 primeras cifras; vacío si el país no es España o el CP no casa. Quién: cualquiera con sesión. Argumentos: p_pais: país en ISO · p_cp: código postal.';

-- ---- 3. ¿Es día hábil PARA ESTE SITIO? (nacionales + autonómicos + locales) ----------
create or replace function public.es_dia_habil_sitio(p_fecha date, p_pais char(2) default 'ES',
                                                     p_cp text default null, p_poblacion text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select extract(isodow from p_fecha) < 6
     and not exists (select 1 from festivos f
                      where f.pais_codigo_iso = p_pais
                        and (f.region is null or f.region = comunidad_de(p_pais, p_cp))
                        and (f.poblacion is null
                             or (p_poblacion is not null and lower(trim(f.poblacion)) = lower(trim(p_poblacion))))
                        and f.fecha <= p_fecha
                        and festivo_cae_en(p_fecha, f.fecha, f.repetir, f.dias_desde_pascua, f.vigente_hasta))
$$;
revoke execute on function public.es_dia_habil_sitio(date, char, text, text) from public, anon;
comment on function public.es_dia_habil_sitio(date, char, text, text) is '[Ayudantes internos] Como es_dia_habil pero para un SITIO concreto: además de fines de semana y festivos nacionales de su país, cuentan los autonómicos de su comunidad (por el CP, vía provincias_comunidades) y los locales de su población. Sin CP o población solo aplican los nacionales. Quién: las funciones de avisos; nadie por la API. Argumentos: p_fecha: el día · p_pais: país ISO · p_cp: código postal del sitio · p_poblacion: población del sitio.';

-- ---- 4. El tramo del aviso, ahora con el calendario del sitio ------------------------
drop function public.tramo_aviso_parada(date, date, char);
create function public.tramo_aviso_parada(p_hoy date, p_fecha date, p_pais char(2) default 'ES',
                                          p_cp text default null, p_poblacion text default null)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_fecha = p_hoy then 'd0'
    when p_fecha < p_hoy or not es_dia_habil_sitio(p_hoy, p_pais, p_cp, p_poblacion) then null
    else case (select count(*) from generate_series(p_hoy + 1, p_fecha - 1, interval '1 day') g
                where es_dia_habil_sitio(g::date, p_pais, p_cp, p_poblacion))
           when 0 then 'd1'
           when 1 then 'd2'
           else null
         end
  end
$$;
revoke execute on function public.tramo_aviso_parada(date, date, char, text, text) from public, anon, authenticated;
comment on function public.tramo_aviso_parada(date, date, char, text, text) is '[Gestión interna] Qué tramo del aviso al sitio toca HOY para una recogida o entrega en esa fecha, contando en días hábiles DEL SITIO (fines de semana, festivos nacionales de su país, autonómicos de su comunidad por el CP y locales de su población): d0 el mismo día (siempre, sea hábil o no), d1 la víspera hábil, d2 dos días hábiles antes, y null si hoy no es hábil o no toca. Quién: encolar_avisos_paradas; nadie por la API. Argumentos: p_hoy: fecha de hoy (Madrid) · p_fecha: fecha de la recogida o entrega · p_pais: país del sitio en ISO · p_cp: código postal del sitio · p_poblacion: población del sitio.';

-- ---- 5. El encolador pasa el CP y la población de cada parada ------------------------
-- Copia de la versión de 20261115230000; solo cambia la llamada al tramo.
create or replace function public.encolar_avisos_paradas(p_hoy date default null)
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
       and (case when p.tipo = 'carga' then coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde)
                 else e.fecha_entrega_estimada end) between hoy and hoy + 10
  loop
    -- Qué tramo toca AHORA, en días hábiles DEL SITIO (su país, su comunidad por el CP y
    -- su población); el mismo día desde su hora, los otros dos dentro de la ventana.
    v_tramo := tramo_aviso_parada(hoy, r.fecha_obj, r.pais_sitio, r.codigo_postal, r.poblacion);
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
comment on function public.encolar_avisos_paradas(date) is '[Gestión interna] Encola los avisos de recogida y entrega a los sitios de la ruta (a sus emails de aviso), cada uno UNA sola vez por tramo y fecha, contando en DÍAS HÁBILES del sitio (fines de semana y tabla festivos: nacionales de su país, autonómicos de su comunidad por el CP y locales de su población): 2 días hábiles antes y la víspera hábil dentro de la ventana diaria (aviso_parada_ventana_inicio/fin, Madrid), y el mismo día desde aviso_parada_hora_mismo_dia, sea el día que sea. En sábado, domingo o festivo del sitio no sale ningún aviso anticipado. Solo envíos de Dynamo con transportista asignado. SIEMPRE «de parte de <cliente>». Devuelve cuántos encoló. Quién: la tarea programada; nadie por la API. Argumentos: p_hoy: solo para las pruebas, fija el día desde el que se cuenta (vacío = hoy en Madrid).';
