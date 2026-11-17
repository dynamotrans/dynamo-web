-- El interruptor «Recibe los avisos» de las personas de contacto del CLIENTE no lo leía
-- ningún email. Queda conectado así (usuario, 2026-11-17):
--   · Rol LOGÍSTICA (trafico) con «Recibe los avisos»: todos los emails de los envíos de su
--     empresa, igual que un usuario (creado, confirmado, matrículas, modificado, cancelado,
--     reactivado, víspera… y el CMR firmado, que manda la web).
--   · Rol CONTABILIDAD con «Recibe los avisos»: lo de pagos — los emails de la línea de
--     crédito, el «envío creado» cuando queda PENDIENTE DE PAGO y el CMR firmado por todas
--     las partes (el albarán). Cuando haya facturas, irán por aquí.
-- No da acceso a la plataforma ni cambia nada del inicio de sesión: solo añade direcciones.

-- ---- 1. Ayudantes ---------------------------------------------------------------------------
create or replace function fn_unir_emails(variadic p_listas text[])
returns text language sql immutable set search_path = public as $$
  select string_agg(distinct lower(btrim(x)), ',')
    from unnest(p_listas) as l(lista)
    cross join lateral unnest(string_to_array(coalesce(l.lista, ''), ',')) as x
   where nullif(btrim(x), '') is not null
$$;
revoke execute on function fn_unir_emails(text[]) from public, anon, authenticated;
comment on function public.fn_unir_emails(text[]) is '[Ayudantes internos] Junta varias listas de emails separadas por comas en una sola, en minúsculas y sin repetidos. Vacío (null) si no queda ninguno. Quién: nadie la llama desde fuera; la usan las funciones que preparan emails. Argumentos: p_listas: las listas a juntar (admite vacías).';

create or replace function emails_contactos_cliente(p_cliente uuid, p_funcion funcion_contacto)
returns text language sql stable security definer set search_path = public as $$
  select string_agg(distinct lower(btrim(c.email)), ',')
    from contactos c
   where c.cliente_id = p_cliente and c.recibe_avisos and c.funcion = p_funcion
     and nullif(btrim(c.email), '') is not null
$$;
revoke execute on function emails_contactos_cliente(uuid, funcion_contacto) from public, anon, authenticated;
comment on function public.emails_contactos_cliente(uuid, funcion_contacto) is '[Gestión interna] Emails de las personas de contacto de un cliente que tienen puesto «Recibe los avisos» y ese rol (trafico = Logística · contabilidad), separados por comas. Vacío (null) si no hay ninguna. Quién: nadie la llama desde fuera; la usan las funciones que preparan emails. Argumentos: p_cliente: el cliente · p_funcion: el rol del contacto.';

-- ---- 2. Emails de los envíos: también a Logística ------------------------------------------
create or replace function emails_cliente_envio(p_envio uuid)
returns text language sql stable security definer set search_path = public as $$
  select fn_unir_emails(
    coalesce(
      -- El usuario (o usuarios) del cliente del envío, con sus emails de copia.
      (select string_agg(distinct x.email, ',')
         from envios e
         join usuarios u on u.cliente_id = e.cliente_id and u.rol = 'cliente' and u.estado in ('activa', 'suspendida')
         cross join lateral unnest(array[u.email::text] || coalesce(u.emails_copia_avisos::text[], '{}')) as x(email)
        where e.id = p_envio and nullif(btrim(x.email), '') is not null),
      -- Sin usuario del cliente: quien creó el envío.
      (select array_to_string(array[u.email::text] || coalesce(u.emails_copia_avisos::text[], '{}'), ',')
         from envios e join usuarios u on u.id = e.creado_por where e.id = p_envio)),
    -- Y las personas de contacto de Logística del cliente que reciben los avisos.
    (select emails_contactos_cliente(e.cliente_id, 'trafico') from envios e where e.id = p_envio))
$$;
revoke execute on function emails_cliente_envio(uuid) from public, anon, authenticated;
comment on function public.emails_cliente_envio(uuid) is '[Gestión interna] Direcciones a las que se escribe al cliente sobre un envío, separadas por comas y sin repetir: el usuario del cliente del envío (activo o en solo lectura) con sus emails de copia —o, si el cliente no tiene usuario, quien creó el envío— y además sus personas de contacto de Logística que tienen puesto «Recibe los avisos». Quién: nadie la llama desde fuera; la usan las funciones que preparan los emails del envío. Argumentos: p_envio: el envío.';

-- ---- 3. Emails de la empresa (crédito): también a Contabilidad -----------------------------
create or replace function emails_del_cliente(p_cliente uuid)
returns text language sql stable security definer set search_path = public as $$
  select fn_unir_emails(
    (select string_agg(distinct x.email, ',')
       from usuarios u
       cross join lateral unnest(array[u.email::text] || coalesce(u.emails_copia_avisos::text[], '{}')) as x(email)
      where u.cliente_id = p_cliente and u.rol = 'cliente' and u.estado in ('activa', 'suspendida')
        and nullif(btrim(x.email), '') is not null),
    emails_contactos_cliente(p_cliente, 'contabilidad'))
$$;
revoke execute on function emails_del_cliente(uuid) from public, anon, authenticated;
comment on function public.emails_del_cliente(uuid) is '[Gestión interna] Direcciones a las que se escribe a un cliente sobre pagos y crédito, separadas por comas y sin repetir: sus usuarios (activos o en solo lectura) con sus emails de copia y sus personas de contacto de Contabilidad que tienen puesto «Recibe los avisos». Vacío (null) si no hay ninguna. Quién: nadie la llama desde fuera; la usan los emails de la línea de crédito. Argumentos: p_cliente: el cliente.';

-- ---- 4. «Envío creado» pendiente de pago: también a Contabilidad ---------------------------
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.fn_email_envio_cliente(uuid, text, text, text, text)'::regprocedure);
  n := replace(v, 'v_para := emails_cliente_envio(p_envio);',
    'v_para := emails_cliente_envio(p_envio);
  -- Pendiente de pago: el aviso de «envío creado» va también a Contabilidad.
  if p_tipo = ''envio_creado'' and exists (select 1 from envios x where x.id = p_envio and x.estado_pago_previo = ''pendiente'') then
    v_para := fn_unir_emails(v_para, (select emails_contactos_cliente(x.cliente_id, ''contabilidad'') from envios x where x.id = p_envio));
  end if;');
  if n = v then raise exception 'fn_email_envio_cliente: no encuentro dónde elige los destinatarios'; end if;
  execute n;
end $$;

-- Lo que la web necesita para el CMR firmado por todas las partes (lo manda ella).
create or replace function emails_contabilidad_envio(p_envio uuid)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and not es_equipo_dynamo() then
    raise exception 'Solo Dynamo prepara los emails de un envío.' using errcode = '42501';
  end if;
  return (select emails_contactos_cliente(e.cliente_id, 'contabilidad') from envios e where e.id = p_envio);
end $$;
revoke execute on function emails_contabilidad_envio(uuid) from public, anon;
grant execute on function emails_contabilidad_envio(uuid) to authenticated, service_role;
comment on function public.emails_contabilidad_envio(uuid) is '[Envíos] Emails de las personas de contacto de Contabilidad del cliente de un envío que tienen puesto «Recibe los avisos», separados por comas (null si no hay). La usa la web para mandarles el CMR firmado por todas las partes. Quién: Dynamo o el servidor. Argumentos: p_envio: el envío.';
