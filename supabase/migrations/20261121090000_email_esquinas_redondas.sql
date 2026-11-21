-- =====================================================================================
-- EMAILS: esquinas redondeadas en la cabecera azul (arriba) y en el pie gris (abajo)
-- =====================================================================================
-- Usuario, 2026-11-21: «la tarjeta de dynamo top azul, sus 2 esquinas superiores redondas,
-- más suaves; y las 2 inferiores del pie del mail también». Hasta ahora el redondeo lo daba
-- solo la tarjeta (border-radius + overflow:hidden), y muchos programas de correo (Gmail,
-- Apple Mail en el móvil) no recortan con overflow:hidden: la cabecera y el pie salían con
-- esquinas en pico. Ahora cada uno lleva su propio redondeo.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.email_con_diseno(text, text)'::regprocedure);
  n := replace(v, $a$padding:24px 32px">'$a$, $b$padding:24px 32px;border-radius:18px 18px 0 0">'$b$);
  n := replace(n, $a$'<tr><td class="pad" style="background:#faf9fd;padding:18px 32px;$a$,
                  $b$'<tr><td class="pad" style="background:#faf9fd;padding:18px 32px;border-radius:0 0 18px 18px;$b$);
  if n <> v then
    if position('border-radius:18px 18px 0 0' in n) = 0 or position('border-radius:0 0 18px 18px' in n) = 0 then
      raise exception 'email_con_diseno: no encuentro la cabecera azul o el pie para redondearlos';
    end if;
    execute n;
  elsif position('border-radius:18px 18px 0 0' in v) = 0 then
    raise exception 'email_con_diseno: no encuentro la cabecera azul del email';
  end if;
end $$;
