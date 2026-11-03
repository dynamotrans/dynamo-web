-- =====================================================================================
-- INCIDENCIAS DEL TRANSPORTISTA (etapa C)
-- =====================================================================================
-- El transportista abre incidencias de SUS viajes (retraso, daños, el muelle no carga…) y
-- adjunta fotos. Las ve Dynamo y él; el CLIENTE NO (puede llevar datos del otro lado del
-- viaje y es Dynamo quien decide qué le cuenta). Por eso no se le pone el cliente.

create or replace function fn_incidencias_completar()
returns trigger language plpgsql as $$
declare v_transp uuid := transportista_del_usuario();
begin
  if v_transp is not null and not es_admin() then
    -- La abre un transportista: es suya y no lleva cliente.
    if tg_op = 'INSERT' then new.transportista_id := v_transp; new.cliente_id := null; end if;
  else
    if new.cliente_id is null and new.envio_id is not null then
      select cliente_id into new.cliente_id from envios where id = new.envio_id;
    end if;
    if new.cliente_id is null and new.transportista_id is null then new.cliente_id := cliente_del_usuario(); end if;
  end if;
  if new.estado = 'resuelto' and (tg_op = 'INSERT' or old.estado <> 'resuelto') then
    new.resuelto_en := now();
  elsif new.estado <> 'resuelto' then
    new.resuelto_en := null;
  end if;
  return new;
end $$;

drop policy if exists incidencias_transportista_sel on incidencias;
create policy incidencias_transportista_sel on incidencias for select
  using (transportista_id is not null and transportista_id = transportista_del_usuario() and cliente_id is null);
drop policy if exists incidencias_transportista_ins on incidencias;
create policy incidencias_transportista_ins on incidencias for insert
  with check (transportista_id = transportista_del_usuario() and cliente_id is null
              and envio_id is not null and envio_del_transportista(envio_id));
drop policy if exists incidencias_transportista_upd on incidencias;
create policy incidencias_transportista_upd on incidencias for update
  using (transportista_id = transportista_del_usuario() and cliente_id is null and estado = 'abierto')
  with check (transportista_id = transportista_del_usuario() and cliente_id is null and estado in ('abierto', 'cancelado'));

-- Sus fotos y adjuntos, en SUS incidencias.
drop policy if exists documentos_ins_incidencia_transportista on documentos;
create policy documentos_ins_incidencia_transportista on documentos for insert with check (
  tipo in ('foto_incidencia', 'adjunto') and incidencia_id is not null and envio_id is null
  and transportista_id is null and almacenamiento_id is null and penalizacion_id is null
  and operador_id is null and usuario_id is null
  and exists (select 1 from incidencias i where i.id = documentos.incidencia_id
              and i.transportista_id = transportista_del_usuario() and i.cliente_id is null)
);
drop policy if exists documentos_sel_incidencia_transportista on documentos;
create policy documentos_sel_incidencia_transportista on documentos for select using (
  not borrado and incidencia_id is not null
  and exists (select 1 from incidencias i where i.id = documentos.incidencia_id
              and i.transportista_id = transportista_del_usuario() and i.cliente_id is null)
);

-- El hito del envío lo ven también cliente y transportista: el de una incidencia del
-- transportista lleva solo el código, no lo que ha escrito.
create or replace function fn_incidencias_hito()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.envio_id is not null then
    perform registrar_hito(new.envio_id, 'incidencia', null, null,
      case when new.cliente_id is null and new.transportista_id is not null
           then jsonb_build_object('incidencia', new.codigo, 'de', 'transportista')
           else jsonb_build_object('incidencia', new.codigo, 'titulo', new.titulo) end);
  end if;
  return null;
end $$;
