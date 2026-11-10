-- =====================================================================================
-- CAMBIOS DE UN ENVÍO AL TRANSPORTISTA: PROPUESTA + ACEPTAR/RECHAZAR (usuario, 2026-11-10)
-- =====================================================================================
-- Cuando Dynamo MODIFICA un envío que ya tiene transportista (su precio, fechas, ruta o
-- mercancía), el cambio SE APLICA YA (decisión del usuario) y al transportista le llega
-- una propuesta con el antes → ahora de SU precio y el detalle de los cambios:
--   · El transportista la ACEPTA o la RECHAZA desde su ficha del viaje.
--   · Dynamo puede responder EN SU NOMBRE (tras llamarle y negociar).
--   · Si se RECHAZA, el envío se DESASIGNA AUTOMÁTICAMENTE (decisión del usuario): el
--     camión se libera, vuelve a «Asignando transportista» y a Dynamo le salta un aviso
--     urgente en la campana.
-- Avisos: al transportista al proponer; a Dynamo al aceptar (si lo hace él) y al rechazar.
-- =====================================================================================

create table envio_cambios_transportista (
  id               uuid primary key default gen_random_uuid(),
  envio_id         uuid not null references envios(id) on delete restrict,
  transportista_id uuid not null references transportistas(id),
  precio_antes     numeric(12,2),
  precio_ahora     numeric(12,2),
  detalle          text not null check (length(trim(detalle)) > 0),
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'aceptado', 'rechazado', 'reemplazado')),
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  respondido_en    timestamptz,
  en_nombre        boolean not null default false,
  motivo_rechazo   text check (motivo_rechazo is null or char_length(motivo_rechazo) <= 500)
);
comment on table envio_cambios_transportista is
  'Propuestas de cambio de un envío a su transportista (Dynamo modificó precio, fechas, ruta o mercancía). El cambio ya está aplicado; esto registra si el transportista lo acepta o lo rechaza (y el rechazo desasigna el envío). Solo escriben las funciones.';
comment on column envio_cambios_transportista.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador de la propuesta. Ej. OK: 8b6f…';
comment on column envio_cambios_transportista.envio_id is 'formato: uuid | rango: no aplica | lista: no aplica | obligatorio | Envío modificado. Ej. OK: un envios.id';
comment on column envio_cambios_transportista.transportista_id is 'formato: uuid | rango: no aplica | lista: no aplica | obligatorio | Transportista que tenía el envío al proponer. Ej. OK: un transportistas.id';
comment on column envio_cambios_transportista.precio_antes is 'formato: número decimal (euros, sin IVA) | rango: 0 o más | lista: no aplica | opcional | Precio del transportista ANTES del cambio. Ej. OK: 600.00';
comment on column envio_cambios_transportista.precio_ahora is 'formato: número decimal (euros, sin IVA) | rango: 0 o más | lista: no aplica | opcional | Precio del transportista DESPUÉS del cambio. Ej. OK: 650.00';
comment on column envio_cambios_transportista.detalle is 'formato: texto | rango: no aplica | lista: no aplica | obligatorio | Qué ha cambiado, en una línea. Ej. OK: Precio: 600,00 € → 650,00 € · Fecha de carga: 12/11/26 → 13/11/26';
comment on column envio_cambios_transportista.estado is 'formato: palabra | rango: no aplica | lista: pendiente, aceptado, rechazado, reemplazado | obligatorio | Estado de la propuesta: reemplazado = llegó otra más nueva antes de responder. Ej. OK: pendiente';
comment on column envio_cambios_transportista.creado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo se propuso. Ej. OK: 2026-11-10 15:30+01';
comment on column envio_cambios_transportista.creado_por is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Gestor de Dynamo que guardó la modificación. Ej. OK: un usuarios.id';
comment on column envio_cambios_transportista.respondido_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo se aceptó o rechazó. Ej. OK: 2026-11-10 16:00+01';
comment on column envio_cambios_transportista.en_nombre is 'formato: sí/no (true/false) | rango: no aplica | lista: no aplica | automático | La respuesta la registró Dynamo en nombre del transportista (tras hablar con él). Ej. OK: true';
comment on column envio_cambios_transportista.motivo_rechazo is 'formato: texto (máx. 500) | rango: no aplica | lista: no aplica | opcional | Motivo del rechazo, si lo dio. Ej. OK: El precio no me sale con el gasóleo actual';

create index idx_ect_envio on envio_cambios_transportista (envio_id, creado_en desc);

alter table envio_cambios_transportista enable row level security;
-- Dynamo lo ve todo; el transportista, solo lo suyo. Nadie escribe directo (funciones).
create policy ect_sel on envio_cambios_transportista for select
  using (es_equipo_dynamo() or ve_todo() or transportista_id = transportista_del_usuario());
revoke insert, update, delete on envio_cambios_transportista from anon, authenticated;

create trigger tg_mantenimiento before insert or update or delete on envio_cambios_transportista
  for each row execute function fn_bloqueo_mantenimiento();
-- Plataforma en vivo: las fichas se repintan al llegar o responderse una propuesta.
create trigger tg_zz_en_vivo_alta after insert on envio_cambios_transportista
  referencing new table as nuevas for each statement execute function fn_senal_en_vivo('envio');
create trigger tg_zz_en_vivo_cambio after update on envio_cambios_transportista
  referencing old table as viejas new table as nuevas for each statement execute function fn_senal_en_vivo('envio');
create trigger tg_zz_en_vivo_borrado after delete on envio_cambios_transportista
  referencing old table as viejas for each statement execute function fn_senal_en_vivo('envio');

-- ---- Proponer (la llama guardarEdicionEnvio al guardar una modificación) --------------
create or replace function proponer_cambio_transportista(p_envio uuid, p_precio_antes numeric, p_precio_ahora numeric, p_detalle text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tra uuid; v_ref text; v_id uuid; v_txt text;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo propone cambios.' using errcode = '42501'; end if;
  select transportista_id, referencia_gx into v_tra, v_ref from envios where id = p_envio;
  if v_tra is null then return jsonb_build_object('ok', false, 'resultado', 'sin_transportista'); end if;
  if nullif(trim(p_detalle), '') is null then return jsonb_build_object('ok', false, 'resultado', 'sin_detalle'); end if;
  -- Una propuesta viva por envío: la anterior pendiente queda reemplazada.
  update envio_cambios_transportista set estado = 'reemplazado' where envio_id = p_envio and estado = 'pendiente';
  insert into envio_cambios_transportista (envio_id, transportista_id, precio_antes, precio_ahora, detalle, creado_por)
  values (p_envio, v_tra, p_precio_antes, p_precio_ahora, left(trim(p_detalle), 500), auth.uid())
  returning id into v_id;
  v_txt := case when p_precio_antes is distinct from p_precio_ahora and p_precio_ahora is not null
                then 'Tu precio: ' || euros_texto(p_precio_antes) || ' → ' || euros_texto(p_precio_ahora) || '. ' else '' end
           || left(trim(p_detalle), 300) || '. Acéptalo o recházalo en la ficha del envío.';
  perform crear_aviso('transportista', null, v_tra, 'cambio_transportista', 'aviso',
    'Cambios en el envío #' || coalesce(v_ref, ''), v_txt, '/panel/envios?ver=' || p_envio, p_envio);
  return jsonb_build_object('ok', true, 'resultado', 'propuesto', 'id', v_id);
end $$;
comment on function proponer_cambio_transportista(uuid, numeric, numeric, text) is '[Envíos] Registra la propuesta de cambios al transportista de un envío modificado (el cambio ya está aplicado): reemplaza la pendiente anterior y le manda el aviso con su antes → ahora. Quién: equipo de Dynamo. Argumentos: p_envio: envios.id · p_precio_antes, p_precio_ahora: precio del transportista sin IVA · p_detalle: qué cambió, en una línea.';
revoke all on function proponer_cambio_transportista(uuid, numeric, numeric, text) from public, anon, authenticated;
grant execute on function proponer_cambio_transportista(uuid, numeric, numeric, text) to authenticated;

-- ---- Responder: el transportista (o Dynamo en su nombre) ------------------------------
create or replace function responder_cambio_transportista(p_cambio uuid, p_acepta boolean, p_motivo text default null, p_en_nombre boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare c record; v_ref text; v_nombre text;
begin
  select * into c from envio_cambios_transportista where id = p_cambio for update;
  if c.id is null then return jsonb_build_object('ok', false, 'resultado', 'no_existe'); end if;
  if p_en_nombre then
    if not es_equipo_dynamo() then raise exception 'Solo Dynamo responde en nombre del transportista.' using errcode = '42501'; end if;
  elsif c.transportista_id is distinct from transportista_del_usuario() then
    raise exception 'Este cambio no es de tu empresa.' using errcode = '42501';
  end if;
  if c.estado <> 'pendiente' then return jsonb_build_object('ok', false, 'resultado', 'ya_respondido'); end if;
  update envio_cambios_transportista
     set estado = case when p_acepta then 'aceptado' else 'rechazado' end,
         respondido_en = now(), en_nombre = p_en_nombre,
         motivo_rechazo = case when p_acepta then null else left(nullif(trim(p_motivo), ''), 500) end
   where id = p_cambio;
  select referencia_gx into v_ref from envios where id = c.envio_id;
  select nombre_visible into v_nombre from transportistas where id = c.transportista_id;
  if p_acepta then
    if not p_en_nombre then
      perform crear_aviso('dynamo', null, null, 'cambio_transportista', 'ok',
        'Cambios aceptados · #' || coalesce(v_ref, ''),
        coalesce(v_nombre, 'El transportista') || ' ha aceptado los cambios del envío.', '/panel/envios?ver=' || c.envio_id, c.envio_id);
    end if;
  else
    -- RECHAZO → DESASIGNACIÓN AUTOMÁTICA (decisión del usuario, 2026-11-10): el camión
    -- se libera y el envío vuelve a «Asignando transportista».
    update envios set transportista_id = null where id = c.envio_id and transportista_id = c.transportista_id;
    perform crear_aviso('dynamo', null, null, 'cambio_transportista', 'urgente',
      'Cambios RECHAZADOS · #' || coalesce(v_ref, ''),
      coalesce(v_nombre, 'El transportista') || ' ha rechazado los cambios'
      || case when nullif(trim(p_motivo), '') is not null then ' («' || left(trim(p_motivo), 200) || '»)' else '' end
      || ': el envío queda SIN transportista — asigna otro camión.', '/panel/envios?ver=' || c.envio_id, c.envio_id);
  end if;
  return jsonb_build_object('ok', true, 'resultado', case when p_acepta then 'aceptado' else 'rechazado' end);
end $$;
comment on function responder_cambio_transportista(uuid, boolean, text, boolean) is '[Envíos] Acepta o rechaza una propuesta de cambios: la responde el transportista del envío o Dynamo en su nombre (p_en_nombre). El rechazo DESASIGNA el envío automáticamente (vuelve a «Asignando transportista») y avisa urgente a Dynamo; la aceptación del transportista avisa a Dynamo. Quién: el transportista de la propuesta, o el equipo de Dynamo con p_en_nombre. Argumentos: p_cambio: envio_cambios_transportista.id · p_acepta: true/false · p_motivo: motivo del rechazo (opcional) · p_en_nombre: lo registra Dynamo tras hablar con él.';
revoke all on function responder_cambio_transportista(uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function responder_cambio_transportista(uuid, boolean, text, boolean) to authenticated;

-- ---- Aviso al CLIENTE cuando su precio cambia en un envío vivo ------------------------
-- Dynamo modifica el envío y el importe del cliente cambia (no al ponerle el primer
-- precio): al cliente le llega el antes → ahora en su campana.
create or replace function fn_aviso_precio_cliente_cambiado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.importe_cliente is null or new.importe_cliente is null
     or new.importe_cliente = old.importe_cliente
     or new.estado in ('borrador', 'cancelado') then return null; end if;
  perform crear_aviso('cliente', new.cliente_id, null, 'precio_cambiado', 'aviso',
    'El precio de tu envío ha cambiado · #' || coalesce(new.referencia_gx, ''),
    'Antes ' || euros_texto(old.importe_cliente) || ' → ahora ' || euros_texto(new.importe_cliente) || ' (base sin IVA), por los cambios del envío.',
    '/panel/envios?ver=' || new.id, new.id);
  return null;
end $$;
comment on function fn_aviso_precio_cliente_cambiado() is 'Aviso al cliente con el antes → ahora cuando cambia el importe de un envío vivo (no en borrador ni cancelado, ni al ponerle el primer precio).';
revoke all on function fn_aviso_precio_cliente_cambiado() from public, anon, authenticated;
drop trigger if exists tg_aviso_precio_cliente_cambiado on envios;
create trigger tg_aviso_precio_cliente_cambiado after update of importe_cliente on envios
  for each row execute function fn_aviso_precio_cliente_cambiado();
