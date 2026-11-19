-- Paradas con el TIPO DE SITIO (usuario, 2026-11-19): en las listas y fichas de envíos de
-- todos los roles, cada parada se pinta con la misma pastilla que en «Nuevo envío»
-- («1 · Recogida» + el icono del tipo de sitio: almacén, obra, finca…). Para eso las
-- paradas del cliente (paradas_json) y del transportista (paradas_viaje_json) traen ahora
-- 'tipo_sitio'. Sin sitio enlazado, va vacío y la pantalla pone el de almacén.

do $$
declare v_def text; v_nueva text;
begin
  select pg_get_functiondef('public.paradas_json(uuid)'::regprocedure) into v_def;
  if position($q$'tipo_sitio'$q$ in v_def) > 0 then return; end if;   -- ya está
  v_nueva := replace(v_def,
    $q$'notas_sitio', s.anotaciones)$q$,
    $q$'notas_sitio', s.anotaciones, 'tipo_sitio', s.tipo)$q$);
  if v_nueva = v_def then raise exception 'paradas_json() no tiene el texto esperado: revisar la migración'; end if;
  execute v_nueva;
end $$;

do $$
declare v_def text; v_nueva text;
begin
  select pg_get_functiondef('public.paradas_viaje_json(uuid)'::regprocedure) into v_def;
  if position($q$'tipo_sitio'$q$ in v_def) > 0 then return; end if;   -- ya está
  v_nueva := replace(v_def,
    $q$'notas_sitio', l.anotaciones,$q$,
    $q$'notas_sitio', l.anotaciones, 'tipo_sitio', l.tipo,$q$);
  if v_nueva = v_def then raise exception 'paradas_viaje_json() no tiene el texto esperado: revisar la migración'; end if;
  execute v_nueva;
end $$;
