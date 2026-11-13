-- =====================================================================================
-- LOS AVISOS A LOS SITIOS SALEN TAMBIÉN CON DISCRECIÓN COMERCIAL (usuario, 2026-11-13)
-- =====================================================================================
-- El aviso en sí no revela la ruta: al sitio solo se le dice que se recogerá o se
-- entregará mercancía EN SU DIRECCIÓN, nunca de dónde viene ni a dónde va. Lo único
-- que podía delatar una relación comercial era el «de parte de <cliente>». Por tanto:
--   · SIN discreción: igual que hasta ahora, «de parte de <cliente>».
--   · CON discreción: el aviso SE MANDA IGUAL, pero sin nombrar al cliente en el
--     asunto ni en el cuerpo (tampoco en la anulación): solo «Somos Dynamo…».
-- Sustituye el filtro de 20261113230000 que directamente no avisaba con discreción.

-- ---- 1. El texto admite el modo discreto (cambia la firma: se quita la vieja) --------
drop function if exists public.texto_aviso_parada(boolean, text, text, text, text, text, date, text, text, text);
create function public.texto_aviso_parada(
  p_recogida boolean, p_cliente text, p_sitio text, p_direccion text, p_codpostal text,
  p_poblacion_sitio text, p_fecha date, p_mat_camion text, p_mat_remolque text, p_conductor text,
  p_discreto boolean default false)
returns text language sql stable set search_path = public as $$
  select format('<p>Hola,</p>'
    || '<p>Somos <strong>Dynamo</strong>, operador de transporte. %s en vuestras instalaciones:</p>'
    || '<p><strong>%s</strong>%s</p>'
    || '<p>%s prevista: <strong>%s</strong>.%s</p>'
    || '<p>Os lo adelantamos para que podáis organizar la %s. Si ese día hay algún impedimento (horario, acceso, cita previa), respondednos a este email o llamadnos y lo cuadramos.</p>'
    || '<p>— %s · %s · %s</p>',
    case when p_discreto then '' else format('De parte de <strong>%s</strong>, ', escapar_html(p_cliente)) end
      || case when p_recogida then 'pasaremos a <strong>recoger mercancía</strong>' else 'os <strong>entregaremos mercancía</strong>' end,
    escapar_html(p_sitio),
    case when coalesce(p_direccion, '') <> '' or coalesce(p_poblacion_sitio, '') <> ''
         then '<br>' || escapar_html(trim(both ', ' from coalesce(p_direccion, '') || ', ' || trim(coalesce(p_codpostal, '') || ' ' || coalesce(p_poblacion_sitio, '')))) else '' end,
    case when p_recogida then 'Recogida' else 'Entrega' end,
    to_char(p_fecha, 'DD/MM/YYYY'),
    case when p_mat_camion is not null
         then format(' Camión: matrícula <strong>%s</strong>%s%s.', escapar_html(p_mat_camion),
                     case when p_mat_remolque is not null then ' · remolque ' || escapar_html(p_mat_remolque) else '' end,
                     case when p_conductor is not null then ' · conductor ' || escapar_html(p_conductor) else '' end)
         else ' Os adelantaremos la matrícula del camión en cuanto esté anotada.' end,
    case when p_recogida then 'carga' else 'descarga' end,
    escapar_html(coalesce(parametro('dynamo_razon_social') #>> '{}', '')),
    escapar_html(coalesce(parametro('dynamo_email') #>> '{}', '')),
    escapar_html(coalesce(parametro('dynamo_telefono') #>> '{}', '')))
$$;
revoke execute on function public.texto_aviso_parada(boolean, text, text, text, text, text, date, text, text, text, boolean) from public, anon, authenticated;
comment on function public.texto_aviso_parada(boolean, text, text, text, text, text, date, text, text, text, boolean) is '[Gestión interna] Monta el HTML del aviso de recogida o entrega a un sitio de la ruta: en qué dirección, qué día y con qué camión (o que la matrícula se adelantará); «de parte de <cliente>» salvo en modo discreto (discreción comercial), que no nombra al cliente. Solo texto operativo más el pie de Dynamo. Quién: funciones internas. Argumentos: p_recogida: true recogida, false entrega · p_cliente, p_sitio, p_direccion, p_codpostal, p_poblacion_sitio: textos · p_fecha: día previsto · p_mat_camion, p_mat_remolque, p_conductor: del envío, opcionales · p_discreto: true = sin nombrar al cliente.';

-- ---- 2. Encolar: la discreción ya no filtra, cambia el texto -------------------------
create or replace function public.encolar_avisos_paradas()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0; v_cnt int; r record; v_tramo text; v_rec boolean; v_asunto text;
  hoy date := (now() at time zone 'Europe/Madrid')::date;
  ahora time := (now() at time zone 'Europe/Madrid')::time;
  h_ini int := greatest(0, least(23, parametro_num('aviso_parada_ventana_inicio', 10)::int));
  h_fin int := greatest(0, least(24, parametro_num('aviso_parada_ventana_fin', 16)::int));
  h_dia int := greatest(0, least(23, parametro_num('aviso_parada_hora_mismo_dia', 8)::int));
  en_ventana boolean;
begin
  en_ventana := ahora >= make_time(h_ini, 0, 0) and (h_fin >= 24 or ahora < make_time(h_fin, 0, 0));
  for r in
    select e.id as envio, e.referencia_gx, e.matricula_camion, e.matricula_remolque, e.conductor_nombre,
           coalesce(e.discrecion_comercial, false) as discreto,
           c.razon_social as cliente,
           p.id as parada, p.tipo as tipo_parada, p.nombre_empresa, p.direccion, p.codigo_postal, p.poblacion,
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
                 else e.fecha_entrega_estimada end) between hoy and hoy + 2
  loop
    -- Qué tramo toca AHORA: mismo día desde su hora; 1 y 2 días antes solo en la ventana.
    v_tramo := case when r.fecha_obj = hoy and ahora >= make_time(h_dia, 0, 0) then 'd0'
                    when r.fecha_obj = hoy + 1 and en_ventana then 'd1'
                    when r.fecha_obj = hoy + 2 and en_ventana then 'd2' end;
    continue when v_tramo is null;
    v_rec := r.tipo_parada = 'carga';
    v_asunto := format('%s prevista el %s%s · Dynamo',
                       case when v_rec then 'Recogida' else 'Entrega' end,
                       to_char(r.fecha_obj, 'DD/MM/YYYY'),
                       case when r.discreto then '' else ' · de parte de ' || r.cliente end);
    insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
    values ('aviso_parada:' || r.envio || ':' || r.parada || ':' || v_tramo || ':' || r.fecha_obj,
            'aviso_parada', r.envio, array_to_string(r.emails_avisos, ','), v_asunto,
            texto_aviso_parada(v_rec, r.cliente, r.nombre_empresa, r.direccion, r.codigo_postal,
                               r.poblacion, r.fecha_obj, r.matricula_camion, r.matricula_remolque,
                               r.conductor_nombre, r.discreto))
    on conflict (clave) do nothing;
    get diagnostics v_cnt = row_count; n := n + v_cnt;
  end loop;
  return n;
end $$;
comment on function public.encolar_avisos_paradas() is '[Gestión interna] Encola los avisos de recogida y entrega a los sitios de la ruta (a sus emails de aviso), cada uno UNA sola vez por tramo y fecha: 2 días antes y la víspera en la ventana diaria (aviso_parada_ventana_inicio/fin, Madrid) y el mismo día desde aviso_parada_hora_mismo_dia. Solo envíos de Dynamo con transportista asignado. Con discreción comercial se avisa IGUAL, pero sin nombrar al cliente. Devuelve cuántos encoló. Quién: la tarea programada; nadie por la API. Argumentos: ninguno.';

-- ---- 3. La anulación, con el mismo criterio ------------------------------------------
create or replace function public.encolar_anulacion_parada(
  p_envio uuid, p_parada uuid, p_tipo text, p_nombre text, p_poblacion_sitio text, p_sitio uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if p_sitio is null then return; end if;
  if not exists (select 1 from emails_enviados x
                  where x.clave like 'aviso_parada:' || p_envio || ':' || p_parada || ':%'
                    and x.estado in ('pendiente', 'enviado')) then return; end if;
  select e.referencia_gx, c.razon_social as cliente, coalesce(e.discrecion_comercial, false) as discreto,
         p_tipo as tipo_parada, p_nombre as nombre_empresa, p_poblacion_sitio as poblacion,
         (select s.emails_avisos from sitios s where s.id = p_sitio) as emails_avisos,
         case when p_tipo = 'carga' then coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde)
              else e.fecha_entrega_estimada end as fecha_obj
    into r
    from envios e
    join clientes c on c.id = e.cliente_id
   where e.id = p_envio;
  if r is null or coalesce(cardinality(r.emails_avisos), 0) = 0 then return; end if;
  insert into emails_enviados (clave, tipo, envio_id, destinatario, asunto, cuerpo_html)
  values ('aviso_parada_cancelada:' || p_envio || ':' || p_parada, 'aviso_parada_cancelada', p_envio,
          array_to_string(r.emails_avisos, ','),
          format('Anulada la %s prevista%s · Dynamo',
                 case when r.tipo_parada = 'carga' then 'recogida' else 'entrega' end,
                 case when r.fecha_obj is not null then ' el ' || to_char(r.fecha_obj, 'DD/MM/YYYY') else '' end),
          format('<p>Hola,</p><p>Queda <strong>anulada</strong> la <strong>%s</strong>%s prevista%s en vuestras instalaciones (<strong>%s</strong>%s). Disculpad las molestias.</p><p>— %s · %s · %s</p>',
                 case when r.tipo_parada = 'carga' then 'recogida' else 'entrega' end,
                 case when r.discreto then '' else ' de parte de <strong>' || escapar_html(r.cliente) || '</strong>' end,
                 case when r.fecha_obj is not null then ' el <strong>' || to_char(r.fecha_obj, 'DD/MM/YYYY') || '</strong>' else '' end,
                 escapar_html(r.nombre_empresa),
                 case when r.poblacion is not null then ', ' || escapar_html(r.poblacion) else '' end,
                 escapar_html(coalesce(parametro('dynamo_razon_social') #>> '{}', '')),
                 escapar_html(coalesce(parametro('dynamo_email') #>> '{}', '')),
                 escapar_html(coalesce(parametro('dynamo_telefono') #>> '{}', ''))))
  on conflict (clave) do nothing;
  update emails_enviados set estado = 'omitido', error = 'La recogida o entrega se anuló antes de mandarlo.'
   where clave like 'aviso_parada:' || p_envio || ':' || p_parada || ':%' and estado = 'pendiente';
end $$;
comment on function public.encolar_anulacion_parada(uuid, uuid, text, text, text, uuid) is '[Gestión interna] Si un sitio de la ruta YA fue avisado de una recogida o entrega, le encola el email de anulación (envío cancelado o parada quitada de la ruta) y deja en «omitido» sus avisos pendientes. Si nunca se le avisó, no hace nada. Con discreción comercial, sin nombrar al cliente. Recibe los datos de la parada como argumentos porque al quitarla la fila ya no existe. Quién: los disparadores de cancelación; nadie por la API. Argumentos: p_envio: envios.id · p_parada: envio_paradas.id · p_tipo: carga o descarga · p_nombre, p_poblacion_sitio: de la parada · p_sitio: sitios.id.';
