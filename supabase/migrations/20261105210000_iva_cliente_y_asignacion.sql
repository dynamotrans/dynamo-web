-- =====================================================================================
-- IVA DEL CLIENTE EN CADA ENVÍO + ASIGNAR A MANO = ASIGNADO (usuario, 2026-11-05)
--   · «Debe tomar el IVA del cliente; por defecto en su ficha 21 si el país del cliente
--     es España y 0 si es otro.»
--       - clientes: al darlo de alta, IVA 21 % si es de España y 0 % si es de otro país
--         (salvo que se ponga otro a mano, p. ej. Canarias). Si cambia el país y no se toca
--         el IVA en el mismo cambio, el IVA se pone según el país nuevo.
--       - envíos: al crearlo (o cambiar de cliente) toma el IVA de la ficha del cliente.
--         Antes la solicitud del cliente y crear_envio ponían siempre 21.
--       - el cobro (pago_envio_importes) usa el IVA del envío.
--   · «Al asignar un camión a mano, debe ponerse como asignado»: poner el transportista
--     pasa la asignación a «confirmada»; quitarlo la devuelve a «ofertada» (si hay ofertas
--     abiertas) o «sin asignar».
-- =====================================================================================

-- ---- IVA por defecto según el país del cliente --------------------------------------
create or replace function fn_clientes_iva_pais()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Lo que llega con el valor por defecto (21) se ajusta al país; otro valor es a mano.
    if new.iva_porcentaje = 21 and coalesce(new.pais_codigo_iso, 'ES') <> 'ES' then new.iva_porcentaje := 0; end if;
  elsif new.pais_codigo_iso is distinct from old.pais_codigo_iso and new.iva_porcentaje = old.iva_porcentaje then
    new.iva_porcentaje := case when coalesce(new.pais_codigo_iso, 'ES') = 'ES' then 21 else 0 end;
  end if;
  return new;
end $$;
revoke execute on function fn_clientes_iva_pais() from public, anon, authenticated;
create trigger tg_clientes_iva_pais before insert or update of pais_codigo_iso on clientes
  for each row execute function fn_clientes_iva_pais();

-- Clientes ya dados de alta fuera de España con el 21 por defecto.
update clientes set iva_porcentaje = 0 where coalesce(pais_codigo_iso, 'ES') <> 'ES' and iva_porcentaje = 21;

-- ---- El envío toma el IVA del cliente -------------------------------------------------
create or replace function fn_envios_iva_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.cliente_id is distinct from old.cliente_id then
    new.iva_aplicado := coalesce((select iva_porcentaje from clientes where id = new.cliente_id), 21);
  end if;
  return new;
end $$;
revoke execute on function fn_envios_iva_cliente() from public, anon, authenticated;
create trigger tg_envios_iva_cliente before insert or update of cliente_id on envios
  for each row execute function fn_envios_iva_cliente();

-- Los que aún no han cargado, con el IVA de su cliente.
update envios e set iva_aplicado = c.iva_porcentaje
  from clientes c
 where c.id = e.cliente_id and e.estado in ('borrador', 'programado') and e.iva_aplicado is distinct from c.iva_porcentaje;

create or replace function pago_envio_importes(p_envio uuid)
returns table (base numeric, iva numeric, total numeric) language sql stable security definer set search_path = public as $$
  select round(coalesce(e.importe_cliente, 0), 2),
         coalesce(e.iva_aplicado, c.iva_porcentaje, 21),
         round(coalesce(e.importe_cliente, 0) * (1 + coalesce(e.iva_aplicado, c.iva_porcentaje, 21) / 100), 2)
    from envios e join clientes c on c.id = e.cliente_id
   where e.id = p_envio
$$;
revoke execute on function pago_envio_importes(uuid) from public, anon, authenticated;

-- ---- Asignar a mano = asignado ------------------------------------------------------
-- (Después de los guardianes del previo pago y del precio provisional, que ya impiden
-- asignar un envío pendiente de pago o con precio por revisar.)
create or replace function fn_envios_ac_asignacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.transportista_id is not null and new.transportista_id is distinct from old.transportista_id then
    new.estado_asignacion := 'confirmada';
  elsif new.transportista_id is null and old.transportista_id is not null and new.estado_asignacion = 'confirmada' then
    new.estado_asignacion := case when exists (select 1 from envio_ofertas o where o.envio_id = new.id and o.estado = 'activa' and o.caduca_en > now())
                                  then 'ofertada' else 'sin_asignar' end;
  end if;
  return new;
end $$;
revoke execute on function fn_envios_ac_asignacion() from public, anon, authenticated;
create trigger tg_envios_ac_asignacion before update of transportista_id on envios
  for each row execute function fn_envios_ac_asignacion();

-- Los que ya tienen transportista y se quedaron sin marcar.
update envios set estado_asignacion = 'confirmada'
 where transportista_id is not null and estado_asignacion <> 'confirmada' and estado not in ('cancelado');

comment on function public.pago_envio_importes(uuid) is '[Precio y pago] Base, IVA (el del envío, que toma el de la ficha del cliente) y total con IVA de un envío. Quién: solo uso interno (lo usan pagos_envio y el cobro con tarjeta). Argumentos: p_envio: envios.id.';
comment on column public.envios.iva_aplicado is 'formato: número decimal (2 decimales) | rango: 0 a 100 | lista: no aplica | automático | IVA (%) del envío. Lo toma la base de datos de la ficha del cliente al crearlo o cambiar de cliente (21 si es de España, 0 si es de otro país, salvo que la ficha diga otro). Dynamo puede cambiarlo después. Ej. OK: 21.00 · Ej. mal: 121';
comment on column public.clientes.iva_porcentaje is 'formato: número decimal (2 decimales) | rango: 0 a 100 | lista: no aplica | opcional | IVA (%) del cliente. Por defecto 21 si el cliente es de España y 0 si es de otro país (lo pone la base de datos al darlo de alta o cambiar el país, salvo que se ponga otro a mano, p. ej. Canarias). Cada envío lo copia al crearse. Ej. OK: 21 · Ej. mal: 121';
