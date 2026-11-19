-- El último enlace de texto de los emails de la base de datos (usuario, 2026-11-19: botones
-- con el nombre de la acción): el aviso a Dynamo de «PENDIENTE: aceptar transportista».
-- (El «darme de baja» del resumen mensual a los sitios se queda como enlace pequeño, como
-- se hace en todos los emails con baja.)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.fn_avisos_reservas()'::regprocedure);
  n := replace(d,
    '''<p><a href="%s%s"><strong>Revisar y aceptar el alta</strong></a> (en la ficha del envío). ''',
    '''<p><a href="%s%s" style="display:inline-block;background:#3300cc;color:#ffffff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:12px">Revisar y aceptar el alta</a></p><p>Se revisa en la ficha del envío. ''');
  if n = d then raise exception 'fn_avisos_reservas: no se encontró el enlace a cambiar'; end if;
  execute n;
end $$;

-- Dos botones seguidos en el móvil: uno debajo del otro, con aire entre ellos.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.email_con_diseno(text,text)'::regprocedure);
  n := replace(d, 'a.btn{display:block!important;text-align:center!important;padding:15px 18px!important;font-size:16px!important}',
                  'a.btn{display:block!important;text-align:center!important;padding:15px 18px!important;font-size:16px!important;margin:0 0 10px!important}.firma-btns{width:100%!important}');
  if n = d then raise exception 'email_con_diseno: no se encontró la regla de los botones'; end if;
  execute n;
end $$;
