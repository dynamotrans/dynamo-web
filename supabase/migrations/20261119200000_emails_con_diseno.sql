-- EMAILS CON DISEÑO (usuario, 2026-11-19: «formato chulo… botones donde sean clicables con el
-- nombre de cada acción… encabezado de color, firma, pie… legible en móvil y ordenador»).
-- UN SOLO envoltorio para TODOS los emails de la plataforma, el de la cola de la base de datos
-- y el del servidor web (que lo pide aquí con la clave de servicio): cabecera morada con el
-- logo, el cuerpo en una tarjeta blanca de 600 px que en el móvil ocupa la pantalla, la firma
-- con botones de llamar y escribir, y el pie con los datos de la empresa (de Parámetros).
-- El cuerpo de cada email no cambia: se guarda tal cual en emails_enviados y el envoltorio se
-- pone al mandarlo. Al envolver:
--   · la firma antigua de cada email («— Dynamo · email · teléfono») se quita: ya va en la firma;
--   · los botones (enlaces con display:inline-block) ocupan todo el ancho en el móvil.
-- Y los enlaces de texto que quedaban en los emails de la base de datos pasan a botones con el
-- nombre de lo que hacen («Ver el envío», «Anotar las matrículas»…).

-- ---- 1. El envoltorio ----------------------------------------------------------------------
create or replace function email_con_diseno(p_html text, p_remitente text default null)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raz text := coalesce(parametro('dynamo_razon_social') #>> '{}', 'Dynamo Operador Logístico, S.L.');
  v_cif text := coalesce(parametro('dynamo_cif') #>> '{}', '');
  v_dir text := concat_ws(', ', nullif(parametro('dynamo_direccion') #>> '{}', ''),
                  nullif(concat_ws(' ', parametro('dynamo_codigo_postal') #>> '{}', parametro('dynamo_poblacion') #>> '{}'), ''));
  v_tel text := coalesce(parametro('dynamo_telefono') #>> '{}', '');
  v_mail text := coalesce(parametro('dynamo_email') #>> '{}', '');
  v_web text := coalesce(nullif(parametro('dynamo_web') #>> '{}', ''), 'www.dynamotrans.com');
  v_fuente text := '-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif';
  v_cuerpo text; v_previa text; v_cab text; v_firma text; v_pie text;
begin
  if p_html is null then return null; end if;
  if p_html ~* '^\s*<!doctype' then return p_html; end if;   -- ya viene envuelto
  -- Sin la firma antigua de cada plantilla (va en la firma común) y con los botones marcados
  -- para que en el móvil ocupen el ancho.
  v_cuerpo := regexp_replace(p_html, '<p>— [^<]*</p>', '', 'g');
  v_cuerpo := regexp_replace(v_cuerpo, '<a (href="[^"]*") style="display:inline-block', '<a class="btn" \1 style="display:inline-block', 'g');
  -- El texto que se ve en la bandeja de entrada junto al asunto.
  v_previa := left(btrim(regexp_replace(regexp_replace(v_cuerpo, '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')), 140);
  v_previa := replace(replace(v_previa, '<', ''), '>', '');

  if p_remitente is null then
    v_cab := format('<img src="https://%s/images/4.png" alt="Dynamo" width="128" style="display:block;width:128px;height:auto;border:0;color:#ffffff;font:800 24px Arial,sans-serif">',
                    regexp_replace(v_web, '^https?://', ''));
    v_firma := format(
      '<p style="margin:0 0 2px;font-weight:800;color:#0b0b45">Equipo de operaciones · Dynamo</p>'
      || '<p style="margin:0 0 14px;color:#6b7280;font-size:14px">Urgencias e incidencias 24 h</p>'
      || '<table role="presentation" cellpadding="0" cellspacing="0" class="firma-btns"><tr>'
      || '<td style="padding:0 8px 8px 0"><a class="btn2" href="tel:%s" style="display:inline-block;border:1.5px solid #3300cc;color:#3300cc;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:12px;font-size:14px">Llamar %s</a></td>'
      || '<td style="padding:0 0 8px 0"><a class="btn2" href="mailto:%s" style="display:inline-block;border:1.5px solid #3300cc;color:#3300cc;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:12px;font-size:14px">Escribir a Dynamo</a></td>'
      || '</tr></table>',
      regexp_replace(v_tel, '[^0-9+]', '', 'g'), escapar_html(v_tel), escapar_html(v_mail));
    v_pie := format('<strong style="color:#4b4b63">%s</strong>%s%s<br>%s · %s',
      escapar_html(v_raz), case when v_cif <> '' then ' · CIF ' || escapar_html(v_cif) else '' end,
      case when v_dir <> '' then '<br>' || escapar_html(v_dir) else '' end, escapar_html(v_web), escapar_html(v_mail));
  else
    -- El email que un cliente manda a SU transportista: su empresa en la cabecera y la firma.
    v_cab := format('<span style="color:#ffffff;font:800 20px Arial,sans-serif">%s</span>', escapar_html(p_remitente));
    v_firma := format('<p style="margin:0;font-weight:800;color:#0b0b45">%s</p>', escapar_html(p_remitente));
    v_pie := 'Enviado con la plataforma de Dynamo';
  end if;

  return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
    || '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">'
    || '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>Dynamo</title>'
    || '<style>body{margin:0;padding:0;background:#f3f2f8;-webkit-text-size-adjust:100%}'
    || '.cuerpo p{margin:0 0 14px}.cuerpo ul{margin:0 0 14px;padding-left:20px}.cuerpo a{color:#3300cc}'
    || '@media (max-width:620px){.marco{width:100%!important;border-radius:0!important}.fondo{padding:0!important}'
    || '.pad{padding-left:20px!important;padding-right:20px!important}.cuerpo{font-size:16px!important;line-height:1.55!important}'
    || 'a.btn{display:block!important;text-align:center!important;padding:15px 18px!important;font-size:16px!important}'
    || '.firma-btns td{display:block!important;padding:0 0 8px 0!important}a.btn2{display:block!important;text-align:center!important}}'
    || '</style></head>'
    || '<body style="margin:0;padding:0;background:#f3f2f8">'
    || '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f2f8">' || escapar_html(v_previa) || '</div>'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f2f8"><tr>'
    || '<td align="center" class="fondo" style="padding:28px 12px">'
    || '<table role="presentation" class="marco" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 28px rgba(20,10,60,.08)">'
    -- Cabecera de color
    || '<tr><td class="pad" style="background:#3300cc;background-image:linear-gradient(135deg,#2a00b8 0%,#3300cc 55%,#5533dd 100%);padding:24px 32px">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>' || v_cab || '</td>'
    || case when p_remitente is null then '<td align="right" style="color:#cfc6ff;font:700 11px Arial,sans-serif;letter-spacing:.14em">ALWAYS MOVING</td>' else '' end
    || '</tr></table></td></tr>'
    -- Cuerpo
    || '<tr><td class="pad cuerpo" style="padding:32px 32px 10px;font-family:' || v_fuente || ';font-size:15px;line-height:1.6;color:#1f2433">'
    || v_cuerpo || '</td></tr>'
    -- Firma
    || '<tr><td class="pad firma" style="padding:6px 32px 28px;font-family:' || v_fuente || ';font-size:15px;line-height:1.5">'
    || '<div style="border-top:1px solid #eceaf5;padding-top:20px">' || v_firma || '</div></td></tr>'
    -- Pie
    || '<tr><td class="pad" style="background:#faf9fd;padding:18px 32px;font-family:' || v_fuente || ';font-size:12px;line-height:1.6;color:#8a8aa3;text-align:center">'
    || v_pie || '</td></tr>'
    || '</table></td></tr></table></body></html>';
end $$;
revoke all on function email_con_diseno(text, text) from public, anon, authenticated;
grant execute on function email_con_diseno(text, text) to service_role;
comment on function email_con_diseno(text, text) is '[Gestión interna] Envuelve el cuerpo de un email con el diseño común de la plataforma: cabecera morada con el logo, cuerpo en tarjeta de 600 px (todo el ancho en el móvil), botones a todo el ancho en el móvil, firma con botones de llamar y escribir, y pie con los datos de la empresa de Parámetros. Quita la firma antigua «— …» de las plantillas. Si el cuerpo ya es un documento completo, lo devuelve tal cual. Quién: la cola de emails (enviar_emails_pendientes) y el servidor web con la clave de servicio. Argumentos: p_html: cuerpo del email · p_remitente: empresa que firma (los emails de un cliente a su propio transportista); null = Dynamo.';

-- ---- 2. La cola de la base de datos manda los emails ya envueltos -------------------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.enviar_emails_pendientes()'::regprocedure);
  n := replace(d, '''HtmlBody'', r.cuerpo_html', '''HtmlBody'', email_con_diseno(r.cuerpo_html)');
  if n = d then raise exception 'enviar_emails_pendientes: no se encontró el cuerpo del email'; end if;
  execute n;
end $$;

-- ---- 3. Enlaces de texto → botones con el nombre de la acción ---------------------------
-- (Se mantiene el orden de los %s de cada format(): el botón va donde iba el enlace o justo
-- después de su frase, sin texto con %s en medio.)
do $$
declare
  b text := 'style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px"';
  f record; d text; n text;
begin
  for f in select * from (values
    ('encolar_avisos_operativos(timestamp with time zone)',
     '<p><a href="%s/cmr/%s">Anótalas aquí</a> (se piden al firmar la cabecera del CMR), o respóndenos a este email. Urgencias 24 h: %s.</p>',
     '<p><a href="%s/cmr/%s" ' || b || '>Anotar las matrículas</a></p><p>Se piden al firmar la cabecera del CMR; también puedes respondernos a este email. Urgencias 24 h: %s.</p>'),
    ('encolar_avisos_operativos(timestamp with time zone)',
     'Lo sigues en vivo en <a href="%s/panel/envios">tu panel</a>.</p>',
     'Lo sigues en vivo en tu panel.</p><p><a href="%s/panel/envios" ' || b || '>Ver mis envíos</a></p>'),
    ('fn_avisos_reservas()',
     '<p><a href="%s%s">Ver la ficha del envío</a>. La orden de carga le llega sola por email.</p>',
     '<p>La orden de carga le llega sola por email.</p><p><a href="%s%s" ' || b || '>Ver el envío</a></p>'),
    ('credito_revisar_pagos(uuid)',
     'se lo devuelves desde <a href="%s/panel/clientes?ver=%s">su ficha</a> cuando pague o lo acordéis.</p>',
     'se lo devuelves desde su ficha cuando pague o lo acordéis.</p><p><a href="%s/panel/clientes?ver=%s" ' || b || '>Ver la ficha del cliente</a></p>'),
    ('fn_email_envio_cliente(uuid,text,text,text,text)',
     '<p>Lo sigues en vivo en <a href="%s/panel/envios?ver=%s">la ficha del envío</a>.</p>',
     '<p>Lo sigues en vivo en la ficha del envío.</p><p><a href="%s/panel/envios?ver=%s" ' || b || '>Ver el envío</a></p>')
  ) as t(fn, viejo, nuevo)
  loop
    d := pg_get_functiondef(('public.' || f.fn)::regprocedure);
    n := replace(d, f.viejo, f.nuevo);
    if n = d then raise exception '%: no se encontró el enlace a cambiar', f.fn; end if;
    execute n;
  end loop;
end $$;
