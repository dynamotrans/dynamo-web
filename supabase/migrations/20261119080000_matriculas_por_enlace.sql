-- PÁGINA SENCILLA PARA DAR LAS MATRÍCULAS (usuario, 2026-11-19).
-- El email de la orden SIN direcciones lleva un botón «Proporcionar matrículas del envío»
-- que abre /matriculas/<token>?clave=<transportista>: un mini resumen del envío y los
-- campos de matrículas, conductor y teléfono. Funciona en cualquier móvil u ordenador
-- (no depende de la cookie de la página de aceptar la carga) y también en los envíos que
-- Dynamo asigna a mano. La llave es la misma que la del enlace de la orden: el token del
-- CMR del envío (cmr_enlaces) y la clave del transportista asignado (su id).
-- Al guardarlas, la web le manda sola la orden completa (con las direcciones y el eCMR)
-- y al cliente le llega el email de «Matrículas asignadas» (ahora con el teléfono del
-- conductor).

-- ---- 1. El envío que se ve en la página -----------------------------------------------
create or replace function matriculas_enlace_datos(p_token uuid, p_clave uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v cmr_enlaces%rowtype; e envios%rowtype; v_trans text;
begin
  select * into v from cmr_enlaces where token = p_token and not revocado and caduca_en > now();
  if not found then return jsonb_build_object('resultado', 'no_valido'); end if;
  select * into e from envios where id = v.envio_id;
  if not found or e.operador_id is not null or e.transportista_id is null or e.transportista_id is distinct from p_clave then
    return jsonb_build_object('resultado', 'no_valido');
  end if;
  if e.estado = 'cancelado' then return jsonb_build_object('resultado', 'cancelado', 'referencia', e.referencia_gx); end if;
  select razon_social into v_trans from transportistas where id = e.transportista_id;
  return jsonb_build_object(
    'resultado', 'ok',
    'referencia', e.referencia_gx,
    'estado', e.estado,
    'editable', e.estado in ('programado', 'hacia_la_carga') and enlace_carga_vigente(e.id),
    'transportista', v_trans,
    'fecha_carga_prevista', e.fecha_carga_prevista,
    'fecha_carga_desde', e.fecha_carga_desde,
    'fecha_carga_hasta', e.fecha_carga_hasta,
    'metros_lineales', e.metros_lineales,
    'toneladas', e.toneladas,
    'mercancia', e.descripcion_mercancia,
    'paletizado', e.paletizado,
    'plataforma', e.requiere_plataforma_elevadora,
    'necesita_remolque', envio_necesita_remolque(e.id),
    'matricula_camion', e.matricula_camion,
    'matricula_remolque', e.matricula_remolque,
    'conductor_nombre', e.conductor_nombre,
    'conductor_telefono', e.conductor_telefono,
    'completas', envio_matriculas_completas(e.id),
    -- Las paradas SOLO con código postal y país: la dirección llega con la orden completa.
    'paradas', coalesce((select jsonb_agg(jsonb_build_object('orden', p.orden, 'tipo', p.tipo,
                 'codigo_postal', p.codigo_postal, 'pais_codigo_iso', p.pais_codigo_iso) order by p.orden)
               from envio_paradas p where p.envio_id = e.id), '[]'::jsonb));
end $$;
revoke all on function matriculas_enlace_datos(uuid, uuid) from public;
grant execute on function matriculas_enlace_datos(uuid, uuid) to anon, authenticated;
comment on function matriculas_enlace_datos(uuid, uuid) is '[Ofertas y transportistas] Página pública «Proporcionar matrículas»: un mini resumen del envío (referencia, fechas, mercancía, paradas solo con código postal) y las matrículas, conductor y teléfono que ya tiene. Devuelve resultado ok / no_valido / cancelado. Quién: público con el enlace del email (token del CMR y clave del transportista asignado). Argumentos: p_token: cmr_enlaces.token; p_clave: id del transportista asignado.';

-- ---- 2. Guardar las matrículas desde esa página ----------------------------------------
-- Las mismas reglas que completar_carga_publica (la página de la carga aceptada): limpia
-- las matrículas, el chófer de ese camión de otras veces, el teléfono del chófer conocido,
-- y el día de carga dentro de la ventana.
create or replace function guardar_matriculas_enlace(p_token uuid, p_clave uuid, p_matricula_camion text, p_matricula_remolque text,
  p_conductor_nombre text, p_telefono text, p_fecha_carga_prevista date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v cmr_enlaces%rowtype; e envios%rowtype; v_tel text; v_cam text; v_rem text; v_nom text; k record;
begin
  select * into v from cmr_enlaces where token = p_token and not revocado and caduca_en > now();
  if not found then return jsonb_build_object('resultado', 'no_valido'); end if;
  select * into e from envios where id = v.envio_id for update;
  if not found or e.operador_id is not null or e.transportista_id is null or e.transportista_id is distinct from p_clave then
    return jsonb_build_object('resultado', 'no_valido');
  end if;
  if e.estado not in ('programado', 'hacia_la_carga') or not enlace_carga_vigente(e.id) then
    return jsonb_build_object('resultado', 'ya_no_se_puede');
  end if;

  if p_fecha_carga_prevista is not null and (e.fecha_carga_desde is null
       or p_fecha_carga_prevista < e.fecha_carga_desde or p_fecha_carga_prevista > coalesce(e.fecha_carga_hasta, e.fecha_carga_desde)) then
    return jsonb_build_object('resultado', 'fecha_fuera_de_ventana');
  end if;
  if coalesce(p_fecha_carga_prevista, e.fecha_carga_prevista) is null
     and e.fecha_carga_desde is distinct from coalesce(e.fecha_carga_hasta, e.fecha_carga_desde) then
    return jsonb_build_object('resultado', 'falta_fecha_prevista');
  end if;

  v_cam := nullif(upper(regexp_replace(coalesce(p_matricula_camion, ''), '[\s-]', '', 'g')), '');
  v_rem := nullif(upper(regexp_replace(coalesce(p_matricula_remolque, ''), '[\s-]', '', 'g')), '');
  if v_cam is null and e.matricula_camion is null then return jsonb_build_object('resultado', 'falta_camion'); end if;
  if length(coalesce(v_cam, '')) > 15 or length(coalesce(v_rem, '')) > 15 then return jsonb_build_object('resultado', 'matricula_larga'); end if;
  v_nom := nullif(left(trim(coalesce(p_conductor_nombre, '')), 120), '');
  v_tel := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
  if length(replace(coalesce(v_tel, ''), '+', '')) < 6 then v_tel := null; end if;

  if v_nom is null and v_cam is not null
     and normalizar_matricula(v_cam) is distinct from normalizar_matricula(e.matricula_camion) then
    select * into k from conductor_de_camion(e.transportista_id, v_cam);
    v_nom := k.nombre;
    v_tel := coalesce(v_tel, k.telefono);
  elsif v_nom is not null and lower(unaccent_simple(v_nom)) is distinct from lower(unaccent_simple(trim(coalesce(e.conductor_nombre, '')))) then
    if v_tel is null then select telefono into v_tel from conductor_conocido(e.transportista_id, v_nom); end if;
  else
    v_nom := coalesce(v_nom, e.conductor_nombre);
    v_tel := coalesce(v_tel, e.conductor_telefono);
  end if;

  update envios set
    matricula_camion   = coalesce(v_cam, matricula_camion),
    matricula_remolque = coalesce(v_rem, matricula_remolque),
    conductor_nombre   = v_nom,
    conductor_telefono = v_tel,
    fecha_carga_prevista = coalesce(p_fecha_carga_prevista, fecha_carga_prevista)
   where id = e.id;
  return jsonb_build_object('resultado', 'guardado', 'envio_id', e.id, 'completas', envio_matriculas_completas(e.id),
    'conductor', v_nom, 'telefono', v_tel, 'fecha_carga_prevista', coalesce(p_fecha_carga_prevista, e.fecha_carga_prevista));
end $$;
revoke all on function guardar_matriculas_enlace(uuid, uuid, text, text, text, text, date) from public;
grant execute on function guardar_matriculas_enlace(uuid, uuid, text, text, text, text, date) to anon, authenticated;
comment on function guardar_matriculas_enlace(uuid, uuid, text, text, text, text, date) is '[Ofertas y transportistas] Página pública «Proporcionar matrículas»: guarda las matrículas, el conductor, su teléfono y (en envíos con ventana) el día de carga, con las mismas reglas que la página de la carga aceptada. Devuelve resultado guardado / no_valido / ya_no_se_puede / falta_camion / falta_fecha_prevista / fecha_fuera_de_ventana / matricula_larga, y completas. Quién: público con el enlace del email (token del CMR y clave del transportista asignado). Argumentos: p_token: cmr_enlaces.token; p_clave: id del transportista asignado; el resto, los datos a guardar.';

-- ---- 3. El email de matrículas al cliente, con el teléfono del conductor -----------------
create or replace function fn_email_envio_matriculas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fn_email_envio_cliente(new.id,
    'envio_matriculas:' || new.id || ':' || new.matricula_camion || ':' || coalesce(new.matricula_remolque, ''), 'envio_matriculas',
    case when old.matricula_camion is null then 'Matrículas asignadas' else 'Matrículas cambiadas' end,
    case when old.matricula_camion is null
         then '<p>Tu envío ya tiene las <strong>matrículas</strong> del camión que lo va a cargar.</p>'
         else '<p>Han <strong>cambiado las matrículas</strong> del camión que va a cargar tu envío.</p>' end
    || format('<p><strong>Camión:</strong> %s%s%s%s</p>', escapar_html(new.matricula_camion),
         case when new.matricula_remolque is not null then ' · <strong>Remolque:</strong> ' || escapar_html(new.matricula_remolque) else '' end,
         case when nullif(btrim(new.conductor_nombre), '') is not null then ' · <strong>Conductor:</strong> ' || escapar_html(btrim(new.conductor_nombre)) else '' end,
         case when nullif(btrim(new.conductor_telefono), '') is not null then ' · <strong>Teléfono:</strong> ' || escapar_html(btrim(new.conductor_telefono)) else '' end));
  return null;
end $$;
