-- =====================================================================================
-- LA REALIDAD PISA A LA FICHA DE FLOTA (decisión del usuario, 2026-11-13)
-- =====================================================================================
-- Al asignar camión Y remolque a un envío, si la matrícula del camión figuraba en la
-- flota como RÍGIDO saltaba «Un camión rígido no lleva remolque» y bloqueaba la
-- asignación — aunque la ficha estuviera mal o desfasada (las fichas de flota se dan
-- de alta solas a partir de lo tecleado en envíos anteriores, y un transportista puede
-- tener rígidos y tráileres a la vez). Mismo criterio que en las firmas del CMR: lo
-- tecleado AHORA pisa a lo anotado. Si llega camión + remolque, ese camión es una
-- tractora: la ficha del vehículo se corrige sola y la asignación pasa.
-- El bloqueo de tg_envios_vehiculos queda solo como última red para enlaces directos
-- por id de vehículo, con un mensaje que dice dónde corregirlo.

-- ---- fn_envios_flota_alta: además de enlazar, corrige la ficha desfasada ------------
CREATE OR REPLACE FUNCTION public.fn_envios_flota_alta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_tipo tipo_vehiculo; v_tel text;
begin
  if new.operador_id is not null then return new; end if;

  -- Camión
  if tg_op = 'INSERT' or new.matricula_camion is distinct from old.matricula_camion then
    new.vehiculo_camion_id := null;
    if nullif(trim(new.matricula_camion), '') is not null then
      select id, tipo into v_id, v_tipo from vehiculos
       where activo and normalizar_matricula(matricula) = normalizar_matricula(new.matricula_camion) limit 1;
      if v_id is null then
        insert into vehiculos (transportista_id, matricula, tipo, tiene_plataforma_elevadora)
        values (new.transportista_id, upper(trim(new.matricula_camion)),
                (case when nullif(trim(new.matricula_remolque), '') is not null then 'tractora'
                     when new.requiere_plataforma_elevadora then 'rigido' else 'tractora' end)::tipo_vehiculo,
                coalesce(new.requiere_plataforma_elevadora, false))
        returning id into v_id;
        new.vehiculo_camion_id := v_id;
      elsif v_tipo <> 'remolque' then
        new.vehiculo_camion_id := v_id;
        update vehiculos set transportista_id = new.transportista_id where id = v_id and transportista_id is null;
        -- Camión + remolque tecleados y la ficha decía «rígido»: la ficha está desfasada
        -- (un rígido no arrastra semirremolque). Lo tecleado manda: pasa a tractora
        -- (usuario, 2026-11-13; antes esto bloqueaba la asignación).
        if v_tipo = 'rigido' and nullif(trim(new.matricula_remolque), '') is not null then
          update vehiculos set tipo = 'tractora' where id = v_id;
        end if;
      end if;
    end if;
  end if;

  -- Remolque
  if tg_op = 'INSERT' or new.matricula_remolque is distinct from old.matricula_remolque then
    new.vehiculo_remolque_id := null;
    if nullif(trim(new.matricula_remolque), '') is not null then
      v_id := null;
      select id, tipo into v_id, v_tipo from vehiculos
       where activo and normalizar_matricula(matricula) = normalizar_matricula(new.matricula_remolque) limit 1;
      if v_id is null then
        insert into vehiculos (transportista_id, matricula, tipo)
        values (new.transportista_id, upper(trim(new.matricula_remolque)), 'remolque')
        returning id into v_id;
        new.vehiculo_remolque_id := v_id;
      elsif v_tipo = 'remolque' then
        new.vehiculo_remolque_id := v_id;
        update vehiculos set transportista_id = new.transportista_id where id = v_id and transportista_id is null;
      end if;
      -- Remolque añadido con el camión ya enlazado como «rígido»: misma corrección.
      if new.vehiculo_camion_id is not null then
        update vehiculos set tipo = 'tractora' where id = new.vehiculo_camion_id and tipo = 'rigido';
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
      -- Solo entre los conductores de ESE transportista (o sin transportista todavía): dos
      -- chóferes con el mismo nombre en empresas distintas son personas distintas.
      select id into v_id from conductores
       where activo and lower(unaccent_simple(trim(nombre))) = lower(unaccent_simple(trim(new.conductor_nombre)))
         and (transportista_id is null or transportista_id is not distinct from new.transportista_id)
         and (v_tel is null or telefono is null or telefono = v_tel)
       order by (transportista_id is not distinct from new.transportista_id) desc, (telefono = v_tel) desc nulls last limit 1;
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
end $function$;

comment on function fn_envios_flota_alta() is
  'Da de alta (o reutiliza) en vehiculos/conductores lo que se asigna en el envio y lo enlaza. '
  'Si llegan camion + remolque y la ficha del camion decia "rigido", la corrige sola a tractora '
  '(lo tecleado pisa a lo anotado). No toca la copia en texto del envio. No aplica a envios manuales.';

-- ---- fn_envios_vehiculos: el bloqueo queda de última red, con mensaje que orienta ----
create or replace function fn_envios_vehiculos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cam tipo_vehiculo; v_rem tipo_vehiculo;
begin
  if new.vehiculo_camion_id is not null then
    select tipo into v_cam from vehiculos where id = new.vehiculo_camion_id;
    if v_cam = 'remolque' then
      raise exception 'Has puesto un remolque como camión.';
    end if;
    if v_cam = 'rigido'
       and (new.vehiculo_remolque_id is not null
            or nullif(trim(new.matricula_remolque), '') is not null) then
      raise exception 'La matrícula del camión figura como RÍGIDO en la flota y un rígido no lleva remolque. Corrige el tipo del vehículo en la ficha del transportista o quita el remolque.';
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

comment on function fn_envios_vehiculos() is
  'Ultima red de coherencia camion/remolque del envio por IDs de vehiculo: el camion no puede '
  'ser un remolque, un rigido enlazado no lleva remolque y en el remolque solo va un remolque. '
  'El caso normal (matriculas tecleadas) lo resuelve antes fn_envios_flota_alta corrigiendo la ficha.';

comment on column public.envios.matricula_remolque is 'formato: texto | rango: no aplica | lista: no aplica | opcional | Matrícula del remolque. Solo en trailer. Si la ficha del camión decía «rígido» y se teclea un remolque, la ficha se corrige sola a tractora (fn_envios_flota_alta); el bloqueo de tg_envios_vehiculos queda solo para enlaces directos por id de vehículo. Copia congelada. Ej. OK: R1234BCD';
