-- =====================================================================================
-- EL CMR DIGITAL ES SOLO DE LOS ENVÍOS CON DYNAMO (usuario, 2026-11-14)
-- =====================================================================================
-- En los envíos manuales (contratación directa del cliente con su transportista) la
-- plataforma no ofrece firma digital ni archiva documentación: la web ya no enseña ni
-- reparte el enlace de firma, pero las funciones públicas seguían aceptando la firma o
-- una reserva si alguien llamaba con el token (p. ej. de un QR impreso antes del
-- cambio). Dos cerrojos en la propia base de datos: una firma o una reserva de un
-- envío manual se rechaza, venga de donde venga. Leer la hoja (cmr_publico) y el PDF
-- imprimible siguen funcionando: solo se cierra ESCRIBIR.

create or replace function public.fn_firmas_cmr_solo_dynamo()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select coalesce(es_manual, false) from envios where id = new.envio_id) then
    raise exception 'gestion_directa' using errcode = '42501';
  end if;
  return new;
end $$;
comment on function public.fn_firmas_cmr_solo_dynamo() is '[Gestión interna] Disparador de firmas_cmr: rechaza la firma digital de un envío MANUAL (contratación directa del cliente con su transportista) — el CMR digital es solo de los envíos con Dynamo; el manual se imprime y se firma a mano. Quién: el disparador; nadie por la API. Argumentos: ninguno (NEW).';
drop trigger if exists tg_firmas_cmr_solo_dynamo on firmas_cmr;
create trigger tg_firmas_cmr_solo_dynamo before insert on firmas_cmr
  for each row execute function fn_firmas_cmr_solo_dynamo();

create or replace function public.fn_cmr_reservas_solo_dynamo()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select coalesce(es_manual, false) from envios where id = new.envio_id) then
    raise exception 'gestion_directa' using errcode = '42501';
  end if;
  return new;
end $$;
comment on function public.fn_cmr_reservas_solo_dynamo() is '[Gestión interna] Disparador de cmr_reservas: rechaza las reservas del CMR digital en un envío MANUAL (contratación directa) — su CMR se gestiona entre las partes, en papel. Al rechazarse, la incidencia creada en la misma llamada se deshace con la transacción. Quién: el disparador; nadie por la API. Argumentos: ninguno (NEW).';
drop trigger if exists tg_cmr_reservas_solo_dynamo on cmr_reservas;
create trigger tg_cmr_reservas_solo_dynamo before insert on cmr_reservas
  for each row execute function fn_cmr_reservas_solo_dynamo();
