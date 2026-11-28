-- EMAILS DE CRÉDITO: BOTÓN «ENTRAR EN LA PLATAFORMA» ANTES DE LA FIRMA (usuario, 2026-11-28): «en
-- todos estos mails a usuarios de clientes, ponemos botón antes del avatar de Álvaro de Entrar en
-- la plataforma, pero en la plataforma o login». Los emails de crédito (línea de crédito
-- disponible, ampliada, reducida…) llevan, justo antes de la firma, un botón a la pantalla de
-- entrar de la plataforma (url_plataforma + /panel/entrar), no a la web pública.

do $$
declare v_def text := pg_get_functiondef('public.fn_email_credito(uuid, text, text, text, text)'::regprocedure); v_nuevo text;
begin
  v_nuevo := replace(v_def,
    $a$format('<p>Hola,</p>%s<p>Si tienes cualquier duda, responde a este email o llámanos al %s.</p><p>— %s · %s · %s</p>',
           p_cuerpo, escapar_html(tel_dynamo()),$a$,
    $b$format('<p>Hola,</p>%s<p>Si tienes cualquier duda, responde a este email o llámanos al %s.</p>'
           || '<p><a href="%s/panel/entrar" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">Entrar en la plataforma</a></p>'
           || '<p>— %s · %s · %s</p>',
           p_cuerpo, escapar_html(tel_dynamo()),
           escapar_html(rtrim(coalesce(nullif(parametro('url_plataforma') #>> '{}', ''), 'https://www.dynamotrans.com'), '/')),$b$);
  if v_nuevo = v_def then raise exception 'fn_email_credito: no se ha encontrado el cuerpo del email para añadir el botón'; end if;
  execute v_nuevo;
end $$;
comment on function public.fn_email_credito(uuid, text, text, text, text) is '[Gestión interna] Encola un email de crédito comercial a los usuarios de un cliente (si los emails de crédito están activos), con un botón «Entrar en la plataforma» (a la pantalla de entrar) justo antes de la firma. Una vez por clave. Quién: nadie la llama desde fuera; la usan las funciones de crédito y verificación. Argumentos: p_cliente: el cliente · p_clave: clave única · p_tipo: tipo de email · p_asunto: asunto · p_cuerpo: el párrafo propio, en HTML.';
