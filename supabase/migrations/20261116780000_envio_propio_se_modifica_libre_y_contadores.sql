-- =====================================================================================
-- EL ENVÍO CON TRANSPORTISTA PROPIO SE MODIFICA LIBREMENTE; Y LOS CONTADORES DEL MENÚ NO
-- CUENTAN DOS VECES (usuario, 2026-11-16)
-- =====================================================================================
-- 1) «Aquí el envío con su transportista propio: pon precio, nombre del transportista y
--    opción de modificar el envío libremente, porque es suyo; no aplica nada y no mandas
--    emails ni nada.» El cliente ya podía mover el estado y anotar el camión; ahora puede
--    cambiarlo ENTERO (ruta, fechas, mercancía, transportista y precio acordado) desde el
--    mismo asistente, sin reglas de fechas ni de cancelación y sin avisar a nadie: Dynamo
--    no interviene en ese envío. Los emails y avisos del envío ya se saltaban los propios.
-- 2) En el menú del cliente, «Envíos» enseñaba 3 naranja (sin transportista) y 3 rojo
--    (pendientes de pago) para los MISMOS tres envíos. Un envío que espera el pago todavía
--    no está en la cola de asignar camión: se cuenta solo en rojo. (El contador global de
--    Dynamo ya lo hacía así.)

-- ---- 1. Modificar entero un envío con transportista propio --------------------------------
create or replace function modificar_mi_envio_manual(p_envio uuid, p_datos jsonb, p_paradas jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare e envios%rowtype;
  v_oper uuid := nullif(p_datos ->> 'operador_id', '')::uuid;
  v_desde date := (p_datos ->> 'fecha_carga_desde')::date;
  v_hasta date := coalesce((p_datos ->> 'fecha_carga_hasta')::date, (p_datos ->> 'fecha_carga_desde')::date);
  v_precio numeric := (p_datos ->> 'precio_acordado_operador')::numeric;
begin
  if not (es_equipo_dynamo() or envio_del_cliente(p_envio))
     or not exists (select 1 from usuarios u where u.id = auth.uid() and u.estado = 'activa') then
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  select * into e from envios where id = p_envio for update;
  if not coalesce(e.es_manual, false) then
    raise exception 'Este envío lo gestiona Dynamo: se modifica con sus reglas.' using errcode = '42501';
  end if;
  if e.estado = 'cancelado' then raise exception 'El envío está cancelado.'; end if;
  if v_oper is null or not exists (select 1 from operadores o where o.id = v_oper and o.cliente_id = e.cliente_id and not o.borrado) then
    raise exception 'Elige uno de tus transportistas.';
  end if;
  if v_desde is null then raise exception 'Elige una fecha de recogida.'; end if;
  if v_hasta < v_desde then raise exception 'La ventana no puede terminar antes de empezar.'; end if;
  -- La fecha que ya tenía se respeta aunque haya pasado; una nueva, de hoy en adelante.
  if v_desde is distinct from e.fecha_carga_desde and v_desde < (now() at time zone 'Europe/Madrid')::date then
    raise exception 'La nueva fecha de recogida tiene que ser de hoy en adelante.';
  end if;
  if v_precio is not null and (v_precio < 0 or v_precio > 1000000) then raise exception 'El precio acordado no es válido.'; end if;

  perform set_config('dynamo.cambio_envio', 'on', true);
  if p_paradas is not null then perform ruta_envio_reemplazar(p_envio, p_paradas); end if;
  update envios set
    operador_id = v_oper,
    referencia_cliente = nullif(trim(p_datos ->> 'referencia_cliente'), ''),
    fecha_carga_desde = v_desde, fecha_carga_hasta = v_hasta,
    descripcion_mercancia = nullif(trim(p_datos ->> 'descripcion_mercancia'), ''),
    toneladas = (p_datos ->> 'toneladas')::numeric, metros_lineales = (p_datos ->> 'metros_lineales')::numeric,
    paletizado = coalesce((p_datos ->> 'paletizado')::boolean, true), carga_lateral = coalesce((p_datos ->> 'carga_lateral')::boolean, true),
    carga_trasera = coalesce((p_datos ->> 'carga_trasera')::boolean, false), carga_techo = coalesce((p_datos ->> 'carga_techo')::boolean, false),
    requiere_plataforma_elevadora = coalesce((p_datos ->> 'requiere_plataforma_elevadora')::boolean, false),
    requiere_nima = coalesce((p_datos ->> 'requiere_nima')::boolean, false), adr = coalesce((p_datos ->> 'adr')::boolean, false),
    precio_acordado_operador = v_precio,
    discrecion_comercial = coalesce((p_datos ->> 'discrecion_comercial')::boolean, false),
    anotaciones_cliente = left(nullif(trim(p_datos ->> 'anotaciones_cliente'), ''), 1000)
   where id = p_envio;
  perform set_config('dynamo.cambio_envio', 'off', true);
end $$;
revoke execute on function modificar_mi_envio_manual(uuid, jsonb, jsonb) from public, anon;
grant execute on function modificar_mi_envio_manual(uuid, jsonb, jsonb) to authenticated;
comment on function public.modificar_mi_envio_manual(uuid, jsonb, jsonb) is '[Envíos] El cliente modifica ENTERO un envío que lleva con un transportista propio (envío manual): ruta, fechas, mercancía, transportista y precio acordado. Sin reglas de fechas ni de cancelación y sin avisar a nadie: Dynamo no interviene en ese envío. No vale para envíos de Dynamo ni cancelados. Quién: cliente dueño del envío (o el equipo de Dynamo en su nombre). Argumentos: p_envio: envios.id · p_datos: los campos del envío, con operador_id (uno de sus operadores) y precio_acordado_operador (opcional) · p_paradas: la ruta nueva (como cambiar_ruta_envio), o null si no cambia.';

-- Solo el precio acordado, desde la ficha.
create or replace function mi_envio_manual_precio(p_envio uuid, p_precio numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (es_equipo_dynamo() or envio_del_cliente(p_envio))
     or not exists (select 1 from usuarios u where u.id = auth.uid() and u.estado = 'activa') then
    raise exception 'Ese envío no es tuyo.' using errcode = '42501';
  end if;
  if p_precio is not null and (p_precio < 0 or p_precio > 1000000) then raise exception 'El precio acordado no es válido.'; end if;
  update envios set precio_acordado_operador = p_precio where id = p_envio and es_manual and estado <> 'cancelado';
  if not found then raise exception 'Este envío no es de un transportista tuyo, o está cancelado.'; end if;
end $$;
revoke execute on function mi_envio_manual_precio(uuid, numeric) from public, anon;
grant execute on function mi_envio_manual_precio(uuid, numeric) to authenticated;
comment on function public.mi_envio_manual_precio(uuid, numeric) is '[Envíos] El cliente anota (o borra, con vacío) el precio acordado con su transportista en un envío propio. Quién: cliente dueño del envío (o el equipo de Dynamo en su nombre). Argumentos: p_envio: envios.id · p_precio: importe sin IVA, o null para dejarlo sin anotar.';

-- ---- 2. Contadores del menú del cliente: el pendiente de pago no cuenta como «sin transportista»
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.cuenta_mis_envios_sin_asignar()'::regprocedure);
  n := replace(v, 'and e.estado_asignacion is distinct from ''confirmada''', 'and e.estado_asignacion is distinct from ''confirmada'' and e.estado_pago_previo is distinct from ''pendiente''');
  if n = v then raise exception 'cuenta_mis_envios_sin_asignar: no encuentro el filtro'; end if;
  execute n;
  v := pg_get_functiondef('public.contadores_panel(uuid, uuid)'::regprocedure);
  n := replace(v, 'where cliente_id = p_cliente and estado = ''programado'' and not es_manual and estado_asignacion is distinct from ''confirmada'')',
                  'where cliente_id = p_cliente and estado = ''programado'' and not es_manual and estado_asignacion is distinct from ''confirmada'' and estado_pago_previo is distinct from ''pendiente'')');
  if n = v then raise exception 'contadores_panel: no encuentro el contador de sin asignar del cliente'; end if;
  execute n;
end $$;
