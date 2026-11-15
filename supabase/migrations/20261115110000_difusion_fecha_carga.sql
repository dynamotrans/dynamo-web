-- La oferta escalonada se gobierna por la FECHA DE CARGA (usuario, 2026-11-15):
--   1. Arranque: los emails empiezan como pronto N días antes del primer día de carga
--      (difusion_dias_antes, 5). Lanzada antes, la difusión queda dormida hasta entonces.
--   2. Cadencia por tramos: cuanto menos falte para la carga, más seguido sale el email
--      (difusion_cadencia); en el tramo urgente salen de 2 en 2.
--   3. Corte duro: X horas antes de la carga (difusion_horas_corte, 3) no sale ni un
--      email más; la difusión se cierra y Dynamo recibe aviso urgente («es de teléfono»).
--      La hora de carga la pone Dynamo al lanzar (opcional); si no, las 8:00.
--   4. Recordatorio diario (difusion_recordatorio_hora, 9): mientras el envío siga libre,
--      un email al día a los ya contactados con el MISMO enlace, reabriendo su caducidad
--      hasta el corte. Quien aceptó, rechazó o perdió la oferta no lo recibe.
--   5. Ranking nuevo: quien HIZO ESA RUTA primero (dentro: favorito → valoración → ruta
--      más reciente); después favoritos → valoración → sede en la provincia del origen →
--      provincia colindante del origen → provincia del destino → colindante del destino →
--      antigüedad. Tabla fija de provincias colindantes (CP de 2 cifras, peninsulares).

-- ---- 1. Parámetros -------------------------------------------------------------------
insert into parametros (clave, valor, descripcion) values
  ('difusion_dias_antes', '5'::jsonb,
   'Oferta escalonada: días antes del primer día de carga en que empiezan los emails. Lanzada antes, la difusión espera dormida.'),
  ('difusion_horas_corte', '3'::jsonb,
   'Oferta escalonada: horas antes de la hora de carga en que se corta el envío de emails. Al llegar al corte sin aceptación, aviso urgente a Dynamo.'),
  ('difusion_hora_carga_defecto', '8'::jsonb,
   'Oferta escalonada: hora española (0-23) que se asume como hora de carga cuando Dynamo no la indica al lanzar.'),
  ('difusion_recordatorio_hora', '9'::jsonb,
   'Oferta escalonada: hora española (0-23) a partir de la cual sale el recordatorio diario «la carga sigue disponible» a los ya contactados.'),
  ('difusion_cadencia', '[{"hasta_horas":6,"minutos":1,"lote":2},{"hasta_horas":24,"minutos":2},{"hasta_horas":72,"minutos":5},{"hasta_horas":null,"minutos":10}]'::jsonb,
   'Oferta escalonada: tramos de cadencia según las horas que falten para la carga. Cada tramo: hasta_horas (null = sin límite), minutos entre emails y lote (emails por paso, 1 si falta).')
on conflict (clave) do nothing;

-- ---- 2. Provincias colindantes (CP de 2 cifras, peninsulares) ------------------------
create table provincias_colindantes (
  cp2         char(2) not null,
  colinda_con char(2) not null,
  primary key (cp2, colinda_con)
);
comment on table provincias_colindantes is
  'Pares de provincias españolas peninsulares que se tocan, por las 2 primeras cifras del código postal, en los dos sentidos. Dato fijo de referencia para el ranking de la oferta escalonada.';
comment on column provincias_colindantes.cp2 is
  'formato: 2 cifras del código postal | rango: 01-50 | lista: no aplica | obligatorio | Provincia. Ej. OK: 41';
comment on column provincias_colindantes.colinda_con is
  'formato: 2 cifras del código postal | rango: 01-50 | lista: no aplica | obligatorio | Provincia que la toca. Ej. OK: 11';
alter table provincias_colindantes enable row level security;
create policy provincias_colindantes_lee on provincias_colindantes for select to authenticated using (true);

-- Pares en un sentido; el insert los guarda en los dos.
with pares (a, b) as (values
  ('01','09'),('01','20'),('01','26'),('01','31'),('01','48'),
  ('02','03'),('02','13'),('02','16'),('02','18'),('02','23'),('02','30'),('02','46'),
  ('03','30'),('03','46'),
  ('04','18'),('04','30'),
  ('05','10'),('05','28'),('05','37'),('05','40'),('05','45'),('05','47'),
  ('06','10'),('06','13'),('06','14'),('06','21'),('06','41'),('06','45'),
  ('08','17'),('08','25'),('08','43'),
  ('09','26'),('09','34'),('09','39'),('09','40'),('09','42'),('09','47'),('09','48'),
  ('10','37'),('10','45'),
  ('11','21'),('11','29'),('11','41'),
  ('12','43'),('12','44'),('12','46'),
  ('13','14'),('13','16'),('13','23'),('13','45'),
  ('14','18'),('14','23'),('14','29'),('14','41'),
  ('15','27'),('15','36'),
  ('16','19'),('16','28'),('16','44'),('16','45'),('16','46'),
  ('17','25'),
  ('18','23'),('18','29'),('18','30'),
  ('19','28'),('19','40'),('19','42'),('19','44'),('19','50'),
  ('20','31'),('20','48'),
  ('21','41'),
  ('22','25'),('22','31'),('22','50'),
  ('24','27'),('24','32'),('24','33'),('24','34'),('24','39'),('24','47'),('24','49'),
  ('25','43'),('25','50'),
  ('26','31'),('26','42'),('26','50'),
  ('27','32'),('27','33'),('27','36'),
  ('28','40'),('28','45'),
  ('29','41'),
  ('32','36'),('32','49'),
  ('33','39'),
  ('34','39'),('34','47'),
  ('37','47'),('37','49'),
  ('39','48'),
  ('40','42'),('40','47'),
  ('42','50'),
  ('43','44'),('43','50'),
  ('44','46'),('44','50'),
  ('47','49'))
insert into provincias_colindantes (cp2, colinda_con)
select a, b from pares union select b, a from pares;

-- ---- 3. Columnas nuevas de difusiones ------------------------------------------------
alter table difusiones
  add column if not exists empieza_en timestamptz,
  add column if not exists carga_prevista_en timestamptz,
  add column if not exists corte_en timestamptz,
  add column if not exists ultimo_recordatorio date;
comment on column difusiones.empieza_en is
  'formato: fecha y hora (con zona) | rango: no aplica | lista: no aplica | opcional | Cuándo empiezan los emails (días antes de la carga, parámetro). Antes, la difusión duerme. Vacío = empieza ya. Ej. OK: 2026-11-20 05:00+01';
comment on column difusiones.carga_prevista_en is
  'formato: fecha y hora (con zona) | rango: no aplica | lista: no aplica | opcional | Hora prevista de la carga (la dada por Dynamo al lanzar, o la del parámetro por defecto) de la que salen la cadencia y el corte. Vacío = envío sin fecha. Ej. OK: 2026-11-20 08:00+01';
comment on column difusiones.corte_en is
  'formato: fecha y hora (con zona) | rango: no aplica | lista: no aplica | opcional | Corte: a partir de aquí no sale ni un email más y, si nadie aceptó, aviso urgente a Dynamo. Ej. OK: 2026-11-20 05:00+01';
comment on column difusiones.ultimo_recordatorio is
  'formato: fecha | rango: no aplica | lista: no aplica | opcional | Último día (España) en que salió el recordatorio «sigue disponible» a los contactados, para mandar solo uno al día. Ej. OK: 2026-11-18';

-- ---- 4. El registro de emails admite el recordatorio ---------------------------------
alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida'));
comment on column public.emails_enviados.tipo is 'formato: texto | rango: no aplica | lista: matriculas · vispera · orden_carga · firma_cmr · cmr_completo · difusion · difusion_fin · difusion_recordatorio · aviso_entrega · aviso_parada · aviso_parada_cancelada · cuenta_suspendida | obligatorio | Qué aviso es. Ej. OK: matriculas';

-- ---- 5. La cadencia por tramos -------------------------------------------------------
create or replace function fn_difusion_cadencia(p_horas numeric, out minutos int, out lote int)
returns record language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  v := parametro('difusion_cadencia');
  if v is null or jsonb_typeof(v) <> 'array' or jsonb_array_length(v) = 0 then
    v := '[{"hasta_horas":6,"minutos":1,"lote":2},{"hasta_horas":24,"minutos":2},{"hasta_horas":72,"minutos":5},{"hasta_horas":null,"minutos":10}]'::jsonb;
  end if;
  if p_horas is null then
    -- Envío sin fecha: el tramo más tranquilo (el de más horas).
    select greatest(1, coalesce((a ->> 'minutos')::int, 10)), greatest(1, coalesce((a ->> 'lote')::int, 1))
      into minutos, lote from jsonb_array_elements(v) a
     order by coalesce((a ->> 'hasta_horas')::numeric, 999999) desc limit 1;
  else
    select greatest(1, coalesce((a ->> 'minutos')::int, 10)), greatest(1, coalesce((a ->> 'lote')::int, 1))
      into minutos, lote from jsonb_array_elements(v) a
     where greatest(p_horas, 0) <= coalesce((a ->> 'hasta_horas')::numeric, 999999)
     order by coalesce((a ->> 'hasta_horas')::numeric, 999999) asc limit 1;
  end if;
  minutos := greatest(1, coalesce(minutos, 10));
  lote    := greatest(1, coalesce(lote, 1));
end $$;
revoke execute on function fn_difusion_cadencia(numeric) from public, anon, authenticated;
comment on function public.fn_difusion_cadencia(numeric) is '[Gestión interna] Cadencia de la oferta escalonada según las horas que falten para la carga: lee los tramos del parámetro difusion_cadencia y devuelve (minutos entre emails, emails por paso). Horas en null (envío sin fecha) = el tramo más tranquilo. Quién: funciones de la difusión; nadie por la API. Argumentos: p_horas: horas hasta la carga prevista (null = sin fecha).';

-- ---- 6. El paso de la difusión, reescrito --------------------------------------------
create or replace function fn_difusion_paso(p_difusion uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d difusiones%rowtype; e record; v_t uuid; v_oferta uuid; v_token uuid; v_para text;
        v_base text; v_fin text; d_firma text; d_email text; d_tel text;
        v_po text; v_pd text; v_h int; v_ini int; v_hfin int;
        v_cpo text; v_cpd text; v_horas numeric; v_min int; v_lote int; v_n int;
begin
  select * into d from difusiones where id = p_difusion for update;
  if d.id is null or d.estado <> 'activa' then return; end if;
  select estado, estado_asignacion, transportista_id, referencia_gx,
         poblacion_origen, poblacion_destino, codigo_postal_origen, codigo_postal_destino,
         fecha_carga_desde, fecha_carga_hasta, metros_lineales, toneladas
    into e from envios where id = d.envio_id;

  d_firma := coalesce(parametro('dynamo_razon_social') #>> '{}', 'Dynamo');
  d_email := coalesce(parametro('dynamo_email') #>> '{}', '');
  d_tel   := coalesce(parametro('dynamo_telefono') #>> '{}', '');

  -- ¿Hay que parar? El envío ya tiene transportista, o ya no está programado.
  -- (Esto se mira a CUALQUIER hora: cerrar la difusión no espera a la ventana de envío.)
  if e.transportista_id is not null or e.estado_asignacion = 'confirmada' then
    update difusiones set estado = 'aceptada', terminada_en = now(),
           fin_motivo = 'El envío ya tiene transportista: no se contacta a nadie más.'
     where id = d.id;
    return;
  end if;
  if e.estado <> 'programado' then
    update difusiones set estado = 'parada', terminada_en = now(),
           fin_motivo = format('El envío dejó de estar programado (%s).', e.estado)
     where id = d.id;
    return;
  end if;

  -- CORTE (usuario, 2026-11-15): llegadas las horas de margen antes de la carga, no sale
  -- ni un email más. Si nadie aceptó, esto ya es cosa del teléfono: aviso URGENTE.
  if d.corte_en is not null and now() >= d.corte_en then
    v_fin := format('Se llegó al corte (%s) sin aceptación.',
                    to_char(d.corte_en at time zone 'Europe/Madrid', 'DD/MM HH24:MI'));
    update difusiones set estado = 'agotada', terminada_en = now(), fin_motivo = v_fin where id = d.id;
    perform crear_aviso('dynamo', null, null, 'difusion_corte', 'urgente',
      format('Queda poco para la carga y nadie la ha aceptado · envío #%s', e.referencia_gx),
      format('%s Contactados: %s. Esto ya es de teléfono: muévelo a mano.', v_fin, d.contactados),
      '/panel/envios', d.envio_id);
    insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html, estado)
    values ('difusion_fin:' || d.id, 'difusion_fin', d.envio_id, d_email,
      format('URGENTE · carga sin transportista · envío #%s', e.referencia_gx),
      format('<p>La oferta escalonada del envío <strong>#%s</strong> ha llegado al corte sin aceptación. %s Contactados: %s. Esto ya es de teléfono.</p><p>— %s</p>',
             escapar_html(e.referencia_gx), escapar_html(v_fin), d.contactados, escapar_html(d_firma)),
      case when d_email = '' then 'error' else 'pendiente' end)
    on conflict (clave) do nothing;
    return;
  end if;

  -- Dormida hasta el arranque (días antes de la carga, parámetro): aún no se contacta.
  if d.empieza_en is not null and now() < d.empieza_en then return; end if;

  -- Ventana de envío (usuario, 2026-11-12): emails solo de 5:00 a 23:00 hora española,
  -- todos los días. Fuera de la ventana la difusión espera sin contactar a nadie.
  v_ini  := coalesce((parametro('difusion_hora_inicio'))::text::int, 5);
  v_hfin := coalesce((parametro('difusion_hora_fin'))::text::int, 23);
  v_h    := extract(hour from (now() at time zone 'Europe/Madrid'))::int;
  if not (v_h >= v_ini and v_h < v_hfin) then return; end if;

  -- Cadencia por tramos (usuario, 2026-11-15): cuanto menos falte, más seguido.
  v_horas := case when d.carga_prevista_en is null then null
                  else extract(epoch from (d.carga_prevista_en - now())) / 3600.0 end;
  select c.minutos, c.lote into v_min, v_lote from fn_difusion_cadencia(v_horas) c;
  if d.ultimo_email_en is not null and d.ultimo_email_en > now() - make_interval(mins => v_min) then return; end if;

  -- País del origen y del destino: de la primera y la última parada del envío.
  select p.pais_codigo_iso into v_po from envio_paradas p where p.envio_id = d.envio_id order by p.orden asc  limit 1;
  select p.pais_codigo_iso into v_pd from envio_paradas p where p.envio_id = d.envio_id order by p.orden desc limit 1;
  v_cpo := left(coalesce(e.codigo_postal_origen, '--'), 2);
  v_cpd := left(coalesce(e.codigo_postal_destino, '--'), 2);

  -- En el tramo urgente salen varios emails en el mismo paso (lote).
  v_n := 0;
  while v_n < v_lote loop
    v_fin := null; v_t := null;
    if d.contactados >= d.max_contactados then
      v_fin := format('Tope de %s transportistas contactados sin aceptación.', d.max_contactados);
    else
      -- El SIGUIENTE del ranking. Solo entran los activos, con email, sin oferta previa de
      -- este envío y RELACIONADOS con él: hicieron esa ruta con envíos entregados
      -- (nacional: CP 2 cifras + país en ambas puntas; internacional: entre esos dos
      -- países, ida o vuelta), o sede en la provincia del origen o del destino o en una
      -- COLINDANTE (usuario, 2026-11-15; extranjero: basta el país). Orden: hizo la ruta
      -- (dentro: favoritos → valoración → ruta más reciente) → favoritos → valoración →
      -- sede origen → colindante origen → sede destino → colindante destino → antigüedad.
      with ruta as (
        select e2.transportista_id, max(e2.entregado_en) as ultima
          from envios e2
          cross join lateral (select p.pais_codigo_iso as pais_iso, p.codigo_postal as codpostal
                                from envio_paradas p where p.envio_id = e2.id order by p.orden asc  limit 1) o2
          cross join lateral (select p.pais_codigo_iso as pais_iso, p.codigo_postal as codpostal
                                from envio_paradas p where p.envio_id = e2.id order by p.orden desc limit 1) d2
         where e2.estado = 'entregado' and e2.transportista_id is not null
           and ((v_po = v_pd
                 and o2.pais_iso = v_po and d2.pais_iso = v_pd
                 and left(coalesce(o2.codpostal, ''), 2) = v_cpo
                 and left(coalesce(d2.codpostal, ''), 2) = v_cpd)
             or (v_po <> v_pd
                 and ((o2.pais_iso = v_po and d2.pais_iso = v_pd) or (o2.pais_iso = v_pd and d2.pais_iso = v_po))))
         group by e2.transportista_id)
      select t.id into v_t
        from transportistas t
        left join ruta r on r.transportista_id = t.id
        cross join lateral (select
          (t.pais_codigo_iso = v_po
           and (v_po is distinct from 'ES' or left(coalesce(t.codigo_postal, ''), 2) = v_cpo)) as sede_o,
          (v_po = 'ES' and t.pais_codigo_iso = 'ES' and exists (
             select 1 from provincias_colindantes pc
              where pc.cp2 = left(coalesce(t.codigo_postal, ''), 2) and pc.colinda_con = v_cpo)) as colin_o,
          (t.pais_codigo_iso = v_pd
           and (v_pd is distinct from 'ES' or left(coalesce(t.codigo_postal, ''), 2) = v_cpd)) as sede_d,
          (v_pd = 'ES' and t.pais_codigo_iso = 'ES' and exists (
             select 1 from provincias_colindantes pc
              where pc.cp2 = left(coalesce(t.codigo_postal, ''), 2) and pc.colinda_con = v_cpd)) as colin_d
        ) z
       where t.estado_operativo = 'activo' and not t.borrado
         and exists (select 1 from contactos c where c.transportista_id = t.id and c.email is not null)
         and not exists (select 1 from envio_ofertas o where o.envio_id = d.envio_id and o.transportista_id = t.id)
         and (r.transportista_id is not null or z.sede_o or z.colin_o or z.sede_d or z.colin_d)
       order by (r.transportista_id is not null) desc,
                exists (select 1 from unnest(t.tags) tg where lower(trim(tg)) = 'favorito') desc,
                t.valoracion_dynamo desc nulls last,
                r.ultima desc nulls last,
                z.sede_o desc, z.colin_o desc, z.sede_d desc, z.colin_d desc,
                t.creado_en asc
       limit 1;
      if v_t is null then
        v_fin := 'No quedan transportistas activos con email que hayan hecho esa ruta o con sede en la zona del origen, del destino o colindante.';
      end if;
    end if;

    if v_fin is not null then
      update difusiones set estado = 'agotada', terminada_en = now(), fin_motivo = v_fin where id = d.id;
      -- Aviso a Dynamo: campana + email (una sola vez por difusión). Mientras siga libre,
      -- el recordatorio diario sigue trabajando a los ya contactados hasta el corte.
      perform crear_aviso('dynamo', null, null, 'difusion_agotada', 'aviso',
        format('Oferta escalonada sin aceptación · envío #%s', e.referencia_gx),
        format('%s Contactados: %s. El recordatorio diario sigue hasta el corte; muévelo a mano si corre prisa.', v_fin, d.contactados),
        '/panel/envios', d.envio_id);
      insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html, estado)
      values ('difusion_fin:' || d.id, 'difusion_fin', d.envio_id, d_email,
        format('Oferta escalonada sin aceptación · envío #%s', e.referencia_gx),
        format('<p>La oferta escalonada del envío <strong>#%s</strong> ha terminado sin aceptación. %s Contactados: %s.</p><p>— %s</p>',
               escapar_html(e.referencia_gx), escapar_html(v_fin), d.contactados, escapar_html(d_firma)),
        case when d_email = '' then 'error' else 'pendiente' end)
      on conflict (clave) do nothing;
      return;
    end if;

    -- La oferta de verdad (canal email), como las de siempre: con su token y su caducidad.
    v_oferta := ofertar_envio(d.envio_id, v_t, 'email', d.precio, d.banda_pct, d.pronto_pago);
    select token into v_token from envio_ofertas where id = v_oferta;
    select c.email into v_para from contactos c
     where c.transportista_id = v_t and c.email is not null
     order by (c.funcion = 'trafico') desc, c.es_principal desc, c.creado_en limit 1;
    v_base := coalesce(parametro('url_plataforma') #>> '{}', 'https://www.dynamotrans.com');

    insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html, estado, error)
    values ('difusion:' || d.envio_id || ':' || v_t, 'difusion', d.envio_id, coalesce(v_para, '—'),
      format('Carga disponible · %s → %s · %s €', coalesce(e.poblacion_origen, '—'), coalesce(e.poblacion_destino, '—'), trim(to_char(d.precio, 'FM999G999G990D00'))),
      format('<p>Hola,</p><p>Tenemos una carga que te puede encajar:</p>'
          || '<p><strong>%s → %s</strong><br>Carga: <strong>%s</strong><br>%s · %s t<br>Precio: <strong>%s € + IVA</strong>%s</p>'
          || '<p><a href="%s/carga/%s"><strong>Ver la carga y aceptarla aquí</strong></a> (sin registro). El primero que acepta se la lleva.</p>'
          || '<p>Dudas: %s · %s</p><p>— %s</p>',
        escapar_html(coalesce(e.poblacion_origen, '—')), escapar_html(coalesce(e.poblacion_destino, '—')),
        case when e.fecha_carga_hasta is not null and e.fecha_carga_hasta <> e.fecha_carga_desde
             then format('del %s al %s', to_char(e.fecha_carga_desde, 'DD/MM'), to_char(e.fecha_carga_hasta, 'DD/MM'))
             else to_char(e.fecha_carga_desde, 'DD/MM/YYYY') end,
        coalesce(trim(to_char(e.metros_lineales, 'FM990D00')) || ' m', '—'),
        coalesce(trim(to_char(e.toneladas, 'FM990D00')), '—'),
        trim(to_char(d.precio, 'FM999G999G990D00')),
        case when d.pronto_pago then ' · pronto pago disponible' else '' end,
        v_base, v_token, escapar_html(d_tel), escapar_html(d_email), escapar_html(d_firma)),
      case when v_para is null then 'error' else 'pendiente' end,
      case when v_para is null then 'El transportista no tiene ningún contacto con email: oferta creada, avisar a mano.' end)
    on conflict (clave) do nothing;

    update difusiones set contactados = contactados + 1, ultimo_email_en = now() where id = d.id;
    d.contactados := d.contactados + 1;
    v_n := v_n + 1;
  end loop;
end $$;
revoke execute on function fn_difusion_paso(uuid) from public, anon, authenticated;
comment on function public.fn_difusion_paso(uuid) is '[Gestión interna] Un paso de la oferta escalonada: si toca parar (transportista asignado, envío no programado, corte alcanzado, tope o sin candidatos) cierra la difusión y avisa a Dynamo (al corte, aviso urgente); dormida antes del arranque o fuera de la ventana de envío (5:00-23:00 española) espera; si no, según el tramo de cadencia manda 1 o más emails al siguiente del ranking (hizo la ruta → favoritos → valoración → sede o provincia colindante del origen o del destino → antigüedad) con el enlace público de aceptar carga. Quién: procesar_difusiones e iniciar_difusion; nadie por la API. Argumentos: p_difusion: difusiones.id.';

-- ---- 7. Recordatorio diario «la carga sigue disponible» ------------------------------
create or replace function fn_difusion_recordatorios()
returns void language plpgsql security definer set search_path = public as $$
declare d record; e record; o record; v_h int; v_rec int; v_hfin int; v_hoy date;
        v_para text; v_base text; d_firma text; d_tel text; d_mail text;
begin
  v_rec  := coalesce((parametro('difusion_recordatorio_hora'))::text::int, 9);
  v_hfin := coalesce((parametro('difusion_hora_fin'))::text::int, 23);
  v_h    := extract(hour from (now() at time zone 'Europe/Madrid'))::int;
  if not (v_h >= v_rec and v_h < v_hfin) then return; end if;
  v_hoy  := (now() at time zone 'Europe/Madrid')::date;
  v_base := coalesce(parametro('url_plataforma') #>> '{}', 'https://www.dynamotrans.com');
  d_firma := coalesce(parametro('dynamo_razon_social') #>> '{}', 'Dynamo');
  d_mail  := coalesce(parametro('dynamo_email') #>> '{}', '');
  d_tel   := coalesce(parametro('dynamo_telefono') #>> '{}', '');

  for d in select * from difusiones
            where estado in ('activa', 'agotada') and contactados > 0
              and (ultimo_recordatorio is null or ultimo_recordatorio < v_hoy)
              and (corte_en is null or now() < corte_en)
              and (empieza_en is null or now() >= empieza_en)
            order by creado_en
  loop
    begin
      select estado, estado_asignacion, transportista_id, referencia_gx,
             poblacion_origen, poblacion_destino, fecha_carga_desde, fecha_carga_hasta
        into e from envios where id = d.envio_id;
      -- Asignado o fuera de programado: nada que recordar (la difusión activa la cerrará
      -- su propio paso; la agotada se queda como está).
      if e.transportista_id is not null or e.estado_asignacion = 'confirmada' or e.estado <> 'programado' then
        update difusiones set ultimo_recordatorio = v_hoy where id = d.id;
        continue;
      end if;
      -- Reabrir hasta el corte las ofertas de email que caducarían antes (usuario,
      -- 2026-11-15): el mismo enlace del primer email sigue valiendo todos los días.
      if d.corte_en is not null then
        update envio_ofertas set caduca_en = d.corte_en
         where envio_id = d.envio_id and canal = 'email' and estado = 'activa' and caduca_en < d.corte_en;
      end if;
      -- Un recordatorio al día a cada contactado de días anteriores con la oferta viva
      -- (quien aceptó, perdió o se le revocó, no; quien se contactó hoy, tampoco).
      for o in select o2.token, o2.transportista_id, o2.precio_ofertado
                 from envio_ofertas o2
                where o2.envio_id = d.envio_id and o2.canal = 'email' and o2.estado = 'activa'
                  and o2.caduca_en > now()
                  and (o2.enviada_en at time zone 'Europe/Madrid')::date < v_hoy
      loop
        select c.email into v_para from contactos c
         where c.transportista_id = o.transportista_id and c.email is not null
         order by (c.funcion = 'trafico') desc, c.es_principal desc, c.creado_en limit 1;
        if v_para is null then continue; end if;
        insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
        values ('difusion_rec:' || d.envio_id || ':' || o.transportista_id || ':' || to_char(v_hoy, 'YYYYMMDD'),
          'difusion_recordatorio', d.envio_id, v_para,
          format('Sigue disponible · %s → %s · %s €', coalesce(e.poblacion_origen, '—'), coalesce(e.poblacion_destino, '—'), trim(to_char(o.precio_ofertado, 'FM999G999G990D00'))),
          format('<p>Hola,</p><p>La carga <strong>%s → %s</strong> (%s) que te ofrecimos <strong>sigue disponible</strong> a <strong>%s € + IVA</strong>.</p>'
              || '<p><a href="%s/carga/%s"><strong>Ver la carga y aceptarla aquí</strong></a> (sin registro). El primero que acepta se la lleva.</p>'
              || '<p>Dudas: %s · %s</p><p>— %s</p>',
            escapar_html(coalesce(e.poblacion_origen, '—')), escapar_html(coalesce(e.poblacion_destino, '—')),
            case when e.fecha_carga_hasta is not null and e.fecha_carga_hasta <> e.fecha_carga_desde
                 then format('del %s al %s', to_char(e.fecha_carga_desde, 'DD/MM'), to_char(e.fecha_carga_hasta, 'DD/MM'))
                 else coalesce(to_char(e.fecha_carga_desde, 'DD/MM/YYYY'), 'fecha por confirmar') end,
            trim(to_char(o.precio_ofertado, 'FM999G999G990D00')),
            v_base, o.token, escapar_html(d_tel), escapar_html(d_mail), escapar_html(d_firma)))
        on conflict (clave) do nothing;
      end loop;
      update difusiones set ultimo_recordatorio = v_hoy where id = d.id;
    exception when others then null;   -- una difusión rota no para a las demás
    end;
  end loop;
end $$;
revoke execute on function fn_difusion_recordatorios() from public, anon, authenticated;
comment on function public.fn_difusion_recordatorios() is '[Gestión interna] Recordatorio diario de la oferta escalonada: desde la hora del parámetro, a cada transportista contactado en días anteriores cuya oferta sigue viva (reabriendo su caducidad hasta el corte) se le manda «la carga sigue disponible» con su mismo enlace, una vez al día, mientras el envío siga libre y no se haya llegado al corte. Quién: procesar_difusiones; nadie por la API. Argumentos: ninguno.';

-- ---- 8. La pasada del reloj: paso + recordatorios ------------------------------------
create or replace function procesar_difusiones()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not (es_servidor() or es_equipo_dynamo()) then
    raise exception 'Solo el servidor procesa las difusiones.' using errcode = '42501';
  end if;
  -- El ritmo lo decide cada paso (cadencia por tramos): aquí solo se evita machacar una
  -- difusión que acaba de mandar en este mismo minuto.
  for r in select id from difusiones
            where estado = 'activa'
              and (ultimo_email_en is null or ultimo_email_en <= now() - interval '1 minute')
            order by creado_en
  loop
    begin
      perform fn_difusion_paso(r.id);
    exception when others then null;   -- una difusión rota no para a las demás
    end;
  end loop;
  begin
    perform fn_difusion_recordatorios();
  exception when others then null;
  end;
  -- Y se manda lo encolado sin esperar al cron de los 10 minutos (sin pg_net, no-op).
  begin
    perform enviar_emails_pendientes();
  exception when others then null;
  end;
end $$;
revoke execute on function procesar_difusiones() from public, anon, authenticated;
comment on function public.procesar_difusiones() is '[Gestión interna] La pasada de la oferta escalonada: para cada difusión activa da un paso (fn_difusion_paso, que aplica arranque, cadencia por tramos y corte), después manda los recordatorios diarios y por último la cola de emails. La llama pg_cron cada minuto. Quién: la tarea programada; nadie por la API. Argumentos: ninguno.';

-- ---- 9. Lanzar la difusión con hora de carga y corte ---------------------------------
drop function if exists iniciar_difusion(uuid, numeric, smallint, boolean);
create or replace function iniciar_difusion(p_envio uuid, p_precio numeric, p_banda_pct smallint default 10,
                                            p_pronto_pago boolean default true, p_hora_carga time default null,
                                            p_forzar boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e record; v_id uuid; v_dias int; v_hcorte int; v_hdef int; v_ini int;
        v_carga timestamptz; v_corte timestamptz; v_empieza timestamptz; v_min int; v_lote int;
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    raise exception 'Solo Dynamo lanza ofertas escalonadas.' using errcode = '42501';
  end if;
  select estado, estado_asignacion, transportista_id, fecha_carga_desde into e from envios where id = p_envio for update;
  if e.estado is null then return jsonb_build_object('resultado', 'no_existe'); end if;
  if e.estado <> 'programado' then return jsonb_build_object('resultado', 'no_programado', 'estado', e.estado); end if;
  if e.transportista_id is not null or e.estado_asignacion = 'confirmada' then
    return jsonb_build_object('resultado', 'ya_asignado');
  end if;
  if coalesce(p_precio, 0) <= 0 then return jsonb_build_object('resultado', 'precio_no_valido'); end if;
  if exists (select 1 from difusiones where envio_id = p_envio and estado = 'activa') then
    return jsonb_build_object('resultado', 'ya_activa');
  end if;

  v_dias   := greatest(0, coalesce((parametro('difusion_dias_antes'))::text::int, 5));
  v_hcorte := greatest(0, coalesce((parametro('difusion_horas_corte'))::text::int, 3));
  v_hdef   := least(23, greatest(0, coalesce((parametro('difusion_hora_carga_defecto'))::text::int, 8)));
  v_ini    := least(23, greatest(0, coalesce((parametro('difusion_hora_inicio'))::text::int, 5)));
  if e.fecha_carga_desde is not null then
    v_carga   := (e.fecha_carga_desde + coalesce(p_hora_carga, make_time(v_hdef, 0, 0))) at time zone 'Europe/Madrid';
    v_corte   := v_carga - make_interval(hours => v_hcorte);
    v_empieza := greatest(now(), ((e.fecha_carga_desde - v_dias) + make_time(v_ini, 0, 0)) at time zone 'Europe/Madrid');
    -- Dentro del corte no se lanza (usuario, 2026-11-15: eso ya es de teléfono), salvo
    -- que Dynamo la fuerce a sabiendas: entonces corre 1 hora más y corta.
    if now() >= v_corte then
      if not p_forzar then
        return jsonb_build_object('resultado', 'dentro_del_corte',
          'carga_prevista', to_char(v_carga at time zone 'Europe/Madrid', 'DD/MM HH24:MI'),
          'horas_corte', v_hcorte);
      end if;
      v_corte := now() + interval '1 hour';
      if v_carga <= now() then v_carga := v_corte; end if;
    end if;
  end if;

  select c.minutos, c.lote into v_min, v_lote from fn_difusion_cadencia(
    case when v_carga is null then null else extract(epoch from (v_carga - now())) / 3600.0 end) c;

  insert into difusiones (envio_id, precio, banda_pct, pronto_pago, minutos_entre_emails, max_contactados,
                          empieza_en, carga_prevista_en, corte_en, creado_por)
  values (p_envio, p_precio, coalesce(p_banda_pct, 10), coalesce(p_pronto_pago, true),
          v_min,
          greatest(1, coalesce((parametro('difusion_max_contactados'))::text::int, 60)),
          v_empieza, v_carga, v_corte, auth.uid())
  returning id into v_id;
  -- El primer email sale al momento (si el arranque ya llegó y la ventana está abierta).
  perform fn_difusion_paso(v_id);
  begin
    perform enviar_emails_pendientes();
  exception when others then null;
  end;
  return jsonb_build_object('resultado', 'ok', 'difusion', v_id,
    'empieza', case when v_empieza is null or v_empieza <= now() then null
                    else to_char(v_empieza at time zone 'Europe/Madrid', 'DD/MM HH24:MI') end,
    'corte', case when v_corte is null then null
                  else to_char(v_corte at time zone 'Europe/Madrid', 'DD/MM HH24:MI') end);
end $$;
revoke all on function iniciar_difusion(uuid, numeric, smallint, boolean, time, boolean) from public, anon, authenticated, service_role;
grant execute on function iniciar_difusion(uuid, numeric, smallint, boolean, time, boolean) to authenticated, service_role;
comment on function public.iniciar_difusion(uuid, numeric, smallint, boolean, time, boolean) is '[Envíos] Lanza la oferta escalonada de un envío programado y sin transportista, gobernada por la fecha de carga: duerme hasta N días antes (parámetro), manda emails por tramos de cadencia (más seguido cuanto menos falte) solo de 5:00 a 23:00 española, al ranking (hizo la ruta → favoritos → valoración → sede o provincia colindante del origen o del destino → antigüedad), recuerda a diario a los contactados y corta X horas antes de la hora de carga (la dada, o las 8:00) con aviso urgente si nadie aceptó. Dentro del corte no se lanza salvo forzarla (1 hora de margen). Quién: Dynamo (admin). Argumentos: p_envio: envios.id · p_precio: euros sin IVA ofertados · p_banda_pct: banda de negociación en % (opcional) · p_pronto_pago: con pronto pago (opcional) · p_hora_carga: hora prevista de la carga (opcional) · p_forzar: lanzarla aun dentro del corte (opcional).';
