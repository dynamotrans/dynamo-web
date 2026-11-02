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
insert into clientes (nombre, cif) values ('Cliente Prueba S.L.', 'B12345678');
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
  insert into clientes (nombre, cif) values ('Intruso', 'B87654321');
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
