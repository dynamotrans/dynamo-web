-- EL MÓVIL Y EL FIJO DEL SITIO, LOS DOS A LA VISTA (usuario, 2026-11-26: «cada uno servirá para
-- una cosa»): donde se enseña el teléfono del sitio (orden de carga, página y panel del
-- transportista) salen los dos, cada uno con su nombre. El móvil es el de WhatsApp.
-- Se añaden «contacto_movil» y «contacto_fijo» (y «movil» / «fijo» en la carga aceptada);
-- «contacto_telefono» / «telefono» siguen saliendo (el móvil o, si no hay, el fijo) para lo
-- que ya los usaba.
do $$ declare d text; n text; begin
  d := pg_get_functiondef('public.paradas_viaje_json_completa(uuid)'::regprocedure);
  n := replace(d, 'select nombre, coalesce(telefono, telefono_fijo) as telefono from contactos x',
                  'select nombre, coalesce(telefono, telefono_fijo) as telefono, telefono as movil, telefono_fijo as fijo from contactos x');
  if n = d then raise exception 'paradas_viaje_json_completa: no encuentro el contacto del sitio'; end if; d := n;
  n := replace(d, $a$'contacto_telefono', c.telefono)$a$, $a$'contacto_telefono', c.telefono, 'contacto_movil', c.movil, 'contacto_fijo', c.fijo)$a$);
  if n = d then raise exception 'paradas_viaje_json_completa: no encuentro el teléfono del contacto'; end if;
  execute n;

  d := pg_get_functiondef('public.carga_aceptada_publica_completa(uuid)'::regprocedure);
  n := replace(d, $a$jsonb_build_object('nombre', c.nombre, 'telefono', coalesce(c.telefono, c.telefono_fijo))$a$,
                  $a$jsonb_build_object('nombre', c.nombre, 'telefono', coalesce(c.telefono, c.telefono_fijo), 'movil', c.telefono, 'fijo', c.telefono_fijo)$a$);
  if n = d then raise exception 'carga_aceptada_publica_completa: no encuentro el teléfono del contacto'; end if;
  execute n;
end $$;
