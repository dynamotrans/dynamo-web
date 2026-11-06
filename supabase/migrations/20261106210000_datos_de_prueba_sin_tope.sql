-- =====================================================================================
-- Datos de prueba en segundo plano: sin tope de tiempo (2026-11-06).
--
-- Lo que pasó en dynamo-pruebas: las sesiones de pg_cron llevan un statement_timeout de
-- 2 minutos, y el `set_config('statement_timeout', '0')` DENTRO de la función llega tarde
-- (el contador ya está en marcha cuando empieza la consulta). Cada intento se cortaba a los
-- 2 min, se deshacía entero y el reloj lo relanzaba al minuto: un bucle sin fin.
--
-- Arreglo: el tope se quita en el PROPIO encargo del reloj, como sentencia aparte antes
-- de llamar a la función (en una cadena con varias sentencias el tope se aplica a cada
-- una por separado, y el SET de la primera vale para las siguientes). Además, si al
-- aplicar esta migración hay un encargo pendiente, se vuelve a programar el reloj con el
-- comando nuevo: la carga se reanuda sola, sin que haya que volver a pedirla.
-- =====================================================================================

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
    -- Ya hay un encargo: se asegura de que el reloj esté puesto (con el comando sin tope).
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
      perform reprogramar_reloj_datos_de_prueba();
    end if;
    return jsonb_build_object('resultado', 'ya_programada', 'mensaje', 'Ya hay una carga pendiente o en curso (el reloj queda puesto). Mira estado_datos_de_prueba().');
  end if;
  if exists (select 1 from clientes where 'dato_de_prueba' = any (tags)) or exists (select 1 from usuarios where email ilike '%@prueba.invalid') then
    return jsonb_build_object('resultado', 'ya_cargados', 'mensaje', 'Ya hay datos de prueba. Bórralos antes con borrar_datos_de_prueba(''SI, ES EL PROYECTO DE PRUEBAS'').');
  end if;
  insert into datos_de_prueba_peticiones (escala, clave_cuentas, cuentas_reales) values (p_escala, p_clave_cuentas, p_cuentas_reales) returning id into v_id;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    v_job := reprogramar_reloj_datos_de_prueba();
    update datos_de_prueba_peticiones set jobid = v_job where id = v_id;
    return jsonb_build_object('resultado', 'programada', 'peticion', v_id,
      'mensaje', 'La carga arranca en menos de un minuto y tarda 10-18 min (más en un proyecto pequeño; menos con escala < 1). Mira cómo va con: select estado_datos_de_prueba();');
  end if;
  -- Sin pg_cron (arnés de pruebas): en el acto.
  return jsonb_build_object('resultado', 'cargada_en_el_acto', 'peticion', v_id, 'carga', ejecutar_datos_de_prueba_pendientes());
end $$;

-- El reloj, con el comando SIN tope: quita el que hubiera y programa el nuevo. Devuelve el jobid.
create or replace function public.reprogramar_reloj_datos_de_prueba()
returns bigint
language plpgsql
set search_path = public, extensions
as $$
declare v_job bigint;
begin
  if not es_consola_supabase() then
    raise exception 'Solo desde la consola de Supabase.' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return null; end if;
  -- (SQL dinámico: sin pg_cron el esquema cron no existe y la función no compilaría.)
  execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'dynamo-datos-de-prueba'$q$;
  execute $q$select cron.schedule('dynamo-datos-de-prueba', '* * * * *',
    'set statement_timeout = 0; set idle_in_transaction_session_timeout = 0; set lock_timeout = 0; select public.ejecutar_datos_de_prueba_pendientes()')$q$ into v_job;
  return v_job;
end $$;
revoke all on function public.reprogramar_reloj_datos_de_prueba() from public, anon, authenticated, service_role;
comment on function public.reprogramar_reloj_datos_de_prueba() is 'SOLO PROYECTO DE PRUEBAS. Pone (o repone) el reloj de pg_cron que ejecuta el encargo de datos de prueba, con el comando que quita el tope de tiempo por consulta antes de llamar a ejecutar_datos_de_prueba_pendientes(). Solo consola.';

-- Si hay un encargo pendiente ahora mismo (el que se quedó en bucle), se reanuda con el reloj nuevo.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from datos_de_prueba_peticiones where estado = 'pendiente') then
    perform reprogramar_reloj_datos_de_prueba();
  end if;
end $$;
