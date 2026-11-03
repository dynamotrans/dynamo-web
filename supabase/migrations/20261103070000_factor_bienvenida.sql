-- =====================================================================================
-- DESCUENTO DE BIENVENIDA AUTOMÁTICO (decisión del usuario, 2026-11-03)
-- =====================================================================================
-- El factor de precio de un cliente nuevo empieza con el descuento de bienvenida (−7 %,
-- el mismo que ve el tarifador online sin registrarse). Se mantiene durante sus
-- primeros X envíos y, al llegar, PASA SOLO A 0 %.
--
-- Si Dynamo toca el factor a mano (0 %, +10 %, lo que sea), el cliente queda marcado
-- como `factor_fijado_a_mano` y la regla automática YA NO LO TOCA NUNCA MÁS. Se puede
-- volver al automático desmarcándolo: entonces el factor se recalcula con la regla.
--
-- Las dos cifras son PARÁMETROS (tabla `parametros`), no números escritos en el código:
--   factor_bienvenida_pct     → el descuento (−7)
--   factor_bienvenida_envios  → cuántos envíos dura (3)
-- Se cambian desde el panel de Supabase (Table Editor → parametros) o, más adelante,
-- desde la pantalla de parámetros del panel. Afectan a los clientes desde ese momento.
--
-- Cuentan los envíos de DYNAMO confirmados (no los borradores, ni los cancelados, ni
-- los envíos manuales con otro operador).
-- =====================================================================================

insert into parametros (clave, valor, descripcion) values
  ('factor_bienvenida_pct', '-7',
   'Descuento de bienvenida (%) con el que empieza todo cliente nuevo, y el que ve el '
   'tarifador online sin registrarse. Negativo = descuento.'),
  ('factor_bienvenida_envios', '3',
   'Envios que dura el descuento de bienvenida. Al confirmarse el ultimo, el factor del '
   'cliente pasa solo a 0 %, salvo que Dynamo lo haya fijado a mano.');

alter table clientes add column factor_fijado_a_mano boolean not null default false;
comment on column clientes.factor_fijado_a_mano is
  'true = Dynamo puso el factor a mano: la regla automatica del descuento de bienvenida '
  'ya no lo toca. Se marca solo al cambiar el factor; desmarcarlo vuelve al automatico.';

-- Envíos que cuentan para la regla.
create or replace function envios_que_cuentan(p_cliente uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from envios
   where cliente_id = p_cliente and not es_manual
     and estado not in ('borrador', 'cancelado')
$$;

-- El factor que le toca a un cliente según la regla automática.
create or replace function factor_automatico(p_cliente uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when envios_que_cuentan(p_cliente) < (parametro('factor_bienvenida_envios') #>> '{}')::int
      then (parametro('factor_bienvenida_pct') #>> '{}')::numeric
    else 0 end
$$;
revoke execute on function envios_que_cuentan(uuid) from public, anon;
revoke execute on function factor_automatico(uuid) from public, anon;

-- Al crear o editar un cliente.
create or replace function fn_clientes_factor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Cambio hecho por la propia regla automática: se deja pasar tal cual.
  if current_setting('dynamo.factor_auto', true) = '1' then return new; end if;

  if tg_op = 'INSERT' then
    if not new.factor_fijado_a_mano then
      new.factor_tarifa_porcentaje := factor_automatico(new.id);   -- sin envios: bienvenida
    end if;
    return new;
  end if;

  if old.factor_fijado_a_mano and not new.factor_fijado_a_mano then
    -- Vuelta al automatico: se recalcula con la regla.
    new.factor_tarifa_porcentaje := factor_automatico(new.id);
  elsif new.factor_tarifa_porcentaje is distinct from old.factor_tarifa_porcentaje then
    -- Alguien lo ha cambiado a mano: desde ahora manda Dynamo.
    new.factor_fijado_a_mano := true;
  end if;
  return new;
end $$;
create trigger tg_clientes_factor before insert or update on clientes
  for each row execute function fn_clientes_factor();

-- Al confirmar un envío: si con este el cliente llega a X, su factor pasa a 0 %.
create or replace function fn_envios_fin_bienvenida()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.es_manual or new.estado in ('borrador', 'cancelado') then return null; end if;
  if tg_op = 'UPDATE' and old.estado <> 'borrador' then return null; end if;

  perform set_config('dynamo.factor_auto', '1', true);
  update clientes c set factor_tarifa_porcentaje = factor_automatico(c.id)
   where c.id = new.cliente_id and not c.factor_fijado_a_mano
     and c.factor_tarifa_porcentaje is distinct from factor_automatico(c.id);
  perform set_config('dynamo.factor_auto', '', true);
  return null;
end $$;
create trigger tg_envios_fin_bienvenida after insert or update of estado on envios
  for each row execute function fn_envios_fin_bienvenida();
