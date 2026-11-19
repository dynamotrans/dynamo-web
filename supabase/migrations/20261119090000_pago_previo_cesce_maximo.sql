-- PRIMER ENVÍO SIN PAGO PREVIO CON EL CRÉDITO CESCE MÁXIMO (usuario, 2026-11-19).
-- Con el producto «CESCE fácil», CESCE concede como mucho 16.000 € por cliente. Si a un
-- cliente le da ese máximo (o más), su primer envío (los «primeros envíos» de Parámetros)
-- NO se paga por adelantado; si le da menos, sí, como hasta ahora. El importe es un
-- parámetro (0 = la regla no se aplica). Cuenta lo que concede CESCE, no el crédito puesto
-- a mano por Dynamo; y sigue mandando lo demás: sin crédito disponible, o si el envío no
-- cabe en lo que le queda, se paga por adelantado igual.

insert into parametros (clave, valor, descripcion) values
  ('pago_previo_cesce_sin_primeros_euros', '16000', 'Previo pago: crédito CESCE (en euros) a partir del cual los primeros envíos del cliente NO se pagan por adelantado. Con CESCE fácil el máximo por cliente es 16.000 €: con ese crédito o más, el primer envío va a crédito; con menos, se paga antes. 0 = no se aplica (los primeros envíos se pagan siempre por adelantado, salvo «empresa conocida»).')
on conflict (clave) do nothing;

do $$
declare v_def text; v_nueva text;
begin
  select pg_get_functiondef('public.pago_previo_motivo(uuid, uuid)'::regprocedure) into v_def;
  if position('pago_previo_cesce_sin_primeros_euros' in v_def) > 0 then return; end if;   -- ya está
  v_nueva := replace(v_def,
    'select riesgo_efectivo_euros, exento_pago_previo_primer_envio, riesgo_manual_euros into c from clientes where id = p_cliente;',
    'select riesgo_efectivo_euros, exento_pago_previo_primer_envio, riesgo_manual_euros, riesgo_cesce_euros into c from clientes where id = p_cliente;');
  v_nueva := replace(v_nueva,
    '  if not c.exento_pago_previo_primer_envio then',
    '  -- Con el crédito CESCE máximo (parámetro), los primeros envíos tampoco se pagan antes.
  if not c.exento_pago_previo_primer_envio
     and not (parametro_num(''pago_previo_cesce_sin_primeros_euros'', 0) > 0
              and coalesce(c.riesgo_cesce_euros, 0) >= parametro_num(''pago_previo_cesce_sin_primeros_euros'', 0)) then');
  if v_nueva = v_def or position('pago_previo_cesce_sin_primeros_euros' in v_nueva) = 0 or position('riesgo_cesce_euros into c' in v_nueva) = 0 then
    raise exception 'pago_previo_motivo() no tiene el texto esperado: revisar la migración';
  end if;
  execute v_nueva;
end $$;
