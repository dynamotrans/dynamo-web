-- =====================================================================================
-- FECHA DE CARGA REAL = LA DE LA PRIMERA FIRMA DEL CMR (usuario, 2026-11-12): si el
-- camión llega tarde (p. ej. al día siguiente), la fecha buena es la del mundo real.
-- La PRIMERA firma de casilla del CARGADOR o del TRANSPORTISTA fija
-- envios.fecha_carga_real con su fecha (hora de Madrid): esa firma solo puede ocurrir
-- en la carga, así que es la mejor prueba de cuándo se cargó. La firma del
-- DESTINATARIO no la fija nunca (se firma en la entrega: si solo existe esa, la fecha
-- de carga no se toca). Las firmas extra tampoco.
-- Como el CMR (página y PDF) ya pinta coalesce(fecha_carga_real, fecha_carga_desde),
-- el documento y el programa quedan actualizados solos con la fecha real.
-- =====================================================================================
create or replace function public.fn_firmas_cmr_fecha_real()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Solo la PRIMERA firma válida del envío fija la fecha; las siguientes no la mueven.
  if exists (select 1 from firmas_cmr f
              where f.envio_id = new.envio_id and not f.extra
                and f.rol in ('remitente', 'transportista') and f.id <> new.id) then
    return null;
  end if;
  update envios e
     set fecha_carga_real = (new.firmado_en at time zone 'Europe/Madrid')::date
   where e.id = new.envio_id and e.estado <> 'cancelado'
     and e.fecha_carga_real is distinct from (new.firmado_en at time zone 'Europe/Madrid')::date;
  return null;
end $$;
revoke execute on function public.fn_firmas_cmr_fecha_real() from public, anon, authenticated;
comment on function public.fn_firmas_cmr_fecha_real() is '[Clientes y equipo] Disparador interno: la PRIMERA firma de casilla del cargador (remitente) o del transportista fija envios.fecha_carga_real con la fecha de la firma (hora de Madrid) — si el camión carga tarde, la fecha buena es la real, y el CMR y el programa la enseñan solos. La firma del destinatario no la fija nunca y las extra tampoco; un envío cancelado no se toca. Quién: disparador, nadie lo llama a mano. Argumentos: ninguno.';

drop trigger if exists tg_firmas_cmr_fecha_real on firmas_cmr;
create trigger tg_firmas_cmr_fecha_real after insert on firmas_cmr
  for each row when (not new.extra and new.rol in ('remitente', 'transportista'))
  execute function fn_firmas_cmr_fecha_real();
