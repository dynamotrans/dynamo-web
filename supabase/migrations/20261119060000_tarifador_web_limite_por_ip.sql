-- TARIFADOR DE LA WEB PÚBLICA CON PRECIO Y LÍMITE POR IP (usuario, 2026-11-19).
-- La web pública calcula un precio orientativo (con el mismo tarifador del panel), como
-- mucho N veces al día por dirección IP; pasado el límite, invita a crear cuenta («tarifas
-- ilimitadas*»). Nace APAGADO (tarifador_web_con_precio = false): hasta que entren las
-- tarifas reales, dynamotrans.com sigue sin enseñar precio (decisión del 2026-07-01).
--
-- La IP NO se guarda: el servidor web guarda solo una huella (SHA-256 de la IP con una
-- sal), y las filas se borran solas a los 30 días.

insert into parametros (clave, valor, descripcion) values
  ('tarifador_web_con_precio', 'false', 'Tarifador de la web pública: true = calcula y enseña un precio orientativo (con el tarifador del panel) a quien no tiene cuenta, con el límite diario por IP; false = no enseña precio y solo prepara el email o el WhatsApp para pedir tarifa, como hasta ahora. Nace apagado hasta que estén las tarifas reales.'),
  ('tarifador_web_max_ip_dia', '3', 'Cálculos de precio al día por dirección IP en el tarifador de la web pública. Pasado el límite, en vez del precio se invita a crear una cuenta de cliente («tarifas ilimitadas*»). Cuenta desde las 00:00 (hora de España).')
on conflict (clave) do nothing;

create table if not exists consultas_precio_web (
  id bigint generated always as identity primary key,
  ip_huella text not null check (ip_huella ~ '^[0-9a-f]{64}$'),
  cuando timestamptz not null default now()
);
create index if not exists ix_consultas_precio_web_ip on consultas_precio_web (ip_huella, cuando);
create index if not exists ix_consultas_precio_web_cuando on consultas_precio_web (cuando);
alter table consultas_precio_web enable row level security;
-- Solo el equipo de Dynamo puede leerla (para ver el uso); nadie la escribe directamente:
-- se apunta por la función de abajo.
drop policy if exists consultas_precio_web_dynamo on consultas_precio_web;
create policy consultas_precio_web_dynamo on consultas_precio_web for select to authenticated using (ve_todo());
revoke all on consultas_precio_web from anon, authenticated;
grant select on consultas_precio_web to authenticated;

comment on table public.consultas_precio_web is '[Tarifas] Cálculos de precio hechos en el tarifador de la web pública (sin cuenta), para limitar cuántos hace cada dirección IP al día (parámetro tarifador_web_max_ip_dia). No guarda la IP, solo su huella. Se borran solas a los 30 días. Quién: la escribe la web pública por tarifa_web_apuntar(); la lee el equipo de Dynamo.';
comment on column public.consultas_precio_web.id is 'formato: número | rango: no aplica | lista: no aplica | automático | Identificador del cálculo.';
comment on column public.consultas_precio_web.ip_huella is 'formato: texto hexadecimal | rango: 64 caracteres | lista: no aplica | obligatorio | Huella SHA-256 de la dirección IP con una sal del servidor: permite contar los cálculos de una misma IP sin guardar la IP. Ej. OK: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
comment on column public.consultas_precio_web.cuando is 'formato: fecha y hora | rango: no aplica | lista: no aplica | automático | Momento del cálculo.';

-- Apunta un cálculo de la web pública y dice si cabe en el límite del día.
-- Resultados: 'apagado' (la web no enseña precio), 'limite' (ya hizo los N de hoy; no se
-- apunta) u 'ok' (apuntado), con 'max', 'quedan' y los festivos de los próximos 120 días
-- (para las fechas del tarifador). La puede llamar la web sin sesión.
create or replace function tarifa_web_apuntar(p_ip_huella text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int := greatest(0, coalesce(parametro_num('tarifador_web_max_ip_dia', 3), 3)::int);
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_desde timestamptz := v_hoy::timestamp at time zone 'Europe/Madrid';
  v_hechas int;
  v_fest jsonb;
begin
  if coalesce(p_ip_huella, '') !~ '^[0-9a-f]{64}$' then raise exception 'huella no válida' using errcode = '22023'; end if;
  if not coalesce((select valor = 'true'::jsonb from parametros where clave = 'tarifador_web_con_precio'), false) then
    return jsonb_build_object('resultado', 'apagado');
  end if;
  -- Una a la vez por IP: dos pestañas a la vez no se cuelan por encima del límite.
  perform pg_advisory_xact_lock(hashtext('tarifa_web:' || p_ip_huella));
  select count(*) into v_hechas from consultas_precio_web where ip_huella = p_ip_huella and cuando >= v_desde;
  if v_hechas >= v_max then
    return jsonb_build_object('resultado', 'limite', 'max', v_max, 'quedan', 0);
  end if;
  insert into consultas_precio_web (ip_huella) values (p_ip_huella);
  -- Limpieza: lo de hace más de 30 días sobra.
  delete from consultas_precio_web where cuando < now() - interval '30 days';
  select coalesce(jsonb_agg(f.fecha order by f.fecha), '[]'::jsonb) into v_fest
    from festivos_entre(v_hoy, v_hoy + 120) f;
  return jsonb_build_object('resultado', 'ok', 'max', v_max, 'quedan', v_max - v_hechas - 1, 'festivos', v_fest);
end $$;
revoke all on function tarifa_web_apuntar(text) from public;
grant execute on function tarifa_web_apuntar(text) to anon, authenticated;
comment on function tarifa_web_apuntar(text) is 'Tarifador de la web pública: apunta un cálculo de precio de una IP (por su huella) y dice si cabe en el límite del día (parámetro tarifador_web_max_ip_dia). Devuelve apagado / limite / ok con max, quedan y festivos. Sin sesión.';
