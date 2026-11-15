-- REANUDACIÓN AUTOMÁTICA de la oferta escalonada (usuario, 2026-11-15, 7.ª pasada): la
-- difusión se corta en seco al asignarse transportista; si después el envío SE QUEDA SIN
-- transportista (se le quita, y sigue programado), la difusión que se había cerrado por
-- esa asignación VUELVE A ARRANCAR SOLA donde se quedó: mismo arranque, cadencia y corte,
-- siguiente candidato del ranking, y las ofertas de email que se cerraron al asignarse el
-- otro reviven hasta el corte (su enlace vuelve a funcionar y el recordatorio diario las
-- retoma). Con aviso de campana a Dynamo. Si al quedarse sin transportista ya estamos
-- DENTRO del corte, no se reanuda: aviso URGENTE («esto ya es de teléfono»). Una difusión
-- parada A MANO por Dynamo nunca resucita sola; una agotada tampoco se relanza (no le
-- quedaban candidatos), pero su recordatorio diario sigue trabajando hasta el corte.
create or replace function fn_difusion_reanudar()
returns trigger language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if new.estado <> 'programado' then return null; end if;
  select * into d from difusiones where envio_id = new.id order by creado_en desc limit 1;
  if d.id is null or d.estado <> 'aceptada' then return null; end if;
  if d.corte_en is not null and now() >= d.corte_en then
    perform crear_aviso('dynamo', null, null, 'difusion_corte', 'urgente',
      format('Sin transportista DENTRO del corte · envío #%s', new.referencia_gx),
      'El envío se ha quedado sin transportista y queda menos del margen de corte para la carga: la oferta escalonada no se reanuda. Esto ya es de teléfono: muévelo a mano.',
      '/panel/envios', new.id);
    return null;
  end if;
  update difusiones set estado = 'activa', terminada_en = null, fin_motivo = null where id = d.id;
  -- Las ofertas de email que se cerraron «porque otro se la quedó» reviven hasta el corte.
  update envio_ofertas set estado = 'activa',
         caduca_en = greatest(caduca_en, coalesce(d.corte_en,
           now() + make_interval(days => greatest(1, coalesce((parametro('oferta_dias_caducidad'))::text::int, 2)))))
   where envio_id = new.id and canal = 'email' and estado = 'cerrada';
  perform crear_aviso('dynamo', null, null, 'difusion_reanudada', 'aviso',
    format('Oferta escalonada reanudada · envío #%s', new.referencia_gx),
    'El envío se ha quedado sin transportista y la oferta escalonada ha vuelto a arrancar sola donde se quedó.',
    '/panel/envios', new.id);
  return null;
end $$;
revoke execute on function fn_difusion_reanudar() from public, anon, authenticated;
comment on function public.fn_difusion_reanudar() is '[Gestión interna] Disparador de envios: si el envío se queda sin transportista y sigue programado, la última oferta escalonada que se había cerrado por esa asignación vuelve a estado activa (reabriendo hasta el corte las ofertas de email cerradas) con aviso a Dynamo; dentro del corte no se reanuda y el aviso es urgente. Las paradas a mano y las agotadas no se tocan. Quién: el disparador tg_envios_difusion_reanudar; nadie por la API. Argumentos: ninguno (NEW/OLD del disparador).';

drop trigger if exists tg_envios_difusion_reanudar on envios;
create trigger tg_envios_difusion_reanudar after update of transportista_id on envios
  for each row when (old.transportista_id is not null and new.transportista_id is null)
  execute function fn_difusion_reanudar();
