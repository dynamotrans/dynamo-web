-- =====================================================================================
-- CORTE DEL ENLACE DE PAGO AL ACABAR EL PLAZO (usuario, 2026-11-24)
-- =====================================================================================
-- «Corte duro del enlace de Stripe al minuto 65. Ahora, si alguien deja la ventana de pago
-- abierta, el envío puede tardar hasta unos 90 minutos en anularse.»
--
-- CÓMO ESTABA: Stripe no deja que un enlace de pago nazca con menos de 30 minutos de vida.
-- El que se abría al final del plazo seguía vivo hasta 30-40 minutos después y el envío
-- esperaba a que caducase solo antes de anularse.
--
-- AHORA: al acabar el plazo más su margen (60 + 5 minutos) el servidor le ordena a Stripe
-- que CIERRE los enlaces abiertos de ese envío y, hecho eso, el envío se anula al momento.
--   · El servidor apunta cada enlace que abre (su identificador en Stripe).
--   · Lo dispara la propia ventana de pago al acabársele el tiempo y, por si está cerrada,
--     la tarea automática de la base de datos (cada 5 minutos) se lo pide al servidor.
--   · Si Stripe dice que ese enlace YA ESTÁ PAGADO, no se toca nada: el pago entra normal.
--   · Si el servidor no pudiera hablar con Stripe, queda lo de antes: el envío espera a que
--     el enlace caduque solo.

alter table public.envios add column if not exists stripe_sesiones text[] not null default '{}';
comment on column public.envios.stripe_sesiones is 'formato: lista de textos (identificadores de Stripe, «cs_…») | rango: hasta 20 | lista: no aplica | automático | Enlaces de pago con tarjeta (sesiones de Stripe) abiertos para este envío mientras está pendiente de pago. Los apunta el servidor al abrirlos para poder cerrarlos en Stripe cuando se acaba el plazo; se vacía al cerrarlos.';

-- El servidor apunta el enlace que acaba de abrir.
create or replace function public.pago_sesion_stripe(p_envio uuid, p_sesion text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_servidor() then raise exception 'Solo el servidor apunta los enlaces de pago.' using errcode = '42501'; end if;
  if p_sesion is null or p_sesion !~ '^cs_[A-Za-z0-9_]{5,250}$' then raise exception 'Identificador de enlace de pago no válido.'; end if;
  update envios
     set stripe_sesiones = (select coalesce(array_agg(x order by n), '{}')
                              from (select x, n from unnest(array_remove(stripe_sesiones, p_sesion) || p_sesion) with ordinality as t(x, n)
                                     order by n desc limit 20) u)
   where id = p_envio and estado = 'programado' and estado_pago_previo = 'pendiente';
end $$;
comment on function public.pago_sesion_stripe(uuid, text) is '[Precio y pago] Apunta en el envío el identificador del enlace de pago con tarjeta (sesión de Stripe) que el servidor acaba de abrir, para poder cerrarlo en Stripe cuando se acabe el plazo. Sin repetidos; guarda los 20 últimos. Solo en envíos programados y pendientes de pago. Quién: servidor. Argumentos: p_envio: envios.id · p_sesion: identificador de la sesión de Stripe («cs_…»).';
revoke all on function public.pago_sesion_stripe(uuid, text) from public, anon, authenticated;
grant execute on function public.pago_sesion_stripe(uuid, text) to service_role;

-- ¿Hay que cortar ya los enlaces de este envío? Devuelve sus identificadores si el plazo
-- más el margen ya pasó y el envío solo sigue vivo porque espera a un enlace abierto.
-- Las mismas condiciones con las que se anula un envío por falta de pago.
create or replace function public.pago_sesiones_por_cerrar(p_envio uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare v text[];
  gracia interval := make_interval(mins => greatest(parametro_num('pago_previo_gracia_minutos', 5), 0)::int);
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  select stripe_sesiones into v from envios
   where id = p_envio and estado = 'programado' and estado_pago_previo = 'pendiente' and pago_pendiente_en is not null
     and transportista_id is null and stripe_cobro_sin_aplicar is null and coalesce(pago_a_cuenta, 0) = 0
     and pago_avisado_en is null
     and now() > pago_limite(pago_pendiente_en, fecha_carga_desde) + gracia
     and stripe_enlace_caduca_en is not null and now() <= stripe_enlace_caduca_en + interval '1 minute';
  return v;   -- null: no toca cortar nada
end $$;
comment on function public.pago_sesiones_por_cerrar(uuid) is '[Precio y pago] Devuelve los identificadores de los enlaces de pago con tarjeta (sesiones de Stripe) que hay que cerrar ya en un envío: pendiente de pago, con el plazo y su margen vencidos, y que solo sigue sin anular porque espera a un enlace todavía abierto. Devuelve vacío (null) si no toca cortar nada. Quién: servidor. Argumentos: p_envio: envios.id.';
revoke all on function public.pago_sesiones_por_cerrar(uuid) from public, anon, authenticated;
grant execute on function public.pago_sesiones_por_cerrar(uuid) to service_role;

-- Stripe ha confirmado que los enlaces de este envío están cerrados: ya no hay que esperar.
create or replace function public.pago_enlace_cerrado(p_envio uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_servidor() then raise exception 'Solo el servidor da por cerrados los enlaces de pago.' using errcode = '42501'; end if;
  update envios set stripe_enlace_caduca_en = least(stripe_enlace_caduca_en, now() - interval '2 minutes'), stripe_sesiones = '{}'
   where id = p_envio and estado = 'programado' and estado_pago_previo = 'pendiente' and stripe_enlace_caduca_en is not null;
end $$;
comment on function public.pago_enlace_cerrado(uuid) is '[Precio y pago] Da por cerrados los enlaces de pago con tarjeta de un envío pendiente de pago (el servidor ya se lo ha ordenado a Stripe y este lo ha confirmado): el envío deja de esperar al enlace y la anulación por falta de pago puede seguir. Quién: servidor. Argumentos: p_envio: envios.id.';
revoke all on function public.pago_enlace_cerrado(uuid) from public, anon, authenticated;
grant execute on function public.pago_enlace_cerrado(uuid) to service_role;

-- La anulación automática: igual que estaba y, además, pide al servidor que cierre en Stripe
-- los enlaces de los envíos que ya están fuera de plazo y solo esperan a su enlace abierto.
-- (Con pg_net y la dirección de la plataforma; sin ellos, se espera a que caduquen solos.)
create or replace function public.caducar_pagos_pendientes()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_base text;
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
  -- Los que quedan esperando a un enlace abierto: que el servidor lo cierre en Stripe.
  begin
    v_base := rtrim(coalesce(parametro('url_plataforma') #>> '{}', ''), '/');
    if v_base ~ '^https://' and exists (select 1 from pg_extension where extname = 'pg_net') then
      for r in select id from envios
                where estado = 'programado' and estado_pago_previo = 'pendiente' and pago_pendiente_en is not null
                  and transportista_id is null and stripe_cobro_sin_aplicar is null and coalesce(pago_a_cuenta, 0) = 0
                  and pago_avisado_en is null
                  and now() > pago_limite(pago_pendiente_en, fecha_carga_desde) + gracia
                  and stripe_enlace_caduca_en is not null and now() <= stripe_enlace_caduca_en + interval '1 minute'
                  and cardinality(stripe_sesiones) > 0
                limit 50 loop
        execute $q$select net.http_post(url := $1, body := $2, headers := jsonb_build_object('Content-Type', 'application/json'))$q$
          using v_base || '/api/stripe/caducar', jsonb_build_object('envio', r.id);
      end loop;
    end if;
  exception when others then null;   -- si no se puede avisar al servidor, el enlace caduca solo
  end;
  return n;
end $$;
comment on function public.caducar_pagos_pendientes() is '[Sistema y tareas automáticas] Anula (pasa a cancelado) los envíos programados con pago previo pendiente, sin transportista, cuyo plazo de pago venció hace más del margen (parámetro pago_previo_gracia_minutos) y que no tienen un enlace de pago con tarjeta todavía abierto ni una transferencia avisada. Deja un hito con el motivo. A los que solo esperan a un enlace abierto, pide al servidor (dirección de la plataforma + /api/stripe/caducar) que lo cierre en Stripe para anularlos sin esperar. Devuelve cuántos anuló. Quién: servidor (tarea automática), consola o Dynamo. Argumentos: sin argumentos.';
