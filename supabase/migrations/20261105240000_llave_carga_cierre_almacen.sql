-- =====================================================================================
-- EL ENLACE DE LA CARGA CADUCA X HORAS DESPUÉS DEL CIERRE DEL ALMACÉN (usuario, 2026-11-05)
-- «Ponemos X horas tras la última hora del horario del almacén ese día de carga: si cierra
-- a las 17:00 y pongo 4 h, serían las 21:00.»
--   · Base: la hora de cierre del sitio de carga el último día de carga (su horario de ese
--     día, el de verano si toca). Con varias recogidas, la que cierra más tarde.
--   · Si el sitio no tiene horario ese día (o es una dirección suelta sin ficha), la base
--     es el final del día (23:59).
--   · + `enlace_carga_horas_tras_carga` horas (por defecto pasa a 4).
--   · Y nunca con el envío entregado o cancelado.
-- =====================================================================================

update parametros set valor = '4',
       descripcion = 'Horas que sigue valiendo el enlace de la carga del transportista después del cierre del almacén de carga el último día de carga (o del final del día si el sitio no tiene horario).'
 where clave = 'enlace_carga_horas_tras_carga' and valor = '24';
update parametros set descripcion = 'Horas que sigue valiendo el enlace de la carga del transportista después del cierre del almacén de carga el último día de carga (o del final del día si el sitio no tiene horario).'
 where clave = 'enlace_carga_horas_tras_carga';

-- Hasta cuándo vale el enlace de la carga de un envío.
create or replace function enlace_carga_caduca_en(p_envio uuid)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare v_dia date; v_cierre time;
begin
  select coalesce(fecha_carga_real, fecha_carga_hasta, fecha_carga_desde) into v_dia from envios where id = p_envio;
  if v_dia is null then return null; end if;
  select max(h.cierra) into v_cierre
    from envio_paradas p cross join lateral horario_del_dia(p.lugar_id, v_dia) h
   where p.envio_id = p_envio and p.tipo = 'carga' and p.lugar_id is not null;
  return ((v_dia + coalesce(v_cierre, time '23:59'))::timestamp at time zone 'Europe/Madrid')
         + make_interval(hours => p_num('enlace_carga_horas_tras_carga', 4)::int);
end $$;
revoke execute on function enlace_carga_caduca_en(uuid) from public, anon, authenticated;

create or replace function enlace_carga_vigente(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select e.estado not in ('entregado', 'cancelado')
     and (enlace_carga_caduca_en(e.id) is null or now() < enlace_carga_caduca_en(e.id))
    from envios e where e.id = p_envio
$$;
revoke execute on function enlace_carga_vigente(uuid) from public, anon, authenticated;

comment on function public.enlace_carga_caduca_en(uuid) is '[Ofertas y transportistas] Hasta cuándo vale el enlace público de la carga: hora de cierre del sitio de carga el último día de carga (23:59 si no tiene horario ese día) + enlace_carga_horas_tras_carga horas. Quién: solo uso interno. Argumentos: p_envio: envios.id.';
comment on function public.enlace_carga_vigente(uuid) is '[Ofertas y transportistas] ¿Sigue valiendo el enlace público de la carga? Hasta enlace_carga_caduca_en() y nunca con el envío entregado o cancelado. Quién: solo uso interno. Argumentos: p_envio: envios.id.';
