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
    'reservar_envio(uuid,inet,text)', 'aceptar_reserva(uuid,uuid,uuid,numeric)',
    'liberar_reserva(uuid,text)', 'validar_pin_parada(uuid,text,inet,text)',
    'registrar_hito(uuid,tipo_hito,uuid,uuid,jsonb,text)',
    'cerrar_aceptacion(uuid,uuid,uuid,numeric)', 'caducar_reservas(uuid)',
    'preparar_pines_envio(uuid)', 'parametro(text)', 'pin_aleatorio(integer)'] loop
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
  update lugares set horarios = 'L-V 7:00-15:00' where id = current_setting('prueba.lugar_b')::uuid;
  update lugares set horarios = 'HACKEADO' where id = current_setting('prueba.lugar_a')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO 22 · B ha modificado la ficha de A'; end if;
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
  if (select horarios from lugares where id = current_setting('prueba.lugar_a')::uuid) is not null then
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
  if (select count(*) from festivos where extract(year from fecha) = 2030 and region is null) <> 11 then
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
