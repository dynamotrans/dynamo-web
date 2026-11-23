-- DEVOLVER EL IMPORTE DE UN PAGO CON TARJETA, DESDE LA PLATAFORMA (usuario, 2026-11-23):
-- «por si nos llaman y anulamos transporte y pago por algún motivo que gestiono humano yo, no
-- auto»; «y no tener que hacerlo desde Stripe».
--
--   · Nunca automático: lo decide una persona, y solo el ADMIN MASTER (la web le pide además su
--     contraseña y escribir a mano «CONFIRMAR»).
--   · TODO o UNA PARTE. Si se devuelve una parte, lo que se queda Dynamo pasa a una PENALIZACIÓN
--     del envío («Cancelación transporte fuera de plazo»), sin confirmar y editable, que nace
--     ya COBRADA con ese pago: en facturación no se le vuelve a pedir al cliente.
--   · El envío deja de estar pagado. Después Dynamo elige: dejarlo (pendiente de pago, o a
--     crédito si le cabe) o cancelarlo. La devolución no cancela sola.
--
-- La devolución se hace en Stripe desde el servidor web, en dos pasos para que no haya ni dos
-- devoluciones ni una devolución sin apuntar:
--   1. devolucion_pago_abrir()  · comprueba y reserva (una fila «pendiente»; su id es la clave
--      que Stripe usa para no repetir la devolución aunque se pulse dos veces);
--   2. el servidor pide la devolución a Stripe;
--   3. devolucion_pago_cerrar() · la apunta como hecha (y hace todo lo demás) o como fallida.

-- ---- Hito nuevo del historial ------------------------------------------------------------
alter type public.tipo_hito add value if not exists 'pago_devuelto';

-- (Compara como texto: un valor recién añadido al tipo no se puede usar en la misma operación.)
create or replace function public.hito_visible_fuera(p tipo_hito) returns boolean
language sql immutable as $$
  select p::text in ('creado','confirmado','transportista_asignado','matricula_asignada','hacia_la_carga','cargando','descargando',
               'cargado','descargado','entregado','cancelado','cancelacion_deshecha',
               'orden_carga_enviada','cmr_firmado','pin_validado',
               'pin_validado_manual','incidencia','fecha_carga_movida','pago_devuelto')
$$;

-- ---- Email nuevo al cliente: «Pago devuelto» ----------------------------------------------
alter table public.emails_enviados drop constraint if exists emails_enviados_tipo_check;
alter table public.emails_enviados add constraint emails_enviados_tipo_check check (tipo = any (array[
  'acceso_no_he_sido_yo','acceso_nuevo','alta_pendiente','autorrelleno_saldo','aviso_entrega','aviso_parada','aviso_parada_cancelada',
  'cambio_email','cmr_completo','codigo_firma','control_facturacion','credito_aviso','credito_bloqueo','credito_cambio','cuenta_activada',
  'cuenta_reactivada','cuenta_suspendida','deca','difusion','difusion_fin','difusion_recordatorio','documento_disponible','envio_aceptado',
  'envio_cancelado','envio_creado','envio_matriculas','envio_modificado','envio_reactivado','firma_cmr','incidencia_abierta',
  'incidencia_resuelta','incidencia_retirada','matriculas','orden_carga','pago_avisado','pago_devuelto','penalizacion','penalizacion_anulada',
  'penalizacion_revision','proforma_calculo','resumen_sitio','transportista_cancelado','transportista_modificado','transportista_retirado',
  'transportista_suspendido','vispera']));

-- ---- La penalización puede nacer ya cobrada (con un pago que se retuvo) -------------------
alter table public.penalizaciones add column if not exists cobrada_importe numeric(12,2) check (cobrada_importe is null or cobrada_importe > 0);
alter table public.penalizaciones add column if not exists cobrada_pago_ref text check (cobrada_pago_ref is null or length(cobrada_pago_ref) <= 200);
alter table public.penalizaciones add column if not exists cobrada_en timestamptz;
comment on column public.penalizaciones.cobrada_importe is 'formato: número con 2 decimales, euros CON IVA | rango: > 0 | lista: no aplica | automático | Lo que ya está cobrado de esta penalización porque se retuvo de un pago con tarjeta al devolver solo una parte. Vacío = no cobrada por esta vía. Ej. OK: 242.00';
comment on column public.penalizaciones.cobrada_pago_ref is 'formato: texto | rango: hasta 200 | lista: no aplica | automático | Referencia en Stripe del pago del que se retuvo el importe (para anotarlo en la factura y en Holded). Ej. OK: pi_3Qabc…';
comment on column public.penalizaciones.cobrada_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo quedó cobrada (el momento de la devolución parcial).';

-- Lo cobrado de una penalización solo lo apunta la plataforma (al devolver una parte de un pago):
-- nadie lo escribe ni lo cambia a mano desde el panel, aunque pueda editar la penalización.
create or replace function public.fn_penalizaciones_cobrada_protegida() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;   -- funciones de la plataforma, servidor y consola
  if tg_op = 'INSERT' then
    new.cobrada_importe := null; new.cobrada_pago_ref := null; new.cobrada_en := null;
  else
    new.cobrada_importe := old.cobrada_importe; new.cobrada_pago_ref := old.cobrada_pago_ref; new.cobrada_en := old.cobrada_en;
  end if;
  return new;
end $$;
comment on function public.fn_penalizaciones_cobrada_protegida() is '[Precio y pago] Disparador: lo cobrado de una penalización (importe, referencia del pago y fecha) solo lo escribe la plataforma al devolver una parte de un pago con tarjeta; un cambio hecho a mano desde el panel se ignora. Quién: solo uso interno.';
drop trigger if exists tg_penalizaciones_cobrada_protegida on public.penalizaciones;
create trigger tg_penalizaciones_cobrada_protegida before insert or update on public.penalizaciones
  for each row execute function public.fn_penalizaciones_cobrada_protegida();

-- ---- Registro de devoluciones ------------------------------------------------------------
create table if not exists public.devoluciones_pago (
  id                     uuid primary key default gen_random_uuid(),
  envio_id               uuid not null references envios(id) on delete restrict,
  pago_ref               text not null,
  cobrado                numeric(12,2) not null check (cobrado > 0),
  importe                numeric(12,2) not null check (importe > 0),
  iva_pct                numeric(5,2) not null,
  estado                 text not null default 'pendiente' check (estado in ('pendiente', 'hecha', 'fallida')),
  stripe_devolucion_ref  text,
  error                  text,
  motivo                 text check (motivo is null or length(motivo) <= 500),
  penalizacion_id        uuid references penalizaciones(id) on delete set null,
  creado_en              timestamptz not null default now(),
  creado_por             uuid default auth.uid(),
  hecha_en               timestamptz,
  constraint devoluciones_pago_no_mas_que_cobrado check (importe <= cobrado)
);
comment on table public.devoluciones_pago is 'Devoluciones de pagos con tarjeta de un envío, hechas por el Admin Master desde la plataforma (en Stripe por su API). Una fila por intento: pendiente (reservada, pidiéndola a Stripe), hecha o fallida.';
comment on column public.devoluciones_pago.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único. Es también la clave con la que Stripe evita repetir la devolución.';
comment on column public.devoluciones_pago.envio_id is 'formato: uuid | → envios.id | rango: no aplica | lista: no aplica | automático | El envío cuyo pago se devuelve.';
comment on column public.devoluciones_pago.pago_ref is 'formato: texto | rango: no aplica | lista: no aplica | automático | Referencia en Stripe del pago que se devuelve. Ej. OK: pi_3Qabc…';
comment on column public.devoluciones_pago.cobrado is 'formato: número con 2 decimales, euros CON IVA | rango: > 0 | lista: no aplica | automático | Lo que se cobró con tarjeta en ese pago (lo dice Stripe).';
comment on column public.devoluciones_pago.importe is 'formato: número con 2 decimales, euros CON IVA | rango: > 0 y ≤ cobrado | lista: no aplica | obligatorio | Lo que se devuelve al cliente.';
comment on column public.devoluciones_pago.iva_pct is 'formato: número con 2 decimales | rango: 0 a 100 | lista: no aplica | automático | IVA del envío en ese momento, para sacar las bases de lo devuelto y de lo retenido.';
comment on column public.devoluciones_pago.estado is 'formato: texto | rango: no aplica | lista: pendiente, hecha, fallida | automático | pendiente: reservada y pidiéndola a Stripe; hecha: Stripe la ha aceptado; fallida: Stripe la rechazó (ver error).';
comment on column public.devoluciones_pago.stripe_devolucion_ref is 'formato: texto | rango: no aplica | lista: no aplica | automático | Referencia de la devolución en Stripe. Ej. OK: re_3Qabc…';
comment on column public.devoluciones_pago.error is 'formato: texto | rango: hasta 500 | lista: no aplica | automático | Por qué falló, si falló.';
comment on column public.devoluciones_pago.motivo is 'formato: texto | rango: hasta 500 | lista: no aplica | opcional | Nota de quien la hace, para el historial.';
comment on column public.devoluciones_pago.penalizacion_id is 'formato: uuid | → penalizaciones.id | rango: no aplica | lista: no aplica | automático | La penalización creada por lo que se quedó Dynamo (solo en devoluciones parciales).';
comment on column public.devoluciones_pago.creado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo se pidió.';
comment on column public.devoluciones_pago.creado_por is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | automático | Quién la pidió (el Admin Master).';
comment on column public.devoluciones_pago.hecha_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo la aceptó Stripe.';
create unique index if not exists devoluciones_pago_una_en_curso on public.devoluciones_pago (envio_id) where estado = 'pendiente';
create index if not exists devoluciones_pago_envio_idx on public.devoluciones_pago (envio_id);
alter table public.devoluciones_pago enable row level security;
drop policy if exists devoluciones_pago_sel on public.devoluciones_pago;
create policy devoluciones_pago_sel on public.devoluciones_pago for select using ((select es_equipo_dynamo()));
drop policy if exists devoluciones_pago_ve_todo on public.devoluciones_pago;
create policy devoluciones_pago_ve_todo on public.devoluciones_pago for select using ((select ve_todo()));
revoke all on public.devoluciones_pago from anon;
revoke insert, update, delete on public.devoluciones_pago from authenticated;
grant select on public.devoluciones_pago to authenticated;
drop trigger if exists tg_mantenimiento on public.devoluciones_pago;
create trigger tg_mantenimiento before insert or update or delete on public.devoluciones_pago
  for each row execute function fn_bloqueo_mantenimiento();
drop trigger if exists tg_auditar_devoluciones_pago on public.devoluciones_pago;
create trigger tg_auditar_devoluciones_pago after insert or update or delete on public.devoluciones_pago
  for each row execute function fn_auditar();

-- ---- 1 · Reservar la devolución ------------------------------------------------------------
-- p_cobrado es lo que Stripe dice que se cobró en ese pago (lo trae el servidor web).
create or replace function public.devolucion_pago_abrir(p_envio uuid, p_importe numeric, p_cobrado numeric, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e record; d record; v_imp numeric := round(p_importe, 2); v_cob numeric := round(p_cobrado, 2); v_iva numeric; v_id uuid;
begin
  if not es_admin_master() then raise exception 'Solo el Admin Master devuelve un pago.' using errcode = '42501'; end if;
  select * into e from envios where id = p_envio for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if e.estado_pago_previo <> 'pagado' or e.pago_metodo is distinct from 'stripe' or e.stripe_pago_ref is null then
    return jsonb_build_object('resultado', 'no_pagado_con_tarjeta');
  end if;
  if v_imp is null or v_cob is null or v_imp <= 0 or v_cob <= 0 then return jsonb_build_object('resultado', 'importe_no_valido'); end if;
  if v_imp > v_cob then return jsonb_build_object('resultado', 'importe_excesivo', 'maximo', v_cob); end if;
  -- Una en curso: si es la misma (mismo importe), se retoma con su misma clave; si no, se espera.
  select * into d from devoluciones_pago where envio_id = p_envio and estado = 'pendiente';
  if found then
    if d.importe = v_imp and d.pago_ref = e.stripe_pago_ref then
      return jsonb_build_object('resultado', 'ok', 'id', d.id, 'pago_ref', d.pago_ref, 'retomada', true);
    end if;
    return jsonb_build_object('resultado', 'en_curso');
  end if;
  select iva into v_iva from pago_envio_importes(p_envio);
  insert into devoluciones_pago (envio_id, pago_ref, cobrado, importe, iva_pct, motivo, creado_por)
  values (p_envio, e.stripe_pago_ref, v_cob, v_imp, coalesce(v_iva, 21), nullif(left(trim(coalesce(p_motivo, '')), 500), ''), auth.uid())
  returning id into v_id;
  return jsonb_build_object('resultado', 'ok', 'id', v_id, 'pago_ref', e.stripe_pago_ref);
end $$;
comment on function public.devolucion_pago_abrir(uuid, numeric, numeric, text) is '[Precio y pago] Reserva la devolución de un pago con tarjeta de un envío antes de pedirla a Stripe: comprueba que está pagado con tarjeta y que el importe no pasa de lo cobrado, y deja una fila pendiente. Devuelve {resultado, id, pago_ref}. Quién: solo el Admin Master. Argumentos: p_envio: envios.id · p_importe: euros a devolver, con IVA · p_cobrado: lo cobrado en ese pago según Stripe · p_motivo: nota opcional.';

-- ---- 3 · Apuntar el resultado ----------------------------------------------------------------
create or replace function public.devolucion_pago_cerrar(p_id uuid, p_ok boolean, p_ref text default null, p_error text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d record; e record; v_ret numeric; v_base_dev numeric; v_base_ret numeric; v_pen uuid; v_pen_cod text; v_nuevo text; v_libre boolean;
begin
  if not es_admin_master() then raise exception 'Solo el Admin Master devuelve un pago.' using errcode = '42501'; end if;
  select * into d from devoluciones_pago where id = p_id for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if d.estado <> 'pendiente' then return jsonb_build_object('resultado', 'ya_cerrada', 'estado', d.estado); end if;
  if not coalesce(p_ok, false) then
    update devoluciones_pago set estado = 'fallida', error = left(coalesce(nullif(trim(coalesce(p_error, '')), ''), 'Stripe no ha aceptado la devolución.'), 500) where id = p_id;
    return jsonb_build_object('resultado', 'fallida');
  end if;

  select * into e from envios where id = d.envio_id for update;
  v_ret := round(d.cobrado - d.importe, 2);
  v_base_dev := round(d.importe / (1 + d.iva_pct / 100), 2);
  v_base_ret := round(v_ret / (1 + d.iva_pct / 100), 2);

  -- Devolución PARCIAL: lo que se queda Dynamo pasa a una penalización del envío, sin confirmar
  -- (no avisa al cliente hasta que se confirme) y ya cobrada con este pago.
  if v_ret > 0 then
    insert into penalizaciones (envio_id, tipo_id, descripcion, importe_cliente, cobrada_importe, cobrada_pago_ref, cobrada_en)
    values (e.id, (select id from tipos_penalizacion where clave = 'cancelacion'), 'Cancelación transporte fuera de plazo',
            v_base_ret, v_ret, d.pago_ref, now())
    returning id, codigo into v_pen, v_pen_cod;
  end if;
  update devoluciones_pago set estado = 'hecha', stripe_devolucion_ref = nullif(trim(coalesce(p_ref, '')), ''), hecha_en = now(), penalizacion_id = v_pen
   where id = p_id;

  -- El envío deja de estar pagado. Programado y sin nadie asignado: vuelve a pendiente de pago,
  -- o sigue a crédito si le cabe. Con transportista (o publicado) o ya en marcha: sin pago previo
  -- por decisión de Dynamo (no se anula solo un envío que ya tiene camión).
  v_libre := e.transportista_id is null and coalesce(e.estado_asignacion::text, 'sin_asignar') = 'sin_asignar' and e.publicado_en_bolsa_en is null;
  v_nuevo := case
    when e.estado = 'cancelado' then 'no_requerido'
    when e.estado = 'programado' and v_libre and credito_alcanza(e.cliente_id, e.id) then 'no_requerido'
    when e.estado = 'programado' and v_libre then 'pendiente'
    else 'exento' end;
  update envios
     set estado_pago_previo = v_nuevo, pago_metodo = null, pagado_en = null, stripe_pago_ref = null, pago_a_cuenta = null,
         pago_resuelto_por = auth.uid(),
         pago_motivo = case when v_nuevo = 'pendiente' then coalesce(e.pago_motivo, 'Pago devuelto') else e.pago_motivo end,
         pago_exento_motivo = case when v_nuevo = 'exento' then 'Pago con tarjeta devuelto el ' || fecha_hora_texto(now()) || ': sigue sin pago previo por decisión de Dynamo' end
   where id = e.id;

  perform registrar_hito(e.id, 'pago_devuelto'::tipo_hito, null, null,
    jsonb_build_object('devuelto', d.importe, 'retenido', v_ret, 'parcial', v_ret > 0, 'penalizacion', v_pen_cod, 'motivo', d.motivo), 'app');

  perform fn_email_envio_cliente(e.id, 'pago_devuelto:' || d.id, 'pago_devuelto', 'Pago devuelto',
    '<p>Te hemos <strong>devuelto ' || euros_texto(d.importe) || '</strong> del pago con tarjeta de este envío'
    || case when v_ret > 0 then ' (de los ' || euros_texto(d.cobrado) || ' pagados)' else '' end
    || '. Lo verás en tu tarjeta en unos días, según tu banco.</p>');

  return jsonb_build_object('resultado', 'ok', 'devuelto', d.importe, 'retenido', v_ret, 'base_devuelta', v_base_dev, 'base_retenida', v_base_ret,
    'iva_pct', d.iva_pct, 'estado_envio', e.estado, 'estado_pago', v_nuevo, 'penalizacion', v_pen_cod);
end $$;
comment on function public.devolucion_pago_cerrar(uuid, boolean, text, text) is '[Precio y pago] Apunta el resultado de una devolución pedida a Stripe. Si fue bien: la marca hecha, el envío deja de estar pagado (pendiente de pago, a crédito o sin pago previo según el caso), crea la penalización por lo retenido si fue parcial (ya cobrada), deja el hito y avisa al cliente por email. Si falló: la marca fallida. Devuelve {resultado, devuelto, retenido, bases, estado_pago, penalizacion}. Quién: solo el Admin Master. Argumentos: p_id: devoluciones_pago.id · p_ok: si Stripe la aceptó · p_ref: referencia de la devolución en Stripe · p_error: por qué falló.';

revoke all on function public.devolucion_pago_abrir(uuid, numeric, numeric, text) from public, anon;
revoke all on function public.devolucion_pago_cerrar(uuid, boolean, text, text) from public, anon;
grant execute on function public.devolucion_pago_abrir(uuid, numeric, numeric, text) to authenticated;
grant execute on function public.devolucion_pago_cerrar(uuid, boolean, text, text) to authenticated;

-- ---- El email «Pago devuelto» sale aunque el envío esté cancelado --------------------------
-- (Los emails de un envío cancelado se omiten; este, como el de la parada cancelada, no.)
do $do$
declare f text; a text := 'r.tipo <> ''aviso_parada_cancelada'''; n int;
begin
  f := pg_get_functiondef('public.enviar_emails_pendientes()'::regprocedure);
  n := (length(f) - length(replace(f, a, ''))) / length(a);
  if n <> 1 then raise exception 'enviar_emails_pendientes: aguja no encontrada exactamente una vez (%).', n; end if;
  execute replace(f, a, 'r.tipo not in (''aviso_parada_cancelada'', ''pago_devuelto'')');
end $do$;
