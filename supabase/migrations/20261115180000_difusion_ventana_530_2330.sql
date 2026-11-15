-- VENTANA DE ENVÍO 5:30-23:30, LOS 365 DÍAS (usuario, 2026-11-15, 8.ª pasada): los
-- emails de la oferta escalonada salen de lunes a domingo, también festivos, de 5:30 a
-- 23:30 hora española. Los parámetros difusion_hora_inicio y difusion_hora_fin admiten
-- ahora MEDIAS HORAS con decimales (5.5 = 5:30 · 23.5 = 23:30) y pasan a esos valores.
-- Nunca hubo filtro de día de la semana ni de festivos, y así se queda: la única barrera
-- es la franja horaria. Se redefinen las tres funciones que la miran.

update parametros set valor = '5.5'::jsonb,
  descripcion = 'Oferta escalonada: hora española desde la que se mandan emails, con decimales para medias horas (5.5 = 5:30). Antes de esa hora la difusión espera sin contactar a nadie. Todos los días del año, festivos incluidos.'
 where clave = 'difusion_hora_inicio';
update parametros set valor = '23.5'::jsonb,
  descripcion = 'Oferta escalonada: hora española hasta la que se mandan emails (sin incluirla), con decimales para medias horas (23.5 = 23:30). Después, la difusión espera al día siguiente. Todos los días del año, festivos incluidos.'
 where clave = 'difusion_hora_fin';

create or replace function fn_difusion_paso(p_difusion uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d difusiones%rowtype; e record; v_t uuid; v_oferta uuid; v_token uuid; v_para text;
        v_base text; v_fin text; d_firma text; d_email text; d_tel text;
        v_po text; v_pd text; v_ini_n numeric; v_fin_n numeric; v_ahora numeric;
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

  -- Ventana de envío (usuario, 2026-11-15): emails de 5:30 a 23:30 hora española, los
  -- 365 días del año, festivos incluidos (los parámetros admiten medias horas: 5.5 =
  -- 5:30). Fuera de la ventana la difusión espera sin contactar a nadie.
  v_ini_n := coalesce((parametro('difusion_hora_inicio'))::text::numeric, 5.5);
  v_fin_n := coalesce((parametro('difusion_hora_fin'))::text::numeric, 23.5);
  v_ahora := extract(hour from (now() at time zone 'Europe/Madrid'))::numeric
           + extract(minute from (now() at time zone 'Europe/Madrid'))::numeric / 60;
  if not (v_ahora >= v_ini_n and v_ahora < v_fin_n) then return; end if;

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
      -- COLINDANTE (también del país vecino: Girona↔66 FR, Huelva↔Algarve PT), o hizo
      -- una ruta PARECIDA entre provincias colindantes de las dos puntas (sede en los
      -- demás países: basta el país). Orden A PROBABILIDAD PURA (usuario, 2026-11-15):
      -- AUTÓNOMO (DNI o NIE: la flota grande es la competencia, el autónomo no) → hizo
      -- ESA ruta (la más reciente primero) → hizo una ruta PARECIDA → sede en CUALQUIERA
      -- de las dos puntas (sale de su base o retorna a ella) → provincia colindante de
      -- cualquiera → favorito → valoración → antigüedad. La calidad solo desempata: lo
      -- que predice que acepte es lo que ha hecho y dónde está.
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
         group by e2.transportista_id),
      -- Ruta PARECIDA: entregó envíos cuyo origen cae en la provincia del origen o una
      -- colindante Y cuyo destino en la del destino o una colindante — también entre
      -- países (un Perpiñán → Faro cuenta para un Girona → Huelva).
      parecida as (
        select e2.transportista_id
          from envios e2
          cross join lateral (select p.pais_codigo_iso as pais_iso, p.codigo_postal as codpostal
                                from envio_paradas p where p.envio_id = e2.id order by p.orden asc  limit 1) o2
          cross join lateral (select p.pais_codigo_iso as pais_iso, p.codigo_postal as codpostal
                                from envio_paradas p where p.envio_id = e2.id order by p.orden desc limit 1) d2
         where e2.estado = 'entregado' and e2.transportista_id is not null
           and ((o2.pais_iso = v_po and left(coalesce(o2.codpostal, ''), 2) = v_cpo) or exists (
                  select 1 from provincias_colindantes pc
                   where pc.pais_codigo_iso = o2.pais_iso and pc.cp2 = left(coalesce(o2.codpostal, ''), 2)
                     and pc.pais_colindante = v_po and pc.colinda_con = v_cpo))
           and ((d2.pais_iso = v_pd and left(coalesce(d2.codpostal, ''), 2) = v_cpd) or exists (
                  select 1 from provincias_colindantes pc
                   where pc.pais_codigo_iso = d2.pais_iso and pc.cp2 = left(coalesce(d2.codpostal, ''), 2)
                     and pc.pais_colindante = v_pd and pc.colinda_con = v_cpd))
         group by e2.transportista_id)
      select t.id into v_t
        from transportistas t
        left join ruta r on r.transportista_id = t.id
        left join parecida pa on pa.transportista_id = t.id
        cross join lateral (select
          (t.pais_codigo_iso = v_po
           and (v_po is distinct from 'ES' or left(coalesce(t.codigo_postal, ''), 2) = v_cpo)) as sede_o,
          exists (
             select 1 from provincias_colindantes pc
              where pc.pais_codigo_iso = t.pais_codigo_iso and pc.cp2 = left(coalesce(t.codigo_postal, ''), 2)
                and pc.pais_colindante = v_po and pc.colinda_con = v_cpo) as colin_o,
          (t.pais_codigo_iso = v_pd
           and (v_pd is distinct from 'ES' or left(coalesce(t.codigo_postal, ''), 2) = v_cpd)) as sede_d,
          exists (
             select 1 from provincias_colindantes pc
              where pc.pais_codigo_iso = t.pais_codigo_iso and pc.cp2 = left(coalesce(t.codigo_postal, ''), 2)
                and pc.pais_colindante = v_pd and pc.colinda_con = v_cpd) as colin_d
        ) z
       where t.estado_operativo = 'activo' and not t.borrado
         and exists (select 1 from contactos c where c.transportista_id = t.id and c.email is not null)
         and not exists (select 1 from envio_ofertas o where o.envio_id = d.envio_id and o.transportista_id = t.id)
         and (r.transportista_id is not null or pa.transportista_id is not null
              or z.sede_o or z.colin_o or z.sede_d or z.colin_d)
       order by (t.pais_codigo_iso = 'ES' and upper(coalesce(t.cif, '')) ~ '^([0-9]{8}|[XYZ][0-9]{7})[A-Z]$') desc,
                (r.transportista_id is not null) desc,
                r.ultima desc nulls last,
                (pa.transportista_id is not null) desc,
                (z.sede_o or z.sede_d) desc, (z.colin_o or z.colin_d) desc,
                exists (select 1 from unnest(t.tags) tg where lower(trim(tg)) = 'favorito') desc,
                t.valoracion_dynamo desc nulls last,
                t.creado_en asc
       limit 1;
      if v_t is null then
        v_fin := 'No quedan transportistas activos con email que hayan hecho esa ruta (o una parecida entre provincias colindantes) o con sede en la zona del origen, del destino o colindante.';
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
comment on function public.fn_difusion_paso(uuid) is '[Gestión interna] Un paso de la oferta escalonada: si toca parar (transportista asignado, envío no programado, corte alcanzado, tope o sin candidatos) cierra la difusión y avisa a Dynamo (al corte, aviso urgente); dormida antes del arranque o fuera de la ventana de envío (5:30-23:30 española, los 365 días) espera; si no, según el tramo de cadencia manda 1 o más emails al siguiente del ranking a probabilidad pura (autónomos con DNI/NIE primero → hizo esa ruta, la más reciente primero → hizo una ruta parecida entre provincias colindantes de las dos puntas → sede en la provincia del origen o del destino, indistinto → provincia colindante de cualquiera de las dos, también del país vecino (Francia y Portugal) → favorito → valoración → antigüedad) con el enlace público de aceptar carga. Quién: procesar_difusiones e iniciar_difusion; nadie por la API. Argumentos: p_difusion: difusiones.id.';

create or replace function fn_difusion_recordatorios()
returns void language plpgsql security definer set search_path = public as $$
declare d record; e record; o record; v_rec numeric; v_fin_n numeric; v_ahora numeric; v_hoy date;
        v_para text; v_base text; d_firma text; d_tel text; d_mail text;
begin
  v_rec   := coalesce((parametro('difusion_recordatorio_hora'))::text::numeric, 9);
  v_fin_n := coalesce((parametro('difusion_hora_fin'))::text::numeric, 23.5);
  v_ahora := extract(hour from (now() at time zone 'Europe/Madrid'))::numeric
           + extract(minute from (now() at time zone 'Europe/Madrid'))::numeric / 60;
  if not (v_ahora >= v_rec and v_ahora < v_fin_n) then return; end if;
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

-- ---- 9. Lanzar la difusión con hora de carga y corte ---------------------------------
drop function if exists iniciar_difusion(uuid, numeric, smallint, boolean);
create or replace function iniciar_difusion(p_envio uuid, p_precio numeric, p_banda_pct smallint default 10,
                                            p_pronto_pago boolean default true, p_hora_carga time default null,
                                            p_forzar boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e record; v_id uuid; v_dias int; v_hcorte int; v_hdef int; v_ini_min int;
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
  v_ini_min := least(1439, greatest(0, round(coalesce((parametro('difusion_hora_inicio'))::text::numeric, 5.5) * 60)))::int;
  if e.fecha_carga_desde is not null then
    v_carga   := (e.fecha_carga_desde + coalesce(p_hora_carga, make_time(v_hdef, 0, 0))) at time zone 'Europe/Madrid';
    v_corte   := v_carga - make_interval(hours => v_hcorte);
    v_empieza := greatest(now(), ((e.fecha_carga_desde - v_dias) + make_time(v_ini_min / 60, v_ini_min % 60, 0)) at time zone 'Europe/Madrid');
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
comment on function public.iniciar_difusion(uuid, numeric, smallint, boolean, time, boolean) is '[Envíos] Lanza la oferta escalonada de un envío programado y sin transportista, gobernada por la fecha de carga: duerme hasta N días antes (parámetro), manda emails por tramos de cadencia (más seguido cuanto menos falte) de 5:30 a 23:30 española, los 365 días, al ranking (hizo la ruta → favoritos → valoración → sede o provincia colindante del origen o del destino → antigüedad), recuerda a diario a los contactados y corta X horas antes de la hora de carga (la dada, o las 8:00) con aviso urgente si nadie aceptó. Dentro del corte no se lanza salvo forzarla (1 hora de margen). Quién: Dynamo (admin). Argumentos: p_envio: envios.id · p_precio: euros sin IVA ofertados · p_banda_pct: banda de negociación en % (opcional) · p_pronto_pago: con pronto pago (opcional) · p_hora_carga: hora prevista de la carga (opcional) · p_forzar: lanzarla aun dentro del corte (opcional).';
