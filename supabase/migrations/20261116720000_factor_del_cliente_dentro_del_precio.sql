-- =====================================================================================
-- EL FACTOR DEL CLIENTE VA DENTRO DEL PRECIO, Y EL ENVÍO LO RECUERDA (usuario, 2026-11-16)
-- =====================================================================================
-- «Debe ser algo interno… como si fuera un precio normal. No se muestra descuento ni nada.
-- Pero internamente registramos que lleva descuento, o el precio original.»
--
-- Hasta hoy el descuento de bienvenida (y cualquier factor del cliente) solo se aplicaba al
-- calcular un precio SIN cliente. Con cliente —creándolo él o Dynamo en su nombre— salía
-- la tarifa a secas, y el envío no guardaba nada.
--
-- AHORA:
--   · El asistente aplica el factor del cliente al precio (el de bienvenida en sus primeros
--     envíos; después 0 %, o el que Dynamo le haya fijado a mano). El cliente ve UN precio,
--     sin línea de descuento ni porcentaje.
--   · El envío guarda dos datos, solo para Dynamo:
--       importe_tarifa     → el precio de tarifa ANTES del factor (el «precio original»);
--       factor_tarifa_pct  → el factor que se le aplicó.
--   · Un envío conserva SU factor: si el cliente lo modifica cuando ya no tiene descuento,
--     el precio nuevo se calcula con el factor con el que se creó (no le sube de golpe).
--   · Si el precio final no sale de «tarifa × factor» (Dynamo lo puso a mano, o una revisión
--     lo movió), el factor queda vacío: ese precio no lleva el factor.

-- ---- 1. El precio de tarifa, antes del factor -----------------------------------------
alter table envios add column importe_tarifa numeric(10,2);
comment on column public.envios.importe_tarifa is 'formato: número decimal (2 decimales) | rango: > 0 y <= 100000 | lista: no aplica | opcional | Precio de tarifa en euros, SIN IVA y ANTES de aplicar el factor del cliente (el «precio original» del tarifador). Lo anota el asistente al crear o modificar el envío; vacío si el precio no salió del tarifador. Solo lo ve Dynamo. Ej. OK: 1000.00 · Ej. mal: -10';
comment on column public.envios.factor_tarifa_pct is 'formato: número decimal (2 decimales) | rango: numérico, 2 decimales (el factor del cliente va de −30 a +30) | lista: no aplica | automático | Factor del cliente (%) que lleva dentro el precio de este envío: importe_cliente = importe_tarifa × (1 + factor/100), redondeado. Negativo = descuento (p. ej. el de bienvenida). Lo pone la base de datos; vacío si el precio no sale de la tarifa (puesto a mano o revisado). El envío conserva su factor aunque el del cliente cambie después. Solo lo ve Dynamo. Ej. OK: -7.00';

-- ---- 2. Qué factor toca -----------------------------------------------------------------
create or replace function factor_tarifa_envio(p_cliente uuid, p_envio uuid default null)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v numeric;
begin
  if p_cliente is null then return null; end if;
  if not es_equipo_dynamo() and p_cliente is distinct from cliente_del_usuario() then
    raise exception 'No tienes permiso para hacer esto.' using errcode = '42501';
  end if;
  if p_envio is not null then
    select e.factor_tarifa_pct into v from envios e where e.id = p_envio and e.cliente_id = p_cliente;
  end if;
  return coalesce(v, (select c.factor_tarifa_pct from clientes c where c.id = p_cliente), 0);
end $$;
revoke execute on function factor_tarifa_envio(uuid, uuid) from public, anon;
grant execute on function factor_tarifa_envio(uuid, uuid) to authenticated;
comment on function public.factor_tarifa_envio(uuid, uuid) is '[Precio y pago] El factor (%) que el asistente aplica a la tarifa para calcular el precio de un envío: el del propio envío si ya lo tiene (al modificarlo conserva el suyo), y si no el del cliente hoy (bienvenida, 0 % o el fijado a mano). Negativo = descuento. No se enseña al cliente: va dentro del precio. Quién: el equipo de Dynamo para cualquier cliente; el cliente solo para su empresa. Argumentos: p_cliente: clientes.id · p_envio: envios.id al modificar uno (opcional).';

-- ---- 3. El envío recuerda su factor -----------------------------------------------------
create or replace function fn_envios_ah_tarifa_factor()
returns trigger language plpgsql security definer set search_path = public as $$
declare f numeric;
begin
  if tg_op = 'UPDATE' and new.importe_cliente is not distinct from old.importe_cliente
     and new.importe_tarifa is not distinct from old.importe_tarifa then
    return new;
  end if;
  if new.importe_tarifa is not null and (new.importe_tarifa <= 0 or new.importe_tarifa > 100000) then new.importe_tarifa := null; end if;
  if coalesce(new.es_manual, false) or new.cliente_id is null or new.importe_tarifa is null or new.importe_cliente is null then
    new.factor_tarifa_pct := null;
    return new;
  end if;
  -- El envío conserva su factor; si aún no tiene, el del cliente en este momento.
  f := coalesce(case when tg_op = 'UPDATE' then old.factor_tarifa_pct end,
                (select c.factor_tarifa_pct from clientes c where c.id = new.cliente_id), 0);
  -- El tarifador redondea a la decena: hasta 5 € de diferencia es «tarifa × factor».
  new.factor_tarifa_pct := case when abs(new.importe_tarifa * (1 + f / 100) - new.importe_cliente) <= 5.01 then f end;
  return new;
end $$;
revoke execute on function fn_envios_ah_tarifa_factor() from public, anon, authenticated;
comment on function public.fn_envios_ah_tarifa_factor() is '[Disparadores] Al guardar el precio de un envío con su precio de tarifa (importe_tarifa), anota el factor del cliente que lleva dentro: el que ya tenía el envío o, si no, el del cliente en ese momento. Si el precio no cuadra con tarifa × factor (puesto a mano o revisado), deja el factor vacío. Quién: se ejecuta sola. Argumentos: sin argumentos.';
create trigger tg_envios_ah_tarifa_factor before insert or update of importe_cliente, importe_tarifa on envios
  for each row execute function fn_envios_ah_tarifa_factor();

-- ---- 4. Las tres puertas por las que entra un precio del tarifador ---------------------
-- El cliente crea su envío.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.crear_envio_cliente(jsonb, jsonb)'::regprocedure);
  n := replace(v, 'condiciones_aceptadas_en, importe_cliente,', 'condiciones_aceptadas_en, importe_cliente, importe_tarifa,');
  if n = v then raise exception 'crear_envio_cliente: no encuentro la lista de columnas'; end if;
  v := n;
  n := replace(v, '''aceptada'', now(), v_importe,', '''aceptada'', now(), v_importe, round((p_datos ->> ''importe_tarifa'')::numeric, 2),');
  if n = v then raise exception 'crear_envio_cliente: no encuentro los valores'; end if;
  execute n;
end $$;
-- Dynamo crea un envío para un cliente.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.crear_envio(jsonb, jsonb)'::regprocedure);
  n := replace(v, 'importe_cliente, importe_transportista, precio_fijado_a_mano, iva_pct,', 'importe_cliente, importe_transportista, precio_fijado_a_mano, importe_tarifa, iva_pct,');
  if n = v then raise exception 'crear_envio: no encuentro la lista de columnas'; end if;
  v := n;
  n := replace(v, E'(p_datos ->> ''importe_cliente'') is not null,\n', E'(p_datos ->> ''importe_cliente'') is not null,\n    round((p_datos ->> ''importe_tarifa'')::numeric, 2),\n');
  if n = v then raise exception 'crear_envio: no encuentro los valores'; end if;
  execute n;
end $$;
-- El cliente modifica su envío.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.modificar_envio_cliente(uuid, jsonb, jsonb)'::regprocedure);
  n := replace(v, E'    importe_cliente = v_importe,\n', E'    importe_cliente = v_importe,\n    importe_tarifa = round((p_datos ->> ''importe_tarifa'')::numeric, 2),\n');
  if n = v then raise exception 'modificar_envio_cliente: no encuentro dónde guarda el precio'; end if;
  execute n;
end $$;
