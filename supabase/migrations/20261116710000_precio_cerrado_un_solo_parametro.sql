-- =====================================================================================
-- PRECIO CERRADO: UN SOLO PARÁMETRO, EN DÍAS HÁBILES (usuario, 2026-11-16)
-- =====================================================================================
-- Había dos números para lo mismo y se pisaban:
--   · precio_cerrado_dias (días NATURALES): al confirmar, ¿precio cerrado o provisional?
--   · precio_revision_dias_habiles (días HÁBILES): ¿qué día se revisa el provisional?
-- Con los dos a 12, un envío a 14 días nacía «provisional» con la revisión ya vencida:
-- provisional durante menos de una hora, para nada. Y con otros valores, un envío
-- confirmado más lejos tenía el precio firme más tarde que uno confirmado más cerca.
--
-- AHORA hay un solo número: precio_cerrado_dias_habiles («Precio cerrado: días hábiles
-- antes de la carga»).
--   · Si al confirmar faltan esos días hábiles o menos → precio CERRADO.
--   · Si faltan más → PROVISIONAL, y se revisa justo ese día (esos días hábiles antes).
-- Sale todo de la misma cuenta, así que no pueden contradecirse.

-- ---- 1. El parámetro ------------------------------------------------------------------
-- Se conserva la fila de la revisión (ya iba en días hábiles) con la clave nueva, y se
-- quita la de días naturales. Valor acordado con el usuario: 12.
do $$ begin
  update parametros set clave = 'precio_cerrado_dias_habiles', valor = '12',
    descripcion = 'Precio cerrado: días hábiles antes de la carga. Si al confirmar faltan estos días hábiles o menos, el precio es cerrado. Si faltan más, es provisional y se revisa (y queda fijo) justo ese día.'
   where clave = 'precio_revision_dias_habiles';
  if not found then
    insert into parametros (clave, valor, descripcion) values ('precio_cerrado_dias_habiles', '12',
      'Precio cerrado: días hábiles antes de la carga. Si al confirmar faltan estos días hábiles o menos, el precio es cerrado. Si faltan más, es provisional y se revisa (y queda fijo) justo ese día.');
  end if;
  delete from parametros where clave = 'precio_cerrado_dias';
end $$;

-- ---- 2. La cuenta, en un solo sitio ---------------------------------------------------
create or replace function precio_dia_cierre(p_carga date)
returns date language plpgsql stable security definer set search_path = public as $$
declare n int := greatest(0, parametro_num('precio_cerrado_dias_habiles', 12)::int);
        v_hoy date := (now() at time zone 'Europe/Madrid')::date; d date;
begin
  if p_carga is null then return null; end if;
  -- Los días hábiles que faltan nunca son más que los naturales: si ya faltan n naturales
  -- o menos, está cerrado seguro (y no hay que contar hacia atrás).
  if p_carga - v_hoy <= n then return null; end if;
  d := dias_habiles_antes(p_carga, n);
  return case when d > v_hoy then d end;
end $$;
revoke execute on function precio_dia_cierre(date) from public, anon;
grant execute on function precio_dia_cierre(date) to authenticated;
comment on function public.precio_dia_cierre(date) is '[Precio y pago] Para una fecha de carga, el día en que el precio provisional se revisa y queda cerrado: precio_cerrado_dias_habiles días hábiles antes de la carga. Devuelve null si el precio ya es cerrado (faltan esos días hábiles o menos). Es la única cuenta de «cerrado o provisional»: la usan el disparador del envío, el asistente y las proformas. Quién: cualquier usuario con sesión. Argumentos: p_carga: primer día de carga.';

-- ---- 3. El disparador del envío usa esa cuenta ----------------------------------------
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.fn_envios_ab_precio_revision()'::regprocedure);
  n := replace(v, 'if new.fecha_carga_desde - v_hoy > parametro_num(''precio_cerrado_dias'', 7) then',
                  'if precio_dia_cierre(new.fecha_carga_desde) is not null then');
  if n = v then raise exception 'fn_envios_ab_precio_revision: no encuentro la comparación con precio_cerrado_dias'; end if;
  v := n;
  n := replace(v, 'new.fecha_revision_precio := dias_habiles_antes(new.fecha_carga_desde, parametro_num(''precio_revision_dias_habiles'', 7)::int);',
                  'new.fecha_revision_precio := precio_dia_cierre(new.fecha_carga_desde);');
  if n = v then raise exception 'fn_envios_ab_precio_revision: no encuentro la fecha de revisión'; end if;
  execute n;
end $$;

-- ---- 4. Las reglas que lee la pantalla: un solo número --------------------------------
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.reglas_precio_envio()'::regprocedure);
  n := replace(v, '''cerrado_dias'', parametro_num(''precio_cerrado_dias'', 7),', '''cerrado_dias_habiles'', parametro_num(''precio_cerrado_dias_habiles'', 12),');
  if n = v then raise exception 'reglas_precio_envio: no encuentro cerrado_dias'; end if;
  v := n;
  n := replace(v, '''revision_dias_habiles'', parametro_num(''precio_revision_dias_habiles'', 7), ', '');
  if n = v then raise exception 'reglas_precio_envio: no encuentro revision_dias_habiles'; end if;
  execute n;
end $$;
comment on function public.reglas_precio_envio() is '[Precio y pago] Reglas de precio y fechas para la pantalla de pedir envío (de los parámetros): antelación máxima en días, días hábiles antes de la carga con precio cerrado (cerrado_dias_habiles: con más antelación el precio es provisional y se revisa ese día), margen % de revisión, horas de corte para cargar — la de fecha fija y una POR VENTANA (1-2, 1-3 y 1-4 días) — y el descuento de bienvenida (%) que se aplica al calcular un precio sin cliente elegido (el de cliente nuevo y el del tarifador público). Quién: cualquier usuario con sesión. Argumentos: sin argumentos.';

-- ---- 5. Que no quede nadie leyendo los parámetros viejos ------------------------------
do $$ declare v text; begin
  select string_agg(p.proname, ', ') into v from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.prosrc like '%''precio_cerrado_dias''%' or p.prosrc like '%precio_revision_dias_habiles%');
  if v is not null then raise exception 'Siguen leyendo los parámetros viejos del precio cerrado: %', v; end if;
end $$;
