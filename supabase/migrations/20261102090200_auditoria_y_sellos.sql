-- =====================================================================================
-- 0002 — AUDITORÍA Y SELLOS DE TIEMPO (regla 12 de CLAUDE.md)
-- =====================================================================================
-- VA ANTES DE CREAR CUALQUIER TABLA DE DATOS, A PROPÓSITO.
-- Si esto se monta después, los primeros registros nacen sin rastro y la auditoría
-- queda con un agujero permanente desde el día 1.
--
-- Regla 12, puntos 1-3:
--   1. Cada tabla lleva creado_en / creado_por / modificado_en / modificado_por
--   2. Tabla `auditoria` append-only con el antes y el después
--   3. Se impone con TRIGGERS DE POSTGRES, no desde el código de la aplicación
--      (si lo hace el front o la API, cualquier olvido se salta la auditoría)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. LA TABLA DE AUDITORÍA
-- -------------------------------------------------------------------------------------
create table auditoria (
  id           bigint generated always as identity primary key,
  tabla        text        not null,
  registro_id  text        not null,
  accion       text        not null check (accion in ('alta', 'modificacion', 'baja')),
  quien        uuid,                       -- auth.users.id; NULL = migración o proceso interno
  quien_email  text,                       -- copia congelada: el usuario puede cambiar de email
  quien_origen text        not null default 'app',   -- 'app' | 'migracion-sheet' | 'n8n' | 'sistema'
  cuando       timestamptz not null default now(),   -- HORA DEL SERVIDOR, nunca del navegador
  cambios      jsonb       not null default '{}'::jsonb
);

comment on table auditoria is
  'Append-only. Una fila por cada alta, modificacion y baja de cualquier tabla. '
  'NUNCA se edita ni se borra (lo impide el trigger tg_auditoria_inmutable).';
comment on column auditoria.cambios is
  'En alta: {"despues": {...}}. En baja: {"antes": {...}}. '
  'En modificacion: solo los campos tocados, {"campo": {"antes": x, "despues": y}}.';
comment on column auditoria.quien_email is
  'Copia del email en el momento del cambio. Se guarda aparte de `quien` porque un '
  'usuario puede cambiar de email o darse de baja, y el rastro tiene valor probatorio.';

create index idx_auditoria_registro on auditoria (tabla, registro_id, cuando desc);
create index idx_auditoria_quien    on auditoria (quien, cuando desc);
create index idx_auditoria_cuando   on auditoria (cuando desc);
-- Para buscar "quién tocó el precio" sin escanear la tabla entera:
create index idx_auditoria_cambios  on auditoria using gin (cambios);

-- -------------------------------------------------------------------------------------
-- 2. APPEND-ONLY DE VERDAD
-- -------------------------------------------------------------------------------------
-- Dos cinturones: permisos revocados Y trigger. Los permisos se pueden volver a
-- conceder por descuido; el trigger salta igual.
create or replace function fn_auditoria_inmutable()
returns trigger language plpgsql as $$
begin
  raise exception
    'La tabla auditoria es append-only (regla 12). Intento de % bloqueado.', tg_op;
end $$;

create trigger tg_auditoria_inmutable
  before update or delete or truncate on auditoria
  for each statement execute function fn_auditoria_inmutable();

revoke update, delete, truncate on auditoria from public;
alter table auditoria enable row level security;
-- Sin políticas = nadie lee por la API salvo service_role. El trigger de abajo es
-- SECURITY DEFINER y pertenece al owner, así que escribe igual. Las políticas de
-- lectura para admin llegan en 0012_rls_politicas.sql.

-- -------------------------------------------------------------------------------------
-- 3. SELLOS DE TIEMPO (las 4 columnas de la regla 12)
-- -------------------------------------------------------------------------------------
-- Se añaden con este bloque reutilizable, idéntico en todas las tablas:
--
--   creado_en      timestamptz not null default now(),
--   creado_por     uuid references auth.users(id) on delete set null,
--   modificado_en  timestamptz,
--   modificado_por uuid references auth.users(id) on delete set null
--
-- Nota: `creado_por` apunta a auth.users (la tabla de Supabase Auth) y NO a nuestra
-- tabla `usuarios`. Es a propósito: rompe la dependencia circular (usuarios necesita
-- clientes, clientes necesita saber quién lo creó) y sobrevive a que un perfil se borre.

create or replace function fn_sellar()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- Durante la migración del Sheet queremos CONSERVAR las fechas de alta originales
    -- (cliente_fecha_hora_registro_alta, fecha_hora_registro_carga...). Fuera de la
    -- migración, la fecha la pone SIEMPRE el servidor y no se puede falsear.
    --   Uso:  set local dynamo.migracion = 'on';
    if coalesce(current_setting('dynamo.migracion', true), '') = 'on' then
      new.creado_en := coalesce(new.creado_en, now());
    else
      new.creado_en := now();
    end if;
    new.creado_por     := coalesce(auth.uid(), new.creado_por);
    new.modificado_en  := null;
    new.modificado_por := null;
  else
    -- creado_en / creado_por son INMUTABLES: se restauran aunque el UPDATE los traiga.
    new.creado_en      := old.creado_en;
    new.creado_por     := old.creado_por;
    new.modificado_en  := now();
    new.modificado_por := coalesce(auth.uid(), new.modificado_por);
  end if;
  return new;
end $$;

comment on function fn_sellar() is
  'Pone creado_en/modificado_en con now() del SERVIDOR (regla 12: nunca la hora del '
  'navegador, que puede estar mal o manipulada) y hace inmutables los campos de alta.';

-- -------------------------------------------------------------------------------------
-- 4. EL TRIGGER DE AUDITORÍA, GENÉRICO PARA CUALQUIER TABLA
-- -------------------------------------------------------------------------------------
create or replace function fn_auditar()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_cambios jsonb := '{}'::jsonb;
  v_accion  text;
  v_id      text;
  v_uid     uuid := auth.uid();
  k         text;
  -- Campos que NO generan entrada de auditoría por sí solos: son el propio sello.
  v_ignorar text[] := array['modificado_en', 'modificado_por'];
begin
  if tg_op = 'INSERT' then
    v_new     := to_jsonb(new);
    v_id      := v_new ->> 'id';
    v_accion  := 'alta';
    v_cambios := jsonb_build_object('despues', v_new - v_ignorar);

  elsif tg_op = 'UPDATE' then
    v_old    := to_jsonb(old);
    v_new    := to_jsonb(new);
    v_id     := v_new ->> 'id';
    v_accion := 'modificacion';
    for k in select jsonb_object_keys(v_new) loop
      if not (k = any (v_ignorar)) and (v_old -> k) is distinct from (v_new -> k) then
        v_cambios := v_cambios || jsonb_build_object(
          k, jsonb_build_object('antes', v_old -> k, 'despues', v_new -> k)
        );
      end if;
    end loop;
    -- Un UPDATE que no cambia nada real no ensucia la auditoría.
    if v_cambios = '{}'::jsonb then
      return new;
    end if;

  else   -- DELETE
    v_old     := to_jsonb(old);
    v_id      := v_old ->> 'id';
    v_accion  := 'baja';
    v_cambios := jsonb_build_object('antes', v_old);
  end if;

  insert into auditoria (tabla, registro_id, accion, quien, quien_email, quien_origen, cambios)
  values (
    tg_table_name,
    v_id,
    v_accion,
    v_uid,
    (select u.email from auth.users u where u.id = v_uid),
    case when coalesce(current_setting('dynamo.migracion', true), '') = 'on'
         then 'migracion-sheet' else 'app' end,
    v_cambios
  );

  return coalesce(new, old);
end $$;

-- -------------------------------------------------------------------------------------
-- 5. ATAJO: activar sellos + auditoría en una tabla con una sola línea
-- -------------------------------------------------------------------------------------
-- Así las migraciones siguientes acaban con `select activar_rastro('clientes');` y es
-- imposible olvidarse de la mitad.
create or replace function activar_rastro(p_tabla text)
returns void language plpgsql as $$
begin
  execute format('drop trigger if exists tg_sellar_%1$s on %1$I', p_tabla);
  execute format(
    'create trigger tg_sellar_%1$s before insert or update on %1$I
       for each row execute function fn_sellar()', p_tabla);

  execute format('drop trigger if exists tg_auditar_%1$s on %1$I', p_tabla);
  execute format(
    'create trigger tg_auditar_%1$s after insert or update or delete on %1$I
       for each row execute function fn_auditar()', p_tabla);
end $$;

comment on function activar_rastro(text) is
  'Activa en una tabla el sellado de fecha/hora y la auditoria completa (regla 12). '
  'Llamar SIEMPRE justo despues de crear la tabla.';

-- -------------------------------------------------------------------------------------
-- 6. COMPROBACIÓN: ninguna tabla de datos sin rastro
-- -------------------------------------------------------------------------------------
-- Ejecutar esto después de cada migración. Si devuelve filas, falta un activar_rastro().
create or replace view v_tablas_sin_rastro as
select c.relname as tabla
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace
where  n.nspname = 'public'
  and  c.relkind = 'r'
  and  c.relname not in ('auditoria', 'recargos_tipo_lugar')
  and  not exists (
         select 1 from pg_trigger t
         where t.tgrelid = c.oid and t.tgname = 'tg_auditar_' || c.relname
       );

comment on view v_tablas_sin_rastro is
  'Chivato de la regla 12: si devuelve filas, esas tablas se pueden modificar sin dejar '
  'rastro. Revisar tras cada migracion.';
