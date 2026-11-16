-- =====================================================================================
-- EL CRÉDITO QUE PONE DYNAMO A MANO MANDA SIEMPRE: 0 ES 0 (usuario, 2026-11-16)
-- =====================================================================================
-- «Yo quiero que mi valor de admin mande siempre sobre CESCE. Si ponemos 0, es 0. Si
-- dejamos en blanco, como que no opinamos y cuenta CESCE.»
--
-- HASTA AHORA (regla del 2026-11-04): manual 0 o vacío = manda CESCE; solo un manual
-- distinto de 0 mandaba. No había forma de dejar a un cliente SIN crédito a mano si CESCE
-- se lo daba.
--
-- AHORA:
--   · Manual CON importe  → manda ese importe.
--   · Manual a 0          → 0: SIN crédito, diga lo que diga CESCE (pago por adelantado).
--   · Manual VACÍO        → Dynamo no opina: manda CESCE.
--
-- Los clientes que hoy tienen el manual a 0 lo tenían con el significado antiguo («que
-- decida CESCE»): se les deja VACÍO, para que ninguno pierda el crédito por este cambio.
-- El crédito que limita (riesgo_efectivo_euros) sigue siendo una columna calculada.

-- Los 0 de antes significaban «manda CESCE»: pasan a vacío (su crédito no cambia).
update clientes set riesgo_manual_euros = null where riesgo_manual_euros = 0;

alter table clientes drop column riesgo_efectivo_euros;
alter table clientes add column riesgo_efectivo_euros numeric(12,2)
  generated always as (coalesce(riesgo_manual_euros, riesgo_cesce_euros)) stored;
comment on column public.clientes.riesgo_efectivo_euros is 'formato: número decimal (2 decimales) | rango: no aplica | lista: no aplica | automático | Calculada: el crédito que limita al cliente, en euros. El manual de Dynamo si está puesto (también si es 0: sin crédito); si está vacío, el de CESCE. Vacío = sin clasificar.';
comment on column public.clientes.riesgo_manual_euros is 'formato: número decimal (2 decimales) | rango: 0 o más | lista: no aplica | opcional | Crédito en euros que fija Dynamo a mano. Si está puesto manda SIEMPRE sobre el de CESCE: un importe es ese importe y 0 es sin crédito. Vacío = Dynamo no opina y manda CESCE. Solo Dynamo. Ej. OK: 10000 · Ej. mal: -1';

-- La pantalla «CESCE - Riesgos»: manda el manual en cuanto está puesto (también a 0).
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.riesgos_clientes()'::regprocedure);
  n := replace(v, 'case when coalesce(c.riesgo_manual_euros, 0) <> 0 then ''manual''', 'case when c.riesgo_manual_euros is not null then ''manual''');
  if n = v then raise exception 'riesgos_clientes: no encuentro quién manda para cambiarlo'; end if;
  execute n;
end $$;

-- El email de cambio de la línea: «respaldada por CESCE» solo si Dynamo no ha puesto la suya.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.fn_email_credito_cambio()'::regprocedure);
  n := replace(v, 'case when n > 0 then coalesce(new.riesgo_manual_euros, 0) = 0 else coalesce(old.riesgo_manual_euros, 0) = 0 end',
                  'case when n > 0 then new.riesgo_manual_euros is null else old.riesgo_manual_euros is null end');
  if n = v then raise exception 'fn_email_credito_cambio: no encuentro de quién es la línea para cambiarlo'; end if;
  execute n;
end $$;
