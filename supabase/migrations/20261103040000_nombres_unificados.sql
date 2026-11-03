-- =====================================================================================
-- NOMBRES UNIFICADOS (decisión del usuario, 2026-11-03)
-- =====================================================================================
-- Al repasar el esquema salieron cuatro datos que se llamaban distinto según la tabla.
-- Se unifican ahora, que en dynamo-pruebas no hay datos reales y cambiarlos no cuesta:
--
--   1. Código postal  → `codigo_postal` en todas partes (antes `cp` en las paradas y
--      `cp_origen`/`cp_destino` en envíos y en la caché de distancias).
--   2. Notas          → `anotaciones` en todas partes (antes `notas` en contactos y
--      `observaciones` en las paradas).
--   3. Población      → `poblacion` en todas partes (antes `localidad` en festivos).
--   4. País           → SOLO `pais_codigo_iso` ('ES'). Fuera la columna `pais` con el
--      nombre ("España") en clientes, transportistas y sitios: guardar las dos cosas
--      deja que se contradigan. El nombre se saca del código al enseñarlo.
--
-- CONVENCIÓN DE NOMBRES (queda escrita en supabase/migrations/README.md):
-- sin prefijo de tabla en las columnas; relaciones `<tabla en singular>_id`; fecha y
-- hora `*_en`; fecha sin hora `fecha_*`; sí/no `es_*`/`tiene_*`/`requiere_*`; dinero
-- `importe_*`; con unidad, la unidad al final (`*_euros`, `*_pct`, `*_km`).
--
-- Renombrar una columna NO actualiza el texto de las funciones (Postgres guarda su
-- código tal cual), así que aquí se rehacen todas las que usaban los nombres viejos.
-- La prueba 47 del arnés comprueba que no queda ninguna.
-- =====================================================================================


-- =====================================================================================
-- 1. CÓDIGO POSTAL
-- =====================================================================================
alter table envios        rename column cp_origen  to codigo_postal_origen;
alter table envios        rename column cp_destino to codigo_postal_destino;
alter table envio_paradas rename column cp         to codigo_postal;
alter table distancias_cp rename column cp_origen  to codigo_postal_origen;
alter table distancias_cp rename column cp_destino to codigo_postal_destino;

alter index if exists idx_paradas_cp rename to idx_paradas_codigo_postal;

comment on column envios.codigo_postal_origen is
  'Denormalizado desde envio_paradas por el trigger tg_envios_ruta. NO se escribe a mano.';
comment on column envio_paradas.codigo_postal is
  'TEXTO siempre: ''08185'' como número sería 8185.';


-- =====================================================================================
-- 2. NOTAS → anotaciones
-- =====================================================================================
alter table contactos     rename column notas         to anotaciones;
alter table envio_paradas rename column observaciones to anotaciones;

comment on column envio_paradas.anotaciones is
  'Indicaciones para esta parada concreta ("muelle 3", "llamar al llegar").';


-- =====================================================================================
-- 3. POBLACIÓN
-- =====================================================================================
alter table festivos rename column localidad to poblacion;
comment on table festivos is
  'Festivos nacionales (region null), autonomicos (region) y locales (region + poblacion). '
  'Los nacionales de Espana 2026-2030 vienen sembrados; el resto los mete Dynamo.';


-- =====================================================================================
-- 4. PAÍS: solo el código ISO
-- =====================================================================================
update clientes       set pais_codigo_iso = 'ES' where pais_codigo_iso is null;
update transportistas set pais_codigo_iso = 'ES' where pais_codigo_iso is null;
update lugares        set pais_codigo_iso = 'ES' where pais_codigo_iso is null;

-- mi_empresa() y mi_empresa_transportista() devolvían `pais`: se rehacen sin él
-- (cambia lo que devuelven, así que hay que borrarlas antes).
drop function mi_empresa();
drop function mi_empresa_transportista();

alter table clientes       drop column pais, alter column pais_codigo_iso set not null;
alter table transportistas drop column pais, alter column pais_codigo_iso set not null;
alter table lugares        drop column pais, alter column pais_codigo_iso set not null;

comment on column clientes.pais_codigo_iso is
  'Código ISO del país (''ES'', ''PT''…). El nombre ("España") se saca de aquí al enseñarlo.';
comment on column transportistas.pais_codigo_iso is
  'Código ISO del país (''ES'', ''PT''…). El nombre se saca de aquí al enseñarlo.';
comment on column lugares.pais_codigo_iso is
  'Código ISO del país (''ES'', ''PT''…). El nombre se saca de aquí al enseñarlo.';

-- NUNCA al cliente: factor de tarifa, riesgo CESCE/manual, recargo por pago tarde,
-- verificación, anotaciones internas.
create function mi_empresa()
returns table (id uuid, codigo text, razon_social text, nombre_comercial text, cif text,
               direccion text, poblacion text, codigo_postal text, provincia text,
               pais_codigo_iso char, plazo_pago_dias integer,
               discrecion_comercial boolean, tipo_camion_defecto tipo_camion,
               forma_carga_defecto forma_carga, plataforma_elevadora_defecto boolean,
               estado estado_cuenta)
language sql stable security definer set search_path = public as $$
  select c.id, c.codigo, c.razon_social, c.nombre_comercial, c.cif, c.direccion,
         c.poblacion, c.codigo_postal, c.provincia, c.pais_codigo_iso,
         c.plazo_pago_dias, c.discrecion_comercial, c.tipo_camion_defecto,
         c.forma_carga_defecto, c.plataforma_elevadora_defecto, c.estado
    from clientes c where c.id = cliente_del_usuario()
$$;

-- NUNCA al transportista: su estado operativo, la valoración interna de Dynamo, las
-- notas internas, ni su pronto pago.
create function mi_empresa_transportista()
returns table (id uuid, codigo text, razon_social text, nombre_comercial text, cif text,
               direccion text, poblacion text, codigo_postal text, provincia text,
               pais_codigo_iso char, plazo_pago_dias integer, nima text,
               bolsa text, codigo_bolsa text, seguro_cmr_compania text,
               seguro_cmr_poliza text, seguro_cmr_vence date)
language sql stable security definer set search_path = public as $$
  select t.id, t.codigo, t.razon_social, t.nombre_comercial, t.cif, t.direccion,
         t.poblacion, t.codigo_postal, t.provincia, t.pais_codigo_iso,
         t.plazo_pago_dias, t.nima, t.bolsa, t.codigo_bolsa, t.seguro_cmr_compania,
         t.seguro_cmr_poliza, t.seguro_cmr_vence
    from transportistas t where t.id = transportista_del_usuario()
$$;
revoke execute on function mi_empresa()               from public, anon;
revoke execute on function mi_empresa_transportista() from public, anon;


-- =====================================================================================
-- 5. FUNCIONES Y VISTAS QUE USABAN LOS NOMBRES VIEJOS
-- =====================================================================================

-- ---- Ruta denormalizada en `envios` (trigger de las paradas) ----------------------
create or replace function fn_envios_refrescar_ruta()
returns trigger language plpgsql as $$
declare
  v_envio uuid := coalesce(new.envio_id, old.envio_id);
begin
  update envios e set
    codigo_postal_origen  = o.codigo_postal,
    poblacion_origen      = o.poblacion,
    codigo_postal_destino = d.codigo_postal,
    poblacion_destino     = d.poblacion,
    num_paradas           = coalesce(n.total, 0),
    km_total              = n.km
  from (select count(*) total, sum(km_hasta_siguiente) km
          from envio_paradas where envio_id = v_envio) n
  left join lateral (select codigo_postal, poblacion from envio_paradas
                     where envio_id = v_envio order by orden asc  limit 1) o on true
  left join lateral (select codigo_postal, poblacion from envio_paradas
                     where envio_id = v_envio order by orden desc limit 1) d on true
  where e.id = v_envio;
  return null;
end $$;

-- ---- Caché de distancias entre códigos postales -----------------------------------
create or replace function fn_guardar_km_cp(
  p_pais_origen char(2), p_cp_origen text, p_pais_destino char(2), p_cp_destino text,
  p_km numeric, p_minutos integer default null, p_proveedor text default 'google_routes')
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  -- El UNIQUE va sobre el CP normalizado (índice funcional), así que ON CONFLICT no
  -- puede apuntar a columnas: se busca primero y se actualiza o se inserta.
  select id into v_id
    from distancias_cp
   where pais_origen = upper(p_pais_origen)
     and normaliza_cp(codigo_postal_origen) = normaliza_cp(p_cp_origen)
     and pais_destino = upper(p_pais_destino)
     and normaliza_cp(codigo_postal_destino) = normaliza_cp(p_cp_destino);

  if v_id is null then
    insert into distancias_cp (
      pais_origen, codigo_postal_origen, pais_destino, codigo_postal_destino, km, minutos, proveedor
    ) values (
      upper(p_pais_origen), p_cp_origen, upper(p_pais_destino), p_cp_destino,
      p_km, p_minutos, p_proveedor
    ) returning id into v_id;
  else
    update distancias_cp set km = p_km, minutos = p_minutos, proveedor = p_proveedor
     where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function fn_km_cp(
  p_pais_origen char(2), p_cp_origen text, p_pais_destino char(2), p_cp_destino text,
  p_max_edad interval default '1 year')
returns numeric language sql stable as $$
  select d.km
    from distancias_cp d
   where d.pais_origen  = upper(p_pais_origen)
     and normaliza_cp(d.codigo_postal_origen)  = normaliza_cp(p_cp_origen)
     and d.pais_destino = upper(p_pais_destino)
     and normaliza_cp(d.codigo_postal_destino) = normaliza_cp(p_cp_destino)
     and coalesce(d.modificado_en, d.creado_en) > now() - p_max_edad
   limit 1
$$;

-- ---- Restricciones de servicio al añadir una parada y en la ruta ----------------
create or replace function fn_paradas_restriccion_al_anadir()
returns trigger language plpgsql as $$
declare
  v_estado estado_envio;
  v_r      record;
  v_carga  tipo_carga;
  v_manual boolean;
begin
  select estado, tipo_carga, operador_id is not null
    into v_estado, v_carga, v_manual from envios where id = new.envio_id;

  if v_estado is null or v_estado in ('borrador', 'entregado', 'cancelado') or v_manual then
    return new;   -- borrador: se mira al confirmar · terminados: historia · manual: no es de Dynamo
  end if;

  for v_r in
    select * from fn_restriccion_punto(new.pais_codigo_iso, new.codigo_postal, new.tipo, v_carga)
  loop
    if v_r.efecto = 'bloquea'
       or (v_r.efecto = 'solo_admin' and not es_admin()) then
      raise exception 'No se puede anadir esta parada (% en %): %',
        new.tipo, coalesce(new.nombre_empresa, new.poblacion, new.codigo_postal, '?'), v_r.mensaje;
    end if;
  end loop;
  return new;
end $$;

create or replace function fn_restricciones_ruta(p_envio uuid)
returns table (orden smallint, punto text, tipo text, nombre text, efecto text, mensaje text)
language sql stable as $$
  select p.orden,
         coalesce(p.nombre_empresa, p.poblacion, p.codigo_postal, '(parada ' || p.orden || ')'),
         p.tipo,
         f.nombre, f.efecto, f.mensaje
    from envio_paradas p
    cross join lateral fn_restriccion_punto(
      p.pais_codigo_iso,
      p.codigo_postal,
      p.tipo,
      (select e.tipo_carga from envios e where e.id = p.envio_id)
    ) f
   where p.envio_id = p_envio
   order by p.orden
$$;

-- ---- Festivos: día hábil ---------------------------------------------------------
create or replace function es_dia_habil(p_fecha date, p_pais char(2) default 'ES',
                                        p_region text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select extract(isodow from p_fecha) < 6
     and not exists (select 1 from festivos f
                      where f.fecha = p_fecha and f.pais_codigo_iso = p_pais
                        and f.poblacion is null
                        and (f.region is null or f.region = p_region))
$$;

-- ---- Paradas en JSON (lo que ven cliente y transportista) -------------------------
-- Las claves del JSON se llaman igual que las columnas.
create or replace function paradas_json(p_envio uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'orden', p.orden, 'tipo', p.tipo, 'lugar_id', p.lugar_id,
           'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion,
           'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion,
           'provincia', p.provincia, 'pais_codigo_iso', p.pais_codigo_iso,
           'lat', p.lat, 'lon', p.lon, 'fecha_desde', p.fecha_desde,
           'fecha_hasta', p.fecha_hasta, 'hora_real', p.hora_real,
           'referencia', p.referencia, 'anotaciones', p.anotaciones)
           order by p.orden), '[]'::jsonb)
    from envio_paradas p where p.envio_id = p_envio
$$;

-- ---- Lo que ve el CLIENTE de sus envíos (cambian los nombres que devuelve) --------
-- Regla 11: el teléfono y el nombre del conductor desaparecen al entregar o cancelar.
drop function mis_envios();
create function mis_envios()
returns table (
  id uuid, referencia_gx text, referencia_cliente text, estado estado_envio,
  estado_asignacion estado_asignacion, es_manual boolean, operador_id uuid,
  precio_acordado_operador numeric,
  fecha_carga_desde date, fecha_carga_hasta date, fecha_carga_real date,
  fecha_entrega_estimada date,
  descripcion_mercancia varchar, toneladas numeric, metros_lineales numeric,
  tipo_carga tipo_carga, paletizado boolean, carga_lateral boolean, carga_superior boolean,
  carga_trasera boolean, plataforma_elevadora boolean, nima_requerido boolean, adr boolean,
  codigo_postal_origen text, poblacion_origen text,
  codigo_postal_destino text, poblacion_destino text,
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
         e.codigo_postal_origen, e.poblacion_origen,
         e.codigo_postal_destino, e.poblacion_destino, e.num_paradas,
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
revoke execute on function mis_envios() from public, anon;
comment on function mis_envios() is
  'Envios del CLIENTE que llama, con sus paradas. Sin datos internos de Dynamo y con la '
  'regla 11 aplicada. Desde la API se puede filtrar: rpc/mis_envios?estado=eq.programado.';

-- ---- Vista de envíos con paradas (lleva `e.*` congelado: se rehace) ----------------
drop view v_envios_con_paradas;
create view v_envios_con_paradas with (security_invoker = true) as
select e.*,
       (select jsonb_agg(jsonb_build_object(
                 'id', p.id, 'orden', p.orden, 'tipo', p.tipo,
                 'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion,
                 'codigo_postal', p.codigo_postal, 'poblacion', p.poblacion,
                 'provincia', p.provincia, 'pais_codigo_iso', p.pais_codigo_iso,
                 'lat', p.lat, 'lon', p.lon,
                 'fecha_desde', p.fecha_desde, 'fecha_hasta', p.fecha_hasta,
                 'hora_real', p.hora_real, 'referencia', p.referencia,
                 'anotaciones', p.anotaciones, 'km_hasta_siguiente', p.km_hasta_siguiente)
                 order by p.orden)
          from envio_paradas p where p.envio_id = e.id) as paradas
  from envios e;
comment on view v_envios_con_paradas is 'Un envio con sus paradas ya ordenadas por `orden`.';
