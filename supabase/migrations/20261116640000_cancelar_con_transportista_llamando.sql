-- =====================================================================================
-- CON TRANSPORTISTA ASIGNADO, EL CLIENTE NO CANCELA DESDE LA PLATAFORMA: LLAMA
-- (usuario, 2026-11-16)
-- =====================================================================================
-- Tabla del usuario:
--   · Sin transportista (con tiempo o pasada la hora límite): cancela él, gratis.
--   · Transportista asignándose: no puede (20261116630000).
--   · CON TRANSPORTISTA, antes de la hora límite: NO puede; tiene que llamar. Se le avisa
--     de que ahora cancelar no tiene coste.
--   · CON TRANSPORTISTA, pasada la hora límite, o con el camión ya hacia la carga: NO
--     puede; tiene que llamar. Posible coste del servicio completo.
--
-- Hasta ahora, con transportista el cliente sí cancelaba desde su ficha (con la
-- penalización automática si era tarde). Ahora esa cancelación la hace Dynamo en su
-- nombre tras la llamada (cancelar_envio(…, p_en_nombre_cliente => true)), que genera la
-- misma penalización y cuenta igual para la suspensión automática. La pantalla enseña el
-- aviso con el coste que toca; aquí queda la barrera de verdad.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.cancelar_mi_envio(uuid, text)'::regprocedure);
  n := replace(v, E'  if v_estado not in (''borrador'', ''programado'') then\n',
                  E'  if exists (select 1 from envios where id = p_envio and transportista_id is not null and not coalesce(es_manual, false))\n     and v_estado in (''borrador'', ''programado'') then\n    raise exception ''Tu envío ya tiene transportista asignado: para cancelarlo, llámanos al %.'', tel_dynamo();\n  end if;\n  if v_estado not in (''borrador'', ''programado'') then\n');
  if n = v then raise exception 'cancelar_mi_envio: no encuentro dónde poner la barrera del transportista'; end if;
  execute n;
end $$;
comment on function public.cancelar_mi_envio(uuid, text) is '[Envíos] El cliente cancela un envío suyo (borrador o programado) desde su ficha. Solo SIN transportista: con transportista asignado, con uno asignándose en ese momento o con el camión ya hacia la carga, no se puede desde la plataforma y hay que llamar (lo cancela Dynamo en su nombre). Devuelve {resultado: cancelado, penalizacion, importe}. Quién: cliente dueño del envío. Argumentos: p_envio: envios.id · p_motivo: por qué cancela (opcional, máx. 500).';
