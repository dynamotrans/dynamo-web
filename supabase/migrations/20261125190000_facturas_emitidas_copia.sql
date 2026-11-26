-- =====================================================================================
-- COPIA DE LAS FACTURAS EMITIDAS, SIEMPRE AL DÍA (usuario, 2026-11-25)
-- =====================================================================================
-- «Debemos mostrar facturas de clientes en el panel de admin y en el panel del cliente.
-- Recibidas no: eso lo gestionamos con la facturación. Solo las emitidas por Dynamo, para
-- controlar crédito, estado de cobros, pagos tardíos…» · «Me basta con tener las de los
-- últimos 12 meses de partida, y se irán acumulando a partir de ahí ya siempre. El tema es
-- que son vivas: imagínate que me pagan una factura de hace 11 meses…»
--
-- CÓMO (antes solo se guardaba una «foto» de las pendientes y la lista se pedía en vivo, 200):
--   · Arranque, una vez: las emitidas de los últimos 12 meses, por tandas. Además, todas las
--     que sigan pendientes de cobro, tengan la fecha que tengan (cuentan en la deuda).
--   · Cada 10 minutos (laborables de día; el resto, cada hora) el servidor pide SOLO las
--     pendientes y las compara con esta copia: la que aquí estaba pendiente y ya no viene, se
--     ha cobrado o anulado → se relee esa sola. Más las últimas emitidas (las nuevas).
--   · Cada noche, repaso de los últimos 12 meses (lo que se haya corregido en una ya cobrada).
--   · Nunca se borra nada: lo que sale de la ventana de 12 meses se queda guardado.
-- SOLO LECTURA de la facturación: aquí solo se escribe en NUESTRAS tablas.
-- Sustituye a facturas_pendientes (la foto) y a sus dos funciones de guardado.

-- ---- 1. La copia -----------------------------------------------------------------------
create table if not exists public.facturas_emitidas (
  ref_externa       text primary key check (length(ref_externa) between 1 and 60),
  cliente_id        uuid references clientes(id) on delete set null,
  contacto_id       text,
  contacto_nombre   text check (contacto_nombre is null or length(contacto_nombre) <= 200),
  cif               text check (cif is null or length(cif) <= 40),
  numero            text check (numero is null or length(numero) <= 60),
  fecha_emision     date not null,
  fecha_vencimiento date,
  base              numeric(12,2) not null default 0,
  iva               numeric(12,2) not null default 0,
  retencion         numeric(12,2) not null default 0,
  total             numeric(12,2) not null default 0,
  pendiente         numeric(12,2) not null default 0,
  estado            text not null check (estado in ('pendiente', 'parcial', 'pagada', 'anulada', 'otro')),
  pagada_el         date,
  cuenta            text check (cuenta is null or length(cuenta) <= 200),
  estado_desde      timestamptz not null default now(),
  leido_en          timestamptz not null default now(),
  creado_en         timestamptz not null default now()
);
create index if not exists facturas_emitidas_fecha_idx on public.facturas_emitidas (fecha_emision desc, ref_externa);
create index if not exists facturas_emitidas_cliente_idx on public.facturas_emitidas (cliente_id, fecha_emision desc);
create index if not exists facturas_emitidas_por_cobrar_idx on public.facturas_emitidas (cliente_id) where pendiente > 0;
create index if not exists facturas_emitidas_contacto_idx on public.facturas_emitidas (contacto_id);
comment on table public.facturas_emitidas is '[Precio y pago] COPIA de las facturas emitidas por Dynamo, leída del programa de facturación y mantenida al día sola (las pendientes cada pocos minutos, todo el último año cada noche). De ella salen la lista de facturas de Dynamo y de cada cliente, lo que debe cada cliente y los días que tarda en pagar. Nunca se borra: se va acumulando. Lo escribe el servidor; el equipo de Dynamo la ve entera y cada cliente, las suyas, por la función facturas_lista.';
comment on column public.facturas_emitidas.ref_externa is 'formato: texto | rango: 1 a 60 | lista: no aplica | automático | Identificador de la factura en el programa de facturación.';
comment on column public.facturas_emitidas.cliente_id is 'formato: uuid | → clientes.id | rango: no aplica | lista: no aplica | automático | Cliente de la plataforma al que corresponde, casado por CIF. Vacío si ese contacto no es cliente de la plataforma.';
comment on column public.facturas_emitidas.contacto_id is 'formato: texto | rango: no aplica | lista: no aplica | automático | Identificador del contacto en el programa de facturación.';
comment on column public.facturas_emitidas.contacto_nombre is 'formato: texto | rango: hasta 200 | lista: no aplica | automático | Nombre de la empresa según la factura.';
comment on column public.facturas_emitidas.cif is 'formato: texto | rango: hasta 40 | lista: no aplica | automático | CIF del contacto (de holded_contactos), con el que se casa con un cliente. Vacío hasta que se consulta.';
comment on column public.facturas_emitidas.numero is 'formato: texto | rango: hasta 60 | lista: no aplica | automático | Número de la factura. Ej. OK: F260412';
comment on column public.facturas_emitidas.fecha_emision is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | automático | Día de la factura.';
comment on column public.facturas_emitidas.fecha_vencimiento is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | automático | Día en que vence el pago. Pasado ese día sin cobrar del todo, está vencida.';
comment on column public.facturas_emitidas.base is 'formato: número con 2 decimales, euros SIN IVA | rango: no aplica | lista: no aplica | automático | Base imponible.';
comment on column public.facturas_emitidas.iva is 'formato: número con 2 decimales, euros | rango: no aplica | lista: no aplica | automático | Importe del IVA.';
comment on column public.facturas_emitidas.retencion is 'formato: número con 2 decimales, euros | rango: 0 o más | lista: no aplica | automático | Importe retenido (IRPF), en positivo. 0 si no hay.';
comment on column public.facturas_emitidas.total is 'formato: número con 2 decimales, euros CON IVA | rango: no aplica | lista: no aplica | automático | Importe total de la factura.';
comment on column public.facturas_emitidas.pendiente is 'formato: número con 2 decimales, euros CON IVA | rango: no aplica | lista: no aplica | automático | Lo que falta por cobrar (el total menos lo ya cobrado), tal como lo dice la facturación. ES LO QUE MANDA PARA LA DEUDA (usuario, 2026-11-25: «importes, más que estado»): una factura debe lo que diga este importe, la llame como la llame el estado. 0 si está anulada.';
comment on column public.facturas_emitidas.estado is 'formato: texto | rango: no aplica | lista: pendiente · parcial · pagada · anulada · otro | automático | Estado del cobro según la facturación: sin cobrar nada, cobrada en parte, cobrada entera, anulada o borrada, u otro. Sirve para pintar la lista; la deuda se calcula con el importe pendiente, no con esto. «Vencida» no se guarda: es la que tiene algo pendiente con el vencimiento pasado.';
comment on column public.facturas_emitidas.pagada_el is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | automático | Día del último cobro, cuando está pagada. Vacío si no está pagada o no se sabe el día.';
comment on column public.facturas_emitidas.cuenta is 'formato: texto | rango: hasta 200 | lista: no aplica | automático | Cuenta contable de sus líneas. Solo la ve Dynamo.';
comment on column public.facturas_emitidas.estado_desde is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo vio la plataforma el último cambio de estado.';
comment on column public.facturas_emitidas.leido_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Última vez que se leyó esta factura de la facturación.';
comment on column public.facturas_emitidas.creado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo entró en la copia.';

-- ---- 2. Cómo va la copia (una sola fila) -----------------------------------------------
create table if not exists public.facturas_copia_estado (
  id                 boolean primary key default true check (id),
  ultima_en          timestamptz,
  ultima_ok_en       timestamptz,
  error              text check (error is null or length(error) <= 500),
  carga_completa_en  timestamptz,
  barrido_tipo       text check (barrido_tipo is null or barrido_tipo in ('inicial', 'repaso')),
  barrido_desde      date,
  barrido_hasta      date,
  barrido_cobros     date,
  barrido_inicio_en  timestamptz,
  repaso_en          timestamptz,
  repaso_desde       date,
  repaso_inicio_en   timestamptz
);
insert into public.facturas_copia_estado (id) values (true) on conflict (id) do nothing;
comment on table public.facturas_copia_estado is '[Precio y pago] Una sola fila: cómo va la copia de facturas emitidas (última lectura, si falló, si ya se cargó el primer año, por dónde va el repaso en curso y cuándo fue el último completo). Lo escribe el servidor.';
comment on column public.facturas_copia_estado.id is 'formato: sí/no | rango: no aplica | lista: sí | automático | Siempre «sí»: garantiza que solo hay una fila.';
comment on column public.facturas_copia_estado.ultima_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Último intento de lectura, saliera bien o mal.';
comment on column public.facturas_copia_estado.ultima_ok_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Última lectura que salió bien: la copia está al día a ese momento.';
comment on column public.facturas_copia_estado.error is 'formato: texto | rango: hasta 500 | lista: no aplica | automático | Por qué falló el último intento. Vacío si salió bien.';
comment on column public.facturas_copia_estado.carga_completa_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo terminó la primera carga (los últimos 12 meses). Vacío = aún cargando.';
comment on column public.facturas_copia_estado.barrido_tipo is 'formato: texto | rango: no aplica | lista: inicial · repaso | automático | Repaso por fechas en curso: la primera carga o el repaso de cada noche. Vacío = ninguno en curso.';
comment on column public.facturas_copia_estado.barrido_desde is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | automático | Desde qué día de factura cubre el repaso en curso.';
comment on column public.facturas_copia_estado.barrido_hasta is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | automático | Hasta qué día falta por leer (se lee de la más nueva a la más antigua). Vacío = las facturas ya están; faltan los cobros.';
comment on column public.facturas_copia_estado.barrido_cobros is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | automático | Desde qué día faltan por leer los cobros del repaso en curso.';
comment on column public.facturas_copia_estado.barrido_inicio_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo empezó el repaso en curso.';
comment on column public.facturas_copia_estado.repaso_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo terminó el último repaso completo.';
comment on column public.facturas_copia_estado.repaso_desde is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | automático | Desde qué día de factura cubrió el último repaso completo.';
comment on column public.facturas_copia_estado.repaso_inicio_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo empezó el último repaso completo: una factura de ese periodo no leída desde entonces ya no está en la facturación y se comprueba una a una.';

-- Permisos: las ve el equipo de Dynamo; el cliente, solo por facturas_lista; solo escribe el servidor.
do $$ declare t text; begin
  foreach t in array array['facturas_emitidas', 'facturas_copia_estado'] loop
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

-- Lo que ya había en la foto pasa a la copia (para no quedarse a cero hasta la primera lectura).
insert into public.facturas_emitidas (ref_externa, cliente_id, contacto_id, contacto_nombre, cif, numero, fecha_emision, fecha_vencimiento, total, pendiente, estado, leido_en)
select p.ref_externa, p.cliente_id, lower(p.contacto_id), left(p.contacto_nombre, 200), left(p.cif, 40), left(p.numero, 60),
       coalesce(p.fecha_emision, p.fecha_vencimiento, p.leido_en::date), p.fecha_vencimiento, p.total, p.pendiente,
       case when p.pendiente < p.total then 'parcial' else 'pendiente' end, p.leido_en
  from public.facturas_pendientes p
on conflict (ref_externa) do nothing;

-- ---- 3. Guardar lo leído (solo el servidor) ----------------------------------------------
-- p_facturas: [{id, numero, contacto_id, contacto_nombre, emision, vence, base, iva, retencion,
--               total, pendiente, estado, pagada_el, cuenta}]. Añade o actualiza; nunca borra.
-- El CIF y el cliente salen de holded_contactos (el servidor consulta antes los contactos nuevos).
create or replace function public.facturas_guardar(p_facturas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not es_servidor() then raise exception 'Solo el servidor guarda la copia de facturas.' using errcode = '42501'; end if;
  if p_facturas is null or jsonb_typeof(p_facturas) <> 'array' then raise exception 'Las facturas no tienen la forma esperada.'; end if;
  if jsonb_array_length(p_facturas) > 5000 then raise exception 'Demasiadas facturas de una vez.'; end if;
  insert into facturas_emitidas (ref_externa, cliente_id, contacto_id, contacto_nombre, cif, numero, fecha_emision, fecha_vencimiento,
                                 base, iva, retencion, total, pendiente, estado, pagada_el, cuenta)
  select distinct on (f.id) f.id, c.id, lower(f.contacto_id), left(f.contacto_nombre, 200), left(hc.cif, 40), left(f.numero, 60), f.emision, f.vence,
         round(coalesce(f.base, 0), 2), round(coalesce(f.iva, 0), 2), greatest(round(coalesce(f.retencion, 0), 2), 0), round(coalesce(f.total, 0), 2),
         case when f.estado = 'anulada' then 0 else round(coalesce(f.pendiente, 0), 2) end,
         case when f.estado in ('pendiente', 'parcial', 'pagada', 'anulada') then f.estado else 'otro' end,
         case when f.estado = 'pagada' then f.pagada_el end, left(f.cuenta, 200)
    from jsonb_to_recordset(p_facturas) as f(id text, numero text, contacto_id text, contacto_nombre text, emision date, vence date,
                                             base numeric, iva numeric, retencion numeric, total numeric, pendiente numeric,
                                             estado text, pagada_el date, cuenta text)
    left join holded_contactos hc on hc.contacto_id = lower(f.contacto_id)
    left join clientes c on nullif(cif_base(hc.cif), '') is not null and cif_base(c.cif) = cif_base(hc.cif)
   where f.id is not null and length(f.id) between 1 and 60 and f.emision is not null
   order by f.id, c.creado_en
  on conflict (ref_externa) do update set
    contacto_id = coalesce(excluded.contacto_id, facturas_emitidas.contacto_id), contacto_nombre = coalesce(excluded.contacto_nombre, facturas_emitidas.contacto_nombre),
    cif = coalesce(excluded.cif, facturas_emitidas.cif),
    cliente_id = case when excluded.cif is not null then excluded.cliente_id else facturas_emitidas.cliente_id end,
    numero = coalesce(excluded.numero, facturas_emitidas.numero), fecha_emision = excluded.fecha_emision, fecha_vencimiento = excluded.fecha_vencimiento,
    base = excluded.base, iva = excluded.iva, retencion = excluded.retencion, total = excluded.total, pendiente = excluded.pendiente,
    estado_desde = case when facturas_emitidas.estado is distinct from excluded.estado then now() else facturas_emitidas.estado_desde end,
    pagada_el = case when excluded.estado = 'pagada' then coalesce(excluded.pagada_el, facturas_emitidas.pagada_el) end,
    estado = excluded.estado, cuenta = coalesce(excluded.cuenta, facturas_emitidas.cuenta), leido_en = now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;
comment on function public.facturas_guardar(jsonb) is '[Precio y pago] Añade o actualiza en la copia las facturas emitidas que el servidor acaba de leer de la facturación, casando cada una con su cliente por el CIF de su contacto. Nunca borra. Apunta cuándo cambia el estado de cada una. Devuelve cuántas ha tocado. Quién: servidor. Argumentos: p_facturas: lista de facturas (id, numero, contacto_id, contacto_nombre, emision, vence, base, iva, retencion, total, pendiente, estado, pagada_el, cuenta).';
revoke all on function public.facturas_guardar(jsonb) from public, anon, authenticated;
grant execute on function public.facturas_guardar(jsonb) to service_role;

-- Cobros leídos aparte: el día del último cobro de cada factura ya pagada.
create or replace function public.facturas_apuntar_cobros(p_cobros jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  if p_cobros is null or jsonb_typeof(p_cobros) <> 'array' then raise exception 'Los cobros no tienen la forma esperada.'; end if;
  if jsonb_array_length(p_cobros) > 20000 then raise exception 'Demasiados cobros de una vez.'; end if;
  update facturas_emitidas f set pagada_el = x.fecha
    from (select c.documento, max(c.fecha) as fecha from jsonb_to_recordset(p_cobros) as c(documento text, fecha date)
           where c.documento is not null and c.fecha is not null group by c.documento) x
   where f.ref_externa = x.documento and f.estado = 'pagada' and (f.pagada_el is null or f.pagada_el < x.fecha);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
comment on function public.facturas_apuntar_cobros(jsonb) is '[Precio y pago] Apunta en la copia el día del último cobro de las facturas ya pagadas, con los cobros que el servidor acaba de leer de la facturación. Devuelve cuántas ha tocado. Quién: servidor. Argumentos: p_cobros: lista de cobros (documento, fecha).';
revoke all on function public.facturas_apuntar_cobros(jsonb) from public, anon, authenticated;
grant execute on function public.facturas_apuntar_cobros(jsonb) to service_role;

-- Facturas que ya no existen en la facturación (borradas o devueltas a borrador): no se borran
-- de la copia; quedan como anuladas y dejan de contar.
create or replace function public.facturas_anular(p_ids text[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  update facturas_emitidas set estado = 'anulada', pendiente = 0, pagada_el = null, estado_desde = now(), leido_en = now()
   where ref_externa = any(coalesce(p_ids, '{}')) and estado <> 'anulada';
  get diagnostics v_n = row_count;
  update facturas_emitidas set leido_en = now() where ref_externa = any(coalesce(p_ids, '{}')) and estado = 'anulada';
  return v_n;
end $$;
comment on function public.facturas_anular(text[]) is '[Precio y pago] Marca como anuladas las facturas de la copia que ya no están en la facturación (borradas o devueltas a borrador). No las borra: dejan de contar como deuda y el cliente deja de verlas. Devuelve cuántas ha cambiado. Quién: servidor. Argumentos: p_ids: identificadores de la facturación.';
revoke all on function public.facturas_anular(text[]) from public, anon, authenticated;
grant execute on function public.facturas_anular(text[]) to service_role;

-- Volver a casar facturas y clientes: un contacto cuyo CIF se acaba de consultar, o un cliente
-- que se ha dado de alta después de sus facturas.
create or replace function public.facturas_casar()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  with cc as (
    select distinct on (hc.contacto_id) hc.contacto_id, left(hc.cif, 40) as cif, c.id as cliente_id
      from holded_contactos hc
      left join (select id, creado_en, cif_base(cif) as b from clientes) c on c.b <> '' and c.b = cif_base(hc.cif)
     order by hc.contacto_id, c.creado_en)
  update facturas_emitidas f set cif = coalesce(cc.cif, f.cif), cliente_id = case when cc.cif is not null then cc.cliente_id else f.cliente_id end
    from cc
   where f.contacto_id = cc.contacto_id
     and (f.cif is distinct from coalesce(cc.cif, f.cif) or f.cliente_id is distinct from case when cc.cif is not null then cc.cliente_id else f.cliente_id end);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
comment on function public.facturas_casar() is '[Precio y pago] Vuelve a casar las facturas de la copia con los clientes de la plataforma por el CIF de su contacto (por si el CIF se acaba de consultar o el cliente se dio de alta después). Devuelve cuántas ha cambiado. Quién: servidor. Argumentos: sin argumentos.';
revoke all on function public.facturas_casar() from public, anon, authenticated;
grant execute on function public.facturas_casar() to service_role;

-- ---- 4. La lista: Dynamo (todas) y cada cliente (las suyas) -------------------------------
create or replace function public.facturas_lista(p_q text default null, p_estado text default 'todas', p_desde date default null, p_hasta date default null,
                                                 p_pagina integer default 1, p_por integer default 25, p_cliente uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_todo boolean := ve_todo();
  v_cli uuid;
  hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_por int := least(greatest(coalesce(p_por, 25), 1), 100);
  v_pag int := greatest(coalesce(p_pagina, 1), 1);
  v_pal text[];
  r jsonb;
begin
  if v_todo then v_cli := p_cliente;
  else
    v_cli := cliente_del_usuario();
    if v_cli is null then raise exception 'Sin permiso para ver facturas.' using errcode = '42501'; end if;
  end if;
  if coalesce(p_estado, 'todas') not in ('todas', 'por_cobrar', 'vencida', 'pagada', 'anulada') then raise exception 'Filtro de estado no válido.'; end if;
  -- Palabras del buscador (hasta 6), sin tildes y con los comodines del «like» como letras.
  select array_agg(replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_')) into v_pal
    from (select w from unnest(string_to_array(lower(unaccent_simple(left(btrim(coalesce(p_q, '')), 120))), ' ')) w where w <> '' limit 6) x;

  with base as (
    select f.*,
           -- Manda el importe: con algo pendiente es «por cobrar», diga lo que diga el estado.
           case when f.estado = 'anulada' then 'anulada'
                when f.pendiente > 0 and f.fecha_vencimiento < hoy then 'vencida'
                when f.pendiente > 0 then 'pendiente'
                when f.estado in ('pendiente', 'parcial') then 'pendiente' else f.estado end as est
      from facturas_emitidas f
     where (v_cli is null or f.cliente_id = v_cli)
       and (v_todo or f.estado <> 'anulada')
       and (p_desde is null or f.fecha_emision >= p_desde) and (p_hasta is null or f.fecha_emision <= p_hasta)
       and (v_pal is null or not exists (
             select 1 from unnest(v_pal) w
              where lower(unaccent_simple(concat_ws(' ', f.numero, case when v_todo then f.contacto_nombre end, case when v_todo then f.cif end, f.total::text, replace(f.total::text, '.', ','))))
                    not like '%' || w || '%'))
  ), fil as (
    select * from base b
     where case coalesce(p_estado, 'todas')
             when 'por_cobrar' then b.est in ('pendiente', 'vencida')
             when 'vencida' then b.est = 'vencida'
             when 'pagada' then b.est = 'pagada'
             when 'anulada' then b.est = 'anulada'
             else true end
  )
  select jsonb_build_object(
      'total', (select count(*) from fil),
      'base', (select coalesce(sum(base), 0) from fil where est <> 'anulada'),
      'importe', (select coalesce(sum(total), 0) from fil where est <> 'anulada'),
      'por_cobrar', (select coalesce(sum(pendiente), 0) from fil where est in ('pendiente', 'vencida')),
      'vencido', (select coalesce(sum(pendiente), 0) from fil where est = 'vencida'),
      'filas', coalesce((select jsonb_agg(
          jsonb_build_object('id', x.ref_externa, 'numero', x.numero, 'fecha', x.fecha_emision, 'vence', x.fecha_vencimiento,
            'base', x.base, 'iva', x.iva, 'retencion', x.retencion, 'total', x.total, 'pendiente', x.pendiente,
            'estado', x.est, 'parcial', x.pendiente > 0 and x.pendiente < x.total, 'pagada_el', case when x.est = 'pagada' then x.pagada_el end)
          || case when v_todo then jsonb_build_object('empresa', x.contacto_nombre, 'cif', x.cif, 'cuenta', x.cuenta, 'es_cliente', x.cliente_id is not null)
                  else '{}'::jsonb end
          order by x.fecha_emision desc, x.numero desc nulls last, x.ref_externa)
        from (select * from fil order by fecha_emision desc, numero desc nulls last, ref_externa limit v_por offset (v_pag - 1) * v_por) x), '[]'::jsonb))
    into r;
  return r;
end $$;
comment on function public.facturas_lista(text, text, date, date, integer, integer, uuid) is '[Precio y pago] Una página de facturas emitidas de la copia, con su estado de cobro (pendiente, vencida, pagada, anulada), más el total de facturas y las sumas (base, importe, por cobrar y vencido) de lo filtrado. Dynamo las ve todas (o las de un cliente) con empresa, CIF y cuenta contable; el cliente, solo las suyas, sin las anuladas. Quién: equipo de Dynamo o cliente. Argumentos: p_q: texto a buscar (nº, empresa, CIF, importe) · p_estado: todas, por_cobrar, vencida, pagada o anulada · p_desde, p_hasta: fechas de factura · p_pagina: página (desde 1) · p_por: filas por página (1 a 100) · p_cliente: clientes.id para ver solo uno (solo Dynamo).';
revoke all on function public.facturas_lista(text, text, date, date, integer, integer, uuid) from public, anon;
grant execute on function public.facturas_lista(text, text, date, date, integer, integer, uuid) to authenticated, service_role;

-- ¿Puede quien pregunta abrir el PDF de esta factura? Devuelve su número (para el nombre del fichero).
create or replace function public.factura_visible(p_ref text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(f.numero, ''), 'factura')
    from facturas_emitidas f
   where f.ref_externa = p_ref
     and (ve_todo() or (f.estado <> 'anulada' and f.cliente_id is not null and f.cliente_id = cliente_del_usuario()))
$$;
comment on function public.factura_visible(text) is '[Precio y pago] Dice si quien pregunta puede abrir una factura de la copia: el equipo de Dynamo, cualquiera; el cliente, solo las suyas y no anuladas. Devuelve su número, o nada si no puede. Quién: equipo de Dynamo o cliente. Argumentos: p_ref: identificador de la factura en la facturación.';
revoke all on function public.factura_visible(text) from public, anon;
grant execute on function public.factura_visible(text) to authenticated, service_role;

-- ---- 5. Lo que debe cada cliente: ahora, de la copia --------------------------------------
-- La deuda es la SUMA DE IMPORTES PENDIENTES (usuario, 2026-11-25), no un recuento por estado:
-- una factura que estuvo «pagada» y a la que luego se le corrige el cobro vuelve a deber lo suyo.
create or replace function public.deuda_clientes(p_clientes uuid[])
returns table (cliente_id uuid, pendiente numeric, vencido numeric, facturas integer, vence_primera date)
language plpgsql stable security definer set search_path = public as $$
declare hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  if not (es_equipo_dynamo() or es_servidor()) then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  return query
    select f.cliente_id, sum(f.pendiente), coalesce(sum(f.pendiente) filter (where f.fecha_vencimiento < hoy), 0),
           count(*)::int, min(f.fecha_vencimiento)
      from facturas_emitidas f
     where f.cliente_id = any(coalesce(p_clientes, '{}')) and f.estado <> 'anulada' and f.pendiente > 0
     group by f.cliente_id;
end $$;
comment on function public.deuda_clientes(uuid[]) is '[Precio y pago] Lo que debe cada cliente según la copia de facturas emitidas: total pendiente de cobro, cuánto de eso está vencido, cuántas facturas y el vencimiento más antiguo. Solo salen los clientes que deben algo. Quién: equipo de Dynamo o servidor. Argumentos: p_clientes: lista de clientes.id.';

create or replace function public.deuda_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare hoy date := (now() at time zone 'Europe/Madrid')::date; e facturas_copia_estado; r jsonb;
begin
  if not (es_equipo_dynamo() or es_servidor()) then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  select * into e from facturas_copia_estado where id;
  select jsonb_build_object(
      'pendiente', coalesce(sum(pendiente), 0),
      'vencido', coalesce(sum(pendiente) filter (where fecha_vencimiento < hoy), 0),
      'pendiente_clientes', coalesce(sum(pendiente) filter (where cliente_id is not null), 0),
      'pendiente_otros', coalesce(sum(pendiente) filter (where cliente_id is null), 0),
      'facturas_otros', count(*) filter (where cliente_id is null),
      'facturas', count(*),
      'sin_cliente', count(*) filter (where cliente_id is null and nullif(cif_base(cif), '') is not null),
      'sin_cif', count(*) filter (where nullif(cif_base(cif), '') is null))
    into r from facturas_emitidas where estado <> 'anulada' and pendiente > 0;
  return r || jsonb_build_object('ultima_en', e.ultima_en, 'ultima_ok_en', e.ultima_ok_en, 'error', e.error,
    'carga_completa_en', e.carga_completa_en, 'cargando', e.carga_completa_en is null and e.barrido_tipo is not null,
    'repaso_en', e.repaso_en, 'en_copia', (select count(*) from facturas_emitidas),
    'desde', (select min(fecha_emision) from facturas_emitidas));
end $$;
comment on function public.deuda_estado() is '[Precio y pago] Resumen de la copia de facturas emitidas: cuándo se leyó por última vez, si falló, si ya terminó la primera carga, cuántas facturas guarda y desde qué fecha, cuántas tienen deuda, total pendiente y vencido, y cuánto corresponde a contactos que no son clientes de la plataforma. Quién: equipo de Dynamo o servidor. Argumentos: sin argumentos.';

-- La foto de antes ya no hace falta.
drop function if exists public.deuda_guardar_foto(jsonb, uuid, text[]);
drop function if exists public.deuda_lectura_fallida(text);
drop table if exists public.facturas_pendientes;
drop table if exists public.facturas_pendientes_estado;

-- ---- 6. Parámetro y tarea automática ------------------------------------------------------
insert into public.parametros (clave, valor, descripcion) values
  ('facturas_copia_activa', 'true', 'Facturas emitidas: true = la plataforma mantiene al día sola su copia de las facturas emitidas (cada 10 minutos en horario de oficina, cada hora el resto, y un repaso de noche). false = solo se actualiza al pulsar «Actualizar ahora». Siempre en solo lectura.')
on conflict (clave) do nothing;

-- La base de datos no habla con la facturación (la clave vive en el servidor): le pide al
-- servidor que pase. El servidor decide qué toca (seguir la primera carga, lo de cada rato o
-- el repaso de la noche). Sin pg_net, sin dirección https de la plataforma o apagado, nada.
create or replace function public.facturas_avisar()
returns boolean language plpgsql security definer set search_path = public as $$
declare v_base text; v_ahora timestamp := now() at time zone 'Europe/Madrid';
begin
  if not (es_servidor() or es_consola_supabase()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  if not coalesce((parametro('facturas_copia_activa') #>> '{}')::boolean, true) then return false; end if;
  -- De lunes a viernes, de 7 a 21, cada 10 minutos; el resto del tiempo, una vez por hora.
  if not (extract(isodow from v_ahora) between 1 and 5 and extract(hour from v_ahora) between 7 and 20)
     and extract(minute from v_ahora) >= 10 then return false; end if;
  v_base := rtrim(coalesce(parametro('url_plataforma') #>> '{}', ''), '/');
  if v_base !~ '^https://' or not exists (select 1 from pg_extension where extname = 'pg_net') then return false; end if;
  begin
    execute $q$select net.http_post(url := $1, body := $2, headers := jsonb_build_object('Content-Type', 'application/json'))$q$
      using v_base || '/api/facturas/sincronizar', '{}'::jsonb;
  exception when others then return false;
  end;
  return true;
end $$;
comment on function public.facturas_avisar() is '[Precio y pago] Tarea de cada 10 minutos: si la copia de facturas está encendida y toca (laborables de 7 a 21, cada 10 minutos; el resto, una vez por hora), le pide al servidor (/api/facturas/sincronizar) que la ponga al día. Quién: solo el sistema (pg_cron).';
revoke all on function public.facturas_avisar() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-facturas-copia', '*/10 * * * *', 'select public.facturas_avisar()');
  end if;
end $$;
