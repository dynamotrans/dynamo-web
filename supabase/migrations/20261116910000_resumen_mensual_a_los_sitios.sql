-- =====================================================================================
-- RESUMEN MENSUAL A LOS SITIOS DONDE SE CARGA Y SE ENTREGA (usuario, 2026-11-17)
-- =====================================================================================
-- «A final de mes, a los sitios donde los clientes cargan o entregan: "hemos recogido /
-- entregado mercancía de parte de tu cliente tal. Recuerda que también puedes gestionar tus
-- envíos con nosotros". Un email al mes, con el cliente y la fecha, y ya está. Sin poner el
-- otro extremo de la ruta.» Que el sitio vea que su cliente trabaja con Dynamo ya es una
-- barrera de entrada superada.
--   · Nace APAGADO: es un email comercial a quien no es cliente; se enciende en Parámetros
--     cuando el asesor dé el visto bueno.
--   · Un email al mes por dirección de aviso, solo si en ese mes hubo recogidas o entregas terminadas.
--   · Solo cliente, fecha y si fue recogida o entrega. Nunca el origen ni el destino.
--   · Quedan fuera: los clientes con discreción comercial, el propio almacén del cliente,
--     los sitios cuya empresa ya es cliente o cuyo email ya es usuario, las direcciones de la
--     lista de bloqueo y las que se han dado de baja.
--   · Cada email lleva un enlace de baja.
--   · Sale por el canal de envíos masivos de Postmark («broadcast»), no por el de los avisos,
--     y sin copia a Dynamo.

-- Un mismo almacén suele estar en la agenda de varios clientes (una ficha de sitio por
-- cliente). Por eso el resumen va POR DIRECCIÓN DE EMAIL, no por ficha: un solo email al
-- mes a cada dirección, con todos los clientes de parte de los que se ha pasado por allí.
create table resumen_destinatarios (
  email text primary key check (email = lower(btrim(email)) and email like '_%@_%._%'),
  token uuid not null unique default gen_random_uuid(),
  baja_en timestamptz,
  creado_en timestamptz not null default now()
);
alter table resumen_destinatarios enable row level security;
create policy resumen_destinatarios_lee_dynamo on resumen_destinatarios for select to authenticated using (ve_todo());
create trigger tg_mantenimiento before insert or update or delete on resumen_destinatarios
  for each row execute function fn_bloqueo_mantenimiento();
comment on table public.resumen_destinatarios is '[Sitios] Direcciones a las que se ha preparado alguna vez el resumen mensual de los sitios: la llave de su enlace de baja y, si se han dado de baja, cuándo. La escribe la base de datos al preparar el resumen y al darse de baja. Solo la lee Dynamo.';
comment on column public.resumen_destinatarios.email is 'formato: email en minúsculas | rango: no aplica | lista: no aplica | obligatorio | La dirección (uno de los emails de aviso de un sitio). Ej. OK: recepcion@almacen.com';
comment on column public.resumen_destinatarios.token is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Llave al azar del enlace de baja del resumen mensual (/baja/<token>).';
comment on column public.resumen_destinatarios.baja_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se dio de baja esa dirección del resumen mensual. Vacío = lo sigue recibiendo.';
comment on column public.resumen_destinatarios.creado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se creó la fila (la primera vez que se le preparó un resumen).';

insert into parametros (clave, valor, descripcion) values
  ('resumen_sitios_activo', 'false', 'Resumen mensual a los sitios: true = cada mes se manda a los sitios de recogida y entrega (los que tienen email de avisos) un resumen de las veces que Dynamo ha pasado por sus instalaciones, de parte de qué cliente y qué día, con una invitación a trabajar con Dynamo. false = no se manda. Es un email comercial: enciéndelo solo con el visto bueno de tu asesor.'),
  ('resumen_sitios_dia', '3', 'Resumen mensual a los sitios: día del mes (1 a 28) a partir del cual se manda el resumen del mes anterior. Sale el primer día hábil desde ese día, a partir de las 10:00.')
on conflict (clave) do nothing;

alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida',
                  'envio_aceptado', 'alta_pendiente', 'deca', 'cuenta_activada', 'cuenta_reactivada',
                  'cambio_email', 'envio_creado', 'envio_modificado', 'envio_cancelado', 'envio_matriculas',
                  'envio_reactivado', 'credito_cambio', 'credito_aviso', 'proforma_calculo',
                  'transportista_cancelado', 'transportista_retirado', 'transportista_modificado',
                  'credito_bloqueo', 'resumen_sitio'));

-- ---- Preparar los resúmenes de un mes -------------------------------------------------------
create or replace function public.encolar_resumen_sitios(p_mes date default null, p_forzar boolean default false)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  ahora timestamp := now() at time zone 'Europe/Madrid';
  hoy date := ahora::date;
  v_mes date := date_trunc('month', coalesce(p_mes, (date_trunc('month', hoy) - interval '1 month')::date))::date;
  v_fin date := (v_mes + interval '1 month')::date;
  v_dia int := greatest(1, least(28, parametro_num('resumen_sitios_dia', 3)::int));
  meses constant text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  -- Correos gratuitos: ahí el dominio no dice de qué empresa es la dirección.
  genericos constant text[] := array['gmail.com','hotmail.com','hotmail.es','outlook.com','outlook.es','yahoo.com','yahoo.es','live.com','icloud.com','msn.com','telefonica.net','movistar.es','orange.es','ono.com'];
  v_mes_txt text := meses[extract(month from v_mes)::int] || ' de ' || extract(year from v_mes)::int;
  v_base text := coalesce(parametro('url_plataforma') #>> '{}', 'https://www.dynamotrans.com');
  v_firma text := coalesce(parametro('dynamo_razon_social') #>> '{}', 'Dynamo');
  v_email text := coalesce(parametro('dynamo_email') #>> '{}', '');
  v_tel text := coalesce(parametro('dynamo_telefono') #>> '{}', '');
  s record; v_dom text; v_filas text; v_n int; v_clientes int; v_token uuid; v_cnt int; n int := 0;
begin
  if not p_forzar then
    if not coalesce((parametro('resumen_sitios_activo') #>> '{}')::boolean, false) then return 0; end if;
    if mantenimiento_activo() then return 0; end if;
    if extract(day from hoy)::int < v_dia or ahora::time < time '10:00' or not es_dia_habil(hoy) then return 0; end if;
  end if;

  for s in
    select lower(btrim(m)) as email,
           (array_agg(st.nombre_empresa order by st.creado_en) filter (where st.nombre_empresa is not null))[1] as nombre,
           (array_agg(st.poblacion order by st.creado_en) filter (where st.poblacion is not null))[1] as poblacion,
           array_agg(distinct st.id) as sitios
      from sitios st cross join lateral unnest(st.emails_avisos) m
     where btrim(m) like '_%@_%._%' and lower(m) not like '%.invalid'
       and not coalesce(st.borrado, false) and not coalesce(st.es_almacen_dynamo, false)
       -- La empresa del sitio ya es cliente: no hay nada que ofrecerle.
       and not exists (select 1 from clientes c where st.cif is not null and c.cif = st.cif)
     group by 1
  loop
    -- Fuera: quien se dio de baja, quien ya es usuario, la lista de bloqueo y lo ya preparado este mes.
    continue when exists (select 1 from resumen_destinatarios b where b.email = s.email and b.baja_en is not null);
    continue when exists (select 1 from usuarios u where lower(u.email) = s.email);
    continue when alta_bloqueada(s.email);
    continue when exists (select 1 from emails_enviados x where x.clave = 'resumen_sitio:' || md5(s.email) || ':' || to_char(v_mes, 'YYYY-MM'));
    v_dom := split_part(s.email, '@', 2);

    -- Qué: las recogidas y entregas TERMINADAS en esos sitios ese mes, de envíos de Dynamo ya
    -- entregados. Sin discreción comercial y sin los almacenes del propio cliente (su sitio
    -- principal, los de su mismo CIF o los que llevan el dominio de correo de su empresa).
    select count(*), count(distinct x.cliente),
           string_agg(format('<li>%s · %s · de parte de <strong>%s</strong></li>', to_char(x.dia, 'DD/MM/YYYY'),
                             case when x.tipo = 'carga' then 'Recogida' else 'Entrega' end, escapar_html(x.cliente)),
                      '' order by x.dia, x.cliente)
      into v_n, v_clientes, v_filas
      from (
        select distinct (coalesce(p.realizado_en, case when p.tipo = 'carga' then e.fecha_carga_real::timestamptz else e.entregado_en end)
                         at time zone 'Europe/Madrid')::date as dia,
               p.tipo, c.nombre_visible as cliente
          from envio_paradas p
          join sitios st on st.id = p.sitio_id
          join envios e on e.id = p.envio_id
          join clientes c on c.id = e.cliente_id
         where p.sitio_id = any (s.sitios) and e.estado = 'entregado' and e.operador_id is null
           and not coalesce(e.discrecion_comercial, false) and not coalesce(c.discrecion_comercial, false)
           and c.sitio_principal_id is distinct from p.sitio_id
           and (st.cif is null or c.cif is distinct from st.cif)
           and (v_dom = any (genericos) or (
                 not exists (select 1 from usuarios u where u.cliente_id = c.id and split_part(lower(u.email), '@', 2) = v_dom)
             and not exists (select 1 from contactos k where k.cliente_id = c.id and split_part(lower(k.email), '@', 2) = v_dom)))
           and (coalesce(p.realizado_en, case when p.tipo = 'carga' then e.fecha_carga_real::timestamptz else e.entregado_en end)
                at time zone 'Europe/Madrid')::date >= v_mes
           and (coalesce(p.realizado_en, case when p.tipo = 'carga' then e.fecha_carga_real::timestamptz else e.entregado_en end)
                at time zone 'Europe/Madrid')::date < v_fin
         order by 1, 3
         limit 40) x;
    continue when coalesce(v_n, 0) = 0;

    insert into resumen_destinatarios (email) values (s.email) on conflict (email) do nothing;
    select token into v_token from resumen_destinatarios where email = s.email;

    insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
    values ('resumen_sitio:' || md5(s.email) || ':' || to_char(v_mes, 'YYYY-MM'), 'resumen_sitio', s.email,
      format('Resumen de %s: recogidas y entregas en vuestras instalaciones · Dynamo', v_mes_txt),
      format('<p>Hola,</p>'
          || '<p>Somos <strong>Dynamo</strong>, operador de transporte. En %s hemos pasado por vuestras instalaciones%s de parte de %s:</p>'
          || '<ul>%s</ul>'
          || '<p>Si alguna vez tenéis que mover mercancía, <strong>también podéis gestionar vuestros envíos directamente con nosotros</strong>: online, con el precio al momento, o por teléfono. Grupajes y cargas completas, en España y Europa.</p>'
          || '<p><a href="%s" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:10px">Pedir un envío</a></p>'
          || '<p>O llámanos: <strong>%s</strong> · %s</p>'
          || '<p>— %s</p>'
          || '<p style="font-size:12px;color:#6b7280">Recibís este resumen, como mucho una vez al mes, porque esta dirección figura como contacto de avisos de %s en los envíos de nuestros clientes. Si no queréis recibirlo más: <a href="%s/baja/%s">darme de baja</a>.</p>',
          v_mes_txt,
          case when s.nombre is not null then ' (' || escapar_html(s.nombre) || coalesce(', ' || escapar_html(s.poblacion), '') || ')' else '' end,
          case when v_clientes = 1 then 'vuestro cliente' else 'vuestros clientes' end,
          v_filas,
          case when registro_clientes_abierto() then v_base || '/panel/registro' else 'https://' || coalesce(parametro('dynamo_web') #>> '{}', 'www.dynamotrans.com') end,
          escapar_html(v_tel), escapar_html(v_email), escapar_html(v_firma),
          escapar_html(coalesce(s.nombre, 'vuestras instalaciones')), v_base, v_token))
    on conflict (clave) do nothing;
    get diagnostics v_cnt = row_count; n := n + v_cnt;
  end loop;
  return n;
end $$;
revoke all on function public.encolar_resumen_sitios(date, boolean) from public, anon, authenticated;
comment on function public.encolar_resumen_sitios(date, boolean) is '[Gestión interna] Prepara el resumen mensual para los sitios de recogida y entrega: un email por dirección de aviso (un mismo almacén puede estar en la agenda de varios clientes) con las recogidas y entregas terminadas ese mes en sus instalaciones (fecha, tipo y de parte de qué cliente; nunca el otro extremo de la ruta), una invitación a trabajar con Dynamo y su enlace de baja. Fuera: clientes con discreción comercial, los almacenes del propio cliente (su sitio principal, su mismo CIF o el dominio de correo de su empresa), sitios cuya empresa ya es cliente, emails que ya son usuarios o están bloqueados y direcciones dadas de baja. Una vez por dirección y mes. Solo actúa si está encendido (parámetro resumen_sitios_activo), desde el día del parámetro resumen_sitios_dia, en día hábil y a partir de las 10:00. Devuelve cuántos ha preparado. Quién: la tarea programada; nadie por la API. Argumentos: p_mes: cualquier día del mes a resumir (vacío = el mes anterior) · p_forzar: solo para las pruebas, se salta el interruptor y el calendario.';

-- ---- La baja ---------------------------------------------------------------------------------
create or replace function public.baja_resumen_sitio(p_token uuid, p_confirmar boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r record;
begin
  select b.email, b.baja_en into r from resumen_destinatarios b where b.token = p_token;
  if r.email is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  if r.baja_en is not null then return jsonb_build_object('resultado', 'ya_de_baja', 'email', r.email); end if;
  if not p_confirmar then return jsonb_build_object('resultado', 'pendiente', 'email', r.email); end if;
  update resumen_destinatarios set baja_en = now() where email = r.email;
  -- Lo que estuviera esperando para salir ya no sale.
  update emails_enviados set estado = 'omitido', error = 'La dirección se ha dado de baja del resumen.'
   where tipo = 'resumen_sitio' and estado = 'pendiente' and clave like 'resumen_sitio:' || md5(r.email) || ':%';
  return jsonb_build_object('resultado', 'ok', 'email', r.email);
end $$;
revoke all on function public.baja_resumen_sitio(uuid, boolean) from public;
grant execute on function public.baja_resumen_sitio(uuid, boolean) to anon, authenticated, service_role;
comment on function public.baja_resumen_sitio(uuid, boolean) is '[Sitios] La página de baja del resumen mensual: con la llave del enlace dice de qué dirección es y, al confirmar, la da de baja (no vuelve a recibir el resumen; los avisos de recogida y entrega de cada envío siguen igual). Devuelve jsonb {resultado: pendiente | ok | ya_de_baja | enlace_no_valido, email}. Quién: público con la llave del enlace. Argumentos: p_token: la llave del enlace de baja · p_confirmar: true para darse de baja; false solo consulta.';

-- ---- Por el canal de envíos masivos y sin copia a Dynamo -----------------------------------------
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.enviar_emails_pendientes()'::regprocedure);
  n := replace(v, $a$when r.tipo in ('difusion', 'difusion_recordatorio') then null$a$,
                  $b$when r.tipo in ('difusion', 'difusion_recordatorio', 'resumen_sitio') then null$b$);
  n := replace(n, $a$'MessageStream', 'outbound')$a$,
                  $b$'MessageStream', case when r.tipo = 'resumen_sitio' then 'broadcast' else 'outbound' end)$b$);
  if n = v or position('''broadcast''' in n) = 0 or position('''resumen_sitio'') then null' in n) = 0 then
    raise exception 'enviar_emails_pendientes: no encuentro la copia o el canal';
  end if;
  execute n;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-resumen-sitios', '7 9-12 * * *', 'select public.encolar_resumen_sitios()');
  end if;
end $$;
