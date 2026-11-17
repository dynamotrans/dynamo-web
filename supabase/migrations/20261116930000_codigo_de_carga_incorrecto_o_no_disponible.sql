-- La casilla del código de la carga DICE LA RAZÓN (usuario, 2026-11-17): «debe diferenciar
-- diciendo que el código no es correcto o que no está disponible, dejando la razón clara:
-- si es que está mal, que lo escriba bien; y si es solo que la carga ya no está disponible,
-- pues eso».
--   · codigo_incorrecto → ese código no es ni ha sido de ninguna carga: está mal escrito.
--   · no_disponible     → el código es de una carga, pero ya no se puede aceptar (la tiene
--                          otro transportista, se ha cancelado, se ha entregado…).
-- Para poder decir «no disponible» de una carga cancelada o entregada (cuyo código se
-- borra) y de un código que se cambió al quedarse el envío sin transportista, los códigos
-- que dejan de usarse se apuntan 30 días. Mientras están apuntados no se vuelven a repartir.
-- Lo que protege la casilla sigue igual: el captcha y el tope de fallos por hora de cada
-- conexión (los dos resultados cuentan como fallo). Saber que un código «existió» no abre
-- nada: una carga que no está libre no se enseña.

-- ---- 1. Los códigos que han dejado de usarse ------------------------------------------------
create table codigos_carga_retirados (
  codigo text primary key check (codigo ~ '^[1-9][0-9]{5}$'),
  retirado_en timestamptz not null default now()
);
create index codigos_carga_retirados_cuando on codigos_carga_retirados (retirado_en);
alter table codigos_carga_retirados enable row level security;
create policy codigos_carga_retirados_lee_dynamo on codigos_carga_retirados for select to authenticated using (ve_todo());
create trigger tg_mantenimiento before insert or update or delete on codigos_carga_retirados
  for each row execute function fn_bloqueo_mantenimiento();
comment on table public.codigos_carga_retirados is '[Ofertas y transportistas] Códigos de aceptación de carga que han dejado de usarse en los últimos 30 días (envío cancelado o entregado, o código cambiado al quedarse el envío sin transportista). Sirve para que la casilla de la web conteste «esa carga ya no está disponible» en vez de «el código no es correcto», y para no repartir ese número otra vez mientras tanto. La escribe la base de datos; solo la lee Dynamo.';
comment on column public.codigos_carga_retirados.codigo is 'formato: texto de 6 cifras (no empieza por 0) | rango: 100000 a 999999 | lista: no aplica | automático | El código de aceptación que ha dejado de usarse. Ej. OK: 482913';
comment on column public.codigos_carga_retirados.retirado_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo dejó de usarse ese código. A los 30 días la fila se borra y el número queda libre.';

-- ---- 2. Un código nuevo tampoco puede ser uno recién retirado ---------------------------------
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.generar_codigo_aceptacion()'::regprocedure);
  n := replace(v, 'exit when not exists (select 1 from envios where codigo_aceptacion = v);',
    'exit when not exists (select 1 from envios where codigo_aceptacion = v)
          and not exists (select 1 from codigos_carga_retirados where codigo = v);');
  if n = v then raise exception 'generar_codigo_aceptacion: no encuentro dónde comprueba que el código está libre'; end if;
  execute n;
end $$;
comment on function public.generar_codigo_aceptacion() is '[Ayudantes internos] Devuelve un código de aceptación de carga nuevo: 6 cifras al azar (no empieza por 0, ni todas iguales, ni en escalera) que no tiene ningún otro envío en ese momento ni ha dejado de usarse en los últimos 30 días. Quién: nadie la llama desde fuera; la usa el disparador de envíos. Argumentos: sin argumentos.';

-- ---- 3. Al dejar de usarse un código, se apunta ----------------------------------------------
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
  if tg_op = 'UPDATE' and old.codigo_aceptacion is not null and new.codigo_aceptacion is distinct from old.codigo_aceptacion then
    insert into codigos_carga_retirados (codigo) values (old.codigo_aceptacion)
      on conflict (codigo) do update set retirado_en = now();
    delete from codigos_carga_retirados where retirado_en < now() - interval '30 days';
  end if;
  return new;
end $$;
comment on function public.fn_envios_codigo_aceptacion() is '[Gestión interna] Disparador de envios: lleva el código de aceptación de carga. Lo pone al crear un envío de Dynamo, lo renueva si el envío se queda sin transportista (el anterior deja de servir), lo borra cuando el envío se entrega o se cancela (o es de transportista propio) y no deja cambiarlo a mano. Cada código que deja de usarse lo apunta 30 días en codigos_carga_retirados. Quién: nadie la llama; la ejecuta la base de datos.';

-- Los códigos de los envíos que ya tienen transportista siguen en su ficha: no hay nada que
-- apuntar de antes (los de envíos ya cancelados o entregados se borraron sin dejar rastro).

-- ---- 4. La casilla dice la razón ------------------------------------------------------------
create or replace function public.carga_por_codigo(p_codigo text, p_ip inet default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v text := regexp_replace(coalesce(p_codigo, ''), '[^0-9]', '', 'g');
  v_max int := greatest(1, parametro_num('carga_codigo_max_fallos_hora', 8)::int);
  n int; v_token uuid; v_conocido boolean := false;
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
    if v_token is null then
      v_conocido := exists (select 1 from envios where codigo_aceptacion = v)
                 or exists (select 1 from codigos_carga_retirados where codigo = v);
    end if;
  end if;

  if v_token is null then
    insert into intentos_carga_publica (envio_id, motivo, ip) values (null, 'codigo_no_valido', p_ip);
    return jsonb_build_object('resultado', case when v_conocido then 'no_disponible' else 'codigo_incorrecto' end,
                              'intentos_restantes', greatest(0, v_max - n - 1));
  end if;
  return jsonb_build_object('resultado', 'ok', 'token', v_token);
end $$;
comment on function public.carga_por_codigo(text, inet) is '[Ofertas y transportistas] La casilla «Aceptar carga» de la web: cambia el código de aceptación de 6 cifras que el transportista ha visto en la oferta por el enlace de esa carga, si sigue libre (programada, de Dynamo, sin transportista, pagada si era de pago previo y con la carga sin pasar). Si no, dice la razón: codigo_incorrecto cuando ese código no es ni ha sido de ninguna carga (está mal escrito) y no_disponible cuando es de una carga que ya no se puede aceptar (la tiene otro transportista, se ha cancelado o entregado, o el código se cambió). Los dos cuentan como fallo: al llegar al tope de fallos por hora de esa conexión (parámetro carga_codigo_max_fallos_hora) responde tope. Devuelve jsonb {resultado: ok | codigo_incorrecto | no_disponible | tope, token, intentos_restantes}. Quién: público (anon o con sesión). Argumentos: p_codigo: el código tecleado (se quedan solo las cifras: da igual espacios o guiones) · p_ip: IP de quien llama, la que pasa el servidor web.';
