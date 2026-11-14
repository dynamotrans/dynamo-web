-- =====================================================================================
-- SUSPENSIÓN EN DOS NIVELES Y DISPARO SOLO EN LA ACCIÓN NEGATIVA (usuario, 2026-11-14)
-- =====================================================================================
-- 1. «suspendida» pasa a SOLO LECTURA: el cliente o transportista entra y consulta todo
--    lo suyo (sus envíos en curso no desaparecen), pero no puede crear, cambiar ni subir
--    nada. Lo impone esta base de datos con un cerrojo central de escritura.
-- 2. «suspendida_total» (nuevo): ni entrar. La web expulsa la sesión al siguiente clic y
--    el login enseña el mensaje de contacto; aquí, además, sus ayudantes de RLS no
--    devuelven nada (ni lectura). Solo se pone a mano desde la ficha del usuario.
-- 3. La suspensión automática salta SOLO en la acción negativa (cancelar, consultar) y
--    en el barrido horario — crear un envío ya no dispara la revisión (dejaba un envío
--    vivo recién creado con la cuenta suspendida). La regla 6 (tope de envíos al día)
--    cambia de naturaleza: el envío que pasa del límite SE RECHAZA con su mensaje, en
--    vez de crearse y suspender la cuenta.

-- ---- 1. El estado nuevo --------------------------------------------------------------
alter type estado_cuenta add value if not exists 'suspendida_total';
comment on column public.usuarios.estado is 'formato: texto (enum estado_cuenta) | rango: no aplica | lista: activa · suspendida · suspendida_total · pendiente_verificacion | obligatorio | Estado de la cuenta: activa (todo), suspendida (SOLO LECTURA: entra y consulta, no crea ni cambia nada), suspendida_total (ni entrar: el login la rechaza y una sesión abierta se expulsa; solo se pone a mano), pendiente_verificacion (alta sin verificar: no ve nada). Ej. OK: activa';

-- ---- 2. Con la cuenta suspendida se LEE (los ayudantes de RLS devuelven la empresa) --
-- La total queda fuera: sin empresa no hay ni lectura. Los ayudantes del equipo de
-- Dynamo (es_admin, es_equipo_dynamo, ve_todo) siguen exigiendo cuenta activa.
create or replace function cliente_del_usuario()
returns uuid language sql stable security definer set search_path = public as $$
  select cliente_id from usuarios
  where id = auth.uid() and rol = 'cliente' and estado in ('activa', 'suspendida')
$$;
comment on function public.cliente_del_usuario() is '[Gestión interna] Ayudante de RLS: el cliente (clientes.id) del usuario que llama, con la cuenta activa o SUSPENDIDA (solo lectura: desde 2026-11-14 una cuenta suspendida consulta sus datos; escribir lo corta el cerrojo central). Con suspensión total o pendiente de verificar devuelve NULL. SECURITY DEFINER para no quedar atrapada en la RLS de usuarios. Quién: las políticas RLS. Argumentos: ninguno.';

create or replace function transportista_del_usuario()
returns uuid language sql stable security definer set search_path = public as $$
  select transportista_id from usuarios
  where id = auth.uid() and rol = 'transportista' and estado in ('activa', 'suspendida')
$$;
comment on function public.transportista_del_usuario() is '[Gestión interna] Ayudante de RLS: el transportista (transportistas.id) del usuario que llama, con la cuenta activa o SUSPENDIDA (solo lectura: desde 2026-11-14 una cuenta suspendida consulta sus datos; escribir lo corta el cerrojo central). Con suspensión total o pendiente de verificar devuelve NULL. SECURITY DEFINER para no quedar atrapada en la RLS de usuarios. Quién: las políticas RLS. Argumentos: ninguno.';

-- ---- 3. Cerrojo CENTRAL de escritura -------------------------------------------------
-- El disparador tg_mantenimiento ya vive en TODAS las tablas de negocio: además del
-- mantenimiento, ahora corta toda escritura de una cuenta suspendida (de los dos
-- niveles). No toca: las conexiones directas (pg_cron, migraciones, consola), el
-- servidor, las llamadas públicas sin sesión (firmas del CMR, aceptar carga: sin
-- auth.uid no hay cuenta que mirar) ni las tablas sin el disparador (usuarios —editar
-- los datos personales sigue permitido a propósito—, consultas_precio, avisos_vistos…).
create or replace function fn_bloqueo_mantenimiento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_directo boolean;
begin
  -- Conexión directa (pg_cron, migraciones): ni API (authenticator) ni usuario en la sesión.
  v_directo := session_user not in ('authenticator', 'anon', 'authenticated')
               and nullif(current_setting('request.jwt.claim.sub', true), '') is null
               and nullif(current_setting('request.jwt.claims', true), '') is null;
  if v_directo or es_servidor() then return coalesce(new, old); end if;
  if mantenimiento_activo() and not es_equipo_dynamo() then
    raise exception 'La plataforma está en mantenimiento: vuelve a intentarlo en un rato.' using errcode = '55000';
  end if;
  -- Cuenta suspendida = SOLO LECTURA (usuario, 2026-11-14): consultar sí, escribir no.
  -- EXCEPCIÓN de la misma transacción (u.xmin): si la suspensión acaba de ocurrir AQUÍ
  -- (la cancelación que dispara la regla al momento, o la baja voluntaria, suspenden en
  -- mitad de su propia acción), el resto de esa acción termina; el cerrojo corta desde
  -- la SIGUIENTE. Sin esto, la acción que suspende se desharía entera con la suspensión.
  if exists (select 1 from usuarios u where u.id = auth.uid() and u.estado in ('suspendida', 'suspendida_total')
               and not (u.xmin = pg_current_xact_id()::xid)) then
    raise exception 'Tu cuenta está suspendida: puedes consultar tus datos, pero no crear ni cambiar nada. Contacta con nosotros para reactivarla.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function fn_bloqueo_mantenimiento() from public, anon, authenticated;
comment on function public.fn_bloqueo_mantenimiento() is '[Gestión interna] Disparador tg_mantenimiento de todas las tablas de negocio: corta las escrituras durante el mantenimiento (salvo Admin Master) y, desde 2026-11-14, también TODA escritura de una cuenta suspendida (solo lectura) o suspendida total. Las conexiones directas, el servidor y las llamadas públicas sin sesión pasan siempre. Quién: el disparador; nadie por la API. Argumentos: ninguno (NEW/OLD).';

-- ---- 4. Regla 6: el envío que pasa del límite SE RECHAZA ----------------------------
-- Fuera los disparadores que revisaban la suspensión AL CREAR un envío (dejaban un
-- envío vivo recién creado con la cuenta suspendida). En su lugar, un tope duro ANTES
-- de crear (o de confirmar un borrador): al llegar al límite individual, el siguiente
-- envío no nace, con su mensaje. La rama «Regla 6» de autosuspension_motivos queda para
-- las cuentas que ya estaban pasadas del límite antes de este cambio.
drop trigger if exists tg_envios_autosuspension on envios;
drop trigger if exists tg_envios_autosuspension_confirmar on envios;
drop function if exists fn_envios_autosuspension();

create or replace function fn_envios_tope_diario()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_max int; v_desde timestamptz; v_hoy int;
begin
  if new.creado_por is null or new.estado = 'borrador' then return new; end if;
  select limite_envios_diario, coalesce(autosuspension_desde_en, '-infinity'::timestamptz)
    into v_max, v_desde from usuarios where id = new.creado_por;
  if v_max is null then return new; end if;
  -- El mismo recuento que la pantalla «Uso de Dynamo»: envíos efectivos del creador en
  -- las últimas 24 horas (desde el último reinicio del contador si es más reciente).
  select count(*) into v_hoy from envios e
   where e.creado_por = new.creado_por and e.estado <> 'borrador' and e.id <> new.id
     and e.creado_en >= greatest(v_desde, now() - interval '1 day');
  if v_hoy >= v_max then
    raise exception 'Has llegado a tu límite de envíos de hoy (% al día). El envío no se ha creado: si necesitas ampliar el límite, contacta con nosotros.', v_max using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function fn_envios_tope_diario() from public, anon, authenticated;
comment on function public.fn_envios_tope_diario() is '[Clientes y cuentas] Disparador de envios (ANTES de crear, o de confirmar un borrador): con límite individual de envíos al día (usuarios.limite_envios_diario), el envío que pasaría del límite SE RECHAZA con su mensaje — nunca se crea y suspende (decisión del usuario 2026-11-14: la suspensión automática salta solo en la acción negativa o en el barrido, jamás al crear). Cuenta como la pantalla «Uso de Dynamo»: envíos efectivos de las últimas 24 h desde el último reinicio del contador. Sin límite (vacío) no hay tope. Quién: el disparador; nadie por la API. Argumentos: ninguno (NEW).';

create trigger tg_envios_0tope_diario before insert on envios
  for each row execute function fn_envios_tope_diario();
create trigger tg_envios_0tope_diario_confirmar before update of estado on envios
  for each row when (old.estado = 'borrador' and new.estado <> 'borrador')
  execute function fn_envios_tope_diario();
