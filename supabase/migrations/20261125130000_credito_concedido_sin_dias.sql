-- =====================================================================================
-- EMAIL «LÍNEA DE CRÉDITO CONCEDIDA»: SIN LOS DÍAS DE PAGO (usuario, 2026-11-25)
-- =====================================================================================
-- «Quita eso de 120 días, pon: Tu empresa ya tiene línea de crédito con Dynamo, respaldada
-- por CESCE. Desde ahora tus envíos se pagan a vencimiento, sin pago por adelantado.»
-- El plazo de pago de cada cliente se pacta aparte y va en sus facturas: el email ya no
-- lo nombra. El resto de la función queda igual (se parchea, no se reescribe).
do $$
declare v_def text; v_viejo text; v_nuevo text;
begin
  select pg_get_functiondef('public.fn_email_credito_cambio()'::regprocedure) into v_def;
  v_viejo := $v$format('<p>Tu empresa ya tiene <strong>línea de crédito</strong> con Dynamo%s.</p><p>Desde ahora tus envíos se pagan <strong>a vencimiento</strong>%s, sin pago por adelantado.</p>',
      case when v_cesce then ', respaldada por CESCE' else '' end,
      case when coalesce(new.plazo_pago_dias, 0) > 0 then format(' (a %s días)', new.plazo_pago_dias) else '' end);$v$;
  v_nuevo := $v$format('<p>Tu empresa ya tiene <strong>línea de crédito</strong> con Dynamo%s.</p><p>Desde ahora tus envíos se pagan <strong>a vencimiento</strong>, sin pago por adelantado.</p>',
      case when v_cesce then ', respaldada por CESCE' else '' end);$v$;
  if position(v_viejo in v_def) = 0 then raise exception 'fn_email_credito_cambio: no encuentro el texto de «línea concedida» que hay que cambiar'; end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
revoke execute on function fn_email_credito_cambio() from public, anon, authenticated;
