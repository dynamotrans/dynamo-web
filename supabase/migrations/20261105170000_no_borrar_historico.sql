-- =====================================================================================
-- NO SE BORRA NADA DEL HISTÓRICO (decisión del usuario, 2026-11-05)
-- «No borramos nada del histórico: ni teléfono, ni DNI, ni chófer, ni nada.»
-- La limpieza nocturna (purgar_datos_personales: IP e intentos a 90 días, conexión y
-- consultas a 12 meses…) queda APAGADA con el interruptor `rgpd_limpieza_activa`
-- (false). Sigue programada, pero no hace nada mientras esté apagado; si el asesor dice
-- que hay que activarla, se enciende en Parámetros.
-- Nada se borra solo. Anonimizar a una persona solo se hace a mano (Protección de datos,
-- Admin Master), si ella lo pide por escrito y la ley obliga.
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('rgpd_limpieza_activa', 'false',
   'Limpieza automática de cada noche (IP e intentos a 90 días, conexión y consultas a 12 meses). Apagada: no se borra nada del histórico.')
on conflict (clave) do nothing;

create or replace function purgar_datos_personales()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb := '{}'; n int;
begin
  if not (es_servidor() or es_consola_supabase() or es_administrador()) then
    raise exception 'Solo el sistema o el Admin Master.' using errcode = '42501';
  end if;
  -- Apagada por defecto: no se borra NADA del histórico (decisión del usuario 2026-11-05).
  if not coalesce((parametro('rgpd_limpieza_activa') #>> '{}')::boolean, false) then
    return jsonb_build_object('limpieza', 'desactivada');
  end if;
  perform set_config('dynamo.purga', 'on', true);
  perform set_config('dynamo.anonimizando', 'on', true);
  update envio_reservas set ip = null, navegador = null
   where coalesce(cerrada_en, desde) < now() - interval '90 days' and (ip is not null or navegador is not null);
  get diagnostics n = row_count; r := r || jsonb_build_object('reservas_ip', n);
  delete from intentos_carga_publica where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_carga', n);
  delete from pin_intentos where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_pin', n);
  delete from contraoferta_intentos where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_contraoferta', n);
  delete from conexion_minutos where dia < current_date - 365;
  get diagnostics n = row_count; r := r || jsonb_build_object('conexion', n);
  delete from consultas_precio where cuando < now() - interval '12 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('consultas', n);
  -- Teléfono de los conductores sin viajes: SOLO si se activa en Parámetros
  -- (rgpd_telefono_conductor_anios > 0). Por defecto NO se borra: el usuario quiere
  -- conservar los datos de conductores y contactos para portes posteriores (2026-11-05).
  n := 0;
  if p_num('rgpd_telefono_conductor_anios', 0) > 0 then
    with sin_viajes as (
      select c.id from conductores c
       where c.creado_en < now() - make_interval(years => p_num('rgpd_telefono_conductor_anios', 0)::int)
         and not exists (select 1 from envios e where e.conductor_id = c.id
                          and coalesce(e.fecha_carga_real::date, e.fecha_carga_desde, e.creado_en::date)
                              > current_date - (365 * p_num('rgpd_telefono_conductor_anios', 0))::int)
    ), a as (update conductores set telefono = null where id in (select id from sin_viajes) and telefono is not null returning 1)
    select count(*) into n from a;
    update envios set conductor_telefono = null
     where conductor_telefono is not null and conductor_id in (select id from conductores where telefono is null);
  end if;
  r := r || jsonb_build_object('telefonos_conductores', n);
  -- IP y navegador de las reservas que se copiaron a la auditoría antes de este cambio.
  update auditoria set cambios = ((cambios #- '{despues,ip}' #- '{despues,navegador}' #- '{antes,ip}' #- '{antes,navegador}') - 'ip' - 'navegador')
   where tabla = 'envio_reservas' and cuando < now() - interval '90 days'
     and (cambios::text like '%"ip"%' or cambios::text like '%"navegador"%');
  get diagnostics n = row_count; r := r || jsonb_build_object('auditoria_ip', n);
  -- La IP que apuntaba el alta online en su nota interna.
  update notas_internas set texto = regexp_replace(texto, ' \(IP [^)]*\)', '', 'g')
   where texto ~ '\(IP ' and creado_en < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('notas_ip', n);
  perform set_config('dynamo.purga', 'off', true);
  perform set_config('dynamo.anonimizando', 'off', true);
  return r;
end $$;
revoke execute on function purgar_datos_personales() from public, anon;
grant execute on function purgar_datos_personales() to authenticated;

-- Los avisos de la campana tampoco se borran solos (la campana ya enseña solo los de los
-- últimos 60 días; los antiguos se quedan guardados).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('dynamo-avisos-limpieza');
    exception when others then
      raise notice 'No había limpieza de avisos programada (%).', sqlerrm;
    end;
  end if;
end $$;
