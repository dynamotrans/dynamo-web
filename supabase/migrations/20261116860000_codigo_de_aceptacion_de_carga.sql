-- =====================================================================================
-- CÓDIGO DE ACEPTACIÓN DE CARGA (usuario, 2026-11-17)
-- =====================================================================================
-- En la bolsa de cargas no se pueden publicar enlaces. El transportista que ve allí una
-- carga entra en la web de Dynamo, pulsa «Aceptar carga» y teclea un CÓDIGO; si la carga
-- sigue libre, pasa a la pantalla de aceptación de siempre (/carga/<enlace>).
--   · El código NO es el número de envío (GX): el cliente conoce su GX y con él vería lo
--     que cobra el transportista. Es un código aparte, que solo ven Dynamo y quien lee la
--     carga en la bolsa.
--   · Seis letras y cifras AL AZAR, sin orden: con un código no se adivina el siguiente.
--     Sin vocales (no forma palabras) y sin los caracteres que se confunden (0/O, 1/I/L).
--   · La casilla del código tiene tope de fallos por hora, y responde lo mismo a un código
--     inventado que a una carga ya tomada: no deja averiguar qué códigos existen.
-- Además, el email «Carga disponible» pasa a llevar un botón «Aceptar carga».

-- ---- 1. El código de cada envío --------------------------------------------------------
create or replace function public.generar_codigo_aceptacion()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  alfabeto constant text := 'BCDFGHJKMNPQRSTVWXYZ23456789';   -- 28 caracteres
  v text; b bytea; i int; n int;
begin
  loop
    v := '';
    b := uuid_send(gen_random_uuid());
    -- Los octetos 6 a 8 de un UUID llevan bits fijos (versión y variante): no se usan.
    -- Se descartan los valores de 252 en adelante para que las 28 letras salgan igual de probables.
    foreach i in array array[0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14, 15] loop
      n := get_byte(b, i);
      if n < 252 then v := v || substr(alfabeto, 1 + n % 28, 1); end if;
      exit when length(v) = 6;
    end loop;
    exit when length(v) = 6 and not exists (select 1 from envios where codigo_aceptacion = v);
  end loop;
  return v;
end $$;
revoke all on function public.generar_codigo_aceptacion() from public, anon, authenticated;
comment on function public.generar_codigo_aceptacion() is '[Ayudantes internos] Devuelve un código de aceptación de carga nuevo: 6 letras y cifras al azar (sin vocales ni caracteres que se confunden), que no tiene ningún otro envío. Quién: nadie la llama desde fuera; la usa el disparador de envíos. Argumentos: sin argumentos.';

alter table envios add column codigo_aceptacion text;
create unique index ux_envios_codigo_aceptacion on envios (codigo_aceptacion);

-- Los envíos que ya existen: uno a uno (cada código se comprueba contra los ya puestos),
-- sin disparar los avisos ni las reglas de modificación de un envío.
alter table envios disable trigger user;
do $$ declare r record; begin
  for r in select id from envios where codigo_aceptacion is null loop
    update envios set codigo_aceptacion = generar_codigo_aceptacion() where id = r.id;
  end loop;
end $$;
alter table envios enable trigger user;

alter table envios alter column codigo_aceptacion set not null;
alter table envios add constraint envios_codigo_aceptacion_formato
  check (codigo_aceptacion ~ '^[BCDFGHJKMNPQRSTVWXYZ2-9]{6}$');
comment on column public.envios.codigo_aceptacion is 'formato: texto de 6 caracteres (letras mayúsculas sin vocales y cifras del 2 al 9) | rango: no aplica | lista: no aplica | automático | Código de aceptación de carga: el que se publica en la bolsa y el transportista teclea en la web para llegar a la pantalla de aceptar esta carga. Al azar y único; lo pone la base de datos al crear el envío y no cambia. Solo lo ve Dynamo: nunca el cliente (con él se ve el precio del transportista). Ej. OK: K7P4M2';

create or replace function public.fn_envios_codigo_aceptacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.codigo_aceptacion := generar_codigo_aceptacion();
  else
    new.codigo_aceptacion := old.codigo_aceptacion;   -- no se cambia a mano
  end if;
  return new;
end $$;
revoke all on function public.fn_envios_codigo_aceptacion() from public, anon, authenticated;
comment on function public.fn_envios_codigo_aceptacion() is '[Gestión interna] Disparador de envios: al crear un envío le pone su código de aceptación de carga (al azar y único) y después no deja cambiarlo. Quién: nadie la llama; la ejecuta la base de datos.';
create trigger tg_envios_a00_codigo_aceptacion before insert or update of codigo_aceptacion on envios
  for each row execute function fn_envios_codigo_aceptacion();

-- ---- 2. La puerta por código ------------------------------------------------------------
-- Los fallos de la casilla se apuntan en el mismo registro que los de la página de la carga;
-- un código que no vale no es de ninguna carga, así que el envío queda vacío.
alter table intentos_carga_publica alter column envio_id drop not null;
comment on column public.intentos_carga_publica.envio_id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Carga (envío) del enlace (→ envios.id, sin clave ajena). Vacío en los fallos de la casilla del código de aceptación.';
comment on column public.intentos_carga_publica.motivo is 'formato: texto | rango: no aplica | lista: cif_no_encontrado (CIF que no está en Dynamo), alta_ya_existe (alta online con un CIF o código de bolsa ya registrado), alta_online (alta online hecha; cuenta para el tope diario), codigo_no_valido (código de aceptación que no abre ninguna carga libre) | automático | Qué pasó.';

insert into parametros (clave, valor, descripcion) values
  ('carga_codigo_max_fallos_hora', '8', 'Código de aceptación de carga: fallos por hora que se admiten desde una misma conexión en la casilla del código antes de hacerla esperar.')
on conflict (clave) do nothing;

create or replace function public.carga_por_codigo(p_codigo text, p_ip inet default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_max int := greatest(1, parametro_num('carga_codigo_max_fallos_hora', 8)::int);
  n int; v_token uuid;
begin
  select count(*) into n from intentos_carga_publica
   where motivo = 'codigo_no_valido' and cuando > now() - interval '1 hour' and ip is not distinct from p_ip;
  if n >= v_max then return jsonb_build_object('resultado', 'tope'); end if;

  if v ~ '^[BCDFGHJKMNPQRSTVWXYZ2-9]{6}$' then
    select e.token_publico into v_token from envios e
     where e.codigo_aceptacion = v
       and not e.es_manual and e.estado = 'programado' and e.transportista_id is null
       and e.estado_asignacion is distinct from 'confirmada'
       and e.estado_pago_previo is distinct from 'pendiente'
       and coalesce(e.importe_transportista, 0) > 0
       and coalesce(e.fecha_carga_hasta, e.fecha_carga_desde, (now() at time zone 'Europe/Madrid')::date)
           >= (now() at time zone 'Europe/Madrid')::date;
  end if;

  if v_token is null then
    insert into intentos_carga_publica (envio_id, motivo, ip) values (null, 'codigo_no_valido', p_ip);
    return jsonb_build_object('resultado', 'no_disponible', 'intentos_restantes', greatest(0, v_max - n - 1));
  end if;
  return jsonb_build_object('resultado', 'ok', 'token', v_token);
end $$;
revoke all on function public.carga_por_codigo(text, inet) from public;
grant execute on function public.carga_por_codigo(text, inet) to anon, authenticated, service_role;
comment on function public.carga_por_codigo(text, inet) is '[Ofertas y transportistas] La casilla «Aceptar carga» de la web: cambia el código de aceptación que el transportista ha visto en la bolsa por el enlace de esa carga, si sigue libre (programada, de Dynamo, sin transportista, pagada si era de pago previo y con la carga sin pasar). Responde lo mismo (no_disponible) a un código inventado que a una carga ya tomada, para que no se pueda averiguar qué códigos existen, y apunta el fallo; al llegar al tope de fallos por hora de esa conexión (parámetro carga_codigo_max_fallos_hora) responde tope. Devuelve jsonb {resultado: ok | no_disponible | tope, token, intentos_restantes}. Quién: público (anon o con sesión). Argumentos: p_codigo: el código tecleado (da igual mayúsculas, espacios o guiones) · p_ip: IP de quien llama, la que pasa el servidor web.';

-- ---- 3. El código, en el fichero de la bolsa ---------------------------------------------
do $$ declare v text; n text; begin
  v := pg_get_viewdef('public.v_wtransnet'::regclass, true);
  n := replace(v, $a$''::text AS "Comentarios Públicos"$a$,
    $b$('Acéptala en dynamotrans.com/carga con el código '::text || e.codigo_aceptacion) AS "Comentarios Públicos"$b$);
  if n = v then raise exception 'v_wtransnet: no encuentro la columna de comentarios públicos'; end if;
  execute 'create or replace view public.v_wtransnet with (security_invoker = true) as ' || n;
end $$;

-- ---- 4. El email de la oferta, con botón «Aceptar carga» ---------------------------------
do $$ declare v text; n text;
  viejo constant text := $a$<p><a href="%s/carga/%s"><strong>Ver la carga y aceptarla aquí</strong></a> (sin registro). El primero que acepta se la lleva.</p>$a$;
  nuevo constant text := $b$<p><a href="%s/carga/%s" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:10px">Aceptar carga</a></p><p>Sin registro. El primero que acepta se la lleva.</p>$b$;
begin
  v := pg_get_functiondef('public.fn_difusion_paso(uuid)'::regprocedure);
  n := replace(v, viejo, nuevo);
  if n = v then raise exception 'fn_difusion_paso: no encuentro el enlace de la oferta'; end if;
  execute n;
  v := pg_get_functiondef('public.fn_difusion_recordatorios()'::regprocedure);
  n := replace(v, viejo, nuevo);
  if n = v then raise exception 'fn_difusion_recordatorios: no encuentro el enlace del recordatorio'; end if;
  execute n;
end $$;
