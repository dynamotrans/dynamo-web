-- CONTROL DE PEDIDOS «DESDE» (usuario, 2026-11-23: el email del lunes decía «30054 casos» por
-- los ~15.000 envíos ficticios de los datos de prueba masivos, que nunca se pasan a Holded).
-- Nueva fecha en Parámetros: el control (pantalla y email) solo mira los envíos entregados o
-- cancelados desde ese día. En pruebas, hoy; en producción, el día de arranque (así los envíos
-- antiguos que se carguen no llenan el control de avisos). Vacía = sin límite.

insert into parametros (clave, valor, descripcion) values
  ('control_facturacion_desde', '"2026-11-23"', 'Control de pedidos: solo se revisan los envíos entregados o cancelados desde este día (AAAA-MM-DD). Vacío = todos.')
on conflict (clave) do nothing;

-- Texto a fecha sin fallar (un valor mal escrito en Parámetros no rompe el control: cuenta como vacío).
create or replace function public.texto_a_fecha(p text)
returns date language plpgsql immutable set search_path = public as $$
begin
  if coalesce(trim(p), '') = '' then return null; end if;
  return trim(p)::date;
exception when others then return null;
end $$;
revoke execute on function public.texto_a_fecha(text) from public, anon, authenticated;
comment on function public.texto_a_fecha(text) is '[Utilidades] Convierte un texto (AAAA-MM-DD) en fecha; vacío o mal escrito, null (nunca falla). Quién: solo uso interno. Argumentos: p: el texto.';

do $$
declare
  def text := pg_get_functiondef('public.control_facturacion(integer)'::regprocedure);
  a1 text := $a$  d int := greatest(0, parametro_num('control_facturacion_dias_holded', 3)::int);$a$;
  a2 text := $a$       and (e.estado in ('entregado', 'cancelado') or e.holded_pedido_venta is not null or e.holded_pedido_compra is not null)
  ), filas as ($a$;
  n int;
begin
  n := (length(def) - length(replace(def, a1, ''))) / length(a1);
  if n <> 1 then raise exception 'control_pedidos_desde: la aguja 1 aparece % veces', n; end if;
  n := (length(def) - length(replace(def, a2, ''))) / length(a2);
  if n <> 1 then raise exception 'control_pedidos_desde: la aguja 2 aparece % veces', n; end if;
  def := replace(def, a1, a1 || E'\n  v_desde date := texto_a_fecha(parametro(''control_facturacion_desde'') #>> ''{}'');   -- solo desde este día (vacío: todos)');
  def := replace(def, a2, replace(a2, E'\n  ), filas as (',
    E'\n       and (v_desde is null or coalesce((coalesce(e.entregado_en, e.cancelado_en) at time zone ''Europe/Madrid'')::date,\n                                         e.fecha_carga_real, e.fecha_carga_desde, (e.creado_en at time zone ''Europe/Madrid'')::date) >= v_desde)\n  ), filas as ('));
  execute def;
end $$;
