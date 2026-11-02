-- =====================================================================================
-- AJUSTES DE FLOTA (revisión con el usuario, 2026-11-02)
-- =====================================================================================
--   1. conductores.idioma      → avisos y firma del CMR en su idioma.
--   2. vehiculos.pais_matricula → ES por defecto. Las españolas se comprueban con su
--                                 formato exacto; las extranjeras, en suave.
--   3. envios: matricula_tractora → matricula_camion (y vehiculo_tractora_id →
--      vehiculo_camion_id). En un rígido no hay tractora: "camión" vale para los dos.
--   4. Regla: un rígido NO lleva remolque.
-- =====================================================================================


-- =====================================================================================
-- 1. IDIOMA DEL CONDUCTOR
-- =====================================================================================
alter table conductores add column idioma text not null default 'es'
  check (idioma ~ '^[a-z]{2}(-[A-Z]{2})?$');
comment on column conductores.idioma is
  'Idioma de los avisos y de la pagina de firma del CMR (es, pl, pt...). Por defecto es.';


-- =====================================================================================
-- 2. PAÍS DE LA MATRÍCULA Y FORMATO ESPAÑOL
-- =====================================================================================
alter table vehiculos add column pais_matricula char(2) not null default 'ES'
  check (pais_matricula ~ '^[A-Z]{2}$');

-- Formatos españoles, sobre la matrícula ya limpia (sin espacios ni guiones):
--   tractora / rígido   actual   1234LBC      4 números + 3 consonantes (sin vocales, Ñ ni Q)
--                       antiguo  SE1234AB     provincia + 4 números + 0-2 letras
--   remolque            actual   R1234BCD     R + 4 números + 3 consonantes
--                       antiguo  SE12345R     provincia + 5 números + R
-- Las antiguas siguen circulando en camiones viejos: rechazarlas daría falsos errores.
create or replace function matricula_es_valida(p_matricula text, p_tipo tipo_vehiculo)
returns boolean language sql immutable as $$
  select case
    when p_tipo = 'remolque' then
      normaliza_matricula(p_matricula) ~ '^R[0-9]{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$'
      or normaliza_matricula(p_matricula) ~ '^[A-Z]{1,2}[0-9]{5}R$'
    else
      normaliza_matricula(p_matricula) ~ '^[0-9]{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$'
      or normaliza_matricula(p_matricula) ~ '^[A-Z]{1,2}[0-9]{4}[A-Z]{0,2}$'
  end
$$;

-- NOT VALID: se comprueba en todo lo nuevo y lo que se modifique, pero no rechaza la
-- migración si en el futuro se cargan matrículas antiguas del Sheet mal escritas
-- (se limpiarían aparte). En dynamo-pruebas no hay ninguna.
alter table vehiculos add constraint ck_vehiculos_matricula_es
  check (pais_matricula <> 'ES' or matricula_es_valida(matricula, tipo)) not valid;

comment on column vehiculos.pais_matricula is
  'Pais de la matricula (ES, PT, PL...). Va en el CMR. Si es ES se comprueba el formato '
  'exacto (tractora/rigido 1234 LBC, remolque R 1234 BCD, y los formatos antiguos).';

-- La misma matrícula puede existir en dos países: el UNIQUE pasa a incluir el país.
drop index if exists ux_vehiculos_matricula_activa;
create unique index ux_vehiculos_matricula_activa
  on vehiculos (pais_matricula, normaliza_matricula(matricula)) where activo;


-- =====================================================================================
-- 3. "CAMIÓN" EN VEZ DE "TRACTORA" EN EL ENVÍO
-- =====================================================================================
-- Las dos vistas que la usan se rehacen: una vista no deja cambiar el nombre de una
-- columna con CREATE OR REPLACE.
drop view v_envios_cliente;
drop view v_envios_con_paradas;

alter table envios rename column matricula_tractora   to matricula_camion;
alter table envios rename column vehiculo_tractora_id to vehiculo_camion_id;

comment on column envios.matricula_camion is
  'Matricula del camion que carga: la cabeza tractora en un trailer, el rigido en un '
  'rigido. Copia congelada (el CMR del ano pasado dice la que cargo de verdad).';
comment on column envios.matricula_remolque is
  'Solo en trailer. Un rigido no lleva remolque (lo impide tg_envios_vehiculos).';

-- Vista completa. Al rehacerla, `e.*` recoge también las columnas añadidas después
-- (confirmado_en, asignado_en...), que la versión anterior no tenía.
create view v_envios_con_paradas with (security_invoker = true) as
select e.*,
       (select jsonb_agg(jsonb_build_object(
                 'id', p.id, 'orden', p.orden, 'tipo', p.tipo,
                 'nombre_empresa', p.nombre_empresa, 'direccion', p.direccion,
                 'cp', p.cp, 'poblacion', p.poblacion, 'provincia', p.provincia,
                 'pais', p.pais_codigo_iso, 'lat', p.lat, 'lon', p.lon,
                 'fecha_desde', p.fecha_desde, 'fecha_hasta', p.fecha_hasta,
                 'hora_real', p.hora_real, 'referencia', p.referencia,
                 'observaciones', p.observaciones, 'km_hasta_siguiente', p.km_hasta_siguiente)
                 order by p.orden)
        from envio_paradas p where p.envio_id = e.id) as paradas
from envios e;

comment on view v_envios_con_paradas is
  'Un envio con sus paradas ya ordenadas por `orden`.';

-- Vista del CLIENTE (regla 11). Añadidos los sellos de los hitos, que el cliente sí
-- puede ver (cuándo se asignó, se cargó, se entregó).
create view v_envios_cliente with (security_invoker = true) as
select e.id, e.referencia_gx, e.referencia_cliente, e.cliente_id, e.estado,
       e.estado_asignacion, e.fecha_carga_desde, e.fecha_carga_hasta, e.fecha_carga_real,
       e.fecha_entrega_estimada, e.descripcion_mercancia, e.toneladas, e.metros_lineales,
       e.tipo_carga, e.paletizado, e.carga_lateral, e.carga_superior, e.carga_trasera,
       e.plataforma_elevadora, e.nima_requerido, e.adr,
       e.cp_origen, e.poblacion_origen, e.cp_destino, e.poblacion_destino, e.num_paradas,
       e.importe_cliente, e.moneda, e.anotaciones_cliente, e.creado_en, e.modificado_en,
       e.confirmado_en, e.asignado_en, e.cargado_en, e.entregado_en, e.cancelado_en,
       e.matricula_camion, e.matricula_remolque,
       case when e.estado in ('entregado','cancelado') then null
            else e.conductor_nombre end   as conductor_nombre,
       case when e.estado in ('entregado','cancelado') then null
            else e.conductor_telefono end as conductor_telefono
       -- NUNCA: importe_transportista, margen_euros, factor_tarifa_aplicado,
       --        transportista_id, transportista_nima, precio_fijado_a_mano,
       --        primera_oferta_en (cocina interna: cuándo se empezó a ofertar)
from envios e;

comment on view v_envios_cliente is
  'Vista del rol CLIENTE. Regla 11 (el telefono del conductor desaparece al entregar o '
  'cancelar) y sin precio del transportista, margen ni factor de tarifa (SOLO ADMIN).';

-- El trigger de hitos leía matricula_tractora por su nombre: se rehace con el nuevo.
create or replace function fn_envios_hitos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform registrar_hito(new.id, 'creado', null, null,
      jsonb_build_object('estado', new.estado, 'importe_cliente', new.importe_cliente));
    if new.estado <> 'borrador' then
      perform registrar_hito(new.id, 'confirmado');
    end if;
    return null;
  end if;

  if old.estado = 'borrador' and new.estado <> 'borrador' then
    perform registrar_hito(new.id, 'confirmado', null, null,
      jsonb_build_object('importe_cliente', new.importe_cliente));
  end if;

  if new.publicado_en_bolsa_en is distinct from old.publicado_en_bolsa_en
     and new.publicado_en_bolsa_en is not null then
    perform registrar_hito(new.id, 'publicado_bolsa');
  end if;

  if new.transportista_id is distinct from old.transportista_id then
    if old.transportista_id is not null then
      perform registrar_hito(new.id, 'transportista_quitado', null, null,
        jsonb_build_object('transportista_id', old.transportista_id));
    end if;
    if new.transportista_id is not null then
      perform registrar_hito(new.id, 'transportista_asignado', null, null,
        jsonb_build_object('transportista_id', new.transportista_id,
                           'importe_transportista', new.importe_transportista));
    end if;
  end if;

  if (new.matricula_camion, new.matricula_remolque)
       is distinct from (old.matricula_camion, old.matricula_remolque)
     and coalesce(new.matricula_camion, new.matricula_remolque) is not null then
    perform registrar_hito(new.id, 'matricula_asignada', null, null,
      jsonb_build_object('camion', new.matricula_camion,
                         'remolque', new.matricula_remolque));
  end if;

  if new.estado is distinct from old.estado then
    if new.estado = 'en_ruta'   then perform registrar_hito(new.id, 'cargado');   end if;
    if new.estado = 'entregado' then perform registrar_hito(new.id, 'entregado'); end if;
    if new.estado = 'cancelado' then
      perform registrar_hito(new.id, 'cancelado', null, null,
        jsonb_build_object('estado_anterior', old.estado,
                           'tenia_transportista', old.transportista_id is not null));
    end if;
    if old.estado = 'cancelado' then
      perform registrar_hito(new.id, 'cancelacion_deshecha', null, null,
        jsonb_build_object('estado_nuevo', new.estado));
    end if;
  end if;
  return null;
end $$;


-- =====================================================================================
-- 4. EL CAMIÓN Y EL REMOLQUE TIENEN QUE CUADRAR
-- =====================================================================================
--   · el camión es una tractora o un rígido; el remolque, un remolque;
--   · un rígido NO lleva remolque (ni enlazado ni escrito a mano);
--   · los dos son del transportista asignado al envío.
create or replace function fn_envios_vehiculos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cam record; v_rem record;
begin
  if new.vehiculo_camion_id is not null then
    select tipo, transportista_id into v_cam from vehiculos where id = new.vehiculo_camion_id;
    if v_cam.tipo = 'remolque' then
      raise exception 'Has puesto un remolque como camion.';
    end if;
    if new.transportista_id is distinct from v_cam.transportista_id then
      raise exception 'Ese camion no es del transportista asignado al envio.';
    end if;
    if v_cam.tipo = 'rigido'
       and (new.vehiculo_remolque_id is not null
            or nullif(trim(new.matricula_remolque), '') is not null) then
      raise exception 'Un camion rigido no lleva remolque.';
    end if;
  end if;
  if new.vehiculo_remolque_id is not null then
    select tipo, transportista_id into v_rem from vehiculos where id = new.vehiculo_remolque_id;
    if v_rem.tipo <> 'remolque' then
      raise exception 'En el remolque solo puede ir un remolque.';
    end if;
    if new.transportista_id is distinct from v_rem.transportista_id then
      raise exception 'Ese remolque no es del transportista asignado al envio.';
    end if;
  end if;
  return new;
end $$;

create trigger tg_envios_vehiculos
  before insert or update of vehiculo_camion_id, vehiculo_remolque_id, matricula_remolque,
                             transportista_id
  on envios for each row execute function fn_envios_vehiculos();
