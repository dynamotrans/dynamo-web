-- EL PRECIO DEL CLIENTE YA NO SE FÍA DEL NAVEGADOR (repaso de seguridad, 2026-11-23).
--
-- La pantalla del cliente calcula el precio con el tarifador (lib/tarifador.ts) y lo manda
-- al crear o modificar su envío. Hasta hoy crear_envio_cliente y modificar_envio_cliente
-- solo comprobaban que estuviera entre 0 y 100.000 €; y las dos se pueden llamar
-- directamente desde el navegador con la sesión del cliente, así que alguien que supiera
-- hacerlo podía pedir un tráiler a 1 €.
--
-- Ahora la base de datos vuelve a calcular el precio con la MISMA fórmula
-- (precio_tarifa_cliente, copia exacta de desgloseDe + aplicarDescuentoTarifa, con las
-- mismas cuentas de coma flotante para que redondee igual) y solo acepta el envío si el
-- precio que llega coincide. El precio de tarifa sin el factor (importe_tarifa) también lo
-- pone ella. Una prueba de las pruebas en navegador compara las dos fórmulas con decenas
-- de combinaciones: si alguien cambia una y no la otra, salta.
--
-- Cuando llegue la tarifa real, el cálculo vive aquí y la pantalla lo pedirá a esta función.

-- Redondeo a la decena igual que Math.round(n / 10) * 10 de JavaScript (coma flotante y
-- mitades hacia arriba; el round() de Postgres en float8 redondea las mitades al par).
create or replace function tarifa_r10(p numeric) returns numeric
language sql immutable set search_path = public as $$
  select (floor(p::float8 / 10 + 0.5) * 10)::numeric
$$;
revoke all on function tarifa_r10(numeric) from public, anon, authenticated;

-- Tipo de sitio de cada punto de la ruta, en orden. Las paradas llegan como en la pantalla:
-- un sitio de la agenda (sitio_id), un sitio nuevo (tipo_sitio) o, al modificar, una parada
-- que ya tenía el envío (solo su id). Sin tipo conocido (o con el sitio ya borrado de la
-- agenda, que la pantalla ya no encuentra), almacén / nave, como la pantalla.
create or replace function tarifa_tipos_ruta(p_envio uuid, p_paradas jsonb) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare v_p jsonb; v_out text[] := '{}'; v_t text; v_sitio uuid;
begin
  if p_paradas is null then
    select coalesce(array_agg(coalesce(s.tipo::text, 'almacen_nave') order by p.orden), '{}') into v_out
      from envio_paradas p left join sitios s on s.id = p.sitio_id and not s.borrado where p.envio_id = p_envio;
    return v_out;
  end if;
  for v_p in select value from jsonb_array_elements(p_paradas) loop
    v_t := null;
    if nullif(v_p ->> 'id', '') is not null then
      select p.sitio_id into v_sitio from envio_paradas p where p.id = (v_p ->> 'id')::uuid and p.envio_id = p_envio;
    else
      v_sitio := nullif(v_p ->> 'sitio_id', '')::uuid;
      v_t := nullif(v_p ->> 'tipo_sitio', '');
    end if;
    if v_sitio is not null then select s.tipo::text into v_t from sitios s where s.id = v_sitio and not s.borrado; end if;
    v_out := v_out || coalesce(v_t, 'almacen_nave');
  end loop;
  return v_out;
end $$;
revoke all on function tarifa_tipos_ruta(uuid, jsonb) from public, anon, authenticated;

-- El precio del tarifador para unos datos de envío: {neto (lo que paga el cliente, ya con
-- su factor), base (el de tarifa sin el factor)}. Mismo orden y mismas cifras que
-- desgloseDe() en lib/tarifador.ts — TODAS PROVISIONALES hasta la tarifa real.
create or replace function precio_tarifa_cliente(p_datos jsonb, p_tipos text[], p_factor numeric,
  p_instante timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_desde date := (p_datos ->> 'fecha_carga_desde')::date;
  v_hasta date := coalesce((p_datos ->> 'fecha_carga_hasta')::date, (p_datos ->> 'fecha_carga_desde')::date);
  v_plat boolean := coalesce((p_datos ->> 'requiere_plataforma_elevadora')::boolean, false);
  v_ml numeric := coalesce((p_datos ->> 'metros_lineales')::numeric, 0);
  v_peso numeric := coalesce((p_datos ->> 'toneladas')::numeric, 0);
  v_grupaje boolean; v_vdias int; v_urg text; v_base constant numeric := 700;
  v_sub numeric; v_t text; v_rec numeric; v_neto numeric; v_pct numeric; v_m int; v_d int;
begin
  if v_desde is null then return null; end if;
  v_grupaje := v_ml < (case when v_plat then 8 else 13 end) - 0.01;
  v_vdias := dias_ventana_carga(v_desde, v_hasta);
  v_urg := case when v_vdias <= 1 then 'dia' when v_vdias = 2 then 'corta' else 'estandar' end;

  -- 1. Importe del envío (FIJO hasta la tarifa real) y 2. paradas extra.
  v_sub := v_base + greatest(0, coalesce(array_length(p_tipos, 1), 0) - 2) * 40;
  -- 3. Recargo por tipo de sitio, por punto, sobre el importe del envío.
  foreach v_t in array coalesce(p_tipos, '{}') loop
    v_rec := case v_t when 'obra_zona_amplia' then 5 when 'obra_zona_urbana' then 20 when 'finca' then 25 else 0 end;
    if v_rec > 0 then v_sub := v_sub + tarifa_r10(v_base * v_rec / 100); end if;
  end loop;
  -- 4. Suplementos de la mercancía (por el techo, más caro del 15 de junio al 15 de septiembre).
  if not coalesce((p_datos ->> 'paletizado')::boolean, true) then v_sub := v_sub + 70; end if;
  if coalesce((p_datos ->> 'carga_techo')::boolean, false) then
    v_m := extract(month from v_desde); v_d := extract(day from v_desde);
    v_sub := v_sub + case when (v_m = 6 and v_d >= 15) or v_m in (7, 8) or (v_m = 9 and v_d <= 15) then 90 else 50 end;
  end if;
  if v_plat then v_sub := v_sub + 60; end if;
  if coalesce((p_datos ->> 'requiere_nima')::boolean, false) then v_sub := v_sub + 50; end if;
  if coalesce((p_datos ->> 'adr')::boolean, false) then
    v_sub := v_sub + (floor(v_sub::float8 * 0.5 / 10 + 0.5) * 10)::numeric;
  end if;
  -- 4-bis. Ventana corta de grupaje: +10 % del subtotal o 80 €, el mayor.
  if v_urg = 'corta' and v_grupaje then
    v_sub := v_sub + greatest((floor(v_sub::float8 * 0.10 / 10 + 0.5) * 10)::numeric, 80);
  end if;
  -- 5. Fecha fija: 100 € el primer día posible (urgente), 50 € los demás.
  if v_urg = 'dia' and v_desde >= (p_instante at time zone 'Europe/Madrid')::date then
    v_sub := v_sub + case when v_desde <= primera_fecha_carga(true, p_instante, 1) then 100 else 50 end;
  end if;
  -- 6. Descuento por peso bajo en tráiler completo.
  if not v_plat and not v_grupaje and v_peso > 0 and v_peso <= 20 then
    v_sub := v_sub - case when v_peso <= 4 then 30 when v_peso <= 8 then 30 when v_peso <= 12 then 20 when v_peso <= 16 then 20 else 10 end;
  end if;
  -- El factor del cliente, fundido en el precio (aplicarDescuentoTarifa).
  v_pct := coalesce(p_factor, 0);
  v_neto := case when v_pct = 0 then v_sub
                 else (floor(v_sub::float8 * (1 + v_pct::float8 / 100) / 10 + 0.5) * 10)::numeric end;
  return jsonb_build_object('neto', v_neto, 'base', v_sub);
end $$;
revoke all on function precio_tarifa_cliente(jsonb, text[], numeric, timestamptz) from public, anon, authenticated;
grant execute on function precio_tarifa_cliente(jsonb, text[], numeric, timestamptz) to service_role;

-- La comprobación, igual al crear y al modificar: el precio que llega tiene que ser el
-- del tarifador al céntimo. Si no, el envío no se guarda.
create or replace function precio_cliente_comprobado(p_datos jsonb, p_tipos text[], p_factor numeric) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb := precio_tarifa_cliente(p_datos, p_tipos, p_factor);
begin
  if v is null or (v ->> 'neto')::numeric is distinct from round((p_datos ->> 'importe_cliente')::numeric, 2) then
    raise exception 'El precio de este envío ha cambiado mientras lo preparabas: ahora es % + IVA. Recarga la página para verlo antes de confirmar.',
      coalesce(euros_texto((v ->> 'neto')::numeric), 'otro');
  end if;
  return v;
end $$;
revoke all on function precio_cliente_comprobado(jsonb, text[], numeric) from public, anon, authenticated;

do $do$
declare d text; n int;
begin
  -- ---- crear_envio_cliente -------------------------------------------------------------
  d := pg_get_functiondef('crear_envio_cliente(jsonb, jsonb)'::regprocedure);
  n := (length(d) - length(replace(d, 'v_desde date; v_hasta date; v_vdias int;', ''))) / length('v_desde date; v_hasta date; v_vdias int;');
  if n <> 1 then raise exception 'crear_envio_cliente: declaración no encontrada (%)', n; end if;
  d := replace(d, 'v_desde date; v_hasta date; v_vdias int;', 'v_desde date; v_hasta date; v_vdias int; v_precio jsonb;');

  n := (length(d) - length(replace(d, E'  insert into envios (cliente_id, referencia_cliente, estado,', ''))) / length(E'  insert into envios (cliente_id, referencia_cliente, estado,');
  if n <> 1 then raise exception 'crear_envio_cliente: insert no encontrado (%)', n; end if;
  d := replace(d, E'  insert into envios (cliente_id, referencia_cliente, estado,',
    E'  -- El precio lo comprueba la base de datos (2026-11-23): el del tarifador, al céntimo.\n'
    || E'  v_precio := precio_cliente_comprobado(p_datos, tarifa_tipos_ruta(null, p_paradas), factor_tarifa_envio(v_cliente));\n\n'
    || E'  insert into envios (cliente_id, referencia_cliente, estado,');

  n := (length(d) - length(replace(d, $x$round((p_datos ->> 'importe_tarifa')::numeric, 2)$x$, ''))) / length($x$round((p_datos ->> 'importe_tarifa')::numeric, 2)$x$);
  if n <> 1 then raise exception 'crear_envio_cliente: importe_tarifa no encontrado (%)', n; end if;
  d := replace(d, $x$round((p_datos ->> 'importe_tarifa')::numeric, 2)$x$, $x$(v_precio ->> 'base')::numeric$x$);
  execute d;

  -- ---- modificar_envio_cliente ---------------------------------------------------------
  d := pg_get_functiondef('modificar_envio_cliente(uuid, jsonb, jsonb)'::regprocedure);
  n := (length(d) - length(replace(d, 'v_pagado numeric := 0;', ''))) / length('v_pagado numeric := 0;');
  if n <> 1 then raise exception 'modificar_envio_cliente: declaración no encontrada (%)', n; end if;
  d := replace(d, 'v_pagado numeric := 0;', 'v_precio jsonb; v_pagado numeric := 0;');

  -- Antes de cambiar la ruta (con las paradas de antes aún en su sitio, para leer su tipo).
  n := (length(d) - length(replace(d, E'  v_movia := coalesce(envio_asignandose(p_envio), false);', ''))) / length(E'  v_movia := coalesce(envio_asignandose(p_envio), false);');
  if n <> 1 then raise exception 'modificar_envio_cliente: v_movia no encontrado (%)', n; end if;
  d := replace(d, E'  v_movia := coalesce(envio_asignandose(p_envio), false);',
    E'  -- El precio lo comprueba la base de datos (2026-11-23): el del tarifador, al céntimo.\n'
    || E'  v_precio := precio_cliente_comprobado(p_datos, tarifa_tipos_ruta(p_envio, p_paradas), factor_tarifa_envio(e.cliente_id, p_envio));\n\n'
    || E'  v_movia := coalesce(envio_asignandose(p_envio), false);');

  n := (length(d) - length(replace(d, $x$importe_tarifa = round((p_datos ->> 'importe_tarifa')::numeric, 2)$x$, ''))) / length($x$importe_tarifa = round((p_datos ->> 'importe_tarifa')::numeric, 2)$x$);
  if n <> 1 then raise exception 'modificar_envio_cliente: importe_tarifa no encontrado (%)', n; end if;
  d := replace(d, $x$importe_tarifa = round((p_datos ->> 'importe_tarifa')::numeric, 2)$x$, $x$importe_tarifa = (v_precio ->> 'base')::numeric$x$);
  execute d;
end $do$;
