-- =====================================================================================
-- EL ENLACE DEL CMR NACE CON EL ENVÍO (usuario, 2026-11-09)
-- =====================================================================================
-- Hasta hoy el enlace de firma se creaba a mano desde la ficha («Crear enlace para
-- firmar»). El usuario lo quiere creado DESDE QUE SE CREA EL ENVÍO: los avisos
-- automáticos (email/WhatsApp, NOTIFICACIONES.md) se lo mandarán solos a las partes, y
-- la ficha enseña directamente los botones de compartir para reenviarlo a mano a quien
-- haga falta.
--   · Disparador: al nacer un envío vivo (o salir de borrador) se le crea su enlace, si
--     no tiene uno vivo. «Retirar enlace» se respeta: retirado no se recrea solo (queda
--     el botón de crear de la ficha).
--   · Relleno: los envíos vivos de hoy sin enlace reciben el suyo.
-- =====================================================================================

create or replace function fn_envios_enlace_cmr()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Solo al nacer vivo o al salir de borrador: un cambio de estado posterior no recrea
  -- un enlace retirado a mano.
  if new.estado in ('borrador', 'cancelado') then return null; end if;
  if tg_op = 'UPDATE' and old.estado <> 'borrador' then return null; end if;
  -- Un envío insertado con la fecha de creación en el pasado viene de una migración o del
  -- generador de datos de prueba (que pone sus propios enlaces): ahí no se mete.
  if tg_op = 'INSERT' and new.creado_en < now() - interval '5 minutes' then return null; end if;
  if not exists (select 1 from cmr_enlaces where envio_id = new.id and not revocado) then
    insert into cmr_enlaces (envio_id) values (new.id) on conflict do nothing;
  end if;
  return null;
end $$;
revoke all on function fn_envios_enlace_cmr() from public, anon, authenticated;
comment on function public.fn_envios_enlace_cmr() is '[Disparadores] Crea el enlace de firma del CMR al nacer el envío (o al salir de borrador), si no tiene uno vivo. Un enlace retirado a mano no se recrea solo. Quién: disparador de envios.';

create trigger tg_envios_enlace_cmr after insert or update of estado on envios
  for each row execute function fn_envios_enlace_cmr();

-- Relleno: los envíos vivos (ni borrador, ni cancelado, ni ya entregado) sin enlace vivo.
insert into cmr_enlaces (envio_id)
select e.id from envios e
 where e.estado not in ('borrador', 'cancelado', 'entregado')
   and not exists (select 1 from cmr_enlaces c where c.envio_id = e.id and not c.revocado);
