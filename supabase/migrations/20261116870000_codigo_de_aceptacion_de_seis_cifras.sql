-- =====================================================================================
-- EL CÓDIGO DE ACEPTACIÓN, DE SEIS CIFRAS Y CON CADUCIDAD (usuario, 2026-11-17)
-- =====================================================================================
-- «Que sea fácil de recordar: lo ve en una pantalla y se va a otra. Y con letras y números
-- hay que cambiar el teclado.» El código pasa a ser de SEIS CIFRAS (482 913), como los de
-- un SMS del banco: se teclea con el teclado numérico y se recuerda de un vistazo.
-- Sigue siendo al azar y sin orden. Con unas 100 cargas libres a la vez, 1 de cada 9.000
-- números abre alguna; por eso la casilla mantiene el captcha y el tope de fallos por hora.
-- Y CADUCA, para que no se acumulen códigos de envíos antiguos:
--   · lo tienen solo los envíos de Dynamo sin terminar (los de transportista propio, no);
--   · con transportista asignado el código sigue en la ficha, pero ya no abre la carga;
--   · si el transportista se cae y la carga vuelve a quedar libre, sale un código NUEVO
--     (el anterior no vuelve a servir);
--   · al entregarse o cancelarse el envío, el código se borra y ese número queda libre.

-- ---- 1. Seis cifras --------------------------------------------------------------------
create or replace function public.generar_codigo_aceptacion()
returns text language plpgsql volatile security definer set search_path = public as $$
declare v text; b bytea;
begin
  loop
    b := uuid_send(gen_random_uuid());
    -- Cuatro octetos al azar → un número de 100000 a 999999 (no empieza por 0).
    v := (100000 + ((get_byte(b, 0)::bigint * 16777216 + get_byte(b, 1) * 65536 + get_byte(b, 2) * 256 + get_byte(b, 3)) % 900000))::text;
    -- Fuera los que cualquiera probaría primero: todas las cifras iguales o en escalera.
    continue when v ~ '^(\d)\1{5}$' or position(v in '01234567890123456789') > 0 or position(v in '98765432109876543210') > 0;
    exit when not exists (select 1 from envios where codigo_aceptacion = v);
  end loop;
  return v;
end $$;
comment on function public.generar_codigo_aceptacion() is '[Ayudantes internos] Devuelve un código de aceptación de carga nuevo: 6 cifras al azar (no empieza por 0, ni todas iguales, ni en escalera) que no tiene ningún otro envío en ese momento. Quién: nadie la llama desde fuera; la usa el disparador de envíos. Argumentos: sin argumentos.';

-- ---- 2. Cuándo existe el código ----------------------------------------------------------
create or replace function public.fn_envios_codigo_aceptacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- (operador_id y no es_manual: es_manual es una columna calculada y aquí aún no tiene valor.)
  if new.operador_id is not null or new.estado::text in ('entregado', 'cancelado') then
    new.codigo_aceptacion := null;                              -- no hace falta, o ha caducado
  elsif tg_op = 'INSERT' or old.codigo_aceptacion is null
        or (old.transportista_id is not null and new.transportista_id is null) then
    new.codigo_aceptacion := generar_codigo_aceptacion();       -- nace, vuelve, o queda libre otra vez
  else
    new.codigo_aceptacion := old.codigo_aceptacion;             -- no se cambia a mano
  end if;
  return new;
end $$;
comment on function public.fn_envios_codigo_aceptacion() is '[Gestión interna] Disparador de envios: lleva el código de aceptación de carga. Lo pone al crear un envío de Dynamo, lo renueva si el envío se queda sin transportista (el anterior deja de servir), lo borra cuando el envío se entrega o se cancela (o es de transportista propio) y no deja cambiarlo a mano. Quién: nadie la llama; la ejecuta la base de datos.';

-- Pasa a ser el ÚLTIMO de los disparadores previos: así ve el estado y el transportista
-- tal como van a quedar guardados.
drop trigger tg_envios_a00_codigo_aceptacion on envios;
create trigger tg_envios_zzzzzz_codigo_aceptacion before insert or update on envios
  for each row execute function fn_envios_codigo_aceptacion();

-- ---- 3. Los códigos que ya había: se cambian todos ----------------------------------------
alter table envios drop constraint envios_codigo_aceptacion_formato;
alter table envios alter column codigo_aceptacion drop not null;
alter table envios disable trigger user;
update envios set codigo_aceptacion = null;
do $$ declare r record; begin
  for r in select id from envios where not coalesce(es_manual, false) and estado::text not in ('entregado', 'cancelado') loop
    update envios set codigo_aceptacion = generar_codigo_aceptacion() where id = r.id;
  end loop;
end $$;
alter table envios enable trigger user;
alter table envios add constraint envios_codigo_aceptacion_formato
  check (codigo_aceptacion is null or codigo_aceptacion ~ '^[1-9][0-9]{5}$');
comment on column public.envios.codigo_aceptacion is 'formato: texto de 6 cifras (no empieza por 0) | rango: 100000 a 999999 | lista: no aplica | automático | Código de aceptación de carga: el que se publica en la bolsa y el transportista teclea en la web para llegar a la pantalla de aceptar esta carga. Al azar y único entre los envíos sin terminar. Lo pone la base de datos al crear el envío; se renueva si el envío se queda sin transportista, y se borra (vacío) al entregarse o cancelarse; los envíos con transportista propio no tienen. Solo lo ve Dynamo: nunca el cliente (con él se ve el precio del transportista). Ej. OK: 482913';

-- ---- 4. La casilla, con cifras -------------------------------------------------------------
create or replace function public.carga_por_codigo(p_codigo text, p_ip inet default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v text := regexp_replace(coalesce(p_codigo, ''), '[^0-9]', '', 'g');
  v_max int := greatest(1, parametro_num('carga_codigo_max_fallos_hora', 8)::int);
  n int; v_token uuid;
begin
  select count(*) into n from intentos_carga_publica
   where motivo = 'codigo_no_valido' and cuando > now() - interval '1 hour' and ip is not distinct from p_ip;
  if n >= v_max then return jsonb_build_object('resultado', 'tope'); end if;

  if v ~ '^[1-9][0-9]{5}$' then
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
comment on function public.carga_por_codigo(text, inet) is '[Ofertas y transportistas] La casilla «Aceptar carga» de la web: cambia el código de aceptación de 6 cifras que el transportista ha visto en la bolsa por el enlace de esa carga, si sigue libre (programada, de Dynamo, sin transportista, pagada si era de pago previo y con la carga sin pasar). Responde lo mismo (no_disponible) a un código inventado que a una carga ya tomada, para que no se pueda averiguar qué códigos existen, y apunta el fallo; al llegar al tope de fallos por hora de esa conexión (parámetro carga_codigo_max_fallos_hora) responde tope. Devuelve jsonb {resultado: ok | no_disponible | tope, token, intentos_restantes}. Quién: público (anon o con sesión). Argumentos: p_codigo: el código tecleado (se quedan solo las cifras: da igual espacios o guiones) · p_ip: IP de quien llama, la que pasa el servidor web.';

-- ---- 5. En el fichero de la bolsa, en dos grupos de tres -------------------------------------
do $$ declare v text; n text; begin
  v := pg_get_viewdef('public.v_wtransnet'::regclass, true);
  n := replace(v, $a$'Acéptala en dynamotrans.com/carga con el código '::text || e.codigo_aceptacion$a$,
    $b$'Acéptala en dynamotrans.com/carga con el código '::text || substr(e.codigo_aceptacion, 1, 3) || ' '::text || substr(e.codigo_aceptacion, 4)$b$);
  if n = v then raise exception 'v_wtransnet: no encuentro el código en los comentarios públicos'; end if;
  execute 'create or replace view public.v_wtransnet with (security_invoker = true) as ' || n;
end $$;
