-- =====================================================================================
-- Comprobaciones de seguridad tras aplicar TODAS las migraciones.
-- Cada bloque lanza una excepción si falla (psql para con ON_ERROR_STOP) y deja
-- un NOTICE "OK" si pasa. Regla 14-bis: un punto solo está cumplido cuando hay
-- una prueba que lo demuestra.
-- =====================================================================================
set client_min_messages = notice;

-- Las pruebas 1-99 son anteriores al previo pago de envíos y no van de eso: se corren
-- con él apagado (si no, el cliente de prueba, sin crédito, no podría ofertar ni asignar).
-- La prueba 100 lo enciende.
update parametros set valor = 'false' where clave = 'pago_previo_activo';
-- Igual con los requisitos de la negociación del transportista (prueba 104): a 0, no se aplican.
update parametros set valor = '0' where clave in ('negociacion_min_creada_min', 'negociacion_min_bolsa_min', 'negociacion_max_horas_carga');
-- Y con la revisión del precio de los envíos lejanos (prueba 129): sin ella, todo precio es cerrado.
update parametros set valor = '100000' where clave = 'precio_cerrado_dias';

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
    -- reservar_envio_publico y liberar_reserva_publica salen de esta lista el 2026-11-03: la página
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
  insert into clientes (razon_social, cif, requiere_pin) values ('Cliente PIN S.L.', 'B22222222', true)
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
  r := reservar_envio_publico(tok, '10.0.0.1');
  if r->>'resultado' <> 'reservada' then raise exception 'FALLO 11 · primera reserva: %', r; end if;
  r2 := reservar_envio_publico((select token_publico from envios where id = e), '10.0.0.2');
  if r2->>'resultado' <> 'en_tramite' then
    raise exception 'FALLO 11 · DOS transportistas tienen la misma carga a la vez: %', r2;
  end if;
  -- Simular que pasan los 3 minutos.
  update envio_reservas set desde = now() - interval '10 min', hasta = now() - interval '7 min'
   where id = (r->>'reserva_id')::uuid;
  r2 := reservar_envio_publico((select token_publico from envios where id = e), '10.0.0.2');
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
  r := reservar_envio_publico((select token_publico from envios where id = e));
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
  r := reservar_envio_publico((select token from envio_ofertas where id = o));
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
  if (select realizado_en from envio_paradas where id = p2) is null then
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
  -- Los hitos, por mis_hitos() (sin datos internos); la tabla no la lee directamente.
  if exists (select 1 from envio_hitos where envio_id = e) then raise exception 'FALLO 15 · el transportista lee la tabla de hitos (con sus datos internos)'; end if;
  select count(*) into n from mis_hitos(e) where hito in ('ofertado','enlace_abierto','reservado');
  if n <> 0 then raise exception 'FALLO 15 · el transportista ve hitos internos (%)', n; end if;
  select count(*) into n from mis_hitos(e) where hito = 'transportista_asignado';
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
  select count(*) into n from mis_hitos(e);
  if n = 0 then raise exception 'FALLO 17 · el cliente no ve los hitos de su envio'; end if;
  if exists (select 1 from envio_hitos where envio_id = e) then raise exception 'FALLO 17 · el cliente lee la tabla de hitos (con importes)'; end if;
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
  insert into sitios (nombre_empresa, cliente_id)
    values ('Nave Prueba', (select id from clientes where cif = 'B44444444')) returning id into l;
  if (select requiere_cita from sitios where id = l)
     or not (select tiene_medios_carga from sitios where id = l) then
    raise exception 'FALLO 20 · por defecto deberia ser: sin cita previa y con medios de carga';
  end if;
  update sitios set requiere_cita = true, tiene_medios_carga = false where id = l;
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
  insert into sitios (nombre_empresa, es_almacen_dynamo, codigo_postal)
    values ('Almacen Dynamo Sevilla', true, '41016');
  begin
    insert into sitios (nombre_empresa) values ('Sitio sin duenyo');
    raise exception 'FALLO 21 · se ha creado un sitio que no es de ningun cliente';
  exception when check_violation then null;
  end;
end $$;

-- ---- 21. A y B tienen cada uno su ficha de la MISMA nave; nadie ve la del otro ------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare l uuid; begin
  insert into sitios (nombre_empresa, codigo_postal, anotaciones)
    values ('Nave Mercaplus', '41500', 'Manolo, el de cargas, es amigo de Pepe mi primo')
    returning id into l;                                   -- con RETURNING, como la app
  perform set_config('prueba.sitio_a', l::text, false);
  if (select cliente_id from sitios where id = l) is distinct from cliente_del_usuario() then
    raise exception 'FALLO 21 · el sitio creado no ha quedado a nombre del cliente';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli_b'), false);
set role authenticated;
do $$ declare l uuid; n int; begin
  select count(*) into n from sitios where nombre_empresa = 'Nave Mercaplus';
  if n <> 0 then raise exception 'FALLO 21 · FUGA: B ve la ficha (y las notas) de A'; end if;
  insert into sitios (nombre_empresa, codigo_postal, horarios)
    values ('Nave Mercaplus', '41500', 'L-V 6:00-14:00') returning id into l;
  perform set_config('prueba.sitio_b', l::text, false);
  select count(*) into n from sitios where es_almacen_dynamo;
  if n <> 1 then raise exception 'FALLO 21 · B no ve los almacenes Dynamo'; end if;
  raise notice 'OK 21 · cada cliente tiene su propia ficha de la nave; ninguno ve la del otro (ni sus notas)';
end $$;

-- ---- 22. Lo que B cambia en su ficha no toca la de A --------------------------------
do $$ declare n int; begin
  -- (Desde 2026-11-03 el horario va en sitio_horarios; el texto es un resumen automático.)
  update sitio_horarios set cierra = '15:00'
   where sitio_id = current_setting('prueba.sitio_b')::uuid and dia_semana = 1 and abre = '08:00';
  update sitios set anotaciones = 'HACKEADO' where id = current_setting('prueba.sitio_a')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO 22 · B ha modificado la ficha de A'; end if;
  delete from sitio_horarios where sitio_id = current_setting('prueba.sitio_a')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO 22 · B ha borrado el horario de A'; end if;
  update sitios set borrado = true, borrado_en = now() where id = current_setting('prueba.sitio_b')::uuid;
  select count(*) into n from sitios where id = current_setting('prueba.sitio_b')::uuid and not borrado;
  if n <> 0 then raise exception 'FALLO 22 · el sitio borrado sigue en la agenda de B'; end if;
  begin
    update sitios set es_almacen_dynamo = true where id = current_setting('prueba.sitio_b')::uuid;
  exception when others then null;
  end;
  raise notice 'OK 22 · cada cliente edita y borra solo lo suyo';
end $$;
reset role;
do $$ begin
  if (select horarios from sitios where id = current_setting('prueba.sitio_a')::uuid)
     is distinct from 'L-J 8:00-14:00 y 15:00-17:30 · V 8:00-14:00' then
    raise exception 'FALLO 22 · el horario de la ficha de A ha cambiado';
  end if;
  if (select anotaciones from sitios where id = current_setting('prueba.sitio_a')::uuid) not like 'Manolo%' then
    raise exception 'FALLO 22 · las notas de A se han perdido';
  end if;
end $$;

-- ---- 23. Un envío solo va a sitios de su cliente (o a un almacén Dynamo) ------------
do $$ declare e uuid; b uuid := (select id from clientes where cif = 'B44444444'); begin
  insert into envios (cliente_id, metros_lineales) values (b, 4) returning id into e;
  -- Ni siquiera Dynamo puede poner en un envío de B la ficha de A.
  begin
    insert into envio_paradas (envio_id, orden, tipo, sitio_id, codigo_postal, poblacion)
      values (e, 1, 'carga', current_setting('prueba.sitio_a')::uuid, '41500', 'Alcala');
    raise exception 'FALLO 23 · un envio de B ha usado la ficha de A';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  insert into envio_paradas (envio_id, orden, tipo, sitio_id, codigo_postal, poblacion)
    values (e, 1, 'carga', (select id from sitios where es_almacen_dynamo limit 1), '41016', 'Sevilla');
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
  foreach w in array array['importe_transportista','margen_euros','factor_tarifa_pct',
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
do $$ declare alm uuid := (select id from sitios where es_almacen_dynamo limit 1); begin
  update sitios set disponible = true where id = alm;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare alm uuid := (select id from sitios where es_almacen_dynamo limit 1); a uuid; begin
  insert into almacenamientos (almacen_id, fecha_entrada, fecha_salida, num_trailers,
                               importe_almacenaje)
    values (alm, current_date + 4, current_date + 10, 1, 240) returning id into a;
  if (select codigo from almacenamientos where id = a) !~ '^AX[0-9]{6}$' then
    raise exception 'FALLO 35 · el codigo no es AX + 6 cifras';
  end if;
  begin
    insert into almacenamientos (almacen_id, fecha_entrada, fecha_salida)
      values (current_setting('prueba.sitio_a')::uuid, current_date, current_date + 2);
    raise exception 'FALLO 35 · se ha almacenado en un sitio que no es almacen Dynamo';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    update almacenamientos set estado = 'confirmado' where id = a;
    raise exception 'FALLO 35 · el cliente ha confirmado su propio almacenamiento';
  exception when insufficient_privilege then null; end;
  perform set_config('prueba.alm', a::text, false);
end $$;
reset role;
do $$ declare alm uuid := (select id from sitios where es_almacen_dynamo limit 1);
              c uuid := current_setting('prueba.cliente')::uuid; begin
  update sitios set disponible = false where id = alm;
  begin
    insert into almacenamientos (cliente_id, almacen_id, fecha_entrada, fecha_salida)
      values (c, alm, current_date, current_date + 3);
    raise exception 'FALLO 35 · un almacen COMPLETO ha admitido una entrada';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Lo que ya estaba dentro no se rompe por marcar el almacén completo.
  update almacenamientos set estado = 'confirmado' where id = current_setting('prueba.alm')::uuid;
  update sitios set disponible = true where id = alm;
  begin
    insert into almacenamientos (cliente_id, almacen_id, fecha_entrada, fecha_salida,
                                 num_repartos, sitio_entrega_id)
      values (c, alm, current_date, current_date + 3, 1, current_setting('prueba.sitio_b')::uuid);
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
    values ('orden_carga', current_setting('prueba.envio')::uuid, t, 'envios/orden.pdf', 'orden.pdf');
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
    values ('foto_incidencia', current_setting('prueba.incidencia')::uuid, 'u/' || current_setting('prueba.u_cli') || '/f1/foto1.jpg', 'foto1.jpg');
  select count(*) into n from documentos where tipo in ('albaran','foto_incidencia');
  if n <> 2 then raise exception 'FALLO 36 · el cliente no ve su albaran y su foto (%)', n; end if;
  select count(*) into n from documentos where tipo in ('seguro_cmr','orden_carga','otro');
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
  if (select count(*) from firmas_envio(current_setting('prueba.envio')::uuid)) <> 1 then raise exception 'FALLO 37 · el cliente no ve la firma de su CMR'; end if;
  if exists (select 1 from firmas_cmr) then raise exception 'FALLO 37 · el cliente lee la tabla de firmas (IP, navegador, email)'; end if;
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
                      anotaciones_cliente, carga_techo)
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
  v_admin uuid := gen_random_uuid(); v_cli uuid; v_sitio uuid; r record; n int; v_cli_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_admin, 'admin48@dynamo.test'), (v_cli_user, 'cli48@cliente.test');
  update usuarios set rol = 'admin', estado = 'activa' where id = v_admin;
  insert into clientes (razon_social, cif) values ('Prueba 48 SL', 'B48484848') returning id into v_cli;
  insert into sitios (cliente_id, nombre_empresa, direccion, codigo_postal, poblacion, provincia)
    values (v_cli, 'Nave 48', 'C/ Uno 1', '41001', 'Sevilla', 'Sevilla') returning id into v_sitio;
  update usuarios set cliente_id = v_cli, estado = 'activa' where id = v_cli_user;

  -- Dynamo crea: una parada de la agenda (se copia) y otra suelta que se guarda en la agenda.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  select * into r from crear_envio(
    jsonb_build_object('cliente_id', v_cli, 'fecha_carga_desde', '2026-12-14', 'fecha_carga_hasta', '2026-12-16',
                       'metros_lineales', 13.3, 'toneladas', 24, 'importe_cliente', 1230, 'importe_transportista', 1050),
    jsonb_build_array(
      jsonb_build_object('tipo', 'carga', 'sitio_id', v_sitio, 'referencia', 'REF-1'),
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
  if not exists (select 1 from sitios where cliente_id = v_cli and nombre_empresa = 'Destino 48') then
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
  if (select factor_tarifa_pct from clientes where id = v_a) <> -7 then
    raise exception 'FALLO 50 · un cliente nuevo no empieza con −7 %%';
  end if;

  -- B: Dynamo le pone +10 % a mano.
  update clientes set factor_tarifa_pct = 10 where id = v_b;
  if not (select factor_fijado_a_mano from clientes where id = v_b) then
    raise exception 'FALLO 50 · cambiar el factor no lo marca como fijado a mano';
  end if;

  for i in 1..3 loop
    perform crear_envio(jsonb_build_object('cliente_id', v_a, 'importe_cliente', 500), p);
    perform crear_envio(jsonb_build_object('cliente_id', v_b, 'importe_cliente', 500), p);
    if i < 3 and (select factor_tarifa_pct from clientes where id = v_a) <> -7 then
      raise exception 'FALLO 50 · el descuento se quita antes de tiempo (envio %)', i;
    end if;
  end loop;
  if (select factor_tarifa_pct from clientes where id = v_a) <> 0 then
    raise exception 'FALLO 50 · tras 3 envios el factor no pasa a 0 %%';
  end if;
  if (select factor_tarifa_pct from clientes where id = v_b) <> 10 then
    raise exception 'FALLO 50 · la regla automatica ha tocado un factor fijado a mano';
  end if;

  -- B vuelve al automatico: como ya lleva 3 envios, le toca 0 %.
  update clientes set factor_fijado_a_mano = false where id = v_b;
  if (select factor_tarifa_pct from clientes where id = v_b) <> 0 then
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
  insert into sitios (nombre_empresa, codigo_postal) values ('Nave principal A', '41001') returning id into l;
  perform set_config('prueba.sitio_prin_a', l::text, false);
  perform marcar_sitio_principal(c, l);
  if sitio_principal(c) is distinct from l then raise exception 'FALLO 52 · el cliente no ha podido marcar su estrella'; end if;
  -- El sitio de otro cliente no vale como principal.
  begin
    perform marcar_sitio_principal(c, current_setting('prueba.sitio_b')::uuid);
    raise exception 'FALLO 52 · se ha marcado como principal el sitio de OTRO cliente';
  exception when check_violation then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli_b'), false);
set role authenticated;
do $$ declare a uuid := (select cliente_id from sitios where id = current_setting('prueba.sitio_prin_a')::uuid); begin
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
do $$ declare l uuid := current_setting('prueba.sitio_prin_a')::uuid; begin
  update sitios set borrado = true where id = l;     -- como la app: la hora la pone la BD
  if (select borrado_en from sitios where id = l) is null then
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
  if enum_range(null::tipo_sitio)::text <> '{almacen_nave,obra_zona_amplia,obra_zona_urbana,finca}' then
    raise exception 'FALLO 54 · tipos de lugar: %', enum_range(null::tipo_sitio);
  end if;
  if (select count(*) from recargos_tipo_sitio) <> 4
     or (select porcentaje from recargos_tipo_sitio where tipo = 'obra_zona_urbana') <> 20 then
    raise exception 'FALLO 54 · los recargos no se han pasado bien';
  end if;
  raise notice 'OK 54 · tipos de lugar: almacen/nave/campa, obra en zona amplia, obra en zona urbana y finca';
end $$;

-- ---- 55. Emails de avisos del sitio: lista propia, validada y con tope ---------------
do $$ declare l uuid := current_setting('prueba.sitio_b')::uuid; begin
  update sitios set emails_avisos = '{almacen@nave.es,recepcion@nave.es}' where id = l;
  begin
    update sitios set emails_avisos = '{esto-no-es-un-email}' where id = l;
    raise exception 'FALLO 55 · se ha guardado un email de avisos no valido';
  exception when check_violation then null;
  end;
  begin
    update sitios set emails_avisos = array(select 'a' || g || '@x.es' from generate_series(1, 11) g) where id = l;
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
  insert into sitios (nombre_empresa, codigo_postal) values ('Nave con horario', '41001') returning id into l;
  perform set_config('prueba.sitio_horario', l::text, false);
  if (select count(*) from sitio_horarios where sitio_id = l) <> 9 then
    raise exception 'FALLO 56 · el sitio no ha nacido con el horario por defecto';
  end if;
  if (select horarios from sitios where id = l) <> 'L-J 8:00-14:00 y 15:00-17:30 · V 8:00-14:00' then
    raise exception 'FALLO 56 · resumen: %', (select horarios from sitios where id = l);
  end if;
  -- El cliente cambia su horario: el viernes también por la tarde, y abre el sábado.
  delete from sitio_horarios where sitio_id = l and dia_semana = 5;
  insert into sitio_horarios (sitio_id, dia_semana, abre, cierra) values
    (l, 5, '08:00', '14:00'), (l, 5, '15:00', '17:30'), (l, 6, '09:00', '13:00');
  if (select horarios from sitios where id = l) <> 'L-V 8:00-14:00 y 15:00-17:30 · S 9:00-13:00' then
    raise exception 'FALLO 56 · resumen tras cambiar: %', (select horarios from sitios where id = l);
  end if;
  begin
    insert into sitio_horarios (sitio_id, dia_semana, abre, cierra) values (l, 1, '13:00', '16:00');
    raise exception 'FALLO 56 · se han aceptado dos tramos que se pisan';
  exception when exclusion_violation then null;
  end;
  begin
    insert into sitio_horarios (sitio_id, dia_semana, abre, cierra) values (l, 7, '18:00', '09:00');
    raise exception 'FALLO 56 · se ha aceptado un tramo que cierra antes de abrir';
  exception when check_violation then null;
  end;
  -- Guardar de una vez: sustituye todo; vacío no vale; con un tramo malo no cambia nada.
  perform guardar_horario(l, '[{"dia":1,"abre":"07:00","cierra":"15:00"},{"dia":2,"abre":"07:00","cierra":"15:00"}]');
  if (select horarios from sitios where id = l) <> 'L-M 7:00-15:00' then
    raise exception 'FALLO 56 · guardar_horario: %', (select horarios from sitios where id = l);
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
  if (select horarios from sitios where id = l) <> 'L-M 7:00-15:00' then
    raise exception 'FALLO 56 · un horario malo ha dejado el sitio a medias';
  end if;
  -- El resumen no se escribe a mano.
  update sitios set horarios = 'Siempre abierto' where id = l;
  if (select horarios from sitios where id = l) = 'Siempre abierto' then
    raise exception 'FALLO 56 · el resumen del horario se ha podido escribir a mano';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli_b'), false);
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from sitio_horarios where sitio_id = current_setting('prueba.sitio_horario')::uuid;
  if n <> 0 then raise exception 'FALLO 56 · FUGA: B ve el horario del sitio de A'; end if;
  delete from sitio_horarios where sitio_id = current_setting('prueba.sitio_horario')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO 56 · B ha borrado el horario del sitio de A'; end if;
  raise notice 'OK 56 · horarios en tabla: por defecto L-J 8-14 y 15-17:30 · V 8-14, resumen automatico, sin solapes, cada cliente el suyo';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 57. Precios de los almacenes Dynamo: por defecto en parámetros, propios opcionales
do $$ declare a uuid; begin
  insert into sitios (nombre_empresa, es_almacen_dynamo, codigo_postal, precio_almacenamiento_semana)
    values ('Almacen Dynamo Madrid', true, '28906', 260) returning id into a;
  if (select valor::text from parametros where clave = 'almacen_precio_semana') <> '240'
     or (select valor::text from parametros where clave = 'almacen_precio_reparto') <> '220' then
    raise exception 'FALLO 57 · faltan los precios por defecto de los almacenes';
  end if;
  begin
    update sitios set precio_reparto = 100 where id = current_setting('prueba.sitio_b')::uuid;
    raise exception 'FALLO 57 · un sitio de cliente ha guardado precio de almacen';
  exception when check_violation then null;
  end;
  if (select count(*) from sitio_horarios where sitio_id = a) <> 9 then
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
  -- Sin transportista no puede ir hacia la carga (regla de la fase 1): se le asigna uno. Con la
  -- carga a 20 días, cancelar sigue sin coste.
  update envios set transportista_id = current_setting('prueba.transp')::uuid, estado = 'hacia_la_carga' where id = e;
  r := cancelar_envio(e, 'El cliente ya no tiene la mercancía');
  if (select estado from envios where id = e) <> 'cancelado' then raise exception 'FALLO 58 · no se ha cancelado'; end if;
  if not exists (select 1 from envio_hitos where envio_id = e and hito = 'incidencia'
                 and datos ->> 'motivo_cancelacion' = 'El cliente ya no tiene la mercancía') then
    raise exception 'FALLO 58 · el motivo no ha quedado en el historial';
  end if;
  if (r ->> 'penalizacion')::boolean then raise exception 'FALLO 58 · penalización al cancelar con 20 días de antelación'; end if;
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
  r := reservar_envio_publico(tok, null, 'prueba');
  if r ->> 'resultado' <> 'reservada' then raise exception 'FALLO 59 · no reserva: %', r; end if;
  -- Otro que abre a la vez: en trámite.
  if reservar_envio_publico(tok, null, 'otro') ->> 'resultado' <> 'en_tramite' then raise exception 'FALLO 59 · doble reserva'; end if;
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
  insert into sitios (nombre_empresa, es_almacen_dynamo, direccion, codigo_postal, poblacion, provincia)
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
  if n <> 1 or (select holded_pedido_venta from envios where referencia_gx = ref) is distinct from ref then raise exception 'FALLO 66 · no marca la venta (%)', n; end if;
  if marcar_exportados('venta', array[ref]) <> 0 then raise exception 'FALLO 66 · marca dos veces'; end if;
  if exists (select 1 from v_holded_pedido_venta where "Num Pedido (referencia_gx_carga)" = ref and "EN HOLDED?" <> 'SI') then raise exception 'FALLO 66 · la vista no lo da por pasado'; end if;
  n := marcar_exportados('venta', array[ref], false);   -- false = quitar la marca
  if n <> 1 or (select holded_pedido_venta from envios where referencia_gx = ref) is not null then raise exception 'FALLO 66 · no se desmarca (%, %)', n, (select holded_pedido_venta from envios where referencia_gx = ref); end if;
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
  select count(*) into n from vehiculos where normalizar_matricula(matricula) = normalizar_matricula('6868KKK');
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
    insert into sitios (cliente_id, nombre_empresa, poblacion) values (current_setting('prueba.cliente')::uuid, 'En mantenimiento', 'Sevilla');
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
  insert into sitios (cliente_id, nombre_empresa, poblacion) values (current_setting('prueba.cliente')::uuid, 'Dynamo en mantenimiento', 'Sevilla') returning id into l;
  delete from sitios where id = l;
end $$;
reset role;
update parametros set valor = 'false' where clave = 'mantenimiento_activo';
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  -- Apagado: el cliente vuelve a poder (si sus permisos le dejan; aquí, su agenda).
  begin
    insert into sitios (cliente_id, nombre_empresa, poblacion) values (current_setting('prueba.cliente')::uuid, 'Fuera de mantenimiento', 'Sevilla');
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
  if v.estado <> 'borrador' or v.estado_solicitud <> 'pendiente_precio' or v.importe_cliente is not null then raise exception 'FALLO 72 · la solicitud no nace bien: %', v; end if;
  -- Un sitio de OTRO cliente no se puede usar.
  begin
    perform crear_solicitud_envio(jsonb_build_object('fecha_carga_desde', current_date + 5),
      jsonb_build_array(jsonb_build_object('tipo', 'carga', 'sitio_id', (select id from sitios where cliente_id <> current_setting('prueba.cliente')::uuid and not es_almacen_dynamo limit 1)),
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
  if v.importe_cliente <> 640 or v.estado_solicitud <> 'precio_propuesto' then raise exception 'FALLO 72 · el cliente no ve el precio propuesto'; end if;
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
    jsonb_build_object('cliente_id', current_setting('prueba.cliente'), 'metros_lineales', 8, 'fecha_carga_desde', (now() at time zone 'Europe/Madrid')::date, 'importe_cliente', 900, 'importe_transportista', 750),
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
  insert into documentos (envio_id, tipo, storage_bucket, storage_ruta, nombre_archivo) values (e, 'albaran', 'documentos', 'u/' || current_setting('prueba.u_transp') || '/y/albaran.pdf', 'albaran.pdf');
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

-- ---- 76. Envíos manuales del cliente (con su propio operador) ----------------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare o uuid; e uuid; v record; j jsonb; begin
  insert into operadores (cliente_id, razon_social, cif) values (current_setting('prueba.cliente')::uuid, 'Mi Camionero 76', 'B76000076') returning id into o;
  select s.id into e from crear_envio_manual(
    jsonb_build_object('operador_id', o, 'metros_lineales', 5, 'fecha_carga_desde', current_date, 'precio_acordado_operador', 300),
    jsonb_build_array(
      jsonb_build_object('tipo', 'carga',    'nombre_empresa', 'Mi nave', 'codigo_postal', '41001', 'poblacion', 'Sevilla'),
      jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'Mi cliente', 'codigo_postal', '29001', 'poblacion', 'Málaga'))) s;
  select * into v from mis_envios() m where m.id = e;
  if v.estado <> 'programado' or not v.es_manual or v.precio_acordado_operador <> 300 or v.importe_cliente is not null then raise exception 'FALLO 76 · el envío manual no nace bien: %', v; end if;
  perform marcar_mi_envio_manual(e, 'en_ruta');
  if (select estado from mis_envios() m where m.id = e) <> 'en_ruta' then raise exception 'FALLO 76 · no mueve su envío manual'; end if;
  j := datos_orden_manual(e);
  if j::text ~* 'dynamo' then raise exception 'FALLO 76 · la orden de transporte del cliente menciona a Dynamo'; end if;
  -- Un envío de Dynamo no lo mueve el cliente.
  begin
    perform marcar_mi_envio_manual(current_setting('prueba.e72')::uuid, 'entregado');
    raise exception 'FALLO 76 · el cliente mueve un envío de Dynamo';
  exception when insufficient_privilege then null;
  end;
  -- Ni con el operador de otro cliente.
  begin
    perform crear_envio_manual(jsonb_build_object('operador_id', gen_random_uuid(), 'fecha_carga_desde', current_date),
      jsonb_build_array(jsonb_build_object('tipo', 'carga', 'nombre_empresa', 'X', 'poblacion', 'A'), jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'Y', 'poblacion', 'B')));
    raise exception 'FALLO 76 · crea un envío con un operador que no es suyo';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  raise notice 'OK 76 · envíos manuales del cliente: con su operador, los mueve él, orden sin Dynamo; lo de Dynamo no';
end $$;
reset role;

-- ---- 77. El transportista sube la documentación de SU empresa, no la de otra -------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ begin
  -- (La ficha puede estar ya en el máximo de 5 por otras pruebas: entonces salta esa regla, que también vale.)
  begin
    insert into documentos (transportista_id, tipo, storage_bucket, storage_ruta, nombre_archivo)
    values (current_setting('prueba.transp')::uuid, 'seguro_cmr', 'documentos', 'u/x/s/seguro.pdf', 'seguro.pdf');
  exception when raise_exception then if sqlerrm not like '%Maximo 5%' then raise; end if;
  end;
  begin
    insert into documentos (transportista_id, tipo, storage_bucket, storage_ruta, nombre_archivo)
    values ((select id from transportistas where id <> current_setting('prueba.transp')::uuid limit 1), 'seguro_cmr', 'documentos', 'u/x/s/otro.pdf', 'otro.pdf');
    raise exception 'FALLO 77 · sube documentos a la ficha de otro transportista';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 77 · documentación de la empresa: el transportista sube la suya, no la de otro';
end $$;
reset role;

-- ---- 78. Aceptar carga por enlace: límite de CIF a lo bruto --------------------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare e uuid; o uuid; tok uuid; begin
  select (crear_envio(
    jsonb_build_object('cliente_id', current_setting('prueba.cliente'), 'metros_lineales', 13.3, 'fecha_carga_desde', current_date + 21, 'importe_cliente', 1000, 'importe_transportista', 800),
    jsonb_build_array(jsonb_build_object('tipo', 'carga', 'nombre_empresa', 'A78', 'codigo_postal', '41001', 'poblacion', 'Sevilla'),
                      jsonb_build_object('tipo', 'descarga', 'nombre_empresa', 'B78', 'codigo_postal', '28001', 'poblacion', 'Madrid')))).id into e;
  o := ofertar_envio(e, null, 'bolsa_wtransnet', 800, 0::smallint, false);
  select token into tok from envio_ofertas where id = o;
  perform set_config('prueba.tok78', tok::text, false);
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ declare tok uuid := current_setting('prueba.tok78')::uuid; r jsonb; a jsonb; i int; begin
  r := reservar_envio_publico(tok, null, 'prueba78');
  for i in 1..4 loop
    a := aceptar_oferta_publica((r ->> 'reserva_id')::uuid, 'Z0000000' || i, p_ip => '10.0.0.1');
    if a ->> 'resultado' <> 'transportista_no_encontrado' then raise exception 'FALLO 78 · intento %: %', i, a; end if;
  end loop;
  a := aceptar_oferta_publica((r ->> 'reserva_id')::uuid, 'Z00000005');
  if a ->> 'resultado' <> 'demasiados_intentos' then raise exception 'FALLO 78 · al 5.º fallo no corta: %', a; end if;
  -- Y la reserva queda libre: aunque ahora acierte el CIF, ya no vale.
  a := aceptar_oferta_publica((r ->> 'reserva_id')::uuid, 'B59000059');
  if a ->> 'resultado' = 'aceptada' then raise exception 'FALLO 78 · acepta con una reserva cortada por intentos'; end if;
  begin
    if (select count(*) from intentos_carga_publica) <> 0 then raise exception 'FALLO 78 · anon lee los intentos'; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 78 · aceptar carga: 5 CIF fallidos y la reserva se libera; los intentos quedan registrados y anon no los lee';
end $$;
reset role;

-- ---- 79. Facturado desde el panel y republicar en la bolsa lo modificado -----------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare ref text; t1 timestamptz; n int; begin
  select referencia_gx into ref from envios where id = current_setting('prueba.e59')::uuid;
  n := marcar_facturados('venta', array[ref]);
  if n <> 1 or not (select facturado_venta from envios where referencia_gx = ref) then raise exception 'FALLO 79 · no marca facturado (%)', n; end if;
  if exists (select 1 from v_holded_pedido_venta where "Num Pedido (referencia_gx_carga)" = ref and "FACTURADO?" <> 'SI') then raise exception 'FALLO 79 · la vista no lo da por facturado'; end if;
  -- Bolsa: publicado en la prueba 66 y modificado después (en otra transacción) → se republica;
  -- justo después, sin más cambios, ya no.
  n := marcar_exportados('bolsa', array[ref]);
  if n <> 1 then raise exception 'FALLO 79 · no republica lo modificado (%)', n; end if;
  n := marcar_exportados('bolsa', array[ref]);
  if n <> 0 then raise exception 'FALLO 79 · republica sin cambios (%)', n; end if;
  raise notice 'OK 79 · exportaciones: facturado desde el panel; la bolsa vuelve a publicar lo modificado';
end $$;
reset role;

-- ---- 80. Datos fijos de Dynamo en parámetros, legibles con sesión -------------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ declare j jsonb; begin
  j := datos_dynamo();
  if j ->> 'cif' <> 'ESB01596360' or j ->> 'wtransnet' <> '267017' then raise exception 'FALLO 80 · datos de Dynamo: %', j; end if;
  if j ? 'factor_bienvenida_pct' or j::text ~ 'pronto_pago' then raise exception 'FALLO 80 · se cuelan otros parámetros'; end if;
  raise notice 'OK 80 · datos fijos de Dynamo en parámetros, solo los suyos';
end $$;
reset role;

-- ---- 81. La orden de carga desde el enlace público: solo con la reserva aceptada --------
select set_config('prueba.res_ok', coalesce((select r.id::text from envio_reservas r join envios e on e.id = r.envio_id
   where r.estado = 'aceptada' and e.transportista_id = r.transportista_id and e.estado <> 'cancelado' and e.operador_id is null
   order by r.cerrada_en desc limit 1), ''), false);
select set_config('prueba.res_no', coalesce((select id::text from envio_reservas where estado <> 'aceptada' limit 1), ''), false);
set role anon;
do $$ declare j jsonb; begin
  if current_setting('prueba.res_ok') = '' then raise exception 'FALLO 81 · no hay reserva aceptada en los datos de prueba'; end if;
  j := datos_orden_publica(current_setting('prueba.res_ok')::uuid);
  if j -> 'envio' ->> 'referencia_gx' is null or j -> 'dynamo' ->> 'cif' is null then raise exception 'FALLO 81 · la orden no trae su viaje: %', j; end if;
  if j::text ~ 'importe_cliente|margen|factor_tarifa' then raise exception 'FALLO 81 · la orden pública lleva datos del cliente de Dynamo'; end if;
  begin
    perform datos_orden_publica(gen_random_uuid());
    raise exception 'FALLO 81 · da una orden con una reserva inventada';
  exception when insufficient_privilege then null;
  end;
  if current_setting('prueba.res_no') <> '' then
    begin
      perform datos_orden_publica(current_setting('prueba.res_no')::uuid);
      raise exception 'FALLO 81 · da la orden con una reserva no aceptada';
    exception when insufficient_privilege then null;
    end;
  end if;
  begin
    perform orden_carga_json((select null::uuid));
    raise exception 'FALLO 81 · la función interna se puede llamar sin pasar por la puerta';
  exception when insufficient_privilege then null;
  end;
  if enlace_cmr_publico(current_setting('prueba.res_ok')::uuid) is null
     or enlace_cmr_publico(current_setting('prueba.res_ok')::uuid) <> enlace_cmr_publico(current_setting('prueba.res_ok')::uuid) then
    raise exception 'FALLO 81 · el enlace del CMR por la reserva no es estable';
  end if;
  begin
    perform enlace_cmr_publico(gen_random_uuid());
    raise exception 'FALLO 81 · da un enlace de CMR con una reserva inventada';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 81 · orden de carga y CMR por el enlace: solo con la reserva aceptada, sin datos del cliente';
end $$;
reset role;

-- ---- 82. Bultos, embalaje y volumen del CMR: Dynamo y el cliente, con sus límites --------
select set_config('prueba.e82', coalesce((select e.id::text from envios e where e.cliente_id = current_setting('prueba.cliente')::uuid
   and e.estado in ('borrador', 'programado', 'hacia_la_carga') and e.operador_id is null
   and not exists (select 1 from firmas_cmr f where f.envio_id = e.id) limit 1), ''), false);
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare e uuid; j jsonb; begin
  if current_setting('prueba.e82') = '' then raise exception 'FALLO 82 · no hay envío del cliente sin cargar en los datos de prueba'; end if;
  e := current_setting('prueba.e82')::uuid;
  perform poner_datos_cmr(e, 33, 'Palet europeo', 86);
  j := datos_cmr_envio(e);
  if (j ->> 'num_bultos')::int <> 33 or j ->> 'embalaje' <> 'Palet europeo' or (j ->> 'volumen_m3')::numeric <> 86 then
    raise exception 'FALLO 82 · no guarda los datos del CMR: %', j;
  end if;
  begin
    perform poner_datos_cmr(e, 0, null, null);
    raise exception 'FALLO 82 · acepta 0 bultos';
  exception when check_violation then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ begin
  begin
    perform poner_datos_cmr(current_setting('prueba.e82')::uuid, 1, null, null);
    raise exception 'FALLO 82 · el transportista cambia los datos del CMR';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 82 · bultos, embalaje y volumen del CMR: los pone el cliente antes de cargar; el transportista no';
end $$;
reset role;

-- ---- 83. Pago por adelantado del almacenamiento y datos bancarios en parámetros ----------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare j jsonb; n int; begin
  j := datos_dynamo();
  if j ->> 'bic' <> 'BSCHESMM' or not (j ? 'iban') then raise exception 'FALLO 83 · faltan los datos bancarios: %', j; end if;
  update almacenamientos set pagado_en = now() where id = (select id from almacenamientos order by creado_en limit 1);
  get diagnostics n = row_count;
  if n > 1 then raise exception 'FALLO 83 · marca de más'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare n int; begin
  update almacenamientos set pagado_en = now();
  get diagnostics n = row_count;
  if n > 0 then raise exception 'FALLO 83 · el cliente se marca sus almacenamientos como pagados'; end if;
  raise notice 'OK 83 · pago del almacenamiento: lo marca Dynamo, el cliente no; datos bancarios en parámetros';
end $$;
reset role;

-- ---- 84. Parámetros: el empleado no escribe; el IBAN no se toca desde la web -------------
do $$ declare emp uuid; begin
  insert into auth.users (email) values ('empleado84@dynamo.prueba') returning id into emp;
  update usuarios set rol = 'empleado', estado = 'activa' where id = emp;
  perform set_config('prueba.u_emp84', emp::text, false);
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_emp84'), false);
set role authenticated;
do $$ declare n int; begin
  if not exists (select 1 from parametros where clave = 'dynamo_cif') then raise exception 'FALLO 84 · el empleado ya no lee los parámetros'; end if;
  update parametros set valor = '999' where clave = 'solicitud_validez_horas';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'FALLO 84 · un empleado cambia parámetros llamando a la API'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare n int; begin
  begin
    update parametros set valor = '"ES0000000000000000000000"' where clave = 'dynamo_iban';
    raise exception 'FALLO 84 · un administrador cambia el IBAN desde la web';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from parametros where clave = 'dynamo_cif';
    raise exception 'FALLO 84 · se borra el CIF de Dynamo desde la web';
  exception when insufficient_privilege then null;
  end;
  update parametros set valor = valor where clave = 'solicitud_validez_horas';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO 84 · el administrador ya no puede cambiar parámetros normales'; end if;
end $$;
reset role;
-- Desde Supabase (el dueño de la base de datos) sí.
do $$ begin
  update parametros set valor = '"ES9121000418450200051332"' where clave = 'dynamo_iban';
  if (select valor #>> '{}' from parametros where clave = 'dynamo_iban') <> 'ES9121000418450200051332' then raise exception 'FALLO 84 · ni desde Supabase se puede poner el IBAN'; end if;
  update parametros set valor = '""' where clave = 'dynamo_iban';
  raise notice 'OK 84 · parámetros: solo el administrador escribe; IBAN, banco, titular y CIF solo desde Supabase';
end $$;

-- ---- 85. Roles de solo lectura: lo ven todo, no escriben nada ---------------------------
do $$ declare lista text; begin
  -- Toda política que deja LEER a es_equipo_dynamo() tiene su gemela con ve_todo() (si mañana se
  -- añade una tabla nueva y se olvida, este chivato lo dice).
  select string_agg(distinct p.tablename, ', ') into lista
    from pg_policies p
   where p.schemaname = 'public' and p.cmd in ('SELECT', 'ALL') and p.qual ~ 'es_equipo_dynamo\(\)'
     and not exists (select 1 from pg_policies q where q.schemaname = 'public' and q.tablename = p.tablename
                       and q.cmd = 'SELECT' and q.qual ~ 've_todo\(\)');
  if lista is not null then raise exception 'FALLO 85 · tablas que lee Dynamo y NO los de solo lectura: %', lista; end if;
end $$;
do $$ declare al uuid; el uuid; begin
  insert into auth.users (email) values ('adminlectura85@dynamo.prueba') returning id into al;
  insert into auth.users (email) values ('empleadolectura85@dynamo.prueba') returning id into el;
  update usuarios set rol = 'admin_lectura', estado = 'activa' where id = al;
  update usuarios set rol = 'empleado_lectura', estado = 'activa' where id = el;
  perform set_config('prueba.u_al85', al::text, false);
  perform set_config('prueba.u_el85', el::text, false);
end $$;
do $$ declare quien text; n int; begin
  foreach quien in array array['prueba.u_al85', 'prueba.u_el85'] loop
    perform set_config('request.jwt.claim.sub', current_setting(quien), false);
    set local role authenticated;
    if (select count(*) from clientes) = 0 then raise exception 'FALLO 85 · % no ve los clientes', quien; end if;
    if (select count(*) from usuarios) < 3 then raise exception 'FALLO 85 · % no ve los usuarios', quien; end if;
    if not exists (select 1 from parametros where clave = 'dynamo_cif') then raise exception 'FALLO 85 · % no ve los parámetros', quien; end if;
    perform * from altas_pendientes();
    update clientes set razon_social = razon_social || ' X';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'FALLO 85 · % (solo lectura) cambia clientes', quien; end if;
    delete from clientes; get diagnostics n = row_count;
    if n > 0 then raise exception 'FALLO 85 · % (solo lectura) borra clientes', quien; end if;
    update parametros set valor = valor; get diagnostics n = row_count;
    if n > 0 then raise exception 'FALLO 85 · % (solo lectura) cambia parámetros', quien; end if;
    begin
      insert into clientes (razon_social, cif) values ('Intruso S.L.', 'B87654321');
      raise exception 'FALLO 85 · % (solo lectura) da de alta un cliente', quien;
    exception when insufficient_privilege then null;
    end;
    begin
      update usuarios set rol = 'admin' where id = auth.uid();
      if exists (select 1 from usuarios where id = auth.uid() and rol = 'admin') then
        raise exception 'FALLO 85 · % se sube a sí mismo a admin', quien;
      end if;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
end $$;
-- Un Empleado gestor no puede crear un Admin lectura (lo vería todo): solo el Admin Master.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_emp84'), false);
set role authenticated;
do $$ begin
  begin
    update usuarios set rol = 'admin_lectura' where email = 'alta@prueba.es';
    if exists (select 1 from usuarios where email = 'alta@prueba.es' and rol = 'admin_lectura') then
      raise exception 'FALLO 85 · un empleado concede Admin lectura';
    end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  raise notice 'OK 85 · Admin lectura y Empleado lectura lo leen todo y no escriben nada; Admin lectura solo lo da el Admin Master';
end $$;

-- ---- 86. Contadores del panel y cobertura de crédito: cada uno, lo suyo --------------------
set role anon;
do $$ begin
  begin
    perform contadores_panel();
    raise exception 'FALLO 86 · un anónimo pide los contadores del panel';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ declare total_dynamo int; begin
  select count(*) into total_dynamo from incidencias where estado in ('abierto', 'en_curso');
  perform set_config('prueba.inc86', total_dynamo::text, false);
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli_b'), false);
set role authenticated;
do $$ declare c jsonb; begin
  c := contadores_panel();
  if (c ->> 'incidencias')::int > (select count(*) from incidencias) then raise exception 'FALLO 86 · el cliente cuenta incidencias que no ve'; end if;
  if c ? 'altas' then raise exception 'FALLO 86 · el cliente ve el contador de altas de Dynamo'; end if;
  if mi_cobertura_credito() not in ('disponible', 'nulo', 'sinclasif') then raise exception 'FALLO 86 · cobertura de crédito sin estado: %', mi_cobertura_credito(); end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_al85'), false);
set role authenticated;
do $$ declare c jsonb; begin
  c := contadores_panel();
  if (c ->> 'incidencias')::int <> current_setting('prueba.inc86')::int then raise exception 'FALLO 86 · el Admin lectura no cuenta todas las incidencias: %', c; end if;
  if mi_cobertura_credito() is not null then raise exception 'FALLO 86 · un usuario de Dynamo tiene cobertura de cliente'; end if;
  raise notice 'OK 86 · contadores del panel: cada uno cuenta solo lo que ve; cobertura de crédito sin importes y solo del cliente';
end $$;
reset role;

-- ---- 87. Admin Master: solo desde Supabase, nunca por la API --------------------------------
do $$ declare u uuid; begin
  insert into auth.users (email) values ('candidato87@dynamo.prueba') returning id into u;
  update usuarios set rol = 'empleado', estado = 'activa' where id = u;
  perform set_config('prueba.u87', u::text, false);
end $$;
-- Ni un Admin Master con su sesión…
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  begin
    update usuarios set rol = 'admin' where id = current_setting('prueba.u87')::uuid;
    raise exception 'FALLO 87 · un Admin Master nombra otro Admin Master desde la web';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- …ni el servidor con la clave de servicio…
select set_config('request.jwt.claim.sub', '', false);
set role service_role;
do $$ begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    update usuarios set rol = 'admin' where id = current_setting('prueba.u87')::uuid;
    raise exception 'FALLO 87 · la clave de servicio nombra un Admin Master';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- …desde Supabase (el dueño, conexión directa) sí.
do $$ begin
  update usuarios set rol = 'admin' where id = current_setting('prueba.u87')::uuid;
  if not exists (select 1 from usuarios where id = current_setting('prueba.u87')::uuid and rol = 'admin') then
    raise exception 'FALLO 87 · ni desde Supabase se puede nombrar un Admin Master';
  end if;
  update usuarios set rol = 'empleado' where id = current_setting('prueba.u87')::uuid;
  raise notice 'OK 87 · Admin Master solo desde Supabase: ni otro admin ni la clave de servicio lo crean';
end $$;

-- ---- 88. El transportista cambia SOLO sus datos operativos y SOLO su flota ----------------
do $$ declare otro uuid; v uuid; begin
  insert into transportistas (razon_social, cif) values ('Otro Transporte 88', 'B88888888') returning id into otro;
  insert into vehiculos (transportista_id, matricula, tipo) values (otro, '8888 ZZZ', 'tractora') returning id into v;
  perform set_config('prueba.otro88', otro::text, false);
  perform set_config('prueba.veh_otro88', v::text, false);
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ declare v uuid; c uuid; begin
  -- Su NIMA y su seguro: sí.
  perform guardar_mis_datos_transporte('NIMA-88', 'Mapfre', 'POL-88', date '2027-01-31');
  -- Su flota: alta de camión y conductor, cambio y baja: sí.
  v := guardar_mi_vehiculo(null, '0088 bcd', 'rigido', date '2027-03-01', null, null, false, true);
  perform guardar_mi_vehiculo(v, '0088 BCD', 'rigido', date '2027-04-01', null, null, false, true);
  c := guardar_mi_conductor(null, 'Conductor 88', '88888888Y', 'ES', '+34600111222');
  perform dar_baja_mi_flota('conductor', c);
  -- Escribir directamente en las tablas: no (ni su razón social ni su plazo de pago).
  begin
    update transportistas set razon_social = 'Me cambio el nombre', plazo_pago_dias = 0 where id = current_setting('prueba.transp')::uuid;
    if found then raise exception 'FALLO 88 · el transportista cambia su razón social o su plazo de pago'; end if;
  exception when insufficient_privilege then null;
  end;
  -- La flota de otro: no.
  begin
    perform guardar_mi_vehiculo(current_setting('prueba.veh_otro88')::uuid, 'x', 'tractora', null, null, null, false, false);
    raise exception 'FALLO 88 · el transportista cambia un camión de otro';
  exception when raise_exception or insufficient_privilege then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  begin
    perform dar_baja_mi_flota('vehiculo', current_setting('prueba.veh_otro88')::uuid);
    raise exception 'FALLO 88 · el transportista da de baja un camión de otro';
  exception when raise_exception or insufficient_privilege then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  -- Una matrícula que ya existe (aunque sea de otro): no.
  begin
    perform guardar_mi_vehiculo(null, '8888-zzz', 'tractora', null, null, null, false, false);
    raise exception 'FALLO 88 · se da de alta una matrícula repetida';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;
reset role;
-- Un cliente no puede usar estas funciones.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin
    perform guardar_mis_datos_transporte('X', null, null, null);
    raise exception 'FALLO 88 · un cliente cambia datos de un transportista';
  exception when raise_exception or insufficient_privilege then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from transportistas where id = current_setting('prueba.transp')::uuid and nima = 'NIMA-88' and seguro_cmr_poliza = 'POL-88'
                 and razon_social <> 'Me cambio el nombre' and plazo_pago_dias <> 0) then
    raise exception 'FALLO 88 · el guardado de NIMA/seguro no ha quedado bien';
  end if;
  if not exists (select 1 from vehiculos where normalizar_matricula(matricula) = normalizar_matricula('0088 BCD') and itv_vence = date '2027-04-01'
                 and modificado_por = current_setting('prueba.u_transp')::uuid) then
    raise exception 'FALLO 88 · el camión no se ha guardado o no queda quién lo cambió';
  end if;
  if exists (select 1 from conductores where nombre = 'Conductor 88' and activo) then raise exception 'FALLO 88 · la baja del conductor no ha funcionado'; end if;
  if not exists (select 1 from vehiculos where id = current_setting('prueba.veh_otro88')::uuid and activo) then raise exception 'FALLO 88 · se ha tocado la flota de otro'; end if;
  raise notice 'OK 88 · el transportista cambia su NIMA, su seguro y su flota; ni lo fiscal, ni la flota de otro, ni un cliente';
end $$;

-- ---- 89. Almacenamiento pedido por el cliente: el precio y el pago los pone la base -----
do $$ declare alm uuid := (select id from sitios where es_almacen_dynamo and not borrado limit 1); begin
  update sitios set disponible = true where id = alm;
  perform set_config('prueba.alm89', alm::text, false);
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare a uuid; r record; begin
  if (select count(*) from almacenes_dynamo_tarifa()) = 0 then raise exception 'FALLO 89 · el cliente no ve los almacenes con su tarifa'; end if;
  -- Intenta ponerse el precio a 1 €, marcarse como pagado, confirmarlo y escribir notas internas.
  insert into almacenamientos (almacen_id, fecha_entrada, fecha_salida, num_trailers, num_repartos,
                               importe_almacenaje, importe_reparto, requiere_pago_previo, pagado_en, anotaciones, iva_pct)
    values (current_setting('prueba.alm89')::uuid, current_date + 2, current_date + 12, 2, 0,
            1, 0, false, now(), 'nota mia', 0) returning id into a;
  select * into r from almacenamientos where id = a;
  -- 10 días = 2 semanas × 2 tráileres × tarifa del almacén.
  if r.importe_almacenaje <= 1 or r.pagado_en is not null or r.anotaciones is not null or r.estado <> 'pendiente_confirmar' or r.iva_pct = 0 then
    raise exception 'FALLO 89 · el cliente se pone el precio, el pago, el estado o notas internas (importe %, pagado %)', r.importe_almacenaje, r.pagado_en;
  end if;
  -- Luego intenta marcarse como pagado y bajarse el precio sin cambiar nada más.
  update almacenamientos set pagado_en = now(), importe_almacenaje = 1, anotaciones = 'x' where id = a;
  select * into r from almacenamientos where id = a;
  if r.pagado_en is not null or r.importe_almacenaje <= 1 or r.anotaciones is not null then
    raise exception 'FALLO 89 · el cliente se marca como pagado o se baja el precio después';
  end if;
  -- Alarga un día más de dos semanas: el precio se recalcula (3 semanas).
  update almacenamientos set fecha_salida = current_date + 17 where id = a;
  if (select importe_almacenaje from almacenamientos where id = a) <= r.importe_almacenaje then
    raise exception 'FALLO 89 · al alargarlo no se recalcula el precio';
  end if;
  -- Y lo cancela él mismo mientras nadie lo ha confirmado.
  update almacenamientos set estado = 'cancelado' where id = a;
  if (select estado from almacenamientos where id = a) <> 'cancelado' then raise exception 'FALLO 89 · el cliente no puede cancelar su petición'; end if;
  perform set_config('prueba.alm89b', a::text, false);
end $$;
reset role;
-- Dynamo sí marca el pago (no pasa por la regla del cliente).
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  update almacenamientos set pagado_en = now() where id = current_setting('prueba.alm89b')::uuid;
  if (select pagado_en from almacenamientos where id = current_setting('prueba.alm89b')::uuid) is null then
    raise exception 'FALLO 89 · Dynamo no puede marcar el pago';
  end if;
  raise notice 'OK 89 · el cliente pide su almacenamiento: precio, IVA y pago los pone la base; no se marca pagado ni toca notas internas';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 90. Archivos sueltos: solo los lista el servidor, y solo lo de verdad suelto --------
reset role;
do $$ begin
  insert into storage.objects (bucket_id, name, created_at) values
    ('documentos', 'u/prueba90/suelto.pdf', now() - interval '3 days'),
    ('documentos', 'u/prueba90/reciente.pdf', now() - interval '1 hour'),
    ('documentos', 'u/prueba90/con-fila.pdf', now() - interval '3 days');
  insert into documentos (tipo, transportista_id, storage_ruta, nombre_archivo, borrado, borrado_en)
    values ('otro', current_setting('prueba.transp')::uuid, 'u/prueba90/con-fila.pdf', 'con-fila.pdf', true, now());
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  begin
    perform * from archivos_sueltos(24);
    raise exception 'FALLO 90 · un usuario con sesión lista los archivos sueltos';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role service_role;
do $$ declare r text[]; begin
  select array_agg(ruta) into r from archivos_sueltos(1) where ruta like 'u/prueba90/%';
  if r is distinct from array['u/prueba90/suelto.pdf'] then
    raise exception 'FALLO 90 · la lista de sueltos no es la buena: %', r;
  end if;
  raise notice 'OK 90 · archivos sueltos: solo el servidor los lista; ni lo reciente ni lo que tiene fila (aunque esté quitado)';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 91. Registro del cambio de email: solo el Admin Master y solo si ha pasado -----------
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin
    perform registrar_cambio_email(current_setting('prueba.u_cli')::uuid, 'x@x.es', 'compras@cliente.prueba');
    raise exception 'FALLO 91 · un cliente apunta cambios de email';
  exception when raise_exception or insufficient_privilege then if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare n bigint; begin
  begin
    perform registrar_cambio_email(current_setting('prueba.u_cli')::uuid, 'compras@cliente.prueba', 'otro@inventado.es');
    raise exception 'FALLO 91 · se apunta un cambio de email que no ha pasado';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform registrar_cambio_email(current_setting('prueba.u_cli')::uuid, 'antes@cliente.prueba', (select email from usuarios where id = current_setting('prueba.u_cli')::uuid));
end $$;
reset role;
do $$ begin
  if not exists (select 1 from auditoria where tabla = 'usuarios' and registro_id = current_setting('prueba.u_cli')
                  and quien = current_setting('prueba.u_admin')::uuid and cambios->'email'->>'antes' = 'antes@cliente.prueba') then
    raise exception 'FALLO 91 · el cambio de email no queda en la auditoría con su autor';
  end if;
  raise notice 'OK 91 · cambio de email: lo apunta solo el Admin Master, solo si ha pasado, con su nombre en la auditoría';
end $$;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 92. Recursos: los publica solo Dynamo y los ve cualquier cuenta activa --------------
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare d uuid; begin
  insert into documentos (tipo, es_recurso, recurso_titulo, storage_ruta, nombre_archivo)
    values ('otro', true, 'Condiciones generales', 'recursos/92/condiciones.pdf', 'condiciones.pdf') returning id into d;
  perform set_config('prueba.rec92', d::text, false);
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ begin
  if not exists (select 1 from documentos where id = current_setting('prueba.rec92')::uuid) then
    raise exception 'FALLO 92 · un transportista no ve un recurso publicado';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare i uuid; begin
  if not exists (select 1 from documentos where id = current_setting('prueba.rec92')::uuid) then
    raise exception 'FALLO 92 · un cliente no ve un recurso publicado';
  end if;
  -- Un cliente intenta colar su adjunto como recurso (lo vería todo el mundo).
  select id into i from incidencias where cliente_id = current_setting('prueba.cliente')::uuid limit 1;
  begin
    insert into documentos (tipo, incidencia_id, es_recurso, recurso_titulo, storage_ruta, nombre_archivo)
      values ('adjunto', i, true, 'x', 'u/x/92.pdf', '92.pdf');
    raise exception 'FALLO 92 · un cliente publica un documento en Recursos';
  exception when raise_exception or check_violation or insufficient_privilege then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;
reset role;
-- Quitado (borrado suave): ya no lo ve nadie salvo Dynamo.
select set_config('request.jwt.claim.sub', '', false);
update documentos set borrado = true, borrado_en = now() where id = current_setting('prueba.rec92')::uuid;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if exists (select 1 from documentos where id = current_setting('prueba.rec92')::uuid) then
    raise exception 'FALLO 92 · un recurso quitado lo sigue viendo el cliente';
  end if;
  raise notice 'OK 92 · Recursos: los publica solo Dynamo, los ve cualquier cuenta activa, y al quitarlos desaparecen';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 93. El cliente puntúa al transportista de SU envío entregado ------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  -- El envío entregado de la prueba 68 es de nuestro cliente de prueba.
  update envios set cliente_id = current_setting('prueba.cliente')::uuid where id = current_setting('prueba.e67')::uuid and not es_manual;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare e uuid := current_setting('prueba.e67')::uuid; r record; begin
  select * into r from mi_valoracion_envio(e);
  if not r.puede then raise exception 'FALLO 93 · el cliente no puede valorar su envío entregado'; end if;
  perform valorar_mi_envio(e, 5::smallint, 'Muy puntuales');
  perform valorar_mi_envio(e, 4::smallint, 'Puntuales');   -- la cambia dentro de los 30 días
  begin
    perform valorar_mi_envio(e, 9::smallint, null);
    raise exception 'FALLO 93 · admite una nota fuera de 1-5';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    perform valorar_mi_envio(gen_random_uuid(), 3::smallint, null);
    raise exception 'FALLO 93 · valora un envío que no es suyo';
  exception when raise_exception or insufficient_privilege then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    perform valorar_mi_envio((select id from envios where cliente_id = current_setting('prueba.cliente')::uuid and estado <> 'entregado' limit 1), 3::smallint, null);
    raise exception 'FALLO 93 · valora un envío sin entregar';
  exception when raise_exception or insufficient_privilege then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
-- Dynamo no cambia la nota del cliente.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  begin
    update envios set valoracion_cliente = 1 where id = current_setting('prueba.e67')::uuid;
    raise exception 'FALLO 93 · Dynamo cambia la nota que puso el cliente';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ begin
  begin
    perform valorar_mi_envio(current_setting('prueba.e67')::uuid, 5::smallint, null);
    raise exception 'FALLO 93 · un transportista se pone nota';
  exception when raise_exception or insufficient_privilege then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare t uuid := (select transportista_id from envios where id = current_setting('prueba.e67')::uuid); begin
  if (select valoracion_cliente from envios where id = current_setting('prueba.e67')::uuid) <> 4
     or (select valoracion_clientes from transportistas where id = t) <> 4 or (select valoracion_clientes_votos from transportistas where id = t) <> 1 then
    raise exception 'FALLO 93 · la nota o la media del cliente no quedan bien';
  end if;
  raise notice 'OK 93 · el cliente puntúa (1-5) su envío entregado y la puede cambiar 30 días; ni Dynamo ni el transportista la tocan';
end $$;

-- ---- 94. Alta online de un transportista nuevo desde el enlace de bolsa -----------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare e uuid; p1 uuid; begin
  insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista)
    values (current_setting('prueba.cliente')::uuid, 13.30, 20, 1000, 800) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'ES');
  update envios set estado = 'programado' where id = e;
  perform set_config('prueba.e94', e::text, false);
  perform set_config('prueba.tok94', (select token_publico::text from envios where id = e), false);
end $$;
set role anon;
do $$ declare r jsonb; res uuid; v jsonb; begin
  r := reservar_envio_publico(current_setting('prueba.tok94')::uuid, '10.9.4.1');
  if r->>'resultado' <> 'reservada' then raise exception 'FALLO 94 · no se reserva la carga: %', r; end if;
  res := (r->>'reserva_id')::uuid;
  perform set_config('prueba.res94', res::text, false);
  -- Con un CIF que ya existe: no duplica.
  v := alta_transportista_publica(res, 'wtransnet', '9494', 'ES', 'B-33333333', '+34600000000');
  if v->>'resultado' <> 'ya_existe' then raise exception 'FALLO 94 · duplica un CIF que ya existe: %', v; end if;
  -- Sin código de bolsa, o con una bolsa que no es del grupo Alpega: no.
  v := alta_transportista_publica(res, 'wtransnet', '  ', 'ES', 'B94949494', '+34600000000');
  if v->>'campo' <> 'codigo_bolsa' then raise exception 'FALLO 94 · admite un alta sin código de bolsa: %', v; end if;
  v := alta_transportista_publica(res, null, '9494', 'ES', 'B94949494', '+34600000000');
  if v->>'campo' <> 'bolsa' then raise exception 'FALLO 94 · admite un alta sin bolsa de carga: %', v; end if;
  v := alta_transportista_publica(res, 'otra', '9494', 'ES', 'B94949494', '+34600000000');
  if v->>'campo' <> 'bolsa' then raise exception 'FALLO 94 · admite una bolsa que no es del grupo Alpega: %', v; end if;
  -- Sin teléfono: no.
  v := alta_transportista_publica(res, 'wtransnet', '9494', 'ES', 'B94949494', 'abc');
  if v->>'campo' <> 'telefono' then raise exception 'FALLO 94 · admite un alta sin teléfono: %', v; end if;
  -- Bien: se da de alta con los cuatro datos y la carga queda pendiente de revisión.
  v := alta_transportista_publica(res, 'wtransnet', '9494', 'ES', 'b94949494', '+34 600 000 094', null, false, '10.9.4.1');
  if v->>'resultado' <> 'alta_pendiente' then raise exception 'FALLO 94 · el alta online no queda pendiente: %', v; end if;
end $$;
reset role;
do $$ declare t record; e record; begin
  select * into t from transportistas where normalizar_id_fiscal(cif) = normalizar_id_fiscal('B94949494');
  if t.estado_operativo <> 'no_ofertar' or not ('alta_online' = any(t.tags)) then
    raise exception 'FALLO 94 · el transportista nuevo queda activo o sin marcar: % %', t.estado_operativo, t.tags;
  end if;
  select * into e from envios where id = current_setting('prueba.e94')::uuid;
  if e.estado_asignacion = 'confirmada' or e.transportista_id is not null then
    raise exception 'FALLO 94 · un desconocido se queda la carga sin revisión de Dynamo';
  end if;
  if (select estado from envio_reservas where id = current_setting('prueba.res94')::uuid) <> 'pendiente_revision' then
    raise exception 'FALLO 94 · la reserva no queda pendiente de revisión';
  end if;
  if not exists (select 1 from contactos where transportista_id = t.id and telefono = '+34600000094' and es_principal) then
    raise exception 'FALLO 94 · no guarda su teléfono';
  end if;
  if t.bolsa <> 'wtransnet' or t.codigo_bolsa <> '9494' or t.cif <> 'B94949494' then
    raise exception 'FALLO 94 · no guarda la bolsa, el código o el CIF: % % %', t.bolsa, t.codigo_bolsa, t.cif;
  end if;
  -- Desde el 2026-11-04 (varias contraofertas a la vez) la carga NO se bloquea mientras
  -- Dynamo revisa el alta: otro puede reservarla (y, si la acepta, se la lleva).
  if (reservar_envio_publico((select token_publico from envios where id = e.id), '10.9.4.2'))->>'resultado' <> 'reservada' then
    raise exception 'FALLO 94 · el alta pendiente sigue bloqueando la carga a los demás';
  end if;
  perform liberar_reserva_publica((select id from envio_reservas where envio_id = e.id and estado = 'viva'), 'prueba');
end $$;
-- Una vez pendiente, la misma reserva no sirve para otra alta.
set role anon;
do $$ declare v jsonb; begin
  v := alta_transportista_publica(current_setting('prueba.res94')::uuid, 'teleroute', '1111', 'ES', 'B94000001', '+34600000001');
  if v->>'resultado' <> 'reserva_caducada' then raise exception 'FALLO 94 · una reserva ya usada da otra alta: %', v; end if;
end $$;
reset role;
-- Dynamo lo aprueba y la carga pasa a ser suya.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare v jsonb; begin
  v := resolver_contraoferta(current_setting('prueba.res94')::uuid, true);
  if v->>'resultado' <> 'aceptada' then raise exception 'FALLO 94 · Dynamo no puede aprobar el alta: %', v; end if;
  raise notice 'OK 94 · alta online: nuevo transportista sin duplicar CIF, sin ofertas, y la carga espera a que Dynamo la apruebe';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 95. Suspensión automática de cuentas ----------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare e uuid; i int; begin
  -- Contador desde cero para el cliente de prueba (como si Dynamo lo acabara de reactivar).
  update usuarios set autosuspension_desde_en = now(), estado = 'activa' where id = current_setting('prueba.u_cli')::uuid;
  perform set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
  for i in 1..5 loop
    -- Carga hoy: cancelar es tardío (pasado el corte de las 9:00 del día hábil anterior) y cuenta.
    insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, fecha_carga_desde)
      values (current_setting('prueba.cliente')::uuid, 13.30, 20, 1000, 800, current_date) returning id into e;
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'ES');
    update envios set estado = 'programado' where id = e;
    if i <= 2 then update envios set estado = 'cancelado' where id = e; end if;   -- 2 de 5 = 40 %
  end loop;
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
-- El cliente no se puede quitar la suspensión automática, ni lanzar el proceso, ni escribir consultas.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin
    update usuarios set exento_autosuspension = true where id = auth.uid();
    raise exception 'FALLO 95 · el usuario se libra solo de la suspensión automática';
  exception when insufficient_privilege then null; end;
  begin
    perform autosuspender_cuentas();
    raise exception 'FALLO 95 · un cliente lanza la suspensión automática';
  exception when insufficient_privilege then null; end;
  begin
    insert into consultas_precio (usuario_id) values (auth.uid());
    raise exception 'FALLO 95 · un cliente escribe consultas de precio a mano';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from autosuspension_candidatos()) then
    raise exception 'FALLO 95 · un cliente ve la lista de cuentas a suspender';
  end if;
end $$;
reset role;
-- El Admin Master lo lanza: el cliente que cancela el 40 % cae, con su motivo.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare n int; u record; begin
  if not exists (select 1 from autosuspension_candidatos() where usuario_id = current_setting('prueba.u_cli')::uuid and motivo like 'Regla 4%') then
    raise exception 'FALLO 95 · no detecta la regla 4 (40 %% de cancelaciones): %', (select array_agg(motivo) from autosuspension_candidatos());
  end if;
  n := autosuspender_cuentas();
  select estado, suspension_motivo, suspendida_en into u from usuarios where id = current_setting('prueba.u_cli')::uuid;
  if n < 1 or u.estado <> 'suspendida' or u.suspension_motivo not like 'Automática · Regla 4%' or u.suspendida_en is null then
    raise exception 'FALLO 95 · no suspende con su motivo: % % %', n, u.estado, u.suspension_motivo;
  end if;
  -- Dynamo lo reactiva a mano: se limpia el motivo y el contador empieza de nuevo.
  update usuarios set estado = 'activa' where id = current_setting('prueba.u_cli')::uuid;
  select estado, suspension_motivo, autosuspension_desde_en into u from usuarios where id = current_setting('prueba.u_cli')::uuid;
  if u.estado <> 'activa' or u.suspension_motivo is not null or u.autosuspension_desde_en is null then
    raise exception 'FALLO 95 · la reactivación no limpia ni reinicia el contador';
  end if;
  if exists (select 1 from autosuspension_candidatos() where usuario_id = current_setting('prueba.u_cli')::uuid) then
    raise exception 'FALLO 95 · al reactivar, al día siguiente volvería a caer por lo de antes';
  end if;
  raise notice 'OK 95 · suspensión automática: reglas por parámetro, solo usuario, motivo guardado, reactivar reinicia el contador; el cliente no la toca';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 96. Usuarios: copia de avisos, tiempo conectado y métricas -----------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare n int; begin
  perform latido(); perform latido(); perform latido();   -- seguidos: solo cuenta uno
  select minutos into n from conexion_minutos where usuario_id = auth.uid();
  if n <> 5 then raise exception 'FALLO 96 · el tiempo conectado se infla llamando seguido: % min', n; end if;
  begin
    update conexion_minutos set minutos = 999 where usuario_id = auth.uid();
    if found then raise exception 'FALLO 96 · el usuario se apunta minutos a mano'; end if;
  exception when insufficient_privilege then null; end;
  if exists (select 1 from metricas_usuarios()) then raise exception 'FALLO 96 · un cliente ve las métricas de los usuarios'; end if;
end $$;
reset role;
do $$ begin
  begin
    update usuarios set emails_copia_avisos = array['bien@empresa.com', 'mal email'] where id = current_setting('prueba.u_cli')::uuid;
    raise exception 'FALLO 96 · admite un email de copia que no vale';
  exception when check_violation then null; end;
  update usuarios set emails_copia_avisos = array['logistica@empresa.com'] where id = current_setting('prueba.u_cli')::uuid;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  if not exists (select 1 from metricas_usuarios() where id = current_setting('prueba.u_cli')::uuid and consultas >= 0 and ultimo_latido is not null) then
    raise exception 'FALLO 96 · Dynamo no ve las métricas del usuario';
  end if;
  raise notice 'OK 96 · usuarios: copias de avisos validadas, tiempo conectado sin poder inflarlo, métricas solo para Dynamo';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 97. Tablón de otras cargas disponibles (página pública) --------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare a uuid; b uuid; c uuid; i int; e uuid; begin
  for i in 1..3 loop
    insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, fecha_carga_desde)
      values (current_setting('prueba.cliente')::uuid, 13.30, 20, 1000, 800, current_date + 3) returning id into e;
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, provincia, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'Sevilla', 'ES');
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, provincia, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'Madrid', 'ES');
    update envios set estado = 'programado' where id = e;
    if i = 1 then a := e; elsif i = 2 then b := e; else c := e; end if;
  end loop;
  update envios set publicado_en_bolsa_en = now() where id in (a, c);   -- b NO está en bolsa
  perform set_config('prueba.e97a', a::text, false); perform set_config('prueba.e97b', b::text, false);
  perform set_config('prueba.tok97b', (select token_publico::text from envios where id = b), false);
  perform set_config('prueba.tok97a', (select token_publico::text from envios where id = a), false);
end $$;
set role anon;
do $$ declare l jsonb; begin
  if otras_cargas_publicas(gen_random_uuid()) <> '[]'::jsonb then
    raise exception 'FALLO 97 · el tablón se ve sin un enlace válido';
  end if;
  l := otras_cargas_publicas(current_setting('prueba.tok97b')::uuid);
  if not exists (select 1 from jsonb_array_elements(l) x where x->>'token' = current_setting('prueba.tok97a')) then
    raise exception 'FALLO 97 · no sale una carga publicada en bolsa: %', l;
  end if;
  if exists (select 1 from jsonb_array_elements(l) x where x->>'token' = current_setting('prueba.tok97b')) then
    raise exception 'FALLO 97 · sale la propia carga (o una que no está en bolsa)';
  end if;
  if l::text ~* '(cliente|nombre_empresa|direccion|telefono|importe_cliente)' then
    raise exception 'FALLO 97 · el tablón deja ver datos del cliente o del sitio';
  end if;
  raise notice 'OK 97 · tablón de cargas: solo con enlace válido, solo publicadas en bolsa y libres, sin datos del cliente';
end $$;
reset role;

-- ---- 98. Fecha de carga pasada: solo el Admin Master -----------------------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_emp84'), false);
set role authenticated;
do $$ begin
  begin
    update envios set fecha_carga_desde = current_date - 30 where id = current_setting('prueba.e97a')::uuid;
    raise exception 'FALLO 98 · un empleado pone una fecha de carga pasada';
  exception when insufficient_privilege then null; end;
  -- Tocar otra cosa de un envío sí puede, aunque su fecha ya haya pasado.
  update envios set referencia_cliente = 'REF-98' where id = current_setting('prueba.e97a')::uuid;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  update envios set fecha_carga_desde = current_date - 180, fecha_carga_hasta = current_date - 180 where id = current_setting('prueba.e97a')::uuid;
  if (select fecha_carga_desde from envios where id = current_setting('prueba.e97a')::uuid) <> current_date - 180 then
    raise exception 'FALLO 98 · el Admin Master no puede poner una fecha pasada';
  end if;
  raise notice 'OK 98 · fecha de carga pasada: solo el Admin Master (también impuesto en la base de datos)';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 99. Suspensión al momento (consultas y cancelaciones) ----------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare e uuid; i int; begin
  update usuarios set estado = 'activa' where id = current_setting('prueba.u_cli')::uuid and estado <> 'activa';
  update usuarios set autosuspension_desde_en = now(), limite_consultas_precio_diario = null where id = current_setting('prueba.u_cli')::uuid;
  perform set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
  for i in 1..3 loop
    insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, fecha_carga_desde)
      values (current_setting('prueba.cliente')::uuid, 13.30, 20, 1000, 800, current_date) returning id into e;
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'ES');
    update envios set estado = 'programado' where id = e;
    perform set_config('prueba.e99_' || i, e::text, false);
  end loop;
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
-- El cliente cancela él mismo: a la 3.ª en pocos días (regla 5) queda suspendido EN ESE MOMENTO.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  perform cancelar_mi_envio(current_setting('prueba.e99_1')::uuid);
  perform cancelar_mi_envio(current_setting('prueba.e99_2')::uuid);
  if (select estado from usuarios where id = auth.uid()) <> 'activa' then
    raise exception 'FALLO 99 · suspende antes de pasar el límite';
  end if;
  perform cancelar_mi_envio(current_setting('prueba.e99_3')::uuid);
end $$;
reset role;
do $$ declare u record; begin
  select estado, suspension_motivo into u from usuarios where id = current_setting('prueba.u_cli')::uuid;
  if u.estado <> 'suspendida' or u.suspension_motivo not like 'Automática (al momento) · Regla 5%' then
    raise exception 'FALLO 99 · la 3.ª cancelación no suspende al momento: % %', u.estado, u.suspension_motivo;
  end if;
  if (select estado from envios where id = current_setting('prueba.e99_3')::uuid) <> 'cancelado' then
    raise exception 'FALLO 99 · la cancelación que pasa del límite no se hace';
  end if;
  -- Reactivado: ahora 16 consultas de precio en un día (máximo 15) → al momento, regla 3.
  update usuarios set estado = 'activa' where id = current_setting('prueba.u_cli')::uuid;
  for i in 1..15 loop insert into consultas_precio (usuario_id, cliente_id) values (current_setting('prueba.u_cli')::uuid, current_setting('prueba.cliente')::uuid); end loop;
  if (select estado from usuarios where id = current_setting('prueba.u_cli')::uuid) <> 'activa' then
    raise exception 'FALLO 99 · suspende con 15 consultas (el máximo es «más de 15»)';
  end if;
  insert into consultas_precio (usuario_id, cliente_id) values (current_setting('prueba.u_cli')::uuid, current_setting('prueba.cliente')::uuid);
  select estado, suspension_motivo into u from usuarios where id = current_setting('prueba.u_cli')::uuid;
  if u.estado <> 'suspendida' or u.suspension_motivo not like 'Automática (al momento) · Regla 3%' then
    raise exception 'FALLO 99 · la consulta 16 no suspende al momento: % %', u.estado, u.suspension_motivo;
  end if;
  -- Con el interruptor apagado no suspende a nadie.
  update usuarios set estado = 'activa' where id = current_setting('prueba.u_cli')::uuid;
  update parametros set valor = 'false' where clave = 'autosuspension_activa';
  insert into consultas_precio (usuario_id, cliente_id) values (current_setting('prueba.u_cli')::uuid, current_setting('prueba.cliente')::uuid);
  if (select estado from usuarios where id = current_setting('prueba.u_cli')::uuid) <> 'activa' then
    raise exception 'FALLO 99 · suspende con el interruptor general apagado';
  end if;
  update parametros set valor = 'true' where clave = 'autosuspension_activa';
  update usuarios set autosuspension_desde_en = now() where id = current_setting('prueba.u_cli')::uuid;
  raise notice 'OK 99 · suspensión al momento: la cancelación o consulta que pasa del límite se hace y la cuenta cae en ese instante; con el interruptor apagado, nada';
end $$;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 100. Previo pago de envíos -------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
update parametros set valor = 'true' where clave = 'pago_previo_activo';
do $$ declare c uuid; e uuid; e2 uuid; e3 uuid; t uuid := current_setting('prueba.transp')::uuid; r jsonb; begin
  -- Cliente nuevo SIN crédito (sin clasificar): su envío nace pendiente de pago.
  insert into clientes (razon_social, cif) values ('Sin Credito SL', 'B10010010') returning id into c;
  insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista)
    values (c, 13.30, 20, 1000, 800) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'ES');
  update envios set estado = 'programado' where id = e;
  if (select estado_pago_previo from envios where id = e) <> 'pendiente' then
    raise exception 'FALLO 100 · el envío de un cliente sin crédito no queda pendiente de pago: % %', (select estado_pago_previo from envios where id = e), (select pago_motivo from envios where id = e);
  end if;
  -- Pendiente de pago: ni transportista, ni oferta, ni bolsa.
  begin update envios set transportista_id = t where id = e; raise exception 'FALLO 100 · se asigna transportista sin pagar';
  exception when insufficient_privilege then null; end;
  begin insert into envio_ofertas (envio_id, precio_ofertado) values (e, 800); raise exception 'FALLO 100 · se oferta sin pagar';
  exception when insufficient_privilege then null; end;
  begin update envios set publicado_en_bolsa_en = now() where id = e; raise exception 'FALLO 100 · se publica en bolsa sin pagar';
  exception when insufficient_privilege then null; end;
  perform set_config('prueba.e100', e::text, false);
  perform set_config('prueba.c100', c::text, false);

  -- Cliente CON crédito: un primer envío SIN PAGAR no libra al segundo (truco: confirmar
  -- uno de relleno, no pagarlo y cancelarlo después; revisión de seguridad 2026-11-04).
  update clientes set riesgo_cesce_euros = 5000 where id = c;
  insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista)
    values (c, 13.30, 20, 500, 400) returning id into e2;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e2, 1, 'carga', '41001', 'Sevilla', 'ES');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e2, 2, 'descarga', '28001', 'Madrid', 'ES');
  update envios set estado = 'programado' where id = e2;
  if (select estado_pago_previo from envios where id = e2) <> 'pendiente' then
    raise exception 'FALLO 100 · un primer envío sin pagar libra del pago previo al segundo';
  end if;
  -- Pagado ese, el siguiente ya no pide pago previo.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  update envios set estado_pago_previo = 'pagado', pago_metodo = 'transferencia', pagado_en = now() where id = e2;
  perform set_config('request.jwt.claim.role', '', true);
  insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista)
    values (c, 13.30, 20, 500, 400) returning id into e3;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e3, 1, 'carga', '41001', 'Sevilla', 'ES');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e3, 2, 'descarga', '28001', 'Madrid', 'ES');
  update envios set estado = 'programado' where id = e3;
  if (select estado_pago_previo from envios where id = e3) <> 'no_requerido' then
    raise exception 'FALLO 100 · con crédito y el primero pagado, el segundo pide pago previo';
  end if;
end $$;
-- Empresa conocida (casilla de su ficha): con crédito, su primer envío no pide pago previo;
-- sin crédito, la casilla no la libra.
do $$ declare c uuid; e uuid; i int; begin
  for i in 1..2 loop
    insert into clientes (razon_social, cif, exento_pago_previo_primer_envio, riesgo_cesce_euros)
      values ('Conocida ' || i, 'B1002002' || i, true, case when i = 1 then 9000 end) returning id into c;
    insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista)
      values (c, 13.30, 20, 500, 400) returning id into e;
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'ES');
    update envios set estado = 'programado' where id = e;
    if i = 1 and (select estado_pago_previo from envios where id = e) <> 'no_requerido' then raise exception 'FALLO 100 · la casilla de empresa conocida no libra del primer envío'; end if;
    if i = 2 and (select estado_pago_previo from envios where id = e) <> 'pendiente' then raise exception 'FALLO 100 · la casilla libra a un cliente sin crédito'; end if;
  end loop;
end $$;
-- Un cliente no marca su pago; Stripe solo lo confirma el servidor.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin perform marcar_pago_envio(current_setting('prueba.e100')::uuid, 'transferencia'); raise exception 'FALLO 100 · un cliente marca un pago';
  exception when insufficient_privilege then null; end;
  begin perform pago_envio_stripe(current_setting('prueba.e100')::uuid, 'pi_x', 121000); raise exception 'FALLO 100 · un cliente confirma un pago con tarjeta';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from pagos_envio(current_setting('prueba.e100')::uuid)) then
    raise exception 'FALLO 100 · un cliente ve el pago de un envío de otro cliente';
  end if;
end $$;
reset role;
-- Dynamo: deshacer/exento con motivo/transferencia; Stripe con el importe exacto.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare e uuid := current_setting('prueba.e100')::uuid; r jsonb; begin
  if (select total from pagos_envio(e)) <> 1210 then raise exception 'FALLO 100 · el total con IVA no es 1.210 €: %', (select total from pagos_envio(e)); end if;
  if (marcar_pago_envio(e, 'exento'))->>'resultado' <> 'falta_motivo' then raise exception 'FALLO 100 · pasa sin pago previo sin motivo'; end if;
  if (marcar_pago_envio(e, 'exento', 'CESCE positivo, empresa conocida'))->>'resultado' <> 'ok' then raise exception 'FALLO 100 · no pasa sin pago previo'; end if;
  update envios set transportista_id = current_setting('prueba.transp')::uuid where id = e;   -- ya se puede asignar
  if (marcar_pago_envio(e, 'deshacer'))->>'resultado' <> 'ya_ofertado' then raise exception 'FALLO 100 · deshace con transportista asignado'; end if;
  update envios set transportista_id = null where id = e;
  if (marcar_pago_envio(e, 'deshacer'))->>'resultado' <> 'ok' then raise exception 'FALLO 100 · no deshace'; end if;
  if (marcar_pago_envio(e, 'transferencia'))->>'resultado' <> 'ok' or (select pago_metodo from envios where id = e) <> 'transferencia' then
    raise exception 'FALLO 100 · no marca la transferencia';
  end if;
  perform marcar_pago_envio(e, 'deshacer');
end $$;
reset role;
do $$ declare e uuid := current_setting('prueba.e100')::uuid; begin
  if (pago_envio_stripe(e, 'pi_1', 100))->>'resultado' <> 'importe_distinto' then raise exception 'FALLO 100 · Stripe acepta un importe que no es el total'; end if;
  if (pago_envio_stripe(e, 'pi_1', 121000))->>'resultado' <> 'ok' then raise exception 'FALLO 100 · Stripe no marca pagado'; end if;
  if (pago_envio_stripe(e, 'pi_1', 121000))->>'resultado' <> 'ya_registrado' then raise exception 'FALLO 100 · el aviso repetido de Stripe no se reconoce'; end if;
  raise notice 'OK 100 · previo pago: sin crédito o primer envío nace pendiente, no se oferta ni asigna; Dynamo lo marca (transferencia o sin pago previo con motivo) y Stripe solo con el importe exacto';
end $$;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 101. Contraoferta del cliente -----------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
update parametros set valor = 'false' where clave = 'pago_previo_activo';
update usuarios set estado = 'activa', exento_autosuspension = true where id = current_setting('prueba.u_cli')::uuid;
do $$ declare e uuid; i int; begin
  update clientes set permite_contraoferta = false where id = current_setting('prueba.cliente')::uuid;
  for i in 1..3 loop
    insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
      values (current_setting('prueba.cliente')::uuid, 13.30, 20, 1000, 800, current_date + 5, current_date + 6) returning id into e;
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'ES');
    update envios set estado_solicitud = 'precio_propuesto', precio_caduca_en = now() + interval '2 hours' where id = e;
    perform set_config('prueba.e101_' || i, e::text, false);
  end loop;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if (contraofertar_precio_solicitud(current_setting('prueba.e101_1')::uuid, 980))->>'resultado' <> 'no_permitida' then
    raise exception 'FALLO 101 · contraoferta un cliente que no la tiene permitida';
  end if;
  begin
    update envios set importe_contraoferta_cliente = 1 where id = current_setting('prueba.e101_1')::uuid;
    if found then raise exception 'FALLO 101 · el cliente escribe su contraoferta a mano'; end if;
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update clientes set permite_contraoferta = true where id = current_setting('prueba.cliente')::uuid;
set role authenticated;
do $$ declare r jsonb; begin
  -- 2 % de rebaja (auto 5 %): aceptada al instante a su precio.
  r := contraofertar_precio_solicitud(current_setting('prueba.e101_1')::uuid, 980);
  if r->>'resultado' <> 'aceptada' then raise exception 'FALLO 101 · una rebaja pequeña no se acepta sola: %', r; end if;
  -- 10 %: a revisión de Dynamo.
  r := contraofertar_precio_solicitud(current_setting('prueba.e101_2')::uuid, 900);
  if r->>'resultado' <> 'pendiente_revision' then raise exception 'FALLO 101 · una rebaja media no va a revisión: %', r; end if;
  -- 20 % (máximo 15 %): no se admite. Ni subir el precio.
  if (contraofertar_precio_solicitud(current_setting('prueba.e101_3')::uuid, 800))->>'resultado' <> 'demasiado_lejos' then raise exception 'FALLO 101 · admite una rebaja por encima del máximo'; end if;
  if (contraofertar_precio_solicitud(current_setting('prueba.e101_3')::uuid, 1100))->>'resultado' <> 'no_es_rebaja' then raise exception 'FALLO 101 · admite una «contraoferta» al alza'; end if;
  begin perform resolver_contraoferta_cliente(current_setting('prueba.e101_2')::uuid, true); raise exception 'FALLO 101 · el cliente aprueba su propia contraoferta';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select (estado, importe_cliente, importe_cliente_inicial)::text from envios where id = current_setting('prueba.e101_1')::uuid) <> '(programado,980.00,1000.00)' then
    raise exception 'FALLO 101 · la aceptada al instante no queda confirmada a su precio: %', (select (estado, importe_cliente, importe_cliente_inicial)::text from envios where id = current_setting('prueba.e101_1')::uuid);
  end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  if (resolver_contraoferta_cliente(current_setting('prueba.e101_2')::uuid, true))->>'resultado' <> 'ok' then raise exception 'FALLO 101 · Dynamo no aprueba'; end if;
  if (select (estado, importe_cliente)::text from envios where id = current_setting('prueba.e101_2')::uuid) <> '(programado,900.00)' then
    raise exception 'FALLO 101 · aprobada no queda confirmada a 900';
  end if;
  raise notice 'OK 101 · contraoferta del cliente: solo si la tiene permitida, solo a la baja; poca rebaja se acepta sola, media la revisa Dynamo, mucha no se admite';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 102. Estado de la cuenta: ni la propia, ni un Admin Master, ni volver a pendiente --
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  begin update usuarios set estado = 'suspendida' where id = auth.uid(); raise exception 'FALLO 102 · el Admin Master se suspende a sí mismo';
  exception when insufficient_privilege then null; end;
  begin update usuarios set estado = 'pendiente_verificacion' where id = current_setting('prueba.u_cli')::uuid; raise exception 'FALLO 102 · una cuenta vuelve a pendiente de verificación';
  exception when insufficient_privilege then null; end;
  update usuarios set estado = 'suspendida' where id = current_setting('prueba.u_cli')::uuid;   -- a otro, sí
  update usuarios set estado = 'activa' where id = current_setting('prueba.u_cli')::uuid;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_emp84'), false);
set role authenticated;
do $$ begin
  begin update usuarios set estado = 'suspendida' where id = current_setting('prueba.u_admin')::uuid; raise exception 'FALLO 102 · un empleado suspende al Admin Master';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 102 · estado de la cuenta: nadie cambia el suyo, el Admin Master solo desde Supabase, y no se vuelve a pendiente';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 103. Contraoferta del cliente: interruptor general + el de su ficha ----------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
update parametros set valor = 'false' where clave = 'contraoferta_cliente_activa';
update clientes set permite_contraoferta = true where id = current_setting('prueba.cliente')::uuid;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if (select permitida from mi_contraoferta(current_setting('prueba.e101_3')::uuid)) then
    raise exception 'FALLO 103 · con el general apagado, el cliente ve la contraoferta';
  end if;
  if (contraofertar_precio_solicitud(current_setting('prueba.e101_3')::uuid, 990))->>'resultado' <> 'no_permitida' then
    raise exception 'FALLO 103 · con el general apagado, el cliente contraoferta';
  end if;
end $$;
reset role;
update parametros set valor = 'true' where clave = 'contraoferta_cliente_activa';
set role authenticated;
do $$ begin
  if not (select permitida from mi_contraoferta(current_setting('prueba.e101_3')::uuid)) then
    raise exception 'FALLO 103 · con los dos encendidos, no la ve';
  end if;
  raise notice 'OK 103 · contraoferta del cliente: solo con el interruptor general Y el de su ficha encendidos';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 104. Negociación del transportista: interruptor y requisitos ----------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
update parametros set valor = 'false' where clave = 'pago_previo_activo';
do $$ declare c uuid := current_setting('prueba.cliente')::uuid; t uuid := current_setting('prueba.transp')::uuid;
              e uuid; o uuid; r jsonb; tok uuid; begin
  update parametros set valor = '45' where clave = 'negociacion_min_creada_min';
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
    values (c, 6, 600, 500, current_date + 1, current_date + 1) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 1, 'carga', '41001', 'Sevilla');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 2, 'descarga', '46001', 'Valencia');
  update envios set estado = 'programado' where id = e;
  o := ofertar_envio(e, t, 'email', 500, 30::smallint);
  select token into tok from envio_ofertas where id = o;
  -- Recién creada (menos de 45 min): ni se enseña ni se admite otro precio; al ofertado, sí.
  if negociacion_publica(tok) then raise exception 'FALLO 104 · enseña la negociación de una carga recién creada'; end if;
  r := reservar_envio_publico(tok);
  begin
    r := aceptar_reserva((r->>'reserva_id')::uuid, t, null, 520);
    raise exception 'FALLO 104 · admite otro precio en una carga recién creada: %', r;
  exception when insufficient_privilege then null; end;
  -- Con más de 45 min creada pero cargando dentro de 5 días y máximo 48 h: tampoco.
  update parametros set valor = '0' where clave = 'negociacion_min_creada_min';
  update parametros set valor = '48' where clave = 'negociacion_max_horas_carga';
  update envios set fecha_carga_desde = current_date + 5, fecha_carga_hasta = current_date + 5 where id = e;
  if negociacion_publica(tok) then raise exception 'FALLO 104 · enseña la negociación faltando más de 48 h'; end if;
  -- Carga para mañana: sí. Y con el interruptor general apagado, no.
  update envios set fecha_carga_desde = current_date + 1, fecha_carga_hasta = current_date + 1 where id = e;
  if not negociacion_publica(tok) then raise exception 'FALLO 104 · no deja negociar una carga urgente sin requisitos pendientes'; end if;
  update parametros set valor = 'false' where clave = 'contraoferta_transportista_activa';
  if negociacion_publica(tok) then raise exception 'FALLO 104 · negocia con el interruptor general apagado'; end if;
  update parametros set valor = 'true' where clave = 'contraoferta_transportista_activa';
  update parametros set valor = '0' where clave = 'negociacion_max_horas_carga';
  raise notice 'OK 104 · negociación del transportista: interruptor general y requisitos (minutos creada, minutos en bolsa, horas para cargar)';
end $$;

-- ---- 105. CESCE - Riesgos: manual 0 = manda CESCE; asumido sin lo prepagado; solo Dynamo --
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare c uuid; e uuid; begin
  insert into clientes (razon_social, cif, riesgo_cesce_euros, riesgo_manual_euros) values ('Riesgo SL', 'B10030030', 10000, 0) returning id into c;
  if (select riesgo_efectivo_euros from clientes where id = c) <> 10000 then raise exception 'FALLO 105 · con manual 0 no manda CESCE'; end if;
  update clientes set riesgo_manual_euros = 3000 where id = c;
  if (select riesgo_efectivo_euros from clientes where id = c) <> 3000 then raise exception 'FALLO 105 · con manual distinto de 0 no manda el manual'; end if;
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde)
    values (c, 6, 1000, 800, current_date - 5) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 1, 'carga', '41001', 'Sevilla');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 2, 'descarga', '46001', 'Valencia');
  update envios set estado = 'programado' where id = e;
  perform set_config('prueba.c105', c::text, false);
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare r record; begin
  select * into r from riesgos_clientes() where cliente_id = current_setting('prueba.c105')::uuid;
  if r.asumido <> 1210 or r.disponible <> 1790 or r.manda <> 'manual' then
    raise exception 'FALLO 105 · riesgo asumido/disponible mal: % % %', r.asumido, r.disponible, r.manda;
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if exists (select 1 from riesgos_clientes()) then raise exception 'FALLO 105 · un cliente ve los riesgos'; end if;
  raise notice 'OK 105 · CESCE - Riesgos: manual 0 = manda CESCE, manual ≠ 0 limita; asumido 60 días con IVA sin lo prepagado; solo Dynamo';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 106. Visibilidad por empresa y contacto del conductor al terminar -----------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare u2 uuid := gen_random_uuid(); e uuid; begin
  insert into auth.users (id, email) values (u2, 'companero@cliente.test');
  update usuarios set rol = 'cliente', estado = 'activa', cliente_id = current_setting('prueba.cliente')::uuid where id = u2;
  perform set_config('prueba.u_cli2', u2::text, false);
  -- Envío creado por el primer usuario, con conductor, entrega prevista hace 3 días.
  perform set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde, fecha_entrega_estimada, conductor_nombre, conductor_telefono)
    values (current_setting('prueba.cliente')::uuid, 6, 600, 500, current_date - 4, current_date - 3, 'Pepe Conductor', '+34600111222') returning id into e;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('prueba.e106', e::text, false);
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli2'), false);
set role authenticated;
do $$ declare r record; begin
  select * into r from mis_envios() where id = current_setting('prueba.e106')::uuid;
  if r.id is null then raise exception 'FALLO 106 · un compañero de la misma empresa no ve el envío del otro'; end if;
  if r.conductor_telefono is not null then raise exception 'FALLO 106 · pasadas las horas tras la entrega prevista, el cliente sigue viendo el teléfono del conductor'; end if;
end $$;
reset role;
update envios set fecha_entrega_estimada = current_date + 2 where id = current_setting('prueba.e106')::uuid;
set role authenticated;
do $$ begin
  if (select conductor_telefono from mis_envios() where id = current_setting('prueba.e106')::uuid) is null then
    raise exception 'FALLO 106 · antes de la entrega prevista no ve el teléfono del conductor';
  end if;
  raise notice 'OK 106 · los usuarios de una empresa ven todos sus envíos; el contacto del conductor se oculta al entregar/cancelar o X horas tras la entrega prevista';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 107. Negociación: requisitos extra del transportista -----------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare c uuid := current_setting('prueba.cliente')::uuid; t uuid := current_setting('prueba.transp')::uuid; e uuid; o uuid; r jsonb; begin
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
    values (c, 6, 600, 500, current_date + 1, current_date + 1) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 1, 'carga', '41001', 'Sevilla');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 2, 'descarga', '46001', 'Valencia');
  update envios set estado = 'programado' where id = e;
  o := ofertar_envio(e, t, 'email', 500, 30::smallint);
  -- Mínimo de 999 cargas hechas: con la oferta personal ya se sabe quién es → no se enseña.
  update parametros set valor = '999' where clave = 'negociacion_min_cargas_hechas';
  if negociacion_publica((select token from envio_ofertas where id = o)) then raise exception 'FALLO 107 · negocia un transportista sin las cargas mínimas'; end if;
  r := reservar_envio_publico((select token from envio_ofertas where id = o));
  begin r := aceptar_reserva((r->>'reserva_id')::uuid, t, null, 580); raise exception 'FALLO 107 · admite la contraoferta sin las cargas mínimas';
  exception when insufficient_privilege then null; end;
  update parametros set valor = '0' where clave = 'negociacion_min_cargas_hechas';
  -- Una por carga: la primera va a revisión y se rechaza; la segunda ya no.
  update parametros set valor = 'true' where clave = 'negociacion_una_por_carga';
  r := aceptar_reserva((select id from envio_reservas where envio_id = e and estado = 'viva' limit 1), t, null, 600);
  if r->>'resultado' <> 'pendiente_revision' then raise exception 'FALLO 107 · la primera contraoferta no va a revisión: %', r; end if;
  perform resolver_contraoferta((select id from envio_reservas where envio_id = e and estado = 'pendiente_revision'), false);
  if negociacion_publica((select token from envio_ofertas where id = o)) then raise exception 'FALLO 107 · deja una segunda contraoferta con «una por carga»'; end if;
  update parametros set valor = 'false' where clave = 'negociacion_una_por_carga';
  if not negociacion_publica((select token from envio_ofertas where id = o)) then raise exception 'FALLO 107 · con los requisitos apagados no deja negociar'; end if;
  raise notice 'OK 107 · negociación: cargas mínimas y una por carga (apagados por defecto)';
end $$;

-- ---- 108. Cambios en un envío: el cliente los pide; sin camión y solo fechas, al momento --
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare e uuid; f uuid; begin
  perform set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
    values (current_setting('prueba.cliente')::uuid, 6, 600, 500, current_date + 4, current_date + 5) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 1, 'carga', '41001', 'Sevilla');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 2, 'descarga', '46001', 'Valencia');
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
    values (current_setting('prueba.cliente')::uuid, 6, 600, 500, current_date + 4, current_date + 5) returning id into f;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (f, 1, 'carga', '41001', 'Sevilla');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (f, 2, 'descarga', '46001', 'Valencia');
  perform set_config('request.jwt.claim.sub', '', false);
  update envios set estado = 'programado' where id in (e, f);
  update envios set transportista_id = current_setting('prueba.transp')::uuid where id = f;   -- f, con camión
  perform set_config('prueba.e108', e::text, false); perform set_config('prueba.f108', f::text, false);
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if (pedir_cambio_envio(current_setting('prueba.e108')::uuid, current_date + 7, current_date + 8))->>'resultado' <> 'aplicado' then
    raise exception 'FALLO 108 · sin camión y solo fechas no se aplica al momento';
  end if;
  -- Con camión no se modifica desde la plataforma: hay que llamar (migración cambio_con_camion_llamar).
  if (pedir_cambio_envio(current_setting('prueba.f108')::uuid, current_date + 7, current_date + 8))->>'resultado' <> 'con_camion' then
    raise exception 'FALLO 108 · con camión deja pedir el cambio en vez de mandar a llamar';
  end if;
  if (select estado_cambio_cliente from envios where id = current_setting('prueba.f108')::uuid) is not null then
    raise exception 'FALLO 108 · con camión el cambio queda guardado';
  end if;
  -- Sin camión y pidiendo algo más que fechas: pendiente para Dynamo; no admite un segundo.
  if (pedir_cambio_envio(current_setting('prueba.e108')::uuid, null, null, 'Descarga en Getafe'))->>'resultado' <> 'pendiente' then
    raise exception 'FALLO 108 · sin camión, un cambio de ruta no queda pendiente';
  end if;
  if (pedir_cambio_envio(current_setting('prueba.e108')::uuid, current_date + 9, null))->>'resultado' <> 'ya_pendiente' then
    raise exception 'FALLO 108 · admite un segundo cambio con uno pendiente';
  end if;
  begin
    update envios set estado_cambio_cliente = 'aceptado' where id = current_setting('prueba.e108')::uuid;
    if found then raise exception 'FALLO 108 · el cliente acepta su propio cambio'; end if;
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select fecha_carga_desde from envios where id = current_setting('prueba.e108')::uuid) <> current_date + 7 then
    raise exception 'FALLO 108 · las fechas no se han cambiado';
  end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  if (resolver_cambio_envio(current_setting('prueba.e108')::uuid, true, 'Hecho'))->>'resultado' <> 'ok' then
    raise exception 'FALLO 108 · Dynamo no puede aceptar el cambio';
  end if;
  if (select estado_cambio_cliente from envios where id = current_setting('prueba.e108')::uuid) <> 'aceptado' then
    raise exception 'FALLO 108 · Dynamo acepta y no queda aceptado';
  end if;
end $$;
reset role;
-- Revisar precio: se enciende al cambiar la ruta (el hito lo pone cambiar_ruta_envio) y se
-- apaga cuando Dynamo toca el precio.
select registrar_hito(current_setting('prueba.f108')::uuid, 'ruta_cambiada', null, null, '{}'::jsonb);
set role authenticated;
do $$ begin
  if not (select requiere_revision_precio from envios where id = current_setting('prueba.f108')::uuid) then raise exception 'FALLO 108 · cambiar la ruta no pide revisar el precio'; end if;
  update envios set importe_cliente = 650 where id = current_setting('prueba.f108')::uuid;
  if (select requiere_revision_precio from envios where id = current_setting('prueba.f108')::uuid) then raise exception 'FALLO 108 · tocar el precio no apaga «revisar precio»'; end if;
  raise notice 'OK 108 · cambios: sin camión y solo fechas, al momento; sin camión y otra cosa, pendiente para Dynamo; con camión, no (a llamar); cambiar la ruta pide revisar el precio';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 109. Siniestro: entra siempre con prioridad crítica ------------------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare i uuid; begin
  insert into incidencias (tipo_id, envio_id, titulo, detalle, prioridad)
    values ((select id from tipos_incidencia where clave = 'siniestro'), current_setting('prueba.e108')::uuid,
            'Faltan 3 palés', 'Al llegar a descargar faltan 3 palés', 'baja') returning id into i;
  if (select prioridad from incidencias where id = i) <> 'critica' then
    raise exception 'FALLO 109 · un siniestro no entra como crítico';
  end if;
  raise notice 'OK 109 · siniestro (daño, rotura o faltante): tipo propio y siempre prioridad crítica';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 110. Reservas en el CMR: abren un siniestro crítico; solo con enlace válido -------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare tok uuid; begin
  insert into cmr_enlaces (envio_id) values (current_setting('prueba.e108')::uuid) returning token into tok;
  perform set_config('prueba.tok110', tok::text, false);
  perform set_config('prueba.par110', (select id::text from envio_paradas where envio_id = current_setting('prueba.e108')::uuid and tipo = 'descarga' limit 1), false);
  perform set_config('prueba.car110', (select id::text from envio_paradas where envio_id = current_setting('prueba.e108')::uuid and tipo = 'carga' limit 1), false);
end $$;
set role anon;
do $$ declare r jsonb; begin
  if (anotar_reservas_cmr_publico(gen_random_uuid(), null, 'destinatario', 'Faltan dos palés'))->>'resultado' <> 'enlace_no_valido' then
    raise exception 'FALLO 110 · se anotan reservas sin un enlace válido';
  end if;
  -- La casilla tiene que existir y ser la suya (como al firmar).
  if (anotar_reservas_cmr_publico(current_setting('prueba.tok110')::uuid, gen_random_uuid(), 'destinatario', 'Faltan dos palés'))->>'resultado' <> 'parada_no_valida'
     or (anotar_reservas_cmr_publico(current_setting('prueba.tok110')::uuid, current_setting('prueba.car110')::uuid, 'destinatario', 'Faltan dos palés'))->>'resultado' <> 'parada_no_valida'
     or (anotar_reservas_cmr_publico(current_setting('prueba.tok110')::uuid, current_setting('prueba.par110')::uuid, 'remitente', 'Faltan dos palés'))->>'resultado' <> 'parada_no_valida' then
    raise exception 'FALLO 110 · se anotan reservas en una casilla inventada o de otro';
  end if;
  r := anotar_reservas_cmr_publico(current_setting('prueba.tok110')::uuid, current_setting('prueba.par110')::uuid, 'destinatario', 'Faltan dos palés y uno llega roto');
  if r->>'resultado' <> 'ok' then raise exception 'FALLO 110 · no anota las reservas: %', r; end if;
  if not exists (select 1 from reservas_cmr_publico(current_setting('prueba.tok110')::uuid)) then raise exception 'FALLO 110 · no se ven en la página del CMR'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from incidencias i join tipos_incidencia t on t.id = i.tipo_id
                  where i.envio_id = current_setting('prueba.e108')::uuid and t.clave = 'siniestro' and i.prioridad = 'critica' and i.titulo like 'Reservas en el CMR%') then
    raise exception 'FALLO 110 · las reservas no abren un siniestro crítico';
  end if;
  raise notice 'OK 110 · reservas en el CMR: solo con enlace válido, se ven en la página y abren un siniestro crítico para Dynamo';
end $$;

-- ---- 111. Historial: quién hizo qué y cuándo, para Dynamo y para el cliente dueño -------
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
update envios set importe_transportista = 777, referencia_cliente = 'REF-111' where id = current_setting('prueba.e106')::uuid;
do $$ begin
  if not exists (select 1 from historial_registro('envios', current_setting('prueba.e106')::uuid) where 'importe_transportista' = any (campos)) then
    raise exception 'FALLO 111 · Dynamo no ve en el historial el cambio del precio del transportista';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli2'), false);
set role authenticated;
do $$ declare r record; begin
  if not exists (select 1 from historial_registro('envios', current_setting('prueba.e106')::uuid) where accion = 'alta' and quien_email = 'compras@cliente.prueba') then
    raise exception 'FALLO 111 · el compañero no ve quién creó el envío';
  end if;
  if exists (select 1 from historial_registro('envios', current_setting('prueba.e106')::uuid) where 'importe_transportista' = any (campos)) then
    raise exception 'FALLO 111 · el cliente ve cambios del precio del transportista';
  end if;
  select * into r from historial_registro('envios', current_setting('prueba.e106')::uuid) where 'referencia_cliente' = any (campos) limit 1;
  if r.quien_nombre not like 'Dynamo%' or r.quien_email is not null then
    raise exception 'FALLO 111 · un cambio de Dynamo no sale como «Dynamo · nombre» sin email: % %', r.quien_nombre, r.quien_email;
  end if;
  if not exists (select 1 from autores_mis_envios() where envio_id = current_setting('prueba.e106')::uuid and creado_email = 'compras@cliente.prueba') then
    raise exception 'FALLO 111 · la lista del cliente no sabe quién creó el envío';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ begin
  if exists (select 1 from historial_registro('envios', current_setting('prueba.e106')::uuid)) then
    raise exception 'FALLO 111 · alguien de fuera (un transportista) ve el historial del envío de un cliente';
  end if;
  raise notice 'OK 111 · historial: Dynamo lo ve todo; el cliente, quién creó y tocó cada cosa (sin datos internos ni contacto del transportista); nadie más';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 112. Varias contraofertas a la vez: la carga no se bloquea; al aprobar una, el resto fuera --
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare c uuid := current_setting('prueba.cliente')::uuid; t1 uuid := current_setting('prueba.transp')::uuid; t2 uuid;
              e uuid; o uuid; tok uuid; r jsonb; r1 uuid; r2 uuid; begin
  insert into transportistas (razon_social, cif, estado_operativo) values ('Segundo Transp SL', 'B10040040', 'activo') returning id into t2;
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
    values (c, 6, 600, 500, current_date + 1, current_date + 1) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 1, 'carga', '41001', 'Sevilla');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 2, 'descarga', '46001', 'Valencia');
  update envios set estado = 'programado' where id = e;
  o := ofertar_envio(e, t1, 'email', 500, 30::smallint);
  select token into tok from envio_ofertas where id = o;
  -- Primer transportista: contraoferta a revisión. La carga NO queda bloqueada.
  r := reservar_envio_publico(tok); r1 := (r->>'reserva_id')::uuid;
  r := aceptar_reserva(r1, t1, null, 620);
  if r->>'resultado' <> 'pendiente_revision' then raise exception 'FALLO 112 · la primera contraoferta no va a revisión: %', r; end if;
  if (oferta_publica(tok))->>'en_tramite' = 'true' then raise exception 'FALLO 112 · una contraoferta pendiente sigue bloqueando la carga'; end if;
  -- Segundo transportista (con su oferta): puede reservar y contraofertar también.
  o := ofertar_envio(e, t2, 'email', 500, 30::smallint);
  r := reservar_envio_publico((select token from envio_ofertas where id = o));
  if r->>'resultado' <> 'reservada' then raise exception 'FALLO 112 · el segundo no puede reservar: %', r; end if;
  r2 := (r->>'reserva_id')::uuid;
  r := aceptar_reserva(r2, t2, null, 610);
  if r->>'resultado' <> 'pendiente_revision' then raise exception 'FALLO 112 · la segunda contraoferta no va a revisión: %', r; end if;
  -- Dynamo aprueba la segunda: la primera queda rechazada sola.
  r := resolver_contraoferta(r2, true);
  if r->>'resultado' <> 'aceptada' then raise exception 'FALLO 112 · no aprueba la elegida: %', r; end if;
  if (select estado from envio_reservas where id = r1) <> 'rechazada' then raise exception 'FALLO 112 · la otra contraoferta no queda rechazada'; end if;
  if (resolver_contraoferta(r1, true))->>'resultado' = 'aceptada' then raise exception 'FALLO 112 · se aprueba otra después de asignada la carga'; end if;
  raise notice 'OK 112 · contraofertas: varias a la vez sin bloquear la carga; al aprobar una, las demás quedan rechazadas';
end $$;

-- ---- 113. Suspensión: cancelar sin camión y con tiempo NO cuenta ------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
update usuarios set estado = 'activa', exento_autosuspension = false, autosuspension_desde_en = now() where id = current_setting('prueba.u_cli')::uuid;
do $$ declare e uuid; i int; begin
  perform set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
  for i in 1..4 loop
    insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
      values (current_setting('prueba.cliente')::uuid, 13.30, 20, 1000, 800, current_date + 20, current_date + 21) returning id into e;
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'ES');
    update envios set estado = 'programado' where id = e;
    update envios set estado = 'cancelado' where id = e;   -- sin camión y con 20 días: gratis
  end loop;
  perform set_config('request.jwt.claim.sub', '', false);
  if (select estado from usuarios where id = current_setting('prueba.u_cli')::uuid) <> 'activa'
     or exists (select 1 from autosuspension_candidatos() where usuario_id = current_setting('prueba.u_cli')::uuid and motivo ~ 'Regla [45]') then
    raise exception 'FALLO 113 · cancelar sin camión y con tiempo cuenta para suspender';
  end if;
  raise notice 'OK 113 · suspensión: solo cuentan las cancelaciones con camión asignado o pasado el corte de las 9:00';
end $$;

-- ---- 114. Cancelar «en nombre del cliente» cuenta para él; desde gestión interna, no ----
reset role;
select set_config('request.jwt.claim.sub', '', false);
update usuarios set estado = 'activa', exento_autosuspension = false, autosuspension_desde_en = now() where id = current_setting('prueba.u_cli')::uuid;
do $$ declare e uuid; i int; begin
  for i in 1..6 loop
    perform set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
    insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, fecha_carga_desde)
      values (current_setting('prueba.cliente')::uuid, 13.30, 20, 1000, 800, current_date) returning id into e;
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'ES');
    perform set_config('request.jwt.claim.sub', '', false);
    update envios set estado = 'programado' where id = e;
    perform set_config('prueba.e114_' || i, e::text, false);
  end loop;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  -- 3 cancelaciones tardías desde gestión interna: no cuentan.
  perform cancelar_envio(current_setting('prueba.e114_1')::uuid, 'error nuestro', false);
  perform cancelar_envio(current_setting('prueba.e114_2')::uuid, 'error nuestro', false);
  perform cancelar_envio(current_setting('prueba.e114_3')::uuid, 'error nuestro', false);
  if (select estado from usuarios where id = current_setting('prueba.u_cli')::uuid) <> 'activa' then
    raise exception 'FALLO 114 · cancelar desde gestión interna cuenta para el cliente';
  end if;
  -- 3 desde la vista del cliente (a petición suya): cuentan y suspende al momento (regla 5).
  perform cancelar_envio(current_setting('prueba.e114_4')::uuid, 'lo pide por teléfono', true);
  perform cancelar_envio(current_setting('prueba.e114_5')::uuid, 'lo pide por teléfono', true);
  perform cancelar_envio(current_setting('prueba.e114_6')::uuid, 'lo pide por teléfono', true);
  if (select estado from usuarios where id = current_setting('prueba.u_cli')::uuid) <> 'suspendida' then
    raise exception 'FALLO 114 · cancelar en nombre del cliente no cuenta para él';
  end if;
  update usuarios set estado = 'activa' where id = current_setting('prueba.u_cli')::uuid;
  raise notice 'OK 114 · cancelar desde la vista del cliente cuenta como suya; desde gestión interna, no';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 115. Mantenimiento: todas las tablas de negocio bloqueadas; las tareas automáticas pasan --
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare faltan text; begin
  -- Toda tabla nueva tiene que llevar el bloqueo o estar en esta lista a propósito.
  select string_agg(c.relname, ', ') into faltan
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname not in ('usuarios', 'auditoria', 'parametros', 'festivos', 'tipos_incidencia', 'tipos_penalizacion',
                           'recargos_tipo_sitio', 'restricciones_servicio', 'distancias_cp', 'distancias_sitios',
                           'conexion_minutos', 'consultas_precio', 'intentos_carga_publica', 'avisos_vistos', 'contraoferta_intentos')
     and not exists (select 1 from pg_trigger g where g.tgrelid = c.oid and g.tgname = 'tg_mantenimiento');
  if faltan is not null then
    raise exception 'FALLO 115 · tablas sin el bloqueo de mantenimiento (añadirlo o justificarlo en la lista): %', faltan;
  end if;
end $$;
update parametros set valor = 'true' where clave = 'mantenimiento_activo';
-- Conexión directa (como pg_cron): pasa.
do $$ begin
  perform registrar_hito(current_setting('prueba.e108')::uuid, 'incidencia', null, null, '{"prueba":"115"}'::jsonb);
exception when sqlstate '55000' then raise exception 'FALLO 115 · el mantenimiento bloquea las tareas automáticas';
end $$;
-- Un cliente: no deja hitos (la tabla nueva también está bloqueada).
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin
    perform registrar_hito(current_setting('prueba.e108')::uuid, 'incidencia', null, null, '{"prueba":"115b"}'::jsonb);
    if exists (select 1 from envio_hitos where datos ->> 'prueba' = '115b') then
      raise exception 'FALLO 115 · un cliente deja hitos con el mantenimiento encendido';
    end if;
  exception when sqlstate '55000' then null; when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
update parametros set valor = 'false' where clave = 'mantenimiento_activo';
do $$ begin raise notice 'OK 115 · mantenimiento: todas las tablas de negocio bloqueadas; las tareas automáticas siguen funcionando'; end $$;

-- ---- 116. Avisos de la campana: a quién llegan y qué ven ----------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare e uuid; begin
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta, estado_solicitud)
    values (current_setting('prueba.cliente')::uuid, 6, 1000, 777, current_date + 4, current_date + 5, 'pendiente_precio') returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 1, 'carga', '41001', 'Sevilla');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion) values (e, 2, 'descarga', '46001', 'Valencia');
  update envios set estado_solicitud = 'precio_propuesto' where id = e;
  update envios set estado = 'programado', estado_solicitud = 'aceptada' where id = e;
  update envios set transportista_id = current_setting('prueba.transp')::uuid where id = e;
  update envios set estado = 'cancelado' where id = e;
  perform set_config('prueba.e116', e::text, false);
  if not exists (select 1 from avisos where envio_id = e and para = 'dynamo' and tipo = 'solicitud') then raise exception 'FALLO 116 · Dynamo no recibe la solicitud de precio'; end if;
  if not exists (select 1 from avisos where envio_id = e and para = 'cliente' and tipo = 'precio') then raise exception 'FALLO 116 · el cliente no recibe su precio'; end if;
  if not exists (select 1 from avisos where envio_id = e and para = 'cliente' and tipo = 'asignado')
     or not exists (select 1 from avisos where envio_id = e and para = 'transportista' and tipo = 'asignada') then
    raise exception 'FALLO 116 · asignar transportista no avisa al cliente y al transportista';
  end if;
  if not exists (select 1 from avisos where envio_id = e and para = 'transportista' and tipo = 'cancelada' and nivel = 'urgente') then
    raise exception 'FALLO 116 · cancelar no avisa (urgente) al transportista que tenía la carga';
  end if;
  if exists (select 1 from avisos where envio_id = e and para = 'cliente' and (coalesce(texto, '') || titulo) like '%777%') then
    raise exception 'FALLO 116 · un aviso del cliente lleva el precio del transportista';
  end if;
end $$;
-- El cliente: solo los de su empresa; ni los de Dynamo ni crear avisos.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from mis_avisos();
  if n = 0 then raise exception 'FALLO 116 · el cliente no ve sus avisos'; end if;
  if exists (select 1 from mis_avisos() where tipo in ('solicitud', 'cancelada', 'asignada')) then raise exception 'FALLO 116 · el cliente ve avisos que no son suyos'; end if;
  if exists (select 1 from avisos where para <> 'cliente') then raise exception 'FALLO 116 · el cliente lee avisos de Dynamo o de transportistas'; end if;
  if exists (select 1 from mis_avisos(null, current_setting('prueba.transp')::uuid) where tipo = 'asignada') then
    raise exception 'FALLO 116 · el cliente ve los avisos de un transportista pidiéndolos';
  end if;
  begin
    insert into avisos (para, tipo, titulo) values ('dynamo', 'x', 'falso');
    raise exception 'FALLO 116 · un cliente crea avisos';
  exception when insufficient_privilege then null;
  end;
  if not exists (select 1 from mis_avisos() where nuevo) then raise exception 'FALLO 116 · los avisos nuevos no salen como nuevos'; end if;
  perform marcar_avisos_vistos();
  if exists (select 1 from mis_avisos() where nuevo) then raise exception 'FALLO 116 · marcar como vistos no funciona'; end if;
end $$;
reset role;
-- Dynamo: los suyos; con «Ver como», los de ese cliente.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  if not exists (select 1 from mis_avisos() where tipo = 'solicitud') then raise exception 'FALLO 116 · Dynamo no ve sus avisos'; end if;
  if exists (select 1 from mis_avisos() where tipo = 'precio') then raise exception 'FALLO 116 · Dynamo ve los del cliente mezclados con los suyos'; end if;
  if not exists (select 1 from mis_avisos(current_setting('prueba.cliente')::uuid) where tipo = 'precio') then raise exception 'FALLO 116 · «Ver como» cliente no enseña sus avisos'; end if;
  raise notice 'OK 116 · avisos: cada uno recibe los suyos (Dynamo, cliente, transportista), sin el precio del transportista para el cliente; nadie los crea a mano';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 117. Revisión de seguridad del 2026-11-04 ------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
update parametros set valor = 'false' where clave = 'pago_previo_activo';
do $$ declare e uuid; f uuid; g uuid; h uuid; i uuid; j uuid; rv uuid; begin
  -- e: publicado en bolsa (se está asignando) · f: carga hoy (pasado el corte) · g: con
  -- contraoferta pendiente · h, i: para altas online · j: carga de hace un mes.
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
    values (current_setting('prueba.cliente')::uuid, 6, 600, 500, current_date + 4, current_date + 5) returning id into e;
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
    values (current_setting('prueba.cliente')::uuid, 6, 600, 500, current_date, current_date) returning id into f;
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
    values (current_setting('prueba.cliente')::uuid, 6, 600, 500, current_date + 4, current_date + 5) returning id into g;
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
    values (current_setting('prueba.cliente')::uuid, 6, 600, 500, current_date + 4, current_date + 5) returning id into h;
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
    values (current_setting('prueba.cliente')::uuid, 6, 600, 500, current_date + 4, current_date + 5) returning id into i;
  insert into envios (cliente_id, metros_lineales, importe_cliente, importe_transportista, fecha_carga_desde, fecha_carga_hasta)
    values (current_setting('prueba.cliente')::uuid, 6, 600, 500, current_date - 30, current_date - 30) returning id into j;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion)
    select x, o, t, cp, p from unnest(array[e, f, g, h, i, j]) x,
      (values (1, 'carga', '41001', 'Sevilla'), (2, 'descarga', '46001', 'Valencia')) v(o, t, cp, p);
  update envios set estado = 'programado' where id in (e, f, g, h, i, j);
  update envios set publicado_en_bolsa_en = now() where id = e;
  insert into envio_reservas (envio_id, hasta, transportista_id) values (g, now() + interval '3 minutes', current_setting('prueba.transp')::uuid) returning id into rv;
  update envio_reservas set estado = 'pendiente_revision', precio_propuesto = 500 where id = rv;
  perform set_config('prueba.e117', e::text, false); perform set_config('prueba.f117', f::text, false);
  perform set_config('prueba.g117', g::text, false); perform set_config('prueba.rv117', rv::text, false);
  perform set_config('prueba.tokh117', (select token_publico::text from envios where id = h), false);
  perform set_config('prueba.toki117', (select token_publico::text from envios where id = i), false);
  perform set_config('prueba.tokj117', (select token_publico::text from envios where id = j), false);
end $$;
-- Cambios del cliente: publicado en bolsa = se está asignando; pasado el corte, tampoco.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if (pedir_cambio_envio(current_setting('prueba.e117')::uuid, current_date + 10, current_date + 11))->>'resultado' <> 'con_camion' then
    raise exception 'FALLO 117 · el cliente cambia las fechas de una carga que ya se está asignando (publicada en bolsa)';
  end if;
  if (pedir_cambio_envio(current_setting('prueba.f117')::uuid, current_date + 150, current_date + 151))->>'resultado' <> 'fuera_de_plazo' then
    raise exception 'FALLO 117 · el cliente aleja la carga pasado el corte (y así cancelaría tarde sin que cuente)';
  end if;
  if not (select con_camion from mi_cambio_envio(current_setting('prueba.f117')::uuid)) then
    raise exception 'FALLO 117 · la ficha no manda a llamar pasado el corte';
  end if;
  -- Copias de avisos: no las cambia el dueño de la cuenta.
  begin
    update usuarios set emails_copia_avisos = '{espia@ejemplo.com}' where id = auth.uid();
    raise exception 'FALLO 117 · un cliente se pone copias de los avisos';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
-- Cancelar el envío rechaza las contraofertas pendientes.
update envios set estado = 'cancelado' where id = current_setting('prueba.g117')::uuid;
do $$ begin
  if (select estado from envio_reservas where id = current_setting('prueba.rv117')::uuid) <> 'rechazada' then
    raise exception 'FALLO 117 · cancelar el envío deja la contraoferta pendiente';
  end if;
end $$;
-- Alta online: como mucho 3 pendientes por carga; los CIF que ya existen cuentan como fallo.
set role anon;
do $$ declare r jsonb; v jsonb; k int; begin
  for k in 1..4 loop
    r := reservar_envio_publico(current_setting('prueba.tokh117')::uuid, '10.11.7.1');
    v := alta_transportista_publica((r->>'reserva_id')::uuid, 'wtransnet', '711' || k, 'ES', 'B7110000' || k, '+3460000071' || k);
    if k <= 3 and v->>'resultado' <> 'alta_pendiente' then raise exception 'FALLO 117 · alta online % no queda pendiente: %', k, v; end if;
    if k = 4 and v->>'resultado' <> 'demasiadas_altas' then raise exception 'FALLO 117 · no hay tope de altas online por carga: %', v; end if;
  end loop;
  r := reservar_envio_publico(current_setting('prueba.toki117')::uuid, '10.11.7.2');
  for k in 1..8 loop
    v := alta_transportista_publica((r->>'reserva_id')::uuid, 'wtransnet', '9999', 'ES', 'B-33333333', '+34600000000');
    exit when v->>'resultado' <> 'ya_existe';
  end loop;
  if v->>'resultado' <> 'demasiados_intentos' then raise exception 'FALLO 117 · se pueden ir probando CIFs sin límite: %', v; end if;
  -- Tablón: con el enlace de una carga reciente sí; con uno de hace un mes, nada.
  -- (los topes salen de Parámetros: alta_online_max_pendientes_carga = 3, tablon_enlace_dias = 14)
  if jsonb_array_length(otras_cargas_publicas(current_setting('prueba.tokh117')::uuid)) = 0 then
    raise exception 'FALLO 117 · el tablón no enseña nada con un enlace reciente';
  end if;
  if jsonb_array_length(otras_cargas_publicas(current_setting('prueba.tokj117')::uuid)) <> 0 then
    raise exception 'FALLO 117 · el tablón sigue funcionando con un enlace antiguo';
  end if;
  raise notice 'OK 117 · revisión de seguridad: cambios con la carga asignándose o fuera de plazo, contraofertas al cancelar, topes del alta online, tablón y datos de la cuenta';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 118. Notas internas: solo las ve (y las escribe) Dynamo -------------------------------
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
update clientes set anotaciones = 'Paga tarde: vigilar' where id = current_setting('prueba.cliente')::uuid;
do $$ begin
  if not exists (select 1 from notas_internas where tabla = 'clientes' and registro_id = current_setting('prueba.cliente')::uuid and texto = 'Paga tarde: vigilar') then
    raise exception 'FALLO 118 · la nota de Dynamo no se guarda en notas_internas';
  end if;
  if (select anotaciones from clientes where id = current_setting('prueba.cliente')::uuid) is not null then
    raise exception 'FALLO 118 · la nota se queda en la ficha del cliente';
  end if;
end $$;
reset role;
-- El alta online (función del sistema) guarda su nota interna, no en la ficha.
do $$ begin
  if not exists (select 1 from notas_internas n join transportistas t on t.id = n.registro_id
                  where n.tabla = 'transportistas' and normalizar_id_fiscal(t.cif) = normalizar_id_fiscal('B94949494') and n.texto like 'Alta online%')
     or exists (select 1 from transportistas where anotaciones is not null or anotaciones_incidencias is not null) then
    raise exception 'FALLO 118 · las notas del alta online quedan en la ficha del transportista';
  end if;
end $$;
-- El cliente: ni las lee ni las escribe.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if exists (select 1 from notas_internas) then raise exception 'FALLO 118 · un cliente lee notas internas'; end if;
  if exists (select 1 from clientes where anotaciones is not null) then raise exception 'FALLO 118 · un cliente lee la nota de su ficha'; end if;
  begin
    insert into notas_internas (tabla, registro_id, texto) values ('clientes', current_setting('prueba.cliente')::uuid, 'falsa');
    raise exception 'FALLO 118 · un cliente escribe notas internas';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- El transportista tampoco.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ begin
  if exists (select 1 from notas_internas) then raise exception 'FALLO 118 · un transportista lee notas internas'; end if;
end $$;
reset role;
-- Dynamo borra la nota dejando el campo vacío.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
update clientes set anotaciones = null where id = current_setting('prueba.cliente')::uuid;
do $$ begin
  if exists (select 1 from notas_internas where tabla = 'clientes' and registro_id = current_setting('prueba.cliente')::uuid) then
    raise exception 'FALLO 118 · Dynamo no puede borrar una nota';
  end if;
  raise notice 'OK 118 · notas internas: solo Dynamo las lee y las escribe; en las fichas la columna queda vacía';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 119. Horario de verano de los sitios -------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare l uuid := current_setting('prueba.sitio_a')::uuid; begin
  -- Sin activar: el general todo el año.
  if exists (select 1 from horario_del_dia(l, make_date(2027, 7, 14)) where temporada = 'verano') then
    raise exception 'FALLO 119 · sin activar, usa un horario de verano';
  end if;
  -- Activar sin fechas o sin horario: no.
  begin perform guardar_horario_verano(l, true, null, '09-15', '[{"dia":1,"abre":"07:30","cierra":"15:00"}]');
        raise exception 'FALLO 119 · activa el verano sin fechas'; exception when raise_exception then null; end;
  begin perform guardar_horario_verano(l, true, '05-25', '09-15', '[]');
        raise exception 'FALLO 119 · activa el verano sin horario'; exception when raise_exception then null; end;
  -- Activar con L-V 7:30-15:00 del 25-may al 15-sep.
  perform guardar_horario_verano(l, true, '05-25', '09-15',
    (select jsonb_agg(jsonb_build_object('dia', d, 'abre', '07:30', 'cierra', '15:00')) from generate_series(1, 5) d));
  -- Miércoles 14-jul-2027: verano 7:30-15:00. Miércoles 13-oct-2027: el general.
  if not exists (select 1 from horario_del_dia(l, make_date(2027, 7, 14)) where temporada = 'verano' and abre = '07:30' and cierra = '15:00') then
    raise exception 'FALLO 119 · en verano no usa el horario de verano';
  end if;
  if exists (select 1 from horario_del_dia(l, make_date(2027, 10, 13)) where temporada = 'verano') then
    raise exception 'FALLO 119 · fuera de verano usa el horario de verano';
  end if;
  if (select horarios_verano from sitios where id = l) <> 'L-V 7:30-15:00' then
    raise exception 'FALLO 119 · el resumen del verano no se escribe: %', (select horarios_verano from sitios where id = l);
  end if;
  if (select horarios from sitios where id = l) like '%7:30-15:00%' then
    raise exception 'FALLO 119 · el verano pisa el resumen del horario general';
  end if;
  -- Desactivar: vuelve el general (los tramos de verano se conservan para la próxima vez).
  perform guardar_horario_verano(l, false, null, null, '[]');
  if exists (select 1 from horario_del_dia(l, make_date(2027, 7, 14)) where temporada = 'verano') then
    raise exception 'FALLO 119 · desactivado, sigue usando el de verano';
  end if;
  raise notice 'OK 119 · horario de verano: se activa con fechas y tramos, cada día usa el suyo y no pisa el general';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 120. Horario de verano en los envíos: cada parada, el horario de su fecha ---------------
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
select guardar_horario_verano(current_setting('prueba.sitio_a')::uuid, true, '06-01', '08-31',
  (select jsonb_agg(jsonb_build_object('dia', d, 'abre', '07:30', 'cierra', '15:00')) from generate_series(1, 5) d));
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  if horario_sitio_texto(current_setting('prueba.sitio_a')::uuid, make_date(2027, 7, 14)) <> 'L-V 7:30-15:00 (horario de verano)' then
    raise exception 'FALLO 120 · en verano no da el horario de verano: %', horario_sitio_texto(current_setting('prueba.sitio_a')::uuid, make_date(2027, 7, 14));
  end if;
  if horario_sitio_texto(current_setting('prueba.sitio_a')::uuid, make_date(2027, 10, 13)) like '%verano%' then
    raise exception 'FALLO 120 · fuera de verano da el horario de verano';
  end if;
  raise notice 'OK 120 · horario de verano en los envíos: cada parada lleva el horario de su fecha';
end $$;

-- ---- 121. Contraoferta del cliente: no se puede ir probando hasta dar con el % máximo -------
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare r text; k int; begin
  for k in 1..4 loop
    r := (contraofertar_precio_solicitud(current_setting('prueba.e101_3')::uuid, 700 + k))->>'resultado';
  end loop;
  if r <> 'demasiados_intentos' then raise exception 'FALLO 121 · se pueden hacer propuestas demasiado bajas sin límite: %', r; end if;
  raise notice 'OK 121 · contraoferta del cliente: a la 3.ª propuesta demasiado baja en 24 h, no admite más ese día';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 122. RGPD: exportar, anonimizar y limpieza automática ---------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare u uuid; begin
  insert into auth.users (email) values ('borrame@cliente.prueba') returning id into u;
  update usuarios set rol = 'cliente', estado = 'activa', nombre = 'Ana Borrable', telefono = '+34600123456',
         cliente_id = current_setting('prueba.cliente')::uuid where id = u;
  insert into contactos (cliente_id, nombre, telefono, email) values (current_setting('prueba.cliente')::uuid, 'Ana Borrable', '+34600123456', 'borrame@cliente.prueba');
  perform set_config('prueba.u122', u::text, false);
  -- Un intento viejo (100 días) y uno reciente en el registro del enlace de carga.
  insert into intentos_carga_publica (envio_id, motivo, ip) values (current_setting('prueba.e108')::uuid, 'prueba_vieja', '10.1.2.2');
end $$;
-- La hora la pone el servidor al insertar: se envejece aquí (la limpieza tiene permiso).
select set_config('dynamo.purga', 'on', false);
alter table intentos_carga_publica disable trigger tg_intentos_carga_inmutable;
update intentos_carga_publica set cuando = now() - interval '100 days' where motivo = 'prueba_vieja';
alter table intentos_carga_publica enable trigger tg_intentos_carga_inmutable;
select set_config('dynamo.purga', '', false);
-- Exportar: la persona, sus datos; otro cliente, no.
select set_config('request.jwt.claim.sub', current_setting('prueba.u122'), false);
set role authenticated;
do $$ begin
  if (exportar_datos_usuario() -> 'cuenta' ->> 'nombre') <> 'Ana Borrable' then raise exception 'FALLO 122 · no exporta los datos de la persona'; end if;
  begin
    perform exportar_datos_usuario(current_setting('prueba.u_cli')::uuid);
    raise exception 'FALLO 122 · un cliente exporta los datos de otro';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- Anonimizar: solo el Admin Master; borra la ficha y la auditoría no guarda los valores.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare r jsonb; begin
  r := anonimizar_usuario(current_setting('prueba.u122')::uuid);
  if r->>'resultado' <> 'ok' then raise exception 'FALLO 122 · no anonimiza: %', r; end if;
end $$;
reset role;
do $$ declare u usuarios%rowtype; begin
  select * into u from usuarios where id = current_setting('prueba.u122')::uuid;
  if u.nombre <> 'Persona eliminada' or u.telefono is not null or u.email not like 'eliminado-%' or u.estado <> 'suspendida' then
    raise exception 'FALLO 122 · la ficha no queda anonimizada: % % % %', u.nombre, u.telefono, u.email, u.estado;
  end if;
  if exists (select 1 from contactos where email = 'borrame@cliente.prueba' or nombre = 'Ana Borrable') then
    raise exception 'FALLO 122 · su contacto no se anonimiza';
  end if;
  if exists (select 1 from auditoria where cuando > now() - interval '1 minute' and cambios::text like '%600123456%' and cambios ? 'anonimizado') then
    raise exception 'FALLO 122 · la auditoría de la anonimización guarda los datos borrados';
  end if;
  if not exists (select 1 from auditoria where tabla = 'usuarios' and registro_id = current_setting('prueba.u122') and cambios ? 'anonimizado') then
    raise exception 'FALLO 122 · la anonimización no queda en la auditoría';
  end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin
    perform anonimizar_usuario(current_setting('prueba.u_cli2')::uuid);
    raise exception 'FALLO 122 · un cliente anonimiza a otro';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
-- Limpieza apagada (por defecto): no borra nada.
do $$ declare r jsonb; begin
  r := purgar_datos_personales();
  if not exists (select 1 from intentos_carga_publica where motivo = 'prueba_vieja') then raise exception 'FALLO 122 · la limpieza apagada borra datos'; end if;
end $$;
-- Encendida: borra el intento de hace 100 días y deja los recientes.
update parametros set valor = 'true' where clave = 'rgpd_limpieza_activa';
do $$ declare r jsonb; begin
  r := purgar_datos_personales();
  if exists (select 1 from intentos_carga_publica where motivo = 'prueba_vieja') then raise exception 'FALLO 122 · la limpieza no borra los intentos viejos: %', r; end if;
  if not exists (select 1 from intentos_carga_publica where cuando > now() - interval '1 day') then raise exception 'FALLO 122 · la limpieza borra intentos recientes'; end if;
  begin
    delete from intentos_carga_publica where true;
    raise exception 'FALLO 122 · fuera de la limpieza se pueden borrar los intentos';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  raise notice 'OK 122 · RGPD: cada uno exporta lo suyo, solo el Admin Master anonimiza (la auditoría no guarda lo borrado) y la limpieza (apagada por defecto) borra solo lo caducado';
end $$;
update parametros set valor = 'false' where clave = 'rgpd_limpieza_activa';

-- ---- 123. Segunda revisión de seguridad (4-5 nov) --------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
-- Una modificación antigua de su almacenamiento con una nota interna de Dynamo (de antes
-- de que las notas pasaran a notas_internas).
insert into auditoria (tabla, registro_id, accion, quien_origen, cambios)
values ('almacenamientos', current_setting('prueba.alm'), 'modificacion', 'app',
        '{"anotaciones": {"antes": null, "despues": "NOTA SECRETA DE DYNAMO"}, "num_trailers": {"antes": 1, "despues": 2}}');
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if exists (select 1 from historial_registro('almacenamientos', current_setting('prueba.alm')::uuid)
              where 'anotaciones' = any (campos) or coalesce(cambios::text, '') like '%SECRETA%') then
    raise exception 'FALLO 123 · el cliente ve notas internas en el historial de su almacenamiento';
  end if;
  if not exists (select 1 from historial_registro('almacenamientos', current_setting('prueba.alm')::uuid) where 'num_trailers' = any (campos)) then
    raise exception 'FALLO 123 · el cliente ya no ve los cambios normales de su almacenamiento';
  end if;
  if exists (select 1 from horario_del_dia(current_setting('prueba.sitio_b')::uuid, current_date))
     or horario_sitio_texto(current_setting('prueba.sitio_b')::uuid, current_date) is not null then
    raise exception 'FALLO 123 · un cliente lee el horario del sitio de otro cliente';
  end if;
  if (verano_sitios_fechas() ->> 'desde') is null then raise exception 'FALLO 123 · un cliente no puede leer las fechas de verano'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(exportar_datos_usuario() -> 'firmas_cmr_con_tu_email', '[]')) f where f ? 'documento') then
    raise exception 'FALLO 123 · la exportación saca el documento de firmas cruzadas por email';
  end if;
  raise notice 'OK 123 · segunda revisión: sin notas internas en el historial, horarios ajenos ocultos, fechas de verano legibles, exportación sin DNI de terceros';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 124. Tercera tanda: la auditoría no guarda IP de reservas y no se altera fuera de la limpieza --
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare rv uuid; begin
  insert into envio_reservas (envio_id, hasta, ip, navegador)
    values (current_setting('prueba.e117')::uuid, now() + interval '3 minutes', '10.12.4.1', 'Navegador de prueba') returning id into rv;
  if exists (select 1 from auditoria where tabla = 'envio_reservas' and registro_id = rv::text
              and (cambios::text like '%10.12.4.1%' or cambios::text like '%Navegador de prueba%')) then
    raise exception 'FALLO 124 · la auditoría copia la IP o el navegador de la reserva';
  end if;
  begin
    update auditoria set cambios = '{}' where registro_id = rv::text;
    raise exception 'FALLO 124 · se puede modificar la auditoría fuera de la limpieza';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform liberar_reserva_publica(rv, 'prueba');
  raise notice 'OK 124 · la auditoría no guarda IP de reservas y solo la limpieza RGPD la puede tocar';
end $$;

-- ---- 125. Cobertura por países: fuera de la lista, bloqueado con su motivo -----------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare m text; begin
  select mensaje into m from comprobar_cobertura('[{"orden":1,"tipo":"carga","pais":"ES","codigo_postal":"41001"},{"orden":2,"tipo":"descarga","pais":"RO","codigo_postal":"010011","nombre":"Bucarest"}]'::jsonb);
  if m is null or m not like 'No trabajamos en Rumanía. Trabajamos en España, Portugal%' then raise exception 'FALLO 125 · un destino fuera de cobertura no se para con su motivo: %', m; end if;
  if exists (select 1 from comprobar_cobertura('[{"orden":1,"tipo":"carga","pais":"ES","codigo_postal":"41001"},{"orden":2,"tipo":"descarga","pais":"PT","codigo_postal":"1000-001"}]'::jsonb)) then
    raise exception 'FALLO 125 · bloquea una ruta que sí se hace (Sevilla-Lisboa)';
  end if;
  if not exists (select 1 from comprobar_cobertura('[{"orden":1,"tipo":"carga","pais":"ES","codigo_postal":"41001"},{"orden":2,"tipo":"descarga","pais":"CH","codigo_postal":"8001"}]'::jsonb)) then
    raise exception 'FALLO 125 · un cliente no ve que Suiza como destino no se hace (las reglas solo las lee Dynamo)';
  end if;
  if exists (select 1 from comprobar_cobertura('[{"orden":1,"tipo":"carga","pais":"CH","codigo_postal":"8001"},{"orden":2,"tipo":"descarga","pais":"ES","codigo_postal":"41001"}]'::jsonb)) then
    raise exception 'FALLO 125 · bloquea una recogida en Suiza (sí se hace)';
  end if;
  raise notice 'OK 125 · cobertura: fuera de los países en los que trabajamos se para con el motivo; las excepciones siguen igual';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 126. Más avisos: penalización (cada uno su importe), almacenamiento, cuenta activada ----
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare p uuid; u uuid; e uuid := current_setting('prueba.f108')::uuid; begin
  update envios set transportista_id = current_setting('prueba.transp')::uuid where id = e and transportista_id is null;
  insert into penalizaciones (envio_id, tipo_id, descripcion, importe_cliente, importe_transportista)
    values (e, (select id from tipos_penalizacion where clave = 'paralizacion'), 'Espera en descarga', 111, 66) returning id into p;
  update penalizaciones set estado = 'confirmada' where id = p;
  if not exists (select 1 from avisos where envio_id = e and para = 'cliente' and tipo = 'penalizacion' and texto like '%111,00%' and texto not like '%66,00%') then
    raise exception 'FALLO 126 · el cliente no recibe su penalización (o ve el importe del transportista)';
  end if;
  if not exists (select 1 from avisos where envio_id = e and para = 'transportista' and tipo = 'penalizacion' and texto like '%66,00%' and texto not like '%111,00%') then
    raise exception 'FALLO 126 · el transportista no recibe su penalización (o ve el importe del cliente)';
  end if;
  -- Alta aprobada → aviso a su empresa.
  insert into auth.users (email) values ('nuevo126@cliente.prueba') returning id into u;
  update usuarios set rol = 'cliente', cliente_id = current_setting('prueba.cliente')::uuid where id = u;
  update usuarios set estado = 'activa' where id = u;
  if not exists (select 1 from avisos where para = 'cliente' and cliente_id = current_setting('prueba.cliente')::uuid and tipo = 'cuenta_activada') then
    raise exception 'FALLO 126 · aprobar un alta no avisa a su empresa';
  end if;
end $$;
-- Dynamo cancela un almacenamiento → aviso al cliente.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
update almacenamientos set estado = 'cancelado' where id = current_setting('prueba.alm')::uuid;
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  if not exists (select 1 from avisos where para = 'cliente' and tipo = 'almacen_cancelado') then
    raise exception 'FALLO 126 · cancelar un almacenamiento no avisa al cliente';
  end if;
  raise notice 'OK 126 · más avisos: penalización con el importe de cada uno, cuenta activada y almacenamiento cancelado';
end $$;

-- ---- 127. Buscar a una persona para una petición RGPD: solo el Admin Master ------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  if not exists (select 1 from buscar_persona('compras@cliente.prueba') where tipo = 'usuario') then
    raise exception 'FALLO 127 · el Admin Master no encuentra a un usuario por su email';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin
    perform buscar_persona('cliente.prueba');
    raise exception 'FALLO 127 · un cliente busca personas en toda la plataforma';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 127 · buscar a una persona (RGPD): solo el Admin Master';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 128. Plazo para pagar: pasado el plazo, el envío pendiente de pago se anula solo ------
reset role;
select set_config('request.jwt.claim.sub', '', false);
update parametros set valor = 'true' where clave = 'pago_previo_activo';
do $$ declare c uuid; e uuid; e2 uuid; r jsonb; begin
  insert into clientes (razon_social, cif) values ('Paga Tarde SL', 'B12812812') returning id into c;
  for i in 1..2 loop
    insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista)
      values (c, 13.30, 20, 1000, 800) returning id into e2;
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e2, 1, 'carga', '41001', 'Sevilla', 'ES');
    insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e2, 2, 'descarga', '28001', 'Madrid', 'ES');
    update envios set estado = 'programado' where id = e2;
    if i = 1 then e := e2; end if;
  end loop;
  if (select estado_pago_previo from envios where id = e) <> 'pendiente' or (select pago_pendiente_en from envios where id = e) is null then
    raise exception 'FALLO 128 · el envío pendiente de pago no apunta desde cuándo';
  end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  update envios set pago_pendiente_en = now() - interval '30 hours' where id = e;
  perform set_config('request.jwt.claim.role', '', true);
  -- Pasado el plazo (24 h + margen) se anula; el que está en plazo, no.
  perform caducar_pagos_pendientes();
  if (select estado from envios where id = e) <> 'cancelado' then raise exception 'FALLO 128 · pasado el plazo, el envío no se anula'; end if;
  if (select estado from envios where id = e2) <> 'programado' then raise exception 'FALLO 128 · se anula un envío que aún está en plazo'; end if;
  if not exists (select 1 from avisos where para = 'cliente' and cliente_id = c and tipo = 'pago_caducado' and envio_id = e) then
    raise exception 'FALLO 128 · el cliente no recibe el aviso de envío anulado por falta de pago';
  end if;
  -- Un pago con tarjeta que llega tarde no lo reactiva: aviso urgente a Dynamo para devolverlo.
  r := pago_envio_stripe(e, 'pi_tarde', 121000);
  if r->>'resultado' <> 'envio_anulado' or (select estado from envios where id = e) <> 'cancelado' then
    raise exception 'FALLO 128 · un pago fuera de plazo reactiva el envío: %', r;
  end if;
  if not exists (select 1 from avisos where para = 'dynamo' and tipo = 'pago_anulado' and envio_id = e) then
    raise exception 'FALLO 128 · no se avisa a Dynamo de devolver el pago';
  end if;
  perform set_config('prueba.e128', e2::text, false);
end $$;
-- Ampliar el plazo: solo Dynamo.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin perform ampliar_plazo_pago(current_setting('prueba.e128')::uuid); raise exception 'FALLO 128 · un cliente amplía el plazo para pagar';
  exception when insufficient_privilege then null; end;
  begin perform caducar_pagos_pendientes(); raise exception 'FALLO 128 · un cliente lanza la anulación por falta de pago';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  if (select pago_limite from pagos_envio(current_setting('prueba.e128')::uuid)) is null then raise exception 'FALLO 128 · no se ve la hora límite para pagar'; end if;
  if (ampliar_plazo_pago(current_setting('prueba.e128')::uuid))->>'resultado' <> 'ok' then raise exception 'FALLO 128 · Dynamo no amplía el plazo'; end if;
  raise notice 'OK 128 · plazo para pagar: pasado el plazo el envío se anula solo, avisa al cliente, un pago tardío no lo reactiva y solo Dynamo amplía el plazo';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
update parametros set valor = 'false' where clave = 'pago_previo_activo';


-- ---- 129. Revisión del precio de los envíos programados con mucha antelación ----------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
update parametros set valor = 'false' where clave = 'pago_previo_activo';
update parametros set valor = '7' where clave = 'precio_cerrado_dias';
create or replace function pg_temp.envio129(c uuid, dias int, imp numeric) returns uuid language plpgsql as $$
declare e uuid; begin
  insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, fecha_carga_desde)
    values (c, 13.30, 20, imp, imp * 0.8, (now() at time zone 'Europe/Madrid')::date + dias) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'ES');
  update envios set estado = 'programado' where id = e;
  return e;
end $$;
do $$ declare c uuid := current_setting('prueba.cliente')::uuid; e uuid; e2 uuid; r jsonb; begin
  e := pg_temp.envio129(c, 30, 1000);
  if (select estado_revision_precio from envios where id = e) is distinct from 'pendiente' or (select fecha_revision_precio from envios where id = e) is null
     or (select precio_calculado_en from envios where id = e) is null then
    raise exception 'FALLO 129 · un envío a 30 días no queda con precio provisional y fecha de revisión';
  end if;
  if (select fecha_revision_precio from envios where id = e) >= (select fecha_carga_desde from envios where id = e) then
    raise exception 'FALLO 129 · la revisión no cae antes de la carga';
  end if;
  e2 := pg_temp.envio129(c, 3, 1000);
  if (select estado_revision_precio from envios where id = e2) is not null then raise exception 'FALLO 129 · un envío a 3 días no tiene precio cerrado'; end if;
  -- Con precio provisional: ni camión ni ofertas.
  begin update envios set transportista_id = current_setting('prueba.transp')::uuid where id = e; raise exception 'FALLO 129 · se asigna camión con precio provisional';
  exception when insufficient_privilege then null; end;
  begin insert into envio_ofertas (envio_id, precio_ofertado) values (e, 800); raise exception 'FALLO 129 · se oferta con precio provisional';
  exception when insufficient_privilege then null; end;
  -- Nadie toca las columnas de la revisión a mano.
  update envios set estado_revision_precio = 'hecha' where id = e;
  if (select estado_revision_precio from envios where id = e) <> 'pendiente' then raise exception 'FALLO 129 · se cierra el precio sin pasar por la revisión'; end if;
  -- Revisión: +2 % se mantiene; -10 % baja; +20 % espera al cliente.
  r := revisar_precio_envio(e, 1020);
  if r->>'resultado' <> 'mantenido' or (select importe_cliente from envios where id = e) <> 1000 or (select estado_revision_precio from envios where id = e) <> 'hecha' then
    raise exception 'FALLO 129 · una variación pequeña cambia el precio: %', r;
  end if;
  update envios set transportista_id = current_setting('prueba.transp')::uuid where id = e;   -- precio definitivo: ya se asigna
  e := pg_temp.envio129(c, 40, 1000);
  r := revisar_precio_envio(e, 900);
  if r->>'resultado' <> 'bajado' or (select importe_cliente from envios where id = e) <> 900 then
    raise exception 'FALLO 129 · la bajada no se aplica sola: %', r;
  end if;
  e := pg_temp.envio129(c, 40, 1000);
  r := revisar_precio_envio(e, 1200);
  if r->>'resultado' <> 'subida' or (select importe_cliente from envios where id = e) <> 1000
     or (select estado_revision_precio from envios where id = e) <> 'esperando_cliente' then
    raise exception 'FALLO 129 · la subida se aplica sin que acepte el cliente';
  end if;
  if not exists (select 1 from avisos where para = 'cliente' and tipo = 'precio_subida' and envio_id = e) then raise exception 'FALLO 129 · no se avisa al cliente de la subida'; end if;
  perform set_config('prueba.e129a', e::text, false);
  e := pg_temp.envio129(c, 40, 1000);
  perform revisar_precio_envio(e, 1200);
  perform set_config('prueba.e129b', e::text, false);
  -- La tarea de cada hora: los que llegan a su fecha pasan a «revisar»; las subidas sin respuesta, aviso.
  e := pg_temp.envio129(c, 40, 1000);
  perform set_config('dynamo.revision_precio', 'on', true);
  update envios set fecha_revision_precio = (now() at time zone 'Europe/Madrid')::date where id = e;
  update envios set revision_precio_en = now() - interval '30 hours' where id = current_setting('prueba.e129b')::uuid;
  perform set_config('dynamo.revision_precio', 'off', true);
  perform revisar_precios_programados();
  if (select estado_revision_precio from envios where id = e) <> 'revisar' then raise exception 'FALLO 129 · llegada la fecha, el precio no pasa a «revisar»'; end if;
  if not exists (select 1 from avisos where para = 'dynamo' and tipo = 'precio_sin_respuesta' and envio_id = current_setting('prueba.e129b')::uuid) then
    raise exception 'FALLO 129 · no se avisa a Dynamo de la subida sin respuesta';
  end if;
end $$;
-- El cliente: no revisa el precio; acepta una subida o cancela sin coste.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin perform revisar_precio_envio(current_setting('prueba.e129a')::uuid, 500); raise exception 'FALLO 129 · un cliente revisa su precio';
  exception when insufficient_privilege then null; end;
  if (select importe_revision_nuevo from ver_revision_precio_envio(current_setting('prueba.e129a')::uuid)) <> 1200 then raise exception 'FALLO 129 · el cliente no ve el nuevo precio'; end if;
  if (responder_subida_precio(current_setting('prueba.e129a')::uuid, true))->>'resultado' <> 'aceptado' then raise exception 'FALLO 129 · el cliente no acepta la subida'; end if;
  if (responder_subida_precio(current_setting('prueba.e129b')::uuid, false))->>'resultado' <> 'cancelado' then raise exception 'FALLO 129 · el cliente no cancela tras la subida'; end if;
  -- Antelación máxima (120 días): más lejos, no (la regla salta antes que los permisos).
  begin
    insert into envios (cliente_id, metros_lineales, toneladas, fecha_carga_desde) values (current_setting('prueba.cliente')::uuid, 4, 3, current_date + 200);
    raise exception 'FALLO 129 · un cliente programa un envío a 200 días';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  if (select importe_cliente from envios where id = current_setting('prueba.e129a')::uuid) <> 1200 then raise exception 'FALLO 129 · aceptada la subida, el precio no cambia'; end if;
  if (select (estado, cancelacion_sin_coste) from envios where id = current_setting('prueba.e129b')::uuid) <> ('cancelado'::estado_envio, true) then
    raise exception 'FALLO 129 · no queda cancelado sin coste';
  end if;
  if exists (select 1 from penalizaciones where envio_id = current_setting('prueba.e129b')::uuid) then raise exception 'FALLO 129 · cancelar tras la subida genera penalización'; end if;
end $$;
-- Previo pago: con precio provisional el plazo para pagar no corre; empieza con la revisión.
update parametros set valor = 'true' where clave = 'pago_previo_activo';
do $$ declare c uuid; e uuid; begin
  insert into clientes (razon_social, cif) values ('Lejano SL', 'B12912912') returning id into c;
  e := pg_temp.envio129(c, 40, 1000);
  if (select (estado_pago_previo, pago_pendiente_en is null) from envios where id = e) <> ('pendiente'::text, true) then
    raise exception 'FALLO 129 · con precio provisional ya corre el plazo para pagar';
  end if;
  perform revisar_precio_envio(e, 1000);
  if (select pago_pendiente_en from envios where id = e) is null then raise exception 'FALLO 129 · tras la revisión no empieza el plazo para pagar'; end if;
  raise notice 'OK 129 · revisión de precio: cerrado a ≤7 días, provisional más lejos (sin camión ni ofertas), una revisión con margen, la subida la acepta o cancela gratis el cliente y el pago espera al precio definitivo';
end $$;
update parametros set valor = 'false' where clave = 'pago_previo_activo';
update parametros set valor = '100000' where clave = 'precio_cerrado_dias';

-- ---- 130. Diccionario de datos: todo descrito dentro de Supabase ---------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare v text; begin
  select string_agg(c.relname, ', ') into v from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and coalesce(length(obj_description(c.oid, 'pg_class')), 0) < 20;
  if v is not null then raise exception 'FALLO 130 · tablas sin descripción: %', v; end if;
  select string_agg(c.relname || '.' || a.attname, ', ') into v from pg_class c join pg_attribute a on a.attrelid = c.oid
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
     and coalesce(col_description(c.oid, a.attnum), '') !~ '^formato: .* \| rango: .* \| lista: .* \| (obligatorio|opcional|automático)';
  if v is not null then raise exception 'FALLO 130 · columnas sin descripción con el formato del diccionario: %', left(v, 1500); end if;
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ') into v from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'execute') and coalesce(length(obj_description(p.oid, 'pg_proc')), 0) < 20;
  if v is not null then raise exception 'FALLO 130 · funciones de la API sin descripción: %', left(v, 1500); end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin perform diccionario_datos(); raise exception 'FALLO 130 · un cliente lee el diccionario de datos';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  if (select count(*) from diccionario_datos() where tabla = 'sitio_horarios' and descripcion is not null) < 5 then
    raise exception 'FALLO 130 · Dynamo no lee el diccionario';
  end if;
  if not exists (select 1 from funciones_api() where funcion = 'horario_del_dia') or guia_automatizaciones() not like '%crear_envio%' then
    raise exception 'FALLO 130 · no salen las funciones o la guía';
  end if;
  raise notice 'OK 130 · diccionario de datos: cada tabla, columna y función de la API descrita en Supabase; solo Dynamo lo lee';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 131. IVA del cliente en el envío y asignar a mano = asignado ------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
update parametros set valor = 'false' where clave = 'pago_previo_activo';
do $$ declare c uuid; c2 uuid; e uuid; t uuid := current_setting('prueba.transp')::uuid; begin
  insert into clientes (razon_social, cif, pais_codigo_iso) values ('Client Portugal Lda', 'PT131131131', 'PT') returning id into c;
  if (select iva_pct from clientes where id = c) <> 0 then raise exception 'FALLO 131 · un cliente de fuera de España nace con IVA'; end if;
  insert into clientes (razon_social, cif) values ('Iva España SL', 'B13113113') returning id into c2;
  if (select iva_pct from clientes where id = c2) <> 21 then raise exception 'FALLO 131 · un cliente de España no nace con el 21 %%'; end if;
  update clientes set pais_codigo_iso = 'FR' where id = c2;
  if (select iva_pct from clientes where id = c2) <> 0 then raise exception 'FALLO 131 · al cambiar de país no cambia el IVA'; end if;
  update clientes set pais_codigo_iso = 'ES', iva_pct = 7 where id = c2;   -- a mano (p. ej. Canarias)
  if (select iva_pct from clientes where id = c2) <> 7 then raise exception 'FALLO 131 · se pisa el IVA puesto a mano'; end if;
  insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, iva_pct)
    values (c, 13.30, 20, 1000, 800, 21) returning id into e;
  if (select iva_pct from envios where id = e) <> 0 then raise exception 'FALLO 131 · el envío no toma el IVA de su cliente'; end if;
  if (select total from pago_envio_importes(e)) <> 1000 then raise exception 'FALLO 131 · el cobro no usa el IVA del envío'; end if;
  -- Asignar a mano = asignado; quitarlo, sin asignar.
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'ES');
  update envios set estado = 'programado', fecha_carga_desde = current_date + 2 where id = e;
  update envios set transportista_id = t where id = e;
  if (select estado_asignacion from envios where id = e) <> 'confirmada' then raise exception 'FALLO 131 · asignar a mano no lo marca como asignado'; end if;
  update envios set transportista_id = null where id = e;
  if (select estado_asignacion from envios where id = e) <> 'sin_asignar' then raise exception 'FALLO 131 · quitar el transportista no lo deja sin asignar'; end if;
  raise notice 'OK 131 · IVA por país del cliente (21 España, 0 fuera, o el puesto a mano) en cada envío y en el cobro; asignar a mano marca asignado';
end $$;

-- ---- 132. La llave del enlace de la carga caduca al terminar el viaje ---------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare r record; begin
  select x.id, x.envio_id into r from envio_reservas x join envios e on e.id = x.envio_id and e.transportista_id = x.transportista_id
   where x.estado = 'aceptada' and e.estado not in ('entregado', 'cancelado') limit 1;
  if r.id is null then raise exception 'FALLO 132 · no hay ninguna carga aceptada para probar'; end if;
  if carga_aceptada_publica(r.id) ->> 'resultado' <> 'aceptada' then raise exception 'FALLO 132 · antes de terminar, la llave no vale'; end if;
  perform set_config('prueba.res132', r.id::text, false);
  update envios set estado = 'cancelado' where id = r.envio_id;
end $$;
set role anon;
do $$ declare c jsonb; begin
  c := carga_aceptada_publica(current_setting('prueba.res132')::uuid);
  if c ->> 'resultado' <> 'cerrada' or c ? 'conductor_telefono' then raise exception 'FALLO 132 · con el viaje terminado la llave sigue enseñando la carga: %', c; end if;
  begin perform datos_orden_publica(current_setting('prueba.res132')::uuid); raise exception 'FALLO 132 · con el viaje terminado se descarga la orden';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 132 · la llave del enlace de la carga deja de valer con el viaje terminado (sin datos, sin orden, sin CMR)';
end $$;
reset role;
-- Por fecha: sin marcar nada, la llave caduca 24 h después del último día de carga.
reset role;
do $$ declare r record; begin
  select x.id, x.envio_id into r from envio_reservas x join envios e on e.id = x.envio_id and e.transportista_id = x.transportista_id
   where x.estado = 'aceptada' and e.estado not in ('entregado', 'cancelado') limit 1;
  if r.id is null then raise notice 'AVISO 132 · no queda otra carga aceptada para probar la caducidad por fecha'; return; end if;
  update envios set fecha_carga_desde = current_date - 3, fecha_carga_hasta = current_date - 3, fecha_carga_real = null where id = r.envio_id;
  if carga_aceptada_publica(r.id) ->> 'resultado' <> 'cerrada' then raise exception 'FALLO 132 · pasada la fecha de carga + 24 h la llave sigue valiendo'; end if;
  update envios set fecha_carga_desde = current_date + 2, fecha_carga_hasta = current_date + 2 where id = r.envio_id;
  if carga_aceptada_publica(r.id) ->> 'resultado' <> 'aceptada' then raise exception 'FALLO 132 · antes de la fecha de carga la llave no vale'; end if;
  -- Desde el cierre del almacén de carga ese día: cierra a las 17:00 + 4 h = 21:00.
  declare l uuid; d date := current_date + 2; begin
    insert into sitios (nombre_empresa, cliente_id) values ('Almacén 132', (select cliente_id from envios where id = r.envio_id)) returning id into l;
    perform guardar_horario(l, (select jsonb_agg(jsonb_build_object('dia', g, 'abre', '08:00', 'cierra', '17:00')) from generate_series(1, 7) g));
    update envio_paradas set sitio_id = l where envio_id = r.envio_id and tipo = 'carga';
    if enlace_carga_caduca_en(r.envio_id) <> ((d + time '21:00')::timestamp at time zone 'Europe/Madrid') then
      raise exception 'FALLO 132 · la llave no caduca a las 21:00 (cierre 17:00 + 4 h): %', enlace_carga_caduca_en(r.envio_id);
    end if;
  end;
  raise notice 'OK 132b · la llave caduca por fecha: cierre del almacén de carga ese día + 4 h (parámetro), sin que nadie marque nada';
end $$;

-- ---- 133. Completar camión y conductor desde el enlace: un campo vacío no borra ---------
reset role;
do $$ declare r record; v jsonb; begin
  select x.id, x.envio_id into r from envio_reservas x join envios e on e.id = x.envio_id and e.transportista_id = x.transportista_id
   where x.estado = 'aceptada' and e.estado in ('programado', 'hacia_la_carga') and enlace_carga_vigente(e.id) limit 1;
  if r.id is null then raise exception 'FALLO 133 · no hay una carga aceptada y en plazo para probar'; end if;
  perform set_config('prueba.res133', r.id::text, false);
  perform set_config('prueba.env133', r.envio_id::text, false);
end $$;
set role anon;
do $$ declare v jsonb; begin
  v := completar_carga_publica(current_setting('prueba.res133')::uuid, '1111 bbb', 'r-2222-ccc', 'Conductor Prueba', '+34 600 000 133');
  if v ->> 'resultado' <> 'guardado' then raise exception 'FALLO 133 · no guarda: %', v; end if;
  v := completar_carga_publica(current_setting('prueba.res133')::uuid, '', '', '', '');
end $$;
reset role;
do $$ begin
  if (select (matricula_camion, matricula_remolque, conductor_nombre, conductor_telefono) from envios where id = current_setting('prueba.env133')::uuid)
     is distinct from ('1111BBB'::text, 'R2222CCC'::text, 'Conductor Prueba'::text, '+34600000133'::text) then
    raise exception 'FALLO 133 · un campo vacío borra lo que había: %', (select (matricula_camion, matricula_remolque, conductor_nombre, conductor_telefono) from envios where id = current_setting('prueba.env133')::uuid);
  end if;
  raise notice 'OK 133 · completar camión y conductor desde el enlace: un campo vacío no borra lo que había';
end $$;

-- ---- 134. Los datos del chófer van con su chófer; la matrícula trae a su chófer ------------
reset role;
do $$ declare t uuid; c uuid; begin
  select transportista_id, cliente_id into t, c from envios where id = current_setting('prueba.env133')::uuid;
  insert into envios (cliente_id, transportista_id, metros_lineales, toneladas, matricula_camion, conductor_nombre, conductor_telefono)
    values (c, t, 13.3, 20, '9999ZZZ', 'Chofer Camion', '+34600999999');
  insert into conductores (transportista_id, nombre, telefono) values (t, 'Ana Conocida', '+34600888888');
end $$;
set role anon;
do $$ declare res uuid := current_setting('prueba.res133')::uuid; e uuid := current_setting('prueba.env133')::uuid; v jsonb; begin
  perform completar_carga_publica(res, '', '', 'Nuevo Sin Telefono', '');
  v := carga_aceptada_publica(res);
  if v ->> 'conductor_telefono' is not null then raise exception 'FALLO 134 · un chófer nuevo se queda con el teléfono del anterior: %', v ->> 'conductor_telefono'; end if;
  perform completar_carga_publica(res, '', '', 'ana conocida', '');
  if carga_aceptada_publica(res) ->> 'conductor_telefono' <> '+34600888888' then raise exception 'FALLO 134 · un chófer conocido no trae su teléfono'; end if;
  perform completar_carga_publica(res, '', '', 'Ana Conocida', '');
  if carga_aceptada_publica(res) ->> 'conductor_telefono' <> '+34600888888' then raise exception 'FALLO 134 · el mismo chófer pierde su teléfono'; end if;
  if flota_sugerencia_publica(res, '9999 zzz') ->> 'conductor' <> 'Chofer Camion' then raise exception 'FALLO 134 · la pantalla no sugiere el chófer del camión'; end if;
  perform completar_carga_publica(res, '9999 ZZZ', '', '', '');
  v := carga_aceptada_publica(res);
  if v ->> 'conductor_nombre' <> 'Chofer Camion' or v ->> 'conductor_telefono' <> '+34600999999' then raise exception 'FALLO 134 · un camión conocido no trae a su chófer: %', v; end if;
  perform completar_carga_publica(res, '7777XXX', '', '', '');
  v := carga_aceptada_publica(res);
  if v ->> 'conductor_nombre' is not null or v ->> 'conductor_telefono' is not null then raise exception 'FALLO 134 · un camión sin historial se queda con el chófer del otro: %', v; end if;
  raise notice 'OK 134 · chófer nuevo: su teléfono o vacío (nunca el del anterior); camión nuevo: su chófer de otras veces o vacío';
end $$;
reset role;

-- ---- 135. CMR: el DNI del conductor no se enseña ni se rellena solo; la validez la decide la BD ----
reset role;
do $$ declare e uuid := current_setting('prueba.env133')::uuid; t uuid; tok uuid; begin
  select transportista_id into t from envios where id = e;
  update conductores set documento = '13513513B', documento_pais = 'ES' where transportista_id = t and nombre = 'Ana Conocida';
  update conductores set documento = null where transportista_id = t and nombre = 'Nuevo Sin Telefono';
  update envios set conductor_nombre = 'Ana Conocida', conductor_telefono = '+34600888888' where id = e;
  update cmr_enlaces set revocado = true where envio_id = e;
  insert into cmr_enlaces (envio_id) values (e) returning token into tok;
  insert into storage.objects (bucket_id, name) values ('documentos', 'cmr/' || tok || '/a.png'), ('documentos', 'cmr/' || tok || '/b.png');
  perform set_config('prueba.tok135', tok::text, false);
end $$;
set role anon;
do $$ declare tok uuid := current_setting('prueba.tok135')::uuid; v jsonb; r jsonb; begin
  v := cmr_publico(tok);
  if v::text like '%513B%' or v ? 'conductor_documento' then raise exception 'FALLO 135 · el CMR enseña el DNI del conductor'; end if;
  -- Sin escribir el documento no se firma, aunque el nombre sea el del conductor.
  r := firmar_cmr_publico(tok, null, 'transportista', 'Ana Conocida', '', 'ES', true, null, 'cmr/' || tok || '/a.png', null, 'prueba', null);
  if r ->> 'resultado' <> 'faltan_datos' then raise exception 'FALLO 135 · se firma la casilla del conductor sin escribir su DNI: %', r; end if;
  -- La validez del documento la decide la base de datos, no quien llama.
  r := firmar_cmr_publico(tok, null, 'transportista', 'Ana Conocida', '12345678A', 'ES', true, null, 'cmr/' || tok || '/b.png', null, 'prueba', null);
  if r ->> 'resultado' <> 'firmada' then raise exception 'FALLO 135 · no firma: %', r; end if;
  -- Los anónimos no listan el almacén (las rutas llevan las llaves de los CMR).
  if exists (select 1 from storage.objects where name like 'cmr/%') then raise exception 'FALLO 135 · un anónimo lista las rutas de los CMR (y sus llaves)'; end if;
end $$;
reset role;
do $$ begin
  if (select documento_validado from firmas_cmr where envio_id = current_setting('prueba.env133')::uuid and rol = 'transportista') then
    raise exception 'FALLO 135 · un DNI con la letra mal queda como validado porque lo dice quien llama';
  end if;
  if not documento_es_valido('13513513R') or documento_es_valido('13513513B') or not documento_es_valido('X1234567L') then raise exception 'FALLO 135 · la comprobación del DNI/NIE falla'; end if;
  if (select documento from conductores c join envios e on e.transportista_id = c.transportista_id where e.id = current_setting('prueba.env133')::uuid and c.nombre = 'Ana Conocida') <> '13513513B' then
    raise exception 'FALLO 135 · una firma pública cambia el DNI de la ficha del conductor';
  end if;
  raise notice 'OK 135 · CMR: el DNI del conductor ni se enseña ni se rellena, la BD decide si es válido, la firma no toca su ficha y los anónimos no listan el almacén';
end $$;

-- ---- 136. Arreglos pequeños del repaso del diccionario -------------------------------------
reset role;
do $$ declare t uuid := current_setting('prueba.transp')::uuid; v uuid; begin
  begin update transportistas set iva_pct = 150 where id = t; raise exception 'FALLO 136 · IVA del transportista de 150 %%';
  exception when check_violation then null; end;
  if (select column_default from information_schema.columns where table_name = 'envios' and column_name = 'carga_trasera') <> 'false' then
    raise exception 'FALLO 136 · carga_trasera sigue marcada por defecto';
  end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin perform envios_que_cuentan(current_setting('prueba.cliente')::uuid); raise exception 'FALLO 136 · se llama a envios_que_cuentan desde la API';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 136 · IVA y retención del transportista de 0 a 100, carga trasera «no» por defecto, cifras de otros clientes cerradas';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 137. Conteos de envíos en la base de datos (sin descargar filas) ----------------------
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare a bigint; b bigint; begin
  select coalesce(sum(envios), 0) into a from envios_por_empresa('cliente');
  select count(*) into b from envios where not es_manual and estado not in ('borrador', 'cancelado');
  if a <> b then raise exception 'FALLO 137 · el conteo por cliente no cuadra: % vs %', a, b; end if;
  select coalesce(sum(envios), 0) into a from uso_envios_usuarios();
  select count(*) into b from envios where creado_por is not null and estado <> 'borrador';
  if a <> b then raise exception 'FALLO 137 · el uso por usuario no cuadra: % vs %', a, b; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if exists (select 1 from envios_por_empresa('cliente') where id <> current_setting('prueba.cliente')::uuid) then
    raise exception 'FALLO 137 · un cliente cuenta envíos de otros clientes';
  end if;
  raise notice 'OK 137 · conteos de envíos por empresa y por usuario en la base de datos; cada uno cuenta lo que puede ver';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 138. Buscador de envíos para años de datos ------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare e record; begin
  select x.id, x.referencia_gx, x.cliente_id, x.transportista_id into e from envios x
   where x.cliente_id = current_setting('prueba.cliente')::uuid and x.transportista_id = current_setting('prueba.transp')::uuid limit 1;
  if e.id is null then raise exception 'FALLO 138 · no hay envío de prueba con cliente y transportista'; end if;
  update envios set matricula_camion = '1388ZXY', fecha_carga_real = date '2022-03-15' where id = e.id;
  update envio_paradas set poblacion = 'Villabusquedilla' where envio_id = e.id and orden = 1;
  perform set_config('prueba.e138', e.id::text, false);
  perform set_config('prueba.ref138', e.referencia_gx, false);
  if (select texto_busqueda from envios where id = e.id) not like '%villabusquedilla%' then raise exception 'FALLO 138 · el texto de búsqueda no recoge las paradas'; end if;
  if exists (select 1 from auditoria where tabla = 'envios' and cambios ? 'texto_busqueda') then raise exception 'FALLO 138 · la auditoría apunta el texto de búsqueda'; end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare n bigint; begin
  if not exists (select 1 from buscar_envios_pagina(current_setting('prueba.ref138')) where id = current_setting('prueba.e138')::uuid) then raise exception 'FALLO 138 · Dynamo no encuentra un envío por su número'; end if;
  if not exists (select 1 from buscar_envios_pagina('VILLABÚSQUEDILLA 1388zxy') where id = current_setting('prueba.e138')::uuid) then raise exception 'FALLO 138 · no busca por varias palabras, sin acentos ni mayúsculas'; end if;
  if not exists (select 1 from buscar_envios_pagina('1388zxy', date '2022-01-01', date '2022-12-31')) then raise exception 'FALLO 138 · el filtro de fechas deja fuera lo que está dentro'; end if;
  if exists (select 1 from buscar_envios_pagina('1388zxy', date '2023-01-01', null)) then raise exception 'FALLO 138 · el filtro de fechas no filtra'; end if;
  select max(total) into n from buscar_envios_pagina(null, date '2000-01-01', null, 1, 1);
  if n < 2 or (select count(*) from buscar_envios_pagina(null, date '2000-01-01', null, 2, 1)) <> 1 then raise exception 'FALLO 138 · la paginación no va'; end if;
end $$;
reset role;
update usuarios set estado = 'activa' where id = current_setting('prueba.u_cli')::uuid;   -- lo suspendió una prueba anterior
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if not exists (select 1 from buscar_envios_pagina('villabusquedilla') where id = current_setting('prueba.e138')::uuid) then raise exception 'FALLO 138 · el cliente no encuentra su envío (cli=%, estado=%)', cliente_del_usuario(), (select estado from usuarios where id = auth.uid()); end if;
  if exists (select 1 from buscar_envios_pagina(null, date '2000-01-01') b join envios x on x.id = b.id where x.cliente_id <> current_setting('prueba.cliente')::uuid) then
    raise exception 'FALLO 138 · el cliente encuentra envíos de otros';
  end if;
  if (select count(*) from mis_envios_por_ids(array[current_setting('prueba.e138')::uuid])) <> 1 then raise exception 'FALLO 138 · el cliente no lee su envío por id'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_transp'), false);
set role authenticated;
do $$ declare v_cli text; begin
  select lower(split_part(razon_social, ' ', 1)) into v_cli from clientes where id = current_setting('prueba.cliente')::uuid;
  if not exists (select 1 from buscar_envios_pagina('1388zxy') where id = current_setting('prueba.e138')::uuid) then raise exception 'FALLO 138 · el transportista no encuentra su viaje por la matrícula'; end if;
  if exists (select 1 from buscar_envios_pagina(v_cli || ' 1388zxy')) then raise exception 'FALLO 138 · el transportista encuentra viajes buscando el nombre del cliente (%)', v_cli; end if;
  raise notice 'OK 138 · buscador: años de datos con índice, palabras sin acentos, fechas, páginas; cada uno en lo suyo y el transportista sin datos del cliente';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare l text; plan text := ''; begin
  set local enable_seqscan = off;
  for l in execute 'explain select id from envios where texto_busqueda like ''%villabusq%''' loop plan := plan || l || ' '; end loop;
  if plan not like '%idx_envios_busqueda%' then raise exception 'FALLO 138 · la búsqueda no usa el índice: %', plan; end if;
  raise notice 'OK 138b · la búsqueda de texto usa el índice de trigramas';
end $$;

-- ---- 139. Arreglos de la revisión de lógica ----------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
update parametros set valor = 'false' where clave = 'pago_previo_activo';
do $$ declare e uuid; begin
  insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, fecha_carga_desde)
    values (current_setting('prueba.cliente')::uuid, 13.30, 20, 1000, 800, current_date + 3) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'ES');
  update envios set estado = 'programado' where id = e;
  perform set_config('prueba.tok139', (select token_publico::text from envios where id = e), false);
  -- El plazo para pagar no acaba en fin de semana: viernes 18:00 + 24 h → lunes 18:00.
  if pago_limite(timestamptz '2026-11-06 18:00:00+01') <> timestamptz '2026-11-09 18:00:00+01' then
    raise exception 'FALLO 139 · el plazo para pagar acaba en fin de semana: %', pago_limite(timestamptz '2026-11-06 18:00:00+01');
  end if;
end $$;
set role anon;
do $$ declare r jsonb; a jsonb; begin
  r := reservar_envio_publico(current_setting('prueba.tok139')::uuid, '10.1.3.9');
  a := aceptar_oferta_publica((r ->> 'reserva_id')::uuid, 'B59000059');
  if coalesce(a ->> 'resultado', '') not in ('aceptada', 'pendiente_revision') then raise exception 'FALLO 139 · aceptar desde el tablón (sin oferta) falla: %', a; end if;
end $$;
reset role;
-- Cobro con tarjeta por otro importe: aviso y el envío no se anula por falta de pago.
update parametros set valor = 'true' where clave = 'pago_previo_activo';
do $$ declare c uuid; e uuid; begin
  insert into clientes (razon_social, cif) values ('Cobro 139 SL', 'B13913913') returning id into c;
  insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, fecha_carga_desde)
    values (c, 13.30, 20, 1000, 800, current_date + 3) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'ES');
  update envios set estado = 'programado' where id = e;
  if (pago_envio_stripe(e, 'pi_139', 99900)) ->> 'resultado' <> 'importe_distinto' then raise exception 'FALLO 139 · no detecta el importe distinto'; end if;
  if (select stripe_cobro_sin_aplicar from envios where id = e) is distinct from 'pi_139'
     or not exists (select 1 from avisos where tipo = 'pago_no_aplicado' and envio_id = e) then
    raise exception 'FALLO 139 · el cobro no aplicado no queda apuntado ni avisa a Dynamo';
  end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  update envios set pago_pendiente_en = now() - interval '5 days' where id = e;
  perform set_config('request.jwt.claim.role', '', true);
  perform caducar_pagos_pendientes();
  if (select estado from envios where id = e) <> 'programado' then raise exception 'FALLO 139 · se anula un envío con un cobro con tarjeta recibido'; end if;
  perform set_config('prueba.e139p', e::text, false);
end $$;
update parametros set valor = 'false' where clave = 'pago_previo_activo';
-- Solicitudes: rechazar no cuenta; aceptar solo el precio visto; deshacer vuelve a solicitud.
do $$ declare a uuid; b uuid; begin
  insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, fecha_carga_desde, estado_solicitud, precio_caduca_en)
    values (current_setting('prueba.cliente')::uuid, 8, 10, 500, 400, current_date + 3, 'precio_propuesto', now() + interval '2 hours') returning id into a;
  insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, fecha_carga_desde, estado_solicitud, precio_caduca_en)
    values (current_setting('prueba.cliente')::uuid, 8, 10, 500, 400, current_date + 3, 'precio_propuesto', now() + interval '2 hours') returning id into b;
  perform set_config('prueba.s139a', a::text, false);
  perform set_config('prueba.s139b', b::text, false);
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  if responder_precio_solicitud(current_setting('prueba.s139b')::uuid, true, 400) <> 'precio_cambiado' then raise exception 'FALLO 139 · el cliente acepta un precio que no ha visto'; end if;
  perform responder_precio_solicitud(current_setting('prueba.s139a')::uuid, false);
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  if not (select cancelacion_sin_coste from envios where id = current_setting('prueba.s139a')::uuid) then raise exception 'FALLO 139 · rechazar el precio de una solicitud cuenta como cancelación'; end if;
  if (select confirmado_en from envios where id = current_setting('prueba.s139a')::uuid) is not null then raise exception 'FALLO 139 · cancelar una solicitud la da por confirmada'; end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  if deshacer_cancelacion(current_setting('prueba.s139a')::uuid) <> 'borrador' then raise exception 'FALLO 139 · deshacer una solicitud rechazada la pasa a programada'; end if;
  if (marcar_pago_envio(current_setting('prueba.e139p')::uuid, 'tarjeta')) ->> 'resultado' <> 'ok' then raise exception 'FALLO 139 · Dynamo no puede dar por pagado un cobro con tarjeta no aplicado'; end if;
  begin
    update envios set importe_cliente = 1400 where id = current_setting('prueba.e139p')::uuid;
    raise exception 'FALLO 139 · se cambia el precio de un envío pagado';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 139 · lógica: tablón sin oferta, cobro con tarjeta no aplicado (avisa, no anula, se da por pagado), precio fijo tras pagar, rechazar no cuenta, precio visto, deshacer solicitud, plazo de pago en día hábil';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 140. Arreglos de seguridad de las revisiones -----------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare emp uuid; ca uuid; cb uuid; ua uuid; ub uuid; e2 uuid; begin
  insert into sitios (nombre_empresa, es_almacen_dynamo, codigo_postal) values ('Almacén Dynamo 140', true, '41001');
  insert into auth.users (email, invited_at) values ('empleado140@dynamo.prueba', now()) returning id into emp;
  update usuarios set rol = 'empleado', estado = 'activa' where id = emp;
  perform set_config('prueba.u_emp140', emp::text, false);
  -- Cliente del envío con firmas del CMR (prueba 135) y otro cliente que no tiene nada que ver.
  select cliente_id into ca from envios where id = current_setting('prueba.env133')::uuid;
  insert into clientes (razon_social, cif) values ('Ajeno 140 SL', 'B14014014') returning id into cb;
  insert into auth.users (email) values ('cli140a@prueba.prueba') returning id into ua;
  insert into auth.users (email) values ('cli140b@prueba.prueba') returning id into ub;
  update usuarios set rol = 'cliente', estado = 'activa', cliente_id = ca where id = ua;
  update usuarios set rol = 'cliente', estado = 'activa', cliente_id = cb where id = ub;
  perform set_config('prueba.u_cli140a', ua::text, false);
  perform set_config('prueba.u_cli140b', ub::text, false);
  select id into e2 from envios where cliente_id <> ca limit 1;
  perform set_config('prueba.e140otro', e2::text, false);
end $$;
-- Anónimos: no leen los almacenes de Dynamo.
set role anon;
do $$ begin
  if exists (select 1 from sitios where nombre_empresa = 'Almacén Dynamo 140') then raise exception 'FALLO 140 · un anónimo lee los almacenes de Dynamo'; end if;
end $$;
reset role;
-- Un empleado no toca la cuenta del Admin Master.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_emp140'), false);
set role authenticated;
do $$ begin
  begin
    update usuarios set rol = 'empleado' where id = current_setting('prueba.u_admin')::uuid;
    if found then raise exception 'FALLO 140 · un empleado le quita el rol al Admin Master'; end if;
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- El cliente del envío ve el trazo de su firma; otro cliente, ni las rutas. La línea de pronto
-- pago no se le enseña. Una incidencia suya no se cuelga de otro envío.
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli140a'), false);
set role authenticated;
do $$ declare i uuid; p jsonb; begin
  if not exists (select 1 from storage.objects where name like 'cmr/' || current_setting('prueba.tok135') || '/%') then
    raise exception 'FALLO 140 · el cliente no ve el trazo de la firma de su CMR';
  end if;
  if (select count(*) from firmas_envio(current_setting('prueba.env133')::uuid)) = 0 then raise exception 'FALLO 140 · el cliente no ve las firmas de su CMR'; end if;
  p := pronto_pago_estado();
  if p ? 'linea' or p ? 'usado' or p ? 'disponible' then raise exception 'FALLO 140 · el cliente ve la línea de pronto pago de Dynamo: %', p; end if;
  insert into incidencias (tipo_id, envio_id, titulo, detalle)
    values ((select id from tipos_incidencia limit 1), current_setting('prueba.env133')::uuid, 'Prueba 140', 'Detalle') returning id into i;
  update incidencias set envio_id = current_setting('prueba.e140otro')::uuid where id = i;
  perform set_config('prueba.inc140', i::text, false);
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli140b'), false);
set role authenticated;
do $$ begin
  if exists (select 1 from storage.objects where name like 'cmr/%') then raise exception 'FALLO 140 · otro cliente lista las rutas de los CMR (y sus llaves)'; end if;
  if (select count(*) from firmas_envio(current_setting('prueba.env133')::uuid)) > 0 then raise exception 'FALLO 140 · otro cliente ve las firmas de un CMR ajeno'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  if (select envio_id from incidencias where id = current_setting('prueba.inc140')::uuid) <> current_setting('prueba.env133')::uuid then
    raise exception 'FALLO 140 · el cliente cuelga su incidencia de otro envío';
  end if;
  if (select rol from usuarios where id = current_setting('prueba.u_admin')::uuid) <> 'admin' then raise exception 'FALLO 140 · el Admin Master perdió el rol'; end if;
  raise notice 'OK 140 · seguridad: almacenes de Dynamo sin sesión, Admin Master intocable para empleados, trazos del CMR solo para su envío, pronto pago reducido, incidencia no se reasigna';
end $$;

-- ---- 141. Carpeta «tarifa»: privada para la web -------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
create table tarifa.prueba141 (id int);
do $$ begin
  if not exists (select 1 from pg_namespace where nspname = 'tarifa') then raise exception 'FALLO 141 · no existe la carpeta tarifa'; end if;
  if has_schema_privilege('anon', 'tarifa', 'usage') or has_schema_privilege('authenticated', 'tarifa', 'usage') then
    raise exception 'FALLO 141 · la web puede entrar en la carpeta tarifa';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'tarifa' and grantee in ('anon', 'authenticated', 'PUBLIC')) then
    raise exception 'FALLO 141 · una tabla del tarifador tiene permisos para la web';
  end if;
end $$;
set role authenticated;
do $$ begin
  begin
    perform 1 from tarifa.prueba141;
    raise exception 'FALLO 141 · un usuario con sesión lee una tabla del tarifador';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
drop table tarifa.prueba141;
do $$ begin raise notice 'OK 141 · carpeta tarifa: existe, la web no entra y sus tablas nuevas nacen sin permisos para la web'; end $$;

-- ---- 142. «Lugares» se llama «sitios» en toda la base de datos ---------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare v text; s uuid; n int; begin
  select string_agg(x, ', ') into v from (
    select 'tabla ' || relname x from pg_class where relnamespace = 'public'::regnamespace and relname ~ 'lugar'
    union all select 'columna ' || c.relname || '.' || a.attname from pg_attribute a join pg_class c on c.oid = a.attrelid
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm') and a.attnum > 0 and not a.attisdropped and a.attname ~ 'lugar'
    union all select 'tipo ' || typname from pg_type where typnamespace = 'public'::regnamespace and typname ~ 'lugar'
    union all select 'función ' || proname from pg_proc where pronamespace = 'public'::regnamespace
      and (proname ~ 'lugar' or pg_get_function_arguments(oid) ~ 'lugar' or prosrc ~ '\m(lugares|[a-z0-9_]*lugar_[a-z0-9_]*|[a-z0-9_]+_lugar[a-z0-9_]*)\M')
    union all select 'política ' || policyname from pg_policies where schemaname = 'public' and policyname ~ 'lugar'
    union all select 'disparador ' || tgname from pg_trigger where not tgisinternal and tgname ~ 'lugar'
    union all select 'restricción ' || conname from pg_constraint where connamespace = 'public'::regnamespace and conname ~ 'lugar') q;
  -- historial_registro nombra a propósito la tabla vieja para el historial de antes del cambio.
  v := nullif(regexp_replace(coalesce(v, ''), '(, )?función historial_registro', ''), '');
  if v is not null then raise exception 'FALLO 142 · queda «lugar» en: %', v; end if;
  -- El historial anterior al cambio (auditoria.tabla = 'lugares') se sigue viendo.
  select id into s from sitios where cliente_id is not null limit 1;
  insert into auditoria (tabla, registro_id, accion, quien_origen, cambios, cuando)
    values ('lugares', s::text, 'baja', (select quien_origen from auditoria limit 1), '{}'::jsonb, timestamptz '2026-01-02 10:00:00+01');
  perform set_config('prueba.sitio142', s::text, false);
  raise notice 'OK 142 · todo se llama «sitios» (tablas, columnas, funciones, políticas…) y el historial anterior se sigue viendo';
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ begin
  if not exists (select 1 from historial_registro('sitios', current_setting('prueba.sitio142')::uuid) where cuando = timestamptz '2026-01-02 10:00:00+01') then
    raise exception 'FALLO 142 · el historial de antes del cambio de nombre no sale en la ficha del sitio';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 143. Reglas de asignación y estado en la base de datos; funciones para n8n --------
reset role;
select set_config('request.jwt.claim.sub', '', false);
update parametros set valor = 'false' where clave = 'pago_previo_activo';
do $$ declare t uuid; e uuid; begin
  insert into transportistas (razon_social, cif, nima) values ('Suspendido 143 SL', 'B14314314', 'NIMA-143') returning id into t;
  update transportistas set estado_operativo = 'suspendido' where id = t;
  insert into envios (cliente_id, metros_lineales, toneladas, importe_cliente, importe_transportista, fecha_carga_desde)
    values (current_setting('prueba.cliente')::uuid, 13.30, 20, 1000, 800, current_date + 3) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
  insert into envio_paradas (envio_id, orden, tipo, codigo_postal, poblacion, pais_codigo_iso) values (e, 2, 'descarga', '28001', 'Madrid', 'ES');
  update envios set estado = 'programado' where id = e;
  perform set_config('prueba.t143', t::text, false);
  perform set_config('prueba.e143', e::text, false);
end $$;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_admin'), false);
set role authenticated;
do $$ declare e uuid := current_setting('prueba.e143')::uuid; r jsonb; begin
  -- Escribiendo en la tabla (como haría n8n sin la función): un suspendido no recibe carga.
  begin
    update envios set transportista_id = current_setting('prueba.t143')::uuid where id = e;
    raise exception 'FALLO 143 · se da carga a un transportista suspendido escribiendo en la tabla';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  r := asignar_transportista(e, current_setting('prueba.t143')::uuid);
  if r ->> 'resultado' <> 'transportista_suspendido' or (r ->> 'ok')::boolean then raise exception 'FALLO 143 · asignar_transportista no frena al suspendido: %', r; end if;
  -- Sin transportista no pasa de programado.
  begin
    update envios set estado = 'en_ruta' where id = e;
    raise exception 'FALLO 143 · un envío sin transportista pasa a en ruta';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  if marcar_estado_envio(e, 'cargando') ->> 'resultado' <> 'sin_transportista' then raise exception 'FALLO 143 · marcar_estado_envio deja cargar sin transportista'; end if;
  -- Asignar bien: copia el NIMA y normaliza matrícula y teléfono.
  r := asignar_transportista(e, current_setting('prueba.transp')::uuid, 750, '1234 abc', null, 'Pepe', '+34 600 11 22 33');
  if not (r ->> 'ok')::boolean then raise exception 'FALLO 143 · asignar_transportista falla: %', r; end if;
  if (select (estado_asignacion::text, matricula_camion, conductor_telefono, importe_transportista) from envios where id = e)
     is distinct from ('confirmada'::text, '1234ABC'::text, '+34600112233'::text, 750::numeric) then
    raise exception 'FALLO 143 · la asignación no queda bien: %', (select row(estado_asignacion, matricula_camion, conductor_telefono, importe_transportista) from envios where id = e);
  end if;
  if (select transportista_nima from envios where id = e) is distinct from (select nima from transportistas where id = current_setting('prueba.transp')::uuid) then
    raise exception 'FALLO 143 · no copia el NIMA del transportista';
  end if;
  if marcar_estado_envio(e, 'hacia_la_carga') ->> 'resultado' <> 'cambiado' then raise exception 'FALLO 143 · marcar_estado_envio no cambia la fase'; end if;
  update envios set estado = 'programado' where id = e;
  -- Quitarlo limpia camión, conductor y precio.
  if quitar_transportista(e) ->> 'resultado' <> 'quitado' then raise exception 'FALLO 143 · quitar_transportista falla'; end if;
  if (select (transportista_id, matricula_camion, conductor_nombre, importe_transportista, transportista_nima, estado_asignacion::text) from envios where id = e)
     is distinct from (null::uuid, null::text, null::text, null::numeric, null::text, 'sin_asignar'::text) then
    raise exception 'FALLO 143 · quitar el transportista deja datos suyos';
  end if;
  if not exists (select 1 from funciones_api() where funcion = 'asignar_transportista' and argumentos like '%DEFAULT%' and not sin_sesion) then
    raise exception 'FALLO 143 · funciones_api no enseña los valores por defecto o si es pública';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ begin
  begin
    perform asignar_transportista(current_setting('prueba.e143')::uuid, current_setting('prueba.transp')::uuid);
    raise exception 'FALLO 143 · un cliente asigna transportistas';
  exception when insufficient_privilege then null; end;
  if (select iva_pct from mi_empresa()) is null then raise exception 'FALLO 143 · mi_empresa no da el IVA del cliente'; end if;
  raise notice 'OK 143 · asignación y fase con reglas en la base de datos (suspendido, sin camión, NIMA, limpieza), funciones para n8n, IVA en mi_empresa';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- 144. Fase 2 de nombres: no queda ningún nombre viejo ------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare v text; begin
  select string_agg(x, ', ') into v from (
    select 'columna ' || c.relname || '.' || a.attname x from pg_attribute a join pg_class c on c.oid = a.attrelid
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped and a.attname = any (array['almacen_logistico', 'anotar_reservas_cmr', 'autosusp_desde', 'autosusp_en_curso', 'autosusp_revisar', 'cambio_cliente_estado', 'carga_superior', 'contraoferta_cliente', 'copias_avisos', 'es_admin', 'es_administrador', 'estado_ticket', 'euros_txt', 'exige_pin', 'factor_tarifa_aplicado', 'factor_tarifa_porcentaje', 'fn_fuera_de_cobertura', 'fn_guardar_km_cp', 'fn_guardar_km_sitios', 'fn_km_cp', 'fn_km_sitios', 'fn_restriccion_punto', 'fn_restricciones_ruta', 'forma_pago_holded_id', 'hora_real', 'horario_sitio_txt', 'incidencias_notas', 'iva_aplicado', 'iva_porcentaje', 'km_hasta_siguiente', 'km_total', 'liberar_reserva', 'limite_cargas_diario', 'logo_url', 'mi_conductor_guardar', 'mi_flota_baja', 'mi_transporte_guardar', 'mi_vehiculo_guardar', 'nima_requerido', 'normaliza_cp', 'normaliza_id_fiscal', 'normaliza_matricula', 'numero_bultos', 'orden_transporte_enviada', 'p_num', 'pago_adelantado', 'pago_pendiente_desde', 'pago_previo', 'pais_destino', 'pais_origen', 'paletizado_lateral', 'pedido_compra_holded', 'pedido_venta_holded', 'plataforma_elevadora', 'plataforma_elevadora_defecto', 'plazo_pago_aplicado', 'precio_inicial_cliente', 'precio_revisar', 'precio_revision', 'precio_revision_anterior', 'precio_revision_en', 'precio_revision_fecha', 'precio_revision_nuevo', 'precio_revision_recordado', 'precio_valido_hasta', 'prioridad_ticket', 'recargo_equivalencia_porcentaje', 'recargo_pago_tarde_porcentaje', 'reservar_envio', 'retencion_aplicada', 'retencion_porcentaje', 'revision_precio_envio', 'sin_autosuspension', 'sin_pago_previo_primer_envio', 'sitio_defecto_id', 'solicitud_estado', 'stripe_pago', 'tipo_entidad', 'tipo_ticket', 'trampilla'])
    union all select 'función ' || proname from pg_proc where pronamespace = 'public'::regnamespace and proname = any (array['almacen_logistico', 'anotar_reservas_cmr', 'autosusp_desde', 'autosusp_en_curso', 'autosusp_revisar', 'cambio_cliente_estado', 'carga_superior', 'contraoferta_cliente', 'copias_avisos', 'es_admin', 'es_administrador', 'estado_ticket', 'euros_txt', 'exige_pin', 'factor_tarifa_aplicado', 'factor_tarifa_porcentaje', 'fn_fuera_de_cobertura', 'fn_guardar_km_cp', 'fn_guardar_km_sitios', 'fn_km_cp', 'fn_km_sitios', 'fn_restriccion_punto', 'fn_restricciones_ruta', 'forma_pago_holded_id', 'hora_real', 'horario_sitio_txt', 'incidencias_notas', 'iva_aplicado', 'iva_porcentaje', 'km_hasta_siguiente', 'km_total', 'liberar_reserva', 'limite_cargas_diario', 'logo_url', 'mi_conductor_guardar', 'mi_flota_baja', 'mi_transporte_guardar', 'mi_vehiculo_guardar', 'nima_requerido', 'normaliza_cp', 'normaliza_id_fiscal', 'normaliza_matricula', 'numero_bultos', 'orden_transporte_enviada', 'p_num', 'pago_adelantado', 'pago_pendiente_desde', 'pago_previo', 'pais_destino', 'pais_origen', 'paletizado_lateral', 'pedido_compra_holded', 'pedido_venta_holded', 'plataforma_elevadora', 'plataforma_elevadora_defecto', 'plazo_pago_aplicado', 'precio_inicial_cliente', 'precio_revisar', 'precio_revision', 'precio_revision_anterior', 'precio_revision_en', 'precio_revision_fecha', 'precio_revision_nuevo', 'precio_revision_recordado', 'precio_valido_hasta', 'prioridad_ticket', 'recargo_equivalencia_porcentaje', 'recargo_pago_tarde_porcentaje', 'reservar_envio', 'retencion_aplicada', 'retencion_porcentaje', 'revision_precio_envio', 'sin_autosuspension', 'sin_pago_previo_primer_envio', 'sitio_defecto_id', 'solicitud_estado', 'stripe_pago', 'tipo_entidad', 'tipo_ticket', 'trampilla'])
    union all select 'tipo ' || typname from pg_type where typnamespace = 'public'::regnamespace and typname = any (array['almacen_logistico', 'anotar_reservas_cmr', 'autosusp_desde', 'autosusp_en_curso', 'autosusp_revisar', 'cambio_cliente_estado', 'carga_superior', 'contraoferta_cliente', 'copias_avisos', 'es_admin', 'es_administrador', 'estado_ticket', 'euros_txt', 'exige_pin', 'factor_tarifa_aplicado', 'factor_tarifa_porcentaje', 'fn_fuera_de_cobertura', 'fn_guardar_km_cp', 'fn_guardar_km_sitios', 'fn_km_cp', 'fn_km_sitios', 'fn_restriccion_punto', 'fn_restricciones_ruta', 'forma_pago_holded_id', 'hora_real', 'horario_sitio_txt', 'incidencias_notas', 'iva_aplicado', 'iva_porcentaje', 'km_hasta_siguiente', 'km_total', 'liberar_reserva', 'limite_cargas_diario', 'logo_url', 'mi_conductor_guardar', 'mi_flota_baja', 'mi_transporte_guardar', 'mi_vehiculo_guardar', 'nima_requerido', 'normaliza_cp', 'normaliza_id_fiscal', 'normaliza_matricula', 'numero_bultos', 'orden_transporte_enviada', 'p_num', 'pago_adelantado', 'pago_pendiente_desde', 'pago_previo', 'pais_destino', 'pais_origen', 'paletizado_lateral', 'pedido_compra_holded', 'pedido_venta_holded', 'plataforma_elevadora', 'plataforma_elevadora_defecto', 'plazo_pago_aplicado', 'precio_inicial_cliente', 'precio_revisar', 'precio_revision', 'precio_revision_anterior', 'precio_revision_en', 'precio_revision_fecha', 'precio_revision_nuevo', 'precio_revision_recordado', 'precio_valido_hasta', 'prioridad_ticket', 'recargo_equivalencia_porcentaje', 'recargo_pago_tarde_porcentaje', 'reservar_envio', 'retencion_aplicada', 'retencion_porcentaje', 'revision_precio_envio', 'sin_autosuspension', 'sin_pago_previo_primer_envio', 'sitio_defecto_id', 'solicitud_estado', 'stripe_pago', 'tipo_entidad', 'tipo_ticket', 'trampilla'])
    union all select 'valor ' || enumlabel from pg_enum where enumlabel in ('paletizado_lateral', 'orden_transporte_enviada')
    union all select 'función que usa ' || p.proname || ' → ' || t from pg_proc p, unnest(array['almacen_logistico', 'anotar_reservas_cmr', 'autosusp_desde', 'autosusp_en_curso', 'autosusp_revisar', 'cambio_cliente_estado', 'carga_superior', 'contraoferta_cliente', 'copias_avisos', 'es_admin', 'es_administrador', 'estado_ticket', 'euros_txt', 'exige_pin', 'factor_tarifa_aplicado', 'factor_tarifa_porcentaje', 'fn_fuera_de_cobertura', 'fn_guardar_km_cp', 'fn_guardar_km_sitios', 'fn_km_cp', 'fn_km_sitios', 'fn_restriccion_punto', 'fn_restricciones_ruta', 'forma_pago_holded_id', 'hora_real', 'horario_sitio_txt', 'incidencias_notas', 'iva_aplicado', 'iva_porcentaje', 'km_hasta_siguiente', 'km_total', 'liberar_reserva', 'limite_cargas_diario', 'logo_url', 'mi_conductor_guardar', 'mi_flota_baja', 'mi_transporte_guardar', 'mi_vehiculo_guardar', 'nima_requerido', 'normaliza_cp', 'normaliza_id_fiscal', 'normaliza_matricula', 'numero_bultos', 'orden_transporte_enviada', 'p_num', 'pago_adelantado', 'pago_pendiente_desde', 'pago_previo', 'pais_destino', 'pais_origen', 'paletizado_lateral', 'pedido_compra_holded', 'pedido_venta_holded', 'plataforma_elevadora', 'plataforma_elevadora_defecto', 'plazo_pago_aplicado', 'precio_inicial_cliente', 'precio_revisar', 'precio_revision', 'precio_revision_anterior', 'precio_revision_en', 'precio_revision_fecha', 'precio_revision_nuevo', 'precio_revision_recordado', 'precio_valido_hasta', 'prioridad_ticket', 'recargo_equivalencia_porcentaje', 'recargo_pago_tarde_porcentaje', 'reservar_envio', 'retencion_aplicada', 'retencion_porcentaje', 'revision_precio_envio', 'sin_autosuspension', 'sin_pago_previo_primer_envio', 'sitio_defecto_id', 'solicitud_estado', 'stripe_pago', 'tipo_entidad', 'tipo_ticket', 'trampilla']) t
     where p.pronamespace = 'public'::regnamespace and t <> 'trampilla' and p.prosrc ~ ('\m' || t || '\M')
    union all select 'parámetro ' || clave from parametros where clave like 'autosusp\_%' or clave like 'previo\_pago\_%'
    union all select 'documento ' || tipo from documentos where tipo = 'orden_transporte') q;
  if v is not null then raise exception 'FALLO 144 · quedan nombres viejos: %', v; end if;
  if not exists (select 1 from pg_proc where proname = 'es_equipo_dynamo') or not exists (select 1 from pg_proc where proname = 'es_admin_master') then
    raise exception 'FALLO 144 · faltan es_equipo_dynamo / es_admin_master';
  end if;
  raise notice 'OK 144 · nombres homogéneos: ningún nombre viejo en tablas, vistas, funciones, tipos, parámetros ni documentos';
end $$;
