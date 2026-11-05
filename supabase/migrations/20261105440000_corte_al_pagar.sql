-- =====================================================================================
-- HORAS DE CORTE: AL PEDIR Y AL PAGAR, POR SEPARADO (usuario, 2026-11-05)
-- Mismas horas que ya había (fecha fija 12:00, ventana 14:00), pero en dos juegos de
-- parámetros para poder cambiarlas por separado:
--   · al pedir el envío (tarifador y cambios de fecha del cliente):
--       primer_dia_corte_fija_hora · primer_dia_corte_ventana_hora
--   · al pagar y liberar el envío (pago previo recibido o pasado sin pago previo):
--       primer_dia_corte_pago_fija_hora · primer_dia_corte_pago_ventana_hora
-- primera_fecha_carga() gana el argumento p_al_pagar (por defecto false = al pedir).
-- =====================================================================================
insert into public.parametros (clave, valor, descripcion) values
  ('primer_dia_corte_pago_fija_hora', '12', 'Hora de corte (Madrid) al pagar (o liberar sin pago previo) un envío con fecha fija: antes, puede cargar el siguiente día hábil; después, el otro. Si la fecha elegida ya no llega, pasa a ese día.'),
  ('primer_dia_corte_pago_ventana_hora', '14', 'Hora de corte (Madrid) al pagar (o liberar sin pago previo) un envío con ventana: antes, la ventana puede empezar el siguiente día hábil; después, el otro. Si la ventana elegida ya no llega, pasa a ese día con los mismos días hábiles.')
on conflict (clave) do nothing;
update public.parametros set descripcion = 'Hora de corte (Madrid) al pedir un envío con fecha fija (tarifador y cambios de fecha): antes, puede cargar el siguiente día hábil; después, el otro.'
 where clave = 'primer_dia_corte_fija_hora';
update public.parametros set descripcion = 'Hora de corte (Madrid) al pedir un envío con ventana (tarifador y cambios de fecha): antes, la ventana puede empezar el siguiente día hábil; después, el otro.'
 where clave = 'primer_dia_corte_ventana_hora';

drop function public.primera_fecha_carga(boolean, timestamp with time zone);
create function public.primera_fecha_carga(p_fija boolean, p_instante timestamp with time zone default now(), p_al_pagar boolean default false)
 returns date language plpgsql stable security definer set search_path to 'public'
as $function$
declare l timestamp := p_instante at time zone 'Europe/Madrid';
        corte numeric := case
          when p_al_pagar and p_fija then parametro_num('primer_dia_corte_pago_fija_hora', 12)
          when p_al_pagar then parametro_num('primer_dia_corte_pago_ventana_hora', 14)
          when p_fija then parametro_num('primer_dia_corte_fija_hora', 12)
          else parametro_num('primer_dia_corte_ventana_hora', 14) end;
begin
  return sumar_dias_habiles(l::date, case when extract(hour from l) + extract(minute from l) / 60.0 < corte then 1 else 2 end);
end $function$;
revoke all on function public.primera_fecha_carga(boolean, timestamp with time zone, boolean) from public, anon;
grant execute on function public.primera_fecha_carga(boolean, timestamp with time zone, boolean) to authenticated, service_role;
comment on function public.primera_fecha_carga(boolean, timestamp with time zone, boolean) is '[Calendario y festivos] Primer día en que se puede cargar si se pide (o se paga) en un instante: el siguiente día hábil si es antes de la hora de corte (hora de Madrid); si no, el siguiente. Horas de corte en Parámetros, distintas al pedir (primer_dia_corte_fija_hora, primer_dia_corte_ventana_hora) y al pagar o liberar el envío (primer_dia_corte_pago_fija_hora, primer_dia_corte_pago_ventana_hora). Quién: cualquier usuario con sesión. Argumentos: p_fija: true = fecha fija, false = ventana · p_instante: cuándo (por defecto, ahora) · p_al_pagar: true = horas de corte al pagar (por defecto, al pedir).';

-- Al pagar o liberar: con las horas de corte «al pagar».
CREATE OR REPLACE FUNCTION public.fn_envios_a0_fecha_al_pagar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_fija boolean; v_primer date; v_n int; v_salto int;
begin
  if new.estado <> 'programado' or new.fecha_carga_desde is null or new.operador_id is not null then return new; end if;
  v_fija := coalesce(new.fecha_carga_hasta, new.fecha_carga_desde) <= new.fecha_carga_desde;
  v_primer := primera_fecha_carga(v_fija, now(), true);   -- horas de corte «al pagar»
  if new.fecha_carga_desde >= v_primer then return new; end if;   -- aún da tiempo: no se toca
  v_n := dias_ventana_carga(new.fecha_carga_desde, new.fecha_carga_hasta);
  select count(*) into v_salto from generate_series(new.fecha_carga_desde + 1, v_primer, interval '1 day') g where es_dia_habil(g::date);
  new.fecha_carga_desde := v_primer;
  new.fecha_carga_hasta := sumar_dias_habiles(v_primer, v_n - 1);
  if new.fecha_entrega_estimada is not null then
    new.fecha_entrega_estimada := greatest(sumar_dias_habiles(new.fecha_entrega_estimada, v_salto), new.fecha_carga_hasta);
  end if;
  perform registrar_hito(new.id, 'fecha_carga_movida', null, null,
    jsonb_build_object('antes_desde', old.fecha_carga_desde, 'antes_hasta', old.fecha_carga_hasta,
                       'desde', new.fecha_carga_desde, 'hasta', new.fecha_carga_hasta,
                       'motivo', case when new.estado_pago_previo = 'exento' then 'Pasado sin pago previo cuando ya no daba tiempo' else 'Pago recibido cuando ya no daba tiempo' end),
    case when es_servidor() then 'servidor' else 'app' end);
  return new;
end $function$;
