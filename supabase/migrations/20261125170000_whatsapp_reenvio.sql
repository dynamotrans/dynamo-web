-- =====================================================================================
-- WHATSAPP: REENVÍO AL MÓVIL DE DYNAMO, «TOMO YO» Y CONTESTAR CITANDO (usuario, 2026-11-25)
-- =====================================================================================
-- «Ok, pero para montar ya en v1». Descartadas Chatwoot/Respond.io (no ven el historial guardado
-- aquí, dos bandejas, otro pago) y la «coexistencia» de Meta (solo para números que ya están en la
-- app WhatsApp Business; el de Dynamo ya está en la API). Queda así:
--   · Lo que escribe un cliente, transportista, conductor… al número nuevo, la plataforma se lo
--     REENVÍA al móvil de Dynamo (Parámetros → «WhatsApp»), desde el mismo número nuevo: en ese
--     móvil hay un único chat que hace de buzón. Cada reenvío lleva dos botones: «Tomo yo» y
--     «Que conteste Claude».
--   · Dynamo RESPONDE CITANDO el reenvío (deslizando el mensaje) y la plataforma se lo manda a quien
--     escribió desde el número nuevo: nunca ve el móvil de Dynamo. Contestar cuenta como «Tomo yo».
--     Sin citar, va a la última conversación reenviada si fue hace menos de 15 minutos; si no, se le
--     pregunta a quién va. Fotos, PDF, audios y vídeos también pasan.
--   · «Que conteste Claude» (o escribir «Claude» citando), o 24 h sin contestar (parámetro), devuelve
--     la conversación a Claude. Claude contesta en la parte 3: hasta entonces el modo es «todo».
--   · Modo (parámetro): «todo» = se reenvía cada mensaje; «importante» = solo si piden una persona,
--     es urgente, una queja, un siniestro… (palabras editables), un desconocido (opcional) o la
--     conversación la lleva una persona; «nada» = no se reenvía (solo la bandeja del panel).
--   · Meta solo deja escribir sin plantilla en las 24 h siguientes al último mensaje de ese móvil
--     al número nuevo: fuera, el reenvío sale con una plantilla aprobada (nombre en parámetros).

insert into public.parametros (clave, valor, descripcion) values
  ('whatsapp_reenvio_modo', '"todo"', 'WhatsApp: qué se reenvía al móvil de Dynamo. todo = cada mensaje que llega; importante = solo si piden una persona o es urgente (palabras), un desconocido (si está encendido) o la conversación la lleva una persona; nada = no se reenvía (solo la bandeja del panel). Mientras Claude no conteste, mejor «todo».'),
  ('whatsapp_palabras_persona', '"persona, humano, agente, operador, alguien, hablar con, llamar, llamad, llamame, llamada, telefono, urgente, urgencia, queja, reclamacion, siniestro, accidente, averia, roto, rota, danad, dano"', 'WhatsApp: palabras (separadas por comas, sin importar tildes ni mayúsculas) que hacen que un mensaje se reenvíe al móvil de Dynamo en el modo «importante». Cuenta también si la palabra empieza así («llamad» vale para «llamadme»).'),
  ('whatsapp_reenviar_desconocidos', 'true', 'WhatsApp: en el modo «importante», reenviar también al móvil de Dynamo los mensajes de números que no son de nadie de la plataforma (posibles clientes nuevos).'),
  ('whatsapp_tomo_yo_horas', '24', 'WhatsApp: horas que una conversación sigue siendo de una persona («Tomo yo») desde su última respuesta; pasadas, vuelve a Claude sola.'),
  ('whatsapp_plantilla_reenvio', '""', 'WhatsApp: nombre de la plantilla aprobada en Meta para reenviar al móvil de Dynamo cuando han pasado más de 24 h desde que ese móvil escribió al número nuevo (cuerpo con {{1}} quién y {{2}} el mensaje, y dos botones de respuesta rápida: «Tomo yo» y «Que conteste Claude»). Vacío = se intenta igual y, si Meta no lo deja, se ve en la bandeja.')
on conflict (clave) do nothing;

-- ---- 1. Columnas nuevas --------------------------------------------------------------------------
alter table public.whatsapp_conversaciones
  add column if not exists tomada_en timestamptz,
  add column if not exists tomada_desde text check (tomada_desde in ('panel', 'movil'));
comment on column public.whatsapp_conversaciones.tomada_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Última vez que una persona del equipo la tomó («Tomo yo») o contestó. Mientras no pasen las horas del parámetro whatsapp_tomo_yo_horas, la lleva una persona y Claude no contesta. Vacío = la lleva Claude.';
comment on column public.whatsapp_conversaciones.tomada_desde is 'formato: texto | rango: no aplica | lista: panel · movil | automático | Desde dónde la tomó la persona: el panel o el móvil de Dynamo (respondiendo al reenvío).';

alter table public.whatsapp_mensajes
  add column if not exists cita_wa_id text check (char_length(cita_wa_id) <= 200),
  add column if not exists boton_id text check (char_length(boton_id) <= 256),
  add column if not exists reenvio_de uuid references public.whatsapp_mensajes(id) on delete set null,
  add column if not exists desde_movil boolean not null default false;
create index if not exists whatsapp_mensajes_reenvio on public.whatsapp_mensajes (reenvio_de) where reenvio_de is not null;
comment on column public.whatsapp_mensajes.cita_wa_id is 'formato: texto | rango: hasta 200 caracteres | lista: no aplica | automático | Los que llegan: el mensaje que la persona citó al responder (su identificador en Meta). Así se sabe a qué reenvío contesta el móvil de Dynamo.';
comment on column public.whatsapp_mensajes.boton_id is 'formato: texto | rango: hasta 256 caracteres | lista: no aplica | automático | Los que llegan: el botón que pulsó la persona (p. ej. «tomo:<conversación>» o «claude:<conversación>»).';
comment on column public.whatsapp_mensajes.reenvio_de is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Los reenvíos al móvil de Dynamo: el mensaje original. Las respuestas que Dynamo escribe desde su móvil: el mensaje que escribió allí (whatsapp_mensajes.id).';
comment on column public.whatsapp_mensajes.desde_movil is 'formato: sí/no | rango: no aplica | lista: no aplica | automático | Los que salen: lo escribió el equipo desde el móvil de Dynamo (respondiendo a un reenvío), no desde el panel.';

alter table public.whatsapp_mensajes drop constraint if exists whatsapp_mensajes_tipo_check;
alter table public.whatsapp_mensajes add constraint whatsapp_mensajes_tipo_check
  check (tipo in ('texto', 'imagen', 'documento', 'audio', 'video', 'ubicacion', 'contacto', 'reaccion', 'boton', 'plantilla', 'otro'));
comment on column public.whatsapp_mensajes.tipo is 'formato: texto | rango: no aplica | lista: texto · imagen · documento · audio · video · ubicacion · contacto · reaccion · boton · plantilla · otro | obligatorio | Qué clase de mensaje es (boton = la persona pulsó un botón de un mensaje).';

-- ---- 2. Ayudantes ------------------------------------------------------------------------------
create or replace function public.whatsapp_movil_dynamo()
returns text language sql stable security definer set search_path = public as $$
  select tel_whatsapp(parametro('whatsapp_movil_dynamo') #>> '{}')
$$;
comment on function public.whatsapp_movil_dynamo() is '[Ayudantes internos] El móvil de Dynamo de los parámetros, en formato WhatsApp (+ y cifras). Vacío = nada. Quién: uso interno. Argumentos: sin argumentos.';
revoke all on function public.whatsapp_movil_dynamo() from public, anon, authenticated;

-- Cómo se llama quien escribe, para el reenvío: persona · empresa (qué es).
create or replace function public.whatsapp_nombre(p_conv uuid)
returns text language sql stable security definer set search_path = public as $$
  select concat_ws(' · ',
           coalesce((select u.nombre from usuarios u where u.id = c.usuario_id), (select x.nombre from conductores x where x.id = c.conductor_id),
                    (select k.nombre from contactos k where k.id = c.contacto_id), c.nombre_perfil),
           coalesce((select coalesce(cl.nombre_visible, cl.razon_social) from clientes cl where cl.id = c.empresa_cliente_id),
                    (select coalesce(t.nombre_visible, t.razon_social) from transportistas t where t.id = c.empresa_transportista_id)),
           c.telefono)
         || ' (' || case c.quien when 'cliente' then 'cliente' when 'transportista' then 'transportista' when 'conductor' then 'conductor'
                      when 'contacto' then 'contacto de un sitio' when 'dynamo' then 'equipo Dynamo' else 'desconocido' end || ')'
    from whatsapp_conversaciones c where c.id = p_conv
$$;
comment on function public.whatsapp_nombre(uuid) is '[Ayudantes internos] Quién es la otra persona de una conversación de WhatsApp, en una línea: nombre · empresa · teléfono (cliente, transportista…). Para los reenvíos al móvil de Dynamo. Quién: uso interno. Argumentos: p_conv: la conversación.';
revoke all on function public.whatsapp_nombre(uuid) from public, anon, authenticated;

-- Deja preparado un mensaje que sale hacia el móvil de Dynamo (reenvío o respuesta del sistema).
create or replace function public.whatsapp_salida_movil(p_texto text, p_reenvio uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tel text := whatsapp_movil_dynamo(); v_conv uuid; v_msg uuid; v_ventana timestamptz;
begin
  if v_tel is null then return null; end if;
  insert into whatsapp_conversaciones as x (telefono, quien, usuario_id, conductor_id, contacto_id, empresa_cliente_id, empresa_transportista_id)
  select v_tel, q.quien, q.usuario_id, q.conductor_id, q.contacto_id, q.cliente_id, q.transportista_id from whatsapp_quien(v_tel) q
  on conflict (telefono) do update set telefono = x.telefono
  returning id, ultima_entrada_en into v_conv, v_ventana;
  insert into whatsapp_mensajes (conversacion_id, sentido, tipo, texto, estado, origen, reenvio_de)
  values (v_conv, 'salida', 'texto', left(p_texto, 4096), 'pendiente', 'aviso', p_reenvio) returning id into v_msg;
  update whatsapp_conversaciones set ultimo_mensaje_en = now(), ultimo_texto = left(p_texto, 200) where id = v_conv;
  return jsonb_build_object('mensaje_id', v_msg, 'telefono', v_tel, 'ventana', v_ventana is not null and v_ventana > now() - interval '24 hours');
end $$;
comment on function public.whatsapp_salida_movil(text, uuid) is '[Ayudantes internos] Deja pendiente un mensaje hacia el móvil de Dynamo (un reenvío o una respuesta de la plataforma) en su conversación, y dice si ese móvil escribió al número nuevo en las últimas 24 h (si no, Meta pide plantilla). Quién: uso interno. Argumentos: p_texto: el texto; p_reenvio: el mensaje original, si es un reenvío.';
revoke all on function public.whatsapp_salida_movil(text, uuid) from public, anon, authenticated;

-- ---- 3. Guardar lo que llega: cita, botón y el móvil de Dynamo no cuenta como sin leer -------------
do $$ declare v text; v_old text;
begin
  select pg_get_functiondef('public.whatsapp_registrar_entrada(jsonb)'::regprocedure) into v; v_old := v;
  v := replace(v, $a$'reaccion', 'otro') then v_tipo := 'otro'; end if;$a$, $a$'reaccion', 'boton', 'otro') then v_tipo := 'otro'; end if;$a$);
  v := replace(v, $a$insert into whatsapp_mensajes (conversacion_id, wa_id, sentido, tipo, texto, meta_archivo_id, archivo_tipo, archivo_nombre, estado, enviado_en)
  values (v_conv, p ->> 'wa_id', 'entrada', v_tipo, v_texto, left(p ->> 'meta_archivo_id', 200), left(p ->> 'archivo_tipo', 100), left(p ->> 'archivo_nombre', 240), 'recibido', v_cuando)$a$,
    $a$insert into whatsapp_mensajes (conversacion_id, wa_id, sentido, tipo, texto, meta_archivo_id, archivo_tipo, archivo_nombre, estado, enviado_en, cita_wa_id, boton_id)
  values (v_conv, p ->> 'wa_id', 'entrada', v_tipo, v_texto, left(p ->> 'meta_archivo_id', 200), left(p ->> 'archivo_tipo', 100), left(p ->> 'archivo_nombre', 240), 'recibido', v_cuando,
          left(nullif(p ->> 'cita_wa_id', ''), 200), left(nullif(p ->> 'boton_id', ''), 256))$a$);
  v := replace(v, $a$    sin_leer = sin_leer + 1$a$, $a$    sin_leer = sin_leer + case when v_tel = whatsapp_movil_dynamo() then 0 else 1 end$a$);
  if v = v_old or position('boton_id' in v) = 0 or position('whatsapp_movil_dynamo()' in v) = 0 or position($a$'boton', 'otro'$a$ in v) = 0 then
    raise exception 'whatsapp_registrar_entrada: no se ha podido poner al día (ha cambiado el texto de la función)';
  end if;
  execute v;
end $$;

-- ---- 4. Qué hacer con lo que llega -------------------------------------------------------------
create or replace function public.whatsapp_tras_entrada(p_mensaje uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m record; c record; t record; v_movil text := whatsapp_movil_dynamo(); v_destino uuid; v_msg uuid; s jsonb;
  v_modo text := coalesce(parametro('whatsapp_reenvio_modo') #>> '{}', 'todo');
  v_horas int := greatest(1, coalesce((parametro('whatsapp_tomo_yo_horas') #>> '{}')::int, 24));
  v_nombre text; v_contenido text; v_txt text; v_tomada boolean; v_importante boolean; v_reciente timestamptz;
begin
  if not es_servidor() then raise exception 'Solo el servidor.' using errcode = '42501'; end if;
  if not coalesce((parametro('whatsapp_activo') #>> '{}')::boolean, false) or v_movil is null then return jsonb_build_object('accion', 'nada'); end if;
  select * into m from whatsapp_mensajes where id = p_mensaje and sentido = 'entrada';
  if m.id is null then return jsonb_build_object('accion', 'nada'); end if;
  select * into c from whatsapp_conversaciones where id = m.conversacion_id;

  -- A) Escribe el móvil de Dynamo: es un botón, una respuesta a un reenvío o «Claude».
  if c.telefono = v_movil then
    update whatsapp_mensajes set leido_en = coalesce(leido_en, now()) where id = m.id;
    if m.boton_id ~ '^(tomo|claude):[0-9a-fA-F-]{36}$' then
      v_destino := split_part(m.boton_id, ':', 2)::uuid;
    elsif m.cita_wa_id is not null then
      select o.conversacion_id into v_destino from whatsapp_mensajes r join whatsapp_mensajes o on o.id = r.reenvio_de
       where r.wa_id = m.cita_wa_id and r.conversacion_id = c.id;
    else
      -- Sin citar: a la última reenviada, si fue hace menos de 15 minutos.
      select o.conversacion_id, r.creado_en into v_destino, v_reciente from whatsapp_mensajes r join whatsapp_mensajes o on o.id = r.reenvio_de
       where r.conversacion_id = c.id and r.sentido = 'salida' and o.sentido = 'entrada' order by r.creado_en desc limit 1;
      if v_reciente is null or v_reciente < now() - interval '15 minutes' then v_destino := null; end if;
    end if;
    if v_destino is null then
      s := whatsapp_salida_movil('No sé a qué conversación va tu mensaje: respóndeme citando (deslizando) el mensaje que te reenvié.');
      return s || jsonb_build_object('accion', 'avisar', 'cita', m.wa_id);
    end if;
    select * into t from whatsapp_conversaciones where id = v_destino;
    if t.id is null or t.telefono = v_movil then
      s := whatsapp_salida_movil('Esa conversación ya no existe.');
      return s || jsonb_build_object('accion', 'avisar', 'cita', m.wa_id);
    end if;
    v_nombre := whatsapp_nombre(t.id);
    if m.boton_id like 'tomo:%' then
      update whatsapp_conversaciones set tomada_en = now(), tomada_desde = 'movil' where id = t.id;
      return jsonb_build_object('accion', 'reaccion', 'telefono', v_movil, 'wa_id', m.wa_id, 'emoji', '👍', 'conversacion', t.id);
    end if;
    if m.boton_id like 'claude:%' or (m.tipo = 'texto' and lower(unaccent_simple(btrim(coalesce(m.texto, '')))) ~ '^claude[ .!]*$') then
      update whatsapp_conversaciones set tomada_en = null, tomada_desde = null where id = t.id;
      s := whatsapp_salida_movil('Hecho: ' || v_nombre || ' vuelve a Claude.');
      return s || jsonb_build_object('accion', 'avisar', 'cita', m.wa_id, 'conversacion', t.id);
    end if;
    if m.tipo not in ('texto', 'imagen', 'documento', 'audio', 'video') or (m.tipo = 'texto' and nullif(btrim(coalesce(m.texto, '')), '') is null) then
      s := whatsapp_salida_movil('Eso no se puede pasar a ' || v_nombre || ': manda texto, foto, PDF, audio o vídeo.');
      return s || jsonb_build_object('accion', 'avisar', 'cita', m.wa_id);
    end if;
    if t.ultima_entrada_en is null or t.ultima_entrada_en < now() - interval '24 hours' then
      s := whatsapp_salida_movil('No se ha mandado a ' || v_nombre || ': han pasado más de 24 h desde su último mensaje y Meta solo deja escribirle con una plantilla aprobada.');
      return s || jsonb_build_object('accion', 'avisar', 'cita', m.wa_id);
    end if;
    insert into whatsapp_mensajes (conversacion_id, sentido, tipo, texto, meta_archivo_id, archivo_tipo, archivo_nombre, estado, origen, desde_movil, reenvio_de)
    values (t.id, 'salida', m.tipo, m.texto, m.meta_archivo_id, m.archivo_tipo, m.archivo_nombre, 'pendiente', 'persona', true, m.id) returning id into v_msg;
    update whatsapp_conversaciones set tomada_en = now(), tomada_desde = 'movil', ultimo_mensaje_en = now(), sin_leer = 0,
           ultimo_texto = left(coalesce(m.texto, case m.tipo when 'imagen' then '📷 Foto' when 'documento' then '📄 Documento' when 'audio' then '🎤 Nota de voz' else '🎬 Vídeo' end), 200)
     where id = t.id;
    update whatsapp_mensajes set leido_en = now() where conversacion_id = t.id and sentido = 'entrada' and leido_en is null;
    return jsonb_build_object('accion', 'responder', 'mensaje_id', v_msg, 'telefono', t.telefono, 'tipo', m.tipo, 'texto', m.texto,
      'meta_archivo_id', m.meta_archivo_id, 'archivo_tipo', m.archivo_tipo, 'archivo_nombre', m.archivo_nombre,
      'nombre', v_nombre, 'confirmar', jsonb_build_object('telefono', v_movil, 'wa_id', m.wa_id));
  end if;

  -- B) Escribe otra persona: ¿se reenvía al móvil de Dynamo?
  if m.tipo in ('reaccion', 'boton') then return jsonb_build_object('accion', 'nada'); end if;
  v_tomada := c.tomada_en is not null and c.tomada_en > now() - make_interval(hours => v_horas);
  v_txt := lower(unaccent_simple(coalesce(m.texto, '')));
  v_importante := v_tomada
    or (c.quien = 'desconocido' and coalesce((parametro('whatsapp_reenviar_desconocidos') #>> '{}')::boolean, true))
    or exists (select 1 from regexp_split_to_table(coalesce(parametro('whatsapp_palabras_persona') #>> '{}', ''), ',') w
                where btrim(w) <> '' and v_txt ~ ('\m' || regexp_replace(lower(unaccent_simple(btrim(w))), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g')));
  if v_modo = 'nada' or (v_modo = 'importante' and not v_importante) then return jsonb_build_object('accion', 'nada'); end if;
  v_nombre := whatsapp_nombre(c.id);
  v_contenido := coalesce(nullif(btrim(coalesce(m.texto, '')), ''),
    case m.tipo when 'imagen' then '📷 Foto' when 'documento' then '📄 Documento' when 'audio' then '🎤 Nota de voz' when 'video' then '🎬 Vídeo'
                when 'ubicacion' then '📍 Ubicación' when 'contacto' then '👤 Contacto' else 'Mensaje' end);
  s := whatsapp_salida_movil('*' || v_nombre || '*' || E'\n' || v_contenido || case when v_tomada then E'\n_(La llevas tú)_' else '' end, m.id);
  return s || jsonb_build_object('accion', 'reenviar', 'conversacion', c.id, 'nombre', v_nombre, 'contenido', v_contenido, 'tomada', v_tomada,
    'tipo', m.tipo, 'meta_archivo_id', m.meta_archivo_id, 'archivo_tipo', m.archivo_tipo, 'archivo_nombre', m.archivo_nombre,
    'plantilla', nullif(btrim(coalesce(parametro('whatsapp_plantilla_reenvio') #>> '{}', '')), ''));
end $$;
comment on function public.whatsapp_tras_entrada(uuid) is '[Gestión interna] Decide qué hacer con un mensaje de WhatsApp recién guardado. Si lo escribe el móvil de Dynamo: «Tomo yo», «Que conteste Claude» (botón o «Claude» citando) o una respuesta a un reenvío, que se deja preparada para quien escribió (solo dentro de sus 24 h). Si lo escribe otra persona: según el modo (todo, importante, nada), se deja preparado el reenvío al móvil de Dynamo. No manda nada: devuelve qué mandar y el servidor lo manda. Nada si WhatsApp está apagado o no hay móvil de Dynamo. Quién: solo el servidor. Argumentos: p_mensaje: el mensaje que llegó.';
revoke all on function public.whatsapp_tras_entrada(uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_tras_entrada(uuid) to service_role;

-- ---- 5. «Tomo yo» desde el panel y contestar desde el panel también la toma ------------------------
create or replace function public.whatsapp_tomar(p_conversacion uuid, p_tomar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not ve_todo() or es_solo_lectura() then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  update whatsapp_conversaciones set tomada_en = case when p_tomar then now() end, tomada_desde = case when p_tomar then 'panel' end
   where id = p_conversacion;
end $$;
comment on function public.whatsapp_tomar(uuid, boolean) is '[Gestión interna] «Tomo yo» (la lleva una persona y Claude no contesta) o «Que conteste Claude» desde la bandeja del panel. Quién: equipo de Dynamo (no los de solo lectura). Argumentos: p_conversacion: la conversación; p_tomar: true = Tomo yo; false = se la devuelve a Claude.';
revoke all on function public.whatsapp_tomar(uuid, boolean) from public, anon;
grant execute on function public.whatsapp_tomar(uuid, boolean) to authenticated;

do $$ declare v text; v_old text;
begin
  select pg_get_functiondef('public.whatsapp_preparar_respuesta(uuid, text)'::regprocedure) into v; v_old := v;
  v := replace(v, $a$update whatsapp_conversaciones set ultimo_mensaje_en = now(), ultimo_texto = left(v_texto, 200), sin_leer = 0 where id = c.id;$a$,
    $a$update whatsapp_conversaciones set ultimo_mensaje_en = now(), ultimo_texto = left(v_texto, 200), sin_leer = 0, tomada_en = now(), tomada_desde = 'panel' where id = c.id;$a$);
  if v = v_old then raise exception 'whatsapp_preparar_respuesta: no se ha podido poner al día (ha cambiado el texto de la función)'; end if;
  execute v;
end $$;
