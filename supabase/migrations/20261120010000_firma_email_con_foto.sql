-- FIRMA DE LOS EMAILS CON FOTO (usuario, 2026-11-20: «pon mi avatar y mi contacto para que sea
-- más humano: foto a la izquierda y datos a la derecha»). La firma común de todos los emails
-- pasa de «Equipo de operaciones · Dynamo» a la de una persona: su foto redonda, su nombre,
-- su cargo y el equipo; debajo, «Urgencias e incidencias 24 h» con los botones de llamar y
-- escribir. Nombre, cargo y foto, en Parámetros → Empresa → Contacto (si la foto se deja en
-- blanco, la firma sale sin ella; si el nombre se deja en blanco, vuelve la firma del equipo).

insert into parametros (clave, valor, descripcion) values
  ('firma_email_nombre', '"Álvaro Blanco"', 'Firma de los emails: nombre de la persona que firma todos los emails de la plataforma. En blanco = firma «Equipo de operaciones · Dynamo».'),
  ('firma_email_cargo', '"Gestor de tráfico"', 'Firma de los emails: cargo de la persona que firma.'),
  ('firma_email_foto', '"https://www.dynamotrans.com/images/email/alvaro.png"', 'Firma de los emails: dirección pública (https) de la foto de quien firma, cuadrada (se ve redonda). En blanco = sin foto.')
on conflict (clave) do nothing;

-- La cabecera de la firma: foto a la izquierda y nombre, cargo y equipo a la derecha. En una
-- tabla (los gestores de correo no entienden bien otra cosa) que cabe igual en el móvil.
create or replace function firma_email_persona()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nom text := btrim(coalesce(parametro('firma_email_nombre') #>> '{}', ''));
  v_cargo text := btrim(coalesce(parametro('firma_email_cargo') #>> '{}', ''));
  v_foto text := btrim(coalesce(parametro('firma_email_foto') #>> '{}', ''));
begin
  if v_nom = '' then
    return '<p style="margin:0;font-weight:800;color:#0b0b45">Equipo de operaciones · Dynamo</p>';
  end if;
  if v_foto !~* '^https://[^"<> ]+$' then v_foto := ''; end if;
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>'
    || case when v_foto <> '' then format(
         '<td valign="middle" style="padding:0 14px 0 0;width:64px"><img src="%s" width="64" height="64" alt="%s" style="display:block;width:64px;height:64px;border-radius:50%%;border:0;object-fit:cover"></td>',
         escapar_html(v_foto), escapar_html(v_nom)) else '' end
    || '<td valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;line-height:1.35">'
    || format('<div style="font-size:16px;font-weight:800;color:#0b0b45">%s</div>', escapar_html(v_nom))
    || case when v_cargo <> '' then format('<div style="font-size:14px;font-weight:700;color:#3300cc">%s</div>', escapar_html(v_cargo)) else '' end
    || '<div style="font-size:13px;color:#6b7280">Equipo de operaciones · Dynamo</div>'
    || '</td></tr></table>';
end $$;
revoke all on function firma_email_persona() from public, anon, authenticated;
grant execute on function firma_email_persona() to service_role;
comment on function firma_email_persona() is '[Gestión interna] Cabecera de la firma común de los emails: foto redonda de quien firma a la izquierda y su nombre, cargo y equipo a la derecha (Parámetros firma_email_nombre, firma_email_cargo y firma_email_foto). Sin nombre, «Equipo de operaciones · Dynamo». Quién: email_con_diseno. Argumentos: ninguno.';

do $$
declare d text; n text; v_viejo text; v_nuevo text;
begin
  d := pg_get_functiondef('public.email_con_diseno(text,text)'::regprocedure);
  v_viejo := $v$    v_firma := format(
      '<p style="margin:0 0 2px;font-weight:800;color:#0b0b45">Equipo de operaciones · Dynamo</p>'
      || '<p style="margin:0 0 14px;color:#6b7280;font-size:14px">Urgencias e incidencias 24 h</p>'$v$;
  v_nuevo := $v$    v_firma := firma_email_persona() || format(
      '<p style="margin:16px 0 10px;color:#6b7280;font-size:14px">Urgencias e incidencias 24 h</p>'$v$;
  n := replace(d, v_viejo, v_nuevo);
  if n = d then raise exception 'email_con_diseno: no se encontró la firma a cambiar'; end if;
  execute n;
end $$;

