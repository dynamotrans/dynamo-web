-- =====================================================================================
-- MÓVIL (WHATSAPP) OBLIGATORIO Y VERIFICADO CON UN CÓDIGO POR WHATSAPP (usuario, 2026-11-25)
-- =====================================================================================
-- «Más seguro un número móvil: un titular real. Un mail se lo puede crear cualquiera.»
--   · Un solo campo para el usuario: «Móvil (WhatsApp)» (usuarios.telefono). Obligatorio.
--   · Se demuestra con un código de 6 cifras que llega por WhatsApp (plantilla de Meta de
--     tipo «Autenticación»). El email se sigue confirmando como ahora (con él se entra, se
--     recupera la contraseña y llegan las facturas): las dos cosas, verificadas.
--   · Hasta verificarlo, el panel no deja seguir (clientes y transportistas, los nuevos y los
--     de antes, una sola vez). NO hay «No tengo WhatsApp» (usuario, 2026-11-25: «quiero que todos
--     se den de alta por WhatsApp»): quien de verdad no pueda, llama a Dynamo, que lo comprueba
--     por teléfono y lo marca «validado por Dynamo».
--   · Los usuarios que da de alta Dynamo (a mano o subiendo su base de datos: «los conozco»)
--     quedan «validados por Dynamo» y entran solo con el código del email.
--   · Un móvil, una cuenta: un móvil ya verificado en otra cuenta no vale.
--   · Contra abusos: el código caduca a los 10 minutos, 5 intentos, y pocos códigos por hora.
--   · Cambiar el móvil (Mi cuenta) obliga a verificarlo otra vez.
-- Mientras la plantilla no esté puesta en Parámetros (o WhatsApp esté apagado), no se pide:
-- el alta funciona como antes, solo con el email.

insert into public.parametros (clave, valor, descripcion) values
  ('movil_verificar_whatsapp', 'true', 'Móvil verificado: pedir a clientes y transportistas que verifiquen su móvil con un código por WhatsApp antes de seguir (los nuevos al darse de alta y los de antes al entrar, una sola vez). Solo funciona si WhatsApp está encendido y la plantilla del código está puesta.'),
  ('whatsapp_plantilla_codigo', '""', 'WhatsApp: nombre de la plantilla aprobada en Meta, de tipo «Autenticación» y en español, con la que se manda el código de 6 cifras para verificar el móvil (con el botón «Copiar código»). Vacío = no se pide verificar el móvil.')
on conflict (clave) do nothing;

-- ---- 1. Columnas en usuarios ------------------------------------------------------------------
alter table public.usuarios
  add column if not exists telefono_verificado_en timestamptz,
  add column if not exists telefono_verificado_como text check (telefono_verificado_como in ('whatsapp', 'dynamo'));
comment on column public.usuarios.telefono_verificado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo demostró el usuario que el móvil es suyo (código de 6 cifras por WhatsApp). Vacío = sin verificar. Se vacía solo si cambia el móvil.';
comment on column public.usuarios.telefono_verificado_como is 'formato: texto | rango: no aplica | lista: whatsapp · dynamo | automático | Cómo se verificó el móvil: whatsapp = con el código de 6 cifras; dynamo = lo validó el equipo de Dynamo (alta hecha por Dynamo, que conoce al cliente, o comprobado por teléfono en los casos sin WhatsApp). Vacío = sin verificar.';
-- Un móvil verificado, una sola cuenta.
create unique index if not exists usuarios_movil_verificado_unico on public.usuarios (tel_whatsapp(telefono)) where telefono_verificado_en is not null;

-- Cambiar el móvil quita la verificación (salvo cuando lo cambia la propia verificación).
create or replace function public.fn_movil_cambiado()
returns trigger language plpgsql set search_path = public as $$
begin
  if tel_whatsapp(new.telefono) is distinct from tel_whatsapp(old.telefono)
     and new.telefono_verificado_en is not distinct from old.telefono_verificado_en then
    new.telefono_verificado_en := null;
    new.telefono_verificado_como := null;
  end if;
  return new;
end $$;
comment on function public.fn_movil_cambiado() is '[Ayudantes internos] Disparador de usuarios: si cambia el móvil, deja de estar verificado (hay que volver a pedir el código por WhatsApp). Quién: automático. Argumentos: sin argumentos.';
drop trigger if exists tg_movil_cambiado on public.usuarios;
create trigger tg_movil_cambiado before update of telefono on public.usuarios for each row execute function public.fn_movil_cambiado();

-- ---- 2. Los códigos -----------------------------------------------------------------------------
create table if not exists public.movil_codigos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  telefono text not null check (telefono ~ '^\+[1-9][0-9]{6,14}$'),
  codigo_hash text not null check (char_length(codigo_hash) = 64),
  intentos integer not null default 0 check (intentos between 0 and 10),
  caduca_en timestamptz not null,
  usado_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists movil_codigos_usuario on public.movil_codigos (usuario_id, creado_en desc);
create index if not exists movil_codigos_telefono on public.movil_codigos (telefono, creado_en desc);
alter table public.movil_codigos enable row level security;
comment on table public.movil_codigos is 'Códigos de 6 cifras mandados por WhatsApp para verificar el móvil de un usuario. Solo se guarda la huella del código (nunca el código), cuántas veces se ha probado y cuándo caduca (10 minutos). Nadie la lee: solo las funciones de verificar el móvil. Se borran solas a los 30 días.';
comment on column public.movil_codigos.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador del código.';
comment on column public.movil_codigos.usuario_id is 'formato: uuid | rango: no aplica | lista: no aplica | obligatorio | El usuario que lo pidió (usuarios.id).';
comment on column public.movil_codigos.telefono is 'formato: + y cifras con prefijo de país | rango: 7 a 15 cifras | lista: no aplica | obligatorio | El móvil al que se mandó. Ej. OK: +34600111222. Ej. mal: 600 11 12 22.';
comment on column public.movil_codigos.codigo_hash is 'formato: texto (huella SHA-256 en hexadecimal) | rango: 64 caracteres | lista: no aplica | automático | Huella del código, mezclado con el id: el código no se guarda.';
comment on column public.movil_codigos.intentos is 'formato: entero | rango: 0 a 10 | lista: no aplica | automático | Veces que se ha probado un código con este. A los 5 ya no vale.';
comment on column public.movil_codigos.caduca_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Hasta cuándo vale (10 minutos después de mandarlo).';
comment on column public.movil_codigos.usado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se usó bien. Vacío = sin usar.';
comment on column public.movil_codigos.creado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se mandó.';

-- Un móvil vale si: España, 9 cifras que empiezan por 6 o 7; otro país, de 8 a 15 cifras.
create or replace function public.movil_valido(p text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(case when t like '+34%' then t ~ '^\+34[67][0-9]{8}$' else t ~ '^\+[1-9][0-9]{7,14}$' end, false)
    from (select tel_whatsapp(p) as t) x
$$;
comment on function public.movil_valido(text) is '[Ayudantes internos] Dice si un teléfono es un móvil válido para WhatsApp: en España, 9 cifras que empiezan por 6 o 7; en otro país, con su prefijo y de 8 a 15 cifras. Quién: cualquiera. Argumentos: p: el teléfono como esté escrito.';

-- ¿Hay que pedirle verificar el móvil? (el panel lo pregunta al entrar).
create or replace function public.movil_pendiente_verificar(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((parametro('movil_verificar_whatsapp') #>> '{}')::boolean, false)
     and coalesce((parametro('whatsapp_activo') #>> '{}')::boolean, false)
     and coalesce(nullif(btrim(parametro('whatsapp_plantilla_codigo') #>> '{}'), ''), '') <> ''
     and exists (select 1 from usuarios u where u.id = p_usuario and u.rol in ('cliente', 'transportista')
                   and u.telefono_verificado_en is null)
$$;
comment on function public.movil_pendiente_verificar(uuid) is '[Clientes y cuentas] Dice si a ese usuario (cliente o transportista) hay que pedirle que verifique su móvil por WhatsApp antes de seguir: lo pide la plataforma (parámetro), WhatsApp está encendido, la plantilla del código está puesta y aún no lo tiene verificado. Quién: el propio usuario o el servidor. Argumentos: p_usuario: usuarios.id.';
revoke all on function public.movil_pendiente_verificar(uuid) from public, anon;
grant execute on function public.movil_pendiente_verificar(uuid) to authenticated;

-- El servidor prepara un código para el usuario (con su sesión comprobada) y lo manda él.
create or replace function public.movil_preparar_codigo(p_usuario uuid, p_telefono text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tel text := tel_whatsapp(p_telefono); v_ultimo timestamptz; v_n int; v_id uuid := gen_random_uuid(); v_codigo text;
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  if not exists (select 1 from usuarios where id = p_usuario) then return jsonb_build_object('resultado', 'no_existe'); end if;
  if not movil_valido(v_tel) then return jsonb_build_object('resultado', 'no_movil'); end if;
  if exists (select 1 from usuarios where tel_whatsapp(telefono) = v_tel and telefono_verificado_en is not null and id <> p_usuario) then
    return jsonb_build_object('resultado', 'ocupado');
  end if;
  select max(creado_en) into v_ultimo from movil_codigos where usuario_id = p_usuario;
  if v_ultimo > now() - interval '60 seconds' then
    return jsonb_build_object('resultado', 'espera', 'segundos', ceil(extract(epoch from (v_ultimo + interval '60 seconds' - now())))::int);
  end if;
  select count(*) into v_n from movil_codigos where (usuario_id = p_usuario or telefono = v_tel) and creado_en > now() - interval '1 hour';
  if v_n >= 5 then return jsonb_build_object('resultado', 'demasiados'); end if;
  -- 6 cifras al azar (del generador seguro de uuid), y solo se guarda su huella.
  v_codigo := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into movil_codigos (id, usuario_id, telefono, codigo_hash, caduca_en)
  values (v_id, p_usuario, v_tel, encode(sha256(convert_to(v_id::text || ':' || v_codigo, 'UTF8')), 'hex'), now() + interval '10 minutes');
  return jsonb_build_object('resultado', 'ok', 'codigo', v_codigo, 'telefono', v_tel);
end $$;
comment on function public.movil_preparar_codigo(uuid, text) is '[Clientes y cuentas] Prepara un código de 6 cifras para verificar el móvil de un usuario (el servidor lo manda por WhatsApp): solo si es un móvil válido y no está verificado en otra cuenta, como mucho uno por minuto y 5 por hora (por usuario y por móvil). Guarda solo la huella; caduca a los 10 minutos. Devuelve {resultado: ok | no_movil | ocupado | espera | demasiados | no_existe, codigo, telefono}. Quién: solo el servidor, con la sesión del usuario ya comprobada. Argumentos: p_usuario: usuarios.id · p_telefono: el móvil.';
revoke all on function public.movil_preparar_codigo(uuid, text) from public, anon, authenticated;
grant execute on function public.movil_preparar_codigo(uuid, text) to service_role;

-- Si Meta no lo pudo mandar, el código no cuenta (así no se gastan los 5 por hora por un fallo).
create or replace function public.movil_codigo_no_enviado(p_usuario uuid)
returns void language sql security definer set search_path = public as $$
  delete from movil_codigos where id = (select id from movil_codigos where usuario_id = p_usuario and usado_en is null order by creado_en desc limit 1)
$$;
comment on function public.movil_codigo_no_enviado(uuid) is '[Clientes y cuentas] Borra el último código preparado para un usuario cuando Meta no lo ha podido mandar, para que no cuente en el límite. Quién: solo el servidor. Argumentos: p_usuario: usuarios.id.';
revoke all on function public.movil_codigo_no_enviado(uuid) from public, anon, authenticated;
grant execute on function public.movil_codigo_no_enviado(uuid) to service_role;

-- El usuario escribe el código que le ha llegado.
create or replace function public.movil_comprobar_codigo(p_codigo text, p_avisos boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; v_codigo text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g'); v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sin sesión.' using errcode = '42501'; end if;
  if char_length(v_codigo) <> 6 then return jsonb_build_object('resultado', 'formato'); end if;
  select * into c from movil_codigos where usuario_id = v_uid and usado_en is null order by creado_en desc limit 1 for update;
  if c.id is null then return jsonb_build_object('resultado', 'sin_codigo'); end if;
  if c.caduca_en < now() then return jsonb_build_object('resultado', 'caducado'); end if;
  if c.intentos >= 5 then return jsonb_build_object('resultado', 'intentos'); end if;
  update movil_codigos set intentos = intentos + 1 where id = c.id;
  if encode(sha256(convert_to(c.id::text || ':' || v_codigo, 'UTF8')), 'hex') <> c.codigo_hash then
    return jsonb_build_object('resultado', 'mal', 'quedan', greatest(0, 4 - c.intentos));
  end if;
  if exists (select 1 from usuarios where tel_whatsapp(telefono) = c.telefono and telefono_verificado_en is not null and id <> v_uid) then
    return jsonb_build_object('resultado', 'ocupado');
  end if;
  update movil_codigos set usado_en = now() where id = c.id;
  update usuarios set telefono = c.telefono, telefono_verificado_en = now(), telefono_verificado_como = 'whatsapp',
         avisos_whatsapp = coalesce(p_avisos, avisos_whatsapp),
         avisos_whatsapp_en = case when p_avisos then now() when p_avisos = false then null else avisos_whatsapp_en end,
         avisos_whatsapp_preguntado_en = case when p_avisos is not null then coalesce(avisos_whatsapp_preguntado_en, now()) else avisos_whatsapp_preguntado_en end
   where id = v_uid;
  return jsonb_build_object('resultado', 'ok', 'telefono', c.telefono);
end $$;
comment on function public.movil_comprobar_codigo(text, boolean) is '[Clientes y cuentas] El usuario escribe el código de 6 cifras que le llegó por WhatsApp: si es el último que pidió, no ha caducado (10 minutos) y no ha gastado los 5 intentos, su móvil queda verificado (y, si lo dice, con los avisos por WhatsApp puestos o quitados). Devuelve {resultado: ok | mal (con quedan) | caducado | intentos | sin_codigo | formato | ocupado}. Quién: el propio usuario con sesión. Argumentos: p_codigo: las 6 cifras · p_avisos: si quiere los avisos de sus envíos también por WhatsApp (vacío = no se toca).';
revoke all on function public.movil_comprobar_codigo(text, boolean) from public, anon;
grant execute on function public.movil_comprobar_codigo(text, boolean) to authenticated;

-- «Validado por Dynamo»: los usuarios que da de alta Dynamo (los conoce) y quien de verdad no puede
-- recibir WhatsApp (llama y Dynamo lo comprueba por teléfono). Solo el equipo, no los de solo lectura.
create or replace function public.movil_validar_por_dynamo(p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record;
begin
  if not ve_todo() or es_solo_lectura() then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  select * into u from usuarios where id = p_usuario;
  if u.id is null then return jsonb_build_object('resultado', 'no_existe'); end if;
  if u.telefono is null or not movil_valido(u.telefono) then return jsonb_build_object('resultado', 'sin_movil'); end if;
  if exists (select 1 from usuarios where tel_whatsapp(telefono) = tel_whatsapp(u.telefono) and telefono_verificado_en is not null and id <> u.id) then
    return jsonb_build_object('resultado', 'ocupado');
  end if;
  update usuarios set telefono_verificado_en = now(), telefono_verificado_como = 'dynamo' where id = u.id;
  return jsonb_build_object('resultado', 'ok');
end $$;
comment on function public.movil_validar_por_dynamo(uuid) is '[Clientes y cuentas] El equipo de Dynamo marca el móvil de un usuario como verificado: al darlo de alta él mismo (lo conoce) o después de comprobarlo por teléfono (quien no puede recibir el código por WhatsApp). Tiene que ser un móvil válido y no estar verificado en otra cuenta. Devuelve {resultado: ok | sin_movil | ocupado | no_existe}. Quién: equipo de Dynamo (no los de solo lectura). Argumentos: p_usuario: usuarios.id.';
revoke all on function public.movil_validar_por_dynamo(uuid) from public, anon;
grant execute on function public.movil_validar_por_dynamo(uuid) to authenticated;

-- ---- 3. Limpieza: los códigos de más de 30 días -----------------------------------------------
do $$ declare v text; v_old text;
begin
  select pg_get_functiondef('public.whatsapp_limpiar()'::regprocedure) into v; v_old := v;
  v := replace(v, $a$  return v_n;$a$, $a$  delete from movil_codigos where creado_en < now() - interval '30 days';
  return v_n;$a$);
  if v = v_old then raise exception 'whatsapp_limpiar: no se ha podido poner al día'; end if;
  execute v;
end $$;

-- ---- 4. El WhatsApp de Dynamo en la plataforma: el número nuevo (usuario, 2026-11-25) ----------
-- «Donde aparece mi WhatsApp, pon el número nuevo de la API de Meta; mi móvil, quítalo de todos
-- los sitios de la plataforma (la web pública todavía no)». Documentos (orden de carga, CMR,
-- proformas) y emails lo sacan de este parámetro; las pantallas, de lib/atencion.ts.
update public.parametros set valor = '"+34 614 52 59 35"', descripcion = 'Móvil / WhatsApp de Dynamo: el número de WhatsApp de la plataforma (API de Meta), el que sale en documentos y emails.'
 where clave = 'dynamo_movil' and valor = '"+34 628 995 709"';
