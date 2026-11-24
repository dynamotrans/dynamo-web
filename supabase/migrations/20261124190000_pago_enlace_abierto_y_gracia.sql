-- =====================================================================================
-- NADIE PAGA UN ENVÍO YA ANULADO: el envío espera al enlace de pago abierto (usuario, 2026-11-24)
-- =====================================================================================
-- «A los 60 min deja de mostrar el botón de tarjeta; entonces ese enlace debe caducar…
-- ¿qué hacemos esos minutos, anulamos el envío, esperamos? Lo suyo sería todo a la vez:
-- 60 y 5 adicionales por si está en proceso de pago.»
--
-- EL PROBLEMA: Stripe no deja que un enlace de pago viva menos de 30 minutos. Quien pulsa
-- «Pagar con tarjeta» en el minuto 55 tiene el enlace abierto hasta pasado el minuto 85,
-- y el envío se anulaba hacia el 70: se podía pagar un envío ya anulado (y tocaba devolver).
--
-- AHORA:
--   · Minuto 60 (pago_previo_horas): ya no se puede EMPEZAR un pago (botón y servidor).
--   · Minuto 60 + margen (pago_previo_gracia_minutos, 5): el envío se anula… SALVO que tenga
--     un enlace de pago de Stripe todavía abierto. Entonces espera a que ese enlace caduque
--     (el servidor apunta hasta cuándo vive cada enlace que abre) y se anula después. Si el
--     cliente paga mientras, queda pagado con normalidad.
--   · La ventana de pago de la plataforma se cierra sola al acabar el margen.
-- El peor caso (enlace abierto en el último minuto y dejado sin pagar) alarga la espera
-- hasta el mínimo de Stripe, unos 30-40 minutos desde que se abrió. Cortar ese enlace antes
-- exige ordenárselo a Stripe desde el servidor; queda anotado como mejora.

insert into public.parametros (clave, valor, descripcion) values
  ('pago_previo_gracia_minutos', '5',
   'Pago por adelantado: minutos de margen tras acabar el plazo para pagar antes de anular el envío, por si el cliente está pagando en ese momento. Con un enlace de pago con tarjeta todavía abierto, el envío espera además a que ese enlace caduque.')
on conflict (clave) do nothing;

alter table public.envios add column if not exists stripe_enlace_caduca_en timestamptz;
comment on column public.envios.stripe_enlace_caduca_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Hasta cuándo vive el último enlace de pago con tarjeta (Stripe) abierto para este envío. Lo apunta el servidor al abrir el pago (pago_enlace_stripe). Mientras no pase, el envío pendiente de pago no se anula solo: así nadie paga un envío ya anulado.';

-- El servidor apunta hasta cuándo vive el enlace de pago que va a abrir. Nunca lo acorta.
create or replace function public.pago_enlace_stripe(p_envio uuid, p_caduca timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_servidor() then raise exception 'Solo el servidor apunta los enlaces de pago.' using errcode = '42501'; end if;
  if p_caduca is null or p_caduca > now() + interval '25 hours' then raise exception 'Caducidad del enlace de pago no válida.'; end if;
  update envios set stripe_enlace_caduca_en = greatest(coalesce(stripe_enlace_caduca_en, p_caduca), p_caduca)
   where id = p_envio and estado = 'programado' and estado_pago_previo = 'pendiente';
end $$;
comment on function public.pago_enlace_stripe(uuid, timestamptz) is '[Precio y pago] Apunta hasta cuándo vive el enlace de pago con tarjeta (Stripe) que el servidor va a abrir para un envío pendiente de pago; nunca acorta lo ya apuntado. Mientras el enlace viva, el envío no se anula solo. Quién: servidor. Argumentos: p_envio: envios.id · p_caduca: fecha y hora en que caduca el enlace.';
revoke all on function public.pago_enlace_stripe(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.pago_enlace_stripe(uuid, timestamptz) to service_role;

-- La anulación automática: el margen sale del parámetro (antes 10 minutos fijos) y espera
-- al enlace de pago abierto (más 1 minuto, por si el aviso de Stripe llega justo).
create or replace function public.caducar_pagos_pendientes()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
  gracia interval := make_interval(mins => greatest(parametro_num('pago_previo_gracia_minutos', 5), 0)::int);
begin
  if not (es_servidor() or es_consola_supabase() or es_equipo_dynamo()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  for r in select id from envios
            where estado = 'programado' and estado_pago_previo = 'pendiente' and pago_pendiente_en is not null
              and transportista_id is null and stripe_cobro_sin_aplicar is null and coalesce(pago_a_cuenta, 0) = 0
              and pago_avisado_en is null   -- transferencia avisada: lo decide Dynamo
              and now() > pago_limite(pago_pendiente_en, fecha_carga_desde) + gracia
              and (stripe_enlace_caduca_en is null or now() > stripe_enlace_caduca_en + interval '1 minute')   -- enlace de pago aún abierto: se espera
            for update skip locked loop
    update envios set estado = 'cancelado' where id = r.id;
    perform registrar_hito(r.id, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', 'Anulado sin pago: no se recibió el pago a tiempo', 'por', 'sistema'), 'servidor');
    n := n + 1;
  end loop;
  return n;
end $$;
comment on function public.caducar_pagos_pendientes() is '[Sistema y tareas automáticas] Anula (pasa a cancelado) los envíos programados con pago previo pendiente, sin transportista, cuyo plazo de pago venció hace más del margen (parámetro pago_previo_gracia_minutos) y que no tienen un enlace de pago con tarjeta todavía abierto ni una transferencia avisada. Deja un hito con el motivo. Devuelve cuántos anuló. Quién: servidor (tarea automática), consola o Dynamo. Argumentos: sin argumentos.';
