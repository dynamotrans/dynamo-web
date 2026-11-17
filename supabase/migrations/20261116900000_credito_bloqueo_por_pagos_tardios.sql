-- =====================================================================================
-- BLOQUEO AUTOMÁTICO DEL CRÉDITO A QUIEN PAGA TARDE (usuario, 2026-11-17)
-- =====================================================================================
-- «Cuando la plataforma detecte que los pagos de las facturas de un cliente superan, por
-- ejemplo, los 60 días —hay que parametrizarlo—, el riesgo manual de Dynamo se pone a cero,
-- para que no pueda gestionar más envíos salvo previo pago, hasta que pague o negociemos.»
--   · Regla general en Parámetros: días máximos para pagar, cuántas facturas tardías se
--     toleran y en cuántas de las últimas se mira. Nace APAGADA.
--   · Excepción por cliente: los mismos dos valores; vacíos mandan los generales.
--   · Solo lo ve y lo toca el Admin Master. El cliente no ve nada: solo se queda sin crédito
--     (le llega el email «Línea de crédito retirada», que ya existía).
--   · Cuenta como tardía la factura cobrada fuera de plazo y también la que sigue SIN cobrar
--     pasado el plazo (si no, quien no paga nunca no saltaría).
--   · El crédito no se pierde: se guarda el que tenía y el Admin se lo devuelve con un botón.
--     No se devuelve solo; cuando el cliente ya no tiene facturas vencidas sin pagar, aviso.
-- Las facturas llegarán de Holded cuando se conecte su API; mientras, el Admin puede
-- apuntarlas a mano en la ficha del cliente.

-- ---- 1. Las facturas de cada cliente -----------------------------------------------------
create table facturas_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  numero text not null check (numero = btrim(numero) and length(numero) between 1 and 60),
  fecha_emision date not null,
  fecha_vencimiento date check (fecha_vencimiento is null or fecha_vencimiento >= fecha_emision),
  fecha_cobro date check (fecha_cobro is null or fecha_cobro >= fecha_emision),
  importe numeric(12,2) check (importe is null or importe >= 0),
  no_cuenta boolean not null default false,
  origen text not null default 'manual' check (origen in ('manual', 'holded')),
  ref_externa text,
  creado_en timestamptz not null default now(),
  creado_por uuid default auth.uid() references usuarios(id) on delete set null,
  unique (cliente_id, numero)
);
create unique index ux_facturas_cliente_ref_externa on facturas_cliente (ref_externa) where ref_externa is not null;
create index ix_facturas_cliente_emision on facturas_cliente (cliente_id, fecha_emision desc);
alter table facturas_cliente enable row level security;
create policy facturas_cliente_solo_admin on facturas_cliente for all to authenticated
  using (es_admin_master()) with check (es_admin_master());
create trigger tg_mantenimiento before insert or update or delete on facturas_cliente
  for each row execute function fn_bloqueo_mantenimiento();

comment on table public.facturas_cliente is '[Precio y pago] Facturas emitidas a cada cliente, con su fecha de cobro: sirven para detectar a quien paga tarde y bloquearle el crédito (credito_revisar_pagos). Las traerá la conexión con Holded; mientras, el Admin Master las apunta a mano en la ficha del cliente. Solo las ve y las toca el Admin Master: ni el resto del equipo ni el cliente.';
comment on column public.facturas_cliente.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único de la factura.';
comment on column public.facturas_cliente.cliente_id is 'formato: UUID | → clientes.id | rango: no aplica | lista: no aplica | obligatorio | Cliente al que se emitió la factura (→ clientes.id).';
comment on column public.facturas_cliente.numero is 'formato: texto | rango: 1 a 60 caracteres | lista: no aplica | obligatorio | Número de la factura; no se repite dentro del mismo cliente. Ej. OK: F-2026/0412';
comment on column public.facturas_cliente.fecha_emision is 'formato: fecha (AAAA-MM-DD) | rango: no aplica | lista: no aplica | obligatorio | Día en que se emitió la factura. Ej. OK: 2026-09-30';
comment on column public.facturas_cliente.fecha_vencimiento is 'formato: fecha (AAAA-MM-DD) | rango: igual o posterior a la emisión | lista: no aplica | opcional | Día en que vence el pago. Solo se usa si la regla cuenta los días desde el vencimiento. Ej. OK: 2026-11-29';
comment on column public.facturas_cliente.fecha_cobro is 'formato: fecha (AAAA-MM-DD) | rango: igual o posterior a la emisión | lista: no aplica | opcional | Día en que se cobró. Vacío = sigue sin cobrar. Ej. OK: 2026-12-15';
comment on column public.facturas_cliente.importe is 'formato: número con 2 decimales (euros) | rango: 0 o más | lista: no aplica | opcional | Importe total de la factura, con impuestos. Solo informativo. Ej. OK: 1089.00';
comment on column public.facturas_cliente.no_cuenta is 'formato: sí/no | rango: no aplica | lista: no aplica | obligatorio (por defecto no) | Sí = no cuenta para el bloqueo por pagos tardíos (un abono, una factura en disputa).';
comment on column public.facturas_cliente.origen is 'formato: texto | rango: no aplica | lista: manual · holded | automático | De dónde viene: apuntada a mano o traída de Holded.';
comment on column public.facturas_cliente.ref_externa is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Identificador de la factura en Holded, para no traerla dos veces.';
comment on column public.facturas_cliente.creado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se apuntó. La pone la base de datos.';
comment on column public.facturas_cliente.creado_por is 'formato: UUID | → usuarios.id | rango: no aplica | lista: no aplica | automático | Quién la apuntó (→ usuarios.id); vacío si la trajo el servidor.';

-- ---- 2. La regla propia de cada cliente y el estado del bloqueo ---------------------------
create table clientes_pagos (
  cliente_id uuid primary key references clientes(id) on delete cascade,
  dias_max integer check (dias_max is null or dias_max between 1 and 365),
  facturas_toleradas integer check (facturas_toleradas is null or facturas_toleradas between 0 and 50),
  bloqueado_en timestamptz,
  bloqueado_motivo text,
  credito_manual_antes numeric(12,2),
  facturas_perdonadas uuid[] not null default '{}',
  aviso_al_dia_en timestamptz,
  modificado_en timestamptz not null default now()
);
alter table clientes_pagos enable row level security;
create policy clientes_pagos_solo_admin on clientes_pagos for all to authenticated
  using (es_admin_master()) with check (es_admin_master());
create trigger tg_mantenimiento before insert or update or delete on clientes_pagos
  for each row execute function fn_bloqueo_mantenimiento();

comment on table public.clientes_pagos is '[Precio y pago] Por cliente: su regla propia de pagos tardíos (vacía = manda la general de Parámetros) y el estado del bloqueo automático de su crédito. Solo la ve y la toca el Admin Master.';
comment on column public.clientes_pagos.cliente_id is 'formato: UUID | → clientes.id | rango: no aplica | lista: no aplica | obligatorio | El cliente (→ clientes.id).';
comment on column public.clientes_pagos.dias_max is 'formato: número entero (días) | rango: 1 a 365 | lista: no aplica | opcional | Días que se le dan a ESTE cliente para pagar antes de contar la factura como tardía. Vacío = el general (parámetro pago_tarde_dias_max). Ej. OK: 100';
comment on column public.clientes_pagos.facturas_toleradas is 'formato: número entero | rango: 0 a 50 | lista: no aplica | opcional | Facturas tardías que se le toleran a ESTE cliente; con una más se le bloquea el crédito. Vacío = el general (parámetro pago_tarde_facturas_toleradas). Ej. OK: 5';
comment on column public.clientes_pagos.bloqueado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se le bloqueó el crédito por pagos tardíos. Vacío = no está bloqueado.';
comment on column public.clientes_pagos.bloqueado_motivo is 'formato: texto | rango: no aplica | lista: no aplica | automático | Por qué se bloqueó: cuántas facturas tardías y con qué regla.';
comment on column public.clientes_pagos.credito_manual_antes is 'formato: número con 2 decimales (euros) | rango: no aplica | lista: no aplica | automático | El crédito manual que tenía el cliente justo antes del bloqueo (vacío si no tenía y mandaba CESCE), para devolvérselo.';
comment on column public.clientes_pagos.facturas_perdonadas is 'formato: lista de UUID | → facturas_cliente.id | rango: no aplica | lista: no aplica | automático | Facturas tardías que ya había cuando el Admin devolvió el crédito: no vuelven a bloquearlo; hace falta otra tardía nueva.';
comment on column public.clientes_pagos.aviso_al_dia_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se avisó a Dynamo de que el cliente bloqueado ya no tiene facturas vencidas sin pagar.';
comment on column public.clientes_pagos.modificado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Último cambio de esta fila.';

-- ---- 3. Parámetros (la regla general) ------------------------------------------------------
insert into parametros (clave, valor, descripcion) values
  ('pago_tarde_activo', 'false', 'Bloqueo del crédito por pagos tardíos: true = la plataforma pone a cero el crédito del cliente que paga tarde (según los parámetros de abajo o su regla propia). false = no bloquea a nadie.'),
  ('pago_tarde_dias_max', '70', 'Pagos tardíos: días que tiene un cliente para pagar una factura antes de contarla como tardía. También cuenta la que sigue sin cobrar pasado ese plazo.'),
  ('pago_tarde_facturas_toleradas', '2', 'Pagos tardíos: facturas tardías que se toleran. Con una más, se bloquea el crédito (con 2: a la tercera).'),
  ('pago_tarde_ultimas_facturas', '3', 'Pagos tardíos: en cuántas de las últimas facturas del cliente se mira. Si se toleran más de las que se miran, se mira en las toleradas más una.'),
  ('pago_tarde_desde_vencimiento', 'false', 'Pagos tardíos: desde cuándo se cuentan los días. false = desde la fecha de emisión de la factura. true = desde su vencimiento (días de retraso).')
on conflict (clave) do nothing;

alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida',
                  'envio_aceptado', 'alta_pendiente', 'deca', 'cuenta_activada', 'cuenta_reactivada',
                  'cambio_email', 'envio_creado', 'envio_modificado', 'envio_cancelado', 'envio_matriculas',
                  'envio_reactivado', 'credito_cambio', 'credito_aviso', 'proforma_calculo',
                  'transportista_cancelado', 'transportista_retirado', 'transportista_modificado',
                  'credito_bloqueo'));

-- ---- 4. La regla ---------------------------------------------------------------------------
-- Cómo queda un cliente: sus facturas miradas, cuáles son tardías y con qué números.
create or replace function public.fn_credito_pagos_estado(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r clientes_pagos%rowtype;
  v_dias int; v_tol int; v_n int; v_venc boolean; hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_tardias uuid[]; v_lista jsonb; v_vencidas int;
begin
  select * into r from clientes_pagos where cliente_id = p_cliente;
  v_dias := coalesce(r.dias_max, parametro_num('pago_tarde_dias_max', 70)::int);
  v_tol  := coalesce(r.facturas_toleradas, parametro_num('pago_tarde_facturas_toleradas', 2)::int);
  v_n    := greatest(parametro_num('pago_tarde_ultimas_facturas', 3)::int, v_tol + 1);
  v_venc := coalesce((parametro('pago_tarde_desde_vencimiento') #>> '{}')::boolean, false);
  with ult as (
    select f.id, f.numero, f.fecha_emision, f.fecha_cobro,
           (coalesce(f.fecha_cobro, hoy) - coalesce(case when v_venc then f.fecha_vencimiento end, f.fecha_emision)) as dias
      from facturas_cliente f
     where f.cliente_id = p_cliente and not f.no_cuenta
     order by f.fecha_emision desc, f.numero desc
     limit v_n)
  select coalesce(array_agg(id) filter (where dias > v_dias), '{}'),
         coalesce(jsonb_agg(jsonb_build_object('numero', numero, 'emision', fecha_emision, 'cobro', fecha_cobro, 'dias', dias) order by fecha_emision desc)
                  filter (where dias > v_dias), '[]'::jsonb)
    into v_tardias, v_lista from ult;
  select count(*) into v_vencidas from facturas_cliente f
   where f.cliente_id = p_cliente and not f.no_cuenta and f.fecha_cobro is null
     and (hoy - coalesce(case when v_venc then f.fecha_vencimiento end, f.fecha_emision)) > v_dias;
  return jsonb_build_object(
    'dias_max', v_dias, 'toleradas', v_tol, 'miradas', v_n, 'desde_vencimiento', v_venc,
    'tardias', coalesce(array_length(v_tardias, 1), 0), 'tardias_ids', to_jsonb(v_tardias), 'tardias_lista', v_lista,
    'vencidas_sin_cobrar', v_vencidas,
    'regla_propia', r.dias_max is not null or r.facturas_toleradas is not null,
    'bloqueado_en', r.bloqueado_en, 'bloqueado_motivo', r.bloqueado_motivo);
end $$;
revoke all on function public.fn_credito_pagos_estado(uuid) from public, anon, authenticated;
comment on function public.fn_credito_pagos_estado(uuid) is '[Gestión interna] El cálculo de cómo va un cliente con sus pagos (ver credito_pagos_estado, que es la puerta con permiso). Quién: nadie la llama desde fuera. Argumentos: p_cliente: el cliente.';

create or replace function public.credito_pagos_estado(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (es_admin_master() or es_servidor()) then
    raise exception 'Solo el Admin Master ve los pagos de un cliente.' using errcode = '42501';
  end if;
  return fn_credito_pagos_estado(p_cliente);
end $$;
revoke all on function public.credito_pagos_estado(uuid) from public, anon;
grant execute on function public.credito_pagos_estado(uuid) to authenticated, service_role;
comment on function public.credito_pagos_estado(uuid) is '[Precio y pago] Cómo va un cliente con sus pagos: la regla que se le aplica (la suya o la general), cuántas de sus últimas facturas son tardías (cobradas fuera de plazo o sin cobrar pasado el plazo), cuáles, cuántas tiene vencidas sin cobrar y si tiene el crédito bloqueado. No cambia nada. Quién: solo el Admin Master (y el servidor). Argumentos: p_cliente: el cliente.';

-- Revisa a un cliente y, si toca, le bloquea el crédito o avisa de que ya está al día.
create or replace function public.credito_revisar_pagos(p_cliente uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  e jsonb; r clientes_pagos%rowtype; c record; v_nuevas int; v_motivo text; v_filas text;
begin
  if not coalesce((parametro('pago_tarde_activo') #>> '{}')::boolean, false) then return 'apagado'; end if;
  if mantenimiento_activo() then return 'mantenimiento'; end if;
  select id, nombre_visible, riesgo_manual_euros, riesgo_efectivo_euros into c from clientes where id = p_cliente for update;
  if c.id is null then return 'no_existe'; end if;
  e := fn_credito_pagos_estado(p_cliente);
  select * into r from clientes_pagos where cliente_id = p_cliente;

  if r.bloqueado_en is not null then
    -- Ya bloqueado: solo se avisa (una vez) cuando deja de tener facturas vencidas sin cobrar.
    if (e ->> 'vencidas_sin_cobrar')::int = 0 and r.aviso_al_dia_en is null then
      update clientes_pagos set aviso_al_dia_en = now(), modificado_en = now() where cliente_id = p_cliente;
      perform crear_aviso('dynamo', null, null, 'credito_pagos_al_dia', 'aviso',
        'Ya no debe facturas vencidas · ' || c.nombre_visible,
        'Tiene el crédito bloqueado por pagos tardíos y ya no le quedan facturas vencidas sin cobrar. Decide si se lo devuelves (ficha del cliente).',
        '/panel/clientes?ver=' || p_cliente, null);
      return 'al_dia';
    end if;
    return 'sigue_bloqueado';
  end if;

  -- Sin crédito no hay nada que bloquear.
  if coalesce(c.riesgo_efectivo_euros, 0) <= 0 then return 'sin_credito'; end if;
  if (e ->> 'tardias')::int <= (e ->> 'toleradas')::int then return 'bien'; end if;
  -- Tras devolverle el crédito, las tardías de entonces no vuelven a bloquear: hace falta una nueva.
  select count(*) into v_nuevas from jsonb_array_elements_text(e -> 'tardias_ids') t(id)
   where not (t.id::uuid = any (coalesce(r.facturas_perdonadas, '{}')));
  if v_nuevas = 0 then return 'perdonado'; end if;

  v_motivo := format('%s de sus últimas %s facturas a más de %s días%s (se le toleran %s).',
    e ->> 'tardias', e ->> 'miradas', e ->> 'dias_max',
    case when (e ->> 'desde_vencimiento')::boolean then ' del vencimiento' else '' end, e ->> 'toleradas');
  insert into clientes_pagos (cliente_id, bloqueado_en, bloqueado_motivo, credito_manual_antes, aviso_al_dia_en)
  values (p_cliente, now(), v_motivo, c.riesgo_manual_euros, null)
  on conflict (cliente_id) do update
    set bloqueado_en = excluded.bloqueado_en, bloqueado_motivo = excluded.bloqueado_motivo,
        credito_manual_antes = excluded.credito_manual_antes, aviso_al_dia_en = null, modificado_en = now();
  -- El crédito a cero: de aquí salen solos el email al cliente («Línea de crédito retirada»)
  -- y el paso a pendiente de pago de los envíos que ya no caben.
  update clientes set riesgo_manual_euros = 0 where id = p_cliente;

  perform crear_aviso('dynamo', null, null, 'credito_bloqueado_pagos', 'urgente',
    'Crédito bloqueado por pagos tardíos · ' || c.nombre_visible, v_motivo, '/panel/clientes?ver=' || p_cliente, null);
  select string_agg(format('<li><strong>%s</strong> · emitida el %s · %s · %s días</li>',
           escapar_html(x ->> 'numero'), to_char((x ->> 'emision')::date, 'DD/MM/YYYY'),
           case when x ->> 'cobro' is null then 'sin cobrar' else 'cobrada el ' || to_char((x ->> 'cobro')::date, 'DD/MM/YYYY') end,
           x ->> 'dias'), '') into v_filas
    from jsonb_array_elements(e -> 'tardias_lista') x;
  insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
  values ('credito_bloqueo:' || p_cliente || ':' || to_char(now(), 'YYYYMMDDHH24MISS'), 'credito_bloqueo', email_dynamo(),
    'Crédito bloqueado por pagos tardíos · ' || c.nombre_visible,
    format('<p>La plataforma ha puesto a <strong>cero</strong> el crédito de <strong>%s</strong>: %s</p><ul>%s</ul>'
        || '<p>Desde ahora sus envíos nuevos van con pago previo, y los programados que ya no caben pasan a pendiente de pago. Al cliente le llega el aviso de que su línea de crédito ha quedado sin efecto.</p>'
        || '<p>El crédito que tenía queda guardado: se lo devuelves desde <a href="%s/panel/clientes?ver=%s">su ficha</a> cuando pague o lo acordéis.</p>',
        escapar_html(c.nombre_visible), escapar_html(v_motivo), coalesce(v_filas, ''),
        coalesce(parametro('url_plataforma') #>> '{}', 'https://www.dynamotrans.com'), p_cliente))
  on conflict (clave) do nothing;
  return 'bloqueado';
end $$;
revoke all on function public.credito_revisar_pagos(uuid) from public, anon, authenticated;
comment on function public.credito_revisar_pagos(uuid) is '[Gestión interna] Revisa los pagos de un cliente con la regla que le toca. Si tiene más facturas tardías de las toleradas (y alguna es nueva desde la última vez que se le devolvió el crédito) y tiene crédito, se lo pone a cero guardando el que tenía, y avisa a Dynamo (campana y email con las facturas). Si ya está bloqueado y deja de tener facturas vencidas sin cobrar, avisa una vez para que Dynamo decida. No hace nada si el bloqueo está apagado (parámetro pago_tarde_activo) o en mantenimiento. Devuelve qué ha pasado. Quién: nadie la llama desde fuera; la usan el disparador de facturas y la tarea diaria. Argumentos: p_cliente: el cliente.';

create or replace function public.credito_revisar_pagos_todos()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not coalesce((parametro('pago_tarde_activo') #>> '{}')::boolean, false) then return 0; end if;
  for r in select distinct cliente_id from facturas_cliente where creado_en > now() - interval '3 years' loop
    if credito_revisar_pagos(r.cliente_id) = 'bloqueado' then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.credito_revisar_pagos_todos() from public, anon, authenticated;
comment on function public.credito_revisar_pagos_todos() is '[Gestión interna] Repaso diario de pagos tardíos: revisa a todos los clientes con facturas (una factura sin cobrar pasa a tardía solo con el paso de los días). Devuelve cuántos ha bloqueado. Quién: la tarea programada. Argumentos: sin argumentos.';

create or replace function public.fn_facturas_cliente_revisar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform credito_revisar_pagos(coalesce(new.cliente_id, old.cliente_id));
  return null;
end $$;
revoke all on function public.fn_facturas_cliente_revisar() from public, anon, authenticated;
comment on function public.fn_facturas_cliente_revisar() is '[Gestión interna] Disparador de facturas_cliente: al apuntar, cambiar o borrar una factura, revisa los pagos de ese cliente (credito_revisar_pagos). Quién: nadie la llama; la ejecuta la base de datos.';
create trigger tg_facturas_cliente_revisar after insert or update or delete on facturas_cliente
  for each row execute function fn_facturas_cliente_revisar();

-- ---- 5. Devolver el crédito ------------------------------------------------------------------
create or replace function public.credito_desbloquear(p_cliente uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r clientes_pagos%rowtype; e jsonb;
begin
  if not es_admin_master() then raise exception 'Solo el Admin Master devuelve un crédito bloqueado.' using errcode = '42501'; end if;
  select * into r from clientes_pagos where cliente_id = p_cliente for update;
  if r.bloqueado_en is null then return jsonb_build_object('resultado', 'no_bloqueado'); end if;
  e := fn_credito_pagos_estado(p_cliente);
  update clientes_pagos
     set bloqueado_en = null, bloqueado_motivo = null, aviso_al_dia_en = null, modificado_en = now(),
         facturas_perdonadas = coalesce((select array_agg(t.id::uuid) from jsonb_array_elements_text(e -> 'tardias_ids') t(id)), '{}'),
         credito_manual_antes = null
   where cliente_id = p_cliente;
  -- Vuelve el crédito manual que tenía (vacío = manda otra vez el de CESCE).
  update clientes set riesgo_manual_euros = r.credito_manual_antes where id = p_cliente;
  return jsonb_build_object('resultado', 'ok', 'credito_manual', r.credito_manual_antes);
end $$;
revoke all on function public.credito_desbloquear(uuid) from public, anon;
grant execute on function public.credito_desbloquear(uuid) to authenticated;
comment on function public.credito_desbloquear(uuid) is '[Precio y pago] Devuelve el crédito a un cliente bloqueado por pagos tardíos: le repone el crédito manual que tenía antes del bloqueo (si no tenía, vuelve a mandar el de CESCE) y apunta sus facturas tardías de hoy como ya vistas, para que no lo bloqueen otra vez; haría falta una tardía nueva. Devuelve jsonb {resultado: ok | no_bloqueado, credito_manual}. Quién: solo el Admin Master. Argumentos: p_cliente: el cliente.';

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-credito-pagos', '13 5 * * *', 'select public.credito_revisar_pagos_todos()');
  end if;
end $$;
