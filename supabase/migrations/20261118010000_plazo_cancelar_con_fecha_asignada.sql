-- EL PLAZO PARA CANCELAR GRATIS CUENTA DESDE LA FECHA DE CARGA ASIGNADA (usuario, 2026-11-18).
--
-- La regla: se cancela gratis hasta las 9:00 del día hábil anterior A LA CARGA. Pero «la
-- carga» se estaba tomando siempre como el PRIMER día de la ventana pedida
-- (fecha_carga_desde), también cuando el envío ya tiene su fecha de carga asignada
-- (fecha_carga_prevista). Caso que vio el usuario: ventana del miércoles 18 al viernes 20,
-- carga asignada el viernes 20 → la plataforma decía que el plazo gratis había terminado el
-- martes 17 a las 9:00, cuando termina el jueves 19 a las 9:00.
--
-- Ahora manda la fecha ASIGNADA; sin asignar, sigue valiendo el primer día de la ventana
-- (es cuando podría cargarse). Se cambia en todos los sitios que miran ese plazo:
--   · la penalización automática al cancelar tarde con camión (fn_envios_penalizacion_cancelacion);
--   · el «lo pidió tarde» de un cambio de fechas o de una cancelación del cliente (pedir_cambio_envio);
--   · las cuentas de cancelaciones tardías de la autosuspensión y de «Uso de Dynamo»
--     (autosuspension_motivos, mi_autosuspension, clientes_pagina, uso_clientes).
-- El plazo de PAGO de un envío pendiente de pago (pago_limite) no cambia: esos envíos aún
-- no tienen fecha asignada.
--
-- Se reescribe solo ESA expresión sobre la definición viva de cada función
-- (pg_get_functiondef), para no arrastrar a mano el resto. Si alguna no la tuviera como se
-- espera, la migración falla en vez de dejarla a medias. Es repetible: la que ya está
-- cambiada se salta.
do $$
declare f record; v_def text; v_nueva text; n int := 0;
  c_nombres constant text[] := array['fn_envios_penalizacion_cancelacion', 'pedir_cambio_envio', 'autosuspension_motivos',
                                     'mi_autosuspension', 'clientes_pagina', 'uso_clientes'];
begin
  for f in select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname = any (c_nombres) loop
    n := n + 1;
    v_def := pg_get_functiondef(f.oid);
    if v_def like '%fecha_carga_prevista, %fecha_carga_desde%' then continue; end if;   -- ya cambiada
    v_nueva := v_def;
    v_nueva := replace(v_nueva, 'coalesce(new.fecha_carga_desde, new.fecha_carga_real)',
                                'coalesce(new.fecha_carga_prevista, new.fecha_carga_desde, new.fecha_carga_real)');
    v_nueva := replace(v_nueva, 'coalesce(e.fecha_carga_desde, e.fecha_carga_real)',
                                'coalesce(e.fecha_carga_prevista, e.fecha_carga_desde, e.fecha_carga_real)');
    v_nueva := replace(v_nueva, 'coalesce(ev.fecha_carga_desde, ev.fecha_carga_real)',
                                'coalesce(ev.fecha_carga_prevista, ev.fecha_carga_desde, ev.fecha_carga_real)');
    v_nueva := replace(v_nueva, 'e.fecha_carga_desde is not null and now() >= corte_cancelacion(e.fecha_carga_desde)',
                                'coalesce(e.fecha_carga_prevista, e.fecha_carga_desde) is not null and now() >= corte_cancelacion(coalesce(e.fecha_carga_prevista, e.fecha_carga_desde))');
    if v_nueva = v_def then
      raise exception 'No encuentro en % la fecha con la que se mira el plazo de cancelación: revisar la función antes de aplicar.', f.proname;
    end if;
    execute v_nueva;
  end loop;
  if n <> array_length(c_nombres, 1) then
    raise exception 'Esperaba % funciones con el plazo de cancelación y hay %: revisar antes de aplicar.', array_length(c_nombres, 1), n;
  end if;
end $$;
