-- SIN CAMIÓN: EL AVISO AL CERRAR EL SITIO DE CARGA (usuario, 2026-11-28): «mejor que se dé el
-- aviso directamente cuando el sitio de carga ya ha cerrado, no esperar al día siguiente».
-- El último día de carga (la fecha fija, o el último de la ventana) cuenta como pasado en cuanto
-- cierra el PRIMER sitio de carga ese día (su horario, con el de verano si toca; si no tiene
-- horario, la hora por defecto de la difusión), no al día siguiente. Vale para ampliar la
-- ventana y para «Sin camión · elige nueva fecha». La tarea pasa cada 15 minutos (antes, cada hora).

do $$
declare v_def text := pg_get_functiondef('public.revisar_envios_sin_camion()'::regprocedure); v_nuevo text;
begin
  v_nuevo := replace(v_def,
    'and e.fecha_carga_desde is not null and coalesce(e.fecha_carga_hasta, e.fecha_carga_desde) < v_hoy',
    'and e.fecha_carga_desde is not null and envio_carga_cerrada(e.id, coalesce(e.fecha_carga_hasta, e.fecha_carga_desde))');
  if v_nuevo = v_def then raise exception 'revisar_envios_sin_camion: no se ha encontrado la condición de fecha pasada'; end if;
  -- La función nueva se crea antes de cambiar la tarea (abajo), en esta misma migración.
  create or replace function public.envio_carga_cerrada(p_envio uuid, p_dia date)
  returns boolean language sql stable security definer set search_path = public as $f$
    select p_dia < (now() at time zone 'Europe/Madrid')::date
        or (p_dia = (now() at time zone 'Europe/Madrid')::date
            and (now() at time zone 'Europe/Madrid')::time >= fn_difusion_hora_limite(p_envio, p_dia))
  $f$;
  execute v_nuevo;
end $$;
revoke execute on function public.envio_carga_cerrada(uuid, date) from public, anon, authenticated;
comment on function public.envio_carga_cerrada(uuid, date) is '[Gestión interna] ¿Ha terminado ya el día de carga p_dia de un envío? Sí si es un día pasado, o si es hoy y ya ha cerrado el primer sitio de carga (su horario de ese día; si no tiene, la hora por defecto de la difusión). Hora de Madrid. Quién: interno (envíos sin camión). Argumentos: p_envio: envios.id · p_dia: el último día de carga.';
comment on function public.revisar_envios_sin_camion() is '[Sistema y tareas automáticas] Tarea de cada 15 minutos: envíos programados sin transportista cuyo último día de carga ha terminado (pasado, o hoy con el primer sitio de carga ya cerrado). Con ventana y la casilla marcada, amplía la ventana una vez (sin_camion_ampliar_dias); si no, los deja «Sin camión · elige nueva fecha» con email y aviso al cliente y a Dynamo; si el cliente no contesta en sin_camion_respuesta_dias días hábiles, los cancela sin coste (con «Repetir envío» en el email y aviso a Dynamo para devolver el pago si estaba pagado). Devuelve cuántos ha tocado. Quién: servidor (tarea automática), consola o Dynamo. Argumentos: sin argumentos.';

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'dynamo-sin-camion';
    perform cron.schedule('dynamo-sin-camion', '*/15 * * * *', 'select public.revisar_envios_sin_camion()');
  end if;
end $$;
