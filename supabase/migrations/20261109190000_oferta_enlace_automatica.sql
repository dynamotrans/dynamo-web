-- =====================================================================================
-- EL ENLACE DE COMPARTIR LA CARGA NACE CON EL ENVÍO (usuario, 2026-11-09)
-- =====================================================================================
-- Como el del CMR (20261109160000): el enlace para que un transportista acepte el envío
-- se crea solo al nacer el envío, y es SIEMPRE el mismo — los avisos automáticos lo
-- mandarán y la ficha lo enseña directamente para compartirlo a mano.
--   · Se crea la oferta ABIERTA (canal «enlace», sin transportista) con el precio del
--     transportista del envío, ±10 % y pronto pago, en cuanto el envío es ofertable:
--     programado, sin transportista, pago previo no pendiente y con precio. Si nace
--     pendiente de pago (o sin precio del transportista), el enlace llega solo al
--     pagarse (o al ponerle precio). Si se des-asigna el camión, vuelve a crearse.
--   · El PRECIO del enlace se mantiene al día: si cambia el importe del transportista
--     (revisión, ajuste a mano), la oferta abierta viva se actualiza — salvo que tenga
--     una reserva en marcha (viva, en revisión o aceptada), que no se pisa.
--   · NO toca estado_asignacion ni deja hito: el envío no pasa a «asignándose» por tener
--     su enlace preparado (eso llegará con el envío real del aviso o la bolsa, tarea 66).
--   · Los envíos retro-fechados (migraciones, datos de prueba) y los manuales no entran.
-- =====================================================================================

create or replace function fn_envios_oferta_enlace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 1) Precio al día en la oferta abierta viva (sin pisar una reserva en marcha).
  if tg_op = 'UPDATE' and new.importe_transportista is distinct from old.importe_transportista
     and coalesce(new.importe_transportista, 0) > 0 then
    update envio_ofertas o set precio_ofertado = new.importe_transportista, modificado_en = now()
     where o.envio_id = new.id and o.transportista_id is null and o.canal = 'enlace'
       and o.estado = 'activa' and o.caduca_en > now()
       and o.precio_ofertado is distinct from new.importe_transportista
       and not exists (select 1 from envio_reservas r where r.oferta_id = o.id
                         and r.estado in ('viva', 'pendiente_revision', 'aceptada'));
  end if;
  -- 2) El enlace: solo envíos de Dynamo ofertables, sin uno abierto vivo ya.
  if new.es_manual then return null; end if;
  if new.estado <> 'programado' or new.transportista_id is not null then return null; end if;
  if new.estado_asignacion = 'confirmada' then return null; end if;
  if new.estado_pago_previo = 'pendiente' then return null; end if;
  if coalesce(new.importe_transportista, 0) <= 0 then return null; end if;
  if tg_op = 'INSERT' and new.creado_en < now() - interval '5 minutes' then return null; end if;
  if exists (select 1 from envio_ofertas o where o.envio_id = new.id and o.transportista_id is null
               and o.estado = 'activa' and o.caduca_en > now()) then return null; end if;
  begin
    -- Vive al menos hasta pasada la carga (el precio se mantiene al día, ver arriba), y
    -- como poco los días del parámetro de caducidad de siempre.
    insert into envio_ofertas (envio_id, transportista_id, canal, precio_ofertado, banda_pct, pronto_pago, caduca_en)
    values (new.id, null, 'enlace', new.importe_transportista, 10, true,
            greatest(now() + make_interval(days => (parametro('oferta_dias_caducidad'))::int),
                     (coalesce(new.fecha_carga_hasta, new.fecha_carga_desde) + 2)::timestamptz));
  exception when others then null;   -- el enlace automático nunca tumba el envío
  end;
  return null;
end $$;
revoke all on function fn_envios_oferta_enlace() from public, anon, authenticated;
comment on function public.fn_envios_oferta_enlace() is '[Disparadores] Crea sola la oferta abierta con su enlace (canal enlace, precio del transportista, ±10 %, pronto pago) en cuanto el envío es ofertable (programado, sin transportista, pago no pendiente, con precio), y mantiene su precio al día cuando cambia el del envío (sin pisar una reserva en marcha). No toca estado_asignacion ni deja hito. Quién: disparador de envios.';

create trigger tg_envios_oferta_enlace
  after insert or update of estado, estado_pago_previo, transportista_id, importe_transportista on envios
  for each row execute function fn_envios_oferta_enlace();

-- =====================================================================================
-- LA OFERTA-ENLACE ABIERTA NO ES «NEGOCIACIÓN EN MARCHA»
-- =====================================================================================
-- Antes, tener una oferta activa significaba que Dynamo estaba moviendo el envío. Con el
-- enlace automático eso ya no vale: existe SIEMPRE. La señal real de movimiento pasa a
-- ser la reserva (o una oferta personal a un transportista, o la bolsa). Se excluye la
-- oferta abierta de canal «enlace» en los dos sitios que la contaban:
--   · envio_asignandose (¿puede el cliente modificar su envío?);
--   · el recomputo al quitar el transportista (vuelve a «sin asignar», no a «ofertada»,
--     si lo único vivo es el enlace automático).

-- (copiada de 20261104400000_revision_seguridad)
create or replace function envio_asignandose(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select e.transportista_id is not null or e.estado_asignacion <> 'sin_asignar' or e.publicado_en_bolsa_en is not null
         or exists (select 1 from envio_reservas r where r.envio_id = e.id and r.estado in ('viva', 'pendiente_revision'))
         or exists (select 1 from envio_ofertas o where o.envio_id = e.id and o.estado = 'activa' and o.caduca_en > now()
                      and not (o.transportista_id is null and o.canal = 'enlace'))
    from envios e where e.id = p_envio
$$;
revoke execute on function envio_asignandose(uuid) from public, anon, authenticated;

-- (copiada de 20261106160100_seguimiento_automatico)
CREATE OR REPLACE FUNCTION public.fn_envios_ac_asignacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t record;
begin
  if new.transportista_id is not null and new.transportista_id is distinct from old.transportista_id then
    select estado_operativo, nima into t from transportistas where id = new.transportista_id;
    if t.estado_operativo = 'suspendido' and not es_consola_supabase() then
      raise exception 'Ese transportista está suspendido: no se le pueden dar envíos.';
    end if;
    new.estado_asignacion := 'confirmada';
    -- El NIMA es el del transportista nuevo (salvo que quien asigna ponga otro).
    if new.transportista_nima is not distinct from old.transportista_nima then new.transportista_nima := t.nima; end if;
  elsif new.transportista_id is null and old.transportista_id is not null then
    -- Sin transportista no quedan su camión, su conductor ni su precio.
    new.matricula_camion := null; new.matricula_remolque := null; new.conductor_nombre := null; new.conductor_telefono := null;
    new.vehiculo_camion_id := null; new.vehiculo_remolque_id := null; new.conductor_id := null;
    new.transportista_nima := null; new.importe_transportista := null;
    new.fecha_carga_prevista := null; new.ancla_paso := null; new.ancla_hora := null;
    if new.estado_asignacion = 'confirmada' then
      -- La oferta-enlace automática no cuenta: si es lo único vivo, vuelve a «sin asignar».
      new.estado_asignacion := case when exists (select 1 from envio_ofertas o where o.envio_id = new.id and o.estado = 'activa' and o.caduca_en > now()
                                                   and not (o.transportista_id is null and o.canal = 'enlace'))
                                    then 'ofertada' else 'sin_asignar' end;
    end if;
  end if;
  return new;
end $function$;
