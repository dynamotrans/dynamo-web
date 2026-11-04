-- =====================================================================================
-- AVISOS DENTRO DE LA PLATAFORMA: las «novedades» de la campana (2026-11-04)
--
-- Hasta ahora la campana solo contaba lo pendiente (incidencias, pagos, altas). Para
-- enterarse de lo que pasaba había que abrir cada envío: el cliente no sabía que ya tenía
-- precio, el transportista no sabía si su contraoferta había salido, Dynamo no veía al
-- momento una contraoferta o un cambio pedido. Ahora cada cosa importante deja un AVISO,
-- que sale en la campana de quien le toca:
--   · DYNAMO: solicitud de precio, contraoferta del cliente o del transportista, carga
--     aceptada, envío confirmado o cancelado por el cliente, cambio pedido, pago recibido,
--     incidencia nueva (siniestro = urgente), cuenta suspendida automáticamente.
--   · CLIENTE (toda su empresa): ya tienes precio, propuesta aceptada o no, cambio
--     aceptado o rechazado, pago recibido, ya tiene transportista, en ruta, entregado,
--     cancelado por Dynamo.
--   · TRANSPORTISTA: carga asignada, contraoferta aceptada o no, carga cancelada.
-- Los crea la base de datos (triggers), nadie los escribe a mano. Al cliente nunca le
-- llega el precio del transportista. Cuando haya Postmark, los mismos avisos saldrán por
-- email. «Nuevo» = posterior a la última vez que esa persona abrió la campana.
-- =====================================================================================

create table avisos (
  id               uuid primary key default gen_random_uuid(),
  para             text not null check (para in ('dynamo', 'cliente', 'transportista')),
  cliente_id       uuid references clientes(id) on delete cascade,
  transportista_id uuid references transportistas(id) on delete cascade,
  tipo             text not null,
  nivel            text not null default 'info' check (nivel in ('info', 'ok', 'aviso', 'urgente')),
  titulo           text not null,
  texto            text,
  enlace           text,
  envio_id         uuid references envios(id) on delete cascade,
  creado_en        timestamptz not null default now(),
  constraint ck_avisos_destino check (
    (para = 'cliente' and cliente_id is not null) or
    (para = 'transportista' and transportista_id is not null) or
    para = 'dynamo')
);
comment on table avisos is 'Novedades de la campana. Las crea la base de datos; se leen con mis_avisos().';
create index idx_avisos_dynamo on avisos (creado_en desc) where para = 'dynamo';
create index idx_avisos_cliente on avisos (cliente_id, creado_en desc) where para = 'cliente';
create index idx_avisos_transportista on avisos (transportista_id, creado_en desc) where para = 'transportista';
alter table avisos enable row level security;
create policy avisos_sel on avisos for select to authenticated using (
  ve_todo()
  or (para = 'cliente' and cliente_id = cliente_del_usuario())
  or (para = 'transportista' and transportista_id = transportista_del_usuario()));
revoke insert, update, delete on avisos from anon, authenticated;

-- Cuándo abrió cada persona la campana por última vez (aparte de `usuarios` para no
-- llenar la auditoría con cada vistazo).
create table avisos_vistos (
  usuario_id uuid primary key references usuarios(id) on delete cascade,
  visto_en   timestamptz not null default now()
);
alter table avisos_vistos enable row level security;
create policy avisos_vistos_sel on avisos_vistos for select to authenticated using (usuario_id = auth.uid());
revoke insert, update, delete on avisos_vistos from anon, authenticated;

-- Bloqueo de mantenimiento, como el resto de tablas de negocio.
create trigger tg_mantenimiento before insert or update or delete on avisos
  for each row execute function fn_bloqueo_mantenimiento();

-- ---- Crear un aviso (solo desde los triggers de abajo) ---------------------------------
create or replace function crear_aviso(p_para text, p_cliente uuid, p_transportista uuid, p_tipo text, p_nivel text,
                                       p_titulo text, p_texto text, p_enlace text, p_envio uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_para = 'cliente' and p_cliente is null then return; end if;
  if p_para = 'transportista' and p_transportista is null then return; end if;
  insert into avisos (para, cliente_id, transportista_id, tipo, nivel, titulo, texto, enlace, envio_id)
  values (p_para, case when p_para = 'cliente' then p_cliente end, case when p_para = 'transportista' then p_transportista end,
          p_tipo, p_nivel, left(p_titulo, 200), left(p_texto, 500), p_enlace, p_envio);
end $$;
revoke execute on function crear_aviso(text, uuid, uuid, text, text, text, text, text, uuid) from public, anon, authenticated;

-- Importe en euros a la española: 1234.5 → «1.234,50 €».
create or replace function euros_txt(p numeric)
returns text language sql immutable as $$
  select case when p is null then '—'
              else translate(to_char(p, 'FM999,999,990.00'), ',.', '.,') || ' €' end
$$;

-- ---- Envíos ----------------------------------------------------------------------------
create or replace function fn_avisos_envios()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rol text := (select rol::text from usuarios where id = auth.uid());
  v_dynamo boolean := coalesce(v_rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura'), false);
  v_por_cliente boolean := coalesce(v_rol = 'cliente', false);
  v_ref text := '#' || coalesce(new.referencia_gx, '');
  v_cli text;
  v_enl text := '/panel/envios?ver=' || new.id;
  o_sol text; o_est estado_envio; o_cam text; o_pago text; o_tr uuid;
begin
  if coalesce(new.es_manual, false) then return null; end if;
  select nombre_visible into v_cli from clientes where id = new.cliente_id;
  v_cli := coalesce(v_cli, 'El cliente');
  if tg_op = 'UPDATE' then
    o_sol := old.solicitud_estado; o_est := old.estado; o_cam := old.cambio_cliente_estado; o_pago := old.pago_previo; o_tr := old.transportista_id;
  end if;

  -- Solicitudes de precio y contraofertas del cliente.
  if new.solicitud_estado is distinct from o_sol then
    if new.solicitud_estado = 'pendiente_precio' then
      perform crear_aviso('dynamo', null, null, 'solicitud', 'aviso', 'Solicitud de precio · ' || v_ref,
        v_cli || case when o_sol = 'precio_propuesto' then ' vuelve a pedir precio (el anterior caducó).' else ' pide precio para un envío.' end, v_enl, new.id);
    elsif new.solicitud_estado = 'precio_propuesto' then
      if o_sol = 'contraoferta' then
        perform crear_aviso('cliente', new.cliente_id, null, 'contraoferta_rechazada', 'aviso', 'Tu propuesta de precio no se ha aceptado · ' || v_ref,
          'Puedes aceptar nuestro precio (' || euros_txt(new.importe_cliente) || ' + IVA) o cancelar sin coste.', v_enl, new.id);
      else
        perform crear_aviso('cliente', new.cliente_id, null, 'precio', 'ok', 'Ya tienes precio · envío ' || v_ref,
          euros_txt(new.importe_cliente) || ' + IVA. Revísalo y acéptalo antes de que caduque.', v_enl, new.id);
      end if;
    elsif new.solicitud_estado = 'contraoferta' then
      perform crear_aviso('dynamo', null, null, 'contraoferta_cliente', 'aviso', 'Contraoferta del cliente · ' || v_ref,
        v_cli || ' propone ' || euros_txt(new.contraoferta_cliente) || ' (le dimos ' || euros_txt(new.importe_cliente) || ').', v_enl, new.id);
    elsif new.solicitud_estado = 'aceptada' and o_sol = 'contraoferta' then
      perform crear_aviso('cliente', new.cliente_id, null, 'contraoferta_aceptada', 'ok', 'Aceptamos tu precio · ' || v_ref,
        'Tu envío queda confirmado a ' || euros_txt(new.importe_cliente) || ' + IVA.', v_enl, new.id);
    end if;
  end if;

  -- El cliente confirma su envío.
  if tg_op = 'UPDATE' and o_est = 'borrador' and new.estado = 'programado' and v_por_cliente then
    perform crear_aviso('dynamo', null, null, 'confirmado', 'info', 'Envío confirmado · ' || v_ref,
      v_cli || ' lo ha confirmado' || case when new.pago_previo = 'pendiente' then ' (pendiente de pago).' else '.' end, v_enl, new.id);
  end if;

  -- Cambios pedidos por el cliente.
  if new.cambio_cliente_estado is distinct from o_cam then
    if new.cambio_cliente_estado = 'pendiente' then
      perform crear_aviso('dynamo', null, null, 'cambio', 'aviso', 'Cambio pedido · ' || v_ref, v_cli || ' pide un cambio en su envío.', v_enl, new.id);
    elsif new.cambio_cliente_estado in ('aceptado', 'rechazado') then
      perform crear_aviso('cliente', new.cliente_id, null, 'cambio_' || new.cambio_cliente_estado,
        case when new.cambio_cliente_estado = 'aceptado' then 'ok' else 'aviso' end,
        'Tu cambio ha sido ' || new.cambio_cliente_estado || ' · ' || v_ref, new.cambio_cliente_nota, v_enl, new.id);
    end if;
  end if;

  -- Pago por adelantado.
  if tg_op = 'UPDATE' and o_pago = 'pendiente' and new.pago_previo = 'pagado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'pagado', 'ok', 'Pago recibido · ' || v_ref, 'Gracias. Ya buscamos camión para tu envío.', v_enl, new.id);
    if not v_dynamo then
      perform crear_aviso('dynamo', null, null, 'pagado', 'ok', 'Pago recibido · ' || v_ref,
        v_cli || ' ha pagado' || case when new.pago_metodo = 'stripe' then ' con tarjeta.' else '.' end || ' Ya se puede asignar.', v_enl, new.id);
    end if;
  elsif tg_op = 'UPDATE' and o_pago = 'pendiente' and new.pago_previo = 'exento' then
    perform crear_aviso('cliente', new.cliente_id, null, 'exento', 'ok', 'Ya no hace falta pagar por adelantado · ' || v_ref, 'Lo pagarás a tu plazo habitual.', v_enl, new.id);
  end if;

  -- Transportista asignado.
  if tg_op = 'UPDATE' and new.transportista_id is not null and new.transportista_id is distinct from o_tr and new.estado <> 'cancelado' then
    perform crear_aviso('cliente', new.cliente_id, null, 'asignado', 'ok', 'Tu envío ya tiene transportista · ' || v_ref, null, v_enl, new.id);
    perform crear_aviso('transportista', null, new.transportista_id, 'asignada', 'ok', 'Carga asignada · ' || v_ref,
      'Revisa los datos y la orden de carga.', v_enl, new.id);
  end if;

  -- En ruta, entregado, cancelado.
  if tg_op = 'UPDATE' and new.estado is distinct from o_est then
    if new.estado = 'en_ruta' then
      perform crear_aviso('cliente', new.cliente_id, null, 'en_ruta', 'info', 'Cargado y en ruta · ' || v_ref, null, v_enl, new.id);
    elsif new.estado = 'entregado' then
      perform crear_aviso('cliente', new.cliente_id, null, 'entregado', 'ok', 'Entregado · ' || v_ref, null, v_enl, new.id);
    elsif new.estado = 'cancelado' then
      if v_por_cliente then
        perform crear_aviso('dynamo', null, null, 'cancelado', case when o_tr is not null then 'urgente' else 'aviso' end,
          'Cancelado por el cliente · ' || v_ref,
          v_cli || ' lo ha cancelado' || case when o_tr is not null then '. Tenía camión: avisa al transportista.' else '.' end, v_enl, new.id);
      elsif o_est <> 'borrador' then
        perform crear_aviso('cliente', new.cliente_id, null, 'cancelado', 'aviso', 'Envío cancelado · ' || v_ref,
          'Si no lo esperabas, llámanos al +34 955 225 945.', v_enl, new.id);
      end if;
      if o_tr is not null then
        perform crear_aviso('transportista', null, o_tr, 'cancelada', 'urgente', 'Carga cancelada · ' || v_ref,
          'No vayas a cargar. Si tienes dudas, llámanos al +34 955 225 945.', null, new.id);
      end if;
    end if;
  end if;
  return null;
end $$;
revoke execute on function fn_avisos_envios() from public, anon, authenticated;
create trigger tg_avisos_envios after insert or update on envios
  for each row execute function fn_avisos_envios();

-- ---- Contraofertas y aceptaciones del transportista ------------------------------------
create or replace function fn_avisos_reservas()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ref text; v_tr text; v_enl text := '/panel/envios?ver=' || new.envio_id;
begin
  if new.estado = old.estado then return null; end if;
  select '#' || coalesce(referencia_gx, '') into v_ref from envios where id = new.envio_id;
  select nombre_visible into v_tr from transportistas where id = new.transportista_id;
  v_tr := coalesce(v_tr, 'Un transportista');
  if old.estado = 'viva' and new.estado = 'pendiente_revision' then
    perform crear_aviso('dynamo', null, null, 'contraoferta_transportista', 'aviso', 'Contraoferta de transportista · ' || v_ref,
      v_tr || ' propone ' || euros_txt(new.precio_propuesto) || '.', v_enl, new.envio_id);
  elsif old.estado = 'viva' and new.estado = 'aceptada' then
    perform crear_aviso('dynamo', null, null, 'carga_aceptada', 'ok', 'Carga aceptada · ' || v_ref,
      v_tr || ' la acepta a ' || euros_txt(new.precio_aceptado) || '.', v_enl, new.envio_id);
  elsif old.estado = 'pendiente_revision' and new.estado = 'aceptada' then
    perform crear_aviso('transportista', null, new.transportista_id, 'contraoferta_aceptada', 'ok', 'Aceptamos tu precio · carga ' || v_ref,
      'La carga es tuya a ' || euros_txt(new.precio_aceptado) || '.', v_enl, new.envio_id);
  elsif old.estado = 'pendiente_revision' and new.estado = 'rechazada' then
    perform crear_aviso('transportista', null, new.transportista_id, 'contraoferta_rechazada', 'aviso', 'Tu contraoferta no ha salido · carga ' || v_ref,
      case when new.motivo_cierre is not null then upper(left(new.motivo_cierre, 1)) || substr(new.motivo_cierre, 2) || '.' end, null, new.envio_id);
  end if;
  return null;
end $$;
revoke execute on function fn_avisos_reservas() from public, anon, authenticated;
create trigger tg_avisos_reservas after update of estado on envio_reservas
  for each row execute function fn_avisos_reservas();

-- ---- Incidencias nuevas (de clientes y transportistas) ---------------------------------
create or replace function fn_avisos_incidencias()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol text := (select rol::text from usuarios where id = auth.uid()); v_tipo text; v_ref text; v_quien text;
begin
  if coalesce(v_rol in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura'), false) then return null; end if;
  select clave into v_tipo from tipos_incidencia where id = new.tipo_id;
  if new.envio_id is not null then select ' · #' || coalesce(referencia_gx, '') into v_ref from envios where id = new.envio_id; end if;
  v_quien := case when v_rol = 'transportista' then (select nombre_visible from transportistas where id = new.transportista_id)
                  else (select nombre_visible from clientes where id = new.cliente_id) end;
  perform crear_aviso('dynamo', null, null, case when v_tipo = 'siniestro' then 'siniestro' else 'incidencia' end,
    case when v_tipo = 'siniestro' or new.prioridad::text in ('alta', 'critica') then 'urgente' else 'aviso' end,
    case when v_tipo = 'siniestro' then 'SINIESTRO' else 'Incidencia nueva' end || coalesce(v_ref, ''),
    coalesce(v_quien || ': ', '') || new.titulo, '/panel/incidencias', new.envio_id);
  return null;
end $$;
revoke execute on function fn_avisos_incidencias() from public, anon, authenticated;
create trigger tg_avisos_incidencias after insert on incidencias
  for each row execute function fn_avisos_incidencias();

-- ---- Cuentas suspendidas por la regla automática ----------------------------------------
create or replace function fn_avisos_usuarios()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado <> 'suspendida' and new.estado = 'suspendida'
     and coalesce(current_setting('dynamo.autosusp', true), '') = 'on' then
    perform crear_aviso('dynamo', null, null, 'suspendida', 'aviso', 'Cuenta suspendida automáticamente',
      coalesce(new.nombre, new.email) || ' (' || new.email || ')' || coalesce(': ' || new.suspension_motivo, '') || '.', '/panel/usuarios', null);
  end if;
  return null;
end $$;
revoke execute on function fn_avisos_usuarios() from public, anon, authenticated;
create trigger tg_avisos_usuarios after update of estado on usuarios
  for each row execute function fn_avisos_usuarios();

-- ---- Leer y marcar como vistos ------------------------------------------------------------
-- Dynamo ve los suyos; con «Ver como» (p_cliente / p_transportista) ve los de esa empresa.
create or replace function mis_avisos(p_cliente uuid default null, p_transportista uuid default null)
returns table (id uuid, tipo text, nivel text, titulo text, texto text, enlace text, creado_en timestamptz, nuevo boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_desde timestamptz := (select visto_en from avisos_vistos where usuario_id = auth.uid());
        v_cli uuid; v_tr uuid; v_para text;
begin
  if auth.uid() is null then return; end if;
  if ve_todo() then
    if p_cliente is not null then v_para := 'cliente'; v_cli := p_cliente;
    elsif p_transportista is not null then v_para := 'transportista'; v_tr := p_transportista;
    else v_para := 'dynamo'; end if;
  else
    v_cli := cliente_del_usuario(); v_tr := transportista_del_usuario();
    if v_cli is not null then v_para := 'cliente'; elsif v_tr is not null then v_para := 'transportista'; else return; end if;
  end if;
  return query
    select a.id, a.tipo, a.nivel, a.titulo, a.texto, a.enlace, a.creado_en, a.creado_en > coalesce(v_desde, '-infinity'::timestamptz)
      from avisos a
     where a.para = v_para
       and (v_para <> 'cliente' or a.cliente_id = v_cli)
       and (v_para <> 'transportista' or a.transportista_id = v_tr)
       and a.creado_en > now() - interval '60 days'
     order by a.creado_en desc
     limit 30;
end $$;
revoke execute on function mis_avisos(uuid, uuid) from public, anon;
grant execute on function mis_avisos(uuid, uuid) to authenticated;

create or replace function marcar_avisos_vistos()
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into avisos_vistos (usuario_id, visto_en) values (auth.uid(), now())
  on conflict (usuario_id) do update set visto_en = excluded.visto_en;
end $$;
revoke execute on function marcar_avisos_vistos() from public, anon;
grant execute on function marcar_avisos_vistos() to authenticated;

-- Limpieza: los avisos de más de 90 días se borran cada noche.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('dynamo-avisos-limpieza', '41 4 * * *', $c$delete from public.avisos where creado_en < now() - interval '90 days'$c$);
    exception when others then
      raise notice 'No se pudo programar la limpieza de avisos (%).', sqlerrm;
    end;
  end if;
end $$;
