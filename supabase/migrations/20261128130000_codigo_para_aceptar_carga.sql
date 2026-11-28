-- CÓDIGO DE 4 CIFRAS PARA ACEPTAR UNA CARGA DESDE EL ENLACE (usuario, 2026-11-28, tras la
-- auditoría de seguridad): «se le manda tanto por email como por WhatsApp el mismo código a los
-- dos sitios… un código de 4 cifras, más sencillo de meter que de 6». Antes, en una oferta que
-- no es personal (bolsa, tablón), el transportista se identificaba SOLO con su CIF, y los CIF son
-- públicos: cualquiera podía aceptar una carga en nombre de otro.
-- Ahora, al identificarse por CIF:
--   1. El servidor pide un código (carga_codigo_preparar): la base de datos guarda solo su huella
--      y devuelve el email y el móvil de la ficha del transportista; el servidor manda el MISMO
--      código por email y por WhatsApp. Uno por minuto y 5 por reserva. Caduca a los 15 minutos.
--   2. Al aceptar, aceptar_oferta_publica exige ese código: 5 intentos; al quinto fallo hay que
--      pedir otro. Una vez aceptada, el código ya no vale.
-- Las ofertas PERSONALES (el enlace que se manda a un transportista concreto) no piden código:
-- el enlace ya es suyo. El alta de un transportista nuevo tampoco: la revisa Dynamo.

alter table public.envio_reservas
  add column if not exists codigo_sha text,
  add column if not exists codigo_transportista_id uuid,   -- sin clave ajena: una segunda relación con transportistas rompería las consultas que la usan
  add column if not exists codigo_caduca_en timestamptz,
  add column if not exists codigo_intentos smallint not null default 0,
  add column if not exists codigo_pedidos smallint not null default 0,
  add column if not exists codigo_pedido_en timestamptz;
comment on column public.envio_reservas.codigo_sha is 'formato: texto (huella sha-256 en hexadecimal) | rango: 64 caracteres | lista: no aplica | automático | Huella del código de 4 cifras para aceptar la carga identificándose por CIF (el código nunca se guarda). Vacía si no se ha pedido o ya se usó. Ej. OK: 9f86d0… · Ej. mal: 1234';
comment on column public.envio_reservas.codigo_transportista_id is 'formato: uuid | rango: no aplica | lista: transportistas.id | automático | Transportista (por su CIF) al que se mandó el código: solo vale para aceptar como él. Ej. OK: el id del transportista · Ej. mal: otro transportista';
comment on column public.envio_reservas.codigo_caduca_en is 'formato: fecha y hora con zona (ISO 8601) | rango: 15 minutos desde que se pide | lista: no aplica | automático | Hasta cuándo vale el código para aceptar. Ej. OK: 2026-11-28 12:15:00+00 · Ej. mal: vacío con código pedido';
comment on column public.envio_reservas.codigo_intentos is 'formato: número entero | rango: 0 a 5 | lista: no aplica | automático | Códigos mal escritos con el código actual; al quinto hay que pedir otro. Ej. OK: 2 · Ej. mal: -1';
comment on column public.envio_reservas.codigo_pedidos is 'formato: número entero | rango: 0 a 5 | lista: no aplica | automático | Cuántos códigos se han pedido con esta reserva (máx. 5). Ej. OK: 1 · Ej. mal: 9';
comment on column public.envio_reservas.codigo_pedido_en is 'formato: fecha y hora con zona (ISO 8601) | rango: no aplica | lista: no aplica | automático | Cuándo se pidió el último código (uno por minuto). Ej. OK: 2026-11-28 12:00:00+00 · Ej. mal: una fecha futura';

-- ---- 1. Pedir el código ---------------------------------------------------------------------
create or replace function public.carga_codigo_preparar(p_reserva uuid, p_cif text, p_codigo_sha text, p_ip inet default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; o_t uuid; v_t uuid; v_fd int; v_fr int; v_email text; v_tel text; v_ref text;
begin
  if p_codigo_sha is null or p_codigo_sha !~ '^[0-9a-f]{64}$' then return jsonb_build_object('resultado', 'error'); end if;
  select * into r from envio_reservas where id = p_reserva for update;
  if not found or r.estado <> 'viva' or r.hasta < now() or not enlace_carga_vigente(r.envio_id) then
    return jsonb_build_object('resultado', 'reserva_caducada');
  end if;
  if r.oferta_id is not null then select transportista_id into o_t from envio_ofertas where id = r.oferta_id; end if;
  if o_t is not null then return jsonb_build_object('resultado', 'oferta_personal'); end if;
  if nullif(trim(coalesce(p_cif, '')), '') is null then return jsonb_build_object('resultado', 'falta_cif'); end if;
  select id into v_t from transportistas where normalizar_id_fiscal(cif) = normalizar_id_fiscal(p_cif) limit 1;
  if v_t is null then
    -- Igual que al aceptar: cada CIF desconocido cuenta como fallo y al tope se libera la reserva.
    select count(*) into v_fd from intentos_carga_publica where envio_id = r.envio_id and cuando > now() - interval '24 hours';
    if v_fd >= coalesce((parametro('carga_publica_max_fallos_dia') #>> '{}')::int, 20) then
      return jsonb_build_object('resultado', 'demasiados_intentos');
    end if;
    insert into intentos_carga_publica (envio_id, reserva_id, motivo, ip) values (r.envio_id, p_reserva, 'cif_no_encontrado', p_ip);
    select count(*) into v_fr from intentos_carga_publica where reserva_id = p_reserva;
    if v_fr >= coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) then
      perform liberar_reserva_publica(p_reserva, 'demasiados CIF no encontrados');
      return jsonb_build_object('resultado', 'demasiados_intentos');
    end if;
    return jsonb_build_object('resultado', 'transportista_no_encontrado', 'intentos_restantes',
      coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) - v_fr);
  end if;
  if r.codigo_pedido_en is not null and r.codigo_pedido_en > now() - interval '60 seconds' then
    return jsonb_build_object('resultado', 'espera', 'segundos', ceil(extract(epoch from r.codigo_pedido_en + interval '60 seconds' - now()))::int);
  end if;
  if r.codigo_pedidos >= 5 then return jsonb_build_object('resultado', 'demasiados'); end if;
  -- Contacto de la ficha (agenda compartida): email de tráfico, si no el principal o el primero;
  -- móvil del principal o del primero que lo tenga; si no, el móvil verificado de un usuario suyo.
  select c.email into v_email from contactos c
   where c.transportista_id = v_t and c.email is not null and position('@' in c.email) > 0
   order by (c.funcion::text = 'trafico') desc, c.es_principal desc, c.creado_en limit 1;
  select tel_whatsapp(c.telefono) into v_tel from contactos c
   where c.transportista_id = v_t and c.telefono is not null and movil_valido(c.telefono)
   order by c.es_principal desc, c.creado_en limit 1;
  if v_tel is null then
    select tel_whatsapp(u.telefono) into v_tel from usuarios u
     where u.transportista_id = v_t and u.estado = 'activa' and u.telefono is not null and u.telefono_verificado_en is not null and movil_valido(u.telefono)
     order by u.creado_en limit 1;
  end if;
  if v_email is null and v_tel is null then return jsonb_build_object('resultado', 'sin_contacto'); end if;
  update envio_reservas set codigo_sha = p_codigo_sha, codigo_transportista_id = v_t, codigo_caduca_en = now() + interval '15 minutes',
         codigo_intentos = 0, codigo_pedidos = codigo_pedidos + 1, codigo_pedido_en = now()
   where id = p_reserva;
  select referencia_gx into v_ref from envios where id = r.envio_id;
  return jsonb_build_object('resultado', 'ok', 'envio_id', r.envio_id, 'referencia', v_ref, 'email', v_email, 'telefono', v_tel,
    'email_oculto', case when v_email is null then null
      else left(split_part(v_email, '@', 1), 2) || '****@' || split_part(v_email, '@', 2) end,
    'telefono_oculto', case when v_tel is null then null else '*** *** ' || right(v_tel, 3) end);
end $$;
revoke execute on function public.carga_codigo_preparar(uuid, text, text, inet) from public, anon, authenticated;
grant execute on function public.carga_codigo_preparar(uuid, text, text, inet) to service_role;
comment on function public.carga_codigo_preparar(uuid, text, text, inet) is '[Ofertas y transportistas] Enlace público de la carga: el transportista que se identifica por CIF pide el código de 4 cifras para aceptar. Guarda la huella del código (la pone el servidor; el código no se guarda), lo ata a ese transportista y le da 15 minutos; uno por minuto y 5 por reserva. Un CIF que no está en Dynamo cuenta como fallo, igual que al aceptar. Devuelve {resultado: ok | espera | demasiados | sin_contacto | transportista_no_encontrado | demasiados_intentos | oferta_personal | reserva_caducada | falta_cif, email, telefono (para que el servidor lo mande), email_oculto, telefono_oculto}. Quién: SOLO el servidor web. Argumentos: p_reserva: envio_reservas.id (la cookie) · p_cif: CIF/NIF · p_codigo_sha: huella del código · p_ip: IP de quien lo pide.';

-- ---- 2. Aceptar exige el código si se identifica por CIF ------------------------------------
drop function if exists public.aceptar_oferta_publica(uuid, text, numeric, boolean, text, text, text, text, inet);
create or replace function public.aceptar_oferta_publica(p_reserva uuid, p_cif text, p_precio numeric default null, p_pronto_pago boolean default false,
  p_matricula_camion text default null, p_matricula_remolque text default null, p_conductor_nombre text default null, p_telefono text default null,
  p_ip inet default null, p_codigo_sha text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; o_t uuid; o_pp boolean; v_t uuid; v_res jsonb; v_tel text; v_fr int; v_fd int; v_int int;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found then return jsonb_build_object('resultado', 'reserva_no_existe'); end if;
  if r.oferta_id is not null then select transportista_id, pronto_pago into o_t, o_pp from envio_ofertas where id = r.oferta_id; end if;
  if coalesce(p_pronto_pago, false) then perform pg_advisory_xact_lock(hashtext('dynamo_pronto_pago')); end if;

  v_t := o_t;
  if v_t is null then
    if nullif(trim(p_cif), '') is null then return jsonb_build_object('resultado', 'falta_cif'); end if;
    select id into v_t from transportistas where normalizar_id_fiscal(cif) = normalizar_id_fiscal(p_cif);
    if v_t is null then
      select count(*) into v_fd from intentos_carga_publica where envio_id = r.envio_id and cuando > now() - interval '24 hours';
      if v_fd >= coalesce((parametro('carga_publica_max_fallos_dia') #>> '{}')::int, 20) then
        return jsonb_build_object('resultado', 'demasiados_intentos');
      end if;
      insert into intentos_carga_publica (envio_id, reserva_id, motivo, ip) values (r.envio_id, p_reserva, 'cif_no_encontrado', p_ip);
      select count(*) into v_fr from intentos_carga_publica where reserva_id = p_reserva;
      if v_fr >= coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) then
        perform liberar_reserva_publica(p_reserva, 'demasiados CIF no encontrados');
        return jsonb_build_object('resultado', 'demasiados_intentos');
      end if;
      return jsonb_build_object('resultado', 'transportista_no_encontrado', 'intentos_restantes',
        coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) - v_fr);
    end if;
    -- EL CÓDIGO (2026-11-28): identificarse por CIF no basta; hace falta el código que se le
    -- mandó a ESE transportista por email y WhatsApp.
    if r.codigo_sha is null or r.codigo_transportista_id is distinct from v_t then
      return jsonb_build_object('resultado', 'falta_codigo');
    end if;
    if r.codigo_caduca_en is null or r.codigo_caduca_en < now() then return jsonb_build_object('resultado', 'codigo_caducado'); end if;
    if r.codigo_intentos >= 5 then return jsonb_build_object('resultado', 'codigo_intentos'); end if;
    if p_codigo_sha is distinct from r.codigo_sha then
      update envio_reservas set codigo_intentos = codigo_intentos + 1 where id = p_reserva returning codigo_intentos into v_int;
      return case when v_int >= 5 then jsonb_build_object('resultado', 'codigo_intentos')
                  else jsonb_build_object('resultado', 'codigo_mal', 'quedan', 5 - v_int) end;
    end if;
  end if;

  v_res := aceptar_reserva(p_reserva, v_t, null, p_precio);
  if v_res ->> 'resultado' in ('aceptada', 'pendiente_revision') then
    update envio_reservas
       set pronto_pago = coalesce(p_pronto_pago, false) and coalesce(o_pp, true),
           codigo_sha = null   -- el código ya no vale
     where id = p_reserva;
  end if;
  if v_res ->> 'resultado' = 'aceptada' then
    v_tel := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
    update envios set
      matricula_camion   = coalesce(nullif(upper(regexp_replace(coalesce(p_matricula_camion, ''), '[\s-]', '', 'g')), ''), matricula_camion),
      matricula_remolque = coalesce(nullif(upper(regexp_replace(coalesce(p_matricula_remolque, ''), '[\s-]', '', 'g')), ''), matricula_remolque),
      conductor_nombre   = coalesce(nullif(trim(p_conductor_nombre), ''), conductor_nombre),
      conductor_telefono = coalesce(case when length(replace(v_tel, '+', '')) >= 6 then v_tel end, conductor_telefono),
      transportista_nima = coalesce(transportista_nima, (select nima from transportistas where id = v_t))
     where id = r.envio_id;
  end if;
  return v_res || jsonb_build_object('transportista', (select nombre_visible from transportistas where id = v_t));
end $$;
grant execute on function public.aceptar_oferta_publica(uuid, text, numeric, boolean, text, text, text, text, inet, text) to anon, authenticated, service_role;
comment on function public.aceptar_oferta_publica(uuid, text, numeric, boolean, text, text, text, text, inet, text) is '[Ofertas y transportistas] Enlace público de una carga: el transportista acepta la carga que tiene reservada. Si la oferta no es personal, se identifica con su CIF (ya dado de alta) Y con el código de 4 cifras que se le mandó por email y WhatsApp (carga_codigo_preparar; 15 minutos, 5 intentos). Cada CIF no encontrado cuenta como fallo y al llegar al tope pierde la reserva. Si queda aceptada guarda matrículas y conductor. Devuelve jsonb {resultado: aceptada | pendiente_revision | falta_codigo | codigo_mal (quedan) | codigo_caducado | codigo_intentos | transportista_no_encontrado | …, transportista}. Quién: público con reserva (anon o con sesión). Argumentos: p_reserva: envio_reservas.id · p_cif: CIF del transportista (si la oferta no es personal) · p_precio: precio propuesto dentro de la banda (null = el ofertado) · p_pronto_pago: pide pronto pago · p_matricula_camion/p_matricula_remolque: matrículas · p_conductor_nombre, p_telefono: datos del conductor · p_ip: IP de quien llama · p_codigo_sha: huella del código (la calcula el servidor web).';

-- ---- 3. Tipo de email del código ------------------------------------------------------------
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
  select array_agg(distinct x order by x) into v_lista from unnest(v_lista || array['codigo_aceptar_carga']) as x;
  alter table emails_enviados drop constraint emails_enviados_tipo_check;
  execute format('alter table emails_enviados add constraint emails_enviados_tipo_check check (tipo = any (%L::text[]))', v_lista);
end $$;
