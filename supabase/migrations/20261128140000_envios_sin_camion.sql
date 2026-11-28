-- ENVÍO QUE PASA SU FECHA DE CARGA SIN CAMIÓN (usuario, 2026-11-28: «hazlo como dices tú»):
--   1. Con VENTANA (no fecha fija) y la casilla «Si no hay camión, ampliar automáticamente»
--      marcada (por defecto sí), al acabar la ventana sin camión se amplía sola hasta 2 días
--      hábiles más (parámetro sin_camion_ampliar_dias), una sola vez. Con fecha fija, nunca.
--   2. Si aun así pasa la fecha sin camión, el envío NO se anula: queda «Sin camión · elige
--      nueva fecha» y el cliente recibe email y aviso con dos caminos: elegir otra fecha
--      (cualquier día, también dentro de 2 semanas) o cancelar sin coste.
--   3. Si no contesta en 2 días hábiles (parámetro sin_camion_respuesta_dias), se cancela solo,
--      SIN COSTE y sin contar para la suspensión, con un email que lleva «Repetir envío».
--   4. Siempre sin cobrar nada: con crédito se libera solo (el cancelado no cuenta); si ya
--      estaba pagado, Dynamo recibe un aviso urgente para devolver el pago.
-- Lo revisa una tarea cada hora (revisar_envios_sin_camion).

alter table public.envios
  add column if not exists ampliar_sin_camion boolean not null default true,
  add column if not exists sin_camion_ampliado_en timestamptz,
  add column if not exists sin_camion_desde timestamptz;
comment on column public.envios.ampliar_sin_camion is 'formato: sí/no | rango: no aplica | lista: no aplica | obligatorio | Casilla de Nuevo envío «Si no hay camión, ampliar automáticamente»: con ventana de carga, si acaba sin camión, se amplía sola los días hábiles del parámetro sin_camion_ampliar_dias (una vez). Con fecha fija no se usa. Ej. OK: true · Ej. mal: vacío';
comment on column public.envios.sin_camion_ampliado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se amplió sola la ventana por no tener camión (solo una vez; se vacía si el cliente cambia la fecha). Ej. OK: 2026-12-02 01:17:00+00 · Ej. mal: con fecha fija';
comment on column public.envios.sin_camion_desde is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Desde cuándo el envío está «Sin camión · elige nueva fecha»: pasó su fecha de carga sin transportista. Se vacía al cambiar la fecha o al asignar camión; si el cliente no contesta en sin_camion_respuesta_dias días hábiles, se cancela sin coste. Ej. OK: 2026-12-03 00:17:00+00 · Ej. mal: con transportista asignado';

insert into public.parametros (clave, valor, descripcion) values
  ('sin_camion_ampliar_dias', '2', 'Envío con ventana que acaba sin camión: cuántos días hábiles se amplía solo (una vez) si el cliente dejó marcada la casilla. 0 = no se amplía nunca.'),
  ('sin_camion_respuesta_dias', '2', 'Envío «Sin camión · elige nueva fecha»: días hábiles que tiene el cliente para elegir otra fecha; pasados, se cancela solo y sin coste.')
on conflict (clave) do nothing;

-- ---- 1. Al cambiar la fecha o asignar camión se vacía; cancelar estando sin camión es gratis --
create or replace function public.fn_envios_aa_sin_camion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sin_camion_desde is not null and (
       new.transportista_id is not null
       or (new.fecha_carga_desde, new.fecha_carga_hasta) is distinct from (old.fecha_carga_desde, old.fecha_carga_hasta)) then
    new.sin_camion_desde := null;
  end if;
  -- El cliente elige otra fecha: la ventana nueva se puede volver a ampliar.
  if new.fecha_carga_desde is distinct from old.fecha_carga_desde then new.sin_camion_ampliado_en := null; end if;
  -- Cancelar un envío que se quedó sin camión no cuesta nada ni cuenta para la suspensión.
  -- La marca la protege tg_envios_ab_precio_revision: se le abre la puerta solo para esta fila
  -- y se cierra justo después (tg_envios_ab_zz_sin_camion_fin).
  if new.estado = 'cancelado' and old.estado <> 'cancelado' and old.sin_camion_desde is not null then
    perform set_config('dynamo.revision_precio', 'on', true);
    perform set_config('dynamo.sin_camion_abrio', 'on', true);
    new.cancelacion_sin_coste := true;
  end if;
  return new;
end $$;
revoke execute on function public.fn_envios_aa_sin_camion() from public, anon, authenticated;
comment on function public.fn_envios_aa_sin_camion() is '[Gestión interna] Disparador de envíos: vacía «sin camión» al cambiar la fecha o asignar transportista, permite volver a ampliar si cambia el primer día, y hace que cancelar un envío que se quedó sin camión sea sin coste (no cuenta para la suspensión). Quién: nadie la llama; la ejecuta la base de datos.';
drop trigger if exists tg_envios_aa_sin_camion on public.envios;
create trigger tg_envios_aa_sin_camion before update on public.envios
  for each row execute function public.fn_envios_aa_sin_camion();

create or replace function public.fn_envios_ab_zz_sin_camion_fin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('dynamo.sin_camion_abrio', true), '') = 'on' then
    perform set_config('dynamo.revision_precio', 'off', true);
    perform set_config('dynamo.sin_camion_abrio', 'off', true);
  end if;
  return new;
end $$;
revoke execute on function public.fn_envios_ab_zz_sin_camion_fin() from public, anon, authenticated;
comment on function public.fn_envios_ab_zz_sin_camion_fin() is '[Gestión interna] Disparador de envíos: cierra la puerta que abre fn_envios_aa_sin_camion para marcar sin coste la cancelación de un envío que se quedó sin camión. Quién: nadie la llama; la ejecuta la base de datos.';
drop trigger if exists tg_envios_ab_zz_sin_camion_fin on public.envios;
create trigger tg_envios_ab_zz_sin_camion_fin before update on public.envios
  for each row execute function public.fn_envios_ab_zz_sin_camion_fin();

-- ---- 2. La casilla, desde Nuevo envío ------------------------------------------------------
create or replace function public.envio_ampliar_sin_camion(p_envio uuid, p_si boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (es_equipo_dynamo() or coalesce(envio_del_cliente(p_envio), false)) then
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  update envios set ampliar_sin_camion = coalesce(p_si, true)
   where id = p_envio and estado in ('borrador', 'programado') and ampliar_sin_camion is distinct from coalesce(p_si, true);
end $$;
revoke execute on function public.envio_ampliar_sin_camion(uuid, boolean) from public, anon;
grant execute on function public.envio_ampliar_sin_camion(uuid, boolean) to authenticated;
comment on function public.envio_ampliar_sin_camion(uuid, boolean) is '[Envíos] Guarda la casilla de Nuevo envío «Si no hay camión, ampliar automáticamente» (solo en borrador o programado). Quién: el cliente dueño del envío o Dynamo. Argumentos: p_envio: envios.id · p_si: marcada o no.';

-- ---- 3. La tarea de cada hora --------------------------------------------------------------
create or replace function public.revisar_envios_sin_camion()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_ampliar int := greatest(parametro_num('sin_camion_ampliar_dias', 2), 0)::int;
  v_resp int := greatest(parametro_num('sin_camion_respuesta_dias', 2), 1)::int;
  v_url text := rtrim(coalesce(parametro('url_plataforma') #>> '{}', ''), '/');
  v_hasta date; v_limite date; v_ref text; v_cli text; v_btn text;
begin
  if not (es_servidor() or es_consola_supabase() or es_equipo_dynamo()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  for r in select e.* from envios e
            where e.estado = 'programado' and not coalesce(e.es_manual, false) and e.transportista_id is null
              and e.fecha_carga_desde is not null and coalesce(e.fecha_carga_hasta, e.fecha_carga_desde) < v_hoy
              and e.estado_pago_previo is distinct from 'pendiente'          -- sin pagar ya lo anula su plazo de pago
              and e.estado_cambio_cliente is distinct from 'pendiente'       -- un cambio pedido lo decide Dynamo
              and not coalesce(envio_con_transportista(e.id), false)         -- alguien aceptándolo ahora: se espera
            for update skip locked loop
    v_ref := '#' || coalesce(r.referencia_gx, '');
    select nombre_visible into v_cli from clientes where id = r.cliente_id;

    if r.sin_camion_desde is null then
      -- (a) Con ventana y la casilla marcada: se amplía una vez.
      if v_ampliar > 0 and r.ampliar_sin_camion and r.sin_camion_ampliado_en is null
         and dias_ventana_carga(r.fecha_carga_desde, r.fecha_carga_hasta) > 1 then
        v_hasta := sumar_dias_habiles(coalesce(r.fecha_carga_hasta, r.fecha_carga_desde), v_ampliar);
        if v_hasta >= v_hoy then
          update envios set fecha_carga_hasta = v_hasta, sin_camion_ampliado_en = now() where id = r.id;
          perform registrar_hito(r.id, 'incidencia', null, null,
            jsonb_build_object('sin_camion', 'ventana_ampliada', 'hasta', v_hasta, 'por', 'sistema'), 'servidor');
          perform crear_aviso('cliente', r.cliente_id, null, 'envio', 'info', 'Ampliamos la ventana de carga · ' || v_ref,
            'Aún no hay camión para tu carga: seguimos buscando hasta el ' || fecha_texto(v_hasta) || '.', '/panel/envios?ver=' || r.id, r.id);
          perform crear_aviso('dynamo', null, null, 'envio', 'aviso', 'Sin camión: ventana ampliada · ' || v_ref,
            coalesce(v_cli, 'Cliente') || ': la ventana acabó sin transportista y se ha ampliado sola hasta el ' || fecha_texto(v_hasta) || '.',
            '/panel/envios?ver=' || r.id, r.id);
          n := n + 1;
          continue;
        end if;
      end if;
      -- (b) Sin camión: elige nueva fecha (o cancela sin coste).
      v_limite := sumar_dias_habiles(v_hoy, v_resp);
      update envios set sin_camion_desde = now() where id = r.id;
      perform registrar_hito(r.id, 'incidencia', null, null,
        jsonb_build_object('sin_camion', 'elige_fecha', 'cancela_el', v_limite, 'por', 'sistema'), 'servidor');
      v_btn := 'display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px';
      perform fn_email_envio_cliente(r.id, 'sin_camion:' || r.id || ':' || to_char(now() at time zone 'utc', 'YYYYMMDD'), 'sin_camion',
        'No hemos encontrado camión',
        format('<p>Lo sentimos: <strong>no hemos encontrado camión</strong> para tu carga del <strong>%s</strong>.</p>', escapar_html(envio_fecha_carga_texto(r.fecha_carga_desde, r.fecha_carga_hasta, null)))
        || '<p>Tu envío <strong>no se ha anulado</strong>. Elige otra fecha de carga (la que mejor te venga, también dentro de unas semanas) y seguimos buscando camión, o cancélalo <strong>sin ningún coste</strong>.</p>'
        || format('<p><a href="%s/panel/nuevo-envio?editar=%s" style="%s">Elegir otra fecha</a></p>', escapar_html(v_url), r.id, v_btn)
        || format('<p><a href="%s/panel/envios?ver=%s" style="%s;background:#ffffff;color:#3300cc;border:1.5px solid #3300cc">Cancelar sin coste</a></p>', escapar_html(v_url), r.id, v_btn)
        || format('<p>Si no eliges otra fecha antes del <strong>%s</strong>, lo cancelaremos nosotros, también sin coste.</p>', escapar_html(fecha_texto(v_limite))));
      perform crear_aviso('cliente', r.cliente_id, null, 'envio', 'urgente', 'Sin camión · elige nueva fecha · ' || v_ref,
        'No hemos encontrado camión para tu carga. Elige otra fecha o cancélalo sin coste antes del ' || fecha_texto(v_limite) || '.',
        '/panel/envios?ver=' || r.id, r.id);
      perform crear_aviso('dynamo', null, null, 'envio', 'urgente', 'Sin camión · ' || v_ref,
        coalesce(v_cli, 'Cliente') || ': pasó la fecha de carga sin transportista. Le hemos pedido otra fecha; si no contesta, se cancela sin coste el ' || fecha_texto(v_limite) || '.',
        '/panel/envios?ver=' || r.id, r.id);
      n := n + 1;
    elsif v_hoy > sumar_dias_habiles((r.sin_camion_desde at time zone 'Europe/Madrid')::date, v_resp) then
      -- (c) No ha contestado: se cancela solo, sin coste.
      update envios set estado = 'cancelado' where id = r.id;   -- sin coste: lo marca fn_envios_aa_sin_camion
      perform registrar_hito(r.id, 'incidencia', null, null,
        jsonb_build_object('motivo_cancelacion', 'Sin camión: no encontramos transportista para tus fechas y no se eligió otra. Sin ningún coste.', 'por', 'sistema'), 'servidor');
      -- «Repetir envío» en el email de cancelación (aún no ha salido: espera su plazo).
      update emails_enviados
         set cuerpo_html = replace(cuerpo_html, 'No se ha generado ningún coste de cancelación.</p>',
               'No se ha generado ningún coste de cancelación.</p>'
               || format('<p>Si aún necesitas el transporte, repítelo con otra fecha en un momento:</p><p><a href="%s/panel/nuevo-envio?repetir=%s" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">Repetir envío</a></p>', escapar_html(v_url), r.id))
       where envio_id = r.id and tipo = 'envio_cancelado' and estado = 'pendiente';
      perform crear_aviso('cliente', r.cliente_id, null, 'envio', 'aviso', 'Envío cancelado sin coste · ' || v_ref,
        'No encontramos camión y no se eligió otra fecha. Si aún lo necesitas, pulsa para repetirlo.', '/panel/nuevo-envio?repetir=' || r.id, r.id);
      perform crear_aviso('dynamo', null, null, 'envio', case when r.estado_pago_previo = 'pagado' then 'urgente' else 'info' end,
        case when r.estado_pago_previo = 'pagado' then 'Devolver el pago · envío sin camión ' else 'Cancelado sin camión · ' end || v_ref,
        coalesce(v_cli, 'Cliente') || ': se ha cancelado solo, sin coste, por no tener camión ni otra fecha.'
          || case when r.estado_pago_previo = 'pagado' then ' ESTABA PAGADO: hay que devolverle el pago.' else '' end,
        '/panel/envios?ver=' || r.id, r.id);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.revisar_envios_sin_camion() from public, anon, authenticated;
comment on function public.revisar_envios_sin_camion() is '[Sistema y tareas automáticas] Tarea de cada hora: envíos programados cuya fecha de carga ha pasado sin transportista. Con ventana y la casilla marcada, amplía la ventana una vez (sin_camion_ampliar_dias); si no, los deja «Sin camión · elige nueva fecha» con email y aviso al cliente y a Dynamo; si el cliente no contesta en sin_camion_respuesta_dias días hábiles, los cancela sin coste (con «Repetir envío» en el email y aviso a Dynamo para devolver el pago si estaba pagado). Devuelve cuántos ha tocado. Quién: servidor (tarea automática), consola o Dynamo. Argumentos: sin argumentos.';

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'dynamo-sin-camion';
    perform cron.schedule('dynamo-sin-camion', '17 * * * *', 'select public.revisar_envios_sin_camion()');
  end if;
end $$;

-- ---- 4. Tipo de email --------------------------------------------------------------------
do $$
declare v_def text; v_lista text[];
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'emails_enviados_tipo_check' and conrelid = 'emails_enviados'::regclass;
  if position('{' in v_def) > 0 then
    v_lista := string_to_array(substring(v_def from '\{([^}]*)\}'), ',');
  else
    select array_agg(m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(array_length(v_lista, 1), 0) < 30 then
    raise exception 'No se ha podido leer la lista de tipos de email (%): revisar antes de aplicar.', v_def;
  end if;
  select array_agg(distinct x order by x) into v_lista from unnest(v_lista || array['sin_camion']) as x;
  alter table emails_enviados drop constraint emails_enviados_tipo_check;
  execute format('alter table emails_enviados add constraint emails_enviados_tipo_check check (tipo = any (%L::text[]))', v_lista);
end $$;

-- ---- 5. La ficha del cliente sabe si está sin camión ----------------------------------------
drop function if exists public.mi_cambio_envio(uuid);
create function public.mi_cambio_envio(p_envio uuid)
returns table(cambio jsonb, estado text, en timestamptz, nota text, modificable boolean, con_camion boolean, precio_a_mano boolean,
              sin_camion_desde timestamptz, sin_camion_cancela date)
language sql stable security definer set search_path = public as $$
  select e.cambio_cliente, e.estado_cambio_cliente, e.cambio_cliente_en, e.cambio_cliente_nota,
         e.estado = 'programado' and not coalesce(e.es_manual, false),
         coalesce(envio_con_transportista(e.id), false),
         coalesce(e.precio_fijado_a_mano, false),
         e.sin_camion_desde,
         case when e.sin_camion_desde is not null
              then sumar_dias_habiles((e.sin_camion_desde at time zone 'Europe/Madrid')::date, greatest(parametro_num('sin_camion_respuesta_dias', 2), 1)::int) end
    from envios e where e.id = p_envio and envio_del_cliente(p_envio)
$$;
revoke execute on function public.mi_cambio_envio(uuid) from public, anon;
grant execute on function public.mi_cambio_envio(uuid) to authenticated;
comment on function public.mi_cambio_envio(uuid) is '[Envíos] Para la ficha del cliente: su último cambio pedido (estado, cuándo, nota de Dynamo), si el envío se puede modificar, si ya tiene camión, si el precio lo fijó Dynamo a mano y, si se quedó sin camión, desde cuándo y qué día se cancela solo si no elige otra fecha. Quién: cliente dueño del envío. Argumentos: p_envio: envios.id.';
