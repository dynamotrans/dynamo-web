-- VERIFICACIÓN DE ALBARANES (usuario, 2026-11-22). Los albaranes, CMR y DeCA firmados que mandan
-- los transportistas por email ya los clasifica la tarea programada de Claude y los deja en Drive
-- (carpeta 02-ALBARANES, con nombre «GX66081_ALB_20261030_<origen>_<destino>_<matrículas>.pdf»).
-- Un script aparte de Google (no toca el sistema actual) los sube a la plataforma por una
-- entrada con clave secreta; aquí quedan EN ESPERA, sin que el cliente los vea, hasta que Dynamo
-- los revisa en «Verificación de albaranes»:
--   · Aceptar  → pasa a los documentos del envío, VISIBLE para el cliente (y se le avisa).
--   · Rechazar → se borra el archivo (lo sube Dynamo a mano si hace falta): p. ej. lleva hojas
--                con nuestros precios o es una factura del transportista metida por error.
--   · Dejar pendiente → no cambia nada: vuelve a salir la próxima vez.
--   · Cambiar el envío (GX) si la clasificación lo asignó mal: cambia también el nombre.

-- 1. La bandeja de entrada ----------------------------------------------------------------------
create table if not exists documentos_entrada (
  id                    uuid primary key default gen_random_uuid(),
  estado                text not null default 'subiendo' check (estado in ('subiendo', 'pendiente', 'aceptado', 'rechazado')),
  tipo                  text not null default 'albaran' check (tipo in ('albaran', 'cmr_firmado', 'otro')),
  nombre_archivo        text not null check (length(nombre_archivo) between 1 and 200),
  storage_ruta          text not null unique,
  tipo_mime             text,
  tamano_bytes          bigint check (tamano_bytes is null or tamano_bytes between 0 and 26214400),
  sha256                text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  origen                text not null default 'drive' check (origen in ('drive', 'email', 'manual')),
  origen_id             text unique,
  referencia_detectada  text,
  envio_id              uuid references envios(id) on delete set null,
  datos                 jsonb not null default '{}'::jsonb,
  recibido_en           timestamptz not null default now(),
  revisado_en           timestamptz,
  revisado_por          uuid references usuarios(id) on delete set null,
  motivo_rechazo        text check (motivo_rechazo is null or length(motivo_rechazo) <= 500),
  documento_id          uuid references documentos(id) on delete set null
);
create unique index if not exists documentos_entrada_sha_vivo on documentos_entrada (sha256) where sha256 is not null and estado in ('pendiente', 'aceptado');
create index if not exists documentos_entrada_pendientes on documentos_entrada (estado, recibido_en);
comment on table documentos_entrada is 'Bandeja de entrada de albaranes, CMR y DeCA firmados que llegan de los transportistas (por la tarea que los clasifica y los deja en Drive). Esperan aquí, sin que el cliente los vea, hasta que Dynamo los acepta (pasan a los documentos del envío, visibles para el cliente) o los rechaza (se borra el archivo). Solo la ve el equipo de Dynamo.';
comment on column documentos_entrada.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador único.';
comment on column documentos_entrada.estado is 'formato: texto | rango: no aplica | lista: subiendo, pendiente, aceptado, rechazado | automático | subiendo: el archivo aún no ha llegado entero; pendiente: por revisar; aceptado: ya está en el envío, visible para el cliente; rechazado: archivo borrado. Ej. OK: pendiente';
comment on column documentos_entrada.tipo is 'formato: texto | rango: no aplica | lista: albaran, cmr_firmado, otro | obligatorio | Qué es, según el nombre del archivo (ALB, CMR, DECA → albarán); Dynamo lo puede cambiar al revisarlo. Ej. OK: albaran';
comment on column documentos_entrada.nombre_archivo is 'formato: texto | rango: 1 a 200 caracteres | lista: no aplica | obligatorio | Nombre del archivo; si se cambia el envío, se cambia la referencia GX del nombre. Ej. OK: GX66081_ALB_20261030_08185-LLICADEVALL_28936-MOSTOLES.pdf';
comment on column documentos_entrada.storage_ruta is 'formato: texto | rango: no aplica | lista: no aplica | automático | Dónde está el archivo en el almacén privado (bucket documentos, carpeta entrada/).';
comment on column documentos_entrada.tipo_mime is 'formato: texto | rango: no aplica | lista: application/pdf, image/jpeg, image/png… | automático | Tipo REAL del archivo, mirado en sus primeros bytes. Ej. OK: application/pdf';
comment on column documentos_entrada.tamano_bytes is 'formato: número entero | rango: 0 a 26.214.400 (25 MB) | lista: no aplica | automático | Tamaño del archivo.';
comment on column documentos_entrada.sha256 is 'formato: texto, 64 caracteres hexadecimales | rango: no aplica | lista: no aplica | automático | Huella del contenido: el mismo archivo no entra dos veces.';
comment on column documentos_entrada.origen is 'formato: texto | rango: no aplica | lista: drive, email, manual | automático | De dónde llegó. Ej. OK: drive';
comment on column documentos_entrada.origen_id is 'formato: texto | rango: hasta 200 caracteres | lista: no aplica | opcional | Identificador en el origen (el id del archivo en Drive): el mismo archivo no se sube dos veces.';
comment on column documentos_entrada.referencia_detectada is 'formato: texto, en mayúsculas | rango: hasta 20 caracteres | lista: no aplica | automático | Referencia GX leída del nombre del archivo (o la que puso Dynamo al cambiar el envío). Ej. OK: GX66081';
comment on column documentos_entrada.envio_id is 'formato: uuid | → envios.id | rango: no aplica | lista: no aplica | opcional | Envío al que se asigna (vacío si la referencia no casa con ningún envío).';
comment on column documentos_entrada.datos is 'formato: JSON | rango: no aplica | lista: no aplica | automático | Lo demás que trae el nombre o el origen (fecha, CP y población de origen y destino, matrículas, carpeta).';
comment on column documentos_entrada.recibido_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo llegó a la plataforma.';
comment on column documentos_entrada.revisado_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo se aceptó o rechazó.';
comment on column documentos_entrada.revisado_por is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | automático | Quién lo aceptó o rechazó.';
comment on column documentos_entrada.motivo_rechazo is 'formato: texto | rango: hasta 500 caracteres | lista: no aplica | opcional | Por qué se rechazó. Ej. OK: Lleva una hoja con nuestros precios';
comment on column documentos_entrada.documento_id is 'formato: uuid | → documentos.id | rango: no aplica | lista: no aplica | automático | El documento del envío que se creó al aceptarlo.';
alter table documentos_entrada enable row level security;
drop policy if exists documentos_entrada_sel on documentos_entrada;
create policy documentos_entrada_sel on documentos_entrada for select using ((select es_equipo_dynamo()));
drop policy if exists documentos_entrada_ve_todo on documentos_entrada;
create policy documentos_entrada_ve_todo on documentos_entrada for select using ((select ve_todo()));
drop trigger if exists tg_mantenimiento on documentos_entrada;
create trigger tg_mantenimiento before insert or update or delete on documentos_entrada
  for each row execute function fn_bloqueo_mantenimiento();

-- Referencia GX del nombre: «GX66081_ALB_…», «GX65451B_ALB_…» → GX66081 / GX65451B.
create or replace function public.referencia_gx_de_nombre(p_nombre text)
returns text language sql immutable set search_path = public as $$
  select upper(substring(coalesce(p_nombre, '') from '(?i)(GX\d{4,}[A-Z]?)'))
$$;
comment on function public.referencia_gx_de_nombre(text) is '[Ayudantes internos] La referencia GX que lleva el nombre de un archivo (GX + cifras y, a veces, una letra), en mayúsculas; null si no lleva. Quién: cualquiera. Argumentos: p_nombre: el nombre del archivo.';

-- El envío de una referencia: exacta, o sin la letra final (GX65451B → GX65451).
create or replace function public.envio_de_referencia_gx(p_ref text)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from envios where upper(referencia_gx) = upper(trim(p_ref)) limit 1),
    (select id from envios where upper(referencia_gx) = regexp_replace(upper(trim(p_ref)), '[A-Z]$', '') limit 1))
$$;
revoke execute on function public.envio_de_referencia_gx(text) from public, anon, authenticated;
comment on function public.envio_de_referencia_gx(text) is '[Ayudantes internos] El envío de una referencia GX (exacta, o sin la letra final de las partes B, C…), o null. Quién: interno (la bandeja de albaranes). Argumentos: p_ref: referencia GX.';

-- 2. Entrada (solo el servidor, con la clave secreta de la entrada) -----------------------------
create or replace function public.entrada_documento_iniciar(p_nombre text, p_origen text, p_origen_id text, p_datos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_nombre text := left(btrim(coalesce(p_nombre, '')), 200); v_id uuid := gen_random_uuid(); v_ext text; v_tipo text; r record;
begin
  if rol_de_la_llamada() in ('anon', 'authenticated') then return jsonb_build_object('resultado', 'solo_servidor'); end if;
  if v_nombre = '' then return jsonb_build_object('resultado', 'datos_no_validos'); end if;
  if p_origen_id is not null then
    select id, estado into r from documentos_entrada where origen_id = left(p_origen_id, 200);
    if r.id is not null and r.estado <> 'subiendo' then return jsonb_build_object('resultado', 'ya_existe', 'id', r.id, 'estado', r.estado); end if;
    if r.id is not null then   -- una subida anterior a medias: se reintenta en el mismo sitio
      return jsonb_build_object('resultado', 'ok', 'id', r.id, 'ruta', (select storage_ruta from documentos_entrada where id = r.id));
    end if;
  end if;
  -- Tope: 300 al día (la tarea manda unos pocos; más es un error o un abuso).
  if (select count(*) from documentos_entrada where recibido_en > now() - interval '1 day') >= 300 then
    return jsonb_build_object('resultado', 'demasiados');
  end if;
  v_ext := lower(coalesce(substring(v_nombre from '\.([A-Za-z0-9]{2,5})$'), 'pdf'));
  if v_ext not in ('pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif') then return jsonb_build_object('resultado', 'tipo_no_valido'); end if;
  v_tipo := case when v_nombre ~* '_CMR[_.]' then 'cmr_firmado' else 'albaran' end;
  insert into documentos_entrada (id, nombre_archivo, storage_ruta, origen, origen_id, tipo, datos)
  values (v_id, v_nombre, 'entrada/' || v_id || '.' || v_ext, coalesce(nullif(p_origen, ''), 'drive'), left(p_origen_id, 200), v_tipo, coalesce(p_datos, '{}'::jsonb));
  return jsonb_build_object('resultado', 'ok', 'id', v_id, 'ruta', 'entrada/' || v_id || '.' || v_ext);
end $$;
revoke execute on function public.entrada_documento_iniciar(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.entrada_documento_iniciar(text, text, text, jsonb) to service_role;
comment on function public.entrada_documento_iniciar(text, text, text, jsonb) is '[Envíos] Primer paso de la entrada de un albarán: apunta el archivo (estado subiendo) y dice dónde subirlo. Si ese archivo de Drive ya entró, responde ya_existe y no se sube otra vez. Tope de 300 al día. Devuelve resultado (ok con id y ruta, ya_existe, demasiados, tipo_no_valido, datos_no_validos, solo_servidor). Quién: solo el servidor (la entrada con clave secreta). Argumentos: p_nombre: nombre del archivo · p_origen: drive, email o manual · p_origen_id: id del archivo en el origen · p_datos: lo demás que se sepa.';

create or replace function public.entrada_documento_confirmar(p_id uuid, p_sha256 text, p_tamano bigint, p_mime text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d documentos_entrada; v_ref text; v_envio uuid; v_otro uuid;
begin
  if rol_de_la_llamada() in ('anon', 'authenticated') then return jsonb_build_object('resultado', 'solo_servidor'); end if;
  select * into d from documentos_entrada where id = p_id for update;
  if d.id is null then return jsonb_build_object('resultado', 'no_existe'); end if;
  if d.estado <> 'subiendo' then return jsonb_build_object('resultado', 'ya_existe', 'estado', d.estado); end if;
  -- El mismo contenido ya está (pendiente o aceptado): este sobra.
  select id into v_otro from documentos_entrada where sha256 = p_sha256 and estado in ('pendiente', 'aceptado') and id <> p_id limit 1;
  if v_otro is not null then
    delete from documentos_entrada where id = p_id;
    return jsonb_build_object('resultado', 'duplicado', 'ruta', d.storage_ruta, 'igual_que', v_otro);
  end if;
  v_ref := coalesce(nullif(upper(d.datos ->> 'referencia'), ''), referencia_gx_de_nombre(d.nombre_archivo));
  v_envio := case when v_ref is not null then envio_de_referencia_gx(v_ref) end;
  update documentos_entrada set estado = 'pendiente', sha256 = p_sha256, tamano_bytes = p_tamano, tipo_mime = left(p_mime, 100),
         referencia_detectada = left(v_ref, 20), envio_id = v_envio
   where id = p_id;
  return jsonb_build_object('resultado', 'ok', 'referencia', v_ref, 'envio_id', v_envio);
end $$;
revoke execute on function public.entrada_documento_confirmar(uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.entrada_documento_confirmar(uuid, text, bigint, text) to service_role;
comment on function public.entrada_documento_confirmar(uuid, text, bigint, text) is '[Envíos] Segundo paso de la entrada de un albarán, con el archivo ya subido y comprobado por el servidor: lo deja pendiente de revisar y lo asigna al envío de su referencia GX (del nombre). Si el mismo contenido ya estaba, lo descarta (duplicado). Devuelve resultado (ok con referencia y envio_id, duplicado con la ruta a borrar, ya_existe, no_existe, solo_servidor). Quién: solo el servidor. Argumentos: p_id: documentos_entrada.id · p_sha256: huella del archivo · p_tamano: bytes · p_mime: tipo real.';

-- 3. Revisión (equipo de Dynamo) ----------------------------------------------------------------
create or replace function public.verificacion_albaranes_lista()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (es_equipo_dynamo() or ve_todo()) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'tipo', d.tipo, 'nombre_archivo', d.nombre_archivo, 'tipo_mime', d.tipo_mime, 'tamano_bytes', d.tamano_bytes,
      'referencia', d.referencia_detectada, 'recibido_en', d.recibido_en, 'datos', d.datos,
      'envio', case when e.id is null then null else jsonb_build_object(
        'id', e.id, 'referencia', e.referencia_gx, 'estado', e.estado, 'cliente', c.nombre_visible,
        'transportista', t.nombre_visible, 'fecha_carga', coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde),
        'origen', (select p.poblacion from envio_paradas p where p.envio_id = e.id order by p.orden limit 1),
        'destino', (select p.poblacion from envio_paradas p where p.envio_id = e.id order by p.orden desc limit 1),
        'documentos_visibles', (select count(*) from documentos x where x.envio_id = e.id and not x.borrado and x.visible_cliente and x.tipo in ('albaran', 'cmr_firmado'))) end)
      order by d.recibido_en)
    from documentos_entrada d
    left join envios e on e.id = d.envio_id
    left join clientes c on c.id = e.cliente_id
    left join transportistas t on t.id = e.transportista_id
   where d.estado = 'pendiente'), '[]'::jsonb);
end $$;
revoke execute on function public.verificacion_albaranes_lista() from public, anon;
grant execute on function public.verificacion_albaranes_lista() to authenticated;
comment on function public.verificacion_albaranes_lista() is '[Envíos] Los albaranes pendientes de verificar, del más antiguo al más nuevo, con el envío al que van (referencia, estado, cliente, transportista, fecha de carga, origen, destino y cuántos albaranes visibles tiene ya). Quién: el equipo de Dynamo (a los demás, lista vacía). Argumentos: sin argumentos.';

create or replace function public.verificacion_albaran_aceptar(p_id uuid, p_tipo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d documentos_entrada; v_doc uuid; v_tipo text;
begin
  if not es_equipo_dynamo() then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  if es_solo_lectura() then raise exception 'Tu usuario es de solo lectura.' using errcode = '42501'; end if;
  select * into d from documentos_entrada where id = p_id for update;
  if d.id is null or d.estado <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
  if d.envio_id is null then return jsonb_build_object('resultado', 'sin_envio'); end if;
  v_tipo := coalesce(nullif(p_tipo, ''), d.tipo);
  if v_tipo not in ('albaran', 'cmr_firmado', 'otro') then return jsonb_build_object('resultado', 'tipo_no_valido'); end if;
  -- Al documento del envío, ya VISIBLE para el cliente: el aviso «Albarán disponible» (campana
  -- y email) lo da el disparador de documentos, como con cualquier albarán.
  insert into documentos (tipo, envio_id, storage_bucket, storage_ruta, nombre_archivo, tipo_mime, tamano_bytes, sha256, visible_cliente)
  values (v_tipo, d.envio_id, 'documentos', d.storage_ruta, d.nombre_archivo, d.tipo_mime, d.tamano_bytes, d.sha256, true)
  returning id into v_doc;
  update documentos_entrada set estado = 'aceptado', tipo = v_tipo, documento_id = v_doc, revisado_en = now(), revisado_por = auth.uid() where id = p_id;
  return jsonb_build_object('resultado', 'ok', 'documento_id', v_doc);
end $$;
revoke execute on function public.verificacion_albaran_aceptar(uuid, text) from public, anon;
grant execute on function public.verificacion_albaran_aceptar(uuid, text) to authenticated;
comment on function public.verificacion_albaran_aceptar(uuid, text) is '[Envíos] Acepta un albarán de la bandeja: pasa a los documentos de su envío, VISIBLE para el cliente (que recibe el aviso de documento disponible). Exige que tenga envío. Devuelve resultado (ok con documento_id, sin_envio, no_pendiente, tipo_no_valido). Quién: el equipo de Dynamo (no los de solo lectura). Argumentos: p_id: documentos_entrada.id · p_tipo: albaran, cmr_firmado u otro (opcional; por defecto el detectado).';

create or replace function public.verificacion_albaran_rechazar(p_id uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d documentos_entrada;
begin
  if not es_equipo_dynamo() then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  if es_solo_lectura() then raise exception 'Tu usuario es de solo lectura.' using errcode = '42501'; end if;
  select * into d from documentos_entrada where id = p_id for update;
  if d.id is null or d.estado <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
  update documentos_entrada set estado = 'rechazado', motivo_rechazo = nullif(left(btrim(coalesce(p_motivo, '')), 500), ''),
         revisado_en = now(), revisado_por = auth.uid() where id = p_id;
  return jsonb_build_object('resultado', 'ok', 'ruta', d.storage_ruta);
end $$;
revoke execute on function public.verificacion_albaran_rechazar(uuid, text) from public, anon;
grant execute on function public.verificacion_albaran_rechazar(uuid, text) to authenticated;
comment on function public.verificacion_albaran_rechazar(uuid, text) is '[Envíos] Rechaza un albarán de la bandeja (p. ej. lleva nuestros precios o es una factura metida por error): queda rechazado y devuelve la ruta del archivo para que el servidor lo borre; el cliente nunca lo ve. Devuelve resultado (ok con ruta, no_pendiente). Quién: el equipo de Dynamo (no los de solo lectura). Argumentos: p_id: documentos_entrada.id · p_motivo: por qué (opcional).';

create or replace function public.verificacion_albaran_reasignar(p_id uuid, p_referencia text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d documentos_entrada; v_ref text := upper(regexp_replace(coalesce(p_referencia, ''), '\s', '', 'g')); v_envio uuid; v_nombre text;
begin
  if not es_equipo_dynamo() then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  if es_solo_lectura() then raise exception 'Tu usuario es de solo lectura.' using errcode = '42501'; end if;
  if v_ref ~ '^\d{4,}[A-Z]?$' then v_ref := 'GX' || v_ref; end if;    -- «66081» vale como GX66081
  if v_ref !~ '^GX\d{4,}[A-Z]?$' then return jsonb_build_object('resultado', 'referencia_no_valida'); end if;
  select * into d from documentos_entrada where id = p_id for update;
  if d.id is null or d.estado <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
  v_envio := envio_de_referencia_gx(v_ref);
  if v_envio is null then return jsonb_build_object('resultado', 'sin_envio'); end if;
  -- El nombre lleva la referencia nueva (en lugar de la vieja, o delante si no llevaba).
  v_nombre := case when referencia_gx_de_nombre(d.nombre_archivo) is not null
                   then regexp_replace(d.nombre_archivo, '(?i)GX\d{4,}[A-Z]?', v_ref)
                   else v_ref || '_' || d.nombre_archivo end;
  update documentos_entrada set envio_id = v_envio, referencia_detectada = v_ref, nombre_archivo = left(v_nombre, 200),
         datos = datos || jsonb_build_object('referencia_original', coalesce(datos ->> 'referencia_original', d.referencia_detectada))
   where id = p_id;
  return jsonb_build_object('resultado', 'ok', 'envio_id', v_envio, 'nombre_archivo', left(v_nombre, 200));
end $$;
revoke execute on function public.verificacion_albaran_reasignar(uuid, text) from public, anon;
grant execute on function public.verificacion_albaran_reasignar(uuid, text) to authenticated;
comment on function public.verificacion_albaran_reasignar(uuid, text) is '[Envíos] Cambia el envío de un albarán de la bandeja (la clasificación leyó mal la referencia): lo asigna al envío de la referencia GX nueva y cambia la referencia en el nombre del archivo, guardando la original. Devuelve resultado (ok con envio_id y nombre_archivo, sin_envio, referencia_no_valida, no_pendiente). Quién: el equipo de Dynamo (no los de solo lectura). Argumentos: p_id: documentos_entrada.id · p_referencia: GX nueva (con o sin «GX»).';

create or replace function public.verificacion_albaran_tipo(p_id uuid, p_tipo text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not es_equipo_dynamo() then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  if es_solo_lectura() then raise exception 'Tu usuario es de solo lectura.' using errcode = '42501'; end if;
  if p_tipo not in ('albaran', 'cmr_firmado', 'otro') then return jsonb_build_object('resultado', 'tipo_no_valido'); end if;
  update documentos_entrada set tipo = p_tipo where id = p_id and estado = 'pendiente';
  return jsonb_build_object('resultado', case when found then 'ok' else 'no_pendiente' end);
end $$;
revoke execute on function public.verificacion_albaran_tipo(uuid, text) from public, anon;
grant execute on function public.verificacion_albaran_tipo(uuid, text) to authenticated;
comment on function public.verificacion_albaran_tipo(uuid, text) is '[Envíos] Cambia qué es un albarán de la bandeja antes de aceptarlo. Quién: el equipo de Dynamo (no los de solo lectura). Argumentos: p_id: documentos_entrada.id · p_tipo: albaran, cmr_firmado u otro.';

-- 4. Contador del menú: albaranes por verificar ---------------------------------------------------
do $$
declare v_def text; v_aguja text := '''sugerencias'', (select count(*) from public.sugerencias where estado = ''activa''),';
begin
  select pg_get_functiondef('public.contadores_panel'::regproc) into v_def;
  if position('documentos_entrada' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_aguja, ''))) / length(v_aguja) <> 1 then
    raise exception 'No se encuentra (una sola vez) el contador de sugerencias en contadores_panel: revisar antes de aplicar.';
  end if;
  execute replace(v_def, v_aguja, v_aguja || E'\n      ''albaranes'', (select count(*) from public.documentos_entrada where estado = ''pendiente''),');
end $$;

-- 5. Limpieza: lo que se quedó «subiendo» más de un día (subida cortada) se borra de la bandeja.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dynamo-entrada-documentos-limpiar', '43 4 * * *', $c$delete from public.documentos_entrada where estado = 'subiendo' and recibido_en < now() - interval '1 day'$c$);
  end if;
end $$;
