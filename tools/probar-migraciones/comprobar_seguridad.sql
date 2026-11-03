-- =====================================================================================
-- Comprobaciones de seguridad tras aplicar TODAS las migraciones.
-- Cada bloque lanza una excepción si falla (psql para con ON_ERROR_STOP) y deja
-- un NOTICE "OK" si pasa. Regla 14-bis: un punto solo está cumplido cuando hay
-- una prueba que lo demuestra.
-- =====================================================================================
set client_min_messages = notice;

-- ---- 1. Ninguna tabla de public sin seguridad por filas ------------------------------
do $$ declare lista text; begin
  select string_agg(c.relname, ', ' order by c.relname) into lista
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if lista is not null then
    raise exception 'FALLO 1 · tablas SIN seguridad por filas (abiertas por la API): %', lista;
  end if;
  raise notice 'OK 1 · todas las tablas de public tienen la seguridad por filas activada';
end $$;

-- ---- 1-bis. El chivato que queda en la base real dice lo mismo ------------------------
do $$ declare n int; begin
  select count(*) into n from v_tablas_sin_rls;
  if n > 0 then raise exception 'FALLO 1-bis · v_tablas_sin_rls devuelve % tabla(s)', n; end if;
  raise notice 'OK 1-bis · el chivato v_tablas_sin_rls devuelve 0 filas (la comprobación para producción)';
end $$;

-- ---- 2. Ninguna vista que se salte la seguridad por filas ----------------------------
do $$ declare lista text; begin
  select string_agg(c.relname, ', ' order by c.relname) into lista
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce(c.reloptions @> array['security_invoker=true'], false);
  if lista is not null then
    raise exception 'FALLO 2 · vistas que se SALTAN la seguridad (corren como su dueño): %', lista;
  end if;
  raise notice 'OK 2 · todas las vistas respetan la seguridad de quien consulta';
end $$;

-- ---- Sembrar datos como administrador (el dueño se salta RLS) ------------------------
insert into clientes (razon_social, cif) values ('Cliente Prueba S.L.', 'B12345678');
insert into auth.users (email, raw_user_meta_data)
  values ('alta@prueba.es', '{"nombre":"Alta de Prueba"}');

-- ---- 3. El alta sigue creando el perfil aunque `usuarios` tenga RLS -------------------
do $$ begin
  if not exists (select 1 from usuarios where email = 'alta@prueba.es') then
    raise exception 'FALLO 3 · registrarse NO crea el perfil: nadie podría darse de alta';
  end if;
  raise notice 'OK 3 · registrarse crea el perfil (pendiente_verificacion) con RLS activada';
end $$;

-- ---- 4. La API anónima no ve NI UNA fila de NINGUNA tabla ----------------------------
set role anon;
do $$ declare t text; n bigint; fugas text := ''; begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind in ('r','v') order by 1 loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then fugas := fugas || format('%s (%s filas) ', t, n); end if;
    exception when insufficient_privilege then null;   -- ni siquiera puede mirar: mejor aún
    end;
  end loop;
  if fugas <> '' then
    raise exception 'FALLO 4 · FUGA: la clave pública (anon) ve datos de: %', fugas;
  end if;
  raise notice 'OK 4 · con la clave pública no se ve ninguna fila de ninguna tabla ni vista';
end $$;

-- ---- 5. La API anónima no puede escribir ---------------------------------------------
do $$ begin
  insert into clientes (razon_social, cif) values ('Intruso', 'B87654321');
  raise exception 'FALLO 5 · la clave pública (anon) PUEDE crear clientes';
exception when insufficient_privilege then
  raise notice 'OK 5 · con la clave pública no se puede escribir';
end $$;

reset role;

-- ---- 6. Las herramientas internas no se pueden llamar desde la API -------------------
-- activar_rastro() crea triggers: es para migraciones, no para la API.
do $$ declare roles text; begin
  select string_agg(r, ', ') into roles from unnest(array['anon','authenticated']) r
  where has_function_privilege(r, 'activar_rastro(text)', 'execute');
  if roles is not null then
    raise exception 'FALLO 6 · activar_rastro() se puede llamar desde la API con: %', roles;
  end if;
  raise notice 'OK 6 · activar_rastro() no se puede llamar desde la API';
end $$;

-- ---- 7. Y la llave maestra (service_role) sigue viéndolo todo ------------------------
set role service_role;
do $$ declare n bigint; begin
  select count(*) into n from clientes;
  if n <> 1 then raise exception 'FALLO 7 · service_role ve % clientes, esperaba 1', n; end if;
  raise notice 'OK 7 · el servidor (service_role) sigue teniendo acceso completo';
end $$;
reset role;

-- =====================================================================================
-- 0010 · HITOS, OFERTAS, RESERVAS Y PIN — el flujo completo de una carga
-- =====================================================================================
-- Aquí NO basta con mirar permisos: se recorre una carga de verdad, de punta a punta,
-- intentando romperla como lo haría alguien de fuera.

-- ---- 8. Las funciones de la página pública no se pueden llamar con la clave pública --
do $$ declare fallos text := ''; f text; r text; begin
  foreach f in array array[
    -- reservar_envio y liberar_reserva salen de esta lista el 2026-11-03: la página
    -- pública "aceptar carga" las llama con la clave pública (ver comprobación 59).
    'aceptar_reserva(uuid,uuid,uuid,numeric)', 'validar_pin_parada(uuid,text,inet,text)',
    'registrar_hito(uuid,tipo_hito,uuid,uuid,jsonb,text)',
    'cerrar_aceptacion(uuid,uuid,uuid,numeric)', 'caducar_reservas(uuid)',
    'preparar_pines_envio(uuid)', 'parametro(text)', 'pin_aleatorio(integer)',
    'oferta_de_token(uuid)'] loop
    foreach r in array array['anon','authenticated'] loop
      if has_function_privilege(r, f, 'execute') then fallos := fallos || r || '→' || f || ' '; end if;
    end loop;
  end loop;
  foreach f in array array[
    'ofertar_envio(uuid,uuid,text,numeric,smallint,boolean)', 'validar_pin_manual(uuid,text)',
    'regenerar_pin_parada(uuid)', 'resolver_contraoferta(uuid,boolean)'] loop
    if has_function_privilege('anon', f, 'execute') then fallos := fallos || 'anon→' || f || ' '; end if;
  end loop;
  if fallos <> '' then raise exception 'FALLO 8 · funciones llamables desde la API: %', fallos; end if;
  raise notice 'OK 8 · reservar, aceptar y validar PIN solo los puede llamar el servidor';
end $$;

-- ---- Sembrar: cliente con PIN obligatorio, transportista, envío de 2 puntos ----------
do $$ declare c uuid; t uuid; e uuid; p1 uuid; p2 uuid; begin
  insert into clientes (razon_social, cif, exige_pin) values ('Cliente PIN S.L.', 'B22222222', true)
    returning id into c;
  insert into transportistas (razon_social, cif) values ('Transportes Prueba S.L.', 'B33333333')
    returning id into t;
  insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista)
    values (c, 13.30, 20, 1000, 800) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso)
    values (e, 1, 'carga', '41001', 'Sevilla', 'ES') returning id into p1;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso)
    values (e, 2, 'descarga', '28001', 'Madrid', 'ES') returning id into p2;
  update envios set estado = 'programado' where id = e;
  perform set_config('prueba.cliente', c::text, false);
  perform set_config('prueba.transp',  t::text, false);
  perform set_config('prueba.envio',   e::text, false);
  perform set_config('prueba.p1',      p1::text, false);
  perform set_config('prueba.p2',      p2::text, false);
end $$;

-- ---- 9. Los hitos y los PIN salen solos al confirmar ---------------------------------
do $$ declare e uuid := current_setting('prueba.envio')::uuid; n int; begin
  select count(*) into n from envio_hitos where envio_id = e and hito in ('creado','confirmado');
  if n <> 2 then raise exception 'FALLO 9 · esperaba hitos creado+confirmado, hay %', n; end if;
  if (select confirmado_en from envios where id = e) is null then
    raise exception 'FALLO 9 · confirmado_en no se ha sellado';
  end if;
  select count(*) into n from envio_parada_pines where envio_id = e and pin ~ '^[0-9]{4}$';
  if n <> 2 then raise exception 'FALLO 9 · esperaba 2 PIN de 4 cifras, hay %', n; end if;
  raise notice 'OK 9 · al confirmar quedan sellados los hitos y se generan los PIN de 4 cifras';
end $$;

-- ---- 10. Los registros append-only no se pueden tocar ---------------------------------
do $$ begin
  begin update envio_hitos set hito = 'cancelado';
        raise exception 'FALLO 10 · se ha podido modificar un hito';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  begin delete from envio_hitos;
        raise exception 'FALLO 10 · se ha podido borrar un hito';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  raise notice 'OK 10 · los hitos no se pueden modificar ni borrar (ni siquiera el dueño)';
end $$;

-- ---- 11. Reserva: solo uno a la vez, y caduca sola -----------------------------------
do $$ declare e uuid := current_setting('prueba.envio')::uuid; o uuid; tok uuid; r jsonb; r2 jsonb; begin
  o := ofertar_envio(e, current_setting('prueba.transp')::uuid, 'email', 800, 10::smallint);
  if (select banda_euros from envio_ofertas where id = o) <> 80 then
    raise exception 'FALLO 11 · la banda del 10%% sobre 800 deberia ser 80 EUR';
  end if;
  if (select estado_asignacion from envios where id = e) <> 'ofertada'
     or (select primera_oferta_en from envios where id = e) is null then
    raise exception 'FALLO 11 · ofertar no ha marcado el envio como ofertado';
  end if;
  select token into tok from envio_ofertas where id = o;
  r := reservar_envio(tok, '10.0.0.1');
  if r->>'resultado' <> 'reservada' then raise exception 'FALLO 11 · primera reserva: %', r; end if;
  r2 := reservar_envio((select token_publico from envios where id = e), '10.0.0.2');
  if r2->>'resultado' <> 'en_tramite' then
    raise exception 'FALLO 11 · DOS transportistas tienen la misma carga a la vez: %', r2;
  end if;
  -- Simular que pasan los 3 minutos.
  update envio_reservas set desde = now() - interval '10 min', hasta = now() - interval '7 min'
   where id = (r->>'reserva_id')::uuid;
  r2 := reservar_envio((select token_publico from envios where id = e), '10.0.0.2');
  if r2->>'resultado' <> 'reservada' then
    raise exception 'FALLO 11 · la reserva caducada no ha liberado la carga: %', r2;
  end if;
  if (select estado from envio_reservas where id = (r->>'reserva_id')::uuid) <> 'caducada' then
    raise exception 'FALLO 11 · la reserva vieja no consta como caducada';
  end if;
  perform set_config('prueba.reserva', r2->>'reserva_id', false);
  raise notice 'OK 11 · solo un transportista puede tener la carga reservada, y a los 3 min se libera';
end $$;

-- ---- 12. Aceptar: precio fuera de banda no; dentro sí; después, carga tomada --------
do $$ declare e uuid := current_setting('prueba.envio')::uuid;
              res uuid := current_setting('prueba.reserva')::uuid;
              t uuid := current_setting('prueba.transp')::uuid; r jsonb; begin
  -- Esta reserva entró por el enlace general (sin oferta): banda 0, solo vale el precio fijado.
  r := aceptar_reserva(res, t, null, 1000);
  if r->>'resultado' <> 'precio_fuera_de_banda' then
    raise exception 'FALLO 12 · se ha aceptado un precio fuera de banda: %', r;
  end if;
  r := aceptar_reserva(res, t, null, null);
  if r->>'resultado' <> 'aceptada' then raise exception 'FALLO 12 · aceptar: %', r; end if;
  if (select transportista_id from envios where id = e) <> t
     or (select estado_asignacion from envios where id = e) <> 'confirmada'
     or (select asignado_en from envios where id = e) is null then
    raise exception 'FALLO 12 · el envio no ha quedado asignado';
  end if;
  if not exists (select 1 from envio_hitos where envio_id = e and hito = 'transportista_asignado') then
    raise exception 'FALLO 12 · falta el hito transportista_asignado';
  end if;
  r := reservar_envio((select token_publico from envios where id = e));
  if r->>'resultado' <> 'tomada' then
    raise exception 'FALLO 12 · una carga ya asignada se puede volver a reservar: %', r;
  end if;
  raise notice 'OK 12 · aceptar revalida la reserva y el precio; una carga asignada queda tomada';
end $$;

-- ---- 13. Contraoferta: hasta el 10%% sola, por encima a revisión de Dynamo -----------
do $$ declare c uuid := current_setting('prueba.cliente')::uuid; t uuid := current_setting('prueba.transp')::uuid;
              e uuid; o uuid; r jsonb; begin
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista)
    values (c, 6, 600, 500) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 1, 'carga', '41001', 'Sevilla');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 2, 'descarga', '46001', 'Valencia');
  update envios set estado = 'programado' where id = e;
  o := ofertar_envio(e, t, 'email', 500, 30::smallint);          -- banda 150 EUR
  r := reservar_envio((select token from envio_ofertas where id = o));
  r := aceptar_reserva((r->>'reserva_id')::uuid, t, null, 620);  -- +24%: dentro de banda, >10%
  if r->>'resultado' <> 'pendiente_revision' then
    raise exception 'FALLO 13 · una contraoferta del 24%% deberia ir a revision: %', r;
  end if;
  r := resolver_contraoferta((select id from envio_reservas where envio_id = e and estado = 'pendiente_revision'), true);
  if r->>'resultado' <> 'aceptada' or (select importe_transportista from envios where id = e) <> 620 then
    raise exception 'FALLO 13 · aprobar la contraoferta no asigna al precio propuesto: %', r;
  end if;
  raise notice 'OK 13 · contraoferta: dentro del 10%% la decide el sistema, por encima la aprueba Dynamo';
end $$;

-- ---- 14. PIN: 3 fallos bloquean, y el bloqueo no se salta acertando después ---------
do $$ declare p1 uuid := current_setting('prueba.p1')::uuid; p2 uuid := current_setting('prueba.p2')::uuid;
              buen text; malo text; r jsonb; begin
  -- Entrega ANTES que recogida: se deja, con aviso (decisión del 2026-11-02).
  select pin into buen from envio_parada_pines where parada_id = p2;
  r := validar_pin_parada(p2, buen, '10.0.0.9');
  if r->>'resultado' <> 'validado' or r->>'aviso' is null then
    raise exception 'FALLO 14 · entrega antes que recogida deberia validar con aviso: %', r;
  end if;
  if not exists (select 1 from envio_hitos where parada_id = p2 and hito = 'pin_fuera_de_orden') then
    raise exception 'FALLO 14 · falta el hito pin_fuera_de_orden';
  end if;
  if (select hora_real from envio_paradas where id = p2) is null then
    raise exception 'FALLO 14 · validar el PIN no ha sellado la hora real del punto';
  end if;

  select pin into buen from envio_parada_pines where parada_id = p1;
  malo := lpad(((buen::int + 1) % 10000)::text, 4, '0');
  r := validar_pin_parada(p1, malo);
  if r->>'resultado' <> 'incorrecto' or (r->>'intentos_restantes')::int <> 2 then
    raise exception 'FALLO 14 · primer fallo: %', r; end if;
  r := validar_pin_parada(p1, malo);
  r := validar_pin_parada(p1, malo);
  if r->>'resultado' <> 'bloqueado' then raise exception 'FALLO 14 · 3 fallos no bloquean: %', r; end if;
  r := validar_pin_parada(p1, buen);
  if r->>'resultado' <> 'bloqueado' then
    raise exception 'FALLO 14 · tras bloquearse, el PIN bueno sigue entrando: %', r;
  end if;
  if (select count(*) from pin_intentos where parada_id = p1) <> 4 then
    raise exception 'FALLO 14 · no se han registrado los 4 intentos';
  end if;
  if not exists (select 1 from envio_hitos where parada_id = p1 and hito = 'incidencia') then
    raise exception 'FALLO 14 · el bloqueo no ha generado incidencia';
  end if;
  raise notice 'OK 14 · PIN: 3 fallos lo bloquean, acertar luego no lo desbloquea, todo queda registrado';
end $$;

-- ---- Usuarios de prueba: un admin, un transportista y un cliente ---------------------
do $$ declare a uuid; t uuid; c uuid; begin
  insert into auth.users (email) values ('admin@dynamo.prueba') returning id into a;
  update usuarios set rol = 'admin', estado = 'activa' where id = a;
  insert into auth.users (email) values ('trafico@transportes.prueba') returning id into t;
  update usuarios set rol = 'transportista', estado = 'activa',
         transportista_id = current_setting('prueba.transp')::uuid where id = t;
  insert into auth.users (email) values ('compras@cliente.prueba') returning id into c;
  update usuarios set rol = 'cliente', estado = 'activa',
         cliente_id = current_setting('prueba.cliente')::uuid where id = c;
  perform set_config('prueba.u_admin',  a::text, false);
  perform set_config('prueba.u_transp', t::text, false);
  perform set_config('prueba.u_cli',    c::text, false);
end $$;

-- ---- 15. El transportista ve las paradas de su envío pero NUNCA el PIN ---------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ declare e uuid := current_setting('prueba.envio')::uuid; n int; begin
  select jsonb_array_length(paradas) into n from mis_viajes() where id = e;
  if n is distinct from 2 then raise exception 'FALLO 15 · el transportista no ve las paradas de su viaje (%)', n; end if;
  select count(*) into n from envio_paradas;
  if n <> 0 then raise exception 'FALLO 15 · el transportista lee la tabla de paradas directamente'; end if;
  select count(*) into n from envio_parada_pines;
  if n <> 0 then raise exception 'FALLO 15 · FUGA: el transportista puede LEER % PIN', n; end if;
  select count(*) into n from envio_ofertas;
  if n <> 0 then raise exception 'FALLO 15 · el transportista ve las ofertas (y su banda %%)'; end if;
  select count(*) into n from envio_hitos where envio_id = e and hito in ('ofertado','enlace_abierto','reservado');
  if n <> 0 then raise exception 'FALLO 15 · el transportista ve hitos internos (%)', n; end if;
  select count(*) into n from envio_hitos where envio_id = e and hito = 'transportista_asignado';
  if n = 0 then raise exception 'FALLO 15 · el transportista no ve que tiene la carga asignada'; end if;
  raise notice 'OK 15 · el transportista ve sus paradas e hitos utiles, pero no el PIN ni las ofertas';
end $$;

-- ---- 16. Validar a mano: solo Dynamo, y con explicación ------------------------------
do $$ begin
  perform validar_pin_manual(current_setting('prueba.p1')::uuid, 'me lo dijo el chofer');
  raise exception 'FALLO 16 · un TRANSPORTISTA ha podido validar un PIN a mano';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform ofertar_envio(current_setting('prueba.envio')::uuid, null, 'bolsa_wtransnet', 1);
  raise exception 'FALLO 16 · un TRANSPORTISTA ha podido ofertar una carga';
exception when insufficient_privilege then null;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare p1 uuid := current_setting('prueba.p1')::uuid; r jsonb; begin
  begin perform validar_pin_manual(p1, 'ok');
        raise exception 'FALLO 16 · se ha validado a mano sin explicar por que';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  r := validar_pin_manual(p1, 'Sin cobertura en nave. Llamo Juan (chofer), confirmado con muelle.');
  if r->>'resultado' <> 'validado_manual' then raise exception 'FALLO 16 · %', r; end if;
  raise notice 'OK 16 · solo Dynamo valida a mano, con nota obligatoria, y queda quien lo hizo';
end $$;
reset role;
do $$ begin
  if (select validado_por from envio_parada_pines where parada_id = current_setting('prueba.p1')::uuid)
     is distinct from current_setting('prueba.u_admin')::uuid then
    raise exception 'FALLO 16 · no consta QUIEN de Dynamo valido a mano';
  end if;
end $$;

-- ---- 17. El cliente ve su envío y sus hitos, pero no el PIN ni la cocina -----------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare e uuid := current_setting('prueba.envio')::uuid; n int; begin
  select count(*) into n from envio_hitos where envio_id = e;
  if n = 0 then raise exception 'FALLO 17 · el cliente no ve los hitos de su envio'; end if;
  select count(*) into n from envio_hitos where envio_id = e
    and hito in ('ofertado','enlace_abierto','reservado','reserva_caducada','contraoferta_propuesta');
  if n <> 0 then raise exception 'FALLO 17 · el cliente ve a quien se oferto su carga (%)', n; end if;
  select count(*) into n from envio_parada_pines;
  if n <> 0 then raise exception 'FALLO 17 · FUGA: el cliente puede leer los PIN'; end if;
  select count(*) into n from envio_reservas;
  if n <> 0 then raise exception 'FALLO 17 · el cliente ve las reservas'; end if;
  raise notice 'OK 17 · el cliente ve la vida de su envio, pero no ofertas, reservas ni PIN';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- =====================================================================================
-- AJUSTES DE CLIENTES Y TRANSPORTISTAS (2026-11-02)
-- =====================================================================================
-- ---- 18. Nombre visible, bolsa de carga y pronto pago por transportista --------------
do $$ declare t uuid; c uuid; e uuid; o uuid; begin
  insert into clientes (razon_social, nombre_comercial, cif)
    values ('Marbex Industrial S.L.', 'Marbex', 'B44444444') returning id into c;
  if (select nombre_visible from clientes where id = c) <> 'Marbex' then
    raise exception 'FALLO 18 · el nombre visible no usa el nombre comercial';
  end if;
  update clientes set nombre_comercial = '  ' where id = c;
  if (select nombre_visible from clientes where id = c) <> 'Marbex Industrial S.L.' then
    raise exception 'FALLO 18 · sin nombre comercial deberia verse la razon social';
  end if;

  begin
    insert into transportistas (razon_social, cif, codigo_bolsa) values ('Sin Bolsa SL', 'B55555555', '12345');
    raise exception 'FALLO 18 · se ha guardado un codigo de bolsa sin decir de que bolsa';
  exception when check_violation then null;
  end;
  begin
    insert into transportistas (razon_social, cif, bolsa) values ('Bolsa Rara SL', 'B66666666', 'timocom');
    raise exception 'FALLO 18 · se ha aceptado una bolsa que no es de Alpega';
  exception when check_violation then null;
  end;

  insert into transportistas (razon_social, cif, bolsa, codigo_bolsa, pronto_pago)
    values ('Sin Pronto Pago SL', 'B77777777', 'teleroute', 'TR-998', false) returning id into t;
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista)
    values (c, 4, 400, 300) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 1, 'carga', '41001', 'Sevilla');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 2, 'descarga', '29001', 'Malaga');
  update envios set estado = 'programado' where id = e;
  o := ofertar_envio(e, t, 'email', 300, 10::smallint, true);
  if (select pronto_pago from envio_ofertas where id = o) then
    raise exception 'FALLO 18 · a un transportista sin pronto pago se le ha ofertado con pronto pago';
  end if;
  raise notice 'OK 18 · razon social + nombre comercial, solo bolsas de Alpega, pronto pago por transportista';
end $$;

-- =====================================================================================
-- AJUSTES DE CONTACTOS Y USUARIOS (2026-11-02)
-- =====================================================================================
-- ---- 19. Idioma, avisos, cargo y límite de consultas ---------------------------------
do $$ declare c uuid; k uuid; begin
  select id into c from clientes where cif = 'B44444444';
  insert into contactos (cliente_id, nombre, cargo, email, idioma, recibe_avisos)
    values (c, 'Marta Ruiz', 'Jefa de trafico', 'marta@marbex.prueba', 'pl', true) returning id into k;
  if (select idioma from contactos where id = k) <> 'pl' then
    raise exception 'FALLO 19 · el idioma del contacto no se guarda';
  end if;
  insert into contactos (cliente_id, email) values (c, 'otro@marbex.prueba') returning id into k;
  if (select idioma || '/' || recibe_avisos from contactos where id = k) <> 'es/false' then
    raise exception 'FALLO 19 · por defecto deberia ser espanol y sin avisos';
  end if;
  begin
    insert into contactos (cliente_id, email, idioma) values (c, 'raro@marbex.prueba', 'polaco');
    raise exception 'FALLO 19 · se ha aceptado un idioma que no es un codigo valido';
  exception when check_violation then null;
  end;
  begin
    update usuarios set limite_consultas_precio_diario = 0
     where id = current_setting('prueba.u_cli')::uuid;
    raise exception 'FALLO 19 · se ha aceptado un limite de consultas de 0';
  exception when check_violation then null;
  end;
  update usuarios set limite_consultas_precio_diario = 50, cargo = 'Compras', idioma = 'pt'
   where id = current_setting('prueba.u_cli')::uuid;
  raise notice 'OK 19 · idioma, recibe_avisos, cargo y limite de consultas de precio';
end $$;

-- ---- 20. Sitios: cita previa (no por defecto) y medios de carga (sí por defecto) -----
do $$ declare l uuid; begin
  insert into lugares (nombre_empresa, cliente_id)
    values ('Nave Prueba', (select id from clientes where cif = 'B44444444')) returning id into l;
  if (select requiere_cita from lugares where id = l)
     or not (select tiene_medios_carga from lugares where id = l) then
    raise exception 'FALLO 20 · por defecto deberia ser: sin cita previa y con medios de carga';
  end if;
  update lugares set requiere_cita = true, tiene_medios_carga = false where id = l;
  raise notice 'OK 20 · sitios: sin cita previa y con medios de carga por defecto';
end $$;

-- =====================================================================================
-- SITIOS: CADA CLIENTE LOS SUYOS (decisión del usuario, 2026-11-02)
-- =====================================================================================
-- Cliente A = 'Cliente PIN S.L.' (usuario prueba.u_cli) · Cliente B = Marbex (usuario nuevo)
do $$ declare b uuid; begin
  insert into auth.users (email) values ('compras@marbex.prueba') returning id into b;
  update usuarios set rol = 'cliente', estado = 'activa',
         cliente_id = (select id from clientes where cif = 'B44444444') where id = b;
  perform set_config('prueba.u_cli_b', b::text, false);
  insert into lugares (nombre_empresa, es_almacen_dynamo, codigo_postal)
    values ('Almacen Dynamo Sevilla', true, '41016');
  begin
    insert into lugares (nombre_empresa) values ('Sitio sin duenyo');
    raise exception 'FALLO 21 · se ha creado un sitio que no es de ningun cliente';
  exception when check_violation then null;
  end;
end $$;

-- ---- 21. A y B tienen cada uno su ficha de la MISMA nave; nadie ve la del otro ------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare l uuid; begin
  insert into lugares (nombre_empresa, codigo_postal, anotaciones)
    values ('Nave Mercaplus', '41500', 'Manolo, el de cargas, es amigo de Pepe mi primo')
    returning id into l;                                   -- con RETURNING, como la app
  perform set_config('prueba.lugar_a', l::text, false);
  if (select cliente_id from lugares where id = l) is distinct from cliente_del_usuario() then
    raise exception 'FALLO 21 · el sitio creado no ha quedado a nombre del cliente';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli_b'), false);
set role authenticated;
do $$ declare l uuid; n int; begin
  select count(*) into n from lugares where nombre_empresa = 'Nave Mercaplus';
  if n <> 0 then raise exception 'FALLO 21 · FUGA: B ve la ficha (y las notas) de A'; end if;
  insert into lugares (nombre_empresa, codigo_postal, horarios)
    values ('Nave Mercaplus', '41500', 'L-V 6:00-14:00') returning id into l;
  perform set_config('prueba.lugar_b', l::text, false);
  select count(*) into n from lugares where es_almacen_dynamo;
  if n <> 1 then raise exception 'FALLO 21 · B no ve los almacenes Dynamo'; end if;
  raise notice 'OK 21 · cada cliente tiene su propia ficha de la nave; ninguno ve la del otro (ni sus notas)';
end $$;

-- ---- 22. Lo que B cambia en su ficha no toca la de A --------------------------------
do $$ declare n int; begin
  -- (Desde 2026-11-03 el horario va en lugar_horarios; el texto es un resumen automático.)
  update lugar_horarios set cierra = '15:00'
   where lugar_id = current_setting('prueba.lugar_b')::uuid and dia_semana = 1 and abre = '08:00';
  update lugares set anotaciones = 'HACKEADO' where id = current_setting('prueba.lugar_a')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO 22 · B ha modificado la ficha de A'; end if;
  delete from lugar_horarios where lugar_id = current_setting('prueba.lugar_a')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO 22 · B ha borrado el horario de A'; end if;
  update lugares set borrado = true, borrado_en = now() where id = current_setting('prueba.lugar_b')::uuid;
  select count(*) into n from lugares where id = current_setting('prueba.lugar_b')::uuid and not borrado;
  if n <> 0 then raise exception 'FALLO 22 · el sitio borrado sigue en la agenda de B'; end if;
  begin
    update lugares set es_almacen_dynamo = true where id = current_setting('prueba.lugar_b')::uuid;
  exception when others then null;
  end;
  raise notice 'OK 22 · cada cliente edita y borra solo lo suyo';
end $$;
reset role;
do $$ begin
  if (select horarios from lugares where id = current_setting('prueba.lugar_a')::uuid)
     is distinct from 'L-J 8:00-14:00 y 15:00-17:30 · V 8:00-14:00' then
    raise exception 'FALLO 22 · el horario de la ficha de A ha cambiado';
  end if;
  if (select anotaciones from lugares where id = current_setting('prueba.lugar_a')::uuid) not like 'Manolo%' then
    raise exception 'FALLO 22 · las notas de A se han perdido';
  end if;
end $$;

-- ---- 23. Un envío solo va a sitios de su cliente (o a un almacén Dynamo) ------------
do $$ declare e uuid; b uuid := (select id from clientes where cif = 'B44444444'); begin
  insert into envios (cliente_id, metros_lineales) values (b, 4) returning id into e;
  -- Ni siquiera Dynamo puede poner en un envío de B la ficha de A.
  begin
    insert into envio_paradas (envio_id, orden, tipo, lugar_id, codigo_postal, poblacion)
      values (e, 1, 'carga', current_setting('prueba.lugar_a')::uuid, '41500', 'Alcala');
    raise exception 'FALLO 23 · un envio de B ha usado la ficha de A';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  insert into envio_paradas (envio_id, orden, tipo, lugar_id, codigo_postal, poblacion)
    values (e, 1, 'carga', (select id from lugares where es_almacen_dynamo limit 1), '41016', 'Sevilla');
  raise notice 'OK 23 · un envio solo usa sitios de su propio cliente o almacenes Dynamo';
end $$;

-- =====================================================================================
-- FLOTA (2026-11-02)
-- =====================================================================================
-- ---- 24. Matrículas: sin duplicados aunque se escriban distinto ----------------------
do $$ declare t uuid := current_setting('prueba.transp')::uuid; begin
  insert into vehiculos (transportista_id, matricula, tipo) values (t, '1234 lbc', 'tractora');
  insert into vehiculos (transportista_id, matricula, tipo) values (t, 'R-5678-BCD', 'remolque');
  insert into vehiculos (transportista_id, matricula, tipo) values (t, '9876 KJH', 'rigido');
  insert into vehiculos (transportista_id, matricula, tipo) values (t, 'WGM 12345', 'tractora');
  begin
    insert into vehiculos (transportista_id, matricula, tipo) values (t, '1234-LBC', 'tractora');
    raise exception 'FALLO 24 · se ha duplicado una matricula escrita de otra forma';
  exception when unique_violation then null; end;
  begin
    insert into vehiculos (transportista_id, matricula, tipo) values (t, 'X1', 'tractora');
    raise exception 'FALLO 24 · se ha aceptado una matricula de 2 caracteres';
  exception when check_violation then null; end;
  if exists (select 1 from information_schema.columns where column_name = 'tiene_whatsapp') then
    raise exception 'FALLO 24 · sigue existiendo alguna columna tiene_whatsapp';
  end if;
  raise notice 'OK 24 · matriculas sin duplicados; sin columnas tiene_whatsapp (movil = WhatsApp)';
end $$;

-- ---- 25. Un rígido no lleva remolque; las piezas tienen que cuadrar ------------------
do $$ declare e uuid := current_setting('prueba.envio')::uuid;
              t uuid := current_setting('prueba.transp')::uuid;
              rig uuid; tra uuid; rem uuid; begin
  select id into rig from vehiculos where transportista_id = t and tipo = 'rigido' limit 1;
  select id into tra from vehiculos where transportista_id = t and tipo = 'tractora' and matricula = '1234 lbc';
  select id into rem from vehiculos where transportista_id = t and tipo = 'remolque' limit 1;
  update envios set vehiculo_camion_id = tra, vehiculo_remolque_id = rem,
                    matricula_camion = '1234 LBC', matricula_remolque = 'R 5678 BCD' where id = e;
  if not exists (select 1 from envio_hitos where envio_id = e and hito = 'matricula_asignada'
                 and datos->>'camion' = '1234 LBC') then
    raise exception 'FALLO 25 · al poner la matricula no ha salido el hito con el camion';
  end if;
  begin
    update envios set vehiculo_camion_id = rig where id = e;
    raise exception 'FALLO 25 · se ha puesto un rigido CON remolque';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  update envios set vehiculo_camion_id = rig, vehiculo_remolque_id = null,
                    matricula_camion = '9876 KJH', matricula_remolque = null where id = e;
  begin
    update envios set vehiculo_camion_id = rem where id = e;
    raise exception 'FALLO 25 · se ha puesto un remolque como camion';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Autónomo que viene SUBCONTRATADO: su camión "suele venir" con otra empresa, o con
  -- ninguna. Se tiene que poder poner igual.
  insert into vehiculos (transportista_id, matricula, tipo) values (null, '5555 MNP', 'tractora')
    returning id into tra;
  update envios set vehiculo_camion_id = tra, matricula_camion = '5555 MNP' where id = e;
  insert into conductores (nombre, documento) values ('Autonomo Subcontratado', '12345678Z');
  begin
    insert into conductores (nombre, documento, transportista_id)
      values ('El mismo con otra empresa', '12345678-z', t);
    raise exception 'FALLO 25 · el mismo conductor (mismo DNI) se ha dado de alta dos veces';
  exception when unique_violation then null; end;
  raise notice 'OK 25 · rigido sin remolque; camiones y conductores libres (pueden venir subcontratados)';
end $$;

-- ---- 26. Lo que el cliente lee de sus envíos no enseña lo interno -------------------
do $$ declare r text := pg_get_function_result('mis_envios()'::regprocedure); w text; begin
  foreach w in array array['importe_transportista','margen_euros','factor_tarifa_aplicado',
                           'transportista_id','transportista_nima','primera_oferta_en'] loop
    if r ~ ('\m' || w || '\M') then raise exception 'FALLO 26 · mis_envios() ensena %', w; end if;
  end loop;
  if r !~ '\mmatricula_camion\M' then raise exception 'FALLO 26 · mis_envios() no tiene matricula_camion'; end if;
  raise notice 'OK 26 · lo que el cliente lee de sus envios no ensena precio del transportista, margen ni factor';
end $$;

-- =====================================================================================
-- ENVÍOS MANUALES: el cliente con su propio transportista (v1.0, 2026-11-02)
-- =====================================================================================
-- ---- 27. Cada cliente su catálogo de operadores, privado ----------------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare o uuid; begin
  insert into operadores (razon_social, cif, email)
    values ('Transportes Iberia Express S.L.', 'B58830217', 'trafico@iberia.prueba') returning id into o;
  perform set_config('prueba.operador_a', o::text, false);
  begin
    insert into operadores (razon_social, cif) values ('Iberia repetida', 'b-58830217');
    raise exception 'FALLO 27 · el mismo CIF esta dos veces en el catalogo del cliente';
  exception when unique_violation then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli_b'), false);
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from operadores;
  if n <> 0 then raise exception 'FALLO 27 · FUGA: B ve los operadores de A'; end if;
  insert into operadores (razon_social, cif) values ('Iberia para B', 'B58830217');  -- otro cliente, sí
  raise notice 'OK 27 · cada cliente tiene su catalogo de operadores privado, sin CIF repetidos';
end $$;
reset role;

-- ---- 28. El envío manual: Dynamo no interviene en nada -------------------------------
-- El envío lo crea el SERVIDOR (como todos los envíos); el cliente lo lee con mis_envios().
do $$ declare e uuid; o uuid := current_setting('prueba.operador_a')::uuid; begin
  insert into envios (cliente_id, metros_lineales, operador_id, precio_acordado_operador)
    values (current_setting('prueba.cliente')::uuid, 13.30, o, 950) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso)
    values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
  -- Destino donde DYNAMO no da servicio: al transportista del cliente no le afecta.
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso)
    values (e, 2, 'descarga', '8001', 'Zurich', 'CH');
  update envios set estado = 'programado' where id = e;
  perform set_config('prueba.envio_manual', e::text, false);
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare e uuid := current_setting('prueba.envio_manual')::uuid; begin
  if not coalesce((select es_manual from mis_envios() where id = e), false)
     or (select precio_acordado_operador from mis_envios() where id = e) <> 950 then
    raise exception 'FALLO 28 · el cliente no ve su envio manual con su precio acordado';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare e uuid := current_setting('prueba.envio_manual')::uuid; begin
  if exists (select 1 from envio_parada_pines where envio_id = e) then
    raise exception 'FALLO 28 · se han generado PIN en un envio manual';
  end if;
  begin
    perform ofertar_envio(e, current_setting('prueba.transp')::uuid, 'email', 500);
    raise exception 'FALLO 28 · Dynamo ha ofertado un envio manual a su red';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    update envios set importe_cliente = 1000 where id = e;
    raise exception 'FALLO 28 · un envio manual tiene precio de Dynamo';
  exception when check_violation then null; end;
  begin
    update envios set operador_id = (select id from operadores where razon_social = 'Iberia para B')
     where id = e;
    raise exception 'FALLO 28 · un envio usa el operador de OTRO cliente';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK 28 · envio manual: sin ofertas, sin PIN, sin precio de Dynamo ni zonas de Dynamo';
end $$;

-- ---- 29. Y un envío de Dynamo a Zúrich SIGUE bloqueado ----------------------------
do $$ declare e uuid; begin
  insert into envios (cliente_id, metros_lineales)
    values ((select id from clientes where cif = 'B44444444'), 13.30) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso)
    values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso)
    values (e, 2, 'descarga', '8001', 'Zurich', 'CH');
  begin
    update envios set estado = 'programado' where id = e;
    raise exception 'FALLO 29 · Dynamo ha aceptado un envio a una zona donde no da servicio';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK 29 · las zonas sin servicio siguen bloqueando los envios de Dynamo';
end $$;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 30. Dynamo SÍ ve los envíos manuales de sus clientes (decisión 2026-11-02) -----
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from envios where id = current_setting('prueba.envio_manual')::uuid;
  if n <> 1 then raise exception 'FALLO 30 · Dynamo no ve el envio manual del cliente'; end if;
  select count(*) into n from operadores;
  if n < 2 then raise exception 'FALLO 30 · Dynamo no ve los operadores de sus clientes'; end if;
  raise notice 'OK 30 · Dynamo ve los envios manuales y los operadores de sus clientes';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- =====================================================================================
-- OPERATIVA (2026-11-03): incidencias, penalizaciones, almacenamientos, documentos, CMR
-- =====================================================================================
-- ---- 31. El corte de cancelación: 9:00 de Madrid del día hábil anterior -------------
do $$ begin
  -- Carga el lunes 9-nov-2026 → corte el viernes 6 a las 9:00 de Madrid (8:00 UTC).
  if corte_cancelacion('2026-11-09') <> '2026-11-06 08:00:00+00' then
    raise exception 'FALLO 31 · corte de un lunes: %', corte_cancelacion('2026-11-09');
  end if;
  -- Carga el martes 10 → corte el lunes 9 a las 9:00.
  if corte_cancelacion('2026-11-10') <> '2026-11-09 08:00:00+00' then
    raise exception 'FALLO 31 · corte de un martes: %', corte_cancelacion('2026-11-10');
  end if;
  -- En verano Madrid es UTC+2: carga el miércoles 15-jul-2026 → martes 14 a las 7:00 UTC.
  if corte_cancelacion('2026-07-15') <> '2026-07-14 07:00:00+00' then
    raise exception 'FALLO 31 · corte en horario de verano: %', corte_cancelacion('2026-07-15');
  end if;
  raise notice 'OK 31 · corte de cancelacion: 9:00 de Madrid del dia habil anterior (verano e invierno)';
end $$;

-- ---- 32. Penalización automática al cancelar tarde, y se retira al deshacer --------
do $$ declare e uuid := current_setting('prueba.envio')::uuid; p record; e2 uuid; begin
  update envios set fecha_carga_desde = current_date where id = e;   -- el corte ya pasó
  update envios set estado = 'cancelado' where id = e;
  select * into p from penalizaciones where envio_id = e and generada_auto;
  if p.id is null then raise exception 'FALLO 32 · cancelar tarde con camion no ha penalizado'; end if;
  if p.importe_cliente is distinct from (select importe_cliente from envios where id = e) then
    raise exception 'FALLO 32 · la penalizacion no es el coste completo del servicio';
  end if;
  update envios set estado = 'programado' where id = e;            -- deshacer la cancelación
  if (select estado from penalizaciones where id = p.id) <> 'cancelada' then
    raise exception 'FALLO 32 · deshacer la cancelacion no ha retirado la penalizacion';
  end if;
  -- Dentro de plazo (carga dentro de un mes): gratis.
  update envios set fecha_carga_desde = current_date + 30, estado = 'cancelado' where id = e;
  if (select count(*) from penalizaciones where envio_id = e and estado <> 'cancelada') <> 0 then
    raise exception 'FALLO 32 · ha penalizado una cancelacion dentro de plazo';
  end if;
  update envios set estado = 'programado' where id = e;
  -- Una automática que Dynamo renegocia NO desaparece al deshacer.
  update envios set fecha_carga_desde = current_date, estado = 'cancelado' where id = e;
  update penalizaciones set importe_cliente = 200 where envio_id = e and estado = 'pendiente_confirmar';
  update envios set estado = 'programado' where id = e;
  if not exists (select 1 from penalizaciones where envio_id = e and importe_cliente = 200
                 and estado = 'pendiente_confirmar' and editada_a_mano) then
    raise exception 'FALLO 32 · una penalizacion renegociada por Dynamo se ha retirado sola';
  end if;
  raise notice 'OK 32 · cancelar tarde con camion penaliza el servicio entero; deshacer la retira (si no se renegocio)';
end $$;

-- ---- 33. El cliente ve SUS penalizaciones, sin lo que se paga al transportista -----
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from penalizaciones;
  if n <> 0 then raise exception 'FALLO 33 · el cliente lee la tabla de penalizaciones entera'; end if;
  select count(*) into n from mis_penalizaciones();
  if n <> 1 then raise exception 'FALLO 33 · el cliente no ve su penalizacion (%)', n; end if;
  raise notice 'OK 33 · el cliente ve sus penalizaciones sin el importe del transportista';
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli_b'), false);
set role authenticated;
do $$ begin
  if (select count(*) from mis_penalizaciones()) <> 0 then
    raise exception 'FALLO 33 · FUGA: B ve las penalizaciones de A';
  end if;
end $$;
reset role;

-- ---- 34. Incidencias: cada cliente las suyas; resolverlas es de Dynamo -------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare i uuid; begin
  insert into incidencias (tipo_id, envio_id, titulo, detalle)
    values ((select id from tipos_incidencia where clave = 'incidencia_transporte'),
            current_setting('prueba.envio')::uuid, 'Palet roto a la llegada', '3 de 33')
    returning id into i;
  perform set_config('prueba.incidencia', i::text, false);
  if (select cliente_id from incidencias where id = i) is distinct from cliente_del_usuario() then
    raise exception 'FALLO 34 · la incidencia no ha quedado a nombre del cliente';
  end if;
  begin
    update incidencias set estado = 'resuelto' where id = i;
    raise exception 'FALLO 34 · el cliente ha dado por resuelta su incidencia';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli_b'), false);
set role authenticated;
do $$ begin
  if (select count(*) from incidencias) <> 0 then raise exception 'FALLO 34 · FUGA: B ve incidencias de A'; end if;
end $$;
reset role;
do $$ declare i uuid := current_setting('prueba.incidencia')::uuid; begin
  if not exists (select 1 from envio_hitos where envio_id = current_setting('prueba.envio')::uuid
                 and hito = 'incidencia' and datos ? 'incidencia') then
    raise exception 'FALLO 34 · abrir la incidencia no ha dejado hito en el envio';
  end if;
  update incidencias set estado = 'resuelto', resolucion = 'Abonado al cliente' where id = i;
  if (select resuelto_en from incidencias where id = i) is null then
    raise exception 'FALLO 34 · resolver no ha sellado la hora';
  end if;
  raise notice 'OK 34 · incidencias: cada cliente las suyas, con hito en el envio; resolver es de Dynamo';
end $$;

-- ---- 35. Almacenamientos: solo en almacén Dynamo con sitio; entrega en sitio propio -
do $$ declare alm uuid := (select id from lugares where es_almacen_dynamo limit 1); begin
  update lugares set disponible = true where id = alm;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare alm uuid := (select id from lugares where es_almacen_dynamo limit 1); a uuid; begin
  insert into almacenamientos (almacen_id, fecha_entrada, fecha_salida, num_trailers,
                               importe_almacenaje)
    values (alm, current_date + 4, current_date + 10, 1, 240) returning id into a;
  if (select codigo from almacenamientos where id = a) !~ '^AX[0-9]{6}$' then
    raise exception 'FALLO 35 · el codigo no es AX + 6 cifras';
  end if;
  begin
    insert into almacenamientos (almacen_id, fecha_entrada, fecha_salida)
      values (current_setting('prueba.lugar_a')::uuid, current_date, current_date + 2);
    raise exception 'FALLO 35 · se ha almacenado en un sitio que no es almacen Dynamo';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    update almacenamientos set estado = 'confirmado' where id = a;
    raise exception 'FALLO 35 · el cliente ha confirmado su propio almacenamiento';
  exception when insufficient_privilege then null; end;
  perform set_config('prueba.alm', a::text, false);
end $$;
reset role;
do $$ declare alm uuid := (select id from lugares where es_almacen_dynamo limit 1);
              c uuid := current_setting('prueba.cliente')::uuid; begin
  update lugares set disponible = false where id = alm;
  begin
    insert into almacenamientos (cliente_id, almacen_id, fecha_entrada, fecha_salida)
      values (c, alm, current_date, current_date + 3);
    raise exception 'FALLO 35 · un almacen COMPLETO ha admitido una entrada';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Lo que ya estaba dentro no se rompe por marcar el almacén completo.
  update almacenamientos set estado = 'confirmado' where id = current_setting('prueba.alm')::uuid;
  update lugares set disponible = true where id = alm;
  begin
    insert into almacenamientos (cliente_id, almacen_id, fecha_entrada, fecha_salida,
                                 num_repartos, lugar_entrega_id)
      values (c, alm, current_date, current_date + 3, 1, current_setting('prueba.lugar_b')::uuid);
    raise exception 'FALLO 35 · el reparto va a un sitio de OTRO cliente';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK 35 · almacenamientos AX: solo en almacen Dynamo con sitio, reparto a sitio propio, confirma Dynamo';
end $$;

-- ---- 36. Documentos: cada uno lo suyo; el seguro del transportista no lo ve el cliente
select set_config('request.jwt.claim.sub', '', false);
do $$ declare t uuid := current_setting('prueba.transp')::uuid; k int; begin
  insert into documentos (tipo, transportista_id, storage_ruta, nombre_archivo)
    values ('seguro_cmr', t, 'transp/seguro.pdf', 'seguro.pdf');
  insert into documentos (tipo, envio_id, storage_ruta, nombre_archivo, visible_cliente)
    values ('albaran', current_setting('prueba.envio')::uuid, 'envios/albaran.pdf', 'albaran.pdf', true);
  insert into documentos (tipo, envio_id, transportista_id, storage_ruta, nombre_archivo)
    values ('orden_transporte', current_setting('prueba.envio')::uuid, t, 'envios/orden.pdf', 'orden.pdf');
  for k in 2..5 loop
    insert into documentos (tipo, transportista_id, storage_ruta, nombre_archivo)
      values ('otro', t, 'transp/doc' || k || '.pdf', 'doc.pdf');
  end loop;
  begin
    insert into documentos (tipo, transportista_id, storage_ruta, nombre_archivo)
      values ('otro', t, 'transp/doc6.pdf', 'doc6.pdf');
    raise exception 'FALLO 36 · el transportista tiene mas de 5 documentos en su ficha';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare n int; begin
  insert into documentos (tipo, incidencia_id, storage_ruta, nombre_archivo)
    values ('foto_incidencia', current_setting('prueba.incidencia')::uuid, 'inc/foto1.jpg', 'foto1.jpg');
  select count(*) into n from documentos where tipo in ('albaran','foto_incidencia');
  if n <> 2 then raise exception 'FALLO 36 · el cliente no ve su albaran y su foto (%)', n; end if;
  select count(*) into n from documentos where tipo in ('seguro_cmr','orden_transporte','otro');
  if n <> 0 then raise exception 'FALLO 36 · el cliente ve documentos internos (%)', n; end if;
  begin
    insert into documentos (tipo, envio_id, storage_ruta, nombre_archivo)
      values ('albaran', current_setting('prueba.envio')::uuid, 'envios/falso.pdf', 'falso.pdf');
    raise exception 'FALLO 36 · el cliente ha subido un albaran por su cuenta';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli_b'), false);
set role authenticated;
do $$ begin
  if (select count(*) from documentos) <> 0 then raise exception 'FALLO 36 · FUGA: B ve documentos de A'; end if;
  raise notice 'OK 36 · documentos: cada cliente los suyos; seguros y ordenes internas no; maximo 5 por transportista';
end $$;
reset role;

-- ---- 37. Firmas del CMR: solo el servidor las escribe, y nadie las cambia ----------
do $$ declare f uuid; begin
  insert into firmas_cmr (envio_id, rol, nombre, documento, documento_validado,
                          firma_storage_ruta, ip)
    values (current_setting('prueba.envio')::uuid, 'remitente', 'Juan Garcia', '12345678Z', true,
            'firmas/f1.png', '10.0.0.7') returning id into f;
  begin
    update firmas_cmr set nombre = 'Otro' where id = f;
    raise exception 'FALLO 37 · se ha modificado una firma';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  if not exists (select 1 from envio_hitos where hito = 'cmr_firmado'
                 and envio_id = current_setting('prueba.envio')::uuid) then
    raise exception 'FALLO 37 · firmar no ha dejado el hito cmr_firmado';
  end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if (select count(*) from firmas_cmr) <> 1 then raise exception 'FALLO 37 · el cliente no ve la firma de su CMR'; end if;
  begin
    insert into firmas_cmr (envio_id, rol, nombre, documento, firma_storage_ruta)
      values (current_setting('prueba.envio')::uuid, 'destinatario', 'Falso', 'X', 'f.png');
    raise exception 'FALLO 37 · un cliente ha escrito una firma';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 37 · firmas del CMR: las escribe solo el servidor, no se pueden cambiar, el cliente ve las suyas';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- =====================================================================================
-- PERMISOS POR ROL (2026-11-03)
-- =====================================================================================
-- ---- 38. El cliente NO lee la tabla de envíos ni se pone el precio -------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from envios;
  if n <> 0 then raise exception 'FALLO 38 · el cliente lee la tabla envios (y con ella el margen)'; end if;
  select count(*) into n from mis_envios();
  if n < 2 then raise exception 'FALLO 38 · el cliente no ve sus envios con mis_envios() (%)', n; end if;
  begin
    insert into envios (cliente_id, metros_lineales, importe_cliente)
      values (cliente_del_usuario(), 13.30, 1);
    raise exception 'FALLO 38 · el cliente ha creado un envio poniendose el precio (1 EUR)';
  exception when insufficient_privilege then null; end;
  update envios set importe_cliente = 1 where cliente_id = cliente_del_usuario();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO 38 · el cliente ha cambiado el precio de su envio'; end if;
  raise notice 'OK 38 · el cliente lee sus envios por mis_envios(); no ve la tabla ni toca precios';
end $$;

-- ---- 39. El cliente cancela SU envío por la función; el de otro, no ----------------
do $$ declare r jsonb; begin
  r := cancelar_mi_envio(current_setting('prueba.envio')::uuid, 'Ya no hace falta');
  if r->>'resultado' <> 'cancelado' then raise exception 'FALLO 39 · cancelar mi envio: %', r; end if;
  begin
    perform cancelar_mi_envio((select id from envios limit 1));   -- no ve ninguno: null
    raise exception 'FALLO 39 · se ha podido cancelar un envio inexistente o ajeno';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare e uuid; r jsonb; begin
  select id into e from envios where cliente_id = (select id from clientes where cif = 'B44444444')
   and estado <> 'cancelado' limit 1;
  perform set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
  set local role authenticated;
  begin
    r := cancelar_mi_envio(e);
    raise exception 'FALLO 39 · A ha cancelado un envio de B';
  exception when insufficient_privilege then null; end;
  reset role;
  update envios set estado = 'programado' where id = current_setting('prueba.envio')::uuid;
  raise notice 'OK 39 · cada cliente cancela solo sus envios, y por la funcion (con su penalizacion)';
end $$;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 40. El transportista ve SU precio y nada del cliente ---------------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ declare r text; n int; begin
  r := pg_get_function_result('mis_viajes()'::regprocedure);
  if r ~ '\mimporte_cliente\M' or r ~ '\mmargen' or r ~ '\mcliente_id\M' then
    raise exception 'FALLO 40 · mis_viajes() ensena datos del cliente: %', r;
  end if;
  select count(*) into n from mis_viajes() where importe_transportista is not null;
  if n < 1 then raise exception 'FALLO 40 · el transportista no ve su precio'; end if;
  select count(*) into n from transportistas;
  if n <> 0 then raise exception 'FALLO 40 · el transportista lee la tabla de transportistas'; end if;
  r := pg_get_function_result('mi_empresa_transportista()'::regprocedure);
  if r ~ 'estado_operativo|valoracion|pronto_pago|anotaciones' then
    raise exception 'FALLO 40 · el transportista ve sus datos internos: %', r;
  end if;
  if (select count(*) from mi_empresa_transportista()) <> 1 then
    raise exception 'FALLO 40 · el transportista no ve su propia empresa';
  end if;
  raise notice 'OK 40 · el transportista ve su viaje y su precio; ni el precio del cliente ni sus datos internos';
end $$;
reset role;

-- El email de contabilidad del transportista no lo ve el transportista.
do $$ declare t uuid := current_setting('prueba.transp')::uuid; begin
  insert into contactos (transportista_id, funcion, email) values (t, 'trafico', 'trafico@t.prueba');
  insert into contactos (transportista_id, funcion, email) values (t, 'contabilidad', 'conta@t.prueba');
end $$;
set role authenticated;
do $$ begin
  if exists (select 1 from contactos where funcion = 'contabilidad') then
    raise exception 'FALLO 40 · el transportista ve su email de contabilidad';
  end if;
  if not exists (select 1 from contactos where funcion = 'trafico') then
    raise exception 'FALLO 40 · el transportista no ve su contacto de trafico';
  end if;
end $$;
reset role;

-- ---- 41. El cliente ve su empresa sin el factor; nadie se cambia el rol ------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare r text := pg_get_function_result('mi_empresa()'::regprocedure); begin
  if r ~ 'factor|riesgo|recargo|verificado|anotaciones' then
    raise exception 'FALLO 41 · el cliente ve datos internos de su ficha: %', r;
  end if;
  if (select count(*) from clientes) <> 0 then raise exception 'FALLO 41 · el cliente lee la tabla clientes'; end if;
  if (select count(*) from mi_empresa()) <> 1 then raise exception 'FALLO 41 · el cliente no ve su empresa'; end if;
  begin
    update usuarios set rol = 'admin' where id = auth.uid();
    raise exception 'FALLO 41 · un cliente se ha hecho ADMIN a si mismo';
  exception when insufficient_privilege then null; end;
  update usuarios set nombre = 'Juan Compras', idioma = 'ca' where id = auth.uid();  -- lo suyo, sí
  if (select count(*) from usuarios where id <> auth.uid()
        and coalesce(cliente_id, '00000000-0000-0000-0000-000000000000') <> cliente_del_usuario()) <> 0 then
    raise exception 'FALLO 41 · el cliente ve usuarios de otras empresas';
  end if;
end $$;
reset role;
-- Un EMPLEADO no puede conceder admin; un admin no se cambia su propio rol.
do $$ declare emp uuid; begin
  insert into auth.users (email) values ('empleado@dynamo.prueba') returning id into emp;
  update usuarios set rol = 'empleado', estado = 'activa' where id = emp;
  perform set_config('request.jwt.claim.sub', emp::text, false);
  set local role authenticated;
  begin
    update usuarios set rol = 'admin' where id = current_setting('prueba.u_cli')::uuid;
    raise exception 'FALLO 41 · un empleado ha concedido el rol de admin';
  exception when insufficient_privilege then null; end;
  reset role;
  -- Un segundo admin, para que no salte antes la otra protección (no dejar sin admins).
  insert into auth.users (email) values ('admin2@dynamo.prueba') returning id into emp;
  update usuarios set rol = 'admin', estado = 'activa' where id = emp;
  perform set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
  set local role authenticated;
  begin
    update usuarios set rol = 'empleado' where id = current_setting('prueba.u_admin')::uuid;
    raise exception 'FALLO 41 · un admin se ha cambiado su propio rol';
  exception when insufficient_privilege then null; end;
  reset role;
  raise notice 'OK 41 · el cliente ve su empresa sin el factor; nadie se cambia el rol; solo admin concede admin';
end $$;
select set_config('request.jwt.claim.sub', '', false);

-- =====================================================================================
-- EXPORTACIONES HOLDED Y WTRANSNET (2026-11-03)
-- =====================================================================================
-- ---- 42. Las cabeceras son EXACTAMENTE las de las plantillas del Sheet --------------
do $$ declare got text[]; exp text[]; v text; begin
  foreach v in array array['v_holded_pedido_venta','v_holded_pedido_compra','v_wtransnet'] loop
    select array_agg(column_name::text order by ordinal_position) into got
      from information_schema.columns where table_schema = 'public' and table_name = v;
    exp := case v
      when 'v_holded_pedido_venta' then array['ESTADO VIAJE','EN HOLDED?','FACTURADO?','ALB REC?',
        'PLAZO PAGO','Num Pedido (referencia_gx_carga)','Formato de numeración','Fecha dd/mm/yyyy',
        'Fecha de vencimiento dd/mm/yyyy','Descripción','Nombre del contacto','NIF','Dirección',
        'Población','Código postal','Provincia','País','Concepto','Descripción del producto','SKU',
        'Precio unidad','Unidades','Descuento %','IVA %','Retención %','Rec. de eq. %','Operación',
        'Forma de pago (ID)','Tags separados por -','Nombre canal de venta','Cuenta canal de venta',
        'Moneda','Cambio de moneda']
      when 'v_holded_pedido_compra' then array['ESTADO VIAJE','EN HOLDED?','FACTURADO?','ALB REC?',
        'PLAZO PAGO','Num Pedido (referencia_gx_carga)','Formato de numeración','Fecha dd/mm/yyyy',
        'Fecha de vencimiento dd/mm/yyyy','Descripción','Nombre del contacto','NIF','Dirección',
        'Población','Código postal','Provincia','País','Concepto','Descripción del producto','SKU',
        'Precio unidad','Unidades','Unidades recibidas','Descuento','IVA %','Retención %',
        'Rec. de eq. %','Operación','Forma de pago (ID)','Tags separados por -',
        'Nombre canal de venta','Cuenta canal de venta','Moneda','Cambio de moneda']
      else array['ESTADO VIAJE','CLIENTE','REF.','Referencia','Fecha disponibilidad','País origen',
        'CP origen','Localidad origen','País destino','CP destino','Localidad destino','Tipo Bolsa',
        'Tipo Vehiculo','Especialidad','Peso','Largo','Adr','Paletizado','Intercambio Palets',
        'Localizador GPS','Arriba','Lateral','Detrás','Sirve Frigorifico','Sirve Lateral Bajo',
        'Misma Especialidad','Comentarios Públicos','Precio','Activar Serv. Alerta'] end;
    if got is distinct from exp then
      raise exception 'FALLO 42 · % no tiene las columnas de la plantilla. Tiene: %', v, got;
    end if;
  end loop;
  raise notice 'OK 42 · Holded venta (33), compra (34) y Wtransnet (29): columnas y orden identicos a las plantillas';
end $$;

-- ---- 43. Venta y compra: el porte y las penalizaciones como líneas del mismo pedido -
do $$ declare e uuid := current_setting('prueba.envio')::uuid; gx text; n int; begin
  select referencia_gx into gx from envios where id = e;
  update envios set estado = 'entregado', fecha_carga_real = current_date where id = e;
  update penalizaciones set estado = 'confirmada' where envio_id = e and importe_cliente = 200;
  select count(*) into n from v_holded_pedido_venta where "Num Pedido (referencia_gx_carga)" = gx;
  if n <> 2 then raise exception 'FALLO 43 · el pedido de venta deberia tener 2 lineas (porte + penalizacion), tiene %', n; end if;
  if not exists (select 1 from v_holded_pedido_venta where "Num Pedido (referencia_gx_carga)" = gx
                 and "Concepto" = 'porte' and "Precio unidad" = 1000 and "Fecha dd/mm/yyyy" = to_char(current_date,'DD/MM/YYYY')) then
    raise exception 'FALLO 43 · la linea del porte no lleva el importe o la fecha dd/mm/yyyy';
  end if;
  select count(*) into n from v_holded_pedido_compra where "Num Pedido (referencia_gx_carga)" = gx
    and "Concepto" = 'porte' and "Precio unidad" = 800 and "Unidades recibidas" = 1;
  if n <> 1 then raise exception 'FALLO 43 · el pedido de compra no lleva el porte del transportista'; end if;
  if exists (select 1 from v_holded_pedido_venta v join envios x on x.referencia_gx = v."Num Pedido (referencia_gx_carga)"
             where x.operador_id is not null) then
    raise exception 'FALLO 43 · un envio MANUAL del cliente ha salido en los pedidos de Holded';
  end if;
  raise notice 'OK 43 · Holded: porte y penalizaciones confirmadas como lineas del mismo pedido; sin envios manuales';
end $$;

-- ---- 44. Wtransnet: solo lo programado sin transportista y quieto ------------------
do $$ declare e uuid; gx text; n int; begin
  insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista,
                      anotaciones_cliente, carga_superior)
    values ((select id from clientes where cif = 'B44444444'), 13.30, 24, 1100, 900,
            'Llamar a Pepe al 600111222, es para Mercadona', true) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso)
    values (e, 1, 'carga', '41001', 'Sevilla', 'ES'), (e, 2, 'descarga', '28001', 'Madrid', 'ES');
  update envios set estado = 'programado' where id = e;
  select referencia_gx into gx from envios where id = e;
  -- Recién tocado: todavía NO sale (espera de 3 minutos).
  if exists (select 1 from v_wtransnet where "REF." = gx) then
    raise exception 'FALLO 44 · un envio recien modificado ha salido ya en la bolsa';
  end if;
  update parametros set valor = '0' where clave = 'bolsa_espera_minutos';
  select count(*) into n from v_wtransnet where "REF." = gx and "Peso" = 24000 and "Arriba" = 'S'
     and "Tipo Bolsa" = 'Completa' and "Comentarios Públicos" = '' and "País destino" = 'ES';
  if n <> 1 then raise exception 'FALLO 44 · el envio no sale bien en el fichero de Wtransnet'; end if;
  if exists (select 1 from v_wtransnet where "REF." = (select referencia_gx from envios
             where id = current_setting('prueba.envio')::uuid)) then
    raise exception 'FALLO 44 · un envio ya entregado ha salido en la bolsa';
  end if;
  update parametros set valor = '3' where clave = 'bolsa_espera_minutos';
  raise notice 'OK 44 · Wtransnet: solo programados sin transportista y quietos 3 min; nunca las notas del cliente';
end $$;

-- ---- 45. Nadie que no sea Dynamo ve las exportaciones ------------------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if (select count(*) from v_holded_pedido_venta) + (select count(*) from v_holded_pedido_compra)
     + (select count(*) from v_wtransnet) <> 0 then
    raise exception 'FALLO 45 · un cliente ve las exportaciones de Holded o Wtransnet';
  end if;
  raise notice 'OK 45 · las exportaciones solo las ve Dynamo';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- =====================================================================================
-- FESTIVOS (2026-11-03)
-- =====================================================================================
-- ---- 46. El corte de cancelación salta los festivos --------------------------------
do $$ begin
  -- Carga miércoles 9-dic-2026: el martes 8 es la Inmaculada → corte el lunes 7, 9:00 Madrid.
  if corte_cancelacion('2026-12-09') <> '2026-12-07 08:00:00+00' then
    raise exception 'FALLO 46 · Inmaculada: %', corte_cancelacion('2026-12-09');
  end if;
  -- Carga lunes de Pascua 6-abr-2026: viernes 3 y jueves 2 son festivos → miércoles 1, 9:00 (UTC+2).
  if corte_cancelacion('2026-04-06') <> '2026-04-01 07:00:00+00' then
    raise exception 'FALLO 46 · Semana Santa: %', corte_cancelacion('2026-04-06');
  end if;
  -- Un festivo de comunidad solo cuenta si se pide esa comunidad.
  insert into festivos (fecha, region, nombre) values ('2026-03-02', 'ES-AN', 'Festivo de prueba');
  if corte_cancelacion('2026-03-03') <> '2026-03-02 08:00:00+00' then
    raise exception 'FALLO 46 · sin comunidad no deberia contar el festivo andaluz';
  end if;
  if corte_cancelacion('2026-03-03', 'ES', 'ES-AN') <> '2026-02-27 08:00:00+00' then
    raise exception 'FALLO 46 · en Andalucia deberia saltar al viernes 27: %',
      corte_cancelacion('2026-03-03', 'ES', 'ES-AN');
  end if;
  if (select count(*) from festivos_entre('2030-01-01', '2030-12-31')) <> 11 then
    raise exception 'FALLO 46 · faltan festivos nacionales de 2030';
  end if;
  raise notice 'OK 46 · el corte de cancelacion salta fines de semana y festivos (nacionales y de comunidad)';
end $$;

-- =====================================================================================
-- NOMBRES UNIFICADOS (2026-11-03)
-- =====================================================================================
-- ---- 47. No queda ningún nombre viejo: ni columnas, ni funciones, ni vistas --------
-- Renombrar una columna no cambia el texto de las funciones: una que se quedara con
-- el nombre viejo fallaría solo al usarse, en producción. Esto lo caza antes.
do $$ declare v text; begin
  select string_agg(table_name || '.' || column_name, ', ') into v
    from information_schema.columns
   where table_schema = 'public'
     and column_name in ('cp', 'cp_origen', 'cp_destino', 'notas', 'observaciones', 'localidad', 'pais', 'calle');
  if v is not null then raise exception 'FALLO 47 · columnas con nombre viejo: %', v; end if;

  select string_agg(p.proname, ', ') into v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~ '(\mcp_origen\M|\mcp_destino\M|\.cp\M|''cp''|\mobservaciones\M|\mlocalidad\M|\.pais\M|\mnotas\M)';
  if v is not null then raise exception 'FALLO 47 · funciones con nombres viejos: %', v; end if;

  select string_agg(c.relname, ', ') into v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and pg_get_viewdef(c.oid) ~ '(\mcp_origen\M|\mcp_destino\M|\.cp\M|''cp''|\mobservaciones\M|\mlocalidad\M|\.pais\M)';
  if v is not null then raise exception 'FALLO 47 · vistas con nombres viejos: %', v; end if;

  -- Y lo nuevo funciona de verdad: la ruta del envío se copia de las paradas.
  perform 1 from envios e
   where e.codigo_postal_origen is not null and e.codigo_postal_destino is not null limit 1;
  if not found then raise exception 'FALLO 47 · la ruta denormalizada no se rellena'; end if;
  raise notice 'OK 47 · nombres unificados (codigo_postal, anotaciones, poblacion, pais_codigo_iso) en tablas, funciones y vistas';
end $$;

-- =====================================================================================
-- CREAR ENVÍO (2026-11-03)
-- =====================================================================================
-- ---- 48. crear_envio(): de una vez, con paradas; solo Dynamo; todo o nada ----------
do $$ declare
  v_admin uuid := gen_random_uuid(); v_cli uuid; v_lugar uuid; r record; n int; v_cli_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_admin, 'admin48@dynamo.test'), (v_cli_user, 'cli48@cliente.test');
  update usuarios set rol = 'admin', estado = 'activa' where id = v_admin;
  insert into clientes (razon_social, cif) values ('Prueba 48 SL', 'B48484848') returning id into v_cli;
  insert into lugares (cliente_id, nombre_empresa, direccion, codigo_postal, poblacion, provincia)
    values (v_cli, 'Nave 48', 'C/ Uno 1', '41001', 'Sevilla', 'Sevilla') returning id into v_lugar;
  update usuarios set cliente_id = v_cli, estado = 'activa' where id = v_cli_user;

  -- Dynamo crea: una parada de la agenda (se copia) y otra suelta que se guarda en la agenda.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  select * into r from crear_envio(
    jsonb_build_object('cliente_id', v_cli, 'fecha_carga_desde', '2026-12-14', 'fecha_carga_hasta', '2026-12-16',
                       'metros_lineales', 13.3, 'toneladas', 24, 'importe_cliente', 1230, 'importe_transportista', 1050),
    jsonb_build_array(
      jsonb_build_object('tipo', 'carga', 'lugar_id', v_lugar, 'referencia', 'REF-1'),
      jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'Destino 48', 'direccion', 'Av. Dos 2',
                         'codigo_postal', '28001', 'poblacion', 'Madrid', 'guardar_en_agenda', true)));
  reset role;
  if r.referencia_gx !~ '^GX[0-9]{9}$' then raise exception 'FALLO 48 · referencia GX: %', r.referencia_gx; end if;
  if (select estado from envios where id = r.id) <> 'programado' then raise exception 'FALLO 48 · no queda programado'; end if;
  if (select codigo_postal_origen || '>' || codigo_postal_destino from envios where id = r.id) <> '41001>28001' then
    raise exception 'FALLO 48 · la ruta no se rellena';
  end if;
  if (select direccion from envio_paradas where envio_id = r.id and orden = 1) <> 'C/ Uno 1' then
    raise exception 'FALLO 48 · no copia la direccion del sitio';
  end if;
  if not exists (select 1 from lugares where cliente_id = v_cli and nombre_empresa = 'Destino 48') then
    raise exception 'FALLO 48 · el sitio nuevo no se guarda en la agenda del cliente';
  end if;
  if not (select precio_fijado_a_mano from envios where id = r.id) then raise exception 'FALLO 48 · precio a mano'; end if;

  -- Una ruta mal hecha (empieza por entrega) no deja NADA a medias.
  select count(*) into n from envios where cliente_id = v_cli;
  begin
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    set local role authenticated;
    perform crear_envio(jsonb_build_object('cliente_id', v_cli),
      jsonb_build_array(jsonb_build_object('tipo', 'descarga', 'poblacion', 'A'),
                        jsonb_build_object('tipo', 'carga', 'poblacion', 'B')));
    raise exception 'FALLO 48 · deja crear una ruta que empieza por entrega';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;
  if (select count(*) from envios where cliente_id = v_cli) <> n then raise exception 'FALLO 48 · queda un envio a medias'; end if;

  -- Un cliente no puede (etapa A).
  begin
    perform set_config('request.jwt.claim.sub', v_cli_user::text, true);
    set local role authenticated;
    perform crear_envio(jsonb_build_object('cliente_id', v_cli),
      jsonb_build_array(jsonb_build_object('tipo', 'carga', 'poblacion', 'A'),
                        jsonb_build_object('tipo', 'descarga', 'poblacion', 'B')));
    raise exception 'FALLO 48 · un cliente crea envios';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;
  raise notice 'OK 48 · crear_envio: de una vez con sus paradas (agenda o sueltas), todo o nada, solo Dynamo';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 49. Plazo de pago de los clientes: 120 por defecto, y admitido -----------------
do $$ declare v_id uuid; begin
  insert into clientes (razon_social, cif) values ('Prueba 49 SL', 'B49494949') returning id into v_id;
  if (select plazo_pago_dias from clientes where id = v_id) <> 120 then
    raise exception 'FALLO 49 · el plazo por defecto no es 120 dias';
  end if;
  begin
    update clientes set plazo_pago_dias = 45 where id = v_id;
    raise exception 'FALLO 49 · admite un plazo de 45 dias';
  exception when check_violation then null;
  end;
  raise notice 'OK 49 · clientes: plazo de pago 120 dias por defecto (0/30/60/90/120 admitidos)';
end $$;

-- ---- 50. Descuento de bienvenida: −7 % los primeros 3 envíos, luego 0 %; a mano manda
do $$ declare
  v_admin uuid := gen_random_uuid(); v_a uuid; v_b uuid; i int;
  p jsonb := jsonb_build_array(
    jsonb_build_object('tipo', 'carga', 'codigo_postal', '41001', 'poblacion', 'Sevilla'),
    jsonb_build_object('tipo', 'descarga', 'codigo_postal', '28001', 'poblacion', 'Madrid'));
begin
  insert into auth.users (id, email) values (v_admin, 'admin50@dynamo.test');
  update usuarios set rol = 'admin', estado = 'activa' where id = v_admin;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;

  insert into clientes (razon_social, cif) values ('Cliente A 50', 'B50000001') returning id into v_a;
  insert into clientes (razon_social, cif) values ('Cliente B 50', 'B50000002') returning id into v_b;
  if (select factor_tarifa_porcentaje from clientes where id = v_a) <> -7 then
    raise exception 'FALLO 50 · un cliente nuevo no empieza con −7 %%';
  end if;

  -- B: Dynamo le pone +10 % a mano.
  update clientes set factor_tarifa_porcentaje = 10 where id = v_b;
  if not (select factor_fijado_a_mano from clientes where id = v_b) then
    raise exception 'FALLO 50 · cambiar el factor no lo marca como fijado a mano';
  end if;

  for i in 1..3 loop
    perform crear_envio(jsonb_build_object('cliente_id', v_a, 'importe_cliente', 500), p);
    perform crear_envio(jsonb_build_object('cliente_id', v_b, 'importe_cliente', 500), p);
    if i < 3 and (select factor_tarifa_porcentaje from clientes where id = v_a) <> -7 then
      raise exception 'FALLO 50 · el descuento se quita antes de tiempo (envio %)', i;
    end if;
  end loop;
  if (select factor_tarifa_porcentaje from clientes where id = v_a) <> 0 then
    raise exception 'FALLO 50 · tras 3 envios el factor no pasa a 0 %%';
  end if;
  if (select factor_tarifa_porcentaje from clientes where id = v_b) <> 10 then
    raise exception 'FALLO 50 · la regla automatica ha tocado un factor fijado a mano';
  end if;

  -- B vuelve al automatico: como ya lleva 3 envios, le toca 0 %.
  update clientes set factor_fijado_a_mano = false where id = v_b;
  if (select factor_tarifa_porcentaje from clientes where id = v_b) <> 0 then
    raise exception 'FALLO 50 · al volver al automatico no se recalcula';
  end if;
  reset role;
  raise notice 'OK 50 · bienvenida: −7 %% los 3 primeros envios y luego 0 %% solo; lo fijado a mano no se toca';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- =====================================================================================
-- FESTIVOS QUE SE REPITEN SOLOS (2026-11-03)
-- =====================================================================================
-- ---- 51. Los nacionales valen todos los años, sin listarlos uno a uno ---------------
do $$ begin
  if (select count(*) from festivos where region is null and pais_codigo_iso = 'ES') <> 11 then
    raise exception 'FALLO 51 · deberian quedar 11 filas de nacionales, hay %',
      (select count(*) from festivos where region is null and pais_codigo_iso = 'ES');
  end if;
  -- Muy lejos en el tiempo: 1 de noviembre de 2047 (viernes) y Viernes Santo de 2040 (30-mar).
  if es_dia_habil('2047-11-01') then raise exception 'FALLO 51 · 1-nov-2047 no es festivo'; end if;
  if es_dia_habil('2040-03-30') then raise exception 'FALLO 51 · Viernes Santo 2040 no cae'; end if;
  if not es_dia_habil('2040-03-26') then raise exception 'FALLO 51 · el lunes 26-mar-2040 si es habil'; end if;
  if (select count(*) from festivos_entre('2051-01-01', '2051-12-31')) <> 11 then
    raise exception 'FALLO 51 · en 2051 tiene que haber 11 nacionales: %',
      (select count(*) from festivos_entre('2051-01-01', '2051-12-31'));
  end if;
  -- Un festivo de un solo año no se repite.
  insert into festivos (fecha, region, nombre) values ('2027-02-28', 'ES-AN', 'Andalucía 2027');
  if (select count(*) from festivos_entre('2028-02-28', '2028-02-28', 'ES', 'ES-AN')) <> 0 then
    raise exception 'FALLO 51 · un festivo de un solo anio se ha repetido';
  end if;
  -- Uno que se repite con fin: vale hasta vigente_hasta y luego no.
  insert into festivos (fecha, region, nombre, repetir, vigente_hasta)
       values ('2026-09-08', 'ES-AS', 'Prueba con fin', 'cada_anio', '2029-12-31');
  if es_dia_habil('2028-09-08', 'ES', 'ES-AS') then raise exception 'FALLO 51 · 2028 deberia ser festivo'; end if;
  if not es_dia_habil('2031-09-08', 'ES', 'ES-AS') then raise exception 'FALLO 51 · 2031 ya no deberia serlo'; end if;
  -- Un Pascua mal escrito (fecha que no casa con los días desde Pascua) se rechaza.
  begin
    insert into festivos (fecha, nombre, repetir, dias_desde_pascua) values ('2026-04-10', 'Mal', 'pascua', 1);
    raise exception 'FALLO 51 · se acepto un festivo de Pascua incoherente';
  exception when check_violation then null;
  end;
  raise notice 'OK 51 · los festivos se repiten solos (cada anio y por Pascua) y los puntuales no';
end $$;

-- =====================================================================================
-- SITIO PRINCIPAL (la estrella de Sitios, 2026-11-03)
-- =====================================================================================
-- ---- 52. Cada cliente marca SU sitio principal; nadie marca el de otro ----------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare l uuid; c uuid := cliente_del_usuario(); begin
  insert into lugares (nombre_empresa, codigo_postal) values ('Nave principal A', '41001') returning id into l;
  perform set_config('prueba.lugar_prin_a', l::text, false);
  perform marcar_sitio_principal(c, l);
  if sitio_principal(c) is distinct from l then raise exception 'FALLO 52 · el cliente no ha podido marcar su estrella'; end if;
  -- El sitio de otro cliente no vale como principal.
  begin
    perform marcar_sitio_principal(c, current_setting('prueba.lugar_b')::uuid);
    raise exception 'FALLO 52 · se ha marcado como principal el sitio de OTRO cliente';
  exception when check_violation then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli_b'), false);
set role authenticated;
do $$ declare a uuid := (select cliente_id from lugares where id = current_setting('prueba.lugar_prin_a')::uuid); begin
  -- B no puede tocar ni leer la estrella de A.
  begin
    perform marcar_sitio_principal(current_setting('prueba.cliente')::uuid, null);
    raise exception 'FALLO 52 · B ha quitado la estrella de A';
  exception when insufficient_privilege then null;
  end;
  if sitio_principal(current_setting('prueba.cliente')::uuid) is not null then
    raise exception 'FALLO 52 · FUGA: B lee el sitio principal de A';
  end if;
end $$;
reset role;
-- Si A borra su sitio principal, la estrella se quita sola.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare l uuid := current_setting('prueba.lugar_prin_a')::uuid; begin
  update lugares set borrado = true where id = l;     -- como la app: la hora la pone la BD
  if (select borrado_en from lugares where id = l) is null then
    raise exception 'FALLO 52 · el borrado no ha quedado con su hora';
  end if;
  if sitio_principal(cliente_del_usuario()) is not null then
    raise exception 'FALLO 52 · la estrella sigue en un sitio borrado';
  end if;
  raise notice 'OK 52 · sitio principal: cada cliente el suyo, nunca el de otro, y se quita al borrar el sitio';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- =====================================================================================
-- USUARIOS EN EL PANEL (2026-11-03)
-- =====================================================================================
-- ---- 53. Un email de cliente o transportista nunca pasa a interno -------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare c uuid := current_setting('prueba.u_cli')::uuid; begin
  begin
    update usuarios set rol = 'empleado', cliente_id = null where id = c;
    raise exception 'FALLO 53 · un cliente ha pasado a empleado';
  exception when insufficient_privilege then null;
  end;
  begin
    update usuarios set rol = 'admin', transportista_id = null where id = current_setting('prueba.u_transp')::uuid;
    raise exception 'FALLO 53 · un transportista ha pasado a admin';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from conexiones_usuarios()) = 0 then
    raise exception 'FALLO 53 · Dynamo no ve las conexiones de los usuarios';
  end if;
end $$;
reset role;
-- Ni siquiera con la llave del servidor.
do $$ begin
  begin
    update usuarios set rol = 'empleado', cliente_id = null where id = current_setting('prueba.u_cli')::uuid;
    raise exception 'FALLO 53 · el servidor ha pasado un cliente a empleado';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if (select count(*) from conexiones_usuarios()) <> 0 then
    raise exception 'FALLO 53 · FUGA: un cliente ve las conexiones de los usuarios';
  end if;
  raise notice 'OK 53 · usuarios: cliente/transportista nunca pasan a interno; las conexiones solo las ve Dynamo';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 54. Tipos de lugar nuevos (2026-11-03): sin "evento" ni "zona urbana" -----------
do $$ begin
  if enum_range(null::tipo_lugar)::text <> '{almacen_nave,obra_zona_amplia,obra_zona_urbana,finca}' then
    raise exception 'FALLO 54 · tipos de lugar: %', enum_range(null::tipo_lugar);
  end if;
  if (select count(*) from recargos_tipo_lugar) <> 4
     or (select porcentaje from recargos_tipo_lugar where tipo = 'obra_zona_urbana') <> 20 then
    raise exception 'FALLO 54 · los recargos no se han pasado bien';
  end if;
  raise notice 'OK 54 · tipos de lugar: almacen/nave/campa, obra en zona amplia, obra en zona urbana y finca';
end $$;

-- ---- 55. Emails de avisos del sitio: lista propia, validada y con tope ---------------
do $$ declare l uuid := current_setting('prueba.lugar_b')::uuid; begin
  update lugares set emails_avisos = '{almacen@nave.es,recepcion@nave.es}' where id = l;
  begin
    update lugares set emails_avisos = '{esto-no-es-un-email}' where id = l;
    raise exception 'FALLO 55 · se ha guardado un email de avisos no valido';
  exception when check_violation then null;
  end;
  begin
    update lugares set emails_avisos = array(select 'a' || g || '@x.es' from generate_series(1, 11) g) where id = l;
    raise exception 'FALLO 55 · se han guardado mas de 10 emails de avisos';
  exception when check_violation then null;
  end;
  raise notice 'OK 55 · emails de avisos del sitio: lista propia, validados y como mucho 10';
end $$;

-- =====================================================================================
-- HORARIOS DE LOS SITIOS EN TABLA (2026-11-03)
-- =====================================================================================
-- ---- 56. Horario por defecto, resumen automático, tramos sin solapes y permisos ------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare l uuid; begin
  insert into lugares (nombre_empresa, codigo_postal) values ('Nave con horario', '41001') returning id into l;
  perform set_config('prueba.lugar_horario', l::text, false);
  if (select count(*) from lugar_horarios where lugar_id = l) <> 9 then
    raise exception 'FALLO 56 · el sitio no ha nacido con el horario por defecto';
  end if;
  if (select horarios from lugares where id = l) <> 'L-J 8:00-14:00 y 15:00-17:30 · V 8:00-14:00' then
    raise exception 'FALLO 56 · resumen: %', (select horarios from lugares where id = l);
  end if;
  -- El cliente cambia su horario: el viernes también por la tarde, y abre el sábado.
  delete from lugar_horarios where lugar_id = l and dia_semana = 5;
  insert into lugar_horarios (lugar_id, dia_semana, abre, cierra) values
    (l, 5, '08:00', '14:00'), (l, 5, '15:00', '17:30'), (l, 6, '09:00', '13:00');
  if (select horarios from lugares where id = l) <> 'L-V 8:00-14:00 y 15:00-17:30 · S 9:00-13:00' then
    raise exception 'FALLO 56 · resumen tras cambiar: %', (select horarios from lugares where id = l);
  end if;
  begin
    insert into lugar_horarios (lugar_id, dia_semana, abre, cierra) values (l, 1, '13:00', '16:00');
    raise exception 'FALLO 56 · se han aceptado dos tramos que se pisan';
  exception when exclusion_violation then null;
  end;
  begin
    insert into lugar_horarios (lugar_id, dia_semana, abre, cierra) values (l, 7, '18:00', '09:00');
    raise exception 'FALLO 56 · se ha aceptado un tramo que cierra antes de abrir';
  exception when check_violation then null;
  end;
  -- Guardar de una vez: sustituye todo; vacío no vale; con un tramo malo no cambia nada.
  perform guardar_horario(l, '[{"dia":1,"abre":"07:00","cierra":"15:00"},{"dia":2,"abre":"07:00","cierra":"15:00"}]');
  if (select horarios from lugares where id = l) <> 'L-M 7:00-15:00' then
    raise exception 'FALLO 56 · guardar_horario: %', (select horarios from lugares where id = l);
  end if;
  begin
    perform guardar_horario(l, '[]');
    raise exception 'FALLO 56 · se ha guardado un horario vacio';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;   -- que el propio fallo no se lo trague
  end;
  begin
    perform guardar_horario(l, '[{"dia":3,"abre":"10:00","cierra":"09:00"}]');
  exception when check_violation then null;
  end;
  if (select horarios from lugares where id = l) <> 'L-M 7:00-15:00' then
    raise exception 'FALLO 56 · un horario malo ha dejado el sitio a medias';
  end if;
  -- El resumen no se escribe a mano.
  update lugares set horarios = 'Siempre abierto' where id = l;
  if (select horarios from lugares where id = l) = 'Siempre abierto' then
    raise exception 'FALLO 56 · el resumen del horario se ha podido escribir a mano';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli_b'), false);
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from lugar_horarios where lugar_id = current_setting('prueba.lugar_horario')::uuid;
  if n <> 0 then raise exception 'FALLO 56 · FUGA: B ve el horario del sitio de A'; end if;
  delete from lugar_horarios where lugar_id = current_setting('prueba.lugar_horario')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO 56 · B ha borrado el horario del sitio de A'; end if;
  raise notice 'OK 56 · horarios en tabla: por defecto L-J 8-14 y 15-17:30 · V 8-14, resumen automatico, sin solapes, cada cliente el suyo';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 57. Precios de los almacenes Dynamo: por defecto en parámetros, propios opcionales
do $$ declare a uuid; begin
  insert into lugares (nombre_empresa, es_almacen_dynamo, codigo_postal, precio_almacenamiento_semana)
    values ('Almacen Dynamo Madrid', true, '28906', 260) returning id into a;
  if (select valor::text from parametros where clave = 'almacen_precio_semana') <> '240'
     or (select valor::text from parametros where clave = 'almacen_precio_reparto') <> '220' then
    raise exception 'FALLO 57 · faltan los precios por defecto de los almacenes';
  end if;
  begin
    update lugares set precio_reparto = 100 where id = current_setting('prueba.lugar_b')::uuid;
    raise exception 'FALLO 57 · un sitio de cliente ha guardado precio de almacen';
  exception when check_violation then null;
  end;
  if (select count(*) from lugar_horarios where lugar_id = a) <> 9 then
    raise exception 'FALLO 57 · el almacen no ha nacido con el horario por defecto';
  end if;
  raise notice 'OK 57 · almacenes Dynamo: precio propio opcional, por defecto en parametros, solo en almacenes';
end $$;

-- =====================================================================================
-- FICHA DEL ENVÍO (2026-11-03)
-- =====================================================================================
-- ---- 58. Cancelar con motivo y deshacer: vuelve al estado de antes; solo Dynamo -------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare e uuid; r jsonb; v text; begin
  select (crear_envio(
    jsonb_build_object('cliente_id', current_setting('prueba.cliente'), 'metros_lineales', 13.3,
                       'fecha_carga_desde', current_date + 20, 'importe_cliente', 900),
    jsonb_build_array(
      jsonb_build_object('tipo', 'carga',    'nombre_empresa', 'Origen 58', 'codigo_postal', '41001', 'poblacion', 'Sevilla'),
      jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'Destino 58', 'codigo_postal', '28001', 'poblacion', 'Madrid'))
  )).id into e;
  update envios set estado = 'hacia_la_carga' where id = e;
  r := cancelar_envio(e, 'El cliente ya no tiene la mercancía');
  if (select estado from envios where id = e) <> 'cancelado' then raise exception 'FALLO 58 · no se ha cancelado'; end if;
  if not exists (select 1 from envio_hitos where envio_id = e and hito = 'incidencia'
                 and datos ->> 'motivo_cancelacion' = 'El cliente ya no tiene la mercancía') then
    raise exception 'FALLO 58 · el motivo no ha quedado en el historial';
  end if;
  if (r ->> 'penalizacion')::boolean then raise exception 'FALLO 58 · penalizacion sin camion asignado'; end if;
  v := deshacer_cancelacion(e);
  if v <> 'hacia_la_carga' or (select estado from envios where id = e) <> 'hacia_la_carga' then
    raise exception 'FALLO 58 · no ha vuelto al estado de antes: %', v;
  end if;
  perform set_config('prueba.envio58', e::text, false);
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin
    perform cancelar_envio(current_setting('prueba.envio58')::uuid, 'yo');
    raise exception 'FALLO 58 · un cliente ha usado la cancelacion de Dynamo';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 58 · ficha del envio: cancelar con motivo y deshacer al estado de antes, solo Dynamo';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- =====================================================================================
-- PÁGINA PÚBLICA "ACEPTAR CARGA" (2026-11-03)
-- =====================================================================================
-- ---- 59. Ver, reservar y aceptar SIN sesión, por la puerta estrecha ------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare e uuid; t uuid; o uuid; tok uuid; begin
  select (crear_envio(
    jsonb_build_object('cliente_id', current_setting('prueba.cliente'), 'metros_lineales', 13.3,
                       'fecha_carga_desde', current_date + 20, 'importe_cliente', 1000, 'importe_transportista', 800),
    jsonb_build_array(
      jsonb_build_object('tipo', 'carga',    'nombre_empresa', 'Almacen Secreto SL', 'direccion', 'C/ Escondida 1', 'codigo_postal', '41001', 'poblacion', 'Sevilla'),
      jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'Cliente Final SA',   'direccion', 'C/ Destino 2',   'codigo_postal', '28001', 'poblacion', 'Madrid'))
  )).id into e;
  insert into transportistas (razon_social, cif, nima) values ('Trans Bolsa 59 SL', 'B59000059', 'NIMA-59') returning id into t;
  o := ofertar_envio(e, null, 'bolsa_wtransnet', 800, 10::smallint, true);
  select token into tok from envio_ofertas where id = o;
  perform set_config('prueba.e59', e::text, false);
  perform set_config('prueba.tok59', tok::text, false);
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ declare v jsonb; r jsonb; a jsonb; c jsonb; tok uuid := current_setting('prueba.tok59')::uuid; begin
  v := oferta_publica(tok);
  if not (v ->> 'disponible')::boolean then raise exception 'FALLO 59 · la oferta no sale disponible: %', v; end if;
  if v::text ~ 'Secreto|Escondida|Cliente Final|Destino 2' then
    raise exception 'FALLO 59 · FUGA: la oferta publica ensena empresa o calle: %', v;
  end if;
  if (v ->> 'banda_euros')::numeric <> 80 then raise exception 'FALLO 59 · banda: %', v ->> 'banda_euros'; end if;
  r := reservar_envio(tok, null, 'prueba');
  if r ->> 'resultado' <> 'reservada' then raise exception 'FALLO 59 · no reserva: %', r; end if;
  -- Otro que abre a la vez: en trámite.
  if reservar_envio(tok, null, 'otro') ->> 'resultado' <> 'en_tramite' then raise exception 'FALLO 59 · doble reserva'; end if;
  -- Antes de aceptar no se ven los datos completos.
  if carga_aceptada_publica((r ->> 'reserva_id')::uuid) ->> 'resultado' <> 'viva' then
    raise exception 'FALLO 59 · se ven los datos antes de aceptar';
  end if;
  if aceptar_oferta_publica((r ->> 'reserva_id')::uuid, 'X00000000') ->> 'resultado' <> 'transportista_no_encontrado' then
    raise exception 'FALLO 59 · se ha aceptado con un CIF que no existe';
  end if;
  a := aceptar_oferta_publica((r ->> 'reserva_id')::uuid, 'b-59000059', null, true, '1234 abc', 'r-5678-bcd', 'Pepe', '+34 600 111 222');
  if a ->> 'resultado' <> 'aceptada' then raise exception 'FALLO 59 · no acepta: %', a; end if;
  c := carga_aceptada_publica((r ->> 'reserva_id')::uuid);
  if c ->> 'resultado' <> 'aceptada' or c::text !~ 'C/ Escondida 1' or not (c ->> 'pronto_pago')::boolean
     or c ->> 'matricula_camion' <> '1234ABC' then
    raise exception 'FALLO 59 · datos de la carga aceptada: %', c;
  end if;
  if (oferta_publica(tok) ->> 'disponible')::boolean then raise exception 'FALLO 59 · sigue disponible tras aceptarla'; end if;
  -- Lo que NO puede hacer la clave pública: aceptar sin pasar por la puerta, ni leer tablas.
  begin
    perform aceptar_reserva((r ->> 'reserva_id')::uuid, gen_random_uuid());
    raise exception 'FALLO 59 · anon llama a aceptar_reserva directamente';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from envios) <> 0 or (select count(*) from envio_paradas) <> 0
     or (select count(*) from envio_reservas) <> 0 then
    raise exception 'FALLO 59 · FUGA: anon lee envios, paradas o reservas';
  end if;
  raise notice 'OK 59 · aceptar carga sin sesion: oferta sin datos sensibles, reserva unica, CIF real, datos completos solo tras aceptar';
end $$;
reset role;

-- =====================================================================================
-- ---- 60. Almacenamientos, incidencias y penalizaciones desde el panel de Dynamo ------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare alm uuid; a uuid; i uuid; p uuid; e uuid; r record; begin
  if (select count(*) from tipos_incidencia where clave in ('albaran','siniestro','transportista_conductor','otros')) <> 4 then
    raise exception 'FALLO 60 · faltan los tipos de incidencia del panel';
  end if;
  e := current_setting('prueba.e59')::uuid;
  -- Almacén Dynamo y un almacenamiento para el cliente de prueba.
  insert into lugares (nombre_empresa, es_almacen_dynamo, direccion, codigo_postal, poblacion, provincia)
    values ('Dynamo · Sevilla 60', true, 'C/ Almacen 60', '41016', 'Sevilla', 'Sevilla') returning id into alm;
  insert into almacenamientos (cliente_id, almacen_id, fecha_entrada, fecha_salida, num_trailers, importe_almacenaje)
    values (current_setting('prueba.cliente')::uuid, alm, current_date + 1, current_date + 5, 2, 480) returning id into a;
  select * into r from almacenamientos where id = a;
  if r.codigo !~ '^AX[0-9]{6}$' or r.importe_total <> 480 or r.estado <> 'pendiente_confirmar' then
    raise exception 'FALLO 60 · almacenamiento: % % %', r.codigo, r.importe_total, r.estado;
  end if;
  update almacenamientos set estado = 'confirmado' where id = a;
  -- Incidencia de siniestro sobre un envío: saca el cliente del envío y deja hito.
  insert into incidencias (tipo_id, envio_id, titulo, detalle)
    values ((select id from tipos_incidencia where clave = 'siniestro'), e, 'Palet roto', 'Llega un palet roto')
    returning id into i;
  if (select cliente_id from incidencias where id = i) is distinct from (select cliente_id from envios where id = e) then
    raise exception 'FALLO 60 · la incidencia no hereda el cliente del envío';
  end if;
  if not exists (select 1 from envio_hitos where envio_id = e and hito = 'incidencia') then
    raise exception 'FALLO 60 · la incidencia no deja hito en el envío';
  end if;
  update incidencias set estado = 'resuelto', resolucion = 'Abonado al cliente' where id = i;
  if (select resuelto_en from incidencias where id = i) is null then raise exception 'FALLO 60 · resuelto_en vacío'; end if;
  -- Penalización a mano y su confirmación.
  insert into penalizaciones (envio_id, tipo_id, descripcion, importe_cliente, importe_transportista)
    values (e, (select id from tipos_penalizacion where clave = 'paralizacion'), 'Espera 3 h en descarga', 120, 80) returning id into p;
  update penalizaciones set estado = 'confirmada' where id = p;
  perform set_config('prueba.alm60', a::text, false);
  perform set_config('prueba.pen60', p::text, false);
end $$;
reset role;
-- Un CLIENTE no crea penalizaciones ni ve el importe del transportista.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin
    insert into penalizaciones (envio_id, tipo_id, importe_cliente)
      values (current_setting('prueba.e59')::uuid, (select id from tipos_penalizacion limit 1), 1);
    raise exception 'FALLO 60 · un cliente crea penalizaciones';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from penalizaciones) then raise exception 'FALLO 60 · un cliente lee la tabla de penalizaciones'; end if;
  raise notice 'OK 60 · almacenamientos, incidencias y penalizaciones: Dynamo las gestiona; el cliente no crea penalizaciones ni lee sus importes';
end $$;
reset role;

-- =====================================================================================
-- ---- 61. Línea de pronto pago: lo anticipado consume la línea; agotada, no se ofrece --
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare st jsonb; e uuid; o uuid; begin
  if pronto_pago_descuento(800) <> 24 or pronto_pago_descuento(100) <> 20 then
    raise exception 'FALLO 61 · descuento de pronto pago: % %', pronto_pago_descuento(800), pronto_pago_descuento(100);
  end if;
  st := pronto_pago_estado();
  -- La carga aceptada con pronto pago de la prueba 59 (800 EUR) ya consume 776 EUR.
  if (st ->> 'usado')::numeric <> 776 or jsonb_array_length(st -> 'anticipos') <> 1 or not (st ->> 'activo')::boolean then
    raise exception 'FALLO 61 · estado de la linea: %', st;
  end if;
  update parametros set valor = '500' where clave = 'pronto_pago_linea_euros';
  if (pronto_pago_estado() ->> 'activo')::boolean then raise exception 'FALLO 61 · linea agotada y sigue activa'; end if;
  select (crear_envio(
    jsonb_build_object('cliente_id', current_setting('prueba.cliente'), 'metros_lineales', 13.3,
                       'fecha_carga_desde', current_date + 25, 'importe_cliente', 1000, 'importe_transportista', 800),
    jsonb_build_array(
      jsonb_build_object('tipo', 'carga',    'nombre_empresa', 'A', 'direccion', 'C/ 1', 'codigo_postal', '41001', 'poblacion', 'Sevilla'),
      jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'B', 'direccion', 'C/ 2', 'codigo_postal', '28001', 'poblacion', 'Madrid'))
  )).id into e;
  o := ofertar_envio(e, null, 'bolsa_wtransnet', 800, 10::smallint, true);
  if (select pronto_pago from envio_ofertas where id = o) then raise exception 'FALLO 61 · oferta con pronto pago y la linea agotada'; end if;
  update parametros set valor = '50000' where clave = 'pronto_pago_linea_euros';
  update parametros set valor = 'false' where clave = 'pronto_pago_encendido';
  o := ofertar_envio(e, null, 'bolsa_teleroute', 800, 10::smallint, true);
  if (select pronto_pago from envio_ofertas where id = o) then raise exception 'FALLO 61 · oferta con pronto pago y la linea apagada'; end if;
  update parametros set valor = 'true' where clave = 'pronto_pago_encendido';
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if jsonb_array_length(pronto_pago_estado() -> 'anticipos') <> 0 then raise exception 'FALLO 61 · un cliente ve los anticipos'; end if;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform pronto_pago_estado(); raise exception 'FALLO 61 · anon lee la linea de pronto pago';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 61 · linea de pronto pago: lo anticipado (60 dias) la consume; agotada o apagada, las ofertas salen sin pronto pago';
end $$;
reset role;

-- =====================================================================================
-- ---- 62. Altas pendientes: solo Dynamo ve lo que escribió quien se registra -----------
do $$ declare n uuid; begin
  insert into auth.users (email, raw_user_meta_data)
    values ('alta62@empresa.prueba', '{"nombre": "Ana Alta", "empresa": "Alta 62 SL", "cif": "B62000062"}') returning id into n;
  perform set_config('prueba.u_alta', n::text, false);
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare r record; begin
  select * into r from altas_pendientes() where email = 'alta62@empresa.prueba';
  if r.id is null or r.datos ->> 'cif' <> 'B62000062' or r.nombre <> 'Ana Alta' then raise exception 'FALLO 62 · Dynamo no ve el alta: %', r; end if;
  -- Confirmarla: se le asocia la empresa y pasa a activa en el mismo paso.
  update usuarios set cliente_id = current_setting('prueba.cliente')::uuid, estado = 'activa' where id = r.id;
  if exists (select 1 from altas_pendientes() where email = 'alta62@empresa.prueba') then raise exception 'FALLO 62 · sigue pendiente tras confirmarla'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin perform * from altas_pendientes(); raise exception 'FALLO 62 · un cliente ve las altas pendientes';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 62 · altas pendientes: solo Dynamo ve los datos del registro; confirmar = empresa + activa';
end $$;
reset role;

-- =====================================================================================
-- ---- 63. Modo mantenimiento: lo enciende Dynamo y lo puede consultar cualquiera --------
set role anon;
do $$ begin
  if mantenimiento_activo() then raise exception 'FALLO 63 · arranca en mantenimiento'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare n int; begin
  update parametros set valor = 'true' where clave = 'mantenimiento_activo';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO 63 · un cliente enciende el mantenimiento'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
update parametros set valor = 'true' where clave = 'mantenimiento_activo';
reset role;
set role anon;
do $$ begin
  if not mantenimiento_activo() then raise exception 'FALLO 63 · anon no ve el mantenimiento encendido'; end if;
end $$;
reset role;
update parametros set valor = 'false' where clave = 'mantenimiento_activo';
do $$ begin raise notice 'OK 63 · mantenimiento: solo Dynamo lo enciende; cualquiera (también sin sesión) sabe si está encendido'; end $$;

-- =====================================================================================
-- ---- 64. Almacén de archivos: un fichero se descarga solo si su fila es visible ------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare d uuid; begin
  if (select public from storage.buckets where id = 'documentos') then raise exception 'FALLO 64 · el bucket es publico'; end if;
  insert into storage.objects (bucket_id, name) values ('documentos', 'envios/e64/albaran.pdf');
  insert into documentos (tipo, envio_id, storage_ruta, nombre_archivo, visible_cliente)
    values ('albaran', current_setting('prueba.e59')::uuid, 'envios/e64/albaran.pdf', 'albaran.pdf', false) returning id into d;
  insert into storage.objects (bucket_id, name) values ('documentos', 'transportistas/t64/seguro.pdf');
  -- (el transportista de prueba ya tiene sus 5 documentos: se le quita uno para este)
  update documentos set borrado = true, borrado_en = now()
   where id = (select id from documentos where transportista_id = current_setting('prueba.transp')::uuid and tipo = 'otro' and not borrado limit 1);
  insert into documentos (tipo, transportista_id, storage_ruta, nombre_archivo)
    values ('seguro_cmr', current_setting('prueba.transp')::uuid, 'transportistas/t64/seguro.pdf', 'seguro.pdf');
  perform set_config('prueba.doc64', d::text, false);
end $$;
reset role;
-- El cliente del envío: no ve el albarán hasta que Dynamo lo marca visible; el seguro del
-- transportista, nunca; y no puede subir fuera de su carpeta.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if exists (select 1 from storage.objects where name = 'envios/e64/albaran.pdf') then raise exception 'FALLO 64 · el cliente ve un albaran no visible'; end if;
  if exists (select 1 from storage.objects where name = 'transportistas/t64/seguro.pdf') then raise exception 'FALLO 64 · el cliente ve el seguro del transportista'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('documentos', 'envios/e64/falso.pdf');
    raise exception 'FALLO 64 · el cliente sube fuera de su carpeta';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
update documentos set visible_cliente = true where id = current_setting('prueba.doc64')::uuid;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if not exists (select 1 from storage.objects where name = 'envios/e64/albaran.pdf') then raise exception 'FALLO 64 · el cliente no ve el albaran ya visible'; end if;
end $$;
reset role;
-- El transportista ve el seguro de su ficha; sin sesión no se ve nada.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ begin
  if not exists (select 1 from storage.objects where name = 'transportistas/t64/seguro.pdf') then raise exception 'FALLO 64 · el transportista no ve su seguro'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ begin
  if exists (select 1 from storage.objects) then raise exception 'FALLO 64 · FUGA: sin sesion se ven ficheros'; end if;
  raise notice 'OK 64 · almacen de archivos: bucket privado, cada fichero solo para quien ve su fila, subir solo a la propia carpeta';
end $$;
reset role;

-- =====================================================================================
-- ---- 65. CMR digital: firmar sin cuenta con el enlace, una vez por casilla ------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare tok uuid; begin
  insert into cmr_enlaces (envio_id) values (current_setting('prueba.e59')::uuid) returning token into tok;
  perform set_config('prueba.tok65', tok::text, false);
  perform set_config('prueba.carga65', (select id::text from envio_paradas where envio_id = current_setting('prueba.e59')::uuid and tipo = 'carga' limit 1), false);
  perform set_config('prueba.desc65', (select id::text from envio_paradas where envio_id = current_setting('prueba.e59')::uuid and tipo = 'descarga' limit 1), false);
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ declare tok uuid := current_setting('prueba.tok65')::uuid; v jsonb; r jsonb; ruta text; begin
  v := cmr_publico(tok);
  if v ->> 'resultado' <> 'ok' or jsonb_array_length(v -> 'paradas') <> 2 then raise exception 'FALLO 65 · no se ve el CMR: %', v; end if;
  if cmr_publico(gen_random_uuid()) ->> 'resultado' <> 'enlace_no_valido' then raise exception 'FALLO 65 · un enlace inventado abre el CMR'; end if;
  -- Subir el trazo solo en la carpeta del enlace.
  begin
    insert into storage.objects (bucket_id, name) values ('documentos', 'cmr/' || gen_random_uuid() || '/' || gen_random_uuid() || '.png');
    raise exception 'FALLO 65 · se sube un trazo con un enlace inventado';
  exception when insufficient_privilege then null;
  end;
  ruta := 'cmr/' || tok || '/' || gen_random_uuid() || '.png';
  insert into storage.objects (bucket_id, name) values ('documentos', ruta);
  -- Casilla equivocada: el remitente firma en una RECOGIDA.
  r := firmar_cmr_publico(tok, current_setting('prueba.desc65')::uuid, 'remitente', 'Ana', '12345678Z', 'ES', true, null, ruta, '1.2.3.4', 'prueba', null);
  if r ->> 'resultado' <> 'parada_no_valida' then raise exception 'FALLO 65 · remitente en una entrega: %', r; end if;
  r := firmar_cmr_publico(tok, current_setting('prueba.carga65')::uuid, 'remitente', 'Ana Carga', '12345678-z', 'ES', true, 'Ana@Almacen.es', ruta, '1.2.3.4', 'prueba', repeat('a', 64));
  if r ->> 'resultado' <> 'firmada' then raise exception 'FALLO 65 · no firma: %', r; end if;
  r := firmar_cmr_publico(tok, current_setting('prueba.carga65')::uuid, 'remitente', 'Otra', '12345678Z', 'ES', true, null, ruta, null, null, null);
  if r ->> 'resultado' <> 'ya_firmada' then raise exception 'FALLO 65 · se firma dos veces la misma casilla'; end if;
  -- Sin trazo subido, no hay firma.
  r := firmar_cmr_publico(tok, null, 'transportista', 'Pepe', 'X1234567L', 'ES', true, null, 'cmr/' || tok || '/' || gen_random_uuid() || '.png', null, null, null);
  if r ->> 'resultado' <> 'falta_trazo' then raise exception 'FALLO 65 · firma sin trazo: %', r; end if;
  v := cmr_publico(tok);
  if jsonb_array_length(v -> 'firmas') <> 1 or v -> 'firmas' -> 0 ->> 'documento' <> '•••678Z' then
    raise exception 'FALLO 65 · el documento no sale enmascarado: %', v -> 'firmas';
  end if;
  begin
    if (select count(*) from firmas_cmr) <> 0 then raise exception 'FALLO 65 · FUGA: anon lee la tabla de firmas'; end if;
  exception when insufficient_privilege then null;   -- ni siquiera puede consultarla: bien
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare f record; begin
  select * into f from firmas_cmr where envio_id = current_setting('prueba.e59')::uuid;
  if f.documento <> '12345678Z' or f.email <> 'ana@almacen.es' or f.ip is null or not f.documento_validado then
    raise exception 'FALLO 65 · la firma no guarda bien quién y desde dónde: %', f;
  end if;
  if not exists (select 1 from envio_hitos where envio_id = f.envio_id and hito = 'cmr_firmado') then raise exception 'FALLO 65 · sin hito de CMR firmado'; end if;
  -- Retirar el enlace lo cierra al momento.
  update cmr_enlaces set revocado = true where token = current_setting('prueba.tok65')::uuid;
end $$;
reset role;
set role anon;
do $$ begin
  if cmr_publico(current_setting('prueba.tok65')::uuid) ->> 'resultado' <> 'enlace_no_valido' then raise exception 'FALLO 65 · el enlace retirado sigue abierto'; end if;
  raise notice 'OK 65 · CMR digital: firma sin cuenta con enlace vigente, casilla correcta, una vez, documento enmascarado, trazo en su carpeta';
end $$;
reset role;

-- ---- 66. Exportaciones: marcar lo pasado a Holded / publicado en la bolsa ---------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  perform marcar_exportados('venta', array[(select 'GX000000000')]);
  raise exception 'FALLO 66 · un cliente marca exportaciones';
exception when insufficient_privilege then null;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ begin
  perform marcar_exportados('venta', array['GX000000000']);
  raise exception 'FALLO 66 · anon marca exportaciones';
exception when insufficient_privilege then null;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare ref text; n int; e record; begin
  select referencia_gx into ref from envios where id = current_setting('prueba.e59')::uuid;
  n := marcar_exportados('venta', array[ref]);
  if n <> 1 or (select pedido_venta_holded from envios where referencia_gx = ref) is distinct from ref then raise exception 'FALLO 66 · no marca la venta (%)', n; end if;
  if marcar_exportados('venta', array[ref]) <> 0 then raise exception 'FALLO 66 · marca dos veces'; end if;
  if exists (select 1 from v_holded_pedido_venta where "Num Pedido (referencia_gx_carga)" = ref and "EN HOLDED?" <> 'SI') then raise exception 'FALLO 66 · la vista no lo da por pasado'; end if;
  n := marcar_exportados('venta', array[ref], true);
  if n <> 1 or (select pedido_venta_holded from envios where referencia_gx = ref) is not null then raise exception 'FALLO 66 · no se desmarca (%, %)', n, (select pedido_venta_holded from envios where referencia_gx = ref); end if;
  n := marcar_exportados('bolsa', array[ref]);
  select publicado_en_bolsa_en into e from envios where referencia_gx = ref;
  if n <> 1 or e.publicado_en_bolsa_en is null then raise exception 'FALLO 66 · no marca la bolsa'; end if;
  if not exists (select 1 from envio_hitos where envio_id = current_setting('prueba.e59')::uuid and hito = 'publicado_bolsa') then raise exception 'FALLO 66 · sin hito de publicado en bolsa'; end if;
  begin
    perform marcar_exportados('facturas', array[ref]);
    raise exception 'FALLO 66 · acepta un fichero inventado';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  raise notice 'OK 66 · exportaciones: solo Dynamo marca lo pasado a Holded o publicado en la bolsa (y lo desmarca)';
end $$;
reset role;

-- ---- 67. Cambiar la ruta de un envío ya creado ------------------------------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare e uuid; p1 uuid; p2 uuid; n int; begin
  select (crear_envio(
    jsonb_build_object('cliente_id', current_setting('prueba.cliente'), 'metros_lineales', 6, 'fecha_carga_desde', current_date + 25, 'importe_cliente', 700),
    jsonb_build_array(
      jsonb_build_object('tipo', 'carga',    'nombre_empresa', 'Origen 67 SL',  'codigo_postal', '41001', 'poblacion', 'Sevilla', 'referencia', 'REF-67'),
      jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'Destino 67 SL', 'codigo_postal', '28001', 'poblacion', 'Madrid'))
  )).id into e;
  select id into p1 from envio_paradas where envio_id = e and tipo = 'carga';
  select id into p2 from envio_paradas where envio_id = e and tipo = 'descarga';
  -- Se mantiene la recogida, se cambia la entrega y se añade otra entrega antes.
  perform cambiar_ruta_envio(e, jsonb_build_array(
    jsonb_build_object('id', p1),
    jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'Parada 67', 'codigo_postal', '14001', 'poblacion', 'Córdoba'),
    jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'Nuevo destino 67', 'codigo_postal', '08001', 'poblacion', 'Barcelona')));
  select count(*) into n from envio_paradas where envio_id = e;
  if n <> 3 or exists (select 1 from envio_paradas where id = p2) then raise exception 'FALLO 67 · la ruta no queda como se pidió (% paradas)', n; end if;
  if (select referencia from envio_paradas where id = p1) <> 'REF-67' or (select orden from envio_paradas where id = p1) <> 1 then raise exception 'FALLO 67 · la parada que se mantiene pierde sus datos'; end if;
  if (select poblacion_destino from envios where id = e) <> 'Barcelona' then raise exception 'FALLO 67 · el destino del envío no se actualiza'; end if;
  if not exists (select 1 from envio_hitos where envio_id = e and hito = 'ruta_cambiada') then raise exception 'FALLO 67 · sin hito de ruta cambiada'; end if;
  -- Una ruta que empieza en entrega no vale.
  begin
    perform cambiar_ruta_envio(e, jsonb_build_array(
      jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'X', 'poblacion', 'Cádiz'),
      jsonb_build_object('id', p1)));
    raise exception 'FALLO 67 · acepta una ruta que empieza por una entrega';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  -- Una parada de OTRO envío no se puede colar.
  begin
    perform cambiar_ruta_envio(e, jsonb_build_array(
      jsonb_build_object('id', (select id from envio_paradas where envio_id = current_setting('prueba.e59')::uuid and tipo = 'carga' limit 1)),
      jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'X', 'poblacion', 'Cádiz')));
    raise exception 'FALLO 67 · se cuela una parada de otro envío';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform set_config('prueba.e67', e::text, false);
  -- Con firmas en el CMR, no se toca (el envío 59 tiene una firma de la prueba 65).
  begin
    perform cambiar_ruta_envio(current_setting('prueba.e59')::uuid, jsonb_build_array(
      jsonb_build_object('tipo', 'carga', 'nombre_empresa', 'X', 'poblacion', 'Cádiz'),
      jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'Y', 'poblacion', 'Huelva')));
    raise exception 'FALLO 67 · cambia la ruta con el CMR firmado';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  perform cambiar_ruta_envio(current_setting('prueba.e67')::uuid, '[]'::jsonb);
  raise exception 'FALLO 67 · un cliente cambia la ruta';
exception when insufficient_privilege then
  raise notice 'OK 67 · cambiar ruta: mantiene las paradas por id, valida carga→descarga, sin paradas ajenas ni con CMR firmado, solo Dynamo';
end $$;
reset role;

-- ---- 68. La flota se aprende sola y el transportista se valora al entregar ---------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare e uuid := current_setting('prueba.e67')::uuid; t uuid; v record; n int; begin
  insert into transportistas (razon_social, cif) values ('Trans Flota 68 SL', 'B68000068') returning id into t;
  update envios set transportista_id = t, estado_asignacion = 'confirmada', matricula_camion = '6868 kkk', matricula_remolque = 'r-6868-bbb',
                    conductor_nombre = 'José Pérez', conductor_telefono = '+34 600 111 222' where id = e;
  select * into v from envios where id = e;
  if v.vehiculo_camion_id is null or v.vehiculo_remolque_id is null or v.conductor_id is null then raise exception 'FALLO 68 · no da de alta la flota: %', v; end if;
  if (select tipo from vehiculos where id = v.vehiculo_remolque_id) <> 'remolque' or (select transportista_id from vehiculos where id = v.vehiculo_camion_id) <> t then
    raise exception 'FALLO 68 · la flota queda mal (tipo o transportista)';
  end if;
  if v.matricula_camion <> '6868 kkk' then raise exception 'FALLO 68 · cambia la copia en texto del envío'; end if;
  -- La misma matrícula escrita de otra forma y el mismo conductor sin acento: no se duplican.
  update envios set matricula_camion = null, conductor_nombre = null where id = e;
  update envios set matricula_camion = '6868-KKK', conductor_nombre = 'jose perez' where id = e;
  select count(*) into n from vehiculos where normaliza_matricula(matricula) = normaliza_matricula('6868KKK');
  if n <> 1 or (select count(*) from conductores where lower(unaccent_simple(nombre)) = 'jose perez') <> 1 then raise exception 'FALLO 68 · duplica camión o conductor'; end if;
  -- Valorar: solo entregado.
  begin
    update envios set valoracion_transportista = 5 where id = e;
    raise exception 'FALLO 68 · se valora un envío sin entregar';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  update envios set estado = 'entregado' where id = e;
  update envios set valoracion_transportista = 4 where id = e;
  if (select valoracion_dynamo from transportistas where id = t) <> 4 or (select valoracion_dynamo_votos from transportistas where id = t) <> 1 then
    raise exception 'FALLO 68 · la media del transportista no se actualiza';
  end if;
  update envios set valoracion_transportista = 2 where id = e;
  if (select valoracion_dynamo from transportistas where id = t) <> 2 then raise exception 'FALLO 68 · cambiar la nota no rehace la media'; end if;
  raise notice 'OK 68 · flota: camión, remolque y conductor se dan de alta solos sin duplicarse; valoración al entregar con media exacta';
end $$;
reset role;

-- ---- 69. Buscar envíos en la base de datos ------------------------------------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare n int; begin
  if not exists (select 1 from buscar_envios('cordoba parada') where buscar_envios = current_setting('prueba.e67')::uuid) then
    raise exception 'FALLO 69 · no encuentra un envío por su parada (sin acento)';
  end if;
  if exists (select 1 from buscar_envios('cordoba zzzzz')) then raise exception 'FALLO 69 · encuentra con una palabra que no está'; end if;
  if exists (select 1 from buscar_envios('')) then raise exception 'FALLO 69 · una búsqueda vacía devuelve envíos'; end if;
  if exists (select 1 from buscar_envios('%')) then raise exception 'FALLO 69 · el comodín %% no se escapa'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  -- El cliente de prueba no tiene permiso para leer la tabla envíos directamente: no encuentra nada ajeno.
  begin
    if exists (select 1 from buscar_envios('Trans Flota 68')) then raise exception 'FALLO 69 · un cliente encuentra envíos de otro por el buscador'; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 69 · buscar envíos: cada palabra, sin acentos ni comodines, y solo lo que cada uno puede ver';
end $$;
reset role;

-- ---- 70. Mantenimiento impuesto en la base de datos ---------------------------------------
update parametros set valor = 'true' where clave = 'mantenimiento_activo';
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin
    insert into lugares (cliente_id, nombre_empresa, poblacion) values (current_setting('prueba.cliente')::uuid, 'En mantenimiento', 'Sevilla');
    raise exception 'FALLO 70 · un cliente escribe con el mantenimiento encendido';
  exception when sqlstate '55000' then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ declare r jsonb; begin
  begin
    r := firmar_cmr_publico(gen_random_uuid(), null, 'transportista', 'X', 'Y', 'ES', false, null, 'cmr/x/y.png', null, null, null);
    -- (con un enlace inventado responde "enlace_no_valido" sin escribir: no hay nada que bloquear)
  exception when sqlstate '55000' then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare l uuid; begin
  insert into lugares (cliente_id, nombre_empresa, poblacion) values (current_setting('prueba.cliente')::uuid, 'Dynamo en mantenimiento', 'Sevilla') returning id into l;
  delete from lugares where id = l;
end $$;
reset role;
update parametros set valor = 'false' where clave = 'mantenimiento_activo';
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  -- Apagado: el cliente vuelve a poder (si sus permisos le dejan; aquí, su agenda).
  begin
    insert into lugares (cliente_id, nombre_empresa, poblacion) values (current_setting('prueba.cliente')::uuid, 'Fuera de mantenimiento', 'Sevilla');
  exception when sqlstate '55000' then raise exception 'FALLO 70 · sigue bloqueado con el mantenimiento apagado';
            when others then null;   -- otros permisos: no es cosa de esta prueba
  end;
  raise notice 'OK 70 · mantenimiento en la base de datos: encendido, solo Dynamo y el servidor escriben';
end $$;
reset role;

-- ---- 71. «Alta dada por» del cliente: solo un empleado de Dynamo --------------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  update clientes set alta_por = current_setting('prueba.u_admin')::uuid where id = current_setting('prueba.cliente')::uuid;
  begin
    update clientes set alta_por = current_setting('prueba.u_cli')::uuid where id = current_setting('prueba.cliente')::uuid;
    raise exception 'FALLO 71 · el alta se atribuye a un usuario que no es de Dynamo';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  update clientes set alta_por = null where id = current_setting('prueba.cliente')::uuid;
  raise notice 'OK 71 · «Alta dada por»: solo empleados de Dynamo (o alta online)';
end $$;
reset role;

-- ---- 72. Etapa B: el cliente pide, Dynamo pone precio, el cliente acepta --------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare e uuid; v record; r text; j jsonb; begin
  select s.id into e from crear_solicitud_envio(
    jsonb_build_object('metros_lineales', 4, 'toneladas', 3, 'fecha_carga_desde', current_date + 10, 'fecha_carga_hasta', current_date + 12),
    jsonb_build_array(
      jsonb_build_object('tipo', 'carga',    'nombre_empresa', 'Mi almacén 72', 'codigo_postal', '41001', 'poblacion', 'Sevilla', 'guardar_en_agenda', true, 'contacto_telefono', '+34 600 72 72 72'),
      jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'Mi cliente 72', 'codigo_postal', '46001', 'poblacion', 'Valencia'))) s;
  select * into v from mis_envios() m where m.id = e;
  if v.estado <> 'borrador' or v.solicitud_estado <> 'pendiente_precio' or v.importe_cliente is not null then raise exception 'FALLO 72 · la solicitud no nace bien: %', v; end if;
  -- Un sitio de OTRO cliente no se puede usar.
  begin
    perform crear_solicitud_envio(jsonb_build_object('fecha_carga_desde', current_date + 5),
      jsonb_build_array(jsonb_build_object('tipo', 'carga', 'lugar_id', (select id from lugares where cliente_id <> current_setting('prueba.cliente')::uuid and not es_almacen_dynamo limit 1)),
                        jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'X', 'poblacion', 'Cádiz')));
    raise exception 'FALLO 72 · el cliente usa un sitio de otro cliente';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
             when insufficient_privilege then null;
  end;
  -- El cliente no se pone precio.
  begin
    perform proponer_precio_solicitud(e, 1);
    raise exception 'FALLO 72 · el cliente se pone el precio';
  exception when insufficient_privilege then null;
  end;
  perform set_config('prueba.e72', e::text, false);
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  perform proponer_precio_solicitud(current_setting('prueba.e72')::uuid, 640, 520);
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare e uuid := current_setting('prueba.e72')::uuid; v record; r text; j jsonb; begin
  select * into v from mis_envios() m where m.id = e;
  if v.importe_cliente <> 640 or v.solicitud_estado <> 'precio_propuesto' then raise exception 'FALLO 72 · el cliente no ve el precio propuesto'; end if;
  r := responder_precio_solicitud(e, true);
  select * into v from mis_envios() m where m.id = e;
  if r <> 'aceptada' or v.estado <> 'programado' or v.condiciones_aceptadas_en is null then raise exception 'FALLO 72 · aceptar no programa el envío (%): %', r, v; end if;
  -- Y lo cancela (aún sin camión): gratis.
  j := cancelar_mi_envio(e, 'Ya no hace falta');
  if (j ->> 'penalizacion')::boolean or (select estado from mis_envios() m where m.id = e) <> 'cancelado' then raise exception 'FALLO 72 · cancelar sin camión no queda gratis: %', j; end if;
  -- Uno suyo ya entregado no se cancela.
  begin
    perform cancelar_mi_envio(current_setting('prueba.e67')::uuid);
    raise exception 'FALLO 72 · el cliente cancela un envío entregado';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  if exists (select 1 from mis_penalizaciones() where importe_cliente is null) then raise exception 'FALLO 72 · penalización sin importe'; end if;
  raise notice 'OK 72 · etapa B: solicitud del cliente, precio de Dynamo, aceptar (programa) y cancelar el suyo; sitios ajenos no';
end $$;
reset role;

-- ---- 73. Etapa C: el transportista hace su viaje desde el panel ------------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare e uuid; begin
  select (crear_envio(
    jsonb_build_object('cliente_id', current_setting('prueba.cliente'), 'metros_lineales', 8, 'fecha_carga_desde', current_date + 15, 'importe_cliente', 900, 'importe_transportista', 750),
    jsonb_build_array(
      jsonb_build_object('tipo', 'carga',    'nombre_empresa', 'Muelle 73', 'codigo_postal', '41001', 'poblacion', 'Sevilla'),
      jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'Destino 73', 'codigo_postal', '28001', 'poblacion', 'Madrid'))
  )).id into e;
  update envios set transportista_id = current_setting('prueba.transp')::uuid, estado_asignacion = 'confirmada' where id = e;
  perform set_config('prueba.e73', e::text, false);
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ declare e uuid := current_setting('prueba.e73')::uuid; v record; tok uuid; begin
  select * into v from mis_viajes() m where m.id = e;
  if v.id is null or jsonb_array_length(v.paradas) <> 2 or v.importe_transportista <> 750 then raise exception 'FALLO 73 · no ve su viaje con sus paradas: %', v; end if;
  perform marcar_mi_viaje(e, 'hacia_la_carga');
  perform marcar_mi_viaje(e, 'en_ruta');
  begin
    perform marcar_mi_viaje(e, 'cargando');
    raise exception 'FALLO 73 · el viaje vuelve atrás';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  select * into v from mis_viajes() m where m.id = e;
  if v.estado <> 'en_ruta' or v.fecha_carga_real is null then raise exception 'FALLO 73 · marcar en ruta no deja la fecha de carga: %', v; end if;
  -- Su albarán, sí; en el viaje de otro, no.
  insert into documentos (envio_id, tipo, storage_bucket, storage_ruta, nombre_archivo) values (e, 'albaran', 'documentos', 'u/x/y/albaran.pdf', 'albaran.pdf');
  begin
    insert into documentos (envio_id, tipo, storage_bucket, storage_ruta, nombre_archivo)
    values (current_setting('prueba.e72')::uuid, 'albaran', 'documentos', 'u/x/z/a.pdf', 'a.pdf');
    raise exception 'FALLO 73 · sube documentos a un viaje que no es suyo';
  exception when insufficient_privilege then null;
  end;
  -- Otro viaje: ni marcarlo ni su CMR.
  begin
    perform marcar_mi_viaje(current_setting('prueba.e72')::uuid, 'hacia_la_carga');
    raise exception 'FALLO 73 · marca un viaje que no es suyo';
  exception when insufficient_privilege then null;
  end;
  tok := mi_enlace_cmr(e);
  if tok is null or mi_enlace_cmr(e) <> tok then raise exception 'FALLO 73 · el enlace del CMR no es estable'; end if;
  perform marcar_mi_viaje(e, 'entregado');
  raise notice 'OK 73 · etapa C: el transportista ve su viaje, lo marca solo hacia delante, sube su albarán y abre su CMR; lo ajeno no';
end $$;
reset role;

-- ---- 74. La orden de carga desde el panel del transportista -----------------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ declare j jsonb; begin
  j := datos_orden_transportista(current_setting('prueba.e73')::uuid);
  if j -> 'envio' ->> 'referencia_gx' is null or jsonb_array_length(j -> 'paradas') <> 2 then raise exception 'FALLO 74 · la orden no trae su viaje: %', j; end if;
  if j::text ~ 'importe_cliente|margen|factor_tarifa' then raise exception 'FALLO 74 · la orden lleva datos del cliente de Dynamo'; end if;
  begin
    perform datos_orden_transportista(current_setting('prueba.e72')::uuid);
    raise exception 'FALLO 74 · ve la orden de un viaje que no es suyo';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 74 · orden de carga del transportista: solo su viaje y sin datos del cliente';
end $$;
reset role;

-- ---- 75. Incidencias del transportista: suyas, de sus viajes, y el cliente no las ve ---
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ declare i uuid; begin
  insert into incidencias (envio_id, tipo_id, titulo, detalle)
  values (current_setting('prueba.e73')::uuid, (select id from tipos_incidencia limit 1), 'El muelle no carga', 'Llevo 2 h esperando')
  returning id into i;
  if not exists (select 1 from incidencias where id = i and transportista_id = current_setting('prueba.transp')::uuid and cliente_id is null) then
    raise exception 'FALLO 75 · la incidencia del transportista no queda suya o lleva cliente';
  end if;
  begin
    insert into incidencias (envio_id, tipo_id, titulo, detalle)
    values (current_setting('prueba.e72')::uuid, (select id from tipos_incidencia limit 1), 'X', 'Y');
    raise exception 'FALLO 75 · abre incidencia en un viaje que no es suyo';
  exception when insufficient_privilege then null;
  end;
  perform set_config('prueba.inc75', i::text, false);
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if exists (select 1 from incidencias where id = current_setting('prueba.inc75')::uuid) then raise exception 'FALLO 75 · el cliente ve la incidencia del transportista'; end if;
  if exists (select 1 from envio_hitos where envio_id = current_setting('prueba.e73')::uuid and datos::text like '%muelle no carga%') then raise exception 'FALLO 75 · el cliente lee en el historial lo que escribió el transportista'; end if;
  raise notice 'OK 75 · incidencias del transportista: solo de sus viajes, suyas, y el cliente no las ve';
end $$;
reset role;
