-- =====================================================================================
-- DESHACER: 60 SEGUNDOS, Y LOS AVISOS DE SEGURIDAD AL MOMENTO (usuario, 2026-11-25)
-- =====================================================================================
-- Decidido con él:
--   1. «Código de firma del CMR y avisos de seguridad (acceso desde un dispositivo nuevo): que
--      salgan al momento, sin esperar. OK.» El código ya salía al momento (lo manda el servidor
--      directo); los avisos de acceso nuevo y «No he sido yo» esperaban como los demás.
--   2. «Cancelar envío y asignar transportista: 60 segundos.»
--   3. «Crear y modificar envío: 60 segundos.»
--   4. «E incluye: incidencias, penalizaciones — 60 segundos.»
-- El plazo sigue siendo UN número (Parámetros → emails_espera_segundos), ahora 60: vale para el
-- contador de «Anular el cambio» y para todos los emails que esperan, menos los de seguridad.
-- Con 60 s el servidor web ya no puede esperar él a mandar los emails con PDF (orden de carga,
-- DeCA…: aguanta ~50 s), así que la cola de la base de datos los recoge a los 15 segundos de
-- cumplirse su plazo, no a los 2 minutos (si no, saldrían a los 3 minutos).

update public.parametros
   set valor = '60',
       descripcion = 'Segundos que espera cada email antes de salir, para poder anular el cambio que lo provoca (o el propio email). Es también lo que dura el contador de «Anular el cambio» al crear, modificar o cancelar un envío, asignarle transportista, y en incidencias y penalizaciones. Los avisos de seguridad (acceso desde un dispositivo nuevo, «No he sido yo») y el código de firma del CMR no esperan. 0 = salen sin esperar y no se pueden anular.'
 where clave = 'emails_espera_segundos' and valor::text in ('30', '"30"');

-- ---- 1. Los emails de seguridad no esperan ------------------------------------------------
create or replace function public.email_sin_espera(p_tipo text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_tipo, '') in ('codigo_firma', 'acceso_nuevo', 'acceso_no_he_sido_yo')
$$;
comment on function public.email_sin_espera(text) is '[Emails] Tipos de email que salen al momento, sin el plazo de emails_espera_segundos: los de seguridad (código de firma del CMR, acceso desde un dispositivo nuevo y «No he sido yo»). No hay nada que deshacer y alguien los está esperando.';
revoke all on function public.email_sin_espera(text) from public, anon, authenticated;

create or replace function public.fn_emails_espera()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_seg int := greatest(0, parametro_num('emails_espera_segundos', 60)::int); v_vence timestamptz;
begin
  new.creado_por := coalesce(new.creado_por, auth.uid());
  -- De seguridad: al momento, y sin colgarse del cambio abierto de ningún envío.
  if email_sin_espera(new.tipo) then
    new.enviar_desde := now();
    return new;
  end if;
  new.enviar_desde := greatest(coalesce(new.enviar_desde, now()), now() + make_interval(secs => v_seg));
  if v_seg = 0 then new.enviar_desde := now(); end if;
  -- Envío con transportista propio del cliente: solo sale lo que el cliente manda él mismo.
  if new.envio_id is not null and new.estado = 'pendiente' and coalesce(new.clave, '') not like 'orden_manual:%'
     and exists (select 1 from envios e where e.id = new.envio_id and (coalesce(e.es_manual, false) or e.operador_id is not null)) then
    new.estado := 'omitido';
    new.error := 'Envío con transportista propio del cliente: Dynamo no avisa a nadie.';
  end if;
  if new.envio_id is not null and new.estado = 'pendiente' then
    select id, vence_en into new.cambio_id, v_vence from envio_cambios
     where envio_id = new.envio_id and estado = 'abierto' and vence_en > now();
    if v_vence is not null then new.enviar_desde := greatest(new.enviar_desde, v_vence); end if;
  end if;
  return new;
end $function$;

-- ---- 2. La cola recoge los emails del servidor web a los 15 s de su plazo -------------------
do $$ declare v text; v_viejo text := 'x.enviar_desde < now() - interval ''2 minutes''';
begin
  v := pg_get_functiondef('public.enviar_emails_pendientes()'::regprocedure);
  if position(v_viejo in v) = 0 then raise exception 'enviar_emails_pendientes ya no tiene la espera de 2 minutos: revisar esta migración'; end if;
  execute replace(v, v_viejo, 'x.enviar_desde < now() - interval ''15 seconds''');
end $$;

-- El valor por defecto de la columna, a la par (lo que manda es el disparador).
alter table public.emails_enviados alter column enviar_desde set default now() + interval '60 seconds';

-- ---- 3. El contador de «Anular el cambio» usa el mismo número ------------------------------
do $$ declare v text; v_viejo text := 'parametro_num(''emails_espera_segundos'', 30)';
begin
  v := pg_get_functiondef((select oid from pg_proc where proname = 'envio_cambio_abrir' and pronamespace = 'public'::regnamespace));
  if position(v_viejo in v) > 0 then execute replace(v, v_viejo, 'parametro_num(''emails_espera_segundos'', 60)'); end if;
end $$;
