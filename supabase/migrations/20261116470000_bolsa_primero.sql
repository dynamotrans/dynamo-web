-- =====================================================================================
-- LA BOLSA DE CARGAS VA PRIMERO (usuario, 2026-11-16)
-- =====================================================================================
-- «Prefiero al revés: primero bolsa de carga, para ampliar la red de transportistas; si
-- no, siempre me aceptan los que ya tengo.» Hasta hoy los emails de la oferta escalonada
-- a los transportistas propios no miraban la bolsa. Desde hoy:
--
--   1. El envío entra en el fichero de la bolsa como pronto 12 DÍAS antes de la carga
--      (parámetro bolsa_dias_antes). Antes, ni bolsa ni emails.
--   2. Los emails a los transportistas propios siguen empezando como pronto 5 días antes
--      (difusion_dias_antes), y ADEMÁS nunca antes que la bolsa: salen un margen después
--      de publicarlo en la bolsa, según lo que falte para la carga al publicar:
--          3 días o más → 3 horas · 2 días → 2 horas · carga mañana → 15 min · hoy → 5 min
--      (cuatro parámetros). Mientras no esté publicado, los emails esperan y Dynamo
--      recibe aviso.
--   3. Red de seguridad: si la carga es hoy o mañana y sigue sin publicar en la bolsa,
--      los emails salen igual (un envío nunca se queda sin ofrecer por un olvido).
--   4. La espera solo afecta al ARRANQUE: una oferta que ya ha contactado a alguien no
--      se vuelve a parar por la bolsa (ni al volver a publicar un envío modificado, ni
--      al reanudarse tras quedarse sin transportista).
--   5. Si un envío publicado en la bolsa recibe transportista o se cancela, deja de
--      constar como publicado y Dynamo recibe aviso de retirarlo allí. Si después se
--      queda sin transportista, vuelve solo al fichero de pendientes.
--
-- Publicar sigue siendo, por ahora, subir el fichero de Exportaciones y marcarlo como
-- publicado; la conexión automática con la bolsa llegará al final. Todo se puede apagar
-- con el interruptor bolsa_primero.

-- ---- 1. Parámetros -------------------------------------------------------------------
insert into parametros (clave, valor, descripcion) values
  ('bolsa_primero', 'true',
   'La bolsa va primero: los emails de la oferta escalonada a los transportistas propios esperan a que el envío esté publicado en la bolsa (más un margen). false = los emails no miran la bolsa.'),
  ('bolsa_dias_antes', '12',
   'Bolsa de cargas: días antes del primer día de carga en que el envío entra en el fichero de la bolsa. Antes no se publica.'),
  ('bolsa_margen_3dias_min', '180',
   'Bolsa primero: minutos que esperan los emails a los transportistas propios desde que el envío se publica en la bolsa, cuando al publicar faltan 3 días o más para la carga.'),
  ('bolsa_margen_2dias_min', '120',
   'Bolsa primero: minutos que esperan los emails desde la publicación en la bolsa, cuando al publicar faltan 2 días para la carga.'),
  ('bolsa_margen_manana_min', '15',
   'Bolsa primero: minutos que esperan los emails desde la publicación en la bolsa, cuando la carga es al día siguiente.'),
  ('bolsa_margen_hoy_min', '5',
   'Bolsa primero: minutos que esperan los emails desde la publicación en la bolsa, cuando la carga es el mismo día.')
on conflict (clave) do nothing;

-- ---- 2. El fichero de la bolsa: solo lo que carga en los próximos 12 días -------------
do $$
declare v_def text := rtrim(rtrim(pg_get_viewdef('public.v_wtransnet'::regclass, true)), ';');
begin
  if v_def not like '%bolsa_espera_minutos%' or v_def ~* '\m(group by|order by|limit)\M[^)]*$' then
    raise exception 'La vista v_wtransnet no es la que se esperaba: revisar antes de aplicar.';
  end if;
  execute 'create or replace view public.v_wtransnet with (security_invoker = true) as ' || v_def || $v$
  and (e.fecha_carga_desde is null
       or e.fecha_carga_desde <= (now() at time zone 'Europe/Madrid')::date
            + coalesce((select (p.valor #>> '{}')::int from parametros p where p.clave = 'bolsa_dias_antes'), 12))$v$;
end $$;
comment on view v_wtransnet is
  'Fichero de subida a Wtransnet, identico a dy_fichero_wtransnet. Envios programados sin '
  'transportista, quietos desde hace bolsa_espera_minutos y que cargan dentro de los proximos '
  'bolsa_dias_antes dias (o sin fecha). Solo Dynamo.';

-- ---- 3. Cuánto esperan los emails a la bolsa ------------------------------------------
create or replace function fn_bolsa_margen_minutos(p_dias int)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce((parametro(case when p_dias >= 3 then 'bolsa_margen_3dias_min'
                                             when p_dias = 2 then 'bolsa_margen_2dias_min'
                                             when p_dias = 1 then 'bolsa_margen_manana_min'
                                             else 'bolsa_margen_hoy_min' end))::text::int, 0));
$$;
revoke execute on function fn_bolsa_margen_minutos(int) from public, anon, authenticated;
comment on function public.fn_bolsa_margen_minutos(int) is '[Gestión interna] Minutos que esperan los emails de la oferta escalonada desde que el envío se publica en la bolsa, según los días que faltaban para la carga al publicar (3 o más, 2, mañana u hoy: cuatro parámetros bolsa_margen_*). Quién: interno. Argumentos: p_dias: días entre la publicación y el primer día de carga.';

create or replace function fn_difusion_bolsa(p_envio uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e record; v_hoy date := (now() at time zone 'Europe/Madrid')::date;
        v_quieto int; v_min int; v_desde timestamptz;
begin
  if coalesce((parametro('bolsa_primero'))::text, 'true') <> 'true' then return jsonb_build_object('espera', null); end if;
  select operador_id, fecha_carga_desde, publicado_en_bolsa_en, creado_en into e from envios where id = p_envio;
  -- Sin fecha de carga o de otro operador: la bolsa no pinta nada.
  if not found or e.operador_id is not null or e.fecha_carga_desde is null then return jsonb_build_object('espera', null); end if;

  if e.publicado_en_bolsa_en is null then
    -- Red de seguridad: carga hoy o mañana y sin publicar → los emails salen igual (pasada
    -- la espera de recién creado, la misma del fichero de la bolsa).
    if e.fecha_carga_desde - v_hoy <= 1 then
      v_quieto := greatest(0, coalesce((parametro('bolsa_espera_minutos'))::text::int, 3));
      v_desde := e.creado_en + make_interval(mins => v_quieto);
      if now() < v_desde then return jsonb_build_object('espera', 'quieto', 'desde', v_desde); end if;
      return jsonb_build_object('espera', null, 'sin_bolsa', true);
    end if;
    return jsonb_build_object('espera', 'bolsa');
  end if;

  v_min := fn_bolsa_margen_minutos(greatest(0, e.fecha_carga_desde - (e.publicado_en_bolsa_en at time zone 'Europe/Madrid')::date));
  v_desde := e.publicado_en_bolsa_en + make_interval(mins => v_min);
  if now() < v_desde then return jsonb_build_object('espera', 'margen', 'desde', v_desde, 'minutos', v_min); end if;
  return jsonb_build_object('espera', null);
end $$;
revoke execute on function fn_difusion_bolsa(uuid) from public, anon, authenticated;
comment on function public.fn_difusion_bolsa(uuid) is '[Gestión interna] ¿Tienen que esperar a la bolsa los emails de la oferta escalonada de un envío? Devuelve {espera: null (pueden salir) | bolsa (aún no está publicado en la bolsa) | margen (publicado, pero dentro del margen: trae desde y minutos) | quieto (recién creado, carga hoy o mañana sin publicar), sin_bolsa: true si salen sin haberse publicado por ser la carga hoy o mañana}. Apagado con el parámetro bolsa_primero. Quién: interno (el paso de la oferta escalonada). Argumentos: p_envio: envios.id.';

create or replace function difusion_espera_bolsa(p_envio uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when ve_todo() then fn_difusion_bolsa(p_envio) else jsonb_build_object('espera', null) end;
$$;
revoke execute on function difusion_espera_bolsa(uuid) from public, anon;
grant execute on function difusion_espera_bolsa(uuid) to authenticated;
comment on function public.difusion_espera_bolsa(uuid) is '[Ofertas y transportistas] Para la ficha del envío: si los emails de la oferta escalonada están esperando a la bolsa y hasta cuándo. Devuelve {espera: null | bolsa | margen | quieto, desde, minutos, sin_bolsa}. A quien no es de Dynamo le devuelve siempre espera: null. Quién: Dynamo (también solo lectura). Argumentos: p_envio: envios.id.';

-- Aviso a Dynamo (como mucho uno cada 12 horas por envío) de que los emails esperan.
create or replace function fn_difusion_avisa_bolsa(p_envio uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ref text;
begin
  if exists (select 1 from avisos where tipo = 'bolsa_pendiente' and envio_id = p_envio and creado_en > now() - interval '12 hours') then return; end if;
  select referencia_gx into v_ref from envios where id = p_envio;
  perform crear_aviso('dynamo', null, null, 'bolsa_pendiente', 'aviso',
    format('Sube a la bolsa el envío #%s', v_ref),
    'Los emails a tus transportistas esperan a que esté publicado en la bolsa: súbelo desde Exportaciones y márcalo como publicado.',
    '/panel/exportaciones', p_envio);
end $$;
revoke execute on function fn_difusion_avisa_bolsa(uuid) from public, anon, authenticated;
comment on function public.fn_difusion_avisa_bolsa(uuid) is '[Gestión interna] Avisa a Dynamo en la campana de que la oferta escalonada de un envío está esperando a que se publique en la bolsa. Como mucho un aviso cada 12 horas por envío. Quién: interno (el paso de la oferta escalonada). Argumentos: p_envio: envios.id.';

-- ---- 4. El paso de la oferta escalonada espera a la bolsa para ARRANCAR ---------------
do $$
declare v_oid oid := 'public.fn_difusion_paso(uuid)'::regprocedure; v_def text; v_nueva text;
begin
  v_def := pg_get_functiondef(v_oid);
  v_nueva := replace(v_def,
    'if d.empieza_en is not null and now() < d.empieza_en then return; end if;',
    'if d.empieza_en is not null and now() < d.empieza_en then return; end if;' || chr(10) || chr(10) ||
    '  -- LA BOLSA VA PRIMERO (usuario, 2026-11-16): antes de contactar al primero, los' || chr(10) ||
    '  -- emails esperan a que el envío esté publicado en la bolsa, más su margen.' || chr(10) ||
    '  if d.contactados = 0 and (fn_difusion_bolsa(d.envio_id) ->> ''espera'') is not null then' || chr(10) ||
    '    if fn_difusion_bolsa(d.envio_id) ->> ''espera'' = ''bolsa'' then perform fn_difusion_avisa_bolsa(d.envio_id); end if;' || chr(10) ||
    '    return;' || chr(10) ||
    '  end if;');
  if v_nueva = v_def then raise exception 'No encuentro el arranque en fn_difusion_paso: revisar antes de aplicar.'; end if;
  execute v_nueva;
  execute format('comment on function public.fn_difusion_paso(uuid) is %L',
    obj_description(v_oid, 'pg_proc') || ' La bolsa va primero: antes de contactar al primero espera a que el envío esté publicado en la bolsa y pase su margen (fn_difusion_bolsa).');
end $$;

-- ---- 5. Con transportista o cancelado: fuera de la bolsa -------------------------------
create or replace function fn_envios_bolsa_retirar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.publicado_en_bolsa_en is not null
     and ((new.transportista_id is not null and old.transportista_id is null)
          or (new.estado = 'cancelado' and old.estado <> 'cancelado')) then
    new.publicado_en_bolsa_en := null;
    perform crear_aviso('dynamo', null, null, 'bolsa_retirar', 'aviso',
      format('Retira de la bolsa el envío #%s', new.referencia_gx),
      case when new.estado = 'cancelado' then 'El envío se ha cancelado' else 'El envío ya tiene transportista' end
        || ' y estaba publicado en la bolsa: quítalo allí para que no sigan llamando por él.',
      '/panel/envios?ver=' || new.id, new.id);
  end if;
  return new;
end $$;
revoke execute on function fn_envios_bolsa_retirar() from public, anon, authenticated;
comment on function public.fn_envios_bolsa_retirar() is '[Disparadores] Cuando un envío publicado en la bolsa recibe transportista o se cancela, deja de constar como publicado (si después se queda sin transportista vuelve solo al fichero de pendientes) y avisa a Dynamo de retirarlo en la bolsa. Quién: disparador de envios.';
create trigger tg_envios_ag_bolsa_retirar before update on envios
  for each row when (old.publicado_en_bolsa_en is not null)
  execute function fn_envios_bolsa_retirar();
