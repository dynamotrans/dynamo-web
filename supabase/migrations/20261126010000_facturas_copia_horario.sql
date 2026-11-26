-- =====================================================================================
-- COPIA DE FACTURAS: HORARIO DE LA PUESTA AL DÍA (usuario, 2026-11-26)
-- =====================================================================================
-- «Cada 15 minutos de lunes a domingo de 8 a 22; cada 4 horas por la noche.»
-- Antes: cada 10 minutos de lunes a viernes de 7 a 21 y cada hora el resto.
--   · Todos los días (también sábados y domingos), de 8:00 a 21:59: cada 15 minutos.
--   · De 22:00 a 7:59: cada 4 horas (a las 00:00 y a las 04:00, hora de Madrid). En la de
--     las 04:00 cae además el repaso completo de los últimos 12 meses (lo decide el servidor).
-- Menos consultas a la facturación (tope de 30.000 al mes): con 700 facturas al año, unas
-- 7.500 al mes. «Actualizar ahora» sigue poniéndola al día al momento.

create or replace function public.facturas_avisar()
returns boolean language plpgsql security definer set search_path = public as $$
declare v_base text; v_ahora timestamp := now() at time zone 'Europe/Madrid'; v_hora int := extract(hour from v_ahora)::int;
begin
  if not (es_servidor() or es_consola_supabase()) then raise exception 'Solo el sistema.' using errcode = '42501'; end if;
  if not coalesce((parametro('facturas_copia_activa') #>> '{}')::boolean, true) then return false; end if;
  if not facturas_toca_pasada(v_hora, extract(minute from v_ahora)::int) then return false; end if;
  v_base := rtrim(coalesce(parametro('url_plataforma') #>> '{}', ''), '/');
  if v_base !~ '^https://' or not exists (select 1 from pg_extension where extname = 'pg_net') then return false; end if;
  begin
    execute $q$select net.http_post(url := $1, body := $2, headers := jsonb_build_object('Content-Type', 'application/json'))$q$
      using v_base || '/api/facturas/sincronizar', '{}'::jsonb;
  exception when others then return false;
  end;
  return true;
end $$;
comment on function public.facturas_avisar() is '[Precio y pago] Tarea de cada 15 minutos: si la copia de facturas está encendida y toca (todos los días de 8 a 22, cada 15 minutos; de noche, cada 4 horas), le pide al servidor (/api/facturas/sincronizar) que la ponga al día. Quién: solo el sistema (pg_cron).';
revoke all on function public.facturas_avisar() from public, anon, authenticated;

-- ¿Toca pasada a esta hora (de Madrid)? Aparte, para poder probarlo sin esperar al reloj.
create or replace function public.facturas_toca_pasada(p_hora integer, p_minuto integer)
returns boolean language sql immutable as $$
  select case when p_hora between 8 and 21 then true                 -- de día: en cada llamada (cada 15 minutos)
              else p_hora % 4 = 0 and p_minuto < 15 end              -- de noche: a las 00:00 y a las 04:00
$$;
comment on function public.facturas_toca_pasada(integer, integer) is '[Precio y pago] Dice si a esa hora de Madrid toca poner al día la copia de facturas: de 8:00 a 21:59, siempre (la tarea llama cada 15 minutos); de noche, solo en el primer cuarto de hora de las 00 y de las 04. Quién: uso interno. Argumentos: p_hora: hora (0 a 23) · p_minuto: minuto (0 a 59).';
revoke all on function public.facturas_toca_pasada(integer, integer) from public, anon;
grant execute on function public.facturas_toca_pasada(integer, integer) to authenticated, service_role;

update public.parametros
   set descripcion = 'Facturas emitidas: true = la plataforma mantiene al día sola su copia de las facturas emitidas (cada 15 minutos todos los días de 8 a 22, cada 4 horas de noche, y un repaso completo de madrugada). false = solo se actualiza al pulsar «Actualizar ahora». Siempre en solo lectura.'
 where clave = 'facturas_copia_activa';

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-facturas-copia', '*/15 * * * *', 'select public.facturas_avisar()');
  end if;
end $$;
