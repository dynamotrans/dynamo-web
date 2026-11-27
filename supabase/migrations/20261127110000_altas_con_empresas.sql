-- ALTAS PENDIENTES = USUARIOS + EMPRESAS (usuario, 2026-11-27): «en el panel hay un botón de altas
-- pendientes, pero no se muestra lo de pendiente de verificar… igual deberías ponerlo en pequeño,
-- altas de usuarios y altas de clientes». El número del menú y de la campana de Dynamo cuenta ya
-- las dos cosas que esperan al equipo: usuarios por dar de alta y empresas que han pedido
-- verificarse (transferencia o documento) y siguen sin verificar.
do $$ declare v text; n text;
  viejo constant text := $q$'altas',              (select count(*) from usuarios where estado = 'pendiente_verificacion' and cliente_id is null and transportista_id is null))$q$;
  nuevo constant text := $q$'altas',              (select count(*) from usuarios where estado = 'pendiente_verificacion' and cliente_id is null and transportista_id is null)
                          + (select count(*) from clientes where estado_verificacion = 'no_verificada' and verificacion_solicitada is not null))$q$;
begin
  v := pg_get_functiondef('public.contadores_panel(uuid, uuid)'::regprocedure);
  n := replace(v, viejo, nuevo);
  if n = v then raise exception 'contadores_panel: no encuentro la línea de altas'; end if;
  execute n;
end $$;
