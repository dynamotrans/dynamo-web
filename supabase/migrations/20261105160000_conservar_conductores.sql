-- =====================================================================================
-- CONDUCTORES Y CONTACTOS: NO SE BORRAN SOLOS (decisión del usuario, 2026-11-05)
-- «Yo quiero tener estos datos para usarlos para otros portes posteriores. No quiero
-- borrarlos.» La limpieza nocturna (purgar_datos_personales) borraba el teléfono de los
-- conductores sin viajes en 2 años: ahora solo si se activa el parámetro
-- `rgpd_telefono_conductor_anios` (0 = nunca, que es como queda). Contactos y conductores
-- solo se anonimizan a mano, cuando la persona lo pide (Protección de datos).
-- La limpieza de IP e intentos (90 días) y de uso (12 meses) sigue igual.
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('rgpd_telefono_conductor_anios', '0',
   'Borrar el teléfono de los conductores que lleven estos años sin viajes (limpieza nocturna). 0 = nunca.')
on conflict (clave) do nothing;

create or replace function purgar_datos_personales()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb := '{}'; n int;
begin
  if not (es_servidor() or es_consola_supabase() or es_administrador()) then
    raise exception 'Solo el sistema o el Admin Master.' using errcode = '42501';
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
