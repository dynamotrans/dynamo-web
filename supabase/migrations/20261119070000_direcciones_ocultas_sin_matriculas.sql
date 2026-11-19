-- DIRECCIONES OCULTAS AL TRANSPORTISTA HASTA QUE DÉ LAS MATRÍCULAS (usuario, 2026-11-19).
-- El envío está confirmado, pero mientras falten las matrículas que pide el documento de
-- control (envio_matriculas_completas: tractora y, en un conjunto articulado, semirremolque)
-- el transportista NO ve las direcciones de las paradas: solo el código postal y el país,
-- con «********» en el nombre y la dirección. Así no se presenta en la carga sin habernos
-- dado las matrículas, que hay que comunicar antes a los almacenes. En cuanto las da, ve
-- todo y se le manda la orden completa.
--
-- Se aplica a TODO lo que llega al transportista: la orden de carga (su panel, el enlace
-- público de la carga aceptada y el enlace del CMR con su clave), su panel de viajes y la
-- página de la carga aceptada. El enlace del eCMR (que enseña las direcciones) tampoco se
-- le da hasta entonces. Dynamo y el cliente lo siguen viendo todo.

-- ---- 1. Las paradas, recortadas ----------------------------------------------------------
-- Lista BLANCA de campos: lo que no está aquí no sale (dirección, población, provincia,
-- contacto, teléfono, horario, notas, referencia, coordenadas, enlace de Maps…).
create or replace function paradas_ocultas(p_paradas jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'id', x -> 'id', 'orden', x -> 'orden', 'tipo', x -> 'tipo',
             'codigo_postal', x -> 'codigo_postal', 'pais_codigo_iso', x -> 'pais_codigo_iso', 'pais', x -> 'pais',
             'tipo_sitio', x -> 'tipo_sitio', 'fecha_desde', x -> 'fecha_desde', 'fecha_hasta', x -> 'fecha_hasta',
             'realizado_en', x -> 'realizado_en', 'requiere_cita', x -> 'requiere_cita',
             'tiene_medios_carga', x -> 'tiene_medios_carga', 'requiere_pin', x -> 'requiere_pin'))
           || jsonb_build_object('nombre_empresa', '********', 'direccion', '********', 'oculta', true)
           order by t.n), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_paradas, '[]'::jsonb)) with ordinality as t(x, n)
$$;
comment on function paradas_ocultas(jsonb) is '[Ofertas y transportistas] Recorta una lista de paradas (JSON) para el transportista que aún no ha dado las matrículas: deja solo código postal, país, tipo, orden y fechas; nombre y dirección como «********» y la marca oculta = true. Quién: funciones internas.';
revoke all on function paradas_ocultas(jsonb) from public;

-- ---- 2. La orden de carga, recortada si faltan matrículas ------------------------------
create or replace function orden_oculta_sin_matriculas(p_json jsonb, p_envio uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when envio_matriculas_completas(p_envio) then p_json
              else (jsonb_set(p_json, '{paradas}', paradas_ocultas(p_json -> 'paradas')) - 'modificaciones')
                   || jsonb_build_object('direcciones_ocultas', true) end
$$;
comment on function orden_oculta_sin_matriculas(jsonb, uuid) is '[Ofertas y transportistas] La orden de carga (JSON) tal como la puede ver el transportista: si al envío le faltan las matrículas (envio_matriculas_completas), sin las direcciones de las paradas (paradas_ocultas), sin las modificaciones del documento de control y con direcciones_ocultas = true. Quién: funciones internas (datos_orden_*).';
revoke all on function orden_oculta_sin_matriculas(jsonb, uuid) from public, anon, authenticated;

do $$
declare v_def text; v_nueva text;
begin
  -- Enlace público de la carga aceptada.
  select pg_get_functiondef('public.datos_orden_publica(uuid)'::regprocedure) into v_def;
  if position('orden_oculta_sin_matriculas' in v_def) = 0 then
    v_nueva := replace(v_def, 'return orden_sin_economia_cliente(orden_carga_json(r.envio_id));',
      'return orden_oculta_sin_matriculas(orden_sin_economia_cliente(orden_carga_json(r.envio_id)), r.envio_id);');
    if v_nueva = v_def then raise exception 'datos_orden_publica() no tiene el texto esperado: revisar la migración'; end if;
    execute v_nueva;
  end if;
  -- Panel del transportista.
  select pg_get_functiondef('public.datos_orden_transportista(uuid)'::regprocedure) into v_def;
  if position('orden_oculta_sin_matriculas' in v_def) = 0 then
    v_nueva := replace(v_def, 'return orden_sin_economia_cliente(orden_carga_json(p_envio));',
      'return orden_oculta_sin_matriculas(orden_sin_economia_cliente(orden_carga_json(p_envio)), p_envio);');
    if v_nueva = v_def then raise exception 'datos_orden_transportista() no tiene el texto esperado: revisar la migración'; end if;
    execute v_nueva;
  end if;
  -- Enlace del CMR: con la clave del transportista (o sin clave) también va recortada; solo
  -- la del cliente la ve entera.
  select pg_get_functiondef('public.datos_orden_por_cmr(uuid, uuid)'::regprocedure) into v_def;
  if position('orden_oculta_sin_matriculas' in v_def) = 0 then
    v_nueva := replace(v_def, $q$  return j || jsonb_build_object('clave_rol', v_rol);$q$,
      $q$  if v_rol is distinct from 'cliente' then j := orden_oculta_sin_matriculas(j, v.envio_id); end if;
  return j || jsonb_build_object('clave_rol', v_rol);$q$);
    if v_nueva = v_def then raise exception 'datos_orden_por_cmr() no tiene el texto esperado: revisar la migración'; end if;
    execute v_nueva;
  end if;
end $$;

-- ---- 3. Página pública de la carga aceptada ------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'carga_aceptada_publica_completa' and pronamespace = 'public'::regnamespace) then
    alter function carga_aceptada_publica(uuid) rename to carga_aceptada_publica_completa;
  end if;
end $$;
revoke all on function carga_aceptada_publica_completa(uuid) from public, anon, authenticated;
comment on function carga_aceptada_publica_completa(uuid) is '[Ofertas y transportistas] La carga aceptada con TODAS sus direcciones (lo que era carga_aceptada_publica). Ya no la llama la web: la usa carga_aceptada_publica, que la recorta si faltan las matrículas. Quién: funciones internas. Argumentos: p_reserva: envio_reservas.id.';

create or replace function carga_aceptada_publica(p_reserva uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare j jsonb; v_envio uuid;
begin
  j := carga_aceptada_publica_completa(p_reserva);
  if j ? 'paradas' then
    select envio_id into v_envio from envio_reservas where id = p_reserva;
    if v_envio is not null and not envio_matriculas_completas(v_envio) then
      j := jsonb_set(j, '{paradas}', paradas_ocultas(j -> 'paradas')) || jsonb_build_object('direcciones_ocultas', true);
    end if;
  end if;
  return j;
end $$;
revoke all on function carga_aceptada_publica(uuid) from public;
grant execute on function carga_aceptada_publica(uuid) to anon, authenticated;
comment on function carga_aceptada_publica(uuid) is '[Ofertas y transportistas] Pantalla «carga aceptada» de la página pública del transportista: los datos del envío y sus paradas. Mientras falten las matrículas, las paradas van sin dirección (paradas_ocultas) y con direcciones_ocultas = true. Quién: público con la reserva. Argumentos: p_reserva: envio_reservas.id.';

-- ---- 4. Panel del transportista (sus viajes) ---------------------------------------------
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'paradas_viaje_json_completa' and pronamespace = 'public'::regnamespace) then
    alter function paradas_viaje_json(uuid) rename to paradas_viaje_json_completa;
  end if;
end $$;
revoke all on function paradas_viaje_json_completa(uuid) from public, anon, authenticated;
comment on function paradas_viaje_json_completa(uuid) is '[Ofertas y transportistas] Las paradas de un viaje con TODO (dirección, horario, contacto…), lo que era paradas_viaje_json. La usa paradas_viaje_json, que las recorta si faltan las matrículas. Quién: funciones internas. Argumentos: p_envio: envios.id.';

create or replace function paradas_viaje_json(p_envio uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when envio_matriculas_completas(p_envio) then paradas_viaje_json_completa(p_envio)
              else paradas_ocultas(paradas_viaje_json_completa(p_envio)) end
$$;
revoke all on function paradas_viaje_json(uuid) from public, anon, authenticated;
comment on function paradas_viaje_json(uuid) is '[Ofertas y transportistas] Las paradas de un viaje para el panel del transportista (mis_viajes): con dirección, horario y contacto solo si el envío ya tiene las matrículas; si no, recortadas (paradas_ocultas). Quién: funciones internas. Argumentos: p_envio: envios.id.';

-- ---- 5. El enlace del eCMR: tampoco hasta tener las matrículas -----------------------------
do $$
declare v_def text; v_nueva text;
begin
  select pg_get_functiondef('public.enlace_cmr_publico(uuid)'::regprocedure) into v_def;
  if position('envio_matriculas_completas' in v_def) = 0 then
    v_nueva := replace(v_def,
      $q$  if v_estado = 'entregado' or not enlace_carga_vigente(r.envio_id) then raise exception 'Este envío ya ha terminado.' using errcode = '42501'; end if;$q$,
      $q$  if v_estado = 'entregado' or not enlace_carga_vigente(r.envio_id) then raise exception 'Este envío ya ha terminado.' using errcode = '42501'; end if;
  if not envio_matriculas_completas(r.envio_id) then
    raise exception 'Faltan las matrículas: ponlas primero y tendrás el CMR y las direcciones.' using errcode = 'P0001';
  end if;$q$);
    if v_nueva = v_def then raise exception 'enlace_cmr_publico() no tiene el texto esperado: revisar la migración'; end if;
    execute v_nueva;
  end if;
  select pg_get_functiondef('public.mi_enlace_cmr(uuid)'::regprocedure) into v_def;
  if position('envio_matriculas_completas' in v_def) = 0 then
    v_nueva := replace(v_def,
      $q$  if v_estado in ('cancelado', 'borrador') then raise exception 'Este envío no tiene CMR para firmar.'; end if;$q$,
      $q$  if v_estado in ('cancelado', 'borrador') then raise exception 'Este envío no tiene CMR para firmar.'; end if;
  if not envio_del_cliente(p_envio) and not envio_matriculas_completas(p_envio) then
    raise exception 'Faltan las matrículas: ponlas primero y tendrás el CMR y las direcciones.' using errcode = 'P0001';
  end if;$q$);
    if v_nueva = v_def then raise exception 'mi_enlace_cmr() no tiene el texto esperado: revisar la migración'; end if;
    execute v_nueva;
  end if;
end $$;
