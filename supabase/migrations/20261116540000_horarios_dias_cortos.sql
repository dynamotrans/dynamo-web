-- =====================================================================================
-- HORARIOS DE LOS SITIOS CON LOS DÍAS EN CORTO (usuario, 2026-11-16)
-- =====================================================================================
-- «En horarios usa lun a jue · vie, no las palabras enteras.» El resumen del horario de
-- un sitio pasa de «Lunes a jueves 8:00–14:00 y 15:00–17:30 · viernes 8:00–14:00» a
-- «Lun a jue 8:00–14:00 y 15:00–17:30 · vie 8:00–14:00»: ocupa menos en el móvil, en la
-- lista de sitios, en Nuevo envío, en los avisos y en los PDF.
-- El mismo resumen lo escribe la web en lib/horarios.ts (resumenHorario).
do $$
declare v_oid oid := 'public.horario_texto(uuid, text)'::regprocedure; v_def text; v_nueva text;
begin
  v_def := pg_get_functiondef(v_oid);
  v_nueva := replace(v_def,
    'array[''lunes'', ''martes'', ''miércoles'', ''jueves'', ''viernes'', ''sábado'', ''domingo'']',
    'array[''lun'', ''mar'', ''mié'', ''jue'', ''vie'', ''sáb'', ''dom'']');
  if v_nueva = v_def then raise exception 'No encuentro los nombres de los días en horario_texto: revisar antes de aplicar.'; end if;
  execute v_nueva;
end $$;

-- Los resúmenes ya guardados, con el formato nuevo.
update public.sitios s
   set horarios = horario_texto(s.id, 'general'), horarios_verano = horario_texto(s.id, 'verano')
 where (s.horarios, s.horarios_verano) is distinct from (horario_texto(s.id, 'general'), horario_texto(s.id, 'verano'));

comment on column public.sitios.horarios is 'formato: texto | rango: no aplica | lista: no aplica | automático | Resumen legible del horario general, sacado de sitio_horarios, con los días en corto. Lo escribe la base de datos: lo que se escriba a mano se sustituye. Ej. OK: Lun a jue 8:00–14:00 y 15:30–17:30 · vie 8:00–14:00';
comment on column public.sitios.horarios_verano is 'formato: texto | rango: no aplica | lista: no aplica | automático | Resumen legible del horario de verano, sacado de sitio_horarios, con los días en corto. Lo escribe la base de datos. Ej. OK: Lun a vie 7:30–15:00';
