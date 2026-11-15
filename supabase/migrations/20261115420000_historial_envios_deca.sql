-- =====================================================================================
-- HISTORIAL DE ENVÍOS DEL DeCA (usuario, 2026-11-15)
-- =====================================================================================
-- «Poner histórico de envíos: fecha y hora — vía (auto mail, manual mail, WhatsApp…)», en
-- la ventana del DeCA de la ficha, debajo de «Abrir PDF».
--   · Los EMAILS (automáticos y manuales) ya quedan en `emails_enviados` (tipo 'deca'),
--     con su destinatario y si salieron o no.
--   · Lo que se comparte A MANO desde «Compartir por…» (WhatsApp, email propio, SMS,
--     copiar el enlace) no quedaba en ningún sitio: esta tabla lo apunta. Ojo: apunta que
--     se abrió esa vía desde la plataforma — el envío lo termina la persona en su app.

create table deca_compartidos (
  id         uuid primary key default gen_random_uuid(),
  envio_id   uuid not null references envios (id) on delete cascade,
  via        text not null check (via in ('whatsapp', 'email', 'sms', 'copiar', 'otros')),
  creado_por uuid references usuarios (id) on delete set null,
  creado_en  timestamptz not null default now()
);
create index deca_compartidos_envio_idx on deca_compartidos (envio_id, creado_en);
comment on table deca_compartidos is 'Cada vez que alguien de Dynamo comparte a mano el documento de control (DeCA) de un envío desde «Compartir por…» de la ficha (WhatsApp, email propio, SMS, copiar el enlace). Solo se añaden. Junto con los emails de tipo deca de emails_enviados forma el historial de envíos del DeCA.';
comment on column deca_compartidos.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único del apunte.';
comment on column deca_compartidos.envio_id is 'formato: uuid | → envios.id | rango: no aplica | lista: no aplica | obligatorio | Envío cuyo DeCA se compartió.';
comment on column deca_compartidos.via is 'formato: texto | rango: no aplica | lista: whatsapp · email (el programa de correo de quien comparte) · sms · copiar (enlace copiado) · otros (el menú de compartir del aparato) | obligatorio | Por dónde se compartió. Ej. OK: whatsapp · Ej. mal: fax';
comment on column deca_compartidos.creado_por is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | automático | Usuario que lo compartió (vacío si se borró el usuario).';
comment on column deca_compartidos.creado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Fecha y hora en que se compartió.';
create trigger tg_mantenimiento before insert or update or delete on deca_compartidos
  for each row execute function fn_bloqueo_mantenimiento();
alter table deca_compartidos enable row level security;
create policy deca_compartidos_ver on deca_compartidos for select using (ve_todo());
-- Sin políticas de escritura: solo entra por anotar_deca_compartido.

create or replace function anotar_deca_compartido(p_envio uuid, p_via text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo comparte el DeCA.' using errcode = '42501'; end if;
  if p_via is null or p_via not in ('whatsapp', 'email', 'sms', 'copiar', 'otros') then return false; end if;
  if not exists (select 1 from envios where id = p_envio) then return false; end if;
  insert into deca_compartidos (envio_id, via, creado_por) values (p_envio, p_via, auth.uid());
  return true;
end $$;
revoke execute on function anotar_deca_compartido(uuid, text) from public, anon;
grant execute on function anotar_deca_compartido(uuid, text) to authenticated;
comment on function public.anotar_deca_compartido(uuid, text) is '[Envíos] Apunta que el documento de control (DeCA) de un envío se ha compartido a mano desde «Compartir por…» de la ficha, y por qué vía, para el historial de envíos del DeCA. Una vía desconocida no apunta nada. Devuelve true si lo apuntó. Quién: equipo Dynamo (admin o empleado). Argumentos: p_envio: envios.id · p_via: whatsapp, email, sms, copiar u otros.';
