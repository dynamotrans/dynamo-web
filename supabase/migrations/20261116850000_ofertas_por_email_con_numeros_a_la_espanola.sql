-- =====================================================================================
-- LAS OFERTAS DE CARGA POR EMAIL, CON LOS NÚMEROS COMO EL RESTO (2026-11-17)
-- =====================================================================================
-- Al repasar todos los emails de la plataforma se vio que «Carga disponible» y «Sigue
-- disponible» escribían el precio y las medidas con punto («400.00 €», «13.30 m · 20.00 t»),
-- cuando todos los demás emails los escriben con coma («400,00 €»). Ahora el precio sale
-- con euros_texto() y las medidas con coma decimal.

do $$ declare v text; n text; begin
  -- La oferta.
  v := pg_get_functiondef('public.fn_difusion_paso(uuid)'::regprocedure);
  n := replace(v, $a$trim(to_char(d.precio, 'FM999G999G990D00'))$a$, $b$euros_texto(d.precio)$b$);
  n := replace(n, $a$'Carga disponible · %s → %s · %s €'$a$, $b$'Carga disponible · %s → %s · %s'$b$);
  n := replace(n, $a$Precio: <strong>%s € + IVA</strong>$a$, $b$Precio: <strong>%s + IVA</strong>$b$);
  n := replace(n, $a$coalesce(trim(to_char(e.metros_lineales, 'FM990D00')) || ' m', '—')$a$,
                  $b$coalesce(replace(to_char(e.metros_lineales, 'FM990.00'), '.', ',') || ' m', '—')$b$);
  n := replace(n, $a$coalesce(trim(to_char(e.toneladas, 'FM990D00')), '—')$a$,
                  $b$coalesce(replace(to_char(e.toneladas, 'FM990.00'), '.', ','), '—')$b$);
  if n = v or position('FM999G999G990D00' in n) > 0 or position('FM990D00' in n) > 0 or position('%s € + IVA' in n) > 0 then
    raise exception 'fn_difusion_paso: no encuentro el texto de la oferta';
  end if;
  execute n;
  -- El recordatorio.
  v := pg_get_functiondef('public.fn_difusion_recordatorios()'::regprocedure);
  n := replace(v, $a$trim(to_char(o.precio_ofertado, 'FM999G999G990D00'))$a$, $b$euros_texto(o.precio_ofertado)$b$);
  n := replace(n, $a$'Sigue disponible · %s → %s · %s €'$a$, $b$'Sigue disponible · %s → %s · %s'$b$);
  n := replace(n, $a$<strong>%s € + IVA</strong>$a$, $b$<strong>%s + IVA</strong>$b$);
  if n = v or position('FM999G999G990D00' in n) > 0 or position('%s € + IVA' in n) > 0 then
    raise exception 'fn_difusion_recordatorios: no encuentro el texto del recordatorio';
  end if;
  execute n;
end $$;
