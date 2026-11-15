-- EL DeCA SE EMITE AL PONER LAS PRIMERAS MATRÍCULAS (usuario, 2026-11-15: «se emite justo
-- al poner primeras matrículas, aunque luego se cambien»). Hasta ahora la emisión era el
-- alta del enlace (al confirmar el envío), y el panel enseñaba como «modificación» la
-- asignación del transportista, hecha días después. Un documento de control sin vehículo
-- no está emitido: la EMISIÓN pasa a ser el momento de la 1.ª asignación de matrículas.
--   · Todo lo anterior (transportista, ruta, fechas, mercancía) es el documento original.
--   · El panel empieza por esa 1.ª asignación de matrículas (misma fecha y hora que la
--     emisión) y sigue con lo que cambie después, con su dato anterior y su motivo.
--   · Sin matrículas todavía, no hay emisión ni modificaciones (el PDF lo dice).
--   · Las matrículas se separan con « / » (tractora / semirremolque), como en el resto.
do $$
declare v_def text; v_nueva text; r record;
begin
  v_def := pg_get_functiondef('public.fn_modificaciones_deca(uuid)'::regprocedure);
  for r in select * from (values
      ('    select max(c.creado_en) as en from cmr_enlaces c where c.envio_id = p_envio and not c.revocado',
       '    select min(i.cuando) as en from envio_hitos i where i.envio_id = p_envio and i.hito = ''matricula_asignada'''),
      ('     where case when emision.en is not null then h.cuando > emision.en' || chr(10)
       || '                else h.hito in (''ruta_cambiada'', ''fecha_carga_movida'', ''fecha_carga_cambiada'', ''mercancia_cambiada'', ''transportista_quitado'') or h.n > 1 end',
       '     where emision.en is not null' || chr(10)
       || '       and (h.cuando > emision.en or (h.hito = ''matricula_asignada'' and h.n = 1))'),
      ('concat_ws('' + '', coalesce(s.datos ->> ''camion''', 'concat_ws('' / '', coalesce(s.datos ->> ''camion'''),
      ('concat_ws('' + '', coalesce(s.previo ->> ''camion''', 'concat_ws('' / '', coalesce(s.previo ->> ''camion''')
    ) as x(viejo, nuevo)
  loop
    v_nueva := replace(v_def, r.viejo, r.nuevo);
    if v_nueva = v_def then raise exception 'No encuentro en fn_modificaciones_deca: %', left(r.viejo, 70); end if;
    v_def := v_nueva;
  end loop;
  execute v_def;
end $$;
comment on function public.fn_modificaciones_deca(uuid) is '[Envíos] El panel de modificaciones del documento de control (DeCA) de un envío, para el PDF (Resolución 5-jun-2026, apdo. quinto.1: datos nuevos, motivo y datos antiguos marcados como no válidos). El DeCA se EMITE al ponerse las primeras matrículas: la lista empieza por esa 1.ª asignación (su fecha y hora es la de emisión; primera = true) y sigue con lo que cambie después — ruta, fecha de carga, mercancía, transportista y matrículas —; lo anterior es el documento original y sin matrículas la lista va vacía. Por cambio: cuando (dd/mm/aaaa hh:mm España), en (fecha y hora ISO, para los metadatos del PDF), hito, primera, iniciado (había ya alguna firma principal del CMR / DeCA anterior al cambio; el seguimiento no cuenta), detalle (dato nuevo; matrículas «tractora / semirremolque»), antes (dato anterior, ya no válido) y motivo (de deca_motivos o del propio registro; vacío = el PDF pone uno genérico). Sin datos económicos. Quién: funciones internas (orden_carga_json, datos_cmr_por_token) y el envoltorio modificaciones_deca. Argumentos: p_envio: envios.id.';
