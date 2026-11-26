-- TIPOS DE INCIDENCIA: SOLO CINCO (usuario, 2026-11-26: «dejamos solo esos» y, después, «mete
-- este también: Albarán incorrecto / Solicitud de albarán»).
--   1. Incidencia con algún conductor
--   2. Rotura de mercancía
--   3. Incidencia en el transporte
--   4. Albarán incorrecto / Solicitud de albarán
--   5. Otros
-- Los demás (cambio de fecha u hora de carga, consulta de facturación, consulta de pago) dejan
-- de ofrecerse. NO se borran: las incidencias que ya los tienen los
-- conservan y siguen enseñando su nombre.
-- «Rotura de mercancía» es el tipo de clave «siniestro» con otro nombre: sigue saliendo el
-- primero y como urgente en el panel de Dynamo, y lo siguen abriendo las reservas del CMR.
update public.tipos_incidencia set nombre = 'Incidencia con algún conductor', orden = 1, activo = true where clave = 'transportista_conductor';
update public.tipos_incidencia set nombre = 'Rotura de mercancía', orden = 2, activo = true where clave = 'siniestro';
update public.tipos_incidencia set orden = 3, activo = true where clave = 'incidencia_transporte';
update public.tipos_incidencia set nombre = 'Albarán incorrecto / Solicitud de albarán', orden = 4, activo = true where clave = 'albaran';
update public.tipos_incidencia set orden = 5, activo = true where clave = 'otros';
update public.tipos_incidencia set activo = false, orden = 50 + orden
 where clave not in ('transportista_conductor', 'siniestro', 'incidencia_transporte', 'albaran', 'otros') and orden < 50;

-- Los datos de prueba: las incidencias nuevas, solo con los cinco tipos que quedan.
do $$ declare d text; n text; f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.prosrc like '%''pago_consulta'',''transportista_conductor'',''cancelacion_transporte'',''siniestro'',''otros''%' loop
    d := pg_get_functiondef(f);
    n := replace(d, $a$array['incidencia_transporte','incidencia_transporte','incidencia_transporte','cambio_fecha_hora_carga','albaran','albaran','facturacion_consulta',
                          'pago_consulta','transportista_conductor','cancelacion_transporte','siniestro','otros']$a$,
                    $a$array['incidencia_transporte','incidencia_transporte','incidencia_transporte','incidencia_transporte','albaran','albaran','transportista_conductor',
                          'transportista_conductor','siniestro','siniestro','otros','otros']$a$);
    n := replace(n, $a$array['incidencia_transporte','albaran','siniestro','facturacion_consulta','transportista_conductor','otros']$a$,
                    $a$array['incidencia_transporte','albaran','siniestro','incidencia_transporte','transportista_conductor','otros']$a$);
    if n = d then raise exception 'datos de prueba: no encuentro la lista de tipos de incidencia en %', f; end if;
    execute n;
  end loop;
end $$;
