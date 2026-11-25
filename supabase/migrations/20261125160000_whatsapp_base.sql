-- =====================================================================================
-- WHATSAPP, PARTE 1: CONEXIÓN CON META, CONVERSACIONES Y PERMISO (usuario, 2026-11-25)
-- =====================================================================================
-- «Ya tengo de alta un número de teléfono nuevo en Meta… me gustaría configurarlo para que
-- funcione», «usando Claude cerebro, y para mandar notificaciones, las mismas de los mails».
-- Sin n8n: todo dentro de la plataforma (decisión del 2026-11-22). Esta parte pone la base:
--   · Meta entrega cada mensaje al servidor (/api/whatsapp) y aquí se GUARDA ENTERO: Meta no
--     guarda el historial ni deja consultarlo después, y sus archivos caducan a los pocos días.
--   · Cada número es una conversación; se mira quién escribe por su teléfono (usuario cliente o
--     transportista, conductor, persona de contacto de un sitio o desconocido).
--   · El equipo de Dynamo lo ve en «WhatsApp» del panel y contesta a mano. Meta solo deja escribir
--     texto libre en las 24 h siguientes al último mensaje de la persona; fuera de ese plazo hacen
--     falta plantillas aprobadas (parte 2, los avisos).
--   · Permiso de cada usuario para recibir avisos por WhatsApp (casilla en el alta y en Mi cuenta,
--     y una pregunta única a los usuarios de antes): Meta lo exige.
--   · Cuánto se guarda (usuario, 2026-11-25, «me vale»): el TEXTO 2 años; fotos, audios y PDF
--     6 meses, salvo los de un envío con incidencia, que se quedan como el envío.
-- Claude («el cerebro») contesta en la parte 3; los avisos (los mismos emails, por WhatsApp)
-- llegan en la parte 2; las notas de voz pasadas a texto, en la v4.

insert into public.parametros (clave, valor, descripcion) values
  ('whatsapp_activo', 'false', 'WhatsApp: interruptor general de lo que la plataforma MANDA por WhatsApp (respuestas desde el panel y, más adelante, avisos). Apagado no sale nada; los mensajes que llegan se guardan igual. Hacen falta además las claves de Meta en el servidor.'),
  ('whatsapp_movil_dynamo', '""', 'WhatsApp: móvil del equipo de Dynamo que recibe por WhatsApp los avisos urgentes (transferencia avisada, incidencias…), con prefijo de país. Vacío = no se mandan.'),
  ('whatsapp_meses_texto', '24', 'WhatsApp: meses que se guarda el texto de las conversaciones; después se borra solo.'),
  ('whatsapp_meses_archivos', '6', 'WhatsApp: meses que se guardan las fotos, audios y PDF que llegan por WhatsApp; después se borran solos (salvo los de un envío con incidencia).')
on conflict (clave) do nothing;

-- ---- 1. Teléfono en formato WhatsApp ----------------------------------------------------------
-- «+34600111222»: solo cifras con su prefijo. Un móvil español escrito sin prefijo (9 cifras que
-- empiezan por 6 o 7) se entiende como +34; los fijos españoles no tienen WhatsApp normalmente,
-- pero se aceptan igual (Meta dirá si no lo tienen).
create or replace function public.tel_whatsapp(p text)
returns text language sql immutable set search_path = public as $$
  select case
           when d is null or d = '' then null
           when length(d) = 9 and d ~ '^[6789]' then '+34' || d
           when d ~ '^00' then '+' || substr(d, 3)
           else '+' || d
         end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;
comment on function public.tel_whatsapp(text) is '[Ayudantes internos] Pasa un teléfono al formato de WhatsApp: + y solo cifras, con prefijo de país (un móvil español de 9 cifras sin prefijo se entiende como +34; 00 delante se toma como prefijo). Vacío o sin cifras = nada. Quién: uso interno. Argumentos: p: el teléfono tal como esté escrito.';

-- ---- 2. Conversaciones y mensajes --------------------------------------------------------------
create table if not exists public.whatsapp_conversaciones (
  id uuid primary key default gen_random_uuid(),
  telefono text not null unique check (telefono ~ '^\+[1-9][0-9]{6,14}$'),
  nombre_perfil text check (char_length(nombre_perfil) <= 120),
  quien text not null default 'desconocido' check (quien in ('cliente', 'transportista', 'dynamo', 'conductor', 'contacto', 'desconocido')),
  usuario_id uuid references public.usuarios(id) on delete set null,
  conductor_id uuid references public.conductores(id) on delete set null,
  contacto_id uuid references public.contactos(id) on delete set null,
  empresa_cliente_id uuid references public.clientes(id) on delete set null,
  empresa_transportista_id uuid references public.transportistas(id) on delete set null,
  ultima_entrada_en timestamptz,
  ultimo_mensaje_en timestamptz,
  ultimo_texto text check (char_length(ultimo_texto) <= 200),
  sin_leer integer not null default 0 check (sin_leer >= 0),
  creado_en timestamptz not null default now()
);
create index if not exists whatsapp_conversaciones_ultimo on public.whatsapp_conversaciones (ultimo_mensaje_en desc nulls last);
comment on table public.whatsapp_conversaciones is 'Una fila por número de WhatsApp que ha escrito o al que se ha escrito: quién es (por su teléfono), cuándo escribió por última vez (marca el plazo de 24 h de Meta para contestar con texto libre) y cuántos mensajes quedan sin leer. Solo la ve el equipo de Dynamo; la escribe el servidor.';
comment on column public.whatsapp_conversaciones.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador de la conversación.';
comment on column public.whatsapp_conversaciones.telefono is 'formato: + y cifras con prefijo de país | rango: 7 a 15 cifras | lista: no aplica | obligatorio | El número de WhatsApp de la otra persona. Ej. OK: +34600111222. Ej. mal: 600 11 12 22.';
comment on column public.whatsapp_conversaciones.nombre_perfil is 'formato: texto | rango: hasta 120 caracteres | lista: no aplica | opcional | El nombre que la persona tiene puesto en su WhatsApp (lo manda Meta).';
comment on column public.whatsapp_conversaciones.quien is 'formato: texto | rango: no aplica | lista: cliente · transportista · dynamo · conductor · contacto · desconocido | automático | Quién escribe, según su teléfono: usuario cliente, usuario transportista, equipo de Dynamo, conductor de un transportista, persona de contacto de un sitio o nadie conocido.';
comment on column public.whatsapp_conversaciones.usuario_id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | El usuario de la plataforma con ese teléfono (usuarios.id), si lo hay.';
comment on column public.whatsapp_conversaciones.conductor_id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | El conductor con ese teléfono (conductores.id), si no es un usuario.';
comment on column public.whatsapp_conversaciones.contacto_id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | La persona de contacto con ese teléfono (contactos.id), si no es usuario ni conductor.';
comment on column public.whatsapp_conversaciones.empresa_cliente_id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | El cliente (empresa) de quien escribe, si se sabe (clientes.id).';
comment on column public.whatsapp_conversaciones.empresa_transportista_id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | El transportista (empresa) de quien escribe, si se sabe (transportistas.id).';
comment on column public.whatsapp_conversaciones.ultima_entrada_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Último mensaje QUE ESCRIBIÓ la persona: durante las 24 h siguientes se le puede contestar con texto libre.';
comment on column public.whatsapp_conversaciones.ultimo_mensaje_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Último mensaje de la conversación, en cualquier sentido (ordena la bandeja).';
comment on column public.whatsapp_conversaciones.ultimo_texto is 'formato: texto | rango: hasta 200 caracteres | lista: no aplica | automático | Principio del último mensaje, para la lista de conversaciones.';
comment on column public.whatsapp_conversaciones.sin_leer is 'formato: entero | rango: 0 o más | lista: no aplica | automático | Mensajes recibidos que nadie del equipo ha abierto todavía.';
comment on column public.whatsapp_conversaciones.creado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo empezó la conversación.';

create table if not exists public.whatsapp_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.whatsapp_conversaciones(id) on delete cascade,
  wa_id text unique check (char_length(wa_id) <= 200),
  sentido text not null check (sentido in ('entrada', 'salida')),
  tipo text not null check (tipo in ('texto', 'imagen', 'documento', 'audio', 'video', 'ubicacion', 'contacto', 'reaccion', 'plantilla', 'otro')),
  texto text check (char_length(texto) <= 4096),
  meta_archivo_id text check (char_length(meta_archivo_id) <= 200),
  archivo_ruta text check (char_length(archivo_ruta) <= 300),
  archivo_tipo text check (char_length(archivo_tipo) <= 100),
  archivo_nombre text check (char_length(archivo_nombre) <= 240),
  archivo_bytes integer check (archivo_bytes >= 0),
  archivo_borrado_en timestamptz,
  envio_id uuid references public.envios(id) on delete set null,
  estado text not null check (estado in ('recibido', 'pendiente', 'enviado', 'entregado', 'leido', 'fallido')),
  error text check (char_length(error) <= 500),
  origen text check (origen in ('persona', 'aviso', 'ia')),
  enviado_por uuid references public.usuarios(id) on delete set null,
  leido_en timestamptz,
  enviado_en timestamptz,
  creado_en timestamptz not null default now(),
  check ((sentido = 'entrada') = (origen is null))
);
create index if not exists whatsapp_mensajes_conversacion on public.whatsapp_mensajes (conversacion_id, creado_en desc);
create index if not exists whatsapp_mensajes_archivos on public.whatsapp_mensajes (creado_en) where archivo_ruta is not null;
create index if not exists whatsapp_mensajes_sin_archivo on public.whatsapp_mensajes (creado_en) where meta_archivo_id is not null and archivo_ruta is null and archivo_borrado_en is null;
comment on table public.whatsapp_mensajes is 'Cada mensaje de WhatsApp que llega o que sale, con su estado (Meta avisa de entregado, leído o fallido). Los archivos (fotos, audios, PDF) se bajan de Meta y se guardan en el almacén «whatsapp». El texto se guarda 2 años y los archivos 6 meses (parámetros). Solo la ve el equipo de Dynamo; la escribe el servidor.';
comment on column public.whatsapp_mensajes.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador del mensaje.';
comment on column public.whatsapp_mensajes.conversacion_id is 'formato: uuid | rango: no aplica | lista: no aplica | obligatorio | La conversación (whatsapp_conversaciones.id).';
comment on column public.whatsapp_mensajes.wa_id is 'formato: texto | rango: hasta 200 caracteres | lista: no aplica | automático | Identificador del mensaje en Meta (wamid…): evita guardarlo dos veces y casa los avisos de entregado y leído. Vacío mientras sale.';
comment on column public.whatsapp_mensajes.sentido is 'formato: texto | rango: no aplica | lista: entrada · salida | obligatorio | entrada = lo escribió la persona; salida = lo mandó la plataforma.';
comment on column public.whatsapp_mensajes.tipo is 'formato: texto | rango: no aplica | lista: texto · imagen · documento · audio · video · ubicacion · contacto · reaccion · plantilla · otro | obligatorio | Qué clase de mensaje es.';
comment on column public.whatsapp_mensajes.texto is 'formato: texto | rango: hasta 4096 caracteres | lista: no aplica | opcional | El texto del mensaje, o el pie de la foto o del documento.';
comment on column public.whatsapp_mensajes.meta_archivo_id is 'formato: texto | rango: hasta 200 caracteres | lista: no aplica | automático | Identificador del archivo en Meta, para bajarlo (caduca en Meta a los pocos días).';
comment on column public.whatsapp_mensajes.archivo_ruta is 'formato: texto | rango: hasta 300 caracteres | lista: no aplica | automático | Dónde está guardado el archivo en el almacén «whatsapp». Vacío si no hay archivo, aún no se ha bajado o ya se borró por antigüedad.';
comment on column public.whatsapp_mensajes.archivo_tipo is 'formato: texto (tipo MIME) | rango: hasta 100 caracteres | lista: no aplica | opcional | Tipo del archivo. Ej. OK: image/jpeg. Ej. mal: foto.';
comment on column public.whatsapp_mensajes.archivo_nombre is 'formato: texto | rango: hasta 240 caracteres | lista: no aplica | opcional | Nombre del archivo, si lo trae (los documentos).';
comment on column public.whatsapp_mensajes.archivo_bytes is 'formato: entero | rango: 0 o más | lista: no aplica | automático | Tamaño del archivo guardado, en bytes.';
comment on column public.whatsapp_mensajes.archivo_borrado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se borró el archivo por antigüedad (el texto se queda).';
comment on column public.whatsapp_mensajes.envio_id is 'formato: uuid | rango: no aplica | lista: no aplica | opcional | El envío del que trata el mensaje, si se sabe (envios.id).';
comment on column public.whatsapp_mensajes.estado is 'formato: texto | rango: no aplica | lista: recibido · pendiente · enviado · entregado · leido · fallido | obligatorio | recibido = llegó; pendiente = saliendo; enviado, entregado y leído según avisa Meta; fallido = Meta no lo pudo entregar (ver error).';
comment on column public.whatsapp_mensajes.error is 'formato: texto | rango: hasta 500 caracteres | lista: no aplica | opcional | Por qué no se pudo entregar (lo que contestó Meta).';
comment on column public.whatsapp_mensajes.origen is 'formato: texto | rango: no aplica | lista: persona · aviso · ia | opcional | Solo en los que salen: persona = lo escribió alguien del equipo; aviso = aviso automático; ia = respuesta de Claude.';
comment on column public.whatsapp_mensajes.enviado_por is 'formato: uuid | rango: no aplica | lista: no aplica | opcional | Quién del equipo lo escribió (usuarios.id), si fue a mano.';
comment on column public.whatsapp_mensajes.leido_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Los que llegan: cuándo lo abrió alguien del equipo. Los que salen: cuándo lo leyó la persona (si Meta lo avisa).';
comment on column public.whatsapp_mensajes.enviado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Los que salen: cuándo lo aceptó Meta. Los que llegan: cuándo lo escribió la persona.';
comment on column public.whatsapp_mensajes.creado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se guardó en la plataforma.';

alter table public.whatsapp_conversaciones enable row level security;
alter table public.whatsapp_mensajes enable row level security;
drop policy if exists whatsapp_conversaciones_dynamo on public.whatsapp_conversaciones;
create policy whatsapp_conversaciones_dynamo on public.whatsapp_conversaciones for select to authenticated using ((select ve_todo()));
drop policy if exists whatsapp_mensajes_dynamo on public.whatsapp_mensajes;
create policy whatsapp_mensajes_dynamo on public.whatsapp_mensajes for select to authenticated using ((select ve_todo()));

-- En vivo: un mensaje nuevo o un cambio de estado refresca la bandeja del equipo.
create trigger tg_zz_en_vivo_alta after insert on public.whatsapp_mensajes
  referencing new table as nuevas for each statement execute function fn_senal_en_vivo('propio');
create trigger tg_zz_en_vivo_cambio after update on public.whatsapp_mensajes
  referencing old table as viejas new table as nuevas for each statement execute function fn_senal_en_vivo('propio');
create trigger tg_zz_en_vivo_borrado after delete on public.whatsapp_mensajes
  referencing old table as viejas for each statement execute function fn_senal_en_vivo('propio');

-- ---- 3. El almacén de archivos -----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp', 'whatsapp', false, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
              'video/mp4', 'video/3gpp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.ms-excel', 'text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- Leer: el equipo de Dynamo. Subir y borrar: solo el servidor (que no pasa por estas reglas).
drop policy if exists whatsapp_fichero_leer on storage.objects;
create policy whatsapp_fichero_leer on storage.objects for select to authenticated using (bucket_id = 'whatsapp' and (select public.ve_todo()));

-- ---- 4. Quién escribe, por su teléfono ---------------------------------------------------------
-- Por orden: un usuario de la plataforma (el de más uso gana: activo antes que el resto), un
-- conductor, una persona de contacto. Se compara en formato WhatsApp, escriba cada ficha su
-- número como lo escriba.
create or replace function public.whatsapp_quien(p_tel text)
returns table(quien text, usuario_id uuid, conductor_id uuid, contacto_id uuid, cliente_id uuid, transportista_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare t text := tel_whatsapp(p_tel); u record; c record; k record;
begin
  if t is null then return query select 'desconocido'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid; return; end if;
  select x.id, x.rol, x.cliente_id, x.transportista_id into u from usuarios x
   where tel_whatsapp(x.telefono) = t
   order by (x.estado = 'activa') desc, x.ultima_conexion desc nulls last limit 1;
  if u.id is not null then
    return query select case when u.rol = 'cliente' then 'cliente' when u.rol = 'transportista' then 'transportista' else 'dynamo' end,
                        u.id, null::uuid, null::uuid, u.cliente_id, u.transportista_id;
    return;
  end if;
  select x.id, x.transportista_id into c from conductores x where tel_whatsapp(x.telefono) = t order by x.creado_en desc limit 1;
  if c.id is not null then return query select 'conductor'::text, null::uuid, c.id, null::uuid, null::uuid, c.transportista_id; return; end if;
  select x.id, coalesce(x.cliente_id, s.cliente_id) as cliente_id into k from contactos x left join sitios s on s.id = x.sitio_id
   where tel_whatsapp(x.telefono) = t order by x.creado_en desc limit 1;
  if k.id is not null then return query select 'contacto'::text, null::uuid, null::uuid, k.id, k.cliente_id, null::uuid; return; end if;
  return query select 'desconocido'::text, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid;
end $$;
comment on function public.whatsapp_quien(text) is '[Ayudantes internos] Quién tiene un teléfono: usuario de la plataforma (cliente, transportista o del equipo), conductor, persona de contacto de un sitio o desconocido, con su empresa. Compara en formato WhatsApp. Quién: uso interno. Argumentos: p_tel: el teléfono.';
revoke all on function public.whatsapp_quien(text) from public, anon, authenticated;

-- ---- 5. Lo que hace el servidor ----------------------------------------------------------------
-- Guarda un mensaje que llega (Meta puede repetir el aviso: el mismo wa_id no se guarda dos veces).
create or replace function public.whatsapp_registrar_entrada(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tel text := tel_whatsapp(p ->> 'telefono'); v_conv uuid; v_msg uuid; q record; v_cuando timestamptz;
  v_texto text := left(nullif(btrim(coalesce(p ->> 'texto', '')), ''), 4096); v_tipo text := coalesce(p ->> 'tipo', 'otro'); v_sin_leer int;
  v_nombre text;
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  if v_tel is null or v_tel !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'Teléfono de WhatsApp no válido.'; end if;
  if v_tipo not in ('texto', 'imagen', 'documento', 'audio', 'video', 'ubicacion', 'contacto', 'reaccion', 'otro') then v_tipo := 'otro'; end if;
  v_cuando := coalesce(to_timestamp(nullif(p ->> 'cuando', '')::bigint), now());
  if p ->> 'wa_id' is not null and exists (select 1 from whatsapp_mensajes where wa_id = p ->> 'wa_id') then
    return jsonb_build_object('resultado', 'repetido');
  end if;
  select * into q from whatsapp_quien(v_tel);
  v_nombre := left(nullif(btrim(coalesce(p ->> 'nombre', '')), ''), 120);
  insert into whatsapp_conversaciones as c (telefono, nombre_perfil, quien, usuario_id, conductor_id, contacto_id, empresa_cliente_id, empresa_transportista_id)
  values (v_tel, v_nombre, q.quien, q.usuario_id, q.conductor_id, q.contacto_id, q.cliente_id, q.transportista_id)
  on conflict (telefono) do update set
    nombre_perfil = coalesce(excluded.nombre_perfil, c.nombre_perfil),
    quien = excluded.quien, usuario_id = excluded.usuario_id, conductor_id = excluded.conductor_id, contacto_id = excluded.contacto_id,
    empresa_cliente_id = excluded.empresa_cliente_id, empresa_transportista_id = excluded.empresa_transportista_id
  returning id into v_conv;
  insert into whatsapp_mensajes (conversacion_id, wa_id, sentido, tipo, texto, meta_archivo_id, archivo_tipo, archivo_nombre, estado, enviado_en)
  values (v_conv, p ->> 'wa_id', 'entrada', v_tipo, v_texto, left(p ->> 'meta_archivo_id', 200), left(p ->> 'archivo_tipo', 100), left(p ->> 'archivo_nombre', 240), 'recibido', v_cuando)
  returning id into v_msg;
  update whatsapp_conversaciones set
    ultima_entrada_en = greatest(coalesce(ultima_entrada_en, v_cuando), v_cuando),
    ultimo_mensaje_en = greatest(coalesce(ultimo_mensaje_en, v_cuando), v_cuando),
    ultimo_texto = left(coalesce(v_texto, case v_tipo when 'imagen' then '📷 Foto' when 'documento' then '📄 Documento' when 'audio' then '🎤 Nota de voz'
                                               when 'video' then '🎬 Vídeo' when 'ubicacion' then '📍 Ubicación' else 'Mensaje' end), 200),
    sin_leer = sin_leer + 1
   where id = v_conv returning sin_leer into v_sin_leer;
  -- A la campana del equipo, solo el primero sin leer de cada conversación (no uno por mensaje).
  if v_sin_leer = 1 then
    perform crear_aviso('dynamo', null, null, 'whatsapp', 'info',
      'WhatsApp de ' || coalesce((select coalesce(cl.nombre_visible, cl.razon_social) from clientes cl where cl.id = q.cliente_id),
                                 (select coalesce(t.nombre_visible, t.razon_social) from transportistas t where t.id = q.transportista_id),
                                 v_nombre, v_tel),
      left(coalesce(v_texto, 'Te han mandado ' || case v_tipo when 'imagen' then 'una foto' when 'documento' then 'un documento' when 'audio' then 'una nota de voz' else 'un mensaje' end), 160),
      '/panel/whatsapp?ver=' || v_conv, null);
  end if;
  return jsonb_build_object('resultado', 'ok', 'conversacion_id', v_conv, 'mensaje_id', v_msg, 'quien', q.quien);
end $$;
comment on function public.whatsapp_registrar_entrada(jsonb) is '[Gestión interna] Guarda un mensaje de WhatsApp que llega: crea o pone al día la conversación de ese número (quién es, según su teléfono), suma uno a «sin leer» y avisa en la campana del equipo con el primero sin leer. El mismo mensaje no se guarda dos veces. Quién: solo el servidor (/api/whatsapp). Argumentos: p: {telefono, nombre, wa_id, tipo, texto, meta_archivo_id, archivo_tipo, archivo_nombre, cuando (segundos Unix)}.';
revoke all on function public.whatsapp_registrar_entrada(jsonb) from public, anon, authenticated;
grant execute on function public.whatsapp_registrar_entrada(jsonb) to service_role;

-- Estado que avisa Meta de un mensaje que salió: solo avanza (enviado → entregado → leído); un
-- fallo se apunta siempre.
create or replace function public.whatsapp_registrar_estado(p_wa_id text, p_estado text, p_error text default null, p_cuando bigint default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_orden int; v_n int;
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  if p_estado not in ('enviado', 'entregado', 'leido', 'fallido') then return false; end if;
  v_orden := array_position(array['pendiente', 'enviado', 'entregado', 'leido'], p_estado);
  update whatsapp_mensajes set
    estado = p_estado,
    error = case when p_estado = 'fallido' then left(coalesce(p_error, 'Meta no lo pudo entregar.'), 500) else error end,
    leido_en = case when p_estado = 'leido' then coalesce(to_timestamp(p_cuando), now()) else leido_en end
   where wa_id = p_wa_id and sentido = 'salida'
     and (p_estado = 'fallido' or array_position(array['pendiente', 'enviado', 'entregado', 'leido'], estado) < v_orden);
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
comment on function public.whatsapp_registrar_estado(text, text, text, bigint) is '[Gestión interna] Apunta lo que avisa Meta de un mensaje que salió: enviado, entregado, leído (solo hacia delante) o fallido (con el motivo). Quién: solo el servidor (/api/whatsapp). Argumentos: p_wa_id: identificador de Meta; p_estado: enviado, entregado, leido o fallido; p_error: motivo del fallo; p_cuando: segundos Unix.';
revoke all on function public.whatsapp_registrar_estado(text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.whatsapp_registrar_estado(text, text, text, bigint) to service_role;

-- El archivo ya está bajado de Meta y guardado.
create or replace function public.whatsapp_archivo_guardado(p_mensaje uuid, p_ruta text, p_tipo text, p_bytes integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  update whatsapp_mensajes set archivo_ruta = left(p_ruta, 300), archivo_tipo = coalesce(left(p_tipo, 100), archivo_tipo), archivo_bytes = greatest(0, p_bytes)
   where id = p_mensaje;
end $$;
comment on function public.whatsapp_archivo_guardado(uuid, text, text, integer) is '[Gestión interna] Apunta dónde quedó guardado el archivo (foto, audio, PDF) de un mensaje de WhatsApp, ya bajado de Meta. Quién: solo el servidor. Argumentos: p_mensaje: el mensaje; p_ruta: ruta en el almacén «whatsapp»; p_tipo: tipo MIME; p_bytes: tamaño.';
revoke all on function public.whatsapp_archivo_guardado(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.whatsapp_archivo_guardado(uuid, text, text, integer) to service_role;

-- Los archivos que hay que bajar todavía (Meta los guarda poco tiempo): por si al llegar falló.
create or replace function public.whatsapp_archivos_por_bajar(p_limite integer default 20)
returns table(mensaje_id uuid, meta_archivo_id text, archivo_tipo text, archivo_nombre text, conversacion_id uuid)
language sql stable security definer set search_path = public as $$
  select m.id, m.meta_archivo_id, m.archivo_tipo, m.archivo_nombre, m.conversacion_id
    from whatsapp_mensajes m
   where m.meta_archivo_id is not null and m.archivo_ruta is null and m.archivo_borrado_en is null
     and m.creado_en > now() - interval '7 days'
   order by m.creado_en limit greatest(1, least(coalesce(p_limite, 20), 100))
$$;
comment on function public.whatsapp_archivos_por_bajar(integer) is '[Gestión interna] Mensajes de WhatsApp de la última semana cuyo archivo aún no se ha bajado de Meta (por si falló al llegar). Quién: solo el servidor. Argumentos: p_limite: cuántos como mucho (1 a 100).';
revoke all on function public.whatsapp_archivos_por_bajar(integer) from public, anon, authenticated;
grant execute on function public.whatsapp_archivos_por_bajar(integer) to service_role;

-- ---- 6. Contestar desde el panel ---------------------------------------------------------------
-- Prepara la respuesta: comprueba quién la escribe (equipo de Dynamo, no de solo lectura) y que
-- estamos dentro de las 24 h de Meta. Deja el mensaje «pendiente»; el servidor lo manda y lo apunta.
create or replace function public.whatsapp_preparar_respuesta(p_conversacion uuid, p_texto text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; v_texto text := btrim(coalesce(p_texto, '')); v_msg uuid;
begin
  if not ve_todo() or es_solo_lectura() then raise exception 'Solo el equipo de Dynamo puede contestar.' using errcode = '42501'; end if;
  if v_texto = '' then return jsonb_build_object('resultado', 'vacio'); end if;
  if char_length(v_texto) > 4096 then return jsonb_build_object('resultado', 'largo'); end if;
  select * into c from whatsapp_conversaciones where id = p_conversacion;
  if c.id is null then return jsonb_build_object('resultado', 'no_existe'); end if;
  if c.ultima_entrada_en is null or c.ultima_entrada_en < now() - interval '24 hours' then
    return jsonb_build_object('resultado', 'fuera_de_plazo', 'ultima_entrada_en', c.ultima_entrada_en);
  end if;
  insert into whatsapp_mensajes (conversacion_id, sentido, tipo, texto, estado, origen, enviado_por)
  values (c.id, 'salida', 'texto', v_texto, 'pendiente', 'persona', auth.uid()) returning id into v_msg;
  update whatsapp_conversaciones set ultimo_mensaje_en = now(), ultimo_texto = left(v_texto, 200), sin_leer = 0 where id = c.id;
  update whatsapp_mensajes set leido_en = now() where conversacion_id = c.id and sentido = 'entrada' and leido_en is null;
  return jsonb_build_object('resultado', 'ok', 'mensaje_id', v_msg, 'telefono', c.telefono);
end $$;
comment on function public.whatsapp_preparar_respuesta(uuid, text) is '[Gestión interna] Prepara una respuesta escrita a mano en la bandeja de WhatsApp: solo el equipo de Dynamo (no los de solo lectura) y solo dentro de las 24 h siguientes al último mensaje de la persona (regla de Meta). Deja el mensaje pendiente y marca la conversación como leída; el servidor lo manda. Quién: equipo de Dynamo. Argumentos: p_conversacion: la conversación; p_texto: lo que se contesta (hasta 4096 caracteres).';
revoke all on function public.whatsapp_preparar_respuesta(uuid, text) from public, anon;
grant execute on function public.whatsapp_preparar_respuesta(uuid, text) to authenticated;

-- El servidor apunta si Meta aceptó el mensaje (con su identificador) o por qué no.
create or replace function public.whatsapp_marcar_enviado(p_mensaje uuid, p_wa_id text, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  update whatsapp_mensajes set
    wa_id = coalesce(left(p_wa_id, 200), wa_id),
    estado = case when p_wa_id is not null then 'enviado' else 'fallido' end,
    error = case when p_wa_id is null then left(coalesce(p_error, 'No se ha podido mandar.'), 500) end,
    enviado_en = case when p_wa_id is not null then now() end
   where id = p_mensaje and sentido = 'salida' and estado = 'pendiente';
end $$;
comment on function public.whatsapp_marcar_enviado(uuid, text, text) is '[Gestión interna] Apunta el resultado de mandar un mensaje de WhatsApp: con el identificador de Meta queda «enviado»; sin él, «fallido» con el motivo. Quién: solo el servidor. Argumentos: p_mensaje: el mensaje pendiente; p_wa_id: identificador que devolvió Meta; p_error: motivo si falló.';
revoke all on function public.whatsapp_marcar_enviado(uuid, text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_marcar_enviado(uuid, text, text) to service_role;

-- Abrir una conversación la marca como leída.
create or replace function public.whatsapp_marcar_leida(p_conversacion uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not ve_todo() then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  update whatsapp_mensajes set leido_en = now() where conversacion_id = p_conversacion and sentido = 'entrada' and leido_en is null;
  update whatsapp_conversaciones set sin_leer = 0 where id = p_conversacion and sin_leer > 0;
end $$;
comment on function public.whatsapp_marcar_leida(uuid) is '[Gestión interna] Marca como leídos los mensajes que llegaron en una conversación de WhatsApp (al abrirla en la bandeja). Quién: equipo de Dynamo. Argumentos: p_conversacion: la conversación.';
revoke all on function public.whatsapp_marcar_leida(uuid) from public, anon;
grant execute on function public.whatsapp_marcar_leida(uuid) to authenticated;

-- ---- 7. Permiso de cada usuario para los avisos por WhatsApp -----------------------------------
alter table public.usuarios add column if not exists avisos_whatsapp boolean not null default false;
alter table public.usuarios add column if not exists avisos_whatsapp_en timestamptz;
alter table public.usuarios add column if not exists avisos_whatsapp_preguntado_en timestamptz;
comment on column public.usuarios.avisos_whatsapp is 'formato: sí/no | rango: no aplica | lista: true · false | obligatorio | El usuario ha dado permiso para recibir también por WhatsApp, en su móvil, los avisos de la plataforma (Meta lo exige). Por defecto no.';
comment on column public.usuarios.avisos_whatsapp_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo dio (o quitó) el permiso de avisos por WhatsApp: es la prueba del consentimiento.';
comment on column public.usuarios.avisos_whatsapp_preguntado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se le preguntó por los avisos por WhatsApp (la pregunta única a los usuarios de antes): no se le vuelve a preguntar.';

create or replace function public.mi_avisos_whatsapp(p_activo boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; v_tel text;
begin
  select id, telefono into u from usuarios where id = auth.uid();
  if u.id is null then raise exception 'Sin sesión.' using errcode = '42501'; end if;
  v_tel := tel_whatsapp(u.telefono);
  if coalesce(p_activo, false) and (v_tel is null or v_tel !~ '^\+[1-9][0-9]{6,14}$') then
    return jsonb_build_object('resultado', 'sin_movil');
  end if;
  update usuarios set avisos_whatsapp = coalesce(p_activo, false), avisos_whatsapp_en = now(),
                      avisos_whatsapp_preguntado_en = coalesce(avisos_whatsapp_preguntado_en, now())
   where id = u.id;
  return jsonb_build_object('resultado', 'ok', 'activo', coalesce(p_activo, false), 'telefono', v_tel);
end $$;
comment on function public.mi_avisos_whatsapp(boolean) is '[Mi cuenta] El usuario da o quita su permiso para recibir los avisos también por WhatsApp. Para darlo hace falta un móvil en sus datos. Apunta cuándo (prueba del consentimiento) y que ya se le preguntó. Quién: cualquier usuario, sobre sí mismo. Argumentos: p_activo: true para recibirlos, false para no.';
revoke all on function public.mi_avisos_whatsapp(boolean) from public, anon;
grant execute on function public.mi_avisos_whatsapp(boolean) to authenticated;

-- «Ahora no» a la pregunta única: no se le vuelve a preguntar (lo puede activar en Mi cuenta).
create or replace function public.mi_avisos_whatsapp_no_preguntar()
returns void language sql security definer set search_path = public as $$
  update usuarios set avisos_whatsapp_preguntado_en = coalesce(avisos_whatsapp_preguntado_en, now()) where id = auth.uid()
$$;
comment on function public.mi_avisos_whatsapp_no_preguntar() is '[Mi cuenta] El usuario contesta «ahora no» a la pregunta de los avisos por WhatsApp: no se le vuelve a preguntar (lo puede activar cuando quiera en Mi cuenta). Quién: cualquier usuario, sobre sí mismo. Argumentos: sin argumentos.';
revoke all on function public.mi_avisos_whatsapp_no_preguntar() from public, anon;
grant execute on function public.mi_avisos_whatsapp_no_preguntar() to authenticated;

-- ---- 8. Cuánto se guarda ----------------------------------------------------------------------
-- El TEXTO, los meses del parámetro (24): se borran los mensajes y, si una conversación se queda
-- vacía, la conversación. Los ARCHIVOS los borra el servidor (el almacén no se toca desde aquí):
-- esta función le dice cuáles tocan (6 meses, salvo los de un envío con incidencia).
create or replace function public.whatsapp_limpiar()
returns integer language plpgsql security definer set search_path = public as $$
declare v_meses int := greatest(1, parametro_num('whatsapp_meses_texto', 24)::int); v_n int;
begin
  delete from whatsapp_mensajes m
   where m.creado_en < now() - make_interval(months => v_meses)
     and m.archivo_ruta is null
     and not (m.envio_id is not null and exists (select 1 from incidencias i where i.envio_id = m.envio_id));
  get diagnostics v_n = row_count;
  delete from whatsapp_conversaciones c
   where c.ultimo_mensaje_en < now() - make_interval(months => v_meses)
     and not exists (select 1 from whatsapp_mensajes m where m.conversacion_id = c.id);
  return v_n;
end $$;
comment on function public.whatsapp_limpiar() is '[Mantenimiento] Tarea diaria: borra el texto de WhatsApp de más de whatsapp_meses_texto meses (24) y las conversaciones que se quedan vacías. No toca los mensajes con archivo aún guardado (esos los borra el servidor) ni los de un envío con incidencia. Quién: tarea programada (pg_cron). Argumentos: sin argumentos.';
revoke all on function public.whatsapp_limpiar() from public, anon, authenticated;

create or replace function public.whatsapp_archivos_caducados(p_limite integer default 50)
returns table(mensaje_id uuid, archivo_ruta text)
language sql stable security definer set search_path = public as $$
  select m.id, m.archivo_ruta from whatsapp_mensajes m
   where m.archivo_ruta is not null
     and m.creado_en < now() - make_interval(months => greatest(1, parametro_num('whatsapp_meses_archivos', 6)::int))
     and not (m.envio_id is not null and exists (select 1 from incidencias i where i.envio_id = m.envio_id))
   order by m.creado_en limit greatest(1, least(coalesce(p_limite, 50), 500))
$$;
comment on function public.whatsapp_archivos_caducados(integer) is '[Mantenimiento] Archivos de WhatsApp (fotos, audios, PDF) que han cumplido whatsapp_meses_archivos meses (6) y hay que borrar del almacén; no salen los de un envío con incidencia. Quién: solo el servidor. Argumentos: p_limite: cuántos como mucho (1 a 500).';
revoke all on function public.whatsapp_archivos_caducados(integer) from public, anon, authenticated;
grant execute on function public.whatsapp_archivos_caducados(integer) to service_role;

create or replace function public.whatsapp_archivos_borrados(p_mensajes uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  update whatsapp_mensajes set archivo_ruta = null, archivo_borrado_en = now() where id = any(coalesce(p_mensajes, '{}'));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
comment on function public.whatsapp_archivos_borrados(uuid[]) is '[Mantenimiento] Apunta que el servidor ya borró del almacén los archivos de esos mensajes de WhatsApp (el texto se queda). Quién: solo el servidor. Argumentos: p_mensajes: los mensajes.';
revoke all on function public.whatsapp_archivos_borrados(uuid[]) from public, anon, authenticated;
grant execute on function public.whatsapp_archivos_borrados(uuid[]) to service_role;

-- Cifras para Mantenimiento (cuánto ocupa WhatsApp).
create or replace function public.whatsapp_resumen()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not ve_todo() then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'activo', coalesce((parametro('whatsapp_activo') #>> '{}')::boolean, false),
    'movil_dynamo', coalesce(parametro('whatsapp_movil_dynamo') #>> '{}', ''),
    'conversaciones', (select count(*) from whatsapp_conversaciones),
    'mensajes', (select count(*) from whatsapp_mensajes),
    'sin_leer', (select coalesce(sum(sin_leer), 0) from whatsapp_conversaciones),
    'archivos', (select count(*) from whatsapp_mensajes where archivo_ruta is not null),
    'archivos_bytes', (select coalesce(sum(archivo_bytes), 0) from whatsapp_mensajes where archivo_ruta is not null),
    'texto_bytes', (select coalesce(sum(octet_length(coalesce(texto, ''))), 0) from whatsapp_mensajes),
    'con_permiso', (select count(*) from usuarios where avisos_whatsapp),
    'ultimo', (select max(creado_en) from whatsapp_mensajes)) into v;
  return v;
end $$;
comment on function public.whatsapp_resumen() is '[Gestión interna] Cifras de WhatsApp para Mantenimiento: si está encendido, cuántas conversaciones y mensajes hay, cuántos sin leer, cuántos archivos y cuánto ocupan, cuántos usuarios han dado permiso para los avisos. Quién: equipo de Dynamo. Argumentos: sin argumentos.';
revoke all on function public.whatsapp_resumen() from public, anon;
grant execute on function public.whatsapp_resumen() to authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-whatsapp-limpiar', '37 4 * * *', 'select public.whatsapp_limpiar()');
  end if;
end $$;

-- ---- 9. El número del menú: conversaciones con mensajes sin leer -------------------------------
do $$ declare v text; v_viejo text := $v$'albaranes', (select count(*) from public.documentos_entrada where estado = 'pendiente'),$v$;
begin
  v := pg_get_functiondef('public.contadores_panel(uuid,uuid)'::regprocedure);
  if position(v_viejo in v) = 0 or position('whatsapp_conversaciones' in v) > 0 then
    raise exception 'contadores_panel no es la que se esperaba: revisar esta migración';
  end if;
  execute replace(v, v_viejo, v_viejo || E'\n      ''whatsapp'', (select count(*) from public.whatsapp_conversaciones where sin_leer > 0),');
end $$;

-- ---- 10. La casilla del alta: el permiso viaja en los datos del alta ---------------------------
-- El formulario de registro manda avisos_whatsapp (true/false); al crear el perfil se apunta, con
-- la fecha como prueba, y ya no se le vuelve a preguntar.
do $$ declare v text; v_viejo text := E'  on conflict (id) do nothing;\n  return new;';
begin
  v := pg_get_functiondef('public.fn_crear_perfil_usuario()'::regprocedure);
  if position(v_viejo in v) = 0 or position('avisos_whatsapp' in v) > 0 then
    raise exception 'fn_crear_perfil_usuario no es la que se esperaba: revisar esta migración';
  end if;
  execute replace(v, v_viejo, E'  on conflict (id) do nothing;\n'
    || E'  -- Permiso para los avisos por WhatsApp, marcado (o no) en el formulario de alta.\n'
    || E'  if new.raw_user_meta_data ? ''avisos_whatsapp'' then\n'
    || E'    update usuarios set avisos_whatsapp = coalesce((new.raw_user_meta_data ->> ''avisos_whatsapp'')::boolean, false),\n'
    || E'                        avisos_whatsapp_en = now(), avisos_whatsapp_preguntado_en = now()\n'
    || E'     where id = new.id;\n'
    || E'  end if;\n  return new;');
end $$;
