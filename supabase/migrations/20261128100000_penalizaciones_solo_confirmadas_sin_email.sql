-- PENALIZACIONES: EL CLIENTE SOLO VE LAS CONFIRMADAS, NUNCA POR EMAIL, Y «NUEVAS» EN EL MENÚ
-- (usuario, 2026-11-28): «a clientes/usuarios no se les muestra hasta que el estado sea
-- CONFIRMADA; si está en revisión no se muestra. Nunca se avisa por email de crear penalización,
-- anular, confirmar ni nada: solo en el panel. Cuando está confirmada, ni siquiera sale arriba en
-- avisos/novedades… en la barra lateral tampoco, ni naranja ni nada.»
--   1. El cliente y el transportista solo ven las CONFIRMADAS (mis_penalizaciones y
--      mis_penalizaciones_transportista). Las «en revisión» son cosa de Dynamo.
--   2. Ningún email de penalizaciones (ni al confirmar, ni al anular, ni al borrar). Solo la
--      campana del panel: al confirmarla, y al anularla o borrarla SI ya estaba confirmada (una
--      que nunca vio no se le anuncia anulada).
--   3. Menú lateral: el número naranja de Penalizaciones es, para el cliente y el transportista,
--      cuántas confirmadas NUEVAS tiene (confirmadas desde la última vez que abrió la pantalla).
--      Se apaga al abrir Penalizaciones (marcar_penalizaciones_vistas). Para Dynamo no cambia
--      (las pendientes de confirmar).

-- ---- 1. Cuándo se confirmó --------------------------------------------------------------------
alter table public.penalizaciones add column if not exists confirmada_en timestamptz;
comment on column public.penalizaciones.confirmada_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo quedó confirmada (la pone la base de datos al pasar a confirmada; vacía si no lo está). Con ella se cuentan las penalizaciones NUEVAS del cliente y del transportista en el menú. Ej. OK: 2026-11-28 11:32:13+00 · Ej. mal: vacía en una confirmada';

create or replace function public.fn_penalizaciones_confirmada_en()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.estado = 'confirmada' then
    if tg_op = 'INSERT' or old.estado is distinct from 'confirmada' or new.confirmada_en is null then
      new.confirmada_en := now();
    end if;
  else
    new.confirmada_en := null;
  end if;
  return new;
end $$;
revoke execute on function public.fn_penalizaciones_confirmada_en() from public, anon, authenticated;
comment on function public.fn_penalizaciones_confirmada_en() is '[Gestión interna] Disparador de penalizaciones: apunta en confirmada_en cuándo pasa a confirmada (y la vacía si deja de estarlo). Quién: nadie la llama; la ejecuta la base de datos.';
drop trigger if exists tg_penalizaciones_confirmada_en on public.penalizaciones;
create trigger tg_penalizaciones_confirmada_en before insert or update of estado on public.penalizaciones
  for each row execute function public.fn_penalizaciones_confirmada_en();

-- Las ya confirmadas: su última modificación (sin disparar nada más: ni avisos ni auditoría).
alter table public.penalizaciones disable trigger user;
update public.penalizaciones set confirmada_en = coalesce(modificado_en, creado_en) where estado = 'confirmada' and confirmada_en is null;
alter table public.penalizaciones enable trigger user;

-- ---- 2. Qué ve el cliente y el transportista: solo las confirmadas ------------------------------
create or replace function public.mis_penalizaciones()
returns table(id uuid, codigo text, envio_id uuid, referencia_gx text, tipo text, descripcion text, importe_cliente numeric, estado estado_penalizacion, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.codigo, p.envio_id, e.referencia_gx, t.nombre, p.descripcion,
         p.importe_cliente, p.estado, p.creado_en
    from penalizaciones p
    join envios e             on e.id = p.envio_id
    join tipos_penalizacion t on t.id = p.tipo_id
   where e.cliente_id = cliente_del_usuario()
     and p.importe_cliente > 0
     and p.estado = 'confirmada'
   order by coalesce(p.confirmada_en, p.creado_en) desc
$$;
comment on function public.mis_penalizaciones() is '[Precio y pago] Penalizaciones CONFIRMADAS del cliente que llama (las «en revisión» no las ve: usuario, 2026-11-28; ni las canceladas ni las que no le cobran nada), con su importe al cliente sin IVA, tipo, envío y estado. Quién: cliente. Argumentos: sin argumentos.';

create or replace function public.mis_penalizaciones_transportista()
returns table(id uuid, codigo text, envio_id uuid, referencia_gx text, tipo text, descripcion text, importe_transportista numeric, estado estado_penalizacion, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.codigo, p.envio_id, e.referencia_gx, t.nombre, p.descripcion,
         p.importe_transportista, p.estado, p.creado_en
    from penalizaciones p
    join envios e             on e.id = p.envio_id
    join tipos_penalizacion t on t.id = p.tipo_id
   where e.transportista_id = transportista_del_usuario()
     and p.importe_transportista > 0
     and p.estado = 'confirmada'
   order by coalesce(p.confirmada_en, p.creado_en) desc
$$;
comment on function public.mis_penalizaciones_transportista() is '[Ofertas y transportistas] Penalizaciones CONFIRMADAS del transportista que llama (importes a su favor; las «en revisión» no las ve: usuario, 2026-11-28), con su importe al transportista sin IVA, tipo, envío y estado. Quién: transportista. Argumentos: sin argumentos.';

-- ---- 3. Nunca por email: solo la campana -------------------------------------------------------
create or replace function public.fn_email_penalizacion(p_pen penalizaciones, p_evento text)
returns void language plpgsql security definer set search_path = public as $$
declare e record; v_tipo text; v_ref text;
begin
  if p_evento not in ('confirmada', 'anulada') then return; end if;
  select id, cliente_id, transportista_id, referencia_gx into e from envios where id = p_pen.envio_id;
  if e.id is null then return; end if;
  select nombre into v_tipo from tipos_penalizacion where id = p_pen.tipo_id;
  v_tipo := coalesce(v_tipo, 'Penalización');
  v_ref := ' · #' || coalesce(e.referencia_gx, '');
  if coalesce(p_pen.importe_cliente, 0) > 0 and e.cliente_id is not null then
    perform crear_aviso('cliente', e.cliente_id, null, 'penalizacion', case p_evento when 'anulada' then 'info' else 'aviso' end,
      case p_evento when 'confirmada' then 'Penalización confirmada' else 'Penalización anulada' end || v_ref,
      v_tipo || ': ' || euros_texto(p_pen.importe_cliente) || ' + IVA.'
      || case p_evento when 'confirmada' then ' La tienes en Penalizaciones.' else ' No se te cobrará.' end,
      '/panel/penalizaciones', e.id);
  end if;
  -- Al transportista es un importe A SU FAVOR; en su campana, con la cifra.
  if coalesce(p_pen.importe_transportista, 0) > 0 and e.transportista_id is not null then
    perform crear_aviso('transportista', null, e.transportista_id, 'penalizacion', case p_evento when 'anulada' then 'info' else 'ok' end,
      case p_evento when 'confirmada' then 'Importe a tu favor confirmado' else 'Importe a tu favor anulado' end || v_ref,
      v_tipo || ': ' || euros_texto(p_pen.importe_transportista)
      || case p_evento when 'anulada' then '. Ya no se suma a este envío.' else '. Se suma a lo que te pagamos por este envío.' end,
      '/panel/penalizaciones', e.id);
  end if;
end $$;
revoke execute on function public.fn_email_penalizacion(penalizaciones, text) from public, anon, authenticated;
comment on function public.fn_email_penalizacion(penalizaciones, text) is '[Gestión interna] Avisa en la CAMPANA del panel (nunca por email: usuario, 2026-11-28) de una penalización a quien tiene importe en ella. Cliente: su importe + IVA. Transportista: importe a su favor, con la cifra. Eventos: confirmada y anulada (anulada o borrada, solo si ya estaba confirmada). Quién: nadie la llama desde fuera; la usa el disparador de penalizaciones. Argumentos: p_pen: la fila de la penalización · p_evento: confirmada o anulada.';

create or replace function public.fn_email_penalizaciones()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.estado = 'confirmada' then perform fn_email_penalizacion(old, 'anulada'); end if;
    return null;
  end if;
  if new.estado = 'confirmada' and (tg_op = 'INSERT' or old.estado <> 'confirmada') then
    perform fn_email_penalizacion(new, 'confirmada');
  elsif tg_op = 'UPDATE' and new.estado = 'cancelada' and old.estado = 'confirmada' then
    perform fn_email_penalizacion(old, 'anulada');
  end if;
  return null;
end $$;
revoke execute on function public.fn_email_penalizaciones() from public, anon, authenticated;
comment on function public.fn_email_penalizaciones() is '[Gestión interna] Disparador de penalizaciones: al confirmarse (o nacer confirmada), y al cancelarse o borrarse si estaba confirmada, avisa en la campana a quien tiene importe (fn_email_penalizacion). Nunca por email. Guardarla pendiente, volverla a pendiente o anular una que nunca se confirmó no avisa a nadie (el cliente no la llegó a ver). Quién: nadie la llama; la ejecuta la base de datos.';

-- Los emails de penalizaciones que aún no hayan salido, fuera.
update public.emails_enviados set estado = 'omitido'
 where estado = 'pendiente' and tipo in ('penalizacion', 'penalizacion_anulada', 'penalizacion_revision');

-- ---- 4. «Nuevas» en el menú lateral -------------------------------------------------------------
alter table public.avisos_vistos add column if not exists penalizaciones_vistas_en timestamptz;
comment on column public.avisos_vistos.penalizaciones_vistas_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo abrió por última vez la pantalla de Penalizaciones. Las confirmadas después cuentan como NUEVAS en el menú. Vacío = nunca (cuentan las de los últimos 30 días). Ej. OK: 2026-11-28 11:40:00+00 · Ej. mal: una fecha futura';

create or replace function public.penalizaciones_nuevas()
returns integer language plpgsql stable security definer set search_path = public as $$
declare v_desde timestamptz; v_cli uuid := cliente_del_usuario(); v_tra uuid := transportista_del_usuario();
begin
  if auth.uid() is null or (v_cli is null and v_tra is null) then return 0; end if;
  select penalizaciones_vistas_en into v_desde from avisos_vistos where usuario_id = auth.uid();
  v_desde := greatest(coalesce(v_desde, '-infinity'::timestamptz), now() - interval '30 days');
  if v_cli is not null then
    return (select count(*) from penalizaciones p join envios e on e.id = p.envio_id
             where e.cliente_id = v_cli and p.importe_cliente > 0 and p.estado = 'confirmada' and p.confirmada_en > v_desde);
  end if;
  return (select count(*) from penalizaciones p join envios e on e.id = p.envio_id
           where e.transportista_id = v_tra and p.importe_transportista > 0 and p.estado = 'confirmada' and p.confirmada_en > v_desde);
end $$;
revoke execute on function public.penalizaciones_nuevas() from public, anon;
grant execute on function public.penalizaciones_nuevas() to authenticated;
comment on function public.penalizaciones_nuevas() is '[Avisos y panel] Cuántas penalizaciones confirmadas NUEVAS tiene el cliente o el transportista que llama: confirmadas después de la última vez que abrió Penalizaciones (como mucho, de los últimos 30 días). Es el número naranja del menú. Quién: cliente o transportista (a los demás, 0). Argumentos: sin argumentos.';

create or replace function public.marcar_penalizaciones_vistas()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or (cliente_del_usuario() is null and transportista_del_usuario() is null) then return; end if;
  insert into avisos_vistos (usuario_id, visto_en, penalizaciones_vistas_en) values (auth.uid(), '-infinity', now())
  on conflict (usuario_id) do update set penalizaciones_vistas_en = excluded.penalizaciones_vistas_en;
end $$;
revoke execute on function public.marcar_penalizaciones_vistas() from public, anon;
grant execute on function public.marcar_penalizaciones_vistas() to authenticated;
comment on function public.marcar_penalizaciones_vistas() is '[Avisos y panel] El cliente o el transportista ha abierto Penalizaciones: las confirmadas hasta ahora dejan de contar como nuevas en el menú. Quién: cliente o transportista (a los demás no les hace nada). Argumentos: sin argumentos.';

-- El número del menú: para el cliente y el transportista, las NUEVAS confirmadas (y con «Ver como»,
-- las confirmadas de los últimos 7 días de esa empresa). Para Dynamo, igual que antes.
do $$
declare v_def text := pg_get_functiondef('public.contadores_panel(uuid, uuid)'::regprocedure); v_nuevo text;
begin
  v_nuevo := replace(v_def,
    'where e.cliente_id = p_cliente and p.importe_cliente > 0 and p.estado = ''pendiente_confirmar'')',
    'where e.cliente_id = p_cliente and p.importe_cliente > 0 and p.estado = ''confirmada'' and p.confirmada_en > now() - interval ''7 days'')');
  v_nuevo := replace(v_nuevo,
    'where e.transportista_id = p_transportista and p.importe_transportista > 0 and p.estado = ''pendiente_confirmar'')',
    'where e.transportista_id = p_transportista and p.importe_transportista > 0 and p.estado = ''confirmada'' and p.confirmada_en > now() - interval ''7 days'')');
  v_nuevo := replace(v_nuevo, '(select count(*) from mis_penalizaciones() p where p.estado = ''pendiente_confirmar'')', 'penalizaciones_nuevas()');
  v_nuevo := replace(v_nuevo, '(select count(*) from mis_penalizaciones_transportista() p where p.estado = ''pendiente_confirmar'')', 'penalizaciones_nuevas()');
  if (length(v_def) - length(replace(v_def, 'pendiente_confirmar''', ''))) / length('pendiente_confirmar''') -
     (length(v_nuevo) - length(replace(v_nuevo, 'pendiente_confirmar''', ''))) / length('pendiente_confirmar''') <> 4 then
    raise exception 'contadores_panel: no se han encontrado los 4 contadores de penalizaciones del cliente y del transportista';
  end if;
  execute v_nuevo;
end $$;
