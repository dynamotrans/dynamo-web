-- =====================================================================================
-- EMAIL «ENVÍO CREADO», MÁS CORTO Y CON EL PAGO EN ROJO (usuario, 2026-11-17)
-- =====================================================================================
-- Fuera la frase «Ahora buscamos el camión: te avisaremos cuando tenga transportista y
-- matrículas» (el detalle de abajo ya dice «Transporte: Asignando transporte.»). Y el aviso
-- de «Pendiente de pago», entero en rojo y negrita, para que no pase desapercibido.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.fn_email_envio_creado()'::regprocedure);
  n := replace(v, 'Tu envío ya está <strong>creado</strong>. Ahora buscamos el camión: te avisaremos cuando tenga transportista y matrículas.</p>',
                  'Tu envío ya está <strong>creado</strong>.</p>');
  if n = v then raise exception 'fn_email_envio_creado: no encuentro la frase del camión'; end if;
  v := n;
  n := replace(v, '<p><strong>Pendiente de pago:</strong> el envío queda en firme cuando recibamos el pago. Puedes pagarlo desde su ficha.</p>',
                  '<p style="color:#b42318"><strong>Pendiente de pago: el envío queda en firme cuando recibamos el pago. Puedes pagarlo desde su ficha.</strong></p>');
  if n = v then raise exception 'fn_email_envio_creado: no encuentro el aviso de pendiente de pago'; end if;
  execute n;
end $$;
