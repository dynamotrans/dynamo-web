-- =====================================================================================
-- ALMACÉN DE ARCHIVOS (Supabase Storage): albaranes, CMR firmados, fotos de incidencias,
-- adjuntos de penalizaciones, documentación de transportistas, logo de los operadores
-- y documentos del alta.
-- =====================================================================================
-- Cómo va:
--   · Los ficheros viven en el bucket PRIVADO `documentos` (nunca público) y cada uno
--     tiene su fila en la tabla `documentos` (quién lo subió, cuándo, su huella sha256).
--   · Se sube directamente desde el navegador (sin pasar por Vercel, que limita el tamaño)
--     y se abre con un enlace firmado que caduca en un minuto.
--   · PERMISO = el de la fila: un fichero se puede descargar solo si su fila en
--     `documentos` es visible para quien lo pide. Una sola regla, la de la tabla.
--   · No se borra nada: «quitar» un documento es borrado suave de la fila (los ficheros
--     tienen valor de prueba: un albarán firmado no desaparece).

-- 1. A qué más puede pertenecer un documento ------------------------------------------
alter table documentos
  add column penalizacion_id uuid references penalizaciones(id) on delete restrict,
  add column operador_id     uuid references operadores(id)     on delete restrict,
  add column usuario_id      uuid references usuarios(id)       on delete restrict;
create index idx_documentos_pen on documentos (penalizacion_id) where penalizacion_id is not null;
create index idx_documentos_op  on documentos (operador_id)     where operador_id is not null;
create index idx_documentos_usu on documentos (usuario_id)      where usuario_id is not null;

alter table documentos drop constraint ck_documentos_dueno;
alter table documentos add constraint ck_documentos_dueno check (
  envio_id is not null or incidencia_id is not null or almacenamiento_id is not null
  or transportista_id is not null or penalizacion_id is not null or operador_id is not null
  or usuario_id is not null
);
alter table documentos drop constraint documentos_tipo_check;
alter table documentos add constraint documentos_tipo_check check (tipo in (
  'albaran', 'cmr', 'cmr_firmado', 'orden_transporte', 'proforma',
  'seguro_cmr', 'tarjeta_transporte', 'foto_incidencia', 'gps_tacografo',
  'hoja_cif', 'dni', 'logo', 'adjunto', 'otro'));

-- 2. Quién ve cada documento (la regla de siempre + los dueños nuevos) ----------------
drop policy if exists documentos_sel on documentos;
create policy documentos_sel on documentos for select using (
  es_admin()
  -- Cliente: lo marcado visible de lo suyo, y las fotos/adjuntos que sube él.
  or (not borrado
      and (visible_cliente
           or (creado_por = auth.uid() and tipo in ('foto_incidencia','adjunto')))
      and (envio_del_cliente(envio_id)
           or exists (select 1 from incidencias i
                      where i.id = documentos.incidencia_id and i.cliente_id = cliente_del_usuario())
           or exists (select 1 from almacenamientos a
                      where a.id = documentos.almacenamiento_id and a.cliente_id = cliente_del_usuario())))
  -- Cliente: el logo de SUS operadores (va en su orden de transporte).
  or (not borrado and tipo = 'logo'
      and exists (select 1 from operadores o where o.id = documentos.operador_id and o.cliente_id = cliente_del_usuario()))
  -- Cada usuario: los documentos de SU alta (hoja CIF, DNI).
  or (not borrado and usuario_id = auth.uid())
  -- Transportista: los de su ficha y los de sus viajes (orden de transporte, CMR…).
  or (not borrado and transportista_del_usuario() is not null
      and (documentos.transportista_id = transportista_del_usuario()
           or envio_del_transportista(envio_id)))
);

drop policy if exists documentos_ins on documentos;
create policy documentos_ins on documentos for insert with check (
  es_admin()
  -- El cliente: adjuntos de SUS incidencias y el logo de SUS operadores.
  or (tipo in ('foto_incidencia','adjunto') and incidencia_id is not null and envio_id is null
      and transportista_id is null and almacenamiento_id is null and penalizacion_id is null
      and operador_id is null and usuario_id is null
      and exists (select 1 from incidencias i where i.id = documentos.incidencia_id
                  and i.cliente_id = cliente_del_usuario()))
  or (tipo = 'logo' and operador_id is not null and envio_id is null and incidencia_id is null
      and transportista_id is null and almacenamiento_id is null and penalizacion_id is null and usuario_id is null
      and exists (select 1 from operadores o where o.id = documentos.operador_id and o.cliente_id = cliente_del_usuario()))
  -- Quien se registra: los documentos de su propia alta.
  or (tipo in ('hoja_cif','dni','otro') and usuario_id = auth.uid() and envio_id is null and incidencia_id is null
      and transportista_id is null and almacenamiento_id is null and penalizacion_id is null and operador_id is null)
);
-- Lo que suba alguien que no es Dynamo queda a su nombre, nunca a nombre de otro.
create or replace function fn_documentos_autor()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not es_admin() then new.creado_por := auth.uid(); new.visible_cliente := false; end if;
  return new;
end $$;
create trigger tg_documentos_autor before insert on documentos for each row execute function fn_documentos_autor();

-- 3. El bucket: privado, 25 MB por fichero, solo PDF e imágenes ----------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 26214400,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- 4. Permisos del fichero ----------------------------------------------------------------
-- Leer: si su fila en `documentos` es visible para quien lo pide (la subconsulta respeta
-- la seguridad por filas de `documentos`).
drop policy if exists documentos_fichero_leer on storage.objects;
create policy documentos_fichero_leer on storage.objects for select to authenticated using (
  bucket_id = 'documentos'
  and exists (select 1 from public.documentos d where d.storage_bucket = storage.objects.bucket_id
              and d.storage_ruta = storage.objects.name)
);
-- Subir: Dynamo, a cualquier carpeta. Los demás, solo a la carpeta de su usuario
-- (`u/<su id>/...`): después la fila de `documentos` decide a qué cuelga y si puede.
drop policy if exists documentos_fichero_subir on storage.objects;
create policy documentos_fichero_subir on storage.objects for insert to authenticated with check (
  bucket_id = 'documentos'
  and (public.es_admin() or name like 'u/' || auth.uid()::text || '/%')
);
-- Sin políticas de modificar ni borrar: un fichero subido no se cambia ni se borra.
