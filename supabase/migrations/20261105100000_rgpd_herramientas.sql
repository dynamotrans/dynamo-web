-- =====================================================================================
-- RGPD: LIMPIEZA AUTOMÁTICA, ANONIMIZAR Y EXPORTAR DATOS (2026-11-05)
-- Las cuatro tareas técnicas de RGPD.md §6:
--  1. Cada noche (pg_cron), purgar_datos_personales():
--       · IP y navegador de las reservas de carga, y los registros de intentos (enlace de
--         carga, PIN, contraofertas): a los 90 días;
--       · tiempo conectado y consultas de precio: a los 12 meses;
--       · teléfono de los conductores sin viajes en 2 años.
--     Las firmas del CMR NO: son prueba (6 años).
--  2. anonimizar_usuario / anonimizar_contacto / anonimizar_conductor (solo el Admin
--     Master): borra los datos de la persona en su ficha (los contactos se vacían y se quitan). La auditoría apunta QUÉ campos
--     se borraron, sin guardar los valores. Los registros que son prueba (firmas del CMR,
--     auditoría anterior) se conservan bloqueados hasta que pase el plazo legal.
--  3. exportar_datos_usuario(): lo que la plataforma guarda de una persona, en JSON
--     (derecho de acceso y portabilidad). La propia persona, o Dynamo para responderle.
-- =====================================================================================

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
    -- Anonimización (RGPD): se apunta QUÉ campos se borraron, nunca sus valores.
    if coalesce(current_setting('dynamo.anonimizando', true), '') = 'on' then
      v_cambios := jsonb_build_object('anonimizado', true,
                     'campos', (select jsonb_agg(x order by x) from jsonb_object_keys(v_cambios) x));
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

-- ---- 1. Limpieza automática ---------------------------------------------------------
-- Las tablas de intentos son inalterables (append-only)… salvo para esta limpieza.
create or replace function fn_append_only_salvo_purga()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('dynamo.purga', true), '') = 'on' then return null; end if;
  raise exception 'La tabla % es append-only (regla 12). Intento de % bloqueado.', tg_table_name, tg_op;
end $$;
drop trigger if exists tg_intentos_carga_inmutable on intentos_carga_publica;
create trigger tg_intentos_carga_inmutable before update or delete or truncate on intentos_carga_publica
  for each statement execute function fn_append_only_salvo_purga();
drop trigger if exists tg_pin_intentos_inmutable on pin_intentos;
create trigger tg_pin_intentos_inmutable before update or delete or truncate on pin_intentos
  for each statement execute function fn_append_only_salvo_purga();

create or replace function purgar_datos_personales()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb := '{}'; n int;
begin
  if not (es_servidor() or es_consola_supabase() or es_administrador()) then
    raise exception 'Solo el sistema o el Admin Master.' using errcode = '42501';
  end if;
  perform set_config('dynamo.purga', 'on', true);
  perform set_config('dynamo.anonimizando', 'on', true);
  update envio_reservas set ip = null, navegador = null
   where coalesce(cerrada_en, desde) < now() - interval '90 days' and (ip is not null or navegador is not null);
  get diagnostics n = row_count; r := r || jsonb_build_object('reservas_ip', n);
  delete from intentos_carga_publica where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_carga', n);
  delete from pin_intentos where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_pin', n);
  delete from contraoferta_intentos where cuando < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('intentos_contraoferta', n);
  delete from conexion_minutos where dia < current_date - 365;
  get diagnostics n = row_count; r := r || jsonb_build_object('conexion', n);
  delete from consultas_precio where cuando < now() - interval '12 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('consultas', n);
  update conductores c set telefono = null
   where c.telefono is not null and c.creado_en < now() - interval '2 years'
     and not exists (select 1 from envios e where e.conductor_id = c.id
                      and coalesce(e.fecha_carga_real::date, e.fecha_carga_desde, e.creado_en::date) > current_date - 730);
  get diagnostics n = row_count; r := r || jsonb_build_object('telefonos_conductores', n);
  perform set_config('dynamo.purga', 'off', true);
  perform set_config('dynamo.anonimizando', 'off', true);
  return r;
end $$;
revoke execute on function purgar_datos_personales() from public, anon;
grant execute on function purgar_datos_personales() to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('dynamo-purga-rgpd', '53 4 * * *', 'select public.purgar_datos_personales()');
    exception when others then
      raise notice 'No se pudo programar la limpieza RGPD (%).', sqlerrm;
    end;
  end if;
end $$;

-- ---- 2. Anonimizar ------------------------------------------------------------------
create or replace function anonimizar_usuario(p_usuario uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare u usuarios%rowtype; v_email text;
begin
  if not es_administrador() then raise exception 'Solo el Admin Master anonimiza.' using errcode = '42501'; end if;
  select * into u from usuarios where id = p_usuario for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if u.rol not in ('cliente', 'transportista') then return jsonb_build_object('resultado', 'solo_clientes_y_transportistas'); end if;
  v_email := 'eliminado-' || left(replace(u.id::text, '-', ''), 12) || '@anonimo.invalid';
  perform set_config('dynamo.anonimizando', 'on', true);
  update usuarios set nombre = 'Persona eliminada', email = v_email, documento = null, telefono = null, cargo = null,
                      copias_avisos = '{}', estado = case when estado = 'pendiente_verificacion' then 'suspendida' else estado end
   where id = p_usuario;
  update usuarios set estado = 'suspendida', suspension_motivo = 'Datos eliminados a petición del interesado (RGPD)'
   where id = p_usuario and estado <> 'suspendida';
  delete from notas_internas where tabla = 'usuarios' and registro_id = p_usuario;
  -- Sus fichas de contacto: se vacían y se quitan (un contacto necesita teléfono o email).
  update contactos set nombre = 'Persona eliminada', telefono = null, email = 'eliminado@anonimo.invalid', cargo = null
   where lower(email) = lower(u.email);
  delete from contactos where email = 'eliminado@anonimo.invalid';
  perform set_config('dynamo.anonimizando', 'off', true);
  return jsonb_build_object('resultado', 'ok', 'email_anonimo', v_email);
end $$;
revoke execute on function anonimizar_usuario(uuid) from public, anon;
grant execute on function anonimizar_usuario(uuid) to authenticated;

create or replace function anonimizar_contacto(p_contacto uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not es_administrador() then raise exception 'Solo el Admin Master anonimiza.' using errcode = '42501'; end if;
  perform set_config('dynamo.anonimizando', 'on', true);
  update contactos set nombre = 'Persona eliminada', telefono = null, email = 'eliminado@anonimo.invalid', cargo = null where id = p_contacto;
  if not found then perform set_config('dynamo.anonimizando', 'off', true); return jsonb_build_object('resultado', 'no_existe'); end if;
  delete from contactos where id = p_contacto;
  perform set_config('dynamo.anonimizando', 'off', true);
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke execute on function anonimizar_contacto(uuid) from public, anon;
grant execute on function anonimizar_contacto(uuid) to authenticated;

create or replace function anonimizar_conductor(p_conductor uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not es_administrador() then raise exception 'Solo el Admin Master anonimiza.' using errcode = '42501'; end if;
  perform set_config('dynamo.anonimizando', 'on', true);
  update conductores set nombre = 'Conductor eliminado', documento = null, telefono = null where id = p_conductor;
  if not found then perform set_config('dynamo.anonimizando', 'off', true); return jsonb_build_object('resultado', 'no_existe'); end if;
  delete from notas_internas where tabla = 'conductores' and registro_id = p_conductor;
  -- En los envíos se queda el nombre (es parte del CMR, prueba); el teléfono, no.
  update envios set conductor_telefono = null where conductor_id = p_conductor and conductor_telefono is not null;
  perform set_config('dynamo.anonimizando', 'off', true);
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke execute on function anonimizar_conductor(uuid) from public, anon;
grant execute on function anonimizar_conductor(uuid) to authenticated;

-- ---- 3. Exportar ---------------------------------------------------------------------
create or replace function exportar_datos_usuario(p_usuario uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := coalesce(p_usuario, auth.uid()); u usuarios%rowtype;
begin
  if v is null then raise exception 'Sin sesión.' using errcode = '42501'; end if;
  if v <> auth.uid() and not ve_todo() then raise exception 'Solo tus datos.' using errcode = '42501'; end if;
  select * into u from usuarios where id = v;
  if not found then return null; end if;
  return jsonb_build_object(
    'generado_en', now(),
    'responsable', jsonb_build_object('empresa', (select valor #>> '{}' from parametros where clave = 'dynamo_razon_social'),
                                      'contacto', 'info@dynamotrans.com'),
    'cuenta', jsonb_build_object('email', u.email, 'nombre', u.nombre, 'telefono', u.telefono, 'documento', u.documento,
                                 'cargo', u.cargo, 'idioma', u.idioma, 'rol', u.rol, 'estado', u.estado,
                                 'suspension_motivo', u.suspension_motivo, 'creado_en', u.creado_en, 'ultima_conexion', u.ultima_conexion,
                                 'copias_avisos', u.copias_avisos),
    'empresa', coalesce((select jsonb_build_object('tipo', 'cliente', 'nombre', nombre_visible, 'cif', cif) from clientes where id = u.cliente_id),
                        (select jsonb_build_object('tipo', 'transportista', 'nombre', nombre_visible, 'cif', cif) from transportistas where id = u.transportista_id)),
    'como_contacto', coalesce((select jsonb_agg(jsonb_build_object('nombre', c.nombre, 'cargo', c.cargo, 'telefono', c.telefono, 'email', c.email, 'recibe_avisos', c.recibe_avisos))
                                 from contactos c where lower(c.email) = lower(u.email)), '[]'),
    'envios_creados', coalesce((select jsonb_agg(jsonb_build_object('referencia', e.referencia_gx, 'creado_en', e.creado_en, 'estado', e.estado,
                                   'fecha_carga', e.fecha_carga_desde) order by e.creado_en)
                                 from envios e where e.creado_por = v), '[]'),
    'firmas_cmr', coalesce((select jsonb_agg(jsonb_build_object('firmado_en', f.firmado_en, 'nombre', f.nombre, 'documento', f.documento, 'papel', f.rol))
                              from firmas_cmr f where u.email is not null and lower(f.email) = lower(u.email)), '[]'),
    'consultas_precio_12_meses', (select count(*) from consultas_precio where usuario_id = v),
    'tiempo_conectado_12_meses', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'minutos', minutos) order by dia)
                                             from conexion_minutos where usuario_id = v), '[]'),
    'nota', 'Esto es lo que la plataforma de Dynamo guarda sobre ti. Las anotaciones internas del equipo y los registros de seguridad se facilitan a petición por email a info@dynamotrans.com.'
  );
end $$;
revoke execute on function exportar_datos_usuario(uuid) from public, anon;
grant execute on function exportar_datos_usuario(uuid) to authenticated;
