-- =====================================================================================
-- NOMBRE DEL REMITENTE DE LOS EMAILS: «Dynamotrans.com» (usuario, 2026-11-16)
-- =====================================================================================
-- Los avisos que salen de la cola (enviar_emails_pendientes) llevaban como nombre del
-- remitente «Dynamo». El usuario quiere que se lea «Dynamotrans.com». La dirección no
-- cambia: sigue saliendo del parámetro dynamo_email.
-- (Los emails de acceso —confirmar registro, contraseña— los manda Supabase Auth: su
-- nombre se pone en Authentication → Emails → SMTP Settings → Sender name.)
do $$
declare r record; v_def text; v_nueva text; n int := 0;
begin
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%format(''Dynamo <%%s>''%'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_nueva := replace(v_def, 'format(''Dynamo <%s>''', 'format(''Dynamotrans.com <%s>''');
    if v_nueva <> v_def then execute v_nueva; n := n + 1; end if;
  end loop;
  if n = 0 then raise exception 'No se ha encontrado ninguna función con el remitente «Dynamo <…>».'; end if;
end $$;
