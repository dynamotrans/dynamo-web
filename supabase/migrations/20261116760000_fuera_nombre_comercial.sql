-- =====================================================================================
-- FUERA EL «NOMBRE COMERCIAL»: SOLO RAZÓN SOCIAL (usuario, 2026-11-16)
-- =====================================================================================
-- «Usamos siempre la razón social. El comercial lo vamos a quitar, lo borramos de la base
-- de datos y no lo usaremos nunca, para no liar.» Con los dos nombres, una misma empresa
-- salía como «Textil Europea, SL» en un sitio y «Aceites 0d0fd» en otro, y parecían dos.
--
-- QUÉ SE HACE:
--   · Se borra la columna nombre_comercial de clientes y de transportistas.
--   · nombre_visible (la que usan listados, buscadores, emails y PDF) se queda, pero ahora
--     es SIEMPRE la razón social. Así no hay que tocar las decenas de sitios que la leen.
--   · mi_empresa() y mi_empresa_transportista() dejan de devolver el nombre comercial.
--   · Los textos de búsqueda, los índices, los disparadores y los datos de prueba dejan de
--     mencionarlo.
-- nombre_visible es una columna calculada a partir del nombre comercial, así que hay que
-- quitarla y volver a crearla; lo que depende de ella (una vista, un disparador y sus
-- índices) se desmonta antes y se vuelve a montar igual después.

-- ---- 1. La vista de Wtransnet: se guarda tal cual está, para volver a crearla ---------
create temporary table _vista_wtransnet on commit drop as
  select rtrim(rtrim(pg_get_viewdef('public.v_wtransnet'::regclass, true)), ';') as def,
         obj_description('public.v_wtransnet'::regclass) as comentario;
drop view public.v_wtransnet;

-- ---- 2. Disparadores e índices que nombran las columnas -------------------------------
drop trigger tg_busqueda_clientes on clientes;
drop trigger tg_busqueda_transportistas on transportistas;
drop trigger tg_zz_busqueda_sitios on clientes;
drop index idx_clientes_nombre;
drop index idx_transportistas_nombre;

-- ---- 3. Las columnas -------------------------------------------------------------------
alter table clientes drop column nombre_visible, drop column nombre_comercial;
alter table transportistas drop column nombre_visible, drop column nombre_comercial;
alter table clientes add column nombre_visible text generated always as (razon_social) stored;
alter table transportistas add column nombre_visible text generated always as (razon_social) stored;
comment on column public.clientes.nombre_visible is 'formato: texto | rango: no aplica | lista: no aplica | automático | Calculada por la base de datos: es siempre la razón social (el nombre comercial se quitó el 2026-11-16). Es la de listados y buscadores.';
comment on column public.transportistas.nombre_visible is 'formato: texto | rango: no aplica | lista: no aplica | automático | Calculada por la base de datos: es siempre la razón social (el nombre comercial se quitó el 2026-11-16). Es la de listados.';

create index idx_clientes_nombre on clientes using gin (to_tsvector('spanish', razon_social));
create index idx_transportistas_nombre on transportistas using gin (to_tsvector('spanish', razon_social));
create index idx_clientes_nombre_visible on clientes (nombre_visible);
create index idx_transportistas_nombre_visible on transportistas (nombre_visible);

-- ---- 4. Los disparadores, sin el nombre comercial --------------------------------------
create trigger tg_busqueda_clientes after update of razon_social, cif on clientes
  for each row when (old.razon_social is distinct from new.razon_social or old.cif is distinct from new.cif)
  execute function fn_busqueda_empresa();
create trigger tg_busqueda_transportistas after update of razon_social, cif on transportistas
  for each row when (old.razon_social is distinct from new.razon_social or old.cif is distinct from new.cif)
  execute function fn_busqueda_empresa();
create trigger tg_zz_busqueda_sitios after update of razon_social, cif on clientes
  for each row when (old.razon_social is distinct from new.razon_social or old.cif is distinct from new.cif)
  execute function fn_busqueda_sitios_del_cliente();

-- ---- 5. La vista, igual que estaba ------------------------------------------------------
do $$ declare v record; begin
  select * into v from _vista_wtransnet;
  execute 'create view public.v_wtransnet with (security_invoker = true) as ' || v.def;
  if v.comentario is not null then execute format('comment on view public.v_wtransnet is %L', v.comentario); end if;
end $$;

-- ---- 6. La ficha de la empresa que ve cada uno: sin nombre comercial -------------------
drop function mi_empresa();
create function mi_empresa()
returns table (id uuid, codigo text, razon_social text, cif text, direccion text, poblacion text, codigo_postal text, provincia text,
               pais_codigo_iso character, plazo_pago_dias integer, discrecion_comercial boolean, tipo_camion_defecto tipo_camion,
               forma_carga_defecto forma_carga, requiere_plataforma_elevadora_defecto boolean, estado estado_cuenta, iva_pct numeric,
               nima_por_defecto boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.codigo, c.razon_social, c.cif, c.direccion,
         c.poblacion, c.codigo_postal, c.provincia, c.pais_codigo_iso,
         c.plazo_pago_dias, c.discrecion_comercial, c.tipo_camion_defecto,
         c.forma_carga_defecto, c.requiere_plataforma_elevadora_defecto, c.estado, c.iva_pct,
         c.nima_por_defecto
    from clientes c where c.id = cliente_del_usuario()
$$;
revoke execute on function mi_empresa() from public, anon;
grant execute on function mi_empresa() to authenticated, service_role;
comment on function public.mi_empresa() is '[Clientes y cuentas] Ficha de la empresa del cliente que llama: código, razón social, CIF, dirección, plazo de pago, preferencias por defecto (camión, forma de carga, plataforma, discreción comercial, NIMA), estado de la cuenta y su % de IVA. Quién: cliente. Argumentos: sin argumentos.';

drop function mi_empresa_transportista();
create function mi_empresa_transportista()
returns table (id uuid, codigo text, razon_social text, cif text, direccion text, poblacion text, codigo_postal text, provincia text,
               pais_codigo_iso character, plazo_pago_dias integer, nima text, bolsa text, codigo_bolsa text)
language sql stable security definer set search_path = public as $$
  select t.id, t.codigo, t.razon_social, t.cif, t.direccion,
         t.poblacion, t.codigo_postal, t.provincia, t.pais_codigo_iso,
         t.plazo_pago_dias, t.nima, t.bolsa, t.codigo_bolsa
    from transportistas t where t.id = transportista_del_usuario()
$$;
revoke execute on function mi_empresa_transportista() from public, anon;
grant execute on function mi_empresa_transportista() to authenticated, service_role;
comment on function public.mi_empresa_transportista() is '[Clientes y cuentas] Ficha de la empresa del transportista que llama: código, razón social, CIF, dirección, plazo de pago, NIMA, bolsa y código en la bolsa. El seguro CMR va como documento PDF (Documentos, tipo seguro_cmr), no como datos escritos. Quién: transportista. Argumentos: sin argumentos.';

-- ---- 7. Textos de búsqueda y datos de prueba -------------------------------------------
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.cliente_texto_busqueda(clientes)'::regprocedure);
  n := replace(v, 'k.nombre_visible, k.razon_social, k.nombre_comercial, k.cif,', 'k.razon_social, k.cif,');
  if n = v then raise exception 'cliente_texto_busqueda: no encuentro el nombre comercial'; end if;
  execute n;
  v := pg_get_functiondef('public.transportista_texto_busqueda(transportistas)'::regprocedure);
  n := replace(v, 't.nombre_visible, t.razon_social, t.nombre_comercial, t.cif,', 't.razon_social, t.cif,');
  if n = v then raise exception 'transportista_texto_busqueda: no encuentro el nombre comercial'; end if;
  execute n;

  v := pg_get_functiondef('public.cargar_datos_de_prueba(text, numeric, text, jsonb)'::regprocedure);
  n := replace(v, 'insert into clientes (id, razon_social, nombre_comercial, cif,', 'insert into clientes (id, razon_social, cif,');
  if n = v then raise exception 'cargar_datos_de_prueba: no encuentro la inserción de clientes'; end if;
  v := n;
  n := replace(v, 'select id, razon, comercial, cif,', 'select id, razon, cif,');
  if n = v then raise exception 'cargar_datos_de_prueba: no encuentro el nombre comercial de los clientes'; end if;
  v := n;
  n := replace(v, 'insert into transportistas (id, razon_social, nombre_comercial, cif,', 'insert into transportistas (id, razon_social, cif,');
  if n = v then raise exception 'cargar_datos_de_prueba: no encuentro la inserción de transportistas'; end if;
  v := n;
  n := replace(v, 'select id, razon, case when n = 2 then ''TRANSPORTON'' when not autonomo and r8 < .1 then upper(split_part(razon, '' '', 2)) end, cif,', 'select id, razon, cif,');
  if n = v then raise exception 'cargar_datos_de_prueba: no encuentro el nombre comercial de los transportistas'; end if;
  execute n;
end $$;

-- Los textos de búsqueda ya guardados, al día (sin el nombre comercial). Sin disparadores:
-- es un recálculo interno, no un cambio de la ficha.
alter table clientes disable trigger user;
update clientes k set texto_busqueda = cliente_texto_busqueda(k);
alter table clientes enable trigger user;
alter table transportistas disable trigger user;
update transportistas t set texto_busqueda = transportista_texto_busqueda(t);
alter table transportistas enable trigger user;

-- ---- 8. Que no quede nadie nombrándolo --------------------------------------------------
do $$ declare v text; begin
  select string_agg(p.proname, ', ') into v from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosrc ilike '%nombre_comercial%';
  if v is not null then raise exception 'Siguen usando el nombre comercial: %', v; end if;
end $$;
