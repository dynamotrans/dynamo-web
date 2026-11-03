-- =====================================================================================
-- LÍNEA DE PRONTO PAGO a transportistas (widget del Dashboard admin del mockup)
-- =====================================================================================
-- Dynamo adelanta el cobro a los transportistas que eligen pronto pago con una línea de
-- crédito propia. Lo anticipado en los ÚLTIMOS 60 DÍAS consume la línea. Si se agota, o
-- si Dynamo lo apaga a mano, las nuevas ofertas salen SIN pronto pago: lo impone la base
-- de datos al crear la oferta, no la pantalla.

insert into parametros (clave, valor, descripcion) values
  ('pronto_pago_linea_euros', '50000', 'Linea total (EUR) para adelantar pagos con pronto pago a transportistas.'),
  ('pronto_pago_encendido',   'true',  'Interruptor manual del pronto pago: false = las nuevas ofertas salen sin la opcion.'),
  ('pronto_pago_ventana_dias', '60',   'Dias hacia atras que cuentan como anticipado (consumen la linea).')
on conflict (clave) do nothing;

-- Descuento de un importe con pronto pago (mismo cálculo que la página del transportista).
create or replace function pronto_pago_descuento(p_importe numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select greatest(round(coalesce(p_importe, 0) * (parametro('pronto_pago_pct'))::text::numeric) / 100,
                  (parametro('pronto_pago_minimo'))::text::numeric)
$$;

-- Estado de la línea: total, anticipado, disponible, si está activa y los anticipos.
create or replace function pronto_pago_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_linea numeric; v_on boolean; v_dias int; v_usado numeric; v_lista jsonb;
begin
  v_linea := (parametro('pronto_pago_linea_euros'))::text::numeric;
  v_on    := (parametro('pronto_pago_encendido'))::text::boolean;
  v_dias  := (parametro('pronto_pago_ventana_dias'))::text::int;
  select coalesce(sum(r.precio_aceptado - pronto_pago_descuento(r.precio_aceptado)), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'cuando', r.cerrada_en, 'envio', e.referencia_gx, 'transportista', t.nombre_visible,
           'importe', r.precio_aceptado, 'descuento', pronto_pago_descuento(r.precio_aceptado),
           'anticipado', r.precio_aceptado - pronto_pago_descuento(r.precio_aceptado))
           order by r.cerrada_en desc) filter (where r.id is not null), '[]'::jsonb)
    into v_usado, v_lista
    from envio_reservas r
    join envios e on e.id = r.envio_id
    left join transportistas t on t.id = r.transportista_id
   where r.estado = 'aceptada' and r.pronto_pago and r.cerrada_en > now() - make_interval(days => v_dias)
     and e.estado <> 'cancelado';
  return jsonb_build_object(
    'linea', v_linea, 'encendido', v_on, 'ventana_dias', v_dias, 'usado', v_usado,
    'disponible', greatest(v_linea - v_usado, 0),
    -- Activo si está encendido y queda al menos el descuento mínimo de margen.
    'activo', v_on and v_linea - v_usado >= (parametro('pronto_pago_minimo'))::text::numeric,
    'anticipos', case when es_admin() then v_lista else '[]'::jsonb end);
end $$;
revoke execute on function pronto_pago_estado() from public, anon;
grant execute on function pronto_pago_estado() to authenticated;

-- Al crear una oferta: si la línea no está activa, sale sin pronto pago.
create or replace function fn_ofertas_pronto_pago()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pronto_pago and not (pronto_pago_estado() ->> 'activo')::boolean then
    new.pronto_pago := false;
  end if;
  return new;
end $$;
create trigger tg_ofertas_pronto_pago before insert on envio_ofertas
  for each row execute function fn_ofertas_pronto_pago();
