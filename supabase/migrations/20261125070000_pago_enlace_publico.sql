-- =====================================================================================
-- ENLACE DE PAGO PÚBLICO, SIN ENTRAR EN LA PLATAFORMA (usuario, 2026-11-25)
-- =====================================================================================
-- «¿Cómo ves que el enlace de pago abra fuera del login de Dynamo? Ahora obliga a login para
-- verlo… una ventana simple con poca info… por si le quiere rebotar ese mail de pago a otro
-- departamento que no tiene acceso a la plataforma.» Y decidió: en esa página va también «Ya
-- he hecho la transferencia» y se enseña la ruta por paradas (recogida o entrega, con su
-- población y su hora prevista), la fecha de carga, la mercancía y el precio.
--
-- CÓMO QUEDA: cada envío tiene una LLAVE de pago (larga, al azar, imposible de adivinar). La
-- página /pago/<llave> solo enseña algo mientras el envío está PENDIENTE DE PAGO: lo mínimo
-- para saber qué se paga y pagarlo. Sin calles, sin nombres de empresas de las paradas, sin
-- contactos y sin acceso a nada más. Pagado o anulado, solo lo dice.
--   1. envios.pago_token: la llave.
--   2. etapas_envio_interno: las horas previstas de cada parada, para usarlas desde aquí
--      (etapas_envio sigue igual: comprueba el permiso y llama a la interna).
--   3. pago_publico(llave): los datos de la página.
--   4. pago_publico_avisar(llave): «Ya he hecho la transferencia» desde el enlace.
--   5. El botón «Pagar el envío» del email de «Envío creado» lleva a esa página.

-- ---- 1. La llave -----------------------------------------------------------------------------
alter table public.envios add column if not exists pago_token uuid not null default gen_random_uuid();
create unique index if not exists envios_pago_token_idx on public.envios (pago_token);
comment on column public.envios.pago_token is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Llave del enlace de pago público del envío (/pago/<llave>): quien la tiene puede ver lo mínimo del envío y pagarlo mientras está pendiente de pago, sin entrar en la plataforma. Va en el botón «Pagar el envío» del email. Única por envío y al azar.';

-- ---- 2. Las etapas, sin la comprobación de permiso (solo para funciones de la base de datos) ----
do $$ declare v text; n text; v_ret text; v_vol text; begin
  v := pg_get_functiondef('public.etapas_envio(uuid)'::regprocedure);
  if position('if not puede_ver_envio(p_envio) then return; end if;' in v) = 0 or position('FUNCTION public.etapas_envio(' in v) = 0 then
    raise exception 'etapas_envio: no encuentro la comprobación de permiso o la cabecera';
  end if;
  n := replace(replace(v, 'FUNCTION public.etapas_envio(', 'FUNCTION public.etapas_envio_interno('),
               'if not puede_ver_envio(p_envio) then return; end if;', '');
  execute n;
  select pg_get_function_result(p.oid), case p.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end
    into v_ret, v_vol from pg_proc p where p.oid = 'public.etapas_envio(uuid)'::regprocedure;
  -- La de siempre: comprueba el permiso y devuelve lo de la interna (una sola copia del cálculo).
  execute 'create or replace function public.etapas_envio(p_envio uuid) returns ' || v_ret
    || ' language plpgsql ' || v_vol || ' security definer set search_path to ''public'' as $f$'
    || ' begin if not puede_ver_envio(p_envio) then return; end if;'
    || ' return query select * from etapas_envio_interno(p_envio); end $f$';
end $$;
revoke all on function public.etapas_envio_interno(uuid) from public, anon, authenticated;
comment on function public.etapas_envio_interno(uuid) is '[Ayudantes internos] Las etapas del seguimiento de un envío con su hora real o prevista, SIN comprobar quién pregunta: el cálculo de etapas_envio, que ahora solo comprueba el permiso y llama a esta. Para usar desde otras funciones de la base de datos (p. ej. la página pública de pago). OJO: si se cambia el cálculo, se cambia AQUÍ, no en etapas_envio. Quién: nadie por la API. Argumentos: p_envio: envios.id.';

-- ---- 3. Lo que enseña la página de pago ----------------------------------------------------
create or replace function public.pago_publico(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e record; i record; d jsonb; v_limite timestamptz; v_paradas jsonb; v_cli text;
begin
  if p_token is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  select x.id, x.referencia_gx, x.estado, x.estado_pago_previo, x.pago_pendiente_en, x.pago_a_cuenta, x.pago_avisado_en,
         x.fecha_carga_desde, x.fecha_carga_hasta, x.es_manual, x.estado_revision_precio,
         x.metros_lineales, x.toneladas, x.descripcion_mercancia, x.paletizado, x.cliente_id
    into e from envios x where x.pago_token = p_token;
  if not found then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  if e.estado = 'cancelado' then return jsonb_build_object('resultado', 'anulado', 'referencia', e.referencia_gx); end if;
  if e.estado_pago_previo = 'pagado' then return jsonb_build_object('resultado', 'pagado', 'referencia', e.referencia_gx); end if;
  if e.estado_pago_previo <> 'pendiente' or e.estado <> 'programado' or coalesce(e.es_manual, false)
     or coalesce(precio_por_revisar(e.estado_revision_precio), false) then
    return jsonb_build_object('resultado', 'no_disponible', 'referencia', e.referencia_gx);
  end if;
  select * into i from pago_envio_importes(e.id);
  -- El plazo, con el mismo criterio que la ficha: parado si ya hay algo pagado o la transferencia está avisada.
  if e.pago_pendiente_en is not null and coalesce(e.pago_a_cuenta, 0) = 0 and e.pago_avisado_en is null then
    v_limite := pago_limite(e.pago_pendiente_en, e.fecha_carga_desde);
  end if;
  -- Las paradas: qué es cada una, dónde (sin calle ni empresa) y su hora prevista.
  with et as (select t.parada, t.hora from etapas_envio_interno(e.id) t where t.estado = 'cargando'),
       ps as (select p.*, row_number() over (order by p.orden) as num from envio_paradas p where p.envio_id = e.id)
  select coalesce(jsonb_agg(jsonb_build_object('num', ps.num, 'tipo', ps.tipo, 'codigo_postal', ps.codigo_postal, 'poblacion', ps.poblacion,
           'provincia', ps.provincia, 'pais', ps.pais_codigo_iso, 'prevista', (select et.hora from et where et.parada = ps.num limit 1)) order by ps.num), '[]')
    into v_paradas from ps;
  select nombre_visible into v_cli from clientes where id = e.cliente_id;
  d := datos_dynamo();
  return jsonb_build_object('resultado', 'pendiente', 'referencia', e.referencia_gx, 'cliente', v_cli,
    'base', i.base, 'iva_pct', i.iva, 'total', i.total, 'a_cuenta', coalesce(e.pago_a_cuenta, 0),
    'pendiente', greatest(i.total - coalesce(e.pago_a_cuenta, 0), 0),
    'pago_limite', v_limite, 'avisado_en', e.pago_avisado_en,
    'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,
    'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas, 'descripcion_mercancia', e.descripcion_mercancia, 'paletizado', e.paletizado,
    'paradas', v_paradas,
    'transferencia', case when nullif(btrim(coalesce(d ->> 'iban', '')), '') is not null
      then jsonb_build_object('beneficiario', d ->> 'razon_social', 'iban', d ->> 'iban', 'banco', d ->> 'banco', 'bic', d ->> 'bic', 'concepto', 'PRO-' || e.referencia_gx) end);
end $$;
comment on function public.pago_publico(uuid) is '[Precio y pago] Lo que enseña la página pública de pago de un envío (/pago/<llave>), sin sesión: si está pendiente de pago, su referencia, el cliente, el importe (base, IVA, total y lo que falta), hasta cuándo se puede pagar, si la transferencia ya está avisada, la fecha de carga, la mercancía, las paradas (recogida o entrega, código postal, población, provincia, país y hora prevista; sin calle, sin empresa y sin contactos) y los datos para la transferencia. Si ya está pagado, anulado o no se puede pagar, solo lo dice (resultado: pagado, anulado, no_disponible, enlace_no_valido). Quién: cualquiera con la llave. Argumentos: p_token: envios.pago_token.';
revoke all on function public.pago_publico(uuid) from public;
grant execute on function public.pago_publico(uuid) to anon, authenticated, service_role;

-- ---- 4. «Ya he hecho la transferencia» ---------------------------------------------------------
-- Lo común (parar el plazo y avisar) pasa a una función interna; la del cliente comprueba
-- quién es y la del enlace público, que la llave sea buena.
create or replace function public.fn_pago_avisar(p_envio uuid, p_por_enlace boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e record; v_ref text; v_cli text;
begin
  select id, cliente_id, referencia_gx, estado, estado_pago_previo, pago_avisado_en, es_manual, estado_revision_precio
    into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if e.estado <> 'programado' or e.estado_pago_previo <> 'pendiente' or coalesce(e.es_manual, false) then
    return jsonb_build_object('resultado', 'no_pendiente');
  end if;
  if coalesce(precio_por_revisar(e.estado_revision_precio), false) then return jsonb_build_object('resultado', 'precio_provisional'); end if;
  if e.pago_avisado_en is not null then return jsonb_build_object('resultado', 'ya_avisado', 'avisado_en', e.pago_avisado_en); end if;

  update envios set pago_avisado_en = now() where id = p_envio;
  v_ref := '#' || e.referencia_gx;
  select nombre_visible into v_cli from clientes where id = e.cliente_id;
  perform crear_aviso('dynamo', null, null, 'pago_avisado', 'urgente', 'Transferencia avisada: valida el cobro · ' || v_ref,
    coalesce(v_cli, 'El cliente') || ' dice que ya ha hecho la transferencia (PRO-' || e.referencia_gx || ')'
    || case when p_por_enlace then ', avisado desde el enlace de pago (sin entrar en la plataforma)' else '' end
    || '. Mira el banco y márcala como recibida, o recházala si no ha llegado. El plazo para pagar está parado.',
    '/panel/envios?ver=' || p_envio, p_envio);
  perform crear_aviso('cliente', e.cliente_id, null, 'pago_avisado', 'info', 'Estamos validando tu transferencia · ' || v_ref,
    'Hemos recibido ' || case when p_por_enlace then 'el aviso de la transferencia desde el enlace de pago' else 'tu aviso' end
    || '. El plazo para pagar queda parado mientras comprobamos el cobro.', '/panel/envios?ver=' || p_envio, p_envio);
  perform fn_email_envio_cliente(p_envio, 'pago_avisado:' || p_envio || ':' || extract(epoch from now())::bigint, 'pago_avisado', 'Transferencia avisada: la estamos validando',
    '<p>Hemos recibido ' || case when p_por_enlace then 'el aviso, desde el enlace de pago, de que ya está hecha' else 'tu aviso de que ya has hecho' end
    || ' la <strong>transferencia</strong> de este envío (concepto <strong>PRO-' || e.referencia_gx || '</strong>).</p>'
    || '<p><strong>El plazo para pagar queda parado</strong>: el envío no se anula mientras comprobamos el cobro en el banco. En cuanto lo validemos pasa a programación y te avisamos.</p>'
    || '<p>Si no nos consta la transferencia, el envío se anulará y te lo diremos.</p>');
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke all on function public.fn_pago_avisar(uuid, boolean) from public, anon, authenticated;
comment on function public.fn_pago_avisar(uuid, boolean) is '[Ayudantes internos] Apunta que la transferencia de un envío pendiente de pago está avisada: para el plazo y avisa a Dynamo (para validarla en el banco) y al cliente. No comprueba quién llama: lo hacen avisar_pago_transferencia (el cliente o Dynamo) y pago_publico_avisar (el enlace de pago). Quién: nadie por la API. Argumentos: p_envio: envios.id · p_por_enlace: si se avisó desde el enlace público.';

create or replace function public.avisar_pago_transferencia(p_envio uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cli uuid;
begin
  select cliente_id into v_cli from envios where id = p_envio;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  -- Solo el cliente dueño del envío, o Dynamo en su nombre (se lo dicen por teléfono).
  if not (es_equipo_dynamo() or (cliente_del_usuario() is not null and v_cli = cliente_del_usuario())) then
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  if es_equipo_dynamo() and es_solo_lectura() then raise exception 'Tu usuario es de solo lectura.' using errcode = '42501'; end if;
  return fn_pago_avisar(p_envio, false);
end $$;

create or replace function public.pago_publico_avisar(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_token is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  select id into v_id from envios where pago_token = p_token;
  if v_id is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  return fn_pago_avisar(v_id, true);
end $$;
comment on function public.pago_publico_avisar(uuid) is '[Precio y pago] «Ya he hecho la transferencia» desde la página pública de pago (/pago/<llave>), sin sesión: para el plazo del envío y avisa a Dynamo para que la valide en el banco (si no consta, el envío se anula). Solo en envíos pendientes de pago; avisar dos veces no hace nada. Devuelve resultado: ok, ya_avisado, no_pendiente, precio_provisional o enlace_no_valido. Quién: cualquiera con la llave. Argumentos: p_token: envios.pago_token.';
revoke all on function public.pago_publico_avisar(uuid) from public;
grant execute on function public.pago_publico_avisar(uuid) to anon, authenticated, service_role;

-- ---- 5. El botón «Pagar el envío» del email lleva a la página de pago ------------------------
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.fn_email_envio_creado()'::regprocedure);
  n := replace(v, '''/panel/envios?ver='' || e.id;', '''/pago/'' || e.pago_token;');
  n := replace(n, 'select id, estado, estado_pago_previo,', 'select id, pago_token, estado, estado_pago_previo,');
  n := replace(n, 'avísanos con el botón «Ya he hecho la transferencia» de la ficha', 'avísanos con el botón «Ya he hecho la transferencia» (lo tienes al pulsar «Pagar el envío» y en la ficha)');
  if position('''/pago/'' || e.pago_token' in n) = 0 or position('select id, pago_token, estado' in n) = 0
     or position('lo tienes al pulsar «Pagar el envío»' in n) = 0 then
    raise exception 'fn_email_envio_creado: no encuentro el enlace del botón de pago';
  end if;
  execute n;
end $$;
