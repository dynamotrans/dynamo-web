-- SI CESCE BAJA EL CRÉDITO, SE QUITA SOLO EL CRÉDITO A MANO DE DYNAMO (usuario, 2026-11-19).
-- El crédito puesto a mano por Dynamo manda sobre el de CESCE. Si CESCE baja el suyo (a 0,
-- de 16.000 a 8.000, o deja de clasificar a la empresa) y nadie quita el de Dynamo, el
-- cliente seguiría cargando a crédito con un riesgo que CESCE ya no cubre. Por eso, en cuanto
-- el importe de CESCE BAJA respecto al que tenía, el crédito de Dynamo se borra (queda en
-- blanco) y manda CESCE. Sale un aviso urgente en la campana de Dynamo.
-- · Si en el MISMO guardado Dynamo pone también un crédito a mano nuevo, se respeta: es una
--   decisión tomada a la vez (p. ej. volver a darle 30.000 € tras hablar con él).
-- · Si CESCE sube o no cambia, el crédito de Dynamo se queda como está.
-- Después cuenta todo lo de siempre: el email al cliente de «línea reducida / retirada», el
-- pago previo de sus envíos nuevos y el crédito disponible.

create or replace function fn_clientes_cesce_baja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.riesgo_cesce_euros is not null
     and (new.riesgo_cesce_euros is null or new.riesgo_cesce_euros < old.riesgo_cesce_euros)
     and new.riesgo_manual_euros is not null
     and new.riesgo_manual_euros is not distinct from old.riesgo_manual_euros then
    -- Aviso para Dynamo, atado al cliente (se borra con él; el cliente solo ve los avisos
    -- «para cliente», nunca este).
    insert into avisos (para, cliente_id, tipo, nivel, titulo, texto, enlace)
    values ('dynamo', new.id, 'credito_cesce_baja', 'urgente',
      left('CESCE ha bajado el crédito · ' || coalesce(new.razon_social, 'cliente'), 200),
      left(format('CESCE pasa de %s a %s. Se ha quitado el crédito a mano de Dynamo (%s) y ahora manda CESCE. Si quieres volver a darle crédito, ponlo de nuevo en su ficha.',
        euros_texto(old.riesgo_cesce_euros),
        coalesce(euros_texto(new.riesgo_cesce_euros), 'sin clasificar'),
        euros_texto(old.riesgo_manual_euros)), 500),
      '/panel/clientes?ver=' || new.id);
    new.riesgo_manual_euros := null;
  end if;
  return new;
end $$;
revoke all on function fn_clientes_cesce_baja() from public, anon, authenticated;
comment on function fn_clientes_cesce_baja() is '[Clientes] Si baja el crédito que concede CESCE (a 0, a menos, o sin clasificar), borra el crédito puesto a mano por Dynamo para que mande CESCE, salvo que ese mismo cambio ponga un crédito a mano nuevo. Avisa a Dynamo en la campana. Quién: disparador de clientes.';

drop trigger if exists tg_clientes_cesce_baja on clientes;
create trigger tg_clientes_cesce_baja before update of riesgo_cesce_euros on clientes
  for each row execute function fn_clientes_cesce_baja();

comment on column public.clientes.riesgo_manual_euros is 'formato: número decimal (2 decimales) | rango: 0 o más | lista: no aplica | opcional | Crédito en euros que fija Dynamo a mano. Si está puesto manda SIEMPRE sobre el de CESCE: un importe es ese importe y 0 es sin crédito. Vacío = Dynamo no opina y manda CESCE. Se borra solo (queda vacío) cuando CESCE baja su crédito. Solo Dynamo. Ej. OK: 10000 · Ej. mal: -1';
