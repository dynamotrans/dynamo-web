-- =====================================================================================
-- HISTORIAL DE ENVÍOS TAMBIÉN PARA EL eCMR Y LA ORDEN DE CARGA (usuario, 2026-11-15)
-- =====================================================================================
-- «Para eCMR igual… para orden de carga igual, tanto en la pestaña del transportista como
-- en la del cliente.» El apunte de lo compartido a mano nació solo para el DeCA
-- (deca_compartidos): pasa a valer para los cuatro documentos que se comparten desde la
-- ficha y cambia de nombre. Los emails de cada uno ya están en `emails_enviados`.

alter table deca_compartidos rename to envio_compartidos;
alter index deca_compartidos_envio_idx rename to envio_compartidos_envio_idx;
alter table envio_compartidos rename constraint deca_compartidos_pkey to envio_compartidos_pkey;
alter table envio_compartidos rename constraint deca_compartidos_envio_id_fkey to envio_compartidos_envio_id_fkey;
alter table envio_compartidos rename constraint deca_compartidos_creado_por_fkey to envio_compartidos_creado_por_fkey;
alter table envio_compartidos rename constraint deca_compartidos_via_check to envio_compartidos_via_check;
alter policy deca_compartidos_ver on envio_compartidos rename to envio_compartidos_ver;

-- Qué documento se compartió (lo apuntado hasta hoy era todo del DeCA).
alter table envio_compartidos add column documento text not null default 'deca'
  constraint envio_compartidos_documento_check check (documento in ('deca', 'cmr', 'orden_transportista', 'orden_cliente'));
alter table envio_compartidos alter column documento drop default;

comment on table envio_compartidos is 'Cada vez que alguien de Dynamo comparte a mano un documento de un envío desde la ficha (el DeCA, la página de firmas del CMR o la orden de carga, por WhatsApp, email propio, SMS o copiando el enlace). Solo se añaden. Junto con los emails de emails_enviados forma el historial de envíos de cada documento.';
comment on column envio_compartidos.envio_id is 'formato: uuid | → envios.id | rango: no aplica | lista: no aplica | obligatorio | Envío cuyo documento se compartió.';
comment on column envio_compartidos.documento is 'formato: texto | rango: no aplica | lista: deca (documento de control) · cmr (página de firmas del CMR) · orden_transportista (orden de carga del transportista) · orden_cliente (copia de la orden para el cliente) | obligatorio | Qué documento se compartió. Ej. OK: deca · Ej. mal: factura';

drop function anotar_deca_compartido(uuid, text);
create or replace function anotar_compartido_envio(p_envio uuid, p_documento text, p_via text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo comparte los documentos de un envío.' using errcode = '42501'; end if;
  if p_via is null or p_via not in ('whatsapp', 'email', 'sms', 'copiar', 'otros') then return false; end if;
  if p_documento is null or p_documento not in ('deca', 'cmr', 'orden_transportista', 'orden_cliente') then return false; end if;
  if not exists (select 1 from envios where id = p_envio) then return false; end if;
  insert into envio_compartidos (envio_id, documento, via, creado_por) values (p_envio, p_documento, p_via, auth.uid());
  return true;
end $$;
revoke execute on function anotar_compartido_envio(uuid, text, text) from public, anon;
grant execute on function anotar_compartido_envio(uuid, text, text) to authenticated;
comment on function public.anotar_compartido_envio(uuid, text, text) is '[Envíos] Apunta que un documento de un envío (DeCA, página de firmas del CMR u orden de carga) se ha compartido a mano desde la ficha, y por qué vía, para el historial de envíos de ese documento. Un documento o una vía desconocidos no apuntan nada. Devuelve true si lo apuntó. Quién: equipo Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_documento: deca, cmr, orden_transportista u orden_cliente · p_via: whatsapp, email, sms, copiar u otros.';
