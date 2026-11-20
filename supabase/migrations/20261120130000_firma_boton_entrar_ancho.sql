-- =====================================================================================
-- FIRMA DE LOS EMAILS: «Entrar en dynamotrans.com» debajo, a todo el ancho y relleno
-- =====================================================================================
-- Usuario, 2026-11-20: «quita el de entrar en Dynamo y ponlo debajo en botón ancho total,
-- azul, letra en negativo blanco». En la fila quedan «Llamar» y «Escribir a Dynamo».
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.email_con_diseno(text, text)'::regprocedure);
  n := replace(v,
    $a$'<td style="padding:0 0 8px 0"><a class="btn2" href="https://%s" style="display:inline-block;border:1.5px solid #3300cc;color:#3300cc;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:12px;font-size:14px">Entrar en %s</a></td>'$a$,
    $b$''$b$);
  if n <> v then
    -- El botón ancho va después de la fila (mismo orden de los %s: web y nombre, al final).
    if (length(n) - length(replace(n, $c$'</tr></table>',$c$, ''))) / length($c$'</tr></table>',$c$) <> 1 then
      raise exception 'email_con_diseno: no encuentro el cierre de la fila de botones de la firma';
    end if;
    n := replace(n, $c$'</tr></table>',$c$,
      $d$'</tr></table>'
      || '<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="width:100%%;border-collapse:collapse"><tr><td style="padding:2px 0 0 0"><a class="btn3" href="https://%s" style="display:block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 18px;border-radius:12px;font-size:15px;text-align:center">Entrar en %s</a></td></tr></table>',$d$);
    execute n;
  elsif position('class="btn3"' in v) = 0 then
    raise exception 'email_con_diseno: no encuentro el botón «Entrar en» de la firma';
  end if;
end $$;
