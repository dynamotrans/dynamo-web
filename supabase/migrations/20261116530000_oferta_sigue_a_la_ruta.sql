-- =====================================================================================
-- LA OFERTA ESCALONADA SIGUE A LA RUTA (2026-11-16)
-- =====================================================================================
-- La hora límite de la oferta es el cierre del PRIMER sitio de carga (fn_difusion_limite).
-- Se recolocaba al cambiar la fecha o la ventana del envío, pero no al cambiar la ruta:
-- si el primer sitio de carga pasaba a ser otro (con otro horario), la oferta seguía con
-- el cierre del sitio antiguo. Desde hoy, cualquier cambio en las paradas de un envío con
-- la oferta en marcha recalcula su hora límite.
--
--   · Si Dynamo indicó una hora a mano al lanzar, manda esa: no se toca.
--   · Los enlaces ya enviados siguen valiendo (su caducidad solo se alarga, nunca se acorta).

create or replace function fn_difusion_hora_sigue_paradas()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_envio uuid; e record; d record; v_lim timestamptz; v_corte timestamptz;
begin
  if tg_op = 'DELETE' then v_envio := old.envio_id; else v_envio := new.envio_id; end if;
  select id, estado, fecha_carga_desde, fecha_carga_hasta into e from envios where id = v_envio;
  if e.id is null or e.estado <> 'programado' or e.fecha_carga_desde is null then return null; end if;
  select * into d from difusiones where envio_id = v_envio and estado = 'activa' order by creado_en desc limit 1;
  if d.id is null or d.hora_manual is not null then return null; end if;
  v_lim := fn_difusion_limite(v_envio, e.fecha_carga_desde, e.fecha_carga_hasta, null);
  if v_lim is null or v_lim = d.carga_prevista_en then return null; end if;
  v_corte := v_lim - make_interval(hours => greatest(0, coalesce((parametro('difusion_horas_corte'))::text::int, 0)));
  update difusiones set carga_prevista_en = v_lim, corte_en = v_corte where id = d.id;
  update envio_ofertas set caduca_en = greatest(caduca_en, v_corte)
   where envio_id = v_envio and canal = 'email' and estado = 'activa';
  return null;
end $$;
revoke execute on function fn_difusion_hora_sigue_paradas() from public, anon, authenticated;
comment on function public.fn_difusion_hora_sigue_paradas() is '[Gestión interna] Disparador de las paradas de un envío: si el envío tiene la oferta escalonada en marcha y cambia su ruta, recalcula la hora límite de la oferta con el cierre del primer sitio de carga que haya ahora. No toca la oferta si Dynamo indicó la hora a mano. Quién: nadie la llama; la ejecuta la base de datos.';

create trigger tg_envio_paradas_difusion_hora after insert or delete or update of sitio_id, orden, tipo on envio_paradas
  for each row execute function fn_difusion_hora_sigue_paradas();
