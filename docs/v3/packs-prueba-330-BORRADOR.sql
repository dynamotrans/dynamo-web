-- BORRADOR (2026-11-23): prueba 330 de la base de datos para «ofrecer el pack entero».
-- Va con packs-ofrecer-el-pack-BORRADOR.sql. Al retomarlo en v3: mover la migración a
-- supabase/migrations/ con fecha nueva y pegar esta prueba al final de comprobar_seguridad.sql.

-- 330 · OFRECER EL PACK ENTERO (usuario, 2026-11-23): se ofrece desde la partida líder por la
-- SUMA de las partidas (que se reparte), las demás no se ofrecen sueltas (ni a mano ni por
-- tandas), el transportista ve el pack entero (página, bolsa) y al aceptarlo se lleva todas.
reset role;
select set_config('request.jwt.claim.sub', '', false);
update parametros set valor = 'false' where clave = 'pago_previo_activo';
do $$
declare d date := sumar_dias_habiles(current_date, 3); cli uuid := current_setting('prueba.cliente')::uuid; v text; n uuid;
begin
  foreach v in array array['a','b','c','d'] loop
    insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
      values (cli, case v when 'a' then 4 when 'b' then 5 else 3 end, 5, 700, case v when 'a' then 300 when 'b' then 200 else 250 end, d, d + 3)
      returning id into n;
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso, nombre_empresa) values
      (n, 1, 'carga', '41001', 'Sevilla', 'ES', 'Nave 330' || v), (n, 2, 'descarga', '28001', 'Madrid', 'ES', 'Destino 330' || v);
    perform set_config('prueba.p330' || v, n::text, false);
  end loop;
  update envios set estado = 'programado' where id in (select current_setting('prueba.p330' || z)::uuid from unnest(array['a','b','c','d']) z);
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
do $$
declare a uuid := current_setting('prueba.p330a')::uuid; b uuid := current_setting('prueba.p330b')::uuid;
  c uuid := current_setting('prueba.p330c')::uuid; dd uuid := current_setting('prueba.p330d')::uuid;
  k uuid; o uuid; tok uuid; v jsonb; r jsonb; acc jsonb; ok boolean := false; t uuid; filas int; oc uuid;
begin
  k := (crear_pack(array[a, b]) ->> 'pack_id')::uuid;
  -- La que no es líder no se ofrece suelta, ni a mano ni por tandas.
  begin perform ofertar_envio(b, null, 'enlace', 200); exception when others then ok := sqlerrm like '%se ofrece el pack entero%'; end;
  if not ok then raise exception 'FALLO 330 · se ofrece suelta una partida del pack'; end if;
  if iniciar_difusion(b, 200) ->> 'resultado' <> 'en_pack' then raise exception 'FALLO 330 · la oferta por tandas no se salta la partida del pack'; end if;
  -- La líder ofrece el pack por la suma (500) o por otro total (600), repartido 3:2.
  o := ofertar_envio(a, null, 'enlace', 600);
  if (select importe_transportista from envios where id = a) <> 360 or (select importe_transportista from envios where id = b) <> 240 then
    raise exception 'FALLO 330 · el precio del pack no se reparte entre las partidas: % / %',
      (select importe_transportista from envios where id = a), (select importe_transportista from envios where id = b); end if;
  select token into tok from envio_ofertas where id = o;
  v := oferta_publica(tok);
  if (v ->> 'metros_lineales')::numeric <> 9 or (v ->> 'precio')::numeric <> 600 or (v -> 'pack' ->> 'partidas')::int <> 2
     or jsonb_array_length(v -> 'paradas') <> 4 or v -> 'paradas' -> 1 ->> 'tipo' <> 'carga' or v -> 'paradas' -> 2 ->> 'tipo' <> 'descarga' then
    raise exception 'FALLO 330 · la página de la oferta no enseña el pack entero: %', v; end if;
  -- La bolsa: una sola fila (la líder) con los totales.
  update parametros set valor = '0' where clave = 'bolsa_espera_minutos';
  select count(*) into filas from v_wtransnet where "REF." in (select referencia_gx from envios where id in (a, b));
  if filas <> 1 or (select "Largo" from v_wtransnet where "REF." = (select referencia_gx from envios where id = a)) <> 9
     or (select "Precio" from v_wtransnet where "REF." = (select referencia_gx from envios where id = a)) <> 600
     or (select "Comentarios Públicos" from v_wtransnet where "REF." = (select referencia_gx from envios where id = a)) not like 'Pack de 2 grupajes%' then
    raise exception 'FALLO 330 · la bolsa no enseña el pack en una sola fila con los totales (filas: %)', filas; end if;
  update parametros set valor = '3' where clave = 'bolsa_espera_minutos';
  -- Un transportista lo acepta (contraoferta dentro de lo automático): se lleva las dos.
  r := reservar_envio_publico(tok, null, 'prueba 330');
  if r ->> 'resultado' <> 'reservada' then raise exception 'FALLO 330 · no reserva: %', r; end if;
  acc := aceptar_oferta_publica((r ->> 'reserva_id')::uuid, 'b-59000059', 610, false, '1111 bbb', 'r-2222-ccc', 'Luis', '+34 600 333 444');
  if acc ->> 'resultado' <> 'aceptada' then raise exception 'FALLO 330 · no acepta el pack: %', acc; end if;
  select transportista_id into t from envios where id = a;
  if (select transportista_id from envios where id = b) is distinct from t or t is null
     or (select matricula_camion from envios where id = b) <> '1111BBB' or (select estado from packs where id = k) <> 'asignado' then
    raise exception 'FALLO 330 · al aceptar el pack no se lleva todas las partidas'; end if;
  if (select sum(importe_transportista) from envios where id in (a, b)) <> 610 then
    raise exception 'FALLO 330 · el precio aceptado del pack no se reparte: %', (select sum(importe_transportista) from envios where id in (a, b)); end if;
  v := carga_aceptada_publica_completa((r ->> 'reserva_id')::uuid);
  if (v -> 'pack' ->> 'partidas')::int <> 2 or jsonb_array_length(v -> 'paradas') <> 4 or (v ->> 'metros_lineales')::numeric <> 9 then
    raise exception 'FALLO 330 · tras aceptar no ve todas las partidas: %', v; end if;
  -- Si el pack cambia, las ofertas que había se retiran.
  perform crear_pack(array[c, dd]);
  oc := ofertar_envio(c, null, 'enlace', 500);
  perform quitar_de_pack(dd);
  if (select estado from envio_ofertas where id = oc) <> 'revocada' then raise exception 'FALLO 330 · cambia el pack y la oferta sigue viva'; end if;
  update envios set estado = 'cancelado' where id in (c, dd);
  if has_function_privilege('authenticated', 'public.pack_resumen(uuid)', 'execute')
     or has_function_privilege('anon', 'public.pack_repartir_precio(uuid, numeric, uuid, numeric)', 'execute') then
    raise exception 'FALLO 330 · las funciones internas del pack se pueden llamar desde fuera'; end if;
  raise notice 'OK 330 · el pack se ofrece entero desde su líder por la suma (repartida), las demás no salen sueltas, la página y la bolsa enseñan el pack, y al aceptarlo el transportista se lleva todas las partidas';
end $$;
select set_config('request.jwt.claim.sub', '', false);
