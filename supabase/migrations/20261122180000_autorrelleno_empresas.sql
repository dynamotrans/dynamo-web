-- AUTORRELLENO DE DATOS FISCALES CON APIEmpresas.es — CONSTRUIDO Y APAGADO (usuario, 2026-11-22:
-- «prográmala ya y la dejas apagada»; antes de producción). Quien da de alta una empresa NUEVA
-- (alta de la web, paso «empresa nueva») o Dynamo al crear un cliente, escribe el CIF o el nombre
-- y se rellenan razón social y domicilio fiscal, siempre editables. Se enciende en Parámetros y
-- con la clave de la API en Vercel (APIEMPRESAS_API_KEY, solo en el servidor).
--  · Lo que devuelve la API se guarda (empresas_registro) para no pagar dos veces la misma: son
--    datos públicos del Registro, NUNCA los de nuestros clientes.
--  · Cada consulta de pago se apunta (empresas_registro_consultas), con tope por usuario y día
--    (Dynamo sin tope) y descontando del saldo del bono; al bajar del aviso, campana + email a
--    Dynamo; al llegar a cero, la API ya no se llama (se rellena a mano).

-- 1. Parámetros -----------------------------------------------------------------------------------
insert into parametros (clave, valor, descripcion) values
  ('autorrelleno_empresas_activo', 'false', 'Autorrelleno de datos fiscales (APIEmpresas.es): true = al dar de alta una empresa nueva (alta de la web o cliente nuevo de Dynamo) se rellenan razón social y dirección desde el Registro. Necesita la clave APIEMPRESAS_API_KEY en Vercel.'),
  ('autorrelleno_empresas_max_dia', '10', 'Autorrelleno de datos fiscales: consultas a la API que puede hacer cada usuario al día (el equipo de Dynamo no tiene tope).'),
  ('autorrelleno_empresas_consultas_restantes', '100', 'Autorrelleno de datos fiscales: consultas que quedan en el bono de APIEmpresas.es. Se descuenta sola con cada consulta; al comprar un bono, súmale sus consultas (p. ej. +1000).'),
  ('autorrelleno_empresas_aviso_restantes', '50', 'Autorrelleno de datos fiscales: cuando queden estas consultas o menos, aviso a Dynamo (campana y email) para comprar otro bono.')
on conflict (clave) do nothing;

-- 2. Lo que devolvió la API, por CIF (para no pagar dos veces) ------------------------------------
create table if not exists empresas_registro (
  cif           text primary key,
  razon_social  text not null,
  direccion     text,
  codigo_postal text,
  poblacion     text,
  provincia     text,
  estado        text,
  consultado_en timestamptz not null default now()
);
comment on table empresas_registro is 'Datos fiscales de empresas tal como los devolvió la API del Registro (APIEmpresas.es) al dar de alta una empresa nueva. Sirve para no pagar dos veces la misma consulta. Son datos públicos del Registro Mercantil: nunca se rellenan con los datos de nuestros clientes. Solo la escribe el servidor.';
comment on column empresas_registro.cif is 'formato: texto, en mayúsculas y sin espacios, puntos ni guiones | rango: 4 a 20 caracteres | lista: no aplica | obligatorio | CIF de la empresa, normalizado. Ej. OK: B12345678 · Ej. mal: b-12.345.678';
comment on column empresas_registro.razon_social is 'formato: texto | rango: 1 a 200 caracteres | lista: no aplica | obligatorio | Razón social según el Registro. Ej. OK: MARBEX INDUSTRIAL SL';
comment on column empresas_registro.direccion is 'formato: texto | rango: hasta 200 caracteres | lista: no aplica | opcional | Calle y número del domicilio social según el Registro. Ej. OK: CALLE EJEMPLO 1';
comment on column empresas_registro.codigo_postal is 'formato: texto | rango: 3 a 12 caracteres | lista: no aplica | opcional | Código postal del domicilio social. Ej. OK: 28001';
comment on column empresas_registro.poblacion is 'formato: texto | rango: hasta 100 caracteres | lista: no aplica | opcional | Población del domicilio social. Ej. OK: MADRID';
comment on column empresas_registro.provincia is 'formato: texto | rango: hasta 100 caracteres | lista: no aplica | opcional | Provincia del domicilio social (en España, la de la lista de 52, sacada del código postal). Ej. OK: Madrid';
comment on column empresas_registro.estado is 'formato: texto | rango: hasta 50 caracteres | lista: lo que diga la API (p. ej. activa, extinguida) | opcional | Situación de la empresa según el Registro. Ej. OK: activa';
comment on column empresas_registro.consultado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo se consultó a la API.';
alter table empresas_registro enable row level security;
-- Sin políticas: solo se lee y escribe por las funciones de abajo.
drop trigger if exists tg_mantenimiento on empresas_registro;
create trigger tg_mantenimiento before insert or update or delete on empresas_registro
  for each row execute function fn_bloqueo_mantenimiento();

-- 3. Cada consulta de pago a la API (tope por usuario y día, y rastro) ----------------------------
create table if not exists empresas_registro_consultas (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios (id) on delete set null,
  tipo       text not null check (tipo in ('cif', 'nombre')),
  texto      text not null,
  creado_en  timestamptz not null default now()
);
create index if not exists empresas_registro_consultas_usuario_idx on empresas_registro_consultas (usuario_id, creado_en);
comment on table empresas_registro_consultas is 'Cada consulta de pago a la API del Registro (APIEmpresas.es) para autorrellenar los datos de una empresa: quién, de qué tipo y qué buscó. Sirve para el tope diario por usuario y para que Dynamo vea el gasto. Solo se añaden.';
comment on column empresas_registro_consultas.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único de la consulta.';
comment on column empresas_registro_consultas.usuario_id is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | automático | Quién hizo la consulta.';
comment on column empresas_registro_consultas.tipo is 'formato: texto | rango: no aplica | lista: cif, nombre | obligatorio | Si se buscó por CIF o por nombre. Ej. OK: cif';
comment on column empresas_registro_consultas.texto is 'formato: texto | rango: 2 a 100 caracteres | lista: no aplica | obligatorio | Lo que se buscó (el CIF normalizado o el nombre). Ej. OK: B12345678';
comment on column empresas_registro_consultas.creado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Fecha y hora de la consulta.';
alter table empresas_registro_consultas enable row level security;
drop policy if exists empresas_registro_consultas_ver on empresas_registro_consultas;
create policy empresas_registro_consultas_ver on empresas_registro_consultas for select using (ve_todo());
drop trigger if exists tg_mantenimiento on empresas_registro_consultas;
create trigger tg_mantenimiento before insert or update or delete on empresas_registro_consultas
  for each row execute function fn_bloqueo_mantenimiento();

-- 4. Tipo de email del aviso de saldo -------------------------------------------------------------
do $$
declare v_def text; v_lista text[];
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
  select array_agg(distinct x order by x) into v_lista from unnest(v_lista || array['autorrelleno_saldo']) as x;
  alter table emails_enviados drop constraint emails_enviados_tipo_check;
  execute format('alter table emails_enviados add constraint emails_enviados_tipo_check check (tipo = any (%L::text[]))', v_lista);
end $$;

-- 5. Funciones ------------------------------------------------------------------------------------
-- ¿Quién puede usarlo? El equipo de Dynamo y quien tiene el alta de cliente pendiente (sin empresa).
create or replace function public.autorrelleno_empresas_quien()
returns text language sql stable security definer set search_path = public as $$
  select case
    when es_equipo_dynamo() then 'dynamo'
    when exists (select 1 from usuarios where id = auth.uid() and estado = 'pendiente_verificacion' and rol = 'cliente' and cliente_id is null) then 'alta'
  end
$$;
revoke execute on function public.autorrelleno_empresas_quien() from public, anon, authenticated;
comment on function public.autorrelleno_empresas_quien() is '[Altas] Quién puede usar el autorrelleno de datos fiscales: «dynamo» (el equipo), «alta» (quien tiene el alta de cliente pendiente y aún sin empresa) o vacío. Quién: funciones internas del autorrelleno. Argumentos: ninguno.';

-- Si está encendido para quien pregunta y cuántas consultas le quedan hoy.
create or replace function public.autorrelleno_empresas_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_quien text := autorrelleno_empresas_quien(); v_max int; v_hoy int;
begin
  if v_quien is null or not coalesce((parametro('autorrelleno_empresas_activo') #>> '{}')::boolean, false) then
    return jsonb_build_object('activo', false);
  end if;
  if v_quien = 'dynamo' then return jsonb_build_object('activo', true, 'quedan_hoy', null); end if;
  v_max := coalesce((parametro('autorrelleno_empresas_max_dia') #>> '{}')::int, 10);
  select count(*) into v_hoy from empresas_registro_consultas
   where usuario_id = auth.uid() and creado_en > now() - interval '24 hours';
  return jsonb_build_object('activo', true, 'quedan_hoy', greatest(v_max - v_hoy, 0));
end $$;
revoke execute on function public.autorrelleno_empresas_estado() from public, anon;
grant execute on function public.autorrelleno_empresas_estado() to authenticated;
comment on function public.autorrelleno_empresas_estado() is '[Altas] Dice si el autorrelleno de datos fiscales está encendido para quien pregunta (equipo de Dynamo o alta de cliente pendiente) y cuántas consultas le quedan en 24 horas (sin tope para Dynamo). Quién: usuarios con sesión (formularios de alta). Argumentos: ninguno.';

-- Lo ya consultado de un CIF (sin coste).
create or replace function public.empresa_registro_guardada(p_cif text)
returns table(cif text, razon_social text, direccion text, codigo_postal text, poblacion text, provincia text, estado text)
language sql stable security definer set search_path = public as $$
  select r.cif, r.razon_social, r.direccion, r.codigo_postal, r.poblacion, r.provincia, r.estado
    from empresas_registro r
   where autorrelleno_empresas_quien() is not null
     and r.cif = normalizar_id_fiscal(p_cif)
$$;
revoke execute on function public.empresa_registro_guardada(text) from public, anon;
grant execute on function public.empresa_registro_guardada(text) to authenticated;
comment on function public.empresa_registro_guardada(text) is '[Altas] Datos del Registro de un CIF que ya se consultaron antes a la API (no cuesta nada). Solo datos públicos del Registro, nunca los de nuestros clientes. Quién: equipo de Dynamo o alta de cliente pendiente. Argumentos: p_cif: el CIF.';

-- Apunta una consulta de PAGO antes de hacerla: comprueba el tope y descuenta del saldo.
create or replace function public.empresa_registro_apuntar_consulta(p_tipo text, p_texto text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_quien text := autorrelleno_empresas_quien(); v_max int; v_hoy int; v_quedan int; v_aviso int; v_texto text;
begin
  if v_quien is null then raise exception 'No puedes usar el autorrelleno de datos de empresas.' using errcode = '42501'; end if;
  if not coalesce((parametro('autorrelleno_empresas_activo') #>> '{}')::boolean, false) then
    raise exception 'autorrelleno_apagado' using errcode = '42501';
  end if;
  if p_tipo not in ('cif', 'nombre') then raise exception 'Tipo de consulta no válido.'; end if;
  v_texto := left(btrim(coalesce(p_texto, '')), 100);
  if length(v_texto) < 2 then raise exception 'Escribe al menos 2 letras.'; end if;
  if v_quien <> 'dynamo' then
    v_max := coalesce((parametro('autorrelleno_empresas_max_dia') #>> '{}')::int, 10);
    select count(*) into v_hoy from empresas_registro_consultas
     where usuario_id = auth.uid() and creado_en > now() - interval '24 hours';
    if v_hoy >= v_max then raise exception 'autorrelleno_tope' using errcode = '42501'; end if;
  end if;
  -- Saldo del bono: con cero, ya no se llama a la API.
  select coalesce((valor #>> '{}')::int, 0) into v_quedan from parametros where clave = 'autorrelleno_empresas_consultas_restantes' for update;
  if coalesce(v_quedan, 0) <= 0 then raise exception 'autorrelleno_sin_saldo' using errcode = '42501'; end if;
  v_quedan := v_quedan - 1;
  update parametros set valor = to_jsonb(v_quedan) where clave = 'autorrelleno_empresas_consultas_restantes';
  insert into empresas_registro_consultas (usuario_id, tipo, texto) values (auth.uid(), p_tipo, v_texto);
  -- Aviso a Dynamo al cruzar el umbral y al llegar a cero (una vez cada vez).
  v_aviso := coalesce((parametro('autorrelleno_empresas_aviso_restantes') #>> '{}')::int, 50);
  if v_quedan = v_aviso or v_quedan = 0 then perform fn_aviso_saldo_autorrelleno(v_quedan); end if;
  return v_quedan;
end $$;
revoke execute on function public.empresa_registro_apuntar_consulta(text, text) from public, anon;
grant execute on function public.empresa_registro_apuntar_consulta(text, text) to authenticated;
comment on function public.empresa_registro_apuntar_consulta(text, text) is '[Altas] Apunta una consulta de pago a la API del Registro ANTES de hacerla: comprueba que el autorrelleno está encendido, el tope diario del usuario (Dynamo sin tope) y que queda saldo en el bono; descuenta una consulta y avisa a Dynamo al llegar al umbral de aviso y a cero. Devuelve las consultas que quedan. Quién: equipo de Dynamo o alta de cliente pendiente (desde el servidor). Argumentos: p_tipo: cif o nombre · p_texto: lo que se busca.';

-- Aviso de saldo a Dynamo: campana y email.
create or replace function public.fn_aviso_saldo_autorrelleno(p_quedan integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_titulo text := case when p_quedan <= 0 then 'Sin consultas en APIEmpresas' else 'Quedan pocas consultas en APIEmpresas' end;
  v_texto text := case when p_quedan <= 0
    then 'Se ha gastado el bono: el autorrelleno de datos de empresas ya no consulta la API (se rellena a mano). Compra otro bono en apiempresas.es y súmalo en Parámetros → Plataforma.'
    else format('Quedan %s consultas del bono de APIEmpresas. Compra otro bono en apiempresas.es y súmalo en Parámetros → Plataforma.', p_quedan) end;
begin
  perform crear_aviso('dynamo', null, null, 'autorrelleno_saldo', case when p_quedan <= 0 then 'urgente' else 'aviso' end,
    v_titulo, v_texto, '/panel/parametros', null);
  insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
  values ('autorrelleno_saldo:' || p_quedan || ':' || to_char(now() at time zone 'utc', 'YYYYMMDD'), 'autorrelleno_saldo', email_dynamo(), v_titulo,
          '<p>Hola,</p><p>' || escapar_html(v_texto) || '</p>')
  on conflict (clave) do nothing;
end $$;
revoke execute on function public.fn_aviso_saldo_autorrelleno(integer) from public, anon, authenticated;
comment on function public.fn_aviso_saldo_autorrelleno(integer) is '[Altas] Avisa a Dynamo (campana y email) de que quedan pocas consultas, o ninguna, en el bono de APIEmpresas. Quién: funciones internas (al apuntar una consulta y cuando la API dice que no hay saldo). Argumentos: p_quedan: consultas que quedan.';

-- La API dice que no hay saldo (aunque nuestro contador diga otra cosa): a cero y aviso.
create or replace function public.empresa_registro_sin_saldo()
returns void language plpgsql security definer set search_path = public as $$
begin
  if autorrelleno_empresas_quien() is null then raise exception 'No puedes usar el autorrelleno de datos de empresas.' using errcode = '42501'; end if;
  update parametros set valor = '0'::jsonb where clave = 'autorrelleno_empresas_consultas_restantes';
  perform fn_aviso_saldo_autorrelleno(0);
end $$;
revoke execute on function public.empresa_registro_sin_saldo() from public, anon;
grant execute on function public.empresa_registro_sin_saldo() to authenticated;
comment on function public.empresa_registro_sin_saldo() is '[Altas] La API del Registro ha contestado que no hay saldo: deja las consultas que quedan a cero y avisa a Dynamo. Quién: equipo de Dynamo o alta de cliente pendiente (desde el servidor). Argumentos: ninguno.';

-- Guardar lo que devolvió la API: SOLO el servidor (con la clave de servicio), para que nadie
-- meta datos falsos que luego se rellenen a otros.
create or replace function public.empresa_registro_guardar(p_cif text, p_razon_social text, p_direccion text, p_codigo_postal text, p_poblacion text, p_provincia text, p_estado text)
returns void language sql security definer set search_path = public as $$
  insert into empresas_registro (cif, razon_social, direccion, codigo_postal, poblacion, provincia, estado, consultado_en)
  select normalizar_id_fiscal(p_cif), left(btrim(p_razon_social), 200), left(nullif(btrim(p_direccion), ''), 200),
         left(nullif(btrim(p_codigo_postal), ''), 12), left(nullif(btrim(p_poblacion), ''), 100),
         left(nullif(btrim(p_provincia), ''), 100), left(nullif(btrim(p_estado), ''), 50), now()
   where nullif(normalizar_id_fiscal(p_cif), '') is not null and nullif(btrim(p_razon_social), '') is not null
  on conflict (cif) do update set razon_social = excluded.razon_social, direccion = excluded.direccion,
    codigo_postal = excluded.codigo_postal, poblacion = excluded.poblacion, provincia = excluded.provincia,
    estado = excluded.estado, consultado_en = excluded.consultado_en
$$;
revoke execute on function public.empresa_registro_guardar(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.empresa_registro_guardar(text, text, text, text, text, text, text) to service_role;
comment on function public.empresa_registro_guardar(text, text, text, text, text, text, text) is '[Altas] Guarda (o renueva) los datos del Registro de un CIF que acaba de devolver la API, para no volver a pagarlos. Quién: solo el servidor con la clave de servicio. Argumentos: p_cif, p_razon_social, p_direccion, p_codigo_postal, p_poblacion, p_provincia, p_estado: lo que devolvió la API.';
