-- =====================================================================================
-- FACTURAS: NOMBRE DE LA CUENTA CONTABLE, «VENCIDAS 60 DÍAS» Y CONTADOR DE CONSULTAS
-- (usuario, 2026-11-26)
-- =====================================================================================
--  1. «¿Podemos poner mejor el nombre, y no el código?» La factura trae el identificador
--     interno de la cuenta contable (24 letras y cifras), no su número ni su nombre. Se guarda
--     el plan de cuentas de la facturación (solo lectura) y la lista enseña número y nombre.
--  2. «Vencidas 60 días»: filtro por FECHA DE EMISIÓN + 60 (del día 61 en adelante), tenga la
--     factura el vencimiento que tenga. Es el plazo real de pago de los clientes.
--  3. «Sería bueno controlar eso con algún contador… 8565/30.000 con barra de progreso y fecha
--     de renovación»: consultas a la facturación gastadas en el mes. La cifra oficial la da la
--     propia facturación (uso real de toda la cuenta); además la plataforma cuenta las suyas.

-- ---- 1. El plan de cuentas -------------------------------------------------------------
create table if not exists public.holded_cuentas (
  cuenta_id text primary key check (cuenta_id ~ '^[0-9a-f]{24}$'),
  numero    text check (numero is null or length(numero) <= 20),
  nombre    text check (nombre is null or length(nombre) <= 200),
  visto_en  timestamptz not null default now()
);
comment on table public.holded_cuentas is '[Precio y pago] Plan de cuentas del programa de facturación (identificador, número y nombre de cada cuenta contable), para enseñar el nombre de la cuenta de cada factura en vez de su identificador interno. Lo escribe el servidor; lo ve el equipo de Dynamo.';
comment on column public.holded_cuentas.cuenta_id is 'formato: texto de 24 caracteres (0-9, a-f) | rango: no aplica | lista: no aplica | automático | Identificador de la cuenta contable en el programa de facturación (el que traen las líneas de las facturas).';
comment on column public.holded_cuentas.numero is 'formato: texto | rango: hasta 20 | lista: no aplica | automático | Número de la cuenta en el plan contable. Ej. OK: 70500000';
comment on column public.holded_cuentas.nombre is 'formato: texto | rango: hasta 200 | lista: no aplica | automático | Nombre de la cuenta. Ej. OK: Prestaciones de servicios';
comment on column public.holded_cuentas.visto_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se leyó por última vez.';

alter table public.facturas_copia_estado add column if not exists cuentas_en timestamptz;
comment on column public.facturas_copia_estado.cuentas_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Último intento de leer el plan de cuentas de la facturación (saliera bien o mal), para no repetirlo en cada pasada.';

-- ---- 3. Consultas a la facturación, por mes ----------------------------------------------
create table if not exists public.holded_uso (
  mes       date primary key check (extract(day from mes) = 1),
  consultas integer not null default 0 check (consultas >= 0),
  real      integer check (real is null or real >= 0),
  limite    integer check (limite is null or limite > 0),
  real_en   timestamptz
);
comment on table public.holded_uso is '[Precio y pago] Consultas hechas al programa de facturación en cada mes: las que cuenta la plataforma y, si la facturación lo dice, el gasto real de toda la cuenta y el tope del plan. Para vigilar que no se llega al tope mensual. Lo escribe el servidor; lo ve el equipo de Dynamo.';
comment on column public.holded_uso.mes is 'formato: fecha (AAAA-MM-DD) | rango: día 1 de cada mes | lista: no aplica | automático | El mes (su primer día).';
comment on column public.holded_uso.consultas is 'formato: número entero | rango: 0 o más | lista: no aplica | automático | Consultas que ha hecho la plataforma ese mes, contadas por ella misma.';
comment on column public.holded_uso.real is 'formato: número entero | rango: 0 o más | lista: no aplica | automático | Gasto real del mes según la facturación, de toda la cuenta (la plataforma y cualquier otra conexión). Vacío si la clave no deja leerlo.';
comment on column public.holded_uso.limite is 'formato: número entero | rango: mayor que 0 | lista: no aplica | automático | Tope de consultas al mes del plan, según la facturación. Vacío = se usa el parámetro facturacion_consultas_mes.';
comment on column public.holded_uso.real_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Último intento de preguntar el gasto real a la facturación (saliera bien o mal).';

do $$ declare t text; begin
  foreach t in array array['holded_cuentas', 'holded_uso'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_sel', t);
    execute format('create policy %I on public.%I for select using ((select ve_todo()))', t || '_sel', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists tg_mantenimiento on public.%I', t);
    execute format('create trigger tg_mantenimiento before insert or update or delete on public.%I for each row execute function fn_bloqueo_mantenimiento()', t);
  end loop;
end $$;

insert into public.parametros (clave, valor, descripcion) values
  ('facturacion_consultas_mes', '30000', 'Facturación: tope de consultas al mes de tu plan en el programa de facturación. Solo se usa si la facturación no dice el tope ella misma. Al llegar al 90 %, la copia de facturas deja de actualizarse sola hasta el mes siguiente (sigue el botón «Actualizar ahora»).')
on conflict (clave) do nothing;

create or replace function public.holded_mes_actual()
returns date language sql stable as $$ select date_trunc('month', now() at time zone 'UTC')::date $$;
comment on function public.holded_mes_actual() is '[Ayudantes internos] Primer día del mes en curso (hora universal, que es como cuenta el mes el programa de facturación). Quién: uso interno. Argumentos: sin argumentos.';

create or replace function public.holded_contar(p_n integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  if coalesce(p_n, 0) <= 0 then return; end if;
  insert into holded_uso (mes, consultas) values (holded_mes_actual(), least(p_n, 100000))
  on conflict (mes) do update set consultas = holded_uso.consultas + least(excluded.consultas, 100000);
end $$;
comment on function public.holded_contar(integer) is '[Precio y pago] Suma al mes en curso las consultas que el servidor acaba de hacer al programa de facturación. Quién: servidor. Argumentos: p_n: cuántas consultas.';
revoke all on function public.holded_contar(integer) from public, anon, authenticated;
grant execute on function public.holded_contar(integer) to service_role;

-- p_periodo «AAAA-MM» tal como lo da la facturación. Con p_real vacío solo se apunta el intento.
create or replace function public.holded_uso_real(p_periodo text, p_real integer, p_limite integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_mes date := holded_mes_actual();
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  if p_periodo ~ '^\d{4}-(0[1-9]|1[0-2])$' then v_mes := (p_periodo || '-01')::date; end if;
  insert into holded_uso (mes, real, limite, real_en)
  values (v_mes, case when p_real >= 0 then p_real end, case when p_limite > 0 then p_limite end, now())
  on conflict (mes) do update set real = coalesce(excluded.real, holded_uso.real), limite = coalesce(excluded.limite, holded_uso.limite), real_en = now();
end $$;
comment on function public.holded_uso_real(text, integer, integer) is '[Precio y pago] Apunta el gasto real de consultas del mes y el tope del plan que acaba de decir el programa de facturación. Sin cifras, solo apunta que se ha preguntado. Quién: servidor. Argumentos: p_periodo: mes como AAAA-MM · p_real: consultas gastadas · p_limite: tope del plan.';
revoke all on function public.holded_uso_real(text, integer, integer) from public, anon, authenticated;
grant execute on function public.holded_uso_real(text, integer, integer) to service_role;

create or replace function public.holded_uso_mes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare u holded_uso; v_mes date := holded_mes_actual(); v_param integer;
begin
  if not (ve_todo() or es_servidor()) then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  select * into u from holded_uso where mes = v_mes;
  v_param := greatest(coalesce((parametro('facturacion_consultas_mes') #>> '{}')::integer, 30000), 1);
  return jsonb_build_object(
    'mes', v_mes, 'renueva', (v_mes + interval '1 month')::date,
    'consultas', coalesce(u.consultas, 0), 'real', u.real, 'real_en', u.real_en,
    'usadas', coalesce(u.real, u.consultas, 0), 'oficial', u.real is not null,
    'limite', coalesce(u.limite, v_param));
end $$;
comment on function public.holded_uso_mes() is '[Precio y pago] Consultas al programa de facturación gastadas en el mes en curso: las oficiales si la facturación las dice (toda la cuenta) o, si no, las contadas por la plataforma; el tope del plan y el día en que se renueva. Quién: equipo de Dynamo o servidor. Argumentos: sin argumentos.';
revoke all on function public.holded_uso_mes() from public, anon;
grant execute on function public.holded_uso_mes() to authenticated, service_role;

-- ---- 1 y 2. La lista: nombre de la cuenta y filtro «vencidas 60 días» ----------------------
-- Se parte de la función tal como está y se le cambian tres trozos (así no se pierde nada de
-- lo que ya hace). Si alguno no está donde se espera, la migración se para.
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.facturas_lista(text, text, date, date, integer, integer, uuid)'::regprocedure);
  n := replace(d, $a$not in ('todas', 'por_cobrar', 'vencida', 'pagada', 'anulada')$a$, $a$not in ('todas', 'por_cobrar', 'vencida', 'vencida_60', 'pagada', 'anulada')$a$);
  if n = d then raise exception 'facturas_lista: no encuentro la lista de filtros'; end if; d := n;
  n := replace(d, $a$when 'vencida' then b.est = 'vencida'$a$,
    $a$when 'vencida' then b.est = 'vencida'
             -- Por FECHA DE EMISIÓN + 60 días (del día 61 en adelante), tenga el vencimiento que tenga.
             when 'vencida_60' then b.estado <> 'anulada' and b.pendiente > 0 and b.fecha_emision + 60 < hoy$a$);
  if n = d then raise exception 'facturas_lista: no encuentro el filtro de vencidas'; end if; d := n;
  n := replace(d, $a$'cuenta', x.cuenta, $a$,
    $a$'cuenta', (select string_agg(coalesce(nullif(concat_ws(' · ', k.numero, k.nombre), ''), case when t.tok ~ '^[0-9a-f]{24}$' then null else t.tok end), ' / ' order by t.n)
                  from unnest(string_to_array(x.cuenta, ' · ')) with ordinality t(tok, n) left join holded_cuentas k on k.cuenta_id = t.tok), $a$);
  if n = d then raise exception 'facturas_lista: no encuentro la cuenta contable'; end if;
  execute n;
end $$;
comment on function public.facturas_lista(text, text, date, date, integer, integer, uuid) is '[Precio y pago] Una página de facturas emitidas de la copia, con su estado de cobro (pendiente, vencida, pagada, anulada), más el total de facturas y las sumas (base, importe, por cobrar y vencido) de lo filtrado. Dynamo las ve todas (o las de un cliente) con empresa, CIF y cuenta contable (número y nombre); el cliente, solo las suyas, sin las anuladas. Quién: equipo de Dynamo o cliente. Argumentos: p_q: texto a buscar (nº, empresa, CIF, importe) · p_estado: todas, por_cobrar, vencida (vencimiento pasado), vencida_60 (algo pendiente y más de 60 días desde la emisión), pagada o anulada · p_desde, p_hasta: fechas de factura · p_pagina: página (desde 1) · p_por: filas por página (1 a 100) · p_cliente: clientes.id para ver solo uno (solo Dynamo).';
