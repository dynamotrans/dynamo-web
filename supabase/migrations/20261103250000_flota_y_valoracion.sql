-- =====================================================================================
-- FLOTA QUE SE APRENDE SOLA + VALORACIÓN DEL TRANSPORTISTA AL ENTREGAR (2026-11-03)
-- =====================================================================================
-- 1. Lo que se asigna a mano en un envío (matrícula del camión, del remolque y el
--    conductor) se da de alta solo en `vehiculos` y `conductores` y se enlaza al envío.
--    Así la próxima vez sale como sugerencia y la ITV / el seguro tienen dónde vivir.
--    Lo hace un TRIGGER: vale igual si asigna Dynamo desde la ficha o si el transportista
--    acepta la carga desde su enlace. La copia en texto del envío NO se toca (el CMR del
--    año pasado tiene que seguir diciendo la matrícula que cargó).
--    Envíos manuales (con el operador del cliente): no, esa flota no es de Dynamo.
-- 2. Valoración del transportista (1 a 5) al terminar el envío. Alimenta la media
--    interna `transportistas.valoracion_dynamo` (SOLO Dynamo la ve).

-- ---- 1. Flota -------------------------------------------------------------------------
create or replace function fn_envios_flota_alta()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tipo tipo_vehiculo; v_tel text;
begin
  if new.operador_id is not null then return new; end if;

  -- Camión
  if tg_op = 'INSERT' or new.matricula_camion is distinct from old.matricula_camion then
    new.vehiculo_camion_id := null;
    if nullif(trim(new.matricula_camion), '') is not null then
      select id, tipo into v_id, v_tipo from vehiculos
       where activo and normaliza_matricula(matricula) = normaliza_matricula(new.matricula_camion) limit 1;
      if v_id is null then
        insert into vehiculos (transportista_id, matricula, tipo, trampilla)
        values (new.transportista_id, upper(trim(new.matricula_camion)),
                (case when nullif(trim(new.matricula_remolque), '') is not null then 'tractora'
                     when new.plataforma_elevadora then 'rigido' else 'tractora' end)::tipo_vehiculo,
                coalesce(new.plataforma_elevadora, false))
        returning id into v_id;
        new.vehiculo_camion_id := v_id;
      elsif v_tipo <> 'remolque' then
        new.vehiculo_camion_id := v_id;
        update vehiculos set transportista_id = new.transportista_id where id = v_id and transportista_id is null;
      end if;
    end if;
  end if;

  -- Remolque
  if tg_op = 'INSERT' or new.matricula_remolque is distinct from old.matricula_remolque then
    new.vehiculo_remolque_id := null;
    if nullif(trim(new.matricula_remolque), '') is not null then
      v_id := null;
      select id, tipo into v_id, v_tipo from vehiculos
       where activo and normaliza_matricula(matricula) = normaliza_matricula(new.matricula_remolque) limit 1;
      if v_id is null then
        insert into vehiculos (transportista_id, matricula, tipo)
        values (new.transportista_id, upper(trim(new.matricula_remolque)), 'remolque')
        returning id into v_id;
        new.vehiculo_remolque_id := v_id;
      elsif v_tipo = 'remolque' then
        new.vehiculo_remolque_id := v_id;
      end if;
    end if;
  end if;

  -- Conductor: por nombre (y teléfono, si lo hay), sin distinguir mayúsculas ni acentos.
  if tg_op = 'INSERT' or new.conductor_nombre is distinct from old.conductor_nombre
     or new.conductor_telefono is distinct from old.conductor_telefono then
    new.conductor_id := null;
    if nullif(trim(new.conductor_nombre), '') is not null then
      v_tel := nullif(regexp_replace(coalesce(new.conductor_telefono, ''), '[^0-9+]', '', 'g'), '');
      if v_tel !~ '^\+?[0-9]{6,15}$' then v_tel := null; end if;
      v_id := null;
      select id into v_id from conductores
       where activo and lower(unaccent_simple(trim(nombre))) = lower(unaccent_simple(trim(new.conductor_nombre)))
         and (v_tel is null or telefono is null or telefono = v_tel)
       order by (telefono = v_tel) desc nulls last limit 1;
      if v_id is null then
        insert into conductores (transportista_id, nombre, telefono)
        values (new.transportista_id, trim(new.conductor_nombre), v_tel) returning id into v_id;
      else
        update conductores set telefono = coalesce(telefono, v_tel),
                               transportista_id = coalesce(transportista_id, new.transportista_id)
         where id = v_id and (telefono is null or transportista_id is null);
      end if;
      new.conductor_id := v_id;
    end if;
  end if;
  return new;
end $$;

-- Quitar acentos sin depender de la extensión unaccent.
create or replace function unaccent_simple(t text)
returns text language sql immutable as $$
  select translate(t, 'áéíóúàèìòùäëïöüâêîôûñçÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ', 'aeiouaeiouaeiouaeiouncAEIOUAEIOUAEIOUAEIOUNC')
$$;

drop trigger if exists tg_envios_flota_alta on envios;
create trigger tg_envios_flota_alta
  before insert or update of matricula_camion, matricula_remolque, conductor_nombre, conductor_telefono on envios
  for each row execute function fn_envios_flota_alta();
comment on function fn_envios_flota_alta() is
  'Da de alta (o reutiliza) en vehiculos/conductores lo que se asigna en el envío y lo enlaza. '
  'No toca la copia en texto del envío. No aplica a envíos manuales.';

-- ---- 2. Valoración --------------------------------------------------------------------
alter table envios add column valoracion_transportista smallint check (valoracion_transportista between 1 and 5);
alter table envios add column valoracion_comentario text check (valoracion_comentario is null or length(valoracion_comentario) <= 1000);
comment on column envios.valoracion_transportista is 'SOLO DYNAMO: nota de 1 a 5 al transportista en este envío (al entregar).';

create or replace function fn_envios_valoracion()
returns trigger language plpgsql security definer set search_path = public as $$
declare t transportistas%rowtype; v_suma numeric;
begin
  if new.valoracion_transportista is not distinct from old.valoracion_transportista then return new; end if;
  if new.valoracion_transportista is not null and new.estado <> 'entregado' then
    raise exception 'El transportista se valora cuando el envío está entregado.';
  end if;
  if new.valoracion_transportista is not null and new.transportista_id is null then
    raise exception 'Este envío no tiene transportista que valorar.';
  end if;
  return new;
end $$;
create trigger tg_envios_valoracion before update of valoracion_transportista on envios
  for each row execute function fn_envios_valoracion();

-- La media se rehace con todas sus notas: exacta aunque se cambie o se quite una.
create or replace function fn_envios_valoracion_media()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update transportistas t set
    valoracion_dynamo = (select round(avg(valoracion_transportista)::numeric, 1) from envios
                          where transportista_id = t.id and valoracion_transportista is not null),
    valoracion_dynamo_votos = (select count(*) from envios where transportista_id = t.id and valoracion_transportista is not null)
   where t.id in (new.transportista_id, old.transportista_id);
  return null;
end $$;
create trigger tg_envios_valoracion_media after update of valoracion_transportista, transportista_id on envios
  for each row when (new.valoracion_transportista is distinct from old.valoracion_transportista
                     or (new.transportista_id is distinct from old.transportista_id and old.valoracion_transportista is not null))
  execute function fn_envios_valoracion_media();
