-- =====================================================================================
-- FLOTA LIBRE: un camión o un conductor NO están atados a un transportista (2026-11-02)
-- =====================================================================================
-- Caso real del usuario: un autónomo al que Dynamo contrata directamente puede venir
-- otro día SUBCONTRATADO por otro transportista al que se le ha dado el viaje. Es el
-- mismo camión y el mismo conductor, con otra empresa delante.
--
-- Antes: cada vehículo y cada conductor pertenecían a UN transportista, y el envío
-- rechazaba un camión que no fuera del transportista asignado. Eso bloqueaba el caso.
--
-- Ahora:
--   · vehiculos.transportista_id y conductores.transportista_id pasan a ser OPCIONALES:
--     son "con quién suele venir", un dato de ayuda, no una atadura.
--   · Un camión existe UNA vez (por su matrícula) y un conductor UNA vez (por su DNI),
--     vengan con quien vengan. El historial de con quién vino cada vez está en los envíos.
--   · El envío ya NO comprueba que el camión sea del transportista asignado.
--   · Se mantiene lo que sí es físico: el camión no puede ser un remolque, el remolque
--     tiene que ser un remolque, y un rígido no lleva remolque.
-- =====================================================================================


-- ---- Vehículos ----------------------------------------------------------------------
do $$ declare fk text; begin
  select conname into fk from pg_constraint
   where conrelid = 'vehiculos'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'vehiculos'::regclass and attname = 'transportista_id')];
  execute format('alter table vehiculos drop constraint %I', fk);
end $$;
alter table vehiculos alter column transportista_id drop not null;
alter table vehiculos add constraint fk_vehiculos_transportista
  foreign key (transportista_id) references transportistas(id) on delete set null;
comment on column vehiculos.transportista_id is
  'Con quien suele venir (opcional). NO lo ata: el mismo camion puede venir subcontratado '
  'por otro transportista. La matricula es unica en toda la base (activos).';


-- ---- Conductores --------------------------------------------------------------------
do $$ declare fk text; begin
  select conname into fk from pg_constraint
   where conrelid = 'conductores'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'conductores'::regclass and attname = 'transportista_id')];
  execute format('alter table conductores drop constraint %I', fk);
end $$;
alter table conductores alter column transportista_id drop not null;
alter table conductores add constraint fk_conductores_transportista
  foreign key (transportista_id) references transportistas(id) on delete set null;
comment on column conductores.transportista_id is
  'Con quien suele venir (opcional). NO lo ata: el mismo conductor puede venir con otra '
  'empresa.';

-- Un conductor es UNA persona: su DNI no se repite en toda la base (antes era por
-- transportista, y el mismo autónomo acababa dos veces).
drop index if exists ux_conductores_documento;
create unique index ux_conductores_documento
  on conductores (normaliza_id_fiscal(documento))
  where documento is not null and activo;


-- ---- El envío: fuera la comprobación de dueño, se quedan las físicas ----------------
create or replace function fn_envios_vehiculos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cam tipo_vehiculo; v_rem tipo_vehiculo;
begin
  if new.vehiculo_camion_id is not null then
    select tipo into v_cam from vehiculos where id = new.vehiculo_camion_id;
    if v_cam = 'remolque' then
      raise exception 'Has puesto un remolque como camion.';
    end if;
    if v_cam = 'rigido'
       and (new.vehiculo_remolque_id is not null
            or nullif(trim(new.matricula_remolque), '') is not null) then
      raise exception 'Un camion rigido no lleva remolque.';
    end if;
  end if;
  if new.vehiculo_remolque_id is not null then
    select tipo into v_rem from vehiculos where id = new.vehiculo_remolque_id;
    if v_rem <> 'remolque' then
      raise exception 'En el remolque solo puede ir un remolque.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tg_envios_vehiculos on envios;
create trigger tg_envios_vehiculos
  before insert or update of vehiculo_camion_id, vehiculo_remolque_id, matricula_remolque
  on envios for each row execute function fn_envios_vehiculos();
