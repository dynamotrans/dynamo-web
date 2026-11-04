-- =====================================================================================
-- ALMACENAMIENTOS PEDIDOS POR EL CLIENTE (etapa B) — el precio lo pone SIEMPRE la base
-- =====================================================================================
-- El cliente ya podía insertar su almacenamiento (pendiente de confirmar) y cambiarlo
-- mientras Dynamo no lo confirma. Pero con su propia sesión podía escribir también lo que
-- NO le toca: el precio, el IVA, si paga por adelantado, la fecha de pago (marcarse como
-- pagado) o las notas internas de Dynamo. Hueco cerrado aquí, en la base de datos:
--
--   · Cuando escribe un CLIENTE, el precio se calcula AQUÍ con la tarifa del almacén
--     (o la de `parametros`): 1 a 7 días = 1 semana por tráiler, cada semana empezada
--     cuenta entera; reparto urbano por camión. Es la misma regla que lib/almacenamiento.ts.
--   · IVA y pago por adelantado salen de SU ficha de cliente (sin crédito → proforma).
--   · Nunca puede tocar `pagado_en`, `anotaciones`, el almacén ni el cliente de uno ya creado.
--   · Dynamo (es_admin) y las conexiones del servidor no pasan por aquí: siguen igual.
--
-- Y una función para que la pantalla del cliente enseñe el precio antes de pedir:
-- `almacenes_dynamo_tarifa()` (los almacenes con su tarifa; `parametros` no la lee el cliente).
-- =====================================================================================

create or replace function tarifa_almacen(p_almacen uuid)
returns table (semana numeric, reparto numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(l.precio_almacenamiento_semana,
                  (select (valor #>> '{}')::numeric from parametros where clave = 'almacen_precio_semana'), 240),
         coalesce(l.precio_reparto,
                  (select (valor #>> '{}')::numeric from parametros where clave = 'almacen_precio_reparto'), 220)
    from lugares l where l.id = p_almacen
$$;
revoke execute on function tarifa_almacen(uuid) from public, anon, authenticated;

create or replace function fn_almacenamientos_campos_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cli uuid := cliente_del_usuario(); t record; semanas integer; c record; recalcular boolean;
begin
  -- Dynamo y el servidor (sin cliente en la sesión) no pasan por aquí.
  if es_admin() or v_cli is null then return new; end if;

  if tg_op = 'INSERT' then
    new.cliente_id := v_cli;
    new.estado     := 'pendiente_confirmar';
    new.pagado_en  := null;
    new.anotaciones := null;
    recalcular := true;
  else
    -- Lo que el cliente no cambia nunca en uno ya pedido.
    new.cliente_id  := old.cliente_id;
    new.almacen_id  := old.almacen_id;
    new.pagado_en   := old.pagado_en;
    new.anotaciones := old.anotaciones;
    new.iva_aplicado    := old.iva_aplicado;
    new.pago_adelantado := old.pago_adelantado;
    recalcular := (new.fecha_entrada, new.fecha_salida, new.num_trailers, new.num_repartos)
                  is distinct from (old.fecha_entrada, old.fecha_salida, old.num_trailers, old.num_repartos);
    if not recalcular then
      new.importe_almacenaje := old.importe_almacenaje;
      new.importe_reparto    := old.importe_reparto;
    end if;
  end if;

  if recalcular then
    select * into t from tarifa_almacen(new.almacen_id);
    semanas := greatest(1, ceil(greatest(new.fecha_salida - new.fecha_entrada, 1) / 7.0)::integer);
    new.importe_almacenaje := round(new.num_trailers * semanas * coalesce(t.semana, 240), 2);
    new.importe_reparto    := round(new.num_repartos * coalesce(t.reparto, 220), 2);
  end if;
  if tg_op = 'INSERT' then
    select iva_porcentaje, riesgo_efectivo_euros into c from clientes where id = v_cli;
    new.iva_aplicado    := coalesce(c.iva_porcentaje, 21);
    -- Sin crédito (CESCE o de Dynamo) se paga por adelantado con proforma.
    new.pago_adelantado := not (coalesce(c.riesgo_efectivo_euros, 0) > 0);
  end if;
  return new;
end $$;

-- "aa" para que vaya antes que tg_almacenamientos_validar (los triggers BEFORE van por nombre).
create trigger tg_almacenamientos_aa_campos_cliente
  before insert or update on almacenamientos
  for each row execute function fn_almacenamientos_campos_cliente();

-- Los almacenes Dynamo con su tarifa, para la pantalla del cliente.
create or replace function almacenes_dynamo_tarifa()
returns table (id uuid, nombre text, direccion text, codigo_postal text, poblacion text, provincia text,
               disponible boolean, semana numeric, reparto numeric)
language sql stable security definer set search_path = public as $$
  select l.id, l.nombre_empresa, l.direccion, l.codigo_postal, l.poblacion, l.provincia, l.disponible,
         t.semana, t.reparto
    from lugares l cross join lateral tarifa_almacen(l.id) t
   where l.es_almacen_dynamo and not l.borrado
   order by l.provincia, l.poblacion
$$;
revoke execute on function almacenes_dynamo_tarifa() from public, anon;
grant execute on function almacenes_dynamo_tarifa() to authenticated;
