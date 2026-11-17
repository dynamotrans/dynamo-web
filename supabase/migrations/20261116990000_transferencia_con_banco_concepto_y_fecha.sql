-- =====================================================================================
-- MARCAR UNA PROFORMA COMO PAGADA, CON BANCO, CONCEPTO Y FECHA (usuario, 2026-11-17)
-- =====================================================================================
-- «Proteger el marcar como pagada la proforma con una ventana de selección de banco
-- (Santander, CaixaBank, BBVA), un campo libre —por defecto "Pago proforma GX… - fecha"— y
-- un campo de fecha, por defecto hoy. Para no marcar por error proformas tan rápido.»
--
-- Hasta ahora un solo toque en «Ha llegado la transferencia» daba el envío por pagado. Ahora
-- la web pide tres datos antes y los guarda con el envío:
--   · pago_banco     en qué banco ha entrado la transferencia
--   · pago_concepto  el concepto anotado (texto libre)
--   · pago_fecha     el día de la transferencia (no el de marcarla, que ya es pagado_en)
-- Todo lo demás del pago (pasar a pagado, avisos, plazos, permisos) sigue en
-- marcar_pago_envio(): la función nueva valida los datos, la llama y los anota.

alter table public.envios
  add column pago_banco text,
  add column pago_concepto text,
  add column pago_fecha date;
alter table public.envios
  add constraint envios_pago_banco_largo check (pago_banco is null or length(pago_banco) between 2 and 60),
  add constraint envios_pago_concepto_largo check (pago_concepto is null or length(pago_concepto) <= 200);
comment on column public.envios.pago_banco is 'formato: texto | rango: 2 a 60 caracteres | lista: la que ofrece la web al marcar el pago (Santander, CaixaBank, BBVA) | opcional | Banco en el que ha entrado la transferencia del pago por adelantado. Lo anota registrar_transferencia_envio() y se vacía si se deshace el pago. Solo lo ve Dynamo. Ej. OK: CaixaBank · Ej. mal: x';
comment on column public.envios.pago_concepto is 'formato: texto | rango: hasta 200 caracteres | lista: no aplica | opcional | Concepto anotado al marcar la transferencia del pago por adelantado. Lo anota registrar_transferencia_envio() y se vacía si se deshace el pago. Solo lo ve Dynamo. Ej. OK: Pago proforma GX102345361 - 17/11/26 · Ej. mal: (un texto de más de 200 caracteres)';
comment on column public.envios.pago_fecha is 'formato: fecha (AAAA-MM-DD) | rango: de 90 días atrás a hoy | lista: no aplica | opcional | Día de la transferencia del pago por adelantado (el que figura en el banco), que puede no ser el día en que se marca (pagado_en). Lo anota registrar_transferencia_envio() y se vacía si se deshace el pago. Ej. OK: 2026-11-17 · Ej. mal: una fecha futura';

create or replace function public.registrar_transferencia_envio(p_envio uuid, p_banco text, p_concepto text, p_fecha date)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; v_banco text := trim(coalesce(p_banco, '')); v_concepto text := nullif(trim(coalesce(p_concepto, '')), '');
        v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo marca el pago de un envío.' using errcode = '42501'; end if;
  if length(v_banco) < 2 or length(v_banco) > 60 then return jsonb_build_object('resultado', 'falta_banco'); end if;
  if length(coalesce(v_concepto, '')) > 200 then return jsonb_build_object('resultado', 'concepto_largo'); end if;
  if p_fecha is null or p_fecha > v_hoy or p_fecha < v_hoy - 90 then return jsonb_build_object('resultado', 'fecha_no_valida'); end if;
  r := marcar_pago_envio(p_envio, 'transferencia', null);
  if r ->> 'resultado' <> 'ok' then return r; end if;
  update envios set pago_banco = v_banco, pago_concepto = v_concepto, pago_fecha = p_fecha where id = p_envio;
  return r;
end $$;
revoke all on function public.registrar_transferencia_envio(uuid, text, text, date) from public, anon;
grant execute on function public.registrar_transferencia_envio(uuid, text, text, date) to authenticated, service_role;
comment on function public.registrar_transferencia_envio(uuid, text, text, date) is '[Precio y pago] Da por recibida la transferencia del pago por adelantado de un envío, anotando el banco, el concepto y el día de la transferencia. Valida los datos (banco de 2 a 60 caracteres, concepto de hasta 200, fecha entre 90 días atrás y hoy), llama a marcar_pago_envio(…, ''transferencia'') y guarda los tres datos. Devuelve lo mismo que marcar_pago_envio, o falta_banco, concepto_largo o fecha_no_valida. Quién: Dynamo (gestores). Argumentos: p_envio: envíos.id; p_banco: banco; p_concepto: concepto (opcional); p_fecha: día de la transferencia.';

-- Si el pago se deshace (vuelve a no estar pagado y no queda nada a cuenta), los datos de
-- la transferencia se vacían: no deben quedar colgando de un envío sin pagar.
create or replace function public.fn_envios_limpia_transferencia()
returns trigger language plpgsql as $$
begin
  if new.pagado_en is null and coalesce(new.pago_a_cuenta, 0) = 0 then
    new.pago_banco := null; new.pago_concepto := null; new.pago_fecha := null;
  end if;
  return new;
end $$;
revoke execute on function public.fn_envios_limpia_transferencia() from public, anon, authenticated;
comment on function public.fn_envios_limpia_transferencia() is '[Ayudantes internos] Disparador de envíos: cuando un envío deja de estar pagado (y no queda nada pagado a cuenta), vacía el banco, el concepto y el día de la transferencia anotados. Quién: la base de datos, al cambiar pagado_en.';
create trigger tg_envios_limpia_transferencia before update of pagado_en on public.envios
  for each row when (old.pagado_en is not null and new.pagado_en is null)
  execute function public.fn_envios_limpia_transferencia();
