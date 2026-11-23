-- ⚠️ BORRADOR PARA V3 — NO ES UNA MIGRACIÓN (usuario, 2026-11-23: «dejamos eso del pack para v3,
-- no quiero liar ahora; déjalo planteado y en otra fase»). Probado en local con la prueba 330
-- (packs-prueba-330-BORRADOR.sql). Para retomarlo: copiarlo a supabase/migrations/ con fecha nueva,
-- revisar las agujas contra las funciones de ese momento y encender PACKS_GRUPAJE en lib/modulos.ts.

-- OFRECER EL PACK DE GRUPAJE ENTERO (usuario, 2026-11-23: «suma de las partidas y sí, que se
-- salte las del pack»).
--
-- Un pack se ofrece como UN SOLO VIAJE, siempre desde su partida LÍDER (la que marca la ruta):
--   · El PRECIO del pack es la SUMA de los precios del transportista de sus partidas. Al
--     ofrecerlo, o al aceptarlo un transportista por otro precio (contraoferta), el total se
--     reparte entre las partidas en proporción a lo que tenía cada una.
--   · Las demás partidas NO se ofrecen sueltas: ni a mano ni en la oferta por tandas.
--   · Lo que ve el transportista — la página «Aceptar carga», el email «Carga disponible» y la
--     fila de la bolsa — enseña el pack entero: metros y peso totales, el día común, todas las
--     paradas (primero las recogidas y luego las entregas) y el precio total.
--   · Si un transportista ACEPTA el pack (la partida líder), se le dan todas las partidas.
--   · Si el pack cambia (se crea, se añade o se quita una partida), las ofertas que había se
--     retiran: el precio y el contenido ya no son los mismos y hay que volver a ofrecerlo.

-- ---- Resumen del pack abierto de un envío (null si no va en uno) -------------------------
create or replace function pack_resumen(p_envio uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', k.id, 'codigo', k.codigo, 'lider', k.lider_envio_id,
           'n', count(x.id), 'metros_lineales', sum(x.metros_lineales), 'toneladas', sum(coalesce(x.toneladas, 0)),
           'desde', max(x.fecha_carga_desde), 'hasta', min(coalesce(x.fecha_carga_hasta, x.fecha_carga_desde)),
           'importe_transportista', sum(x.importe_transportista),
           'paradas', (select count(*) from envio_paradas p where p.envio_id = any(array_agg(x.id))))
    from envios e join packs k on k.id = e.pack_id and k.estado = 'abierto'
    join envios x on x.pack_id = k.id
   where e.id = p_envio
   group by k.id, k.codigo, k.lider_envio_id
$$;
revoke all on function pack_resumen(uuid) from public, anon, authenticated;

-- Las partidas del pack abierto del envío (o solo él, si va suelto).
create or replace function pack_miembros(p_envio uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce((select array_agg(x.id order by x.fecha_carga_desde, x.referencia_gx)
                     from envios e join packs k on k.id = e.pack_id and k.estado = 'abierto'
                     join envios x on x.pack_id = k.id where e.id = p_envio), array[p_envio])
$$;
revoke all on function pack_miembros(uuid) from public, anon, authenticated;

-- ¿Es una partida de un pack abierto que NO es la líder? (esas no se ofrecen sueltas)
create or replace function pack_es_secundaria(p_envio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from envios e join packs k on k.id = e.pack_id
                  where e.id = p_envio and k.estado = 'abierto' and k.lider_envio_id is distinct from e.id)
$$;
revoke all on function pack_es_secundaria(uuid) from public, anon, authenticated;

-- Reparte un precio total entre las partidas del pack, en proporción a lo que tenía cada una
-- (la líder pesa p_peso_lider, su parte de antes); si alguna no tenía precio, por metros. Lo
-- que sobra del redondeo, a la líder.
create or replace function pack_repartir_precio(p_pack uuid, p_total numeric, p_lider uuid, p_peso_lider numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_pesos numeric; v_porm boolean; v_suma numeric;
begin
  if p_pack is null or coalesce(p_total, 0) <= 0 then return; end if;
  select bool_or(coalesce(case when id = p_lider then p_peso_lider else importe_transportista end, 0) <= 0)
    into v_porm from envios where pack_id = p_pack;
  select sum(case when v_porm then coalesce(metros_lineales, 0) else case when id = p_lider then p_peso_lider else importe_transportista end end)
    into v_pesos from envios where pack_id = p_pack;
  if coalesce(v_pesos, 0) <= 0 then return; end if;
  update envios set importe_transportista = round(p_total * (case when v_porm then coalesce(metros_lineales, 0) else importe_transportista end) / v_pesos, 2)
   where pack_id = p_pack and id <> p_lider;
  select coalesce(sum(importe_transportista), 0) into v_suma from envios where pack_id = p_pack and id <> p_lider;
  update envios set importe_transportista = p_total - v_suma where id = p_lider;
end $$;
revoke all on function pack_repartir_precio(uuid, numeric, uuid, numeric) from public, anon, authenticated;

-- Retira las ofertas vivas de las partidas (el pack ha cambiado: hay que volver a ofrecerlo).
create or replace function pack_retirar_ofertas(p_envios uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  update envio_ofertas set estado = 'revocada' where envio_id = any(p_envios) and estado = 'activa';
  foreach v in array coalesce(p_envios, '{}') loop
    if exists (select 1 from difusiones where envio_id = v and estado = 'activa') then
      update difusiones set estado = 'parada', terminada_en = now(),
             fin_motivo = 'El envío ha entrado en un pack de grupaje (o el pack ha cambiado): se ofrece el pack entero.'
       where envio_id = v and estado = 'activa';
    end if;
  end loop;
end $$;
revoke all on function pack_retirar_ofertas(uuid[]) from public, anon, authenticated;

do $do$
declare d text; n int;
  procedure_cuenta text;
begin
  -- ---- crear_pack: al cambiar el pack, fuera las ofertas que había --------------------------
  d := pg_get_functiondef('crear_pack(uuid[], uuid)'::regprocedure);
  n := (length(d) - length(replace(d, '  update envios set pack_id = k.id where id = any(v_todos) and pack_id is distinct from k.id;', ''))) / length('  update envios set pack_id = k.id where id = any(v_todos) and pack_id is distinct from k.id;');
  if n <> 1 then raise exception 'crear_pack: aguja (%)', n; end if;
  d := replace(d, '  update envios set pack_id = k.id where id = any(v_todos) and pack_id is distinct from k.id;',
    E'  update envios set pack_id = k.id where id = any(v_todos) and pack_id is distinct from k.id;\n  perform pack_retirar_ofertas(v_todos);');
  execute d;

  -- ---- quitar_de_pack y deshacer_pack: también -------------------------------------------
  d := pg_get_functiondef('quitar_de_pack(uuid)'::regprocedure);
  n := (length(d) - length(replace(d, '  update envios set pack_id = null where id = p_envio;', ''))) / length('  update envios set pack_id = null where id = p_envio;');
  if n <> 1 then raise exception 'quitar_de_pack: aguja (%)', n; end if;
  d := replace(d, '  update envios set pack_id = null where id = p_envio;',
    E'  perform pack_retirar_ofertas(array(select id from envios where pack_id = v_pack));\n  update envios set pack_id = null where id = p_envio;');
  execute d;
  d := pg_get_functiondef('deshacer_pack(uuid)'::regprocedure);
  n := (length(d) - length(replace(d, '  update envios set pack_id = null where pack_id = p_pack and transportista_id is null;', ''))) / length('  update envios set pack_id = null where pack_id = p_pack and transportista_id is null;');
  if n <> 1 then raise exception 'deshacer_pack: aguja (%)', n; end if;
  d := replace(d, '  update envios set pack_id = null where pack_id = p_pack and transportista_id is null;',
    E'  perform pack_retirar_ofertas(array(select id from envios where pack_id = p_pack));\n  update envios set pack_id = null where pack_id = p_pack and transportista_id is null;');
  execute d;

  -- ---- ofertar_envio: el pack, solo desde la líder y por el total, que se reparte ----------
  d := pg_get_functiondef('ofertar_envio(uuid, uuid, text, numeric, smallint, boolean)'::regprocedure);
  n := (length(d) - length(replace(d, 'declare v_id uuid; v_estado estado_envio; v_asig estado_asignacion; v_pp boolean;', ''))) / length('declare v_id uuid; v_estado estado_envio; v_asig estado_asignacion; v_pp boolean;');
  if n <> 1 then raise exception 'ofertar_envio: declaración (%)', n; end if;
  d := replace(d, 'declare v_id uuid; v_estado estado_envio; v_asig estado_asignacion; v_pp boolean;',
    'declare v_id uuid; v_estado estado_envio; v_asig estado_asignacion; v_pp boolean; v_pack jsonb; v_prev numeric;');
  n := (length(d) - length(replace(d, E'  v_pp := p_pronto_pago and coalesce(', ''))) / length(E'  v_pp := p_pronto_pago and coalesce(');
  if n <> 1 then raise exception 'ofertar_envio: v_pp (%)', n; end if;
  d := replace(d, E'  v_pp := p_pronto_pago and coalesce(',
    E'  -- Packs de grupaje (2026-11-23): una partida que no es la líder no se ofrece suelta.\n'
    || E'  if pack_es_secundaria(p_envio) then\n'
    || E'    raise exception ''Esta partida va en el pack %: se ofrece el pack entero desde su primera partida (#%).'',\n'
    || E'      (pack_resumen(p_envio) ->> ''codigo''), (select referencia_gx from envios where id = (pack_resumen(p_envio) ->> ''lider'')::uuid);\n'
    || E'  end if;\n'
    || E'  v_pack := pack_resumen(p_envio);\n'
    || E'  select importe_transportista into v_prev from envios where id = p_envio;\n\n'
    || E'  v_pp := p_pronto_pago and coalesce(');
  n := (length(d) - length(replace(d, E'  perform set_config(''dynamo.primera_oferta'', '''', true);', ''))) / length(E'  perform set_config(''dynamo.primera_oferta'', '''', true);');
  if n <> 1 then raise exception 'ofertar_envio: primera_oferta (%)', n; end if;
  d := replace(d, E'  perform set_config(''dynamo.primera_oferta'', '''', true);',
    E'  -- El precio ofertado es el del PACK entero: se reparte entre sus partidas.\n'
    || E'  if v_pack is not null then\n'
    || E'    perform pack_repartir_precio((v_pack ->> ''id'')::uuid, p_precio, p_envio, v_prev);\n'
    || E'    update envios set estado_asignacion = ''ofertada''::estado_asignacion\n'
    || E'     where pack_id = (v_pack ->> ''id'')::uuid and id <> p_envio and estado_asignacion = ''sin_asignar'';\n'
    || E'  end if;\n'
    || E'  perform set_config(''dynamo.primera_oferta'', '''', true);');
  execute d;

  -- ---- iniciar_difusion: la oferta por tandas se salta las partidas que no son la líder ----
  d := pg_get_functiondef('iniciar_difusion(uuid, numeric, smallint, boolean, time without time zone, boolean)'::regprocedure);
  n := (length(d) - length(replace(d, E'  if e.estado <> ''programado'' then return jsonb_build_object(''resultado'', ''no_programado'', ''estado'', e.estado); end if;', ''))) / length(E'  if e.estado <> ''programado'' then return jsonb_build_object(''resultado'', ''no_programado'', ''estado'', e.estado); end if;');
  if n <> 1 then raise exception 'iniciar_difusion: aguja (%)', n; end if;
  d := replace(d, E'  if e.estado <> ''programado'' then return jsonb_build_object(''resultado'', ''no_programado'', ''estado'', e.estado); end if;',
    E'  if e.estado <> ''programado'' then return jsonb_build_object(''resultado'', ''no_programado'', ''estado'', e.estado); end if;\n'
    || E'  -- Packs de grupaje (2026-11-23): las partidas que no son la líder no se ofrecen sueltas.\n'
    || E'  if pack_es_secundaria(p_envio) then\n'
    || E'    return jsonb_build_object(''resultado'', ''en_pack'', ''pack'', pack_resumen(p_envio) ->> ''codigo'',\n'
    || E'      ''lider'', (select referencia_gx from envios where id = (pack_resumen(p_envio) ->> ''lider'')::uuid));\n'
    || E'  end if;');
  execute d;

  -- ---- oferta_publica: la página «Aceptar carga» enseña el pack entero ----------------------
  d := pg_get_functiondef('oferta_publica(uuid)'::regprocedure);
  for procedure_cuenta in select unnest(array[
      $x$'resultado', 'ok',$x$,
      $x$'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,$x$,
      $x$'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas,$x$,
      $x$'precio', coalesce(o.precio_ofertado, e.importe_transportista),$x$,
      $x$'orden', p.orden, 'tipo', p.tipo,$x$,
      $x$order by p.orden), '[]'::jsonb)$x$,
      $x$from envio_paradas p left join sitios l on l.id = p.sitio_id where p.envio_id = e.id)$x$]) loop
    n := (length(d) - length(replace(d, procedure_cuenta, ''))) / length(procedure_cuenta);
    if n <> 1 then raise exception 'oferta_publica: aguja «%» (%)', procedure_cuenta, n; end if;
  end loop;
  d := replace(d, $x$'resultado', 'ok',$x$,
    $x$'resultado', 'ok',
    'pack', case when pack_resumen(e.id) is null then null else jsonb_build_object('codigo', pack_resumen(e.id) ->> 'codigo', 'partidas', (pack_resumen(e.id) ->> 'n')::int) end,$x$);
  d := replace(d, $x$'fecha_carga_desde', e.fecha_carga_desde, 'fecha_carga_hasta', e.fecha_carga_hasta,$x$,
    $x$'fecha_carga_desde', coalesce((pack_resumen(e.id) ->> 'desde')::date, e.fecha_carga_desde), 'fecha_carga_hasta', coalesce((pack_resumen(e.id) ->> 'hasta')::date, e.fecha_carga_hasta),$x$);
  d := replace(d, $x$'metros_lineales', e.metros_lineales, 'toneladas', e.toneladas,$x$,
    $x$'metros_lineales', coalesce((pack_resumen(e.id) ->> 'metros_lineales')::numeric, e.metros_lineales), 'toneladas', coalesce((pack_resumen(e.id) ->> 'toneladas')::numeric, e.toneladas),$x$);
  d := replace(d, $x$'precio', coalesce(o.precio_ofertado, e.importe_transportista),$x$,
    $x$'precio', coalesce(o.precio_ofertado, (pack_resumen(e.id) ->> 'importe_transportista')::numeric, e.importe_transportista),$x$);
  d := replace(d, $x$'orden', p.orden, 'tipo', p.tipo,$x$, $x$'orden', p.orden_pack, 'tipo', p.tipo,$x$);
  d := replace(d, $x$order by p.orden), '[]'::jsonb)$x$, $x$order by p.orden_pack), '[]'::jsonb)$x$);
  d := replace(d, $x$from envio_paradas p left join sitios l on l.id = p.sitio_id where p.envio_id = e.id)$x$,
    $x$from (select x.*, row_number() over (order by (x.tipo = 'descarga'), x.orden, x.envio_id) orden_pack
              from envio_paradas x where x.envio_id = any(pack_miembros(e.id))) p left join sitios l on l.id = p.sitio_id)$x$);
  execute d;

  -- ---- aceptar_reserva: sin oferta (bolsa, código), el precio del pack es la suma -----------
  d := pg_get_functiondef('aceptar_reserva(uuid, uuid, uuid, numeric)'::regprocedure);
  n := (length(d) - length(replace(d, '    v_base := e.importe_transportista; v_banda := 0; v_pct := 0;', ''))) / length('    v_base := e.importe_transportista; v_banda := 0; v_pct := 0;');
  if n <> 1 then raise exception 'aceptar_reserva: aguja (%)', n; end if;
  d := replace(d, '    v_base := e.importe_transportista; v_banda := 0; v_pct := 0;',
    $x$    v_base := coalesce((pack_resumen(e.id) ->> 'importe_transportista')::numeric, e.importe_transportista); v_banda := 0; v_pct := 0;$x$);
  execute d;

  -- ---- cerrar_aceptacion: marca que es una ACEPTACIÓN (para dar el pack entero) -------------
  d := pg_get_functiondef('cerrar_aceptacion(uuid, uuid, uuid, numeric)'::regprocedure);
  n := (length(d) - length(replace(d, E'  perform pg_advisory_xact_lock(hashtext(''dynamo_pronto_pago''));', ''))) / length(E'  perform pg_advisory_xact_lock(hashtext(''dynamo_pronto_pago''));');
  if n <> 1 then raise exception 'cerrar_aceptacion: inicio (%)', n; end if;
  d := replace(d, E'  perform pg_advisory_xact_lock(hashtext(''dynamo_pronto_pago''));',
    E'  perform pg_advisory_xact_lock(hashtext(''dynamo_pronto_pago''));\n  perform set_config(''dynamo.aceptacion'', ''on'', true);');
  n := (length(d) - length(replace(d, E'  return jsonb_build_object(''resultado'',''aceptada'',''envio_id'', r.envio_id,', ''))) / length(E'  return jsonb_build_object(''resultado'',''aceptada'',''envio_id'', r.envio_id,');
  if n <> 1 then raise exception 'cerrar_aceptacion: final (%)', n; end if;
  d := replace(d, E'  return jsonb_build_object(''resultado'',''aceptada'',''envio_id'', r.envio_id,',
    E'  perform set_config(''dynamo.aceptacion'', ''off'', true);\n  return jsonb_build_object(''resultado'',''aceptada'',''envio_id'', r.envio_id,');
  execute d;

  -- ---- Email «Carga disponible» de la oferta por tandas: el pack entero ---------------------
  d := pg_get_functiondef('fn_difusion_paso(uuid)'::regprocedure);
  for procedure_cuenta in select unnest(array[
      $x$format('Carga disponible · %s → %s · %s', coalesce(e.poblacion_origen, '—'),$x$,
      $x$'<p>Hola,</p><p>Tenemos una carga que te puede encajar:</p>'$x$,
      $x$coalesce(replace(to_char(e.metros_lineales, 'FM990.00'), '.', ',') || ' m', '—'),$x$,
      $x$coalesce(replace(to_char(e.toneladas, 'FM990.00'), '.', ','), '—'),$x$]) loop
    n := (length(d) - length(replace(d, procedure_cuenta, ''))) / length(procedure_cuenta);
    if n <> 1 then raise exception 'fn_difusion_paso: aguja «%» (%)', procedure_cuenta, n; end if;
  end loop;
  d := replace(d, $x$format('Carga disponible · %s → %s · %s', coalesce(e.poblacion_origen, '—'),$x$,
    $x$format('Carga disponible · %s%s → %s · %s', case when pack_resumen(d.envio_id) is not null then 'Pack de ' || (pack_resumen(d.envio_id) ->> 'n') || ' grupajes · ' else '' end, coalesce(e.poblacion_origen, '—'),$x$);
  d := replace(d, $x$'<p>Hola,</p><p>Tenemos una carga que te puede encajar:</p>'$x$,
    $x$'<p>Hola,</p><p>Tenemos una carga que te puede encajar:</p>' || coalesce('<p><strong>Es un pack de ' || (pack_resumen(d.envio_id) ->> 'n') || ' grupajes por la misma ruta, para el mismo camión</strong> (' || (pack_resumen(d.envio_id) ->> 'paradas') || ' paradas). Lo ves entero al pulsar «Aceptar carga».</p>', '')$x$);
  d := replace(d, $x$coalesce(replace(to_char(e.metros_lineales, 'FM990.00'), '.', ',') || ' m', '—'),$x$,
    $x$coalesce(replace(to_char(coalesce((pack_resumen(d.envio_id) ->> 'metros_lineales')::numeric, e.metros_lineales), 'FM990.00'), '.', ',') || ' m', '—'),$x$);
  d := replace(d, $x$coalesce(replace(to_char(e.toneladas, 'FM990.00'), '.', ','), '—'),$x$,
    $x$coalesce(replace(to_char(coalesce((pack_resumen(d.envio_id) ->> 'toneladas')::numeric, e.toneladas), 'FM990.00'), '.', ','), '—'),$x$);
  execute d;
end $do$;

-- ---- La bolsa (fichero de Wtransnet): el pack, en una sola fila con los totales -------------
do $do$
declare d text; n int; a text;
begin
  d := pg_get_viewdef('v_wtransnet'::regclass, true);
  for a in select unnest(array[
      $x$fecha_ddmmyyyy(e.fecha_carga_desde) AS "Fecha disponibilidad"$x$,
      $x$round(e.toneladas * 1000::numeric) AS "Peso"$x$,
      $x$e.metros_lineales AS "Largo"$x$,
      $x$(('Acepta esta carga en nuestra web$x$,
      $x$e.importe_transportista AS "Precio"$x$,
      $x$JOIN clientes c ON c.id = e.cliente_id$x$,
      $x$WHERE e.operador_id IS NULL AND$x$]) loop
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    if n <> 1 then raise exception 'v_wtransnet: aguja «%» (%)', a, n; end if;
  end loop;
  d := replace(d, $x$fecha_ddmmyyyy(e.fecha_carga_desde) AS "Fecha disponibilidad"$x$, $x$fecha_ddmmyyyy(COALESCE(pk.desde, e.fecha_carga_desde)) AS "Fecha disponibilidad"$x$);
  d := replace(d, $x$round(e.toneladas * 1000::numeric) AS "Peso"$x$, $x$round(COALESCE(pk.toneladas, e.toneladas) * 1000::numeric) AS "Peso"$x$);
  d := replace(d, $x$e.metros_lineales AS "Largo"$x$, $x$COALESCE(pk.metros_lineales, e.metros_lineales) AS "Largo"$x$);
  d := replace(d, $x$(('Acepta esta carga en nuestra web$x$, $x$COALESCE(pk.texto, ''::text) || (('Acepta esta carga en nuestra web$x$);
  d := replace(d, $x$e.importe_transportista AS "Precio"$x$, $x$COALESCE(pk.importe, e.importe_transportista) AS "Precio"$x$);
  d := replace(d, $x$JOIN clientes c ON c.id = e.cliente_id$x$,
    $x$JOIN clientes c ON c.id = e.cliente_id
     LEFT JOIN LATERAL ( SELECT sum(x.toneladas)::numeric(6,2) AS toneladas, sum(x.metros_lineales)::numeric(5,2) AS metros_lineales,
            sum(x.importe_transportista)::numeric(12,2) AS importe, max(x.fecha_carga_desde) AS desde,
            ('Pack de '::text || count(*) || ' grupajes para el mismo camión. '::text) AS texto
           FROM envios x JOIN packs k ON k.id = x.pack_id AND k.estado = 'abierto'::text
          WHERE e.pack_id IS NOT NULL AND x.pack_id = e.pack_id
         HAVING count(*) > 0) pk ON true$x$);
  -- Las partidas que no son la líder no salen sueltas en la bolsa.
  d := replace(d, $x$WHERE e.operador_id IS NULL AND$x$,
    $x$WHERE NOT (EXISTS ( SELECT 1 FROM packs k WHERE k.id = e.pack_id AND k.estado = 'abierto'::text AND k.lider_envio_id IS DISTINCT FROM e.id)) AND e.operador_id IS NULL AND$x$);
  execute 'create or replace view v_wtransnet as ' || d;
  execute 'alter view v_wtransnet set (security_invoker = true)';
end $do$;

-- ---- Lo que pasa cuando cambia una partida (nueva versión) ---------------------------------
-- Novedad: si un transportista ACEPTA la partida líder (la oferta del pack), se le dan TODAS
-- las partidas y el precio aceptado se reparte entre ellas. Y cuando una partida sale del pack,
-- las ofertas que había se retiran.
create or replace function fn_envios_pack() returns trigger
language plpgsql security definer set search_path = public as $$
declare k packs%rowtype; v_fp date; v_mal text; s record; v_desde date; v_hasta date; v_acepta boolean;
begin
  if new.pack_id is null then return new; end if;
  select * into k from packs where id = new.pack_id;
  v_acepta := coalesce(current_setting('dynamo.aceptacion', true), '') = 'on';
  if old.transportista_id is null and new.transportista_id is not null then
    select max(fecha_carga_desde), min(coalesce(fecha_carga_hasta, fecha_carga_desde)) into v_desde, v_hasta
      from envios where pack_id = new.pack_id;
    if v_acepta and k.estado = 'abierto' and k.lider_envio_id = new.id then
      -- Un transportista acepta el PACK (la oferta de la líder): todas las partidas son suyas y
      -- el precio aceptado (el del pack entero) se reparte entre ellas.
      perform pack_repartir_precio(k.id, new.importe_transportista, new.id, old.importe_transportista);
      v_fp := case when new.fecha_carga_prevista between v_desde and v_hasta then new.fecha_carga_prevista end;
      update envios set transportista_id = new.transportista_id, estado_asignacion = 'confirmada',
             matricula_camion = new.matricula_camion, matricula_remolque = new.matricula_remolque,
             conductor_nombre = new.conductor_nombre, conductor_telefono = new.conductor_telefono,
             fecha_carga_prevista = coalesce(v_fp, fecha_carga_prevista)
       where pack_id = new.pack_id and id <> new.id and transportista_id is null;
      update envio_ofertas set estado = 'cerrada' where envio_id in (select id from envios where pack_id = new.pack_id and id <> new.id) and estado = 'activa';
      update packs set estado = 'asignado' where id = new.pack_id and estado = 'abierto';
      perform crear_aviso('dynamo', null, null, 'pack_aceptado', 'info', 'Pack ' || k.codigo || ' aceptado',
        'Un transportista ha aceptado el pack ' || k.codigo || ' entero: se le han asignado todas sus partidas y el precio se ha repartido entre ellas.',
        '/panel/envios?ver=' || new.id, new.id);
      return new;
    end if;
    if es_equipo_dynamo() and not v_acepta then
      -- Lo asigna Dynamo a mano: el mismo camión y el mismo día para TODAS las partidas.
      v_fp := new.fecha_carga_prevista;
      if v_fp is null or v_fp < v_desde or v_fp > v_hasta then
        raise exception 'Este envío va en el pack %: la carga tiene que ser un día común a todas sus partidas (del % al %).',
          k.codigo, to_char(v_desde, 'DD/MM/YYYY'), to_char(v_hasta, 'DD/MM/YYYY');
      end if;
      for s in select id, referencia_gx, importe_transportista from envios
                where pack_id = new.pack_id and id <> new.id and transportista_id is null loop
        if coalesce(s.importe_transportista, 0) <= 0 then
          raise exception 'La partida #% del pack % no tiene precio del transportista: pónselo antes de asignar el pack.', s.referencia_gx, k.codigo;
        end if;
      end loop;
      update envios set transportista_id = new.transportista_id, estado_asignacion = 'confirmada',
             matricula_camion = new.matricula_camion, matricula_remolque = new.matricula_remolque,
             conductor_nombre = new.conductor_nombre, conductor_telefono = new.conductor_telefono,
             fecha_carga_prevista = v_fp
       where pack_id = new.pack_id and id <> new.id and transportista_id is null;
      update packs set estado = 'asignado' where id = new.pack_id and estado = 'abierto';
      return new;
    end if;
    -- Una partida que no es la líder, aceptada por separado: sale del pack.
    v_mal := 'la ha aceptado un transportista por separado';
  elsif new.estado <> 'programado' and new.transportista_id is null then
    v_mal := 'ya no está programada (' || replace(new.estado::text, '_', ' ') || ')';
  elsif new.transportista_id is null and k.estado = 'abierto'
        and (new.metros_lineales, new.toneladas, new.fecha_carga_desde, new.fecha_carga_hasta, new.requiere_plataforma_elevadora, new.adr, new.estado_pago_previo)
            is distinct from (old.metros_lineales, old.toneladas, old.fecha_carga_desde, old.fecha_carga_hasta, old.requiere_plataforma_elevadora, old.adr, old.estado_pago_previo) then
    v_mal := pack_motivo_no(new.id);
    if v_mal is null then
      select max(fecha_carga_desde), min(coalesce(fecha_carga_hasta, fecha_carga_desde)) into v_desde, v_hasta from envios where pack_id = new.pack_id;
      if v_desde > v_hasta then v_mal := 'su ventana de carga ya no coincide con las demás';
      elsif (select sum(metros_lineales) from envios where pack_id = new.pack_id) > 13.3
         or (select sum(coalesce(toneladas, 0)) from envios where pack_id = new.pack_id) > 24 then v_mal := 'con sus medidas nuevas el pack se pasa del tráiler';
      end if;
    end if;
  end if;
  if v_mal is not null then
    perform pack_retirar_ofertas(array(select id from envios where pack_id = k.id and id <> new.id and transportista_id is null));
    update envios set pack_id = null where id = new.id;
    perform pack_recoger(k.id);
    perform crear_aviso('dynamo', null, null, 'pack_partida_fuera', 'aviso', 'Pack ' || k.codigo || ': sale la partida #' || coalesce(new.referencia_gx, ''),
      'La partida #' || coalesce(new.referencia_gx, '') || ' sale del pack ' || k.codigo || ': ' || v_mal || '. Revisa el pack y vuelve a ofrecerlo.',
      '/panel/envios?ver=' || new.id, new.id);
  end if;
  return new;
end $$;

-- ---- Tras aceptar: la página de la carga aceptada enseña TODAS las partidas del pack --------
-- (las direcciones completas, como siempre, solo una vez aceptada y con las matrículas).
create or replace function pack_miembros_de(p_envio uuid, p_transportista uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce((select array_agg(x.id order by x.fecha_carga_desde, x.referencia_gx)
                     from envios e join packs k on k.id = e.pack_id and k.estado <> 'deshecho'
                     join envios x on x.pack_id = k.id and x.transportista_id = p_transportista
                    where e.id = p_envio having count(*) > 1), array[p_envio])
$$;
revoke all on function pack_miembros_de(uuid, uuid) from public, anon, authenticated;

do $do$
declare d text; n int; a text;
begin
  d := pg_get_functiondef('carga_aceptada_publica_completa(uuid)'::regprocedure);
  for a in select unnest(array[
      $x$'resultado', 'aceptada', 'estado', e.estado,$x$,
      $x$'metros_lineales', e.metros_lineales,$x$,
      $x$'toneladas', e.toneladas, 'tipo_carga'$x$,
      $x$'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa'$x$,
      $x$order by p.orden), '[]'::jsonb)$x$,
      $x$from envio_paradas p left join sitios l on l.id = p.sitio_id where p.envio_id = e.id)$x$]) loop
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    if n <> 1 then raise exception 'carga_aceptada_publica_completa: aguja «%» (%)', a, n; end if;
  end loop;
  d := replace(d, $x$'resultado', 'aceptada', 'estado', e.estado,$x$,
    $x$'resultado', 'aceptada', 'estado', e.estado,
    'pack', case when cardinality(pack_miembros_de(e.id, r.transportista_id)) > 1 then jsonb_build_object(
      'codigo', (select codigo from packs where id = e.pack_id), 'partidas', cardinality(pack_miembros_de(e.id, r.transportista_id)),
      'referencias', (select jsonb_agg(x.referencia_gx order by x.fecha_carga_desde, x.referencia_gx) from envios x where x.id = any(pack_miembros_de(e.id, r.transportista_id)))) end,$x$);
  d := replace(d, $x$'metros_lineales', e.metros_lineales,$x$,
    $x$'metros_lineales', (select sum(x.metros_lineales) from envios x where x.id = any(pack_miembros_de(e.id, r.transportista_id))),$x$);
  d := replace(d, $x$'toneladas', e.toneladas, 'tipo_carga'$x$,
    $x$'toneladas', (select sum(x.toneladas) from envios x where x.id = any(pack_miembros_de(e.id, r.transportista_id))), 'tipo_carga'$x$);
  d := replace(d, $x$'orden', p.orden, 'tipo', p.tipo, 'nombre_empresa'$x$,
    $x$'orden', p.orden_pack, 'partida', (select referencia_gx from envios where id = p.envio_id), 'tipo', p.tipo, 'nombre_empresa'$x$);
  d := replace(d, $x$order by p.orden), '[]'::jsonb)$x$, $x$order by p.orden_pack), '[]'::jsonb)$x$);
  d := replace(d, $x$from envio_paradas p left join sitios l on l.id = p.sitio_id where p.envio_id = e.id)$x$,
    $x$from (select x.*, row_number() over (order by (x.tipo = 'descarga'), x.orden, x.envio_id) orden_pack
              from envio_paradas x where x.envio_id = any(pack_miembros_de(e.id, r.transportista_id))) p left join sitios l on l.id = p.sitio_id)$x$);
  execute d;
end $do$;
