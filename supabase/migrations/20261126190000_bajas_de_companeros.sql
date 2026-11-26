-- BAJA DE UN COMPAÑERO (usuario, 2026-11-26). Un usuario no borra a otro. Si no hay acceso a
-- una cuenta (un empleado que se ha ido…), otro usuario de la misma empresa puede SOLICITAR su
-- baja: la cuenta afectada queda SUSPENDIDA al momento (sin acceso) y su dueño recibe un email
-- para que llame a Dynamo si no la reconoce. Dynamo lo confirma por teléfono o email y decide:
-- baja definitiva o rehabilitarla (si era un intento de fraude). Todo queda registrado.
-- La empresa también puede pedirla por teléfono o email: entonces la hace Dynamo desde Usuarios.

create table public.solicitudes_baja (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  transportista_id uuid references public.transportistas(id) on delete cascade,
  solicitada_por uuid references public.usuarios(id) on delete set null,
  motivo text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'baja', 'rehabilitada')),
  estado_anterior public.estado_cuenta not null,
  creada_en timestamptz not null default now(),
  resuelta_por uuid references public.usuarios(id) on delete set null,
  resuelta_en timestamptz,
  nota text
);
create unique index ux_solicitudes_baja_pendiente on public.solicitudes_baja (usuario_id) where estado = 'pendiente';
create index ix_solicitudes_baja_estado on public.solicitudes_baja (estado, creada_en);
alter table public.solicitudes_baja enable row level security;
create policy solicitudes_baja_dynamo on public.solicitudes_baja for select using ((select ve_todo()));
revoke all on public.solicitudes_baja from anon;
create trigger tg_mantenimiento before insert or update or delete on public.solicitudes_baja
  for each row execute function public.fn_bloqueo_mantenimiento();
comment on table public.solicitudes_baja is 'Bajas de usuarios pedidas por un compañero de su empresa: la cuenta queda suspendida al momento y Dynamo decide (baja definitiva o rehabilitar). Registro de quién la pidió, por qué, quién la resolvió y cuándo. Solo la escriben sus funciones; la lee Dynamo.';
comment on column public.solicitudes_baja.id is 'formato: identificador (uuid) | rango: no aplica | lista: no aplica | automático | Identificador.';
comment on column public.solicitudes_baja.usuario_id is 'formato: identificador (uuid) | rango: no aplica | lista: no aplica | obligatorio | La cuenta cuya baja se pide.';
comment on column public.solicitudes_baja.cliente_id is 'formato: identificador (uuid) | rango: no aplica | lista: no aplica | opcional | Su empresa si es cliente.';
comment on column public.solicitudes_baja.transportista_id is 'formato: identificador (uuid) | rango: no aplica | lista: no aplica | opcional | Su empresa si es transportista.';
comment on column public.solicitudes_baja.solicitada_por is 'formato: identificador (uuid) | rango: no aplica | lista: no aplica | opcional | Compañero que la pidió.';
comment on column public.solicitudes_baja.motivo is 'formato: texto | rango: no aplica | lista: no aplica | obligatorio | Por qué la pide.';
comment on column public.solicitudes_baja.estado is 'formato: lista | rango: no aplica | lista: pendiente, baja, rehabilitada | automático | Pendiente de Dynamo, baja confirmada o cuenta rehabilitada.';
comment on column public.solicitudes_baja.estado_anterior is 'formato: lista | rango: no aplica | lista: activa, suspendida | automático | Estado de la cuenta antes de suspenderla (al rehabilitarla vuelve a él).';
comment on column public.solicitudes_baja.creada_en is 'formato: fecha y hora | rango: no aplica | lista: no aplica | automático | Cuándo se pidió.';
comment on column public.solicitudes_baja.resuelta_por is 'formato: identificador (uuid) | rango: no aplica | lista: no aplica | opcional | Quién de Dynamo la resolvió.';
comment on column public.solicitudes_baja.resuelta_en is 'formato: fecha y hora | rango: no aplica | lista: no aplica | opcional | Cuándo se resolvió.';
comment on column public.solicitudes_baja.nota is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Lo que comprobó Dynamo (llamada, email…).';

-- El paso de la cuenta a suspendida lo hace la función, no el compañero (él no puede tocar estados).
create or replace function public.baja_companero_en_curso(o usuarios, n usuarios)
returns boolean language sql stable set search_path = public as $$
  select coalesce(current_setting('dynamo.baja_companero', true), '') = n.id::text
     and o.id = n.id and n.id <> auth.uid()
     and o.estado in ('activa', 'suspendida') and n.estado = 'suspendida_total'
     and n.suspension_motivo like 'Baja solicitada por un compañero%'
     and (n.rol, n.cliente_id, n.transportista_id, n.limite_consultas_precio_diario, n.limite_envios_diario,
          n.exento_autosuspension, n.autosuspension_desde_en, n.email, n.emails_copia_avisos, n.anotaciones)
         is not distinct from
         (o.rol, o.cliente_id, o.transportista_id, o.limite_consultas_precio_diario, o.limite_envios_diario,
          o.exento_autosuspension, o.autosuspension_desde_en, o.email, o.emails_copia_avisos, o.anotaciones)
$$;
revoke execute on function public.baja_companero_en_curso(usuarios, usuarios) from public, anon, authenticated;
comment on function public.baja_companero_en_curso(usuarios, usuarios) is '[Gestión interna] Verdadero solo durante solicitar_baja_companero(): deja suspender (sin acceso) la cuenta de un compañero, sin cambiar nada más. Quién: el disparador de usuarios. Argumentos: o, n: la fila antes y después.';

do $$ declare d text := pg_get_functiondef('public.fn_usuarios_campos_protegidos()'::regprocedure); n text; begin
  n := replace(d, 'or alta_propia_en_curso(old, new) then return new; end if;',
                  'or alta_propia_en_curso(old, new) or baja_companero_en_curso(old, new) then return new; end if;');
  if n = d then raise exception 'fn_usuarios_campos_protegidos no tiene el texto esperado'; end if;
  execute n;
end $$;

do $$ declare d text := pg_get_functiondef('public.fn_usuarios_aa_autosusp()'::regprocedure); n text; begin
  n := replace(d, 'and not baja_propia_en_curso(old, new) then',
                  'and not baja_propia_en_curso(old, new) and not baja_companero_en_curso(old, new) then');
  if n = d then raise exception 'fn_usuarios_aa_autosusp no tiene el texto esperado'; end if;
  execute n;
end $$;

-- Los compañeros de mi empresa (solo lo justo para «Tu equipo»).
create or replace function public.mis_companeros()
returns table (id uuid, nombre text, email text, estado public.estado_cuenta, soy_yo boolean, baja_pendiente boolean)
language sql stable security definer set search_path = public as $$
  select u.id, u.nombre, u.email, u.estado, u.id = auth.uid(),
         exists (select 1 from solicitudes_baja b where b.usuario_id = u.id and b.estado = 'pendiente')
    from usuarios me
    join usuarios u on (me.cliente_id is not null and u.cliente_id = me.cliente_id)
                    or (me.transportista_id is not null and u.transportista_id = me.transportista_id)
   where me.id = auth.uid() and me.estado = 'activa' and me.rol in ('cliente', 'transportista')
     and u.estado in ('activa', 'suspendida', 'suspendida_total')
   order by u.id = auth.uid() desc, u.nombre
$$;
revoke execute on function public.mis_companeros() from public, anon;
grant execute on function public.mis_companeros() to authenticated;
comment on function public.mis_companeros() is '[Clientes y cuentas] Los usuarios de la empresa de quien llama (nombre, email, estado, si es él y si tiene una baja pedida), para «Tu equipo» de Mi cuenta. Quién: usuario activo de un cliente o transportista. Argumentos: sin argumentos.';

create or replace function public.solicitar_baja_companero(p_usuario uuid, p_motivo text)
returns text language plpgsql security definer set search_path = public as $$
declare me record; u record; v_empresa text;
begin
  select * into me from usuarios where id = auth.uid();
  if not found or me.estado <> 'activa' or me.rol not in ('cliente', 'transportista') then
    raise exception 'Solo un usuario activo de la empresa puede pedir una baja.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escribe el motivo.'; end if;
  if p_usuario = me.id then return 'eres_tu'; end if;
  select * into u from usuarios where id = p_usuario for update;
  if not found or not coalesce((me.cliente_id is not null and u.cliente_id = me.cliente_id) or (me.transportista_id is not null and u.transportista_id = me.transportista_id), false) then
    raise exception 'Ese usuario no es de tu empresa.' using errcode = '42501';
  end if;
  if exists (select 1 from solicitudes_baja where usuario_id = u.id and estado = 'pendiente') then return 'ya_pedida'; end if;
  if u.estado not in ('activa', 'suspendida') then return 'no_activa'; end if;
  insert into solicitudes_baja (usuario_id, cliente_id, transportista_id, solicitada_por, motivo, estado_anterior)
  values (u.id, u.cliente_id, u.transportista_id, me.id, btrim(p_motivo), u.estado);
  perform set_config('dynamo.baja_companero', u.id::text, true);
  update usuarios set estado = 'suspendida_total', suspendida_en = now(),
         suspension_motivo = 'Baja solicitada por un compañero de la empresa (pendiente de confirmar por Dynamo)'
   where id = u.id;
  perform set_config('dynamo.baja_companero', '', true);
  select coalesce((select c.razon_social from clientes c where c.id = u.cliente_id), (select t.razon_social from transportistas t where t.id = u.transportista_id)) into v_empresa;
  -- Al afectado: que llame si no la reconoce (por WhatsApp, cuando esté su plantilla).
  if coalesce(u.email, '') <> '' then
    insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
    values ('baja_solicitada:' || u.id || ':' || (extract(epoch from clock_timestamp()) * 1000000)::bigint, 'baja_solicitada', u.email,
      'Tu cuenta de Dynamo está suspendida',
      format('<p>Hola%s:</p><p>Un compañero de <strong>%s</strong> ha pedido la <strong>baja de tu cuenta</strong> en la plataforma de Dynamo y, mientras lo confirmamos, ha quedado <strong>suspendida</strong>.</p><p><strong>Si no reconoces esta solicitud, llámanos cuanto antes</strong> al %s o escríbenos a %s y lo revisamos contigo.</p>',
        coalesce(' ' || escapar_html(nullif(trim(split_part(coalesce(u.nombre, ''), ' ', 1)), '')), ''),
        escapar_html(coalesce(v_empresa, 'tu empresa')), escapar_html(tel_dynamo()), escapar_html(email_dynamo())))
    on conflict (clave) do nothing;
  end if;
  perform crear_aviso('dynamo', null, null, 'baja_cuenta', 'urgente', 'Baja pedida por un compañero · ' || coalesce(u.nombre, u.email),
    format('%s ha pedido la baja de %s (%s). La cuenta queda suspendida: confírmalo por teléfono o email y decide en Altas pendientes.', coalesce(me.nombre, me.email), coalesce(u.nombre, u.email), coalesce(v_empresa, '')),
    '/panel/altas', null);
  return 'ok';
end $$;
revoke execute on function public.solicitar_baja_companero(uuid, text) from public, anon;
grant execute on function public.solicitar_baja_companero(uuid, text) to authenticated;
comment on function public.solicitar_baja_companero(uuid, text) is '[Clientes y cuentas] Un usuario pide la baja de un compañero de su empresa (no la suya): la cuenta queda suspendida al momento y sin acceso, su dueño recibe un email para que llame si no la reconoce y Dynamo un aviso para decidir. Devuelve ok, eres_tu, ya_pedida o no_activa. Quién: usuario activo de un cliente o transportista. Argumentos: p_usuario: usuarios.id del compañero; p_motivo: por qué.';

create or replace function public.resolver_baja(p_solicitud uuid, p_decision text, p_nota text)
returns text language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if not es_equipo_dynamo() then raise exception 'Solo Dynamo resuelve las bajas.' using errcode = '42501'; end if;
  if p_decision not in ('baja', 'rehabilitar') then raise exception 'Decisión no válida.'; end if;
  if length(btrim(coalesce(p_nota, ''))) < 5 then raise exception 'Escribe qué has comprobado.'; end if;
  select * into b from solicitudes_baja where id = p_solicitud for update;
  if not found or b.estado <> 'pendiente' then return 'resuelta'; end if;
  if p_decision = 'baja' then
    update usuarios set suspension_motivo = 'Baja confirmada por Dynamo (pedida por un compañero de la empresa)' where id = b.usuario_id;
  else
    update usuarios set estado = b.estado_anterior, suspendida_en = case when b.estado_anterior = 'activa' then null else suspendida_en end,
           suspension_motivo = case when b.estado_anterior = 'activa' then null else suspension_motivo end
     where id = b.usuario_id;
  end if;
  update solicitudes_baja set estado = case when p_decision = 'baja' then 'baja' else 'rehabilitada' end,
         resuelta_por = auth.uid(), resuelta_en = now(), nota = btrim(p_nota)
   where id = b.id;
  return 'ok';
end $$;
revoke execute on function public.resolver_baja(uuid, text, text) from public, anon;
grant execute on function public.resolver_baja(uuid, text, text) to authenticated;
comment on function public.resolver_baja(uuid, text, text) is '[Clientes y cuentas] Dynamo resuelve una baja pedida por un compañero, tras confirmarla por teléfono o email: baja definitiva (la cuenta sigue sin acceso) o rehabilitar (vuelve como estaba; le llega el email de cuenta reactivada). Queda quién, cuándo y qué comprobó. Devuelve ok o resuelta. Quién: admin o empleado de Dynamo. Argumentos: p_solicitud: solicitudes_baja.id; p_decision: baja o rehabilitar; p_nota: lo comprobado.';

-- El tipo de email nuevo.
do $$ declare v_def text; v_lista text[];
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'emails_enviados_tipo_check' and conrelid = 'emails_enviados'::regclass;
  if position('{' in v_def) > 0 then
    v_lista := string_to_array(substring(v_def from '\{([^}]*)\}'), ',');
  else
    select array_agg(m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(array_length(v_lista, 1), 0) < 30 then
    raise exception 'No se ha podido leer la lista de tipos de email (%): revisar antes de aplicar.', v_def;
  end if;
  select array_agg(distinct x order by x) into v_lista from unnest(v_lista || array['baja_solicitada']) as x;
  alter table emails_enviados drop constraint emails_enviados_tipo_check;
  execute format('alter table emails_enviados add constraint emails_enviados_tipo_check check (tipo = any (%L::text[]))', v_lista);
end $$;
