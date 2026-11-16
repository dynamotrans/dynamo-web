-- =====================================================================================
-- OFERTA ESCALONADA: DESDE 3 DÍAS ANTES, SIN CORTE Y CON RITMOS NUEVOS (usuario, 2026-11-16)
-- =====================================================================================
-- «El mailing de 5 a 3 días, quítalo. Dejamos 3 días antes: si carga el jueves, enviamos
-- desde el lunes.» «¿Qué es corte y aviso urgente? No urgente: pon cuántos por minuto.»
--
--   1. Los emails a los transportistas propios empiezan 3 días antes de la carga (era 5).
--      De 12 a 3 días, solo bolsa.
--   2. Ya no se corta 3 horas antes: los emails siguen saliendo hasta la hora de carga.
--      Llegada esa hora sin transportista, la oferta se cierra y Dynamo recibe su aviso.
--   3. Ritmos (parámetro difusion_cadencia):
--        · más de 24 h para la carga ........ 1 cada 3 minutos (como estaba)
--        · últimas 24 h ..................... 8 cada 3 minutos
--        · últimas 6 h ...................... 5 por minuto
--        · últimas 3 h ...................... 10 por minuto
--   4. El tope de transportistas por envío pasa de 60 a 1.000: con estos ritmos, 60 se
--      agotaban en minutos y dejaban sin avisar a transportistas que cumplían el filtro.
--      Sigue siendo un parámetro (difusion_max_contactados).
--   5. La cola de emails manda hasta 100 por pasada (eran 20): con varios envíos en sus
--      últimas horas, 20 por minuto se quedaban cortos.
--   6. Las direcciones de prueba (dominio .invalid, que no existe) NO se mandan a
--      Postmark: quedan como omitidas. Los datos de prueba están llenos de ellas y, ya
--      con el envío real conectado, cada una sería un rebote que gasta emails y daña la
--      reputación del dominio.

-- ---- 1 a 4. Parámetros -----------------------------------------------------------------
update parametros set valor = '3'::jsonb where clave = 'difusion_dias_antes';
update parametros set valor = '0'::jsonb,
  descripcion = 'Oferta escalonada: horas antes de la hora de carga en que se corta el envío de emails (0 = siguen saliendo hasta la hora de carga). Al llegar al corte sin aceptación, la oferta se cierra y Dynamo recibe aviso.'
 where clave = 'difusion_horas_corte';
update parametros
   set valor = '[{"hasta_horas":3,"minutos":1,"lote":10},{"hasta_horas":6,"minutos":1,"lote":5},{"hasta_horas":24,"minutos":3,"lote":8},{"hasta_horas":null,"minutos":3}]'::jsonb
 where clave = 'difusion_cadencia';
update parametros set valor = '1000'::jsonb where clave = 'difusion_max_contactados';

-- ---- 5 y 6. La cola: 100 por pasada y nada a direcciones .invalid ----------------------
do $$
declare v_oid oid := 'public.enviar_emails_pendientes()'::regprocedure; v_def text; v_nueva text;
begin
  v_def := pg_get_functiondef(v_oid);
  v_nueva := replace(v_def, 'order by x.creado_en limit 20 for update skip locked', 'order by x.creado_en limit 100 for update skip locked');
  if v_nueva = v_def then raise exception 'No encuentro el tope por pasada en enviar_emails_pendientes: revisar antes de aplicar.'; end if;
  v_def := v_nueva;
  v_nueva := replace(v_def,
    'if not exists (select 1 from pg_extension where extname = ''pg_net'') then return 0; end if;',
    '-- Direcciones de prueba (.invalid no existe): no se mandan, para no generar rebotes.' || chr(10) ||
    '  update emails_enviados set estado = ''omitido'', error = ''Dirección de prueba (.invalid): no se envía.''' || chr(10) ||
    '   where estado = ''pendiente'' and destinatario ~* ''\.invalid(\s|>|,|;|$)'';' || chr(10) ||
    '  if not exists (select 1 from pg_extension where extname = ''pg_net'') then return 0; end if;');
  if v_nueva = v_def then raise exception 'No encuentro el comienzo de enviar_emails_pendientes: revisar antes de aplicar.'; end if;
  execute v_nueva;
  execute format('comment on function public.enviar_emails_pendientes() is %L',
    obj_description(v_oid, 'pg_proc') || ' Manda hasta 100 por pasada. Las direcciones de prueba (dominio .invalid) no se envían: quedan como omitidas.');
end $$;

-- Lo que ya hubiera en cola para direcciones de prueba, de una vez.
update emails_enviados set estado = 'omitido', error = 'Dirección de prueba (.invalid): no se envía.'
 where estado = 'pendiente' and destinatario ~* '\.invalid(\s|>|,|;|$)';
