-- BLOQUEO POR PAGOS TARDÍOS: LOS PROGRAMADOS SE QUEDAN Y 7 DÍAS DE GRACIA AL DEVOLVER EL CRÉDITO
-- (usuario, 2026-11-26).
-- «El crédito de Dynamo se pone a cero y se queda sin crédito. Si yo manualmente quiero
-- habilitarlo, vuelvo a poner el crédito que sea… que la próxima pasada sea a los 7 días, para
-- que no se autocancele en el momento que lo habilito.» Y decidió:
--   · Al bloquear, los envíos que YA tenía programados a crédito se quedan como estaban (hay
--     camión comprometido): solo los nuevos van con pago previo. Nada se anula por el bloqueo.
--   · Al devolverle el crédito (el botón de su ficha o escribiéndolo a mano), 7 días de gracia
--     (parámetro) sin revisarle. Pasados, cuentan las facturas que SIGAN sin pagar y las nuevas
--     pagadas tarde; las que ya pagó tarde en su día quedan perdonadas.

insert into parametros (clave, valor, descripcion) values
  ('pago_tarde_dias_gracia', '7', 'Pagos tardíos: días de gracia al devolver el crédito a un cliente bloqueado (con el botón de su ficha o escribiéndolo a mano). En esos días no se le revisa; después cuentan las facturas que sigan sin pagar y las nuevas pagadas tarde.')
on conflict (clave) do nothing;

alter table public.clientes_pagos add column if not exists gracia_hasta timestamptz;
comment on column public.clientes_pagos.gracia_hasta is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Hasta cuándo no se le revisan los pagos tardíos tras devolverle el crédito (parámetro pago_tarde_dias_gracia). Vacío = sin gracia.';
comment on column public.clientes_pagos.facturas_perdonadas is 'formato: lista de UUID | → facturas_cliente.id | rango: no aplica | lista: no aplica | automático | Facturas que ya había pagado tarde cuando se le devolvió el crédito: no vuelven a contar. Las que entonces seguían sin pagar NO se perdonan: pasada la gracia, si siguen sin pagar, cuentan.';

-- ---- 1. Devolver el crédito: gracia y solo se perdonan las ya pagadas ----------------------
create or replace function public.fn_credito_rehabilitar(p_cliente uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e jsonb;
begin
  e := fn_credito_pagos_estado(p_cliente);
  update clientes_pagos
     set bloqueado_en = null, bloqueado_motivo = null, aviso_al_dia_en = null, modificado_en = now(), credito_manual_antes = null,
         gracia_hasta = now() + make_interval(days => greatest(parametro_num('pago_tarde_dias_gracia', 7)::int, 0)),
         facturas_perdonadas = coalesce((select array_agg(f.id) from facturas_cliente f
                                          where f.id in (select t.id::uuid from jsonb_array_elements_text(e -> 'tardias_ids') t(id))
                                            and f.fecha_cobro is not null), '{}')
   where cliente_id = p_cliente;
end $$;
comment on function public.fn_credito_rehabilitar(uuid) is '[Gestión interna] Quita el bloqueo por pagos tardíos de un cliente: le da los días de gracia (pago_tarde_dias_gracia) y perdona las facturas que ya había pagado tarde (las que siguen sin pagar no). No toca su crédito: eso lo hace quien la llama. Quién: credito_desbloquear y el disparador del crédito manual. Argumentos: p_cliente: clientes.id.';
revoke all on function public.fn_credito_rehabilitar(uuid) from public, anon, authenticated;

create or replace function public.credito_desbloquear(p_cliente uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r clientes_pagos%rowtype;
begin
  if not es_admin_master() then raise exception 'Solo el Admin Master devuelve un crédito bloqueado.' using errcode = '42501'; end if;
  select * into r from clientes_pagos where cliente_id = p_cliente for update;
  if r.bloqueado_en is null then return jsonb_build_object('resultado', 'no_bloqueado'); end if;
  perform fn_credito_rehabilitar(p_cliente);
  -- Vuelve el crédito manual que tenía (vacío = manda otra vez el de CESCE).
  update clientes set riesgo_manual_euros = r.credito_manual_antes where id = p_cliente;
  return jsonb_build_object('resultado', 'ok', 'credito_manual', r.credito_manual_antes);
end $$;
revoke all on function public.credito_desbloquear(uuid) from public, anon;
grant execute on function public.credito_desbloquear(uuid) to authenticated;
comment on function public.credito_desbloquear(uuid) is '[Precio y pago] Devuelve el crédito a un cliente bloqueado por pagos tardíos: le repone el crédito manual que tenía antes del bloqueo (si no tenía, vuelve a mandar el de CESCE), le da los días de gracia (pago_tarde_dias_gracia) y perdona las facturas que ya había pagado tarde; las que siguen sin pagar vuelven a contar al acabar la gracia. Quién: Admin Master. Argumentos: p_cliente: clientes.id.';

-- Escribir a mano un crédito a un cliente bloqueado es lo mismo que devolvérselo.
create or replace function public.fn_clientes_credito_manual_rehabilita()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('dynamo.bloqueo_pagos', true), 'off') = 'on' then return null; end if;   -- es el propio bloqueo
  if new.riesgo_manual_euros is not distinct from old.riesgo_manual_euros then return null; end if;
  if new.riesgo_manual_euros is not null and new.riesgo_manual_euros <= 0 then return null; end if;
  if exists (select 1 from clientes_pagos where cliente_id = new.id and bloqueado_en is not null) then
    perform fn_credito_rehabilitar(new.id);
  end if;
  return null;
end $$;
comment on function public.fn_clientes_credito_manual_rehabilita() is '[Disparadores] Disparador de clientes: si a un cliente bloqueado por pagos tardíos se le escribe a mano un crédito (o se vacía para que mande CESCE), cuenta como devolvérselo: se quita el bloqueo con sus días de gracia. Quién: automático. Argumentos: ninguno.';
revoke all on function public.fn_clientes_credito_manual_rehabilita() from public, anon, authenticated;
drop trigger if exists tg_clientes_credito_manual_rehabilita on public.clientes;
create trigger tg_clientes_credito_manual_rehabilita after update of riesgo_manual_euros on public.clientes
  for each row execute function fn_clientes_credito_manual_rehabilita();

-- ---- 2. La revisión: respeta la gracia, y el bloqueo no toca los programados ---------------
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.credito_revisar_pagos(uuid)'::regprocedure);
  n := replace(d, '  -- Sin crédito no hay nada que bloquear.',
    '  -- En los días de gracia tras devolverle el crédito, no se le revisa.' || E'\n'
    || '  if r.gracia_hasta is not null and r.gracia_hasta > now() then return ''gracia''; end if;' || E'\n'
    || '  -- Sin crédito no hay nada que bloquear.');
  n := replace(n, '  update clientes set riesgo_manual_euros = 0 where id = p_cliente;',
    '  -- Los envíos que ya tenía programados se quedan como estaban (usuario, 2026-11-26).' || E'\n'
    || '  perform set_config(''dynamo.bloqueo_pagos'', ''on'', true);' || E'\n'
    || '  update clientes set riesgo_manual_euros = 0 where id = p_cliente;' || E'\n'
    || '  perform set_config(''dynamo.bloqueo_pagos'', ''off'', true);');
  n := replace(n, 'Desde ahora sus envíos nuevos van con pago previo, y los programados que ya no caben pasan a pendiente de pago.',
                  'Desde ahora sus envíos nuevos van con pago previo; los que ya tenía programados siguen como estaban.');
  -- Las perdonadas (las que ya pagó tarde cuando se le devolvió el crédito) no cuentan para
  -- llegar al tope: cuentan las que sigan sin pagar y las nuevas pagadas tarde.
  n := replace(n, $x$  if (e ->> 'tardias')::int <= (e ->> 'toleradas')::int then return 'bien'; end if;
  -- Tras devolverle el crédito, las tardías de entonces no vuelven a bloquear: hace falta una nueva.
  select count(*) into v_nuevas from jsonb_array_elements_text(e -> 'tardias_ids') t(id)
   where not (t.id::uuid = any (coalesce(r.facturas_perdonadas, '{}')));
  if v_nuevas = 0 then return 'perdonado'; end if;$x$,
  $x$  -- Las que ya pagó tarde cuando se le devolvió el crédito están perdonadas y no cuentan
  -- (usuario, 2026-11-26): cuentan las que sigan sin pagar y las nuevas pagadas tarde.
  select count(*) into v_nuevas from jsonb_array_elements_text(e -> 'tardias_ids') t(id)
   where not (t.id::uuid = any (coalesce(r.facturas_perdonadas, '{}')));
  if v_nuevas <= (e ->> 'toleradas')::int then
    return case when v_nuevas < (e ->> 'tardias')::int then 'perdonado' else 'bien' end;
  end if;$x$);
  if position('if v_nuevas <= (e ->> ''toleradas'')::int then' in n) = 0 then raise exception 'credito_revisar_pagos: no encuentro la cuenta de tardías'; end if;
  if position('return ''gracia''' in n) = 0 or position('dynamo.bloqueo_pagos' in n) = 0 or position('siguen como estaban' in n) = 0 then
    raise exception 'credito_revisar_pagos: no encuentro dónde poner la gracia o el bloqueo sin tocar los programados'; end if;
  execute n;

  d := pg_get_functiondef('public.fn_clientes_credito_libera_pagos()'::regprocedure);
  n := replace(d, '  elsif coalesce(new.riesgo_efectivo_euros, 0) < coalesce(old.riesgo_efectivo_euros, 0) then',
                  '  elsif coalesce(new.riesgo_efectivo_euros, 0) < coalesce(old.riesgo_efectivo_euros, 0)' || E'\n'
               || '        and coalesce(current_setting(''dynamo.bloqueo_pagos'', true), ''off'') <> ''on'' then   -- el bloqueo por pagos tardíos no toca los programados');
  if n = d then raise exception 'fn_clientes_credito_libera_pagos: no encuentro la rama de bajada'; end if;
  execute n;
end $$;
comment on function public.credito_revisar_pagos(uuid) is '[Gestión interna] Revisa los pagos de un cliente con la regla que le toca. Si tiene más facturas tardías de las toleradas (y alguna no perdonada), le pone a cero el crédito manual (guardando el que tenía), avisa a Dynamo y por email; sus envíos ya programados siguen como estaban, solo los nuevos van con pago previo. En los días de gracia tras devolverle el crédito no se le revisa. Si ya estaba bloqueado, solo avisa (una vez) cuando deja de tener facturas vencidas sin cobrar. Quién: nadie la llama desde fuera (la tarea diaria, la copia de facturas y los disparadores). Argumentos: p_cliente: el cliente.';

-- El estado de pagos de un cliente también dice hasta cuándo está en gracia.
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.fn_credito_pagos_estado(uuid)'::regprocedure);
  n := replace(d, $a$'bloqueado_en', r.bloqueado_en, 'bloqueado_motivo', r.bloqueado_motivo);$a$,
                  $a$'bloqueado_en', r.bloqueado_en, 'bloqueado_motivo', r.bloqueado_motivo, 'gracia_hasta', r.gracia_hasta);$a$);
  if n = d then raise exception 'fn_credito_pagos_estado: no encuentro el final'; end if;
  execute n;
end $$;
