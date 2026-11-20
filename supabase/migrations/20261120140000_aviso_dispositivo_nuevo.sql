-- =====================================================================================
-- AVISO DE ENTRADA DESDE UN DISPOSITIVO NUEVO (equipo de Dynamo) + «NO HE SIDO YO»
-- =====================================================================================
-- Usuario, 2026-11-20 (a raíz de «se saltan la verificación en dos pasos en 14 minutos»): un
-- email cada vez que alguien del equipo de Dynamo entra con su contraseña desde un navegador
-- que no conocemos, con un botón «No he sido yo» que cierra todas sus sesiones y le manda a
-- poner una contraseña nueva. Así, si le roban la contraseña (y aunque lleguen al segundo
-- paso), se entera al momento y lo corta él mismo.
--
-- El navegador se reconoce por una cookie propia que pone la plataforma al entrar (un número
-- al azar; aquí solo se guarda su huella). No se guarda la IP: solo la ciudad y el país
-- aproximados que da Vercel, para el email.

insert into parametros (clave, valor, descripcion) values
  ('aviso_dispositivo_nuevo', 'true', 'Si está encendido, cuando alguien del equipo de Dynamo entra con su contraseña desde un navegador o dispositivo nuevo, le llega un email (con copia a Dynamo) con el botón «No he sido yo», que cierra todas sus sesiones.')
on conflict (clave) do nothing;

create table if not exists usuarios_dispositivos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  huella text not null,
  descripcion text,
  ubicacion text,
  primer_acceso timestamptz not null default now(),
  ultimo_acceso timestamptz not null default now(),
  token_alerta uuid not null default gen_random_uuid(),
  alerta_usada_en timestamptz,
  unique (usuario_id, huella)
);
create unique index if not exists usuarios_dispositivos_token on usuarios_dispositivos (token_alerta);
alter table usuarios_dispositivos enable row level security;
drop policy if exists usuarios_dispositivos_propios on usuarios_dispositivos;
create policy usuarios_dispositivos_propios on usuarios_dispositivos for select to authenticated using (usuario_id = auth.uid());
revoke all on usuarios_dispositivos from anon;
revoke insert, update, delete on usuarios_dispositivos from authenticated;

comment on table usuarios_dispositivos is '[Seguridad] Navegadores o dispositivos desde los que ha entrado cada persona del equipo de Dynamo. El primero de cada uno dispara el email «Nuevo acceso a tu cuenta» con el botón «No he sido yo». Solo lo escribe registrar_acceso(); cada uno ve los suyos.';
comment on column usuarios_dispositivos.id is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Identificador. Ej. OK: 0b6f…';
comment on column usuarios_dispositivos.usuario_id is 'formato: uuid | → usuarios.id | rango: no aplica | lista: no aplica | obligatorio | La persona del equipo de Dynamo que entró. Ej. OK: 0b6f…';
comment on column usuarios_dispositivos.huella is 'formato: texto (64 caracteres hexadecimales) | rango: no aplica | lista: no aplica | obligatorio | Huella (SHA-256) del número al azar que la plataforma guarda en una cookie del navegador al entrar. Nunca se guarda el número en claro. Ej. OK: 9f86d0…';
comment on column usuarios_dispositivos.descripcion is 'formato: texto | rango: hasta 120 caracteres | lista: no aplica | opcional | Navegador y sistema, para el email. Ej. OK: Chrome en macOS';
comment on column usuarios_dispositivos.ubicacion is 'formato: texto | rango: hasta 120 caracteres | lista: no aplica | opcional | Ciudad y país aproximados del acceso (los da Vercel; no se guarda la IP). Ej. OK: Sevilla, ES';
comment on column usuarios_dispositivos.primer_acceso is 'formato: fecha y hora (con zona) | rango: no aplica | lista: no aplica | automático | Primera vez que entró desde aquí. Ej. OK: 2026-11-20 10:05+01';
comment on column usuarios_dispositivos.ultimo_acceso is 'formato: fecha y hora (con zona) | rango: no aplica | lista: no aplica | automático | Última vez que entró con contraseña desde aquí. Ej. OK: 2026-11-20 10:05+01';
comment on column usuarios_dispositivos.token_alerta is 'formato: uuid | rango: no aplica | lista: no aplica | automático | Va en el botón «No he sido yo» del email (caduca a los 7 días). Ej. OK: 0b6f…';
comment on column usuarios_dispositivos.alerta_usada_en is 'formato: fecha y hora (con zona) | rango: no aplica | lista: no aplica | automático | Cuándo se pulsó «No he sido yo» (el botón ya no vuelve a valer). Vacío = no pulsado. Ej. OK: 2026-11-20 10:07+01';

-- El email nuevo (al usuario y a Dynamo).
do $$ declare v_def text; v_com text; begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'emails_enviados_tipo_check' and conrelid = 'public.emails_enviados'::regclass;
  if position('''acceso_nuevo''' in v_def) = 0 then
    v_def := replace(v_def, '''control_facturacion''::text', '''control_facturacion''::text, ''acceso_nuevo''::text, ''acceso_no_he_sido_yo''::text');
    if position('''acceso_nuevo''' in v_def) = 0 then raise exception 'No se ha podido añadir acceso_nuevo'; end if;
    alter table public.emails_enviados drop constraint emails_enviados_tipo_check;
    execute 'alter table public.emails_enviados add constraint emails_enviados_tipo_check ' || v_def;
  end if;
  v_com := col_description('emails_enviados'::regclass, (select attnum from pg_attribute where attrelid = 'emails_enviados'::regclass and attname = 'tipo'));
  if position('acceso_nuevo' in v_com) = 0 then
    v_com := replace(v_com, ' · control_facturacion (a Dynamo, los lunes, si el control de facturación tiene algo grave) · ',
                     ' · control_facturacion (a Dynamo, los lunes, si el control de facturación tiene algo grave) · acceso_nuevo (a la persona del equipo de Dynamo que entra desde un dispositivo nuevo) · acceso_no_he_sido_yo (a Dynamo, cuando alguien pulsa «No he sido yo») · ');
    if position('acceso_nuevo' in v_com) = 0 then raise exception 'No se ha podido documentar acceso_nuevo'; end if;
    execute format('comment on column emails_enviados.tipo is %L', v_com);
  end if;
end $$;

-- ---- Al entrar con la contraseña ------------------------------------------------------------
create or replace function public.registrar_acceso(p_huella text, p_descripcion text default null, p_ubicacion text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u usuarios%rowtype; d usuarios_dispositivos%rowtype; v_id uuid; v_nuevo boolean := false;
  v_base text := coalesce(parametro('url_plataforma') #>> '{}', '');
  v_cuando text := to_char(now() at time zone 'Europe/Madrid', 'DD/MM/YYYY "a las" HH24:MI');
begin
  select * into u from usuarios where id = auth.uid();
  -- Solo el equipo de Dynamo (también los de lectura). Va por el rol: el doble paso aún no se ha hecho.
  if not found or u.rol not in ('admin', 'empleado', 'admin_lectura', 'empleado_lectura') then
    return jsonb_build_object('ok', true, 'resultado', 'no_aplica');
  end if;
  if coalesce(p_huella, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'resultado', 'huella_no_valida');
  end if;
  insert into usuarios_dispositivos (usuario_id, huella, descripcion, ubicacion)
  values (u.id, p_huella, left(nullif(btrim(p_descripcion), ''), 120), left(nullif(btrim(p_ubicacion), ''), 120))
  on conflict (usuario_id, huella) do update set ultimo_acceso = now()
  returning id, (xmax = 0) into v_id, v_nuevo;
  select * into d from usuarios_dispositivos where id = v_id;
  if not v_nuevo then return jsonb_build_object('ok', true, 'resultado', 'conocido'); end if;
  if not coalesce((parametro('aviso_dispositivo_nuevo') #>> '{}')::boolean, true) then
    return jsonb_build_object('ok', true, 'resultado', 'nuevo_sin_aviso');
  end if;
  insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
  values ('acceso_nuevo:' || d.id, 'acceso_nuevo', u.email,
    'Nuevo acceso a tu cuenta de Dynamo',
    format('<p>Hola%s:</p>'
        || '<p>Se ha entrado en tu cuenta de la plataforma de Dynamo <strong>desde un navegador o dispositivo nuevo</strong>.</p>'
        || '<ul><li><strong>Cuándo:</strong> %s</li><li><strong>Desde:</strong> %s</li><li><strong>Lugar aproximado:</strong> %s</li></ul>'
        || '<p><strong>Si has sido tú</strong>, no tienes que hacer nada.</p>'
        || '<p><strong>Si no has sido tú</strong>, pulsa el botón: cerramos todas las sesiones abiertas de tu cuenta y te mandamos un email para poner una contraseña nueva.</p>'
        || '<p><a href="%s/panel/no-he-sido-yo/%s" style="display:inline-block;background:#c0262d;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">No he sido yo</a></p>'
        || '<p style="color:#6b7280;font-size:14px">Dynamo nunca te pedirá tu contraseña ni tus códigos de acceso por teléfono, email o WhatsApp. Si alguien te los pide, es un engaño.</p>',
      coalesce(' ' || escapar_html(split_part(nullif(btrim(u.nombre), ''), ' ', 1)), ''), v_cuando,
      escapar_html(coalesce(d.descripcion, 'navegador sin identificar')), escapar_html(coalesce(d.ubicacion, 'desconocido')),
      v_base, d.token_alerta))
  on conflict (clave) do nothing;
  return jsonb_build_object('ok', true, 'resultado', 'nuevo_avisado');
end $$;
revoke execute on function public.registrar_acceso(text, text, text) from public, anon;
grant execute on function public.registrar_acceso(text, text, text) to authenticated;
comment on function public.registrar_acceso(text, text, text) is '[Seguridad] Al entrar con la contraseña: anota el navegador (por la huella de su cookie) de la persona del equipo de Dynamo y, si es la primera vez que entra desde él, le manda el email «Nuevo acceso a tu cuenta de Dynamo» (con copia a Dynamo) con el botón «No he sido yo». A clientes y transportistas no les hace nada. Devuelve {ok, resultado: no_aplica | conocido | nuevo_sin_aviso | nuevo_avisado | huella_no_valida}. Quién: cualquiera con sesión (solo actúa con el equipo de Dynamo). Argumentos: p_huella: SHA-256 en hexadecimal (64) del número de la cookie · p_descripcion: navegador y sistema · p_ubicacion: ciudad y país aproximados.';

-- ---- «No he sido yo» ------------------------------------------------------------------------
create or replace function public.no_he_sido_yo(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d usuarios_dispositivos%rowtype; u usuarios%rowtype; v_cerradas int := 0;
  v_email text := coalesce(parametro('dynamo_email') #>> '{}', '');
  v_base text := coalesce(parametro('url_plataforma') #>> '{}', '');
begin
  select * into d from usuarios_dispositivos where token_alerta = p_token for update;
  if not found or d.primer_acceso < now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'resultado', 'no_vale');
  end if;
  select * into u from usuarios where id = d.usuario_id;
  if d.alerta_usada_en is not null then
    return jsonb_build_object('ok', true, 'resultado', 'ya_hecho', 'email', u.email);
  end if;
  update usuarios_dispositivos set alerta_usada_en = now() where id = d.id;
  -- Todos sus navegadores dejan de ser de confianza: la próxima entrada vuelve a avisar.
  delete from usuarios_dispositivos where usuario_id = u.id and id <> d.id;
  -- Cerrar TODAS sus sesiones (en cualquier navegador): sin sesión no se renueva el acceso.
  begin
    delete from auth.refresh_tokens where user_id = u.id::text;
    delete from auth.sessions where user_id = u.id;
    get diagnostics v_cerradas = row_count;
  exception when others then
    v_cerradas := -1;
  end;
  insert into auditoria (tabla, registro_id, accion, quien, quien_email, quien_origen, cambios)
  values ('usuarios', u.id::text, 'modificacion', u.id, u.email, 'app', jsonb_build_object('motivo', 'No he sido yo: sesiones cerradas', 'dispositivo', d.descripcion, 'ubicacion', d.ubicacion, 'sesiones_cerradas', v_cerradas));
  if v_email <> '' then
    insert into emails_enviados (clave, tipo, destinatario, asunto, cuerpo_html)
    values ('acceso_no_he_sido_yo:' || d.id, 'acceso_no_he_sido_yo', v_email,
      format('URGENTE · %s ha pulsado «No he sido yo» · Dynamo', coalesce(nullif(btrim(u.nombre), ''), u.email)),
      format('<p><strong>%s</strong> (%s) ha pulsado <strong>«No he sido yo»</strong> en el aviso de acceso desde un dispositivo nuevo: alguien ha entrado con su contraseña.</p>'
          || '<ul><li><strong>Desde:</strong> %s</li><li><strong>Lugar aproximado:</strong> %s</li><li><strong>Cuándo:</strong> %s</li></ul>'
          || '<p>%s Se le ha mandado un email para poner una contraseña nueva. Revisa con él qué ha pasado y, si hace falta, suspende su cuenta mientras tanto.</p>'
          || '<p><a href="%s/panel/usuarios?q=%s&amp;abrir=%s" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">Revisar la cuenta</a></p>',
        escapar_html(coalesce(nullif(btrim(u.nombre), ''), u.email)), escapar_html(u.email),
        escapar_html(coalesce(d.descripcion, 'navegador sin identificar')), escapar_html(coalesce(d.ubicacion, 'desconocido')),
        to_char(d.primer_acceso at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI'),
        case when v_cerradas >= 0 then 'Se han cerrado todas sus sesiones.' else '<strong>No se han podido cerrar sus sesiones solas</strong>: ciérralas en Supabase → Authentication → Users.' end,
        v_base, replace(replace(u.email, '%', ''), '+', '%%2B'), u.id))
    on conflict (clave) do nothing;
  end if;
  return jsonb_build_object('ok', true, 'resultado', case when v_cerradas >= 0 then 'cerradas' else 'sin_cerrar' end, 'email', u.email);
end $$;
revoke execute on function public.no_he_sido_yo(uuid) from public;
grant execute on function public.no_he_sido_yo(uuid) to anon, authenticated;
comment on function public.no_he_sido_yo(uuid) is '[Seguridad] Botón «No he sido yo» del email de acceso nuevo (vale 7 días y una vez): cierra todas las sesiones de esa persona, deja de fiarse de todos sus navegadores (la próxima entrada vuelve a avisar), lo anota en la auditoría y avisa a Dynamo con urgencia. La página manda después el email de contraseña nueva. Devuelve {ok, resultado: cerradas | sin_cerrar | ya_hecho | no_vale, email}. Quién: cualquiera con el enlace (sin sesión). Argumentos: p_token: usuarios_dispositivos.token_alerta.';
