-- RESUMEN MENSUAL A LOS SITIOS SIN EL NOMBRE DEL CLIENTE (usuario, 2026-11-20): el resumen
-- solo dice qué días se recogió o entregó en sus instalaciones; nunca el otro extremo de la
-- ruta NI de parte de qué cliente. Por eso la discreción comercial del cliente ya no lo
-- impide: esa casilla es para los envíos (el conductor no revela origen ni destino), y aquí
-- no se dice nada del cliente.
do $$
declare d text; n text; c record;
begin
  d := pg_get_functiondef('public.encolar_resumen_sitios(date,boolean)'::regprocedure);
  n := d;
  for c in select * from (values
    (1, E'           and not coalesce(e.discrecion_comercial, false) and not coalesce(c.discrecion_comercial, false)\n', ''),
    (2, $a$select count(*), count(distinct x.cliente),
           string_agg(format('<li>%s · %s · de parte de <strong>%s</strong></li>', to_char(x.dia, 'DD/MM/YYYY'),
                             case when x.tipo = 'carga' then 'Recogida' else 'Entrega' end, escapar_html(x.cliente)),
                      '' order by x.dia, x.cliente)$a$,
        $a$select count(*), 1,
           string_agg(format('<li>%s · %s</li>', to_char(x.dia, 'DD/MM/YYYY'),
                             case when x.tipo = 'carga' then 'Recogida' else 'Entrega' end),
                      '' order by x.dia, x.tipo)$a$),
    (3, $a$p.tipo, c.nombre_visible as cliente$a$, $a$p.tipo$a$),
    (4, $a$         order by 1, 3$a$, $a$         order by 1, 2$a$),
    (5, $a$hemos pasado por vuestras instalaciones%s de parte de %s:</p>'$a$, $a$hemos pasado por vuestras instalaciones%s estos días:</p>'$a$),
    (6, $a$          case when v_clientes = 1 then 'vuestro cliente' else 'vuestros clientes' end,
$a$, ''),
    (7, $a$entregados. Sin discreción comercial y sin los almacenes del propio cliente$a$,
        $a$entregados (también con discreción comercial: el resumen no dice el cliente). Sin los almacenes del propio cliente$a$)
  ) as t(k, viejo, nuevo) order by k
  loop
    if position(c.viejo in n) = 0 then raise exception 'encolar_resumen_sitios: no se encontró el trozo %', c.k; end if;
    n := replace(n, c.viejo, c.nuevo);
  end loop;
  execute n;
end $$;

update parametros set descripcion = 'Resumen mensual a los sitios: true = cada mes se manda a los sitios de recogida y entrega (los que tienen email de avisos) un resumen de los días que Dynamo ha recogido o entregado en sus instalaciones, sin decir de parte de qué cliente ni el otro extremo de la ruta, con una invitación a trabajar con Dynamo. false = no se manda. Es un email comercial: enciéndelo solo con el visto bueno de tu asesor.'
 where clave = 'resumen_sitios_activo';
