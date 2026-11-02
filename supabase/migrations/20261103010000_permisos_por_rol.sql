-- =====================================================================================
-- PERMISOS POR ROL (regla 14-bis, puntos 1 y 3)
-- =====================================================================================
-- Hasta aquí cada tabla nació CERRADA (RLS activada sin políticas) y se fueron abriendo
-- algunas. Esta migración cierra el modelo entero, con un principio:
--
--   ★ LA SEGURIDAD POR FILAS FILTRA FILAS, NO COLUMNAS ★
--
-- Si un cliente puede LEER la tabla `envios`, lee también `importe_transportista`,
-- `margen_euros` y `factor_tarifa_aplicado` de sus envíos: tu cocina. Y si puede
-- ESCRIBIR en ella, puede ponerse el precio que quiera. Por eso:
--
--   LECTURA  · Dynamo (admin/empleado) lee las tablas.
--            · Cliente y transportista leen por FUNCIONES que devuelven solo sus filas
--              y solo las columnas que les tocan: mis_envios(), mis_viajes(),
--              mis_ofertas(), mi_empresa()… (el patrón de mis_penalizaciones()).
--   ESCRITURA de envíos · solo Dynamo y el SERVIDOR. El cliente crea y modifica envíos a
--              través del servidor, que recalcula el precio (PRODUCCION.md: "el precio se
--              recalcula SIEMPRE en el servidor"). Para cancelar, cancelar_mi_envio().
--
-- Lo que el cliente gestiona él solo y no tiene dinero dentro (sus sitios, sus
-- operadores, sus contactos, sus incidencias, sus almacenamientos) sigue por tabla.
-- =====================================================================================


-- =====================================================================================
-- 0. AYUDANTES: ¿este envío es mío?
-- =====================================================================================
-- Las políticas de hitos, documentos, firmas e incidencias preguntaban "¿veo el envío?"
-- leyendo `envios`. Como el cliente ya no lee `envios`, preguntan a estas funciones,
-- que miran la tabla como dueño y responden solo sí o no.
create or replace function envio_del_cliente(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from envios where id = p_envio and cliente_id = cliente_del_usuario())
$$;
create or replace function envio_del_transportista(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from envios where id = p_envio
                 and transportista_id = transportista_del_usuario())
$$;


-- =====================================================================================
-- 1. ENVÍOS Y PARADAS: tabla solo para Dynamo
-- =====================================================================================
drop policy if exists envios_sel on envios;
drop policy if exists envios_ins on envios;
drop policy if exists envios_upd on envios;
create policy envios_admin on envios for all using (es_admin()) with check (es_admin());

drop policy if exists paradas_sel on envio_paradas;
drop policy if exists paradas_ins on envio_paradas;
drop policy if exists paradas_upd on envio_paradas;
drop policy if exists paradas_del on envio_paradas;
create policy paradas_admin on envio_paradas for all using (es_admin()) with check (es_admin());

-- La vista del cliente ya no sirve (era security_invoker: sin leer la tabla, vacía).
-- La sustituye mis_envios().
drop view if exists v_envios_cliente;

-- Las paradas de un envío en JSON, ordenadas. Interna: la usan las funciones de abajo.
create or replace function paradas_json(p_envio uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'orden', p.orden, 'tipo', p.tipo, 'lugar_id', p.lugar_id,
           'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion, 'cp', p.cp,
           'poblacion', p.poblacion, 'provincia', p.provincia, 'pais', p.pais_codigo_iso,
           'lat', p.lat, 'lon', p.lon, 'fecha_desde', p.fecha_desde,
           'fecha_hasta', p.fecha_hasta, 'hora_real', p.hora_real,
           'referencia', p.referencia, 'observaciones', p.observaciones)
           order by p.orden), '[]'::jsonb)
    from envio_paradas p where p.envio_id = p_envio
$$;
revoke execute on function paradas_json(uuid) from public, anon, authenticated;


-- ---- Lo que ve el CLIENTE de sus envíos ---------------------------------------------
-- Regla 11: el teléfono y el nombre del conductor desaparecen al entregar o cancelar.
-- NUNCA: importe_transportista, margen, factor de tarifa, transportista_id, NIMA del
-- transportista, precio fijado a mano, primera_oferta_en.
create or replace function mis_envios()
returns table (
  id uuid, referencia_gx text, referencia_cliente text, estado estado_envio,
  estado_asignacion estado_asignacion, es_manual boolean, operador_id uuid,
  precio_acordado_operador numeric,
  fecha_carga_desde date, fecha_carga_hasta date, fecha_carga_real date,
  fecha_entrega_estimada date,
  descripcion_mercancia varchar, toneladas numeric, metros_lineales numeric,
  tipo_carga tipo_carga, paletizado boolean, carga_lateral boolean, carga_superior boolean,
  carga_trasera boolean, plataforma_elevadora boolean, nima_requerido boolean, adr boolean,
  cp_origen text, poblacion_origen text, cp_destino text, poblacion_destino text,
  num_paradas smallint, importe_cliente numeric, moneda char, iva_aplicado numeric,
  anotaciones_cliente varchar, discrecion_comercial boolean,
  matricula_camion text, matricula_remolque text,
  conductor_nombre text, conductor_telefono text,
  creado_en timestamptz, modificado_en timestamptz, confirmado_en timestamptz,
  asignado_en timestamptz, cargado_en timestamptz, entregado_en timestamptz,
  cancelado_en timestamptz, paradas jsonb)
language sql stable security definer set search_path = public as $$
  select e.id, e.referencia_gx, e.referencia_cliente, e.estado, e.estado_asignacion,
         e.es_manual, e.operador_id, e.precio_acordado_operador,
         e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real, e.fecha_entrega_estimada,
         e.descripcion_mercancia, e.toneladas, e.metros_lineales, e.tipo_carga,
         e.paletizado, e.carga_lateral, e.carga_superior, e.carga_trasera,
         e.plataforma_elevadora, e.nima_requerido, e.adr,
         e.cp_origen, e.poblacion_origen, e.cp_destino, e.poblacion_destino, e.num_paradas,
         e.importe_cliente, e.moneda, e.iva_aplicado, e.anotaciones_cliente,
         e.discrecion_comercial, e.matricula_camion, e.matricula_remolque,
         case when e.estado in ('entregado','cancelado') then null else e.conductor_nombre end,
         case when e.estado in ('entregado','cancelado') then null else e.conductor_telefono end,
         e.creado_en, e.modificado_en, e.confirmado_en, e.asignado_en, e.cargado_en,
         e.entregado_en, e.cancelado_en, paradas_json(e.id)
    from envios e
   where e.cliente_id = cliente_del_usuario()
   order by e.creado_en desc
$$;
comment on function mis_envios() is
  'Envios del CLIENTE que llama, con sus paradas. Sin datos internos de Dynamo y con la '
  'regla 11 aplicada. Desde la API se puede filtrar: rpc/mis_envios?estado=eq.programado.';


-- ---- Lo que ve el TRANSPORTISTA de sus viajes ---------------------------------------
-- Ve lo que necesita para hacer el viaje y cobrarlo: la ruta, la mercancía, sus
-- matrículas y SU precio. NUNCA: el precio del cliente, el margen, el factor, ni quién
-- es el cliente que contrata a Dynamo (anti-desintermediación).
create or replace function mis_viajes()
returns table (
  id uuid, referencia_gx text, estado estado_envio,
  fecha_carga_desde date, fecha_carga_hasta date, fecha_carga_real date,
  fecha_entrega_estimada date,
  descripcion_mercancia varchar, toneladas numeric, metros_lineales numeric,
  tipo_carga tipo_carga, paletizado boolean, carga_lateral boolean, carga_superior boolean,
  carga_trasera boolean, plataforma_elevadora boolean, nima_requerido boolean, adr boolean,
  importe_transportista numeric, moneda char,
  matricula_camion text, matricula_remolque text, conductor_nombre text,
  conductor_telefono text, asignado_en timestamptz, cargado_en timestamptz,
  entregado_en timestamptz, paradas jsonb)
language sql stable security definer set search_path = public as $$
  select e.id, e.referencia_gx, e.estado,
         e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real, e.fecha_entrega_estimada,
         e.descripcion_mercancia, e.toneladas, e.metros_lineales, e.tipo_carga,
         e.paletizado, e.carga_lateral, e.carga_superior, e.carga_trasera,
         e.plataforma_elevadora, e.nima_requerido, e.adr,
         e.importe_transportista, e.moneda,
         e.matricula_camion, e.matricula_remolque, e.conductor_nombre, e.conductor_telefono,
         e.asignado_en, e.cargado_en, e.entregado_en, paradas_json(e.id)
    from envios e
   where e.transportista_id = transportista_del_usuario()
   order by e.fecha_carga_desde desc nulls last
$$;
comment on function mis_viajes() is
  'Viajes asignados al TRANSPORTISTA que llama. Su precio si; el del cliente, el margen y '
  'la identidad del cliente de Dynamo, nunca.';


-- ---- Las ofertas abiertas que tiene un transportista --------------------------------
-- El rango en EUROS, nunca el porcentaje de banda (decisión 2026-09-03).
create or replace function mis_ofertas()
returns table (
  id uuid, envio_id uuid, referencia_gx text, token uuid, canal text,
  precio_ofertado numeric, precio_minimo numeric, precio_maximo numeric,
  pronto_pago boolean, caduca_en timestamptz,
  fecha_carga_desde date, fecha_carga_hasta date, metros_lineales numeric,
  toneladas numeric, poblacion_origen text, poblacion_destino text)
language sql stable security definer set search_path = public as $$
  select o.id, o.envio_id, e.referencia_gx, o.token, o.canal,
         o.precio_ofertado, o.precio_ofertado - o.banda_euros, o.precio_ofertado + o.banda_euros,
         o.pronto_pago, o.caduca_en,
         e.fecha_carga_desde, e.fecha_carga_hasta, e.metros_lineales, e.toneladas,
         e.poblacion_origen, e.poblacion_destino
    from envio_ofertas o join envios e on e.id = o.envio_id
   where o.transportista_id = transportista_del_usuario()
     and o.estado = 'activa' and o.caduca_en > now()
     and e.estado = 'programado' and e.estado_asignacion <> 'confirmada'
   order by o.enviada_en desc
$$;


-- ---- Cancelar: la única escritura del cliente sobre un envío ------------------------
-- Pasa por aquí para que la penalización automática, el hito y las reglas se apliquen
-- siempre igual. Modificar un envío (que cambia el precio) va por el servidor.
create or replace function cancelar_mi_envio(p_envio uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_estado estado_envio;
begin
  select estado into v_estado from envios
   where id = p_envio and cliente_id = cliente_del_usuario() for update;
  if v_estado is null then
    raise exception 'Ese envio no existe o no es tuyo.' using errcode = '42501';
  end if;
  if v_estado not in ('borrador', 'programado') then
    return jsonb_build_object('resultado', 'no_cancelable', 'estado', v_estado);
  end if;
  update envios set estado = 'cancelado' where id = p_envio;
  if p_motivo is not null then
    perform registrar_hito(p_envio, 'incidencia', null, null,
      jsonb_build_object('motivo_cancelacion', left(p_motivo, 500)));
  end if;
  return jsonb_build_object('resultado', 'cancelado',
    'penalizacion', exists (select 1 from penalizaciones
                            where envio_id = p_envio and generada_auto
                              and estado = 'pendiente_confirmar'));
end $$;

revoke execute on function mis_envios()                    from public, anon;
revoke execute on function mis_viajes()                    from public, anon;
revoke execute on function mis_ofertas()                   from public, anon;
revoke execute on function cancelar_mi_envio(uuid, text)   from public, anon;
revoke execute on function envio_del_cliente(uuid)         from public, anon;
revoke execute on function envio_del_transportista(uuid)   from public, anon;


-- =====================================================================================
-- 2. LO QUE COLGABA DE "¿VEO EL ENVÍO?": hitos, documentos, firmas, incidencias
-- =====================================================================================
drop policy if exists hitos_sel on envio_hitos;
create policy hitos_sel on envio_hitos for select using (
  es_admin()
  or (hito_visible_fuera(hito)
      and (envio_del_cliente(envio_id) or envio_del_transportista(envio_id)))
);

drop policy if exists firmas_sel on firmas_cmr;
create policy firmas_sel on firmas_cmr for select using (
  es_admin() or envio_del_cliente(envio_id) or envio_del_transportista(envio_id)
);

drop policy if exists documentos_sel on documentos;
create policy documentos_sel on documentos for select using (
  es_admin()
  -- Cliente: lo marcado visible de lo suyo, y las fotos/adjuntos que sube él.
  or (not borrado
      and (visible_cliente
           or (creado_por = auth.uid() and tipo in ('foto_incidencia','adjunto')))
      and (envio_del_cliente(envio_id)
           or exists (select 1 from incidencias i
                      where i.id = documentos.incidencia_id and i.cliente_id = cliente_del_usuario())
           or exists (select 1 from almacenamientos a
                      where a.id = documentos.almacenamiento_id and a.cliente_id = cliente_del_usuario())))
  -- Transportista: los de su ficha y los de sus viajes (orden de transporte, CMR…).
  or (not borrado and transportista_del_usuario() is not null
      and (documentos.transportista_id = transportista_del_usuario()
           or envio_del_transportista(envio_id)))
);

drop policy if exists incidencias_ins on incidencias;
create policy incidencias_ins on incidencias for insert with check (
  es_admin()
  or (cliente_id = cliente_del_usuario() and (envio_id is null or envio_del_cliente(envio_id)))
);


-- =====================================================================================
-- 3. EMPRESAS: cada uno lee la suya, sin los campos internos
-- =====================================================================================
create policy clientes_admin       on clientes       for all using (es_admin()) with check (es_admin());
create policy transportistas_admin on transportistas for all using (es_admin()) with check (es_admin());

-- NUNCA al cliente: factor de tarifa, riesgo CESCE/manual, recargo por pago tarde,
-- verificación, anotaciones internas.
create or replace function mi_empresa()
returns table (id uuid, codigo text, razon_social text, nombre_comercial text, cif text,
               direccion text, poblacion text, codigo_postal text, provincia text,
               pais text, pais_codigo_iso char, plazo_pago_dias integer,
               discrecion_comercial boolean, tipo_camion_defecto tipo_camion,
               forma_carga_defecto forma_carga, plataforma_elevadora_defecto boolean,
               estado estado_cuenta)
language sql stable security definer set search_path = public as $$
  select c.id, c.codigo, c.razon_social, c.nombre_comercial, c.cif, c.direccion,
         c.poblacion, c.codigo_postal, c.provincia, c.pais, c.pais_codigo_iso,
         c.plazo_pago_dias, c.discrecion_comercial, c.tipo_camion_defecto,
         c.forma_carga_defecto, c.plataforma_elevadora_defecto, c.estado
    from clientes c where c.id = cliente_del_usuario()
$$;

-- NUNCA al transportista (regla del panel, 2026-07-20): su estado operativo, la
-- valoración interna de Dynamo, las notas internas, ni su pronto pago.
create or replace function mi_empresa_transportista()
returns table (id uuid, codigo text, razon_social text, nombre_comercial text, cif text,
               direccion text, poblacion text, codigo_postal text, provincia text,
               pais text, pais_codigo_iso char, plazo_pago_dias integer, nima text,
               bolsa text, codigo_bolsa text, seguro_cmr_compania text,
               seguro_cmr_poliza text, seguro_cmr_vence date)
language sql stable security definer set search_path = public as $$
  select t.id, t.codigo, t.razon_social, t.nombre_comercial, t.cif, t.direccion,
         t.poblacion, t.codigo_postal, t.provincia, t.pais, t.pais_codigo_iso,
         t.plazo_pago_dias, t.nima, t.bolsa, t.codigo_bolsa, t.seguro_cmr_compania,
         t.seguro_cmr_poliza, t.seguro_cmr_vence
    from transportistas t where t.id = transportista_del_usuario()
$$;
revoke execute on function mi_empresa()               from public, anon;
revoke execute on function mi_empresa_transportista() from public, anon;


-- =====================================================================================
-- 4. CONTACTOS
-- =====================================================================================
-- Cliente: los de su empresa y los de sus sitios. Transportista: los de su empresa
-- MENOS contabilidad (regla del panel: no ve su email de contabilidad).
create policy contactos_sel on contactos for select using (
  es_admin()
  or (cliente_id is not null and cliente_id = cliente_del_usuario())
  or (lugar_id is not null and exists (select 1 from lugares l
        where l.id = contactos.lugar_id and l.cliente_id = cliente_del_usuario()))
  or (transportista_id is not null and transportista_id = transportista_del_usuario()
      and funcion <> 'contabilidad')
);
create policy contactos_ins on contactos for insert with check (
  es_admin()
  or (cliente_id is not null and cliente_id = cliente_del_usuario())
  or (lugar_id is not null and exists (select 1 from lugares l
        where l.id = contactos.lugar_id and l.cliente_id = cliente_del_usuario()))
  or (transportista_id is not null and transportista_id = transportista_del_usuario()
      and funcion <> 'contabilidad')
);
create policy contactos_upd on contactos for update
  using (
    es_admin()
    or (cliente_id is not null and cliente_id = cliente_del_usuario())
    or (lugar_id is not null and exists (select 1 from lugares l
          where l.id = contactos.lugar_id and l.cliente_id = cliente_del_usuario()))
    or (transportista_id is not null and transportista_id = transportista_del_usuario()
        and funcion <> 'contabilidad'))
  with check (
    es_admin()
    or (cliente_id is not null and cliente_id = cliente_del_usuario())
    or (lugar_id is not null and exists (select 1 from lugares l
          where l.id = contactos.lugar_id and l.cliente_id = cliente_del_usuario()))
    or (transportista_id is not null and transportista_id = transportista_del_usuario()
        and funcion <> 'contabilidad'));
create policy contactos_del on contactos for delete using (
  es_admin()
  or (cliente_id is not null and cliente_id = cliente_del_usuario())
  or (lugar_id is not null and exists (select 1 from lugares l
        where l.id = contactos.lugar_id and l.cliente_id = cliente_del_usuario()))
);


-- =====================================================================================
-- 5. USUARIOS
-- =====================================================================================
-- Cada uno ve su perfil y los compañeros de su empresa. Dynamo, todos.
create policy usuarios_sel on usuarios for select using (
  es_admin()
  or id = auth.uid()
  or (cliente_id is not null and cliente_id = cliente_del_usuario())
  or (transportista_id is not null and transportista_id = transportista_del_usuario())
);
create policy usuarios_upd on usuarios for update
  using (es_admin() or id = auth.uid())
  with check (es_admin() or id = auth.uid());
create policy usuarios_admin_ins on usuarios for insert with check (es_admin());

-- Lo que nadie se puede tocar a sí mismo: rol, estado, empresa y límites.
-- Y conceder ADMIN solo lo puede hacer otro admin (no un empleado), nunca a sí mismo
-- (reglas del cambio de rol, bitácora 2026-07-12).
create or replace function fn_usuarios_campos_protegidos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_yo_rol rol_usuario;
begin
  if es_servidor() then return new; end if;
  select rol into v_yo_rol from usuarios where id = auth.uid() and estado = 'activa';

  if (new.rol, new.estado, new.cliente_id, new.transportista_id,
      new.limite_consultas_precio_diario, new.limite_cargas_diario)
     is distinct from
     (old.rol, old.estado, old.cliente_id, old.transportista_id,
      old.limite_consultas_precio_diario, old.limite_cargas_diario) then
    if v_yo_rol not in ('admin', 'empleado') then
      raise exception 'Solo Dynamo puede cambiar el rol, el estado o la empresa de una cuenta.'
        using errcode = '42501';
    end if;
    if new.rol is distinct from old.rol and new.id = auth.uid() then
      raise exception 'Nadie puede cambiar su propio rol.' using errcode = '42501';
    end if;
    if new.rol = 'admin' and old.rol <> 'admin' and v_yo_rol <> 'admin' then
      raise exception 'Solo un administrador puede conceder el rol de administrador.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger tg_usuarios_campos_protegidos before update on usuarios
  for each row execute function fn_usuarios_campos_protegidos();


-- =====================================================================================
-- 6. FLOTA: el transportista ve los suyos ("con quién suele venir")
-- =====================================================================================
create policy vehiculos_sel on vehiculos for select
  using (es_admin() or (transportista_id is not null and transportista_id = transportista_del_usuario()));
create policy vehiculos_admin on vehiculos for all using (es_admin()) with check (es_admin());

create policy conductores_sel on conductores for select
  using (es_admin() or (transportista_id is not null and transportista_id = transportista_del_usuario()));
create policy conductores_admin on conductores for all using (es_admin()) with check (es_admin());


-- =====================================================================================
-- 7. PENALIZACIONES DEL TRANSPORTISTA (las que le afectan, con SU importe)
-- =====================================================================================
create or replace function mis_penalizaciones_transportista()
returns table (id uuid, codigo text, envio_id uuid, referencia_gx text, tipo text,
               descripcion text, importe_transportista numeric,
               estado estado_penalizacion, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.codigo, p.envio_id, e.referencia_gx, t.nombre, p.descripcion,
         p.importe_transportista, p.estado, p.creado_en
    from penalizaciones p
    join envios e             on e.id = p.envio_id
    join tipos_penalizacion t on t.id = p.tipo_id
   where e.transportista_id = transportista_del_usuario()
     and p.importe_transportista is not null
     and p.estado <> 'cancelada'
   order by p.creado_en desc
$$;
revoke execute on function mis_penalizaciones_transportista() from public, anon;


-- =====================================================================================
-- 8. SOLO DYNAMO
-- =====================================================================================
-- La auditoría la lee Dynamo (nadie la escribe por la API: la escriben los triggers).
create policy auditoria_admin_sel on auditoria for select using (es_admin());

-- Reglas de servicio, recargos y caché de kilómetros: las lee y cambia Dynamo; el
-- tarifador las usa desde el servidor.
create policy restricciones_admin on restricciones_servicio for all using (es_admin()) with check (es_admin());
create policy recargos_admin      on recargos_tipo_lugar    for all using (es_admin()) with check (es_admin());
create policy distancias_l_admin  on distancias_lugares     for select using (es_admin());
create policy distancias_cp_admin on distancias_cp          for select using (es_admin());
