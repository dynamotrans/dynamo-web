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
  insert into envio_paradas (envio_id, orden, tipo, cp, poblacion, pais_codigo_iso)
    values (e, 1, 'carga', '41001', 'Sevilla', 'ES') returning id into p1;
  insert into envio_paradas (envio_id, orden, tipo, cp, poblacion, pais_codigo_iso)
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
  insert into envio_paradas (envio_id, orden, tipo, cp, poblacion) values (e, 1, 'carga', '41001', 'Sevilla');
  insert into envio_paradas (envio_id, orden, tipo, cp, poblacion) values (e, 2, 'descarga', '46001', 'Valencia');
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
  select count(*) into n from envio_paradas where envio_id = e;
  if n <> 2 then raise exception 'FALLO 15 · el transportista no ve las paradas de su envio (%)', n; end if;
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
  insert into envio_paradas (envio_id, orden, tipo, cp, poblacion) values (e, 1, 'carga', '41001', 'Sevilla');
  insert into envio_paradas (envio_id, orden, tipo, cp, poblacion) values (e, 2, 'descarga', '29001', 'Malaga');
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
    insert into envio_paradas (envio_id, orden, tipo, lugar_id, cp, poblacion)
      values (e, 1, 'carga', current_setting('prueba.lugar_a')::uuid, '41500', 'Alcala');
    raise exception 'FALLO 23 · un envio de B ha usado la ficha de A';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  insert into envio_paradas (envio_id, orden, tipo, lugar_id, cp, poblacion)
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

-- ---- 26. La vista del cliente sigue sin enseñar lo interno ---------------------------
do $$ declare cols text; begin
  select string_agg(column_name, ', ') into cols from information_schema.columns
   where table_name = 'v_envios_cliente'
     and column_name in ('importe_transportista','margen_euros','factor_tarifa_aplicado',
                         'transportista_id','transportista_nima','primera_oferta_en');
  if cols is not null then raise exception 'FALLO 26 · la vista del cliente ensena: %', cols; end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'v_envios_cliente' and column_name = 'matricula_camion') then
    raise exception 'FALLO 26 · la vista del cliente no tiene matricula_camion';
  end if;
  raise notice 'OK 26 · la vista del cliente no ensena precio del transportista, margen ni factor';
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
select set_config('request.jwt.claim.sub', current_setting('prueba.u_cli'), false);
set role authenticated;
do $$ declare e uuid; o uuid := current_setting('prueba.operador_a')::uuid; begin
  insert into envios (cliente_id, metros_lineales, operador_id, precio_acordado_operador)
    values (cliente_del_usuario(), 13.30, o, 950) returning id into e;
  insert into envio_paradas (envio_id, orden, tipo, cp, poblacion, pais_codigo_iso)
    values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
  -- Destino donde DYNAMO no da servicio: al transportista del cliente no le afecta.
  insert into envio_paradas (envio_id, orden, tipo, cp, poblacion, pais_codigo_iso)
    values (e, 2, 'descarga', '8001', 'Zurich', 'CH');
  update envios set estado = 'programado' where id = e;
  perform set_config('prueba.envio_manual', e::text, false);
  if not (select es_manual from v_envios_cliente where id = e)
     or (select precio_acordado_operador from v_envios_cliente where id = e) <> 950 then
    raise exception 'FALLO 28 · el cliente no ve su envio manual con su precio acordado';
  end if;
end $$;
reset role;
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
  insert into envio_paradas (envio_id, orden, tipo, cp, poblacion, pais_codigo_iso)
    values (e, 1, 'carga', '41001', 'Sevilla', 'ES');
  insert into envio_paradas (envio_id, orden, tipo, cp, poblacion, pais_codigo_iso)
    values (e, 2, 'descarga', '8001', 'Zurich', 'CH');
  begin
    update envios set estado = 'programado' where id = e;
    raise exception 'FALLO 29 · Dynamo ha aceptado un envio a una zona donde no da servicio';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK 29 · las zonas sin servicio siguen bloqueando los envios de Dynamo';
end $$;
select set_config('request.jwt.claim.sub', '', false);
