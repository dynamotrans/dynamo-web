-- GOOGLE MAPS EN EL BUSCADOR DE SITIOS (usuario, 2026-11-23/24).
--
-- 1 · «Horario sin verificar»: al crear un sitio con el buscador de Google, la ficha coge
--     también el horario que da Google, que es el de atención al público y no siempre el de
--     carga y descarga. Queda marcado hasta que alguien lo compruebe con el sitio («se pondrá
--     aviso de que esos horarios debe verificarlos con el sitio; no están verificados»).
-- 2 · Aviso a Dynamo cuando una API de Google llega a su límite del día («si llega al límite,
--     ¿cómo me entero?»): campana y email, una vez por día y por API. La plataforma sigue
--     funcionando sin Google mientras tanto.

-- ---- 1 · Horario sin verificar --------------------------------------------------------------
alter table public.sitios add column if not exists horario_sin_verificar boolean not null default false;
comment on column public.sitios.horario_sin_verificar is 'formato: sí/no | rango: no aplica | lista: no aplica | automático | Sí cuando el horario del sitio se tomó de Google al crearlo y nadie lo ha comprobado todavía con el propio sitio (el de Google es el de atención al público, no siempre el de carga y descarga). Se quita al marcar en la ficha que está comprobado con el sitio. Ej. OK: no';

-- ---- 2 · Aviso de límite diario de una API ----------------------------------------------------
do $$
declare v_def text; v_lista text[];
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'emails_enviados_tipo_check' and conrelid = 'emails_enviados'::regclass;
  if position('{' in v_def) > 0 then
    v_lista := string_to_array(substring(v_def from '\{([^}]*)\}'), ',');
  else
    select array_agg(m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(array_length(v_lista, 1), 0) < 30 then
    raise exception 'No se ha podido leer la lista de tipos de email (%): revisar antes de aplicar.', v_def;
  end if;
  select array_agg(distinct x order by x) into v_lista from unnest(v_lista || array['api_limite']) as x;
  alter table emails_enviados drop constraint emails_enviados_tipo_check;
  execute format('alter table emails_enviados add constraint emails_enviados_tipo_check check (tipo = any (%L::text[]))', v_lista);
end $$;

create or replace function public.aviso_limite_api(p_api text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_que text; v_dia text := to_char(now() at time zone 'Europe/Madrid', 'YYYYMMDD'); v_clave text; v_titulo text; v_texto text;
begin
  if auth.uid() is null and not (es_servidor() or es_consola_supabase()) then
    raise exception 'Solo usuarios de la plataforma.' using errcode = '42501';
  end if;
  -- Lista cerrada: quien llama no escribe el texto del aviso.
  v_que := case p_api
    when 'sitios' then 'el buscador de sitios'
    when 'direcciones' then 'la búsqueda de direcciones'
    when 'kilometros' then 'el cálculo de kilómetros'
    when 'mapa' then 'el mapa'
    when 'mapa_imagen' then 'el mapa en imagen' end;
  if v_que is null then return false; end if;
  v_clave := 'api_limite:google:' || p_api || ':' || v_dia;
  -- Una vez por día y por API: el email ya encolado hace de marca.
  if exists (select 1 from emails_enviados where clave = v_clave) then return false; end if;
  v_titulo := 'Google Maps: límite diario alcanzado en ' || v_que;
  v_texto := 'Google ha dejado de contestar a ' || v_que || ' porque se ha llegado al tope de consultas de hoy. '
    || 'La plataforma sigue funcionando sin Google (agenda propia y datos a mano) y mañana vuelve sola. '
    || 'Si pasa a menudo, sube la cuota en Google Cloud → Google Maps Platform → Cuotas.';
  insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
  values (v_clave, 'api_limite', email_dynamo(), v_titulo, '<p>Hola,</p><p>' || escapar_html(v_texto) || '</p>')
  on conflict (clave) do nothing;
  if not found then return false; end if;
  perform crear_aviso('dynamo', null, null, 'api_limite', 'aviso', v_titulo, v_texto, '/panel/parametros', null);
  return true;
end $$;
revoke all on function public.aviso_limite_api(text) from public, anon;
grant execute on function public.aviso_limite_api(text) to authenticated, service_role;
comment on function public.aviso_limite_api(text) is '[Plataforma] Avisa a Dynamo (campana y email) de que una API de Google Maps ha llegado a su límite de consultas del día. Una sola vez por día y por API; el texto lo pone la base de datos, no quien llama. Devuelve true si ha avisado ahora. Quién: cualquier usuario con sesión (lo llama el servidor web cuando Google contesta que no quedan consultas). Argumentos: p_api: sitios, direcciones, kilometros, mapa o mapa_imagen.';

-- ---- 3 · El enlace de Google Maps al crear un sitio con el buscador de Google -----------------
-- Hasta ahora solo Dynamo podía ponerlo. Al CREAR un sitio, quien sea puede guardar el enlace
-- que trae Google (tiene que ser de Google Maps); cambiarlo después sigue siendo cosa de Dynamo.
create or replace function public.fn_sitios_url_mapa()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if not (es_equipo_dynamo() or es_servidor()) then
    if tg_op = 'UPDATE' then
      new.url_google_maps := old.url_google_maps;
    elsif new.url_google_maps is not null
          and new.url_google_maps !~* '^https://(maps\.google\.com|www\.google\.com/maps|maps\.app\.goo\.gl|goo\.gl/maps|g\.co/kgs)[/?]' then
      new.url_google_maps := null;
    end if;
  end if;
  if new.url_google_maps is not null and new.url_google_maps !~* '^https://' then
    raise exception 'El enlace del mapa tiene que empezar por https://' using errcode = '22023';
  end if;
  return new;
end $function$;
comment on function public.fn_sitios_url_mapa() is '[Sitios] Disparador: el enlace de Google Maps de un sitio lo cambia solo Dynamo. Al crear un sitio, cualquiera puede guardar el enlace que trae el buscador de Google si es de Google Maps (si no lo es, se guarda vacío). Siempre tiene que empezar por https://. Quién: solo uso interno.';
