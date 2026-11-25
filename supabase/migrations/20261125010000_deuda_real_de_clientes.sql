-- =====================================================================================
-- LO QUE DEBE CADA CLIENTE, LEÍDO DE LA FACTURACIÓN (usuario, 2026-11-24/25)
-- =====================================================================================
-- «Necesitamos traer el estado de pagos de las emitidas a clientes para saber cuánto deben y,
-- en función del riesgo disponible de CESCE, restamos y vemos el disponible real para seguir
-- pidiendo portes a crédito.» · «Lo mejor es consulta en tiempo real, creo yo, para evitar
-- errores de sincronización.»
--
-- CÓMO: no se guarda histórico ni se va apuntando cambio a cambio. El servidor le pide a la
-- facturación «todas las facturas emitidas con algo pendiente de cobro» y guarda esa FOTO
-- entera, sustituyendo la anterior. Una factura cobrada, anulada o cambiada sale distinta (o
-- no sale) en la foto siguiente: no hay nada que pueda descuadrarse.
-- Por qué se guarda la foto y no se pregunta cada vez: la decisión de dar crédito a un envío
-- se toma aquí, en la base de datos, que no puede preguntar fuera en ese instante; y si la
-- facturación no contesta, se sigue con la última foto en vez de parar.
-- ESTE PASO ES SOLO INFORMATIVO: se enseña en «CESCE - Riesgos» junto a lo de siempre. No
-- cambia todavía cómo se decide el crédito (eso, cuando el usuario vea que los números cuadran).
-- SOLO LECTURA de la facturación: aquí solo se escribe en NUESTRAS tablas.

-- ---- 0. Comparar CIF con y sin el «ES» de delante -------------------------------------
create or replace function public.cif_base(p text)
returns text language sql immutable as $$
  select case when n ~ '^ES[A-Z0-9]{9}$' then substr(n, 3) else n end
    from (select normalizar_id_fiscal(p) as n) x
$$;
comment on function public.cif_base(text) is '[Ayudantes internos] Deja un CIF/NIF listo para comparar entre programas: sin guiones, puntos ni espacios, en mayúsculas y sin el «ES» de delante cuando lo lleva (ESB12345678 y B-12345678 son el mismo). Quién: cualquiera. Argumentos: p: el CIF tal como venga.';

-- ---- 1. A quién corresponde cada contacto de la facturación ---------------------------
create table if not exists public.holded_contactos (
  contacto_id text primary key check (contacto_id ~ '^[0-9a-f]{24}$'),
  cif         text check (cif is null or length(cif) <= 40),
  nombre      text check (nombre is null or length(nombre) <= 200),
  visto_en    timestamptz not null default now()
);
comment on table public.holded_contactos is '[Precio y pago] Contactos del programa de facturación ya consultados, con su CIF, para saber de qué cliente es cada factura sin volver a preguntarlo cada vez. Se refresca solo cada pocos días. Lo escribe el servidor.';
comment on column public.holded_contactos.contacto_id is 'formato: texto de 24 caracteres (0-9, a-f) | rango: no aplica | lista: no aplica | automático | Identificador del contacto en el programa de facturación.';
comment on column public.holded_contactos.cif is 'formato: texto | rango: hasta 40 | lista: no aplica | automático | CIF/NIF del contacto tal como está en la facturación. Vacío si el contacto no lo tiene.';
comment on column public.holded_contactos.nombre is 'formato: texto | rango: hasta 200 | lista: no aplica | automático | Nombre del contacto en la facturación.';
comment on column public.holded_contactos.visto_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se consultó por última vez.';

-- ---- 2. La foto: facturas emitidas con algo pendiente de cobro -------------------------
create table if not exists public.facturas_pendientes (
  ref_externa       text primary key check (length(ref_externa) between 1 and 60),
  cliente_id        uuid references clientes(id) on delete cascade,
  contacto_id       text,
  contacto_nombre   text,
  cif               text,
  numero            text,
  fecha_emision     date,
  fecha_vencimiento date,
  total             numeric(12,2) not null,
  pendiente         numeric(12,2) not null check (pendiente > 0),
  leido_en          timestamptz not null default now()
);
create index if not exists facturas_pendientes_cliente_idx on public.facturas_pendientes (cliente_id);
comment on table public.facturas_pendientes is '[Precio y pago] FOTO de las facturas emitidas que tienen algo pendiente de cobro, leída del programa de facturación. Se sustituye entera en cada lectura (no se va corrigiendo factura a factura), así que nunca se descuadra. Sirve para saber cuánto debe cada cliente. Lo escribe el servidor; lo ve el equipo de Dynamo.';
comment on column public.facturas_pendientes.ref_externa is 'formato: texto | rango: 1 a 60 | lista: no aplica | automático | Identificador de la factura en el programa de facturación.';
comment on column public.facturas_pendientes.cliente_id is 'formato: uuid | → clientes.id | rango: no aplica | lista: no aplica | automático | Cliente de la plataforma al que corresponde, casado por CIF. Vacío si ese contacto no es cliente de la plataforma.';
comment on column public.facturas_pendientes.contacto_id is 'formato: texto | rango: no aplica | lista: no aplica | automático | Identificador del contacto en el programa de facturación.';
comment on column public.facturas_pendientes.contacto_nombre is 'formato: texto | rango: no aplica | lista: no aplica | automático | Nombre del contacto según la factura.';
comment on column public.facturas_pendientes.cif is 'formato: texto | rango: no aplica | lista: no aplica | automático | CIF del contacto con el que se casó (o se intentó casar) con un cliente.';
comment on column public.facturas_pendientes.numero is 'formato: texto | rango: no aplica | lista: no aplica | automático | Número de la factura. Ej. OK: F260412';
comment on column public.facturas_pendientes.fecha_emision is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | automático | Día de la factura.';
comment on column public.facturas_pendientes.fecha_vencimiento is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | automático | Día en que vence el pago. Pasado ese día, lo pendiente cuenta como vencido.';
comment on column public.facturas_pendientes.total is 'formato: número con 2 decimales, euros CON IVA | rango: no aplica | lista: no aplica | automático | Importe total de la factura.';
comment on column public.facturas_pendientes.pendiente is 'formato: número con 2 decimales, euros CON IVA | rango: > 0 | lista: no aplica | automático | Lo que falta por cobrar de la factura (el total menos lo ya cobrado).';
comment on column public.facturas_pendientes.leido_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se leyó esta factura de la facturación.';

-- ---- 3. Cómo fue la última lectura ---------------------------------------------------
create table if not exists public.facturas_pendientes_estado (
  id            boolean primary key default true check (id),
  ultima_en     timestamptz,
  ultima_ok_en  timestamptz,
  error         text check (error is null or length(error) <= 500),
  facturas      integer not null default 0,
  sin_cliente   integer not null default 0,
  sin_cif       integer not null default 0
);
insert into public.facturas_pendientes_estado (id) values (true) on conflict (id) do nothing;
comment on table public.facturas_pendientes_estado is '[Precio y pago] Una sola fila: cuándo se leyó por última vez la foto de facturas pendientes de cobro y cómo fue. Lo escribe el servidor.';
comment on column public.facturas_pendientes_estado.id is 'formato: sí/no | rango: no aplica | lista: sí | automático | Siempre «sí»: garantiza que solo hay una fila.';
comment on column public.facturas_pendientes_estado.ultima_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Último intento de lectura, saliera bien o mal.';
comment on column public.facturas_pendientes_estado.ultima_ok_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Última lectura completa que salió bien: la foto guardada es de ese momento.';
comment on column public.facturas_pendientes_estado.error is 'formato: texto | rango: hasta 500 | lista: no aplica | automático | Por qué falló el último intento. Vacío si salió bien.';
comment on column public.facturas_pendientes_estado.facturas is 'formato: número entero | rango: 0 o más | lista: no aplica | automático | Facturas con algo pendiente que tenía la última foto completa.';
comment on column public.facturas_pendientes_estado.sin_cliente is 'formato: número entero | rango: 0 o más | lista: no aplica | automático | De esas, cuántas son de contactos que no son clientes de la plataforma.';
comment on column public.facturas_pendientes_estado.sin_cif is 'formato: número entero | rango: 0 o más | lista: no aplica | automático | De esas, cuántas son de contactos cuyo CIF aún no se ha podido consultar (se completa en la lectura siguiente).';

-- Permisos de las tres tablas: las ve el equipo de Dynamo; solo escribe el servidor.
do $$ declare t text; begin
  foreach t in array array['holded_contactos', 'facturas_pendientes', 'facturas_pendientes_estado'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_sel', t);
    execute format('create policy %I on public.%I for select using ((select es_equipo_dynamo()))', t || '_sel', t);
    execute format('drop policy if exists %I on public.%I', t || '_ve_todo', t);
    execute format('create policy %I on public.%I for select using ((select ve_todo()))', t || '_ve_todo', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists tg_mantenimiento on public.%I', t);
    execute format('create trigger tg_mantenimiento before insert or update or delete on public.%I for each row execute function fn_bloqueo_mantenimiento()', t);
  end loop;
end $$;

-- ---- 4. Guardar la foto (solo el servidor) ---------------------------------------------
-- p_facturas: [{id, numero, contacto_id, contacto_nombre, cif, emision, vence, total, pendiente}]
-- Sin p_cliente: es la foto COMPLETA y sustituye a todo lo que había.
-- Con p_cliente: solo se refresca ese cliente (sus contactos van en p_contactos); el resto no se toca.
create or replace function public.deuda_guardar_foto(p_facturas jsonb, p_cliente uuid default null, p_contactos text[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n int; v_sin int; v_sin_cif int; v_total numeric;
begin
  if not es_servidor() then raise exception 'Solo el servidor guarda la foto de facturas pendientes.' using errcode = '42501'; end if;
  if p_facturas is null or jsonb_typeof(p_facturas) <> 'array' then raise exception 'La foto de facturas pendientes no tiene la forma esperada.'; end if;
  if jsonb_array_length(p_facturas) > 20000 then raise exception 'La foto de facturas pendientes es demasiado grande.'; end if;
  if p_cliente is null then
    delete from facturas_pendientes where true;
  else
    delete from facturas_pendientes where cliente_id = p_cliente or contacto_id = any(coalesce(p_contactos, '{}'));
  end if;
  insert into facturas_pendientes (ref_externa, cliente_id, contacto_id, contacto_nombre, cif, numero, fecha_emision, fecha_vencimiento, total, pendiente)
  select distinct on (f.id) f.id, c.id, f.contacto_id, left(f.contacto_nombre, 200), left(f.cif, 40), left(f.numero, 60), f.emision, f.vence,
         round(f.total, 2), round(f.pendiente, 2)
    from jsonb_to_recordset(p_facturas) as f(id text, numero text, contacto_id text, contacto_nombre text, cif text, emision date, vence date, total numeric, pendiente numeric)
    left join clientes c on nullif(cif_base(f.cif), '') is not null and cif_base(c.cif) = cif_base(f.cif)
   where f.id is not null and length(f.id) between 1 and 60 and round(coalesce(f.pendiente, 0), 2) > 0
   order by f.id, c.creado_en
  on conflict (ref_externa) do update set cliente_id = excluded.cliente_id, contacto_id = excluded.contacto_id, contacto_nombre = excluded.contacto_nombre,
    cif = excluded.cif, numero = excluded.numero, fecha_emision = excluded.fecha_emision, fecha_vencimiento = excluded.fecha_vencimiento,
    total = excluded.total, pendiente = excluded.pendiente, leido_en = now();
  select count(*), count(*) filter (where cliente_id is null and nullif(cif_base(cif), '') is not null),
         count(*) filter (where nullif(cif_base(cif), '') is null), coalesce(sum(pendiente), 0)
    into v_n, v_sin, v_sin_cif, v_total from facturas_pendientes;
  if p_cliente is null then
    update facturas_pendientes_estado set ultima_en = now(), ultima_ok_en = now(), error = null, facturas = v_n, sin_cliente = v_sin, sin_cif = v_sin_cif where id;
  else
    update facturas_pendientes_estado set facturas = v_n, sin_cliente = v_sin, sin_cif = v_sin_cif where id;
  end if;
  return jsonb_build_object('facturas', v_n, 'sin_cliente', v_sin, 'sin_cif', v_sin_cif, 'pendiente', v_total);
end $$;
comment on function public.deuda_guardar_foto(jsonb, uuid, text[]) is '[Precio y pago] Guarda la FOTO de facturas emitidas con algo pendiente de cobro que el servidor acaba de leer de la facturación, casando cada una con su cliente por CIF. Sin cliente indicado, sustituye toda la foto anterior; con cliente, solo la parte de ese cliente. Devuelve cuántas hay, cuántas son de contactos que no son clientes y el total pendiente. Quién: servidor. Argumentos: p_facturas: lista de facturas (id, numero, contacto_id, contacto_nombre, cif, emision, vence, total, pendiente) · p_cliente: clientes.id si solo se refresca uno · p_contactos: sus contactos en la facturación.';
revoke all on function public.deuda_guardar_foto(jsonb, uuid, text[]) from public, anon, authenticated;
grant execute on function public.deuda_guardar_foto(jsonb, uuid, text[]) to service_role;

-- La lectura ha fallado: se apunta y la foto anterior se queda como estaba.
create or replace function public.deuda_lectura_fallida(p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  update facturas_pendientes_estado set ultima_en = now(), error = left(coalesce(nullif(btrim(p_error), ''), 'No se ha podido leer la facturación.'), 500) where id;
end $$;
comment on function public.deuda_lectura_fallida(text) is '[Precio y pago] Apunta que el último intento de leer las facturas pendientes de cobro ha fallado y por qué. La foto anterior no se toca. Quién: servidor. Argumentos: p_error: el motivo.';
revoke all on function public.deuda_lectura_fallida(text) from public, anon, authenticated;
grant execute on function public.deuda_lectura_fallida(text) to service_role;

-- ---- 5. Lo que ve Dynamo ---------------------------------------------------------------
create or replace function public.deuda_clientes(p_clientes uuid[])
returns table (cliente_id uuid, pendiente numeric, vencido numeric, facturas integer, vence_primera date)
language plpgsql stable security definer set search_path = public as $$
declare hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  if not (es_equipo_dynamo() or es_servidor()) then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  return query
    select f.cliente_id, sum(f.pendiente), coalesce(sum(f.pendiente) filter (where f.fecha_vencimiento < hoy), 0),
           count(*)::int, min(f.fecha_vencimiento)
      from facturas_pendientes f
     where f.cliente_id = any(coalesce(p_clientes, '{}'))
     group by f.cliente_id;
end $$;
comment on function public.deuda_clientes(uuid[]) is '[Precio y pago] Lo que debe cada cliente según la última foto de facturas pendientes de cobro: total pendiente, cuánto de eso está vencido, cuántas facturas y el vencimiento más antiguo. Solo salen los clientes que deben algo. Quién: equipo de Dynamo o servidor. Argumentos: p_clientes: lista de clientes.id.';
revoke all on function public.deuda_clientes(uuid[]) from public, anon;
grant execute on function public.deuda_clientes(uuid[]) to authenticated, service_role;

create or replace function public.deuda_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare hoy date := (now() at time zone 'Europe/Madrid')::date; e facturas_pendientes_estado; r jsonb;
begin
  if not (es_equipo_dynamo() or es_servidor()) then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  select * into e from facturas_pendientes_estado where id;
  select jsonb_build_object(
      'pendiente', coalesce(sum(pendiente), 0),
      'vencido', coalesce(sum(pendiente) filter (where fecha_vencimiento < hoy), 0),
      'pendiente_clientes', coalesce(sum(pendiente) filter (where cliente_id is not null), 0),
      'pendiente_otros', coalesce(sum(pendiente) filter (where cliente_id is null), 0),
      'facturas_otros', count(*) filter (where cliente_id is null))
    into r from facturas_pendientes;
  return r || jsonb_build_object('ultima_en', e.ultima_en, 'ultima_ok_en', e.ultima_ok_en, 'error', e.error,
    'facturas', e.facturas, 'sin_cliente', e.sin_cliente, 'sin_cif', e.sin_cif);
end $$;
comment on function public.deuda_estado() is '[Precio y pago] Resumen de la última foto de facturas pendientes de cobro: cuándo se leyó, si falló, cuántas facturas, total pendiente y vencido, y cuánto corresponde a contactos que no son clientes de la plataforma. Quién: equipo de Dynamo o servidor. Argumentos: sin argumentos.';
revoke all on function public.deuda_estado() from public, anon;
grant execute on function public.deuda_estado() to authenticated, service_role;
