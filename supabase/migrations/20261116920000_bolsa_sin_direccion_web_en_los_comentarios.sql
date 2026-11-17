-- La bolsa de cargas NO admite direcciones web en los comentarios (ni «dynamotrans.com/carga»).
-- El texto pasa a decir dónde aceptar sin escribir ninguna dirección: el transportista entra
-- en la web de quien publica la carga, pulsa el botón naranja «Aceptar carga» de la portada
-- y escribe el código de 6 cifras.
do $$ declare v text; n text; begin
  v := pg_get_viewdef('public.v_wtransnet'::regclass, true);
  n := replace(v, $a$'Acéptala en dynamotrans.com/carga con el código '::text$a$,
                  $b$'Acepta esta carga en nuestra web: pulsa Aceptar carga y escribe el código '::text$b$);
  if n = v then raise exception 'v_wtransnet: no encuentro el texto de los comentarios públicos'; end if;
  execute 'create or replace view public.v_wtransnet with (security_invoker = true) as ' || n;
end $$;
