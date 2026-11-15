-- «TRANSPORTE INICIADO» = HAY FIRMAS, NO LO QUE DIGA EL SEGUIMIENTO (usuario, 2026-11-15:
-- «el seguimiento va por libre, puede ser manual; lo que cuenta son las firmas, es lo
-- real»). El panel de modificaciones del DeCA marcaba 'iniciado' si el envío tenía un
-- registro de «cargando» o «cargado», que salen del seguimiento (por reloj o a mano). Ahora
-- 'iniciado' = existía ya alguna firma principal del CMR / DeCA ANTERIOR al cambio: la
-- firma del cargador o del transportista es el único hecho real de que la carga empezó.
-- Como para firmar hacen falta transportista y matrículas, una primera asignación queda
-- siempre como previa al inicio del transporte (las matrículas puestas en el mismo acto de
-- firmar la cabecera llevan la misma hora que la firma: no son posteriores).
do $$
declare v_def text; v_nueva text;
begin
  v_def := pg_get_functiondef('public.fn_modificaciones_deca(uuid)'::regprocedure);
  v_nueva := replace(v_def,
    '           -- ¿Estaba ya el transporte en marcha (camión cargando o cargado) cuando se hizo el cambio?' || chr(10)
    || '           ''iniciado'', exists (select 1 from envio_hitos i where i.envio_id = p_envio' || chr(10)
    || '                                and i.hito in (''cargando'', ''cargado'') and i.cuando <= s.cuando),' || chr(10),
    '           -- ¿Había empezado ya el transporte cuando se hizo el cambio? Lo dicen las FIRMAS (lo' || chr(10)
    || '           -- real), no el seguimiento: alguna firma principal del CMR / DeCA anterior al cambio.' || chr(10)
    || '           ''iniciado'', exists (select 1 from firmas_cmr f where f.envio_id = p_envio' || chr(10)
    || '                                and not f.extra and f.firmado_en < s.cuando),' || chr(10));
  if v_nueva = v_def then raise exception 'No encuentro la línea esperada en fn_modificaciones_deca: revisar antes de aplicar.'; end if;
  execute v_nueva;
  execute format('comment on function public.fn_modificaciones_deca(uuid) is %L',
    replace(obj_description('public.fn_modificaciones_deca(uuid)'::regprocedure),
            'iniciado (el cambio llegó con el transporte ya en marcha: había un registro de cargando o cargado)',
            'iniciado (el cambio llegó con el transporte ya empezado: había alguna firma principal del CMR / DeCA anterior; el seguimiento no cuenta)'));
end $$;
