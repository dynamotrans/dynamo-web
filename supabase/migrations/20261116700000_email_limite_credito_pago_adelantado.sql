-- =====================================================================================
-- EMAIL «HAS ALCANZADO EL LÍMITE DE TU LÍNEA DE CRÉDITO»: YA NO ES «ES POSIBLE» (usuario, 2026-11-16)
-- =====================================================================================
-- El email decía «es posible que te pidamos el pago por adelantado de los próximos envíos».
-- Desde hoy es seguro: el envío que no cabe en la línea de crédito se paga por adelantado
-- (20261116650000). El email lo dice tal cual, para que el cliente no se lleve la sorpresa.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.credito_revisar_uso(uuid)'::regprocedure);
  n := replace(v,
    'Mientras tanto, es posible que te pidamos el pago por adelantado de los próximos envíos.',
    'Mientras tanto, los envíos que no quepan en tu línea se pagarán por adelantado.');
  if n = v then raise exception 'credito_revisar_uso: no encuentro la frase del pago por adelantado para cambiarla'; end if;
  execute n;
end $$;
