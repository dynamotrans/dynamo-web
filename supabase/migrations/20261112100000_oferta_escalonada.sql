-- =====================================================================================
-- OFERTA ESCALONADA POR EMAIL A LOS TRANSPORTISTAS (usuario, 2026-11-12)
-- =====================================================================================
-- «No ofrecer una carga a 600 a la vez: poco a poco, por mi ranking interno, y parar
-- en cuanto uno acepte». Dynamo pulsa «Oferta escalonada» en la ficha del envío y la
-- base de datos va mandando UN email cada pocos minutos (parámetro), solo de 5:00 a
-- 23:00 hora española (parámetros, todos los días del año), cada uno con su oferta y
-- su enlace público de aceptar carga. SOLO entran transportistas activos, con email y
-- relacionados con el envío (criterios del usuario, 2026-11-12):
--   · con SEDE en la provincia del origen (2 primeras cifras del CP + país; si el
--     origen es extranjero basta el país — así el 34 de Francia no pesca al 34 de
--     España), O
--   · que ya HICIERON ESA RUTA con envíos entregados (nacional: provincia a provincia,
--     CP 2 cifras + país en ambas puntas; internacional: entre esos dos países, da
--     igual la ida que la vuelta).
-- Y dentro de ellos, el orden es:
--   1.º los FAVORITOS de Dynamo (etiqueta «favorito» en su ficha),
--   2.º mejor valoración interna de Dynamo,
--   3.º la sede en la zona del origen,
--   4.º quien hizo la ruta más recientemente,
--   5.º y a igualdad, los más antiguos de la base.
-- La difusión PARA EN SECO cuando el envío tiene transportista (acepte quien acepte,
-- por el enlace o asignado a mano), si el envío deja de estar programado, si Dynamo la
-- para a mano, o al llegar al tope de contactados (parámetro) — entonces avisa a
-- Dynamo por email y campana. A nadie más se le escribe. Cada email queda en el
-- registro emails_enviados con clave única (no se repite) y lo manda el envío por
-- Postmark de pg_cron (enviar_emails_pendientes). Cada oferta es una envio_ofertas
-- normal (canal email): al aceptarse una, las demás se anulan como siempre.

-- ---- 1. Parámetros -------------------------------------------------------------------
insert into parametros (clave, valor, descripcion) values
  ('difusion_minutos_entre_emails', '2'::jsonb,
   'Oferta escalonada: minutos de espera entre un email y el siguiente (un transportista cada vez).'),
  ('difusion_max_contactados', '60'::jsonb,
   'Oferta escalonada: tope de transportistas contactados por difusión; al llegar, se para y avisa a Dynamo.'),
  ('difusion_hora_inicio', '5'::jsonb,
   'Oferta escalonada: hora española (0-23) desde la que se mandan emails. Antes de esa hora la difusión espera sin contactar a nadie.'),
  ('difusion_hora_fin', '23'::jsonb,
   'Oferta escalonada: hora española (0-24) hasta la que se mandan emails (sin incluirla). Después, la difusión espera al día siguiente.')
on conflict (clave) do nothing;

-- ---- 2. La tabla ---------------------------------------------------------------------
create table difusiones (
  id                     uuid primary key default gen_random_uuid(),
  envio_id               uuid not null references envios(id),
  estado                 text not null default 'activa' check (estado in ('activa', 'parada', 'aceptada', 'agotada')),
  precio                 numeric(12,2) not null check (precio > 0),
  banda_pct              smallint not null default 10,
  pronto_pago            boolean not null default true,
  minutos_entre_emails   int not null,
  max_contactados        int not null,
  contactados            int not null default 0,
  ultimo_email_en        timestamptz,
  terminada_en           timestamptz,
  fin_motivo             text,
  creado_en              timestamptz not null default now(),
  creado_por             uuid references usuarios(id),
  modificado_en          timestamptz,
  modificado_por         uuid references usuarios(id)
);
-- Solo UNA difusión viva por envío.
create unique index ux_difusiones_viva on difusiones (envio_id) where estado = 'activa';
create index idx_difusiones_activas on difusiones (estado) where estado = 'activa';

comment on table difusiones is 'Oferta escalonada de un envío por email: un transportista cada pocos minutos (solo de 5:00 a 23:00 hora española), por ranking interno (favoritos, valoración, sede en la zona del origen, quien hizo la ruta), hasta que uno acepta, Dynamo la para o se llega al tope. Solo Dynamo la ve y la maneja (por funciones).';
comment on column difusiones.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único de la difusión.';
comment on column difusiones.envio_id is 'formato: uuid | → envios.id | rango: no aplica | lista: no aplica | obligatorio | Envío que se está ofreciendo (→ envios.id). Solo puede haber una difusión activa por envío.';
comment on column difusiones.estado is 'formato: texto | rango: no aplica | lista: activa, parada, aceptada, agotada | automático | activa = mandando emails · parada = la paró Dynamo o el envío dejó de estar programado · aceptada = el envío ya tiene transportista · agotada = se llegó al tope o no quedan transportistas que casen.';
comment on column difusiones.precio is 'formato: número decimal (2 decimales) | rango: mayor que 0 | lista: no aplica | obligatorio | Precio que se oferta a cada transportista, en euros sin IVA.';
comment on column difusiones.banda_pct is 'formato: número entero | rango: no aplica | lista: no aplica | opcional | Banda de negociación de cada oferta, en % sobre el precio (la misma de ofertar_envio).';
comment on column difusiones.pronto_pago is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | opcional | Si las ofertas salen con pronto pago (a quien lo tenga permitido en su ficha).';
comment on column difusiones.minutos_entre_emails is 'formato: número entero | rango: 1 o más | lista: no aplica | obligatorio | Minutos de espera entre un email y el siguiente (copiado del parámetro al crearla).';
comment on column difusiones.max_contactados is 'formato: número entero | rango: 1 o más | lista: no aplica | obligatorio | Tope de transportistas contactados (copiado del parámetro al crearla); al llegar se agota y avisa.';
comment on column difusiones.contactados is 'formato: número entero | rango: 0 o más | lista: no aplica | automático | Cuántos transportistas han recibido ya su email en esta difusión.';
comment on column difusiones.ultimo_email_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo salió el último email (instante): el siguiente espera los minutos configurados.';
comment on column difusiones.terminada_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo terminó la difusión (instante), sea cual sea el motivo.';
comment on column difusiones.fin_motivo is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Por qué terminó, en claro (transportista asignado, parada a mano, tope alcanzado, sin candidatos…).';
comment on column difusiones.creado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Fecha y hora de alta de la fila (instante, en UTC). La pone la base de datos.';
comment on column difusiones.creado_por is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | automático | Quién inició la difusión (→ usuarios.id).';
comment on column difusiones.modificado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Última modificación de la fila (instante, en UTC).';
comment on column difusiones.modificado_por is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | automático | Quién hizo la última modificación (→ usuarios.id).';

alter table difusiones enable row level security;
-- Solo Dynamo la ve; nadie escribe por la API (todo pasa por las funciones de abajo).
create policy difusiones_lee_dynamo on difusiones for select to authenticated using (ve_todo());
create trigger tg_mantenimiento before insert or update or delete on difusiones
  for each row execute function fn_bloqueo_mantenimiento();
-- Señal en vivo: el estado de la difusión se pinta en la ficha del envío.
create trigger tg_zz_en_vivo_alta after insert on difusiones
  referencing new table as nuevas for each statement execute function fn_senal_en_vivo('envio');
create trigger tg_zz_en_vivo_cambio after update on difusiones
  referencing old table as viejas new table as nuevas for each statement execute function fn_senal_en_vivo('envio');
create trigger tg_zz_en_vivo_borrado after delete on difusiones
  referencing old table as viejas for each statement execute function fn_senal_en_vivo('envio');

-- ---- 3. El registro de emails admite los de difusión ---------------------------------
alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo', 'difusion', 'difusion_fin'));

-- ---- 4. Un paso de la difusión: elegir al siguiente y mandarle SU oferta -------------
create or replace function fn_difusion_paso(p_difusion uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d difusiones%rowtype; e record; v_t uuid; v_oferta uuid; v_token uuid; v_para text;
        v_base text; v_fin text; d_firma text; d_email text; d_tel text;
        v_po text; v_pd text; v_h int; v_ini int; v_hfin int;
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

  -- Ventana de envío (usuario, 2026-11-12): emails solo de 5:00 a 23:00 hora española,
  -- todos los días. Fuera de la ventana la difusión espera sin contactar a nadie.
  v_ini  := coalesce((parametro('difusion_hora_inicio'))::text::int, 5);
  v_hfin := coalesce((parametro('difusion_hora_fin'))::text::int, 23);
  v_h    := extract(hour from (now() at time zone 'Europe/Madrid'))::int;
  if not (v_h >= v_ini and v_h < v_hfin) then return; end if;

  -- País del origen y del destino: de la primera y la última parada del envío.
  select p.pais_codigo_iso into v_po from envio_paradas p where p.envio_id = d.envio_id order by p.orden asc  limit 1;
  select p.pais_codigo_iso into v_pd from envio_paradas p where p.envio_id = d.envio_id order by p.orden desc limit 1;

  -- ¿Tope alcanzado?
  v_fin := null;
  if d.contactados >= d.max_contactados then
    v_fin := format('Tope de %s transportistas contactados sin aceptación.', d.max_contactados);
  else
    -- El SIGUIENTE del ranking. Solo entran los activos, con email, sin oferta previa de
    -- este envío y RELACIONADOS con él: sede en la provincia del origen (CP 2 cifras +
    -- país; origen extranjero → basta el país) o que hicieron esa ruta con envíos
    -- entregados (nacional: CP 2 cifras + país en ambas puntas; internacional: entre
    -- esos dos países, ida o vuelta). Orden: favoritos → valoración interna → sede en
    -- la zona del origen → ruta más reciente → más antiguos.
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
               and left(coalesce(o2.codpostal, ''), 2) = left(coalesce(e.codigo_postal_origen, '--'), 2)
               and left(coalesce(d2.codpostal, ''), 2) = left(coalesce(e.codigo_postal_destino, '--'), 2))
           or (v_po <> v_pd
               and ((o2.pais_iso = v_po and d2.pais_iso = v_pd) or (o2.pais_iso = v_pd and d2.pais_iso = v_po))))
       group by e2.transportista_id)
    select t.id into v_t
      from transportistas t
      left join ruta r on r.transportista_id = t.id
     where t.estado_operativo = 'activo' and not t.borrado
       and exists (select 1 from contactos c where c.transportista_id = t.id and c.email is not null)
       and not exists (select 1 from envio_ofertas o where o.envio_id = d.envio_id and o.transportista_id = t.id)
       and ((t.pais_codigo_iso = v_po
             and (v_po is distinct from 'ES'
                  or left(coalesce(t.codigo_postal, ''), 2) = left(coalesce(e.codigo_postal_origen, '--'), 2)))
         or r.transportista_id is not null)
     order by exists (select 1 from unnest(t.tags) tg where lower(trim(tg)) = 'favorito') desc,
              t.valoracion_dynamo desc nulls last,
              (t.pais_codigo_iso = v_po
               and (v_po is distinct from 'ES'
                    or left(coalesce(t.codigo_postal, ''), 2) = left(coalesce(e.codigo_postal_origen, '--'), 2))) desc,
              r.ultima desc nulls last,
              t.creado_en asc
     limit 1;
    if v_t is null then
      v_fin := 'No quedan transportistas activos con email de la zona del origen o que hayan hecho esa ruta.';
    end if;
  end if;

  if v_fin is not null then
    update difusiones set estado = 'agotada', terminada_en = now(), fin_motivo = v_fin where id = d.id;
    -- Aviso a Dynamo: campana + email (una sola vez por difusión).
    perform crear_aviso('dynamo', null, null, 'difusion_agotada', 'aviso',
      format('Oferta escalonada sin aceptación · envío #%s', e.referencia_gx),
      format('%s Contactados: %s. Muévelo a mano o vuelve a lanzarla.', v_fin, d.contactados),
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
end $$;
revoke execute on function fn_difusion_paso(uuid) from public, anon, authenticated;
comment on function public.fn_difusion_paso(uuid) is '[Gestión interna] Un paso de la oferta escalonada: si toca parar (transportista asignado, envío no programado, tope o sin candidatos) cierra la difusión y avisa a Dynamo; fuera de la ventana de envío (5:00-23:00 española, parámetros) espera; si no, elige al siguiente del ranking (favoritos → valoración interna → sede en la zona del origen → quien hizo la ruta → antigüedad) entre los relacionados con el envío, le crea su oferta de canal email y encola su email con el enlace público de aceptar carga. Quién: procesar_difusiones e iniciar_difusion; nadie por la API. Argumentos: p_difusion: difusiones.id.';

-- ---- 5. La pasada del reloj: un email por difusión activa cuando toque ---------------
create or replace function procesar_difusiones()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not (es_servidor() or es_equipo_dynamo()) then
    raise exception 'Solo el servidor procesa las difusiones.' using errcode = '42501';
  end if;
  for r in select id from difusiones
            where estado = 'activa'
              and (ultimo_email_en is null or ultimo_email_en <= now() - make_interval(mins => minutos_entre_emails))
            order by creado_en
  loop
    begin
      perform fn_difusion_paso(r.id);
    exception when others then null;   -- una difusión rota no para a las demás
    end;
  end loop;
  -- Y se manda lo encolado sin esperar al cron de los 10 minutos (sin pg_net, no-op).
  begin
    perform enviar_emails_pendientes();
  exception when others then null;
  end;
end $$;
revoke execute on function procesar_difusiones() from public, anon, authenticated;
comment on function public.procesar_difusiones() is '[Gestión interna] La pasada de la oferta escalonada: para cada difusión activa a la que le toque (han pasado los minutos configurados desde el último email) da un paso (fn_difusion_paso) y después manda la cola de emails. La llama pg_cron cada minuto. Quién: la tarea programada; nadie por la API. Argumentos: ninguno.';

-- ---- 6. Iniciar y parar desde la ficha del envío -------------------------------------
create or replace function iniciar_difusion(p_envio uuid, p_precio numeric, p_banda_pct smallint default 10, p_pronto_pago boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e record; v_id uuid;
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    raise exception 'Solo Dynamo lanza ofertas escalonadas.' using errcode = '42501';
  end if;
  select estado, estado_asignacion, transportista_id into e from envios where id = p_envio for update;
  if e.estado is null then return jsonb_build_object('resultado', 'no_existe'); end if;
  if e.estado <> 'programado' then return jsonb_build_object('resultado', 'no_programado', 'estado', e.estado); end if;
  if e.transportista_id is not null or e.estado_asignacion = 'confirmada' then
    return jsonb_build_object('resultado', 'ya_asignado');
  end if;
  if coalesce(p_precio, 0) <= 0 then return jsonb_build_object('resultado', 'precio_no_valido'); end if;
  if exists (select 1 from difusiones where envio_id = p_envio and estado = 'activa') then
    return jsonb_build_object('resultado', 'ya_activa');
  end if;
  insert into difusiones (envio_id, precio, banda_pct, pronto_pago, minutos_entre_emails, max_contactados, creado_por)
  values (p_envio, p_precio, coalesce(p_banda_pct, 10), coalesce(p_pronto_pago, true),
          greatest(1, coalesce((parametro('difusion_minutos_entre_emails'))::text::int, 2)),
          greatest(1, coalesce((parametro('difusion_max_contactados'))::text::int, 60)),
          auth.uid())
  returning id into v_id;
  -- El primer email sale al momento (si estamos dentro de la ventana de envío).
  perform fn_difusion_paso(v_id);
  begin
    perform enviar_emails_pendientes();
  exception when others then null;
  end;
  return jsonb_build_object('resultado', 'ok', 'difusion', v_id);
end $$;
revoke execute on function iniciar_difusion(uuid, numeric, smallint, boolean) from public, anon;
grant execute on function iniciar_difusion(uuid, numeric, smallint, boolean) to authenticated, service_role;
comment on function public.iniciar_difusion(uuid, numeric, smallint, boolean) is '[Envíos] Lanza la oferta escalonada de un envío programado y sin transportista: un email cada pocos minutos (solo de 5:00 a 23:00 española) a un transportista cada vez, por ranking interno (favoritos, valoración, sede en la zona del origen, quien hizo la ruta, antigüedad) entre los relacionados con el envío, hasta que uno acepta, se para a mano o se llega al tope. El primer email sale al momento si la ventana está abierta. Quién: Dynamo (admin). Argumentos: p_envio: envios.id · p_precio: euros sin IVA ofertados · p_banda_pct: banda de negociación en % (opcional) · p_pronto_pago: con pronto pago (opcional).';

create or replace function parar_difusion(p_envio uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    raise exception 'Solo Dynamo para ofertas escalonadas.' using errcode = '42501';
  end if;
  update difusiones set estado = 'parada', terminada_en = now(), fin_motivo = 'Parada a mano por Dynamo.'
   where envio_id = p_envio and estado = 'activa' returning id into v_id;
  if v_id is null then return jsonb_build_object('resultado', 'sin_difusion_activa'); end if;
  return jsonb_build_object('resultado', 'ok', 'difusion', v_id);
end $$;
revoke execute on function parar_difusion(uuid) from public, anon;
grant execute on function parar_difusion(uuid) to authenticated, service_role;
comment on function public.parar_difusion(uuid) is '[Envíos] Para en seco la oferta escalonada activa de un envío: no se contacta a nadie más (las ofertas ya enviadas siguen su curso normal). Quién: Dynamo (admin). Argumentos: p_envio: envios.id.';

-- ---- 7. El reloj, cada minuto --------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-difusion-escalonada', '* * * * *', 'select public.procesar_difusiones()');
  end if;
end $$;
