-- DeCA, SEGUNDA REVISIÓN LEGAL (usuario, 2026-11-15):
--  1. SEMIRREMOLQUE OBLIGATORIO EN CONJUNTOS ARTICULADOS. Orden FOM/2861/2012, art. 6:
--     «Cuando se trate de un conjunto articulado deberá hacerse constar tanto la matrícula
--     del vehículo tractor como la del semirremolque o remolque arrastrado por éste». Un
--     envío de tráiler (no pide plataforma elevadora) cuyo camión no figura como rígido
--     necesita las DOS matrículas: sin la del semirremolque no se firma ninguna casilla, el
--     aviso de «faltan las matrículas» sigue saliendo y el PDF lo marca. Quien firma la
--     cabecera puede declarar «es un camión rígido» (queda en la ficha del vehículo).
--  2. EL MOTIVO DE LA 1.ª ASIGNACIÓN ya no es «Dato pendiente al emitir el documento»: el
--     panel dice si el cambio llegó antes o después de empezar el transporte ('iniciado')
--     y el PDF pone «Asignación previa al inicio del transporte» o lo que corresponda.

-- ---- 1. ¿Este envío necesita matrícula de semirremolque? ------------------------------
create or replace function envio_necesita_remolque(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select e.operador_id is null and not coalesce(e.requiere_plataforma_elevadora, false)
           and coalesce((select v.tipo from vehiculos v where v.id = e.vehiculo_camion_id), 'tractora') <> 'rigido'
      from envios e where e.id = p_envio), false)
$$;
revoke execute on function envio_necesita_remolque(uuid) from public, anon, authenticated;
comment on function public.envio_necesita_remolque(uuid) is '[Envíos] true si el documento de control del envío debe llevar DOS matrículas (tractora y semirremolque; Orden FOM/2861/2012, art. 6): envío de Dynamo, que no pide plataforma elevadora (rígido) y cuyo camión no figura como rígido en la flota. Quién: funciones internas (firma del CMR, avisos de matrículas y los datos de los PDF). Argumentos: p_envio: envios.id.';

-- ---- 2. La firma lo exige -------------------------------------------------------------
drop function if exists public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean, double precision, double precision, integer, text, text, text, text);
create or replace function public.firmar_cmr_publico(
  p_token uuid, p_parada uuid, p_rol text, p_nombre text, p_documento text, p_pais text,
  p_validado boolean, p_email text, p_ruta text, p_ip inet, p_navegador text, p_sha256 text,
  p_extra boolean default false, p_lat double precision default null, p_lon double precision default null,
  p_gps_precision_m integer default null, p_gps_direccion text default null, p_trazo_png text default null,
  p_matricula_camion text default null, p_matricula_remolque text default null,
  p_camion_rigido boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_envio uuid; v_tipo text; v_estado estado_envio; v_transportista uuid; v_manual boolean; v_sitio uuid; v_email text;
        v_trazo bytea; v_cabecera boolean; v_mc text; v_mr text;
begin
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  select estado, transportista_id, es_manual into v_estado, v_transportista, v_manual from envios where id = v_envio;
  if v_estado = 'cancelado' then return jsonb_build_object('resultado', 'cancelado'); end if;
  -- SIN TRANSPORTISTA NO SE FIRMA (usuario, 2026-11-10): sin camión asignado no se
  -- puede estar cargando. En los manuales el porteador es el operador: no aplica.
  if v_transportista is null and not coalesce(v_manual, false) then
    return jsonb_build_object('resultado', 'sin_transportista');
  end if;
  if p_rol not in ('remitente', 'transportista', 'destinatario') then return jsonb_build_object('resultado', 'rol_no_valido'); end if;

  -- Cada casilla con su parada: el remitente firma en una RECOGIDA, el destinatario en
  -- una ENTREGA y el transportista sin parada. Vale también para las firmas extra.
  if p_rol = 'transportista' then
    if p_parada is not null then return jsonb_build_object('resultado', 'parada_no_valida'); end if;
  else
    select tipo into v_tipo from envio_paradas where id = p_parada and envio_id = v_envio;
    if v_tipo is null or (p_rol = 'remitente' and v_tipo <> 'carga') or (p_rol = 'destinatario' and v_tipo <> 'descarga') then
      return jsonb_build_object('resultado', 'parada_no_valida');
    end if;
  end if;
  -- La casilla principal solo se firma una vez; las EXTRA no la ocupan y van con su
  -- propio tope: 3 por envío.
  if not coalesce(p_extra, false) and exists (select 1 from firmas_cmr
       where envio_id = v_envio and rol = p_rol and parada_id is not distinct from p_parada and not extra) then
    return jsonb_build_object('resultado', 'ya_firmada');
  end if;
  if coalesce(p_extra, false) and (select count(*) from firmas_cmr where envio_id = v_envio and extra) >= 3 then
    return jsonb_build_object('resultado', 'demasiadas_firmas');
  end if;
  if nullif(trim(p_nombre), '') is null or nullif(trim(p_documento), '') is null then
    return jsonb_build_object('resultado', 'faltan_datos');
  end if;

  -- MATRÍCULAS AL FIRMAR (usuario, 2026-11-11): solo en la firma PRINCIPAL del
  -- transportista o del cargador de la 1.ª parada (da igual quién firme antes). Ahí se
  -- verifican, se corrigen o, si el envío no las tiene, SE EXIGEN (salvo manuales): el
  -- DeCA debe existir antes de salir de la 1.ª parada. En las demás casillas y en las
  -- extra el parámetro se ignora: el envío ya está en tránsito.
  v_cabecera := not coalesce(p_extra, false)
    and (p_rol = 'transportista'
         or (p_rol = 'remitente' and p_parada = (select p2.id from envio_paradas p2 where p2.envio_id = v_envio order by p2.orden limit 1)));
  if v_cabecera then
    v_mc := nullif(upper(trim(coalesce(p_matricula_camion, ''))), '');
    v_mr := nullif(upper(trim(coalesce(p_matricula_remolque, ''))), '');
    if v_mc is not null then
      if v_mc !~ '^[A-Z0-9][A-Z0-9 .·-]{1,15}$' or (v_mr is not null and v_mr !~ '^[A-Z0-9][A-Z0-9 .·-]{1,15}$') then
        return jsonb_build_object('resultado', 'matricula_no_valida');
      end if;
      -- CONJUNTO ARTICULADO = DOS MATRÍCULAS (Orden FOM/2861/2012, art. 6; usuario,
      -- 2026-11-15): sin la del semirremolque no vale, salvo que el envío pida rígido
      -- (plataforma elevadora), la ficha de ese camión diga «rígido» o quien firma lo
      -- declare (p_camion_rigido). Se comprueba ANTES de guardar nada.
      if v_mr is null and not coalesce(v_manual, false) and not coalesce(p_camion_rigido, false)
         and not coalesce((select requiere_plataforma_elevadora from envios where id = v_envio), false)
         and not exists (select 1 from vehiculos where activo and tipo = 'rigido'
                            and normalizar_matricula(matricula) = normalizar_matricula(v_mc)) then
        return jsonb_build_object('resultado', 'falta_remolque');
      end if;
      update envios set matricula_camion = v_mc, matricula_remolque = v_mr where id = v_envio;
      if coalesce(p_camion_rigido, false) and v_mr is null then
        update vehiculos set tipo = 'rigido'
         where id = (select vehiculo_camion_id from envios where id = v_envio) and tipo = 'tractora';
      end if;
    elsif not coalesce(v_manual, false)
          and ((select matricula_camion from envios where id = v_envio) is null
               or (envio_necesita_remolque(v_envio) and (select matricula_remolque from envios where id = v_envio) is null)) then
      return jsonb_build_object('resultado', 'faltan_matriculas');
    end if;
  end if;
  -- NADIE FIRMA SIN MATRÍCULAS NI SITIOS (usuario, 2026-11-15): además del transportista
  -- (arriba), ninguna casilla — destinatario, otras recogidas, firmas extra — se firma
  -- mientras el envío no tenga la matrícula del camión ni una recogida y una entrega con
  -- su sitio. La firma de cabecera (transportista o cargador de la 1.ª recogida) puede
  -- poner las matrículas en ese mismo acto: este control va DESPUÉS de guardarlas.
  if not coalesce(v_manual, false) then
    if (select matricula_camion from envios where id = v_envio) is null
       or (envio_necesita_remolque(v_envio) and (select matricula_remolque from envios where id = v_envio) is null) then
      return jsonb_build_object('resultado', 'sin_matriculas');
    end if;
    if not exists (select 1 from envio_paradas where envio_id = v_envio and tipo = 'carga')
       or not exists (select 1 from envio_paradas where envio_id = v_envio and tipo = 'descarga')
       or exists (select 1 from envio_paradas where envio_id = v_envio
                   and nullif(trim(coalesce(codigo_postal, '')), '') is null and nullif(trim(coalesce(poblacion, '')), '') is null) then
      return jsonb_build_object('resultado', 'faltan_sitios');
    end if;
  end if;
  -- El trazo tiene que estar ya subido, y en la carpeta de ESTE enlace.
  if p_ruta not like 'cmr/' || p_token::text || '/%'
     or not exists (select 1 from storage.objects where bucket_id = 'documentos' and name = p_ruta) then
    return jsonb_build_object('resultado', 'falta_trazo');
  end if;
  -- El MISMO PNG, también en la fila (2026-11-11): de aquí lo leen la página y el PDF
  -- públicos sin clave de servicio. Si no llega o no decodifica, la firma vale igual.
  begin
    if p_trazo_png is not null and length(p_trazo_png) <= 820000 then
      v_trazo := decode(regexp_replace(p_trazo_png, '\s', '', 'g'), 'base64');
      if v_trazo is not null and (octet_length(v_trazo) not between 200 and 600000 or substring(v_trazo from 1 for 4) <> '\x89504e47'::bytea) then
        v_trazo := null;
      end if;
    end if;
  exception when others then v_trazo := null;
  end;

  -- GPS: solo si llega el par completo y dentro de rango; la precisión, acotada.
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    p_lat := null; p_lon := null; p_gps_precision_m := null;
  end if;
  insert into firmas_cmr (envio_id, parada_id, rol, nombre, documento, documento_pais, documento_validado,
                          email, ip, navegador, firma_storage_ruta, sha256_documento, extra, lat, lon, gps_precision_m, gps_direccion, trazo_png)
  values (v_envio, p_parada, p_rol, trim(p_nombre), upper(regexp_replace(p_documento, '[\s.-]', '', 'g')),
          upper(coalesce(nullif(p_pais, ''), 'XX')),
          -- La validez la decide la base de datos (no quien llama): DNI/NIE español con su letra.
          upper(coalesce(nullif(p_pais, ''), 'XX')) = 'ES' and documento_es_valido(p_documento), nullif(lower(trim(p_email)), ''),
          p_ip, left(p_navegador, 400), p_ruta,
          case when p_sha256 ~ '^[0-9a-f]{64}$' then p_sha256 end, coalesce(p_extra, false),
          p_lat, p_lon, case when p_lat is not null then least(greatest(p_gps_precision_m, 0), 100000) end,
          case when p_lat is not null then left(nullif(trim(p_gps_direccion), ''), 300) end, v_trazo);

  -- EL EMAIL A LA FICHA (2026-11-09): si quien firma deja su email y la ficha del sitio
  -- de la parada (o la del transportista, en la casilla 23) no tenía NINGUNO, se guarda
  -- ahí — en su primer contacto, o en uno nuevo si no había contactos — y la próxima
  -- firma sale precargada. Nunca pisa un email existente; si falla, la firma vale igual.
  begin
    v_email := nullif(lower(trim(p_email)), '');
    if v_email is not null and v_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      if p_rol <> 'transportista' then
        select sitio_id into v_sitio from envio_paradas where id = p_parada;
        if v_sitio is not null
           and not exists (select 1 from contactos where sitio_id = v_sitio and email is not null) then
          update contactos set email = v_email, modificado_en = now()
           where id = (select id from contactos where sitio_id = v_sitio
                        order by es_principal desc, creado_en limit 1);
          if not found then
            insert into contactos (sitio_id, nombre, email, es_principal)
            values (v_sitio, trim(p_nombre), v_email, true);
          end if;
        end if;
      elsif v_transportista is not null
            and not exists (select 1 from contactos where transportista_id = v_transportista and email is not null) then
        update contactos set email = v_email, modificado_en = now()
         where id = (select id from contactos where transportista_id = v_transportista
                      order by es_principal desc, creado_en limit 1);
        if not found then
          insert into contactos (transportista_id, nombre, email, es_principal)
          values (v_transportista, trim(p_nombre), v_email, true);
        end if;
      end if;
    end if;
  exception when others then null;   -- guardar el email nunca puede tumbar la firma
  end;
  return jsonb_build_object('resultado', 'firmada');
end $$;
revoke all on function public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean, double precision, double precision, integer, text, text, text, text, boolean) from public;
grant execute on function public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean, double precision, double precision, integer, text, text, text, text, boolean) to anon, authenticated, service_role;
comment on function public.firmar_cmr_publico(uuid, uuid, text, text, text, text, boolean, text, text, inet, text, text, boolean, double precision, double precision, integer, text, text, text, text, boolean) is '[CMR y PIN] Firma una casilla del CMR desde el enlace: SOLO con transportista asignado (sin camión no se está cargando; devuelve sin_transportista), con las matrículas ya puestas — la del camión y, si es un conjunto articulado, también la del semirremolque (sin_matriculas) y con recogida y entrega con su sitio (faltan_sitios) — en envíos manuales nada de esto aplica —, valida la casilla (remitente en recogida, destinatario en entrega, transportista sin parada), exige el trazo ya subido a la carpeta del enlace y guarda la firma con hora del servidor, documento (letra validada para ES), IP, navegador, huella, el PNG del trazo en la propia fila y, si quien firma dio permiso, su ubicación GPS. En la firma principal del transportista o del cargador de la 1.ª parada, las matrículas se verifican, se corrigen (p_matricula_camion, p_matricula_remolque) o, si el envío no las tiene, se exigen (faltan_matriculas; salvo manuales): el DeCA debe existir antes de salir. Si quien firma deja email y la ficha del sitio (o del transportista) no tenía ninguno, se guarda en ella sin pisar nada. Con p_extra, es una firma AÑADIDA: no ocupa la casilla y hay 3 como mucho por envío. Quién: la página pública del CMR (anon) con su enlace vivo. Argumentos: p_token: llave del enlace · p_parada: envio_paradas.id (null para el transportista) · p_rol: remitente, transportista o destinatario · p_nombre, p_documento, p_pais, p_validado, p_email: quien firma · p_ruta: trazo cmr/<llave>/… · p_ip, p_navegador: desde dónde · p_sha256: huella de lo firmado · p_extra: firma añadida (opcional) · p_lat, p_lon, p_gps_precision_m, p_gps_direccion: ubicación (opcionales) · p_trazo_png: el PNG del trazo en base64 (opcional) · p_matricula_camion, p_matricula_remolque: matrículas del camión (opcionales; solo transportista o cargador de la 1.ª parada; camión sin semirremolque en un tráiler devuelve falta_remolque) · p_camion_rigido: quien firma declara que es un camión rígido, sin semirremolque (opcional).';

-- ---- 3. La página de firma y los PDF saben si hace falta el semirremolque ---------------
-- Se añade la clave 'necesita_remolque' a lo que ya devuelven, sobre su definición actual
-- (pg_get_functiondef), sin arrastrar a mano funciones de cien líneas. Si alguna no
-- tuviera la línea esperada, la migración falla en vez de dejarla a medias.
do $$
declare v_def text; v_nueva text; r record;
  c_par text := '''matricula_camion'', e.matricula_camion, ''matricula_remolque'', e.matricula_remolque,';
begin
  for r in select * from (values
      ('public.cmr_publico(uuid)', '    ''matricula_camion'', e.matricula_camion,' || chr(10),
         '    ''matricula_camion'', e.matricula_camion,' || chr(10) || '    ''necesita_remolque'', envio_necesita_remolque(e.id),' || chr(10)),
      ('public.orden_carga_json(uuid)', c_par, c_par || ' ''necesita_remolque'', envio_necesita_remolque(e.id),'),
      ('public.datos_cmr_por_token(uuid)', c_par, c_par || ' ''necesita_remolque'', envio_necesita_remolque(e.id),'),
      ('public.encolar_avisos_operativos()', 'and e.transportista_id is not null and e.matricula_camion is null',
         'and e.transportista_id is not null and (e.matricula_camion is null or (envio_necesita_remolque(e.id) and e.matricula_remolque is null))')
    ) as x(fn, viejo, nuevo)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_nueva := replace(v_def, r.viejo, r.nuevo);
    if v_nueva = v_def then raise exception 'No encuentro la línea esperada en %: revisar antes de aplicar.', r.fn; end if;
    execute v_nueva;
  end loop;
end $$;

-- ---- 4. El panel de modificaciones dice si el transporte ya había empezado --------------
create or replace function fn_modificaciones_deca(p_envio uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with emision as (
    select max(c.creado_en) as en from cmr_enlaces c where c.envio_id = p_envio and not c.revocado
  ), h as (
    select id, hito, cuando, datos,
           row_number() over (partition by hito order by cuando) as n,
           lag(datos) over (partition by hito order by cuando) as previo
      from envio_hitos
     where envio_id = p_envio
       and hito in ('ruta_cambiada', 'fecha_carga_movida', 'fecha_carga_cambiada', 'mercancia_cambiada',
                    'transportista_quitado', 'transportista_asignado', 'matricula_asignada')
  ), sel as (
    select h.* from h cross join emision
     where case when emision.en is not null then h.cuando > emision.en
                else h.hito in ('ruta_cambiada', 'fecha_carga_movida', 'fecha_carga_cambiada', 'mercancia_cambiada', 'transportista_quitado') or h.n > 1 end
       -- Un relevo de transportista es UN cambio: la retirada que va con su nueva asignación
       -- (misma transacción) no sale aparte; el anterior figura como dato no válido.
       and not (h.hito = 'transportista_quitado'
                and exists (select 1 from h h2 where h2.hito = 'transportista_asignado' and h2.cuando = h.cuando))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cuando', to_char(s.cuando at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI'),
           'en', s.cuando,
           'hito', s.hito,
           -- Primera asignación sin dato previo: rellena lo que faltaba al emitir.
           'primera', s.n = 1 and s.hito in ('transportista_asignado', 'matricula_asignada'),
           -- ¿Estaba ya el transporte en marcha (camión cargando o cargado) cuando se hizo el cambio?
           'iniciado', exists (select 1 from envio_hitos i where i.envio_id = p_envio
                                and i.hito in ('cargando', 'cargado') and i.cuando <= s.cuando),
           'detalle', case s.hito
             when 'ruta_cambiada' then deca_ruta_texto(s.datos -> 'despues')
             when 'fecha_carga_movida' then deca_fechas_texto(s.datos ->> 'desde', s.datos ->> 'hasta')
             when 'fecha_carga_cambiada' then deca_fechas_texto(s.datos ->> 'desde', s.datos ->> 'hasta')
             when 'mercancia_cambiada' then s.datos ->> 'despues'
             when 'matricula_asignada' then nullif(concat_ws(' + ', coalesce(s.datos ->> 'camion', s.datos ->> 'tractora'), s.datos ->> 'remolque'), '')
             when 'transportista_asignado' then (select coalesce(t.nombre_visible, t.razon_social) from transportistas t
                                                  where t.id = (nullif(s.datos ->> 'transportista_id', ''))::uuid)
             else null end,
           'antes', case s.hito
             when 'ruta_cambiada' then deca_ruta_texto(s.datos -> 'antes')
             when 'fecha_carga_movida' then deca_fechas_texto(s.datos ->> 'antes_desde', s.datos ->> 'antes_hasta')
             when 'fecha_carga_cambiada' then deca_fechas_texto(s.datos ->> 'antes_desde', s.datos ->> 'antes_hasta')
             when 'mercancia_cambiada' then s.datos ->> 'antes'
             when 'matricula_asignada' then nullif(concat_ws(' + ', coalesce(s.previo ->> 'camion', s.previo ->> 'tractora'), s.previo ->> 'remolque'), '')
             when 'transportista_asignado' then (select coalesce(t.nombre_visible, t.razon_social) from transportistas t
                                                  where t.id = (nullif(s.previo ->> 'transportista_id', ''))::uuid)
             when 'transportista_quitado' then (select coalesce(t.nombre_visible, t.razon_social) from transportistas t
                                                 where t.id = (nullif(s.datos ->> 'transportista_id', ''))::uuid)
             end,
           -- El motivo escrito por Dynamo (justo después del cambio, hasta 2 min) o el que traiga el propio
           -- registro (p. ej. «Pago recibido cuando ya no daba tiempo»); si no, el PDF pone uno genérico.
           'motivo', coalesce(
             (select m.motivo from deca_motivos m
               where m.envio_id = p_envio and m.creado_en between s.cuando and s.cuando + interval '2 minutes'
                 -- del ÚLTIMO cambio anterior al motivo: si entre medias hubo otro, es de ese otro
                 and not exists (select 1 from h h3 where h3.cuando > s.cuando and h3.cuando <= m.creado_en)
               order by m.creado_en limit 1),
             nullif(s.datos ->> 'motivo', ''))
         ) order by s.cuando), '[]'::jsonb)
    from sel s
$$;
revoke execute on function fn_modificaciones_deca(uuid) from public, anon, authenticated;
comment on function public.fn_modificaciones_deca(uuid) is '[Envíos] Las modificaciones del documento de control (DeCA) de un envío, para el panel del PDF (Resolución 5-jun-2026, apdo. quinto.1: datos nuevos, motivo y datos antiguos marcados como no válidos). Cambios de ruta, fecha de carga (al pagar tarde o desde «Modificar»), mercancía, transportista y matrículas. Solo los posteriores a la emisión (enlace vivo del DeCA); sin emisión, como antes (ruta, fecha, retirada y desde la 2.ª asignación). Por cambio: cuando (dd/mm/aaaa hh:mm España), en (fecha y hora ISO, para los metadatos del PDF), hito, primera (1.ª asignación de transportista o matrículas), iniciado (el cambio llegó con el transporte ya en marcha: había un registro de cargando o cargado), detalle (dato nuevo), antes (dato anterior, ya no válido) y motivo (de deca_motivos o del propio registro; vacío = el PDF pone uno genérico). Sin datos económicos. Quién: funciones internas (orden_carga_json, datos_cmr_por_token) y el envoltorio modificaciones_deca. Argumentos: p_envio: envios.id.';
