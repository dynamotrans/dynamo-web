-- =====================================================================================
-- RECURSOS: documentos que sube el equipo de Dynamo para todos (sin tocar código)
-- =====================================================================================
-- Decisión del usuario (2026-11-04): en la pantalla Recursos, un botón «Subir documento»
-- para que Dynamo publique condiciones, guías, certificados… Cada uno con su título y una
-- línea de descripción, y lo ve cualquier usuario con la cuenta activa.
--
--   · Son filas normales de `documentos` (mismo almacén privado, misma huella sha256,
--     mismo borrado suave) marcadas `es_recurso`, sin ningún otro dueño.
--   · Las sube y las quita SOLO Dynamo (gestor): nadie más puede marcar un documento como
--     recurso, porque eso lo haría visible a todos (lo impide un trigger).
-- =====================================================================================
alter table documentos add column es_recurso boolean not null default false;
alter table documentos add column recurso_titulo text check (recurso_titulo is null or length(recurso_titulo) between 1 and 120);
alter table documentos add column recurso_descripcion text check (recurso_descripcion is null or length(recurso_descripcion) <= 300);

alter table documentos drop constraint ck_documentos_dueno;
alter table documentos add constraint ck_documentos_dueno check (
  envio_id is not null or incidencia_id is not null or almacenamiento_id is not null
  or transportista_id is not null or penalizacion_id is not null or operador_id is not null
  or usuario_id is not null or es_recurso
);
-- Un recurso no cuelga de nada más, y lleva título.
alter table documentos add constraint ck_documentos_recurso check (
  not es_recurso or (recurso_titulo is not null
    and envio_id is null and incidencia_id is null and almacenamiento_id is null and transportista_id is null
    and penalizacion_id is null and operador_id is null and usuario_id is null)
);

-- Solo Dynamo marca (o desmarca) un documento como recurso.
create or replace function fn_documentos_recurso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not es_admin()
     and (new.es_recurso or (tg_op = 'UPDATE' and old.es_recurso)) then
    raise exception 'Solo el equipo de Dynamo publica documentos en Recursos.';
  end if;
  return new;
end $$;
create trigger tg_documentos_recurso before insert or update on documentos
  for each row execute function fn_documentos_recurso();

-- Leer: cualquier usuario con la cuenta activa (el fichero lo abre la política del bucket,
-- que mira si puede ver esta fila).
create policy documentos_sel_recurso on documentos for select to authenticated using (
  es_recurso and not borrado
  and exists (select 1 from usuarios u where u.id = auth.uid() and u.estado = 'activa')
);

create index idx_documentos_recursos on documentos (creado_en desc) where es_recurso and not borrado;
