-- =====================================================================================
-- Datos de prueba EN SEGUNDO PLANO (2026-11-06). SOLO PARA EL PROYECTO DE PRUEBAS.
--
-- El SQL Editor de Supabase corta la conexión a los pocos minutos («SQL query ran into an
-- upstream timeout») y cargar_datos_de_prueba() tarda 10-18 min. Aquí la carga se deja
-- encargada y la ejecuta el reloj de la base de datos (pg_cron), sin pasar por el editor:
--
--   select programar_datos_de_prueba('SI, ES EL PROYECTO DE PRUEBAS', 1, 'clave', '[…]');
--     → responde al instante; en menos de un minuto arranca la carga por detrás.
--   select estado_datos_de_prueba();
--     → en qué va (pendiente, en curso, hecha o error) y cuántas filas hay ya.
--
-- La petición (con la contraseña y las cuentas reales, que el cargador necesita en claro
-- para crear los usuarios) se guarda en datos_de_prueba_peticiones; al terminar se borran
-- la contraseña y los datos personales de la fila y se desprograma el reloj. Como todo lo
-- de datos de prueba: solo desde la consola (nunca anon, authenticated ni service_role).
-- Sin pg_cron (la base de datos de pruebas del arnés), programar_… carga en el acto.
-- =====================================================================================

create table if not exists public.datos_de_prueba_peticiones (
  id              bigint generated always as identity primary key,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'hecha', 'error')),
  escala          numeric(4,2) not null default 1 check (escala > 0 and escala <= 1),
  clave_cuentas   text,
  cuentas_reales  jsonb,
  jobid           bigint,
  resultado       jsonb,
  error           text,
  creada_en       timestamptz not null default now(),
  empezada_en     timestamptz,
  terminada_en    timestamptz
);
alter table public.datos_de_prueba_peticiones enable row level security;
revoke all on table public.datos_de_prueba_peticiones from public, anon, authenticated, service_role;
comment on table public.datos_de_prueba_peticiones is 'SOLO PROYECTO DE PRUEBAS. Encargos de carga de datos de prueba que ejecuta pg_cron en segundo plano (programar_datos_de_prueba). La contraseña y las cuentas reales se borran de la fila al terminar. Solo consola: ningún rol de la API la ve.';
comment on column public.datos_de_prueba_peticiones.id is 'formato: entero | rango: > 0 | lista: no aplica | automático | Identificador del encargo.';
comment on column public.datos_de_prueba_peticiones.estado is 'formato: texto | rango: no aplica | lista: pendiente, en_curso, hecha, error | automático | En qué va la carga.';
comment on column public.datos_de_prueba_peticiones.escala is 'formato: número decimal (2 decimales) | rango: > 0 y <= 1 | lista: no aplica | obligatorio | Volumen a cargar: 1 = completo, 0,3 = el 30 %.';
comment on column public.datos_de_prueba_peticiones.clave_cuentas is 'formato: texto | rango: >= 12 caracteres | lista: no aplica | opcional | Contraseña de las cuentas de prueba, solo mientras la carga está pendiente o en curso; se borra al terminar.';
comment on column public.datos_de_prueba_peticiones.cuentas_reales is 'formato: json | rango: no aplica | lista: no aplica | opcional | Cuentas reales a crear [{email, telefono, rol, nombre}], solo hasta que termina la carga; después se borra.';
comment on column public.datos_de_prueba_peticiones.jobid is 'formato: entero | rango: no aplica | lista: no aplica | automático | Tarea de pg_cron que ejecuta el encargo (se desprograma al terminar).';
comment on column public.datos_de_prueba_peticiones.resultado is 'formato: json | rango: no aplica | lista: no aplica | automático | Lo que devolvió cargar_datos_de_prueba() (tiempos, filas, cuentas creadas).';
comment on column public.datos_de_prueba_peticiones.error is 'formato: texto | rango: no aplica | lista: no aplica | automático | Mensaje de error si la carga falló.';
comment on column public.datos_de_prueba_peticiones.creada_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo se encargó.';
comment on column public.datos_de_prueba_peticiones.empezada_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo arrancó la carga.';
comment on column public.datos_de_prueba_peticiones.terminada_en is 'formato: fecha y hora con zona | rango: no aplica | lista: no aplica | automático | Cuándo terminó (bien o con error).';

-- ---- Ejecutar el encargo pendiente (lo llama pg_cron cada minuto hasta que termina) ----
create or replace function public.ejecutar_datos_de_prueba_pendientes()
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare v_p datos_de_prueba_peticiones%rowtype; v_r jsonb; v_msg text; v_det text;
begin
  if not es_consola_supabase() then
    raise exception 'Solo desde la consola de Supabase o pg_cron.' using errcode = '42501';
  end if;
  -- Nunca dos cargas a la vez (pg_cron vuelve a llamar cada minuto mientras dura la primera).
  if not pg_try_advisory_xact_lock(hashtext('datos_de_prueba')) then
    return jsonb_build_object('resultado', 'en_curso');
  end if;
  -- Sin tope de tiempo por consulta en esta sesión (la carga tarda 10-18 min).
  perform set_config('statement_timeout', '0', true);
  perform set_config('idle_in_transaction_session_timeout', '0', true);
  select * into v_p from datos_de_prueba_peticiones where estado = 'pendiente' order by id limit 1;
  if not found then
    -- Nada pendiente: si queda un reloj programado, se quita.
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
      execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'dynamo-datos-de-prueba'$q$;
    end if;
    return jsonb_build_object('resultado', 'nada_pendiente');
  end if;
  -- Se marca como en curso en una transacción aparte NO es posible desde aquí (todo va en
  -- la del reloj), así que el estado «en_curso» se ve solo si la carga acaba: mientras
  -- tanto, estado_datos_de_prueba() mira si hay una transacción con el candado.
  begin
    v_r := cargar_datos_de_prueba('SI, ES EL PROYECTO DE PRUEBAS', v_p.escala, v_p.clave_cuentas, v_p.cuentas_reales);
    update datos_de_prueba_peticiones
       set estado = 'hecha', resultado = v_r, clave_cuentas = null, cuentas_reales = null, empezada_en = coalesce(empezada_en, now()), terminada_en = clock_timestamp()
     where id = v_p.id;
  exception when others then
    get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
    -- La carga entera se ha deshecho (una sola transacción); queda el motivo.
    update datos_de_prueba_peticiones
       set estado = 'error', error = v_msg || coalesce(' · ' || nullif(v_det, ''), ''), clave_cuentas = null, cuentas_reales = null, empezada_en = coalesce(empezada_en, now()), terminada_en = clock_timestamp()
     where id = v_p.id;
    v_r := jsonb_build_object('resultado', 'error', 'error', v_msg);
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'dynamo-datos-de-prueba'$q$;
  end if;
  -- Estadísticas al día para el planificador (con 60.000 envíos nuevos hace falta).
  analyze;
  return v_r;
end $$;
revoke all on function public.ejecutar_datos_de_prueba_pendientes() from public, anon, authenticated, service_role;
comment on function public.ejecutar_datos_de_prueba_pendientes() is 'SOLO PROYECTO DE PRUEBAS. Ejecuta el encargo de datos de prueba pendiente (lo llama pg_cron cada minuto hasta terminar): carga, guarda el resultado o el error, borra la contraseña y las cuentas de la fila, desprograma el reloj y hace analyze. Solo consola o pg_cron.';

-- ---- Encargar la carga -----------------------------------------------------------------
create or replace function public.programar_datos_de_prueba(
  p_confirmacion   text,
  p_escala         numeric default 1,
  p_clave_cuentas  text    default null,
  p_cuentas_reales jsonb   default null)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare v_id bigint; v_job bigint;
begin
  if not es_consola_supabase() then
    raise exception 'Los datos de prueba solo se cargan desde la consola de Supabase (SQL Editor).' using errcode = '42501';
  end if;
  if p_confirmacion is distinct from 'SI, ES EL PROYECTO DE PRUEBAS' then
    raise exception 'Escribe exactamente «SI, ES EL PROYECTO DE PRUEBAS» para confirmar que esta base de datos es la de pruebas.' using errcode = '22023';
  end if;
  if p_escala is null or p_escala <= 0 or p_escala > 1 then
    raise exception 'La escala tiene que estar entre 0 (sin incluir) y 1 (volumen completo).' using errcode = '22023';
  end if;
  if p_clave_cuentas is not null and length(p_clave_cuentas) < 12 then
    raise exception 'La contraseña de las cuentas de prueba tiene que tener al menos 12 caracteres.' using errcode = '22023';
  end if;
  if p_cuentas_reales is not null and (jsonb_typeof(p_cuentas_reales) <> 'array' or p_clave_cuentas is null) then
    raise exception 'p_cuentas_reales es una lista [{email, telefono, rol, nombre}] y necesita p_clave_cuentas.' using errcode = '22023';
  end if;
  if exists (select 1 from datos_de_prueba_peticiones where estado = 'pendiente') then
    return jsonb_build_object('resultado', 'ya_programada', 'mensaje', 'Ya hay una carga pendiente o en curso. Mira estado_datos_de_prueba().');
  end if;
  if exists (select 1 from clientes where 'dato_de_prueba' = any (tags)) or exists (select 1 from usuarios where email ilike '%@prueba.invalid') then
    return jsonb_build_object('resultado', 'ya_cargados', 'mensaje', 'Ya hay datos de prueba. Bórralos antes con borrar_datos_de_prueba(''SI, ES EL PROYECTO DE PRUEBAS'').');
  end if;
  insert into datos_de_prueba_peticiones (escala, clave_cuentas, cuentas_reales) values (p_escala, p_clave_cuentas, p_cuentas_reales) returning id into v_id;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'dynamo-datos-de-prueba'$q$;
    -- (SQL dinámico: sin pg_cron el esquema cron no existe y la función no compilaría.)
    execute $q$select cron.schedule('dynamo-datos-de-prueba', '* * * * *', 'select public.ejecutar_datos_de_prueba_pendientes()')$q$ into v_job;
    update datos_de_prueba_peticiones set jobid = v_job where id = v_id;
    return jsonb_build_object('resultado', 'programada', 'peticion', v_id,
      'mensaje', 'La carga arranca en menos de un minuto y tarda 10-18 min (menos con escala < 1). Mira cómo va con: select estado_datos_de_prueba();');
  end if;
  -- Sin pg_cron (arnés de pruebas): en el acto.
  return jsonb_build_object('resultado', 'cargada_en_el_acto', 'peticion', v_id, 'carga', ejecutar_datos_de_prueba_pendientes());
end $$;
revoke all on function public.programar_datos_de_prueba(text, numeric, text, jsonb) from public, anon, authenticated, service_role;
comment on function public.programar_datos_de_prueba(text, numeric, text, jsonb) is 'SOLO PROYECTO DE PRUEBAS. Encarga la carga de datos de prueba para que la ejecute pg_cron en segundo plano (el SQL Editor corta a los pocos minutos y la carga tarda 10-18 min). Mismos argumentos que cargar_datos_de_prueba; responde al instante. Seguimiento: estado_datos_de_prueba(). Solo consola. Argumentos: p_confirmacion: «SI, ES EL PROYECTO DE PRUEBAS» · p_escala (0-1) · p_clave_cuentas (>= 12 caracteres) · p_cuentas_reales [{email, telefono, rol, nombre}].';

-- ---- En qué va --------------------------------------------------------------------------
create or replace function public.estado_datos_de_prueba()
returns jsonb
language plpgsql stable
set search_path = public, extensions
as $$
declare v_cargando boolean; v_reloj boolean := false; v_ult datos_de_prueba_peticiones%rowtype;
begin
  if not es_consola_supabase() then
    raise exception 'Solo desde la consola de Supabase.' using errcode = '42501';
  end if;
  -- Si alguien tiene el candado, la carga está en marcha ahora mismo.
  v_cargando := exists (select 1 from pg_locks where locktype = 'advisory' and objid = hashtext('datos_de_prueba')::bigint & 4294967295 and granted and pid <> pg_backend_pid());
  select * into v_ult from datos_de_prueba_peticiones order by id desc limit 1;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select exists (select 1 from cron.job where jobname = 'dynamo-datos-de-prueba')$q$ into v_reloj;
  end if;
  return jsonb_build_object(
    'cargando_ahora', v_cargando,
    'ultima_peticion', case when v_ult.id is null then null else jsonb_build_object(
      'id', v_ult.id, 'estado', case when v_ult.estado = 'pendiente' and v_cargando then 'en_curso' else v_ult.estado end,
      'escala', v_ult.escala, 'creada_en', v_ult.creada_en, 'terminada_en', v_ult.terminada_en,
      'minutos', round(extract(epoch from coalesce(v_ult.terminada_en, now()) - v_ult.creada_en) / 60),
      'error', v_ult.error, 'resultado', v_ult.resultado) end,
    'reloj_programado', v_reloj,
    'filas', contar_datos_de_prueba());
end $$;
revoke all on function public.estado_datos_de_prueba() from public, anon, authenticated, service_role;
comment on function public.estado_datos_de_prueba() is 'SOLO PROYECTO DE PRUEBAS. En qué va la carga de datos de prueba encargada con programar_datos_de_prueba(): si está cargando ahora, la última petición (estado, minutos, error o resultado), si el reloj sigue programado y cuántas filas de prueba hay ya. Solo consola.';
