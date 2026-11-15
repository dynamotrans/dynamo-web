-- AUTÓNOMOS PRIMERO en la oferta escalonada (usuario, 2026-11-15, 4.ª pasada): antes de
-- cualquier otro criterio, la carga se ofrece a los transportistas AUTÓNOMOS — los que
-- se identifican con DNI (8 cifras + letra) o NIE (X/Y/Z + 7 cifras + letra) en vez de
-- un CIF de sociedad. Un autónomo de provincia colindante va ANTES que una empresa que
-- hizo la ruta exacta: la flota grande es la competencia directa de Dynamo; el autónomo,
-- no. Se detecta por el formato del identificador fiscal (solo españoles: un NIF
-- extranjero no distingue persona de empresa por el formato). El resto del orden no
-- cambia, y quién ENTRA en la difusión tampoco: ser autónomo sube el turno, no abre la
-- puerta. Orden completo: autónomo → hizo ESA ruta → favoritos → valoración → sede en
-- cualquiera de las dos puntas → provincia colindante → ruta parecida → antigüedad.


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
      -- COLINDANTE, o hizo una ruta PARECIDA (entre provincias colindantes de las dos
      -- puntas) (usuario, 2026-11-15; extranjero: basta el país). Orden: AUTÓNOMO (DNI o
      -- NIE español en vez de CIF de sociedad: la flota grande es la competencia, el
      -- autónomo no) → hizo ESA ruta (dentro: favoritos → valoración → ruta más
      -- reciente) → favoritos → valoración → sede en CUALQUIERA de las dos puntas (da
      -- igual origen que destino: sale de su base o retorna a ella) → provincia
      -- colindante de cualquiera → hizo una ruta parecida → antigüedad.
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
      -- Ruta PARECIDA (solo nacional): entregó envíos cuyo origen cae en la provincia del
      -- origen o una colindante Y cuyo destino en la del destino o una colindante.
      parecida as (
        select e2.transportista_id
          from envios e2
          cross join lateral (select p.pais_codigo_iso as pais_iso, p.codigo_postal as codpostal
                                from envio_paradas p where p.envio_id = e2.id order by p.orden asc  limit 1) o2
          cross join lateral (select p.pais_codigo_iso as pais_iso, p.codigo_postal as codpostal
                                from envio_paradas p where p.envio_id = e2.id order by p.orden desc limit 1) d2
         where v_po = 'ES' and v_pd = 'ES'
           and e2.estado = 'entregado' and e2.transportista_id is not null
           and o2.pais_iso = 'ES' and d2.pais_iso = 'ES'
           and (left(coalesce(o2.codpostal, ''), 2) = v_cpo or exists (
                  select 1 from provincias_colindantes pc
                   where pc.cp2 = left(coalesce(o2.codpostal, ''), 2) and pc.colinda_con = v_cpo))
           and (left(coalesce(d2.codpostal, ''), 2) = v_cpd or exists (
                  select 1 from provincias_colindantes pc
                   where pc.cp2 = left(coalesce(d2.codpostal, ''), 2) and pc.colinda_con = v_cpd))
         group by e2.transportista_id)
      select t.id into v_t
        from transportistas t
        left join ruta r on r.transportista_id = t.id
        left join parecida pa on pa.transportista_id = t.id
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
         and (r.transportista_id is not null or pa.transportista_id is not null
              or z.sede_o or z.colin_o or z.sede_d or z.colin_d)
       order by (t.pais_codigo_iso = 'ES' and upper(coalesce(t.cif, '')) ~ '^([0-9]{8}|[XYZ][0-9]{7})[A-Z]$') desc,
                (r.transportista_id is not null) desc,
                exists (select 1 from unnest(t.tags) tg where lower(trim(tg)) = 'favorito') desc,
                t.valoracion_dynamo desc nulls last,
                r.ultima desc nulls last,
                (z.sede_o or z.sede_d) desc, (z.colin_o or z.colin_d) desc,
                (pa.transportista_id is not null) desc,
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
comment on function public.fn_difusion_paso(uuid) is '[Gestión interna] Un paso de la oferta escalonada: si toca parar (transportista asignado, envío no programado, corte alcanzado, tope o sin candidatos) cierra la difusión y avisa a Dynamo (al corte, aviso urgente); dormida antes del arranque o fuera de la ventana de envío (5:00-23:00 española) espera; si no, según el tramo de cadencia manda 1 o más emails al siguiente del ranking (autónomos con DNI/NIE primero → hizo esa ruta → favoritos → valoración → sede en la provincia del origen o del destino, indistinto → provincia colindante de cualquiera de las dos → hizo una ruta parecida entre provincias colindantes de las dos puntas → antigüedad) con el enlace público de aceptar carga. Quién: procesar_difusiones e iniciar_difusion; nadie por la API. Argumentos: p_difusion: difusiones.id.';
