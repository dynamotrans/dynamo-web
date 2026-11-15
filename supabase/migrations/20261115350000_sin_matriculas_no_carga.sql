-- SIN MATRÍCULAS NO SE CARGA (usuario, 2026-11-15: «¿bloqueo que un envío pase a
-- cargando sin matrículas? Sí, bloquea»). El documento de control debe estar completo
-- ANTES de iniciar el transporte (Orden FOM/2861/2012; Resolución de 5-jun-2026, apdo.
-- primero.2): un envío de Dynamo no pasa de «yendo a la carga» mientras le falte la
-- matrícula del camión o, si es un conjunto articulado, la del semirremolque.
--   · El seguimiento automático se queda en «yendo a la carga» (no avanza por reloj) y
--     deja UN aviso urgente a Dynamo en la campana. En cuanto están las matrículas, la
--     siguiente pasada lo pone donde toque según su horario.
--   · A mano (marcar etapa, cambiar el estado) tampoco: mensaje claro.
--   · Los envíos manuales (operador propio del cliente) y la consola de Supabase, fuera.
--   · Lo que ya estuviera cargando o en ruta sin matrículas no se congela ni retrocede.

-- ---- 1. ¿Tiene el envío todas sus matrículas? ------------------------------------------
create or replace function envio_matriculas_completas(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select e.operador_id is not null
           or (e.matricula_camion is not null and (e.matricula_remolque is not null or not envio_necesita_remolque(e.id)))
      from envios e where e.id = p_envio), false)
$$;
revoke execute on function envio_matriculas_completas(uuid) from public, anon, authenticated;
comment on function public.envio_matriculas_completas(uuid) is '[Envíos] true si el envío tiene las matrículas que su documento de control necesita: la del camión y, si es un conjunto articulado (envio_necesita_remolque), también la del semirremolque. Los envíos manuales (operador propio del cliente) siempre dan true. Quién: funciones internas (seguimiento y marcar etapa). Argumentos: p_envio: envios.id.';

-- ---- 2. La tabla no deja pasar a cargando / en ruta / entregado sin ellas --------------
create or replace function fn_envios_af_estado_con_camion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado') and new.estado is distinct from old.estado
     and new.transportista_id is null and new.operador_id is null and not es_consola_supabase() then   -- operador_id: envío manual (es_manual aún no está calculado aquí)
    raise exception 'Asigna antes el transportista: sin camión el envío no puede ir hacia la carga.';
  end if;
  if new.estado in ('cargando', 'en_ruta', 'entregado') and new.estado is distinct from old.estado
     and new.operador_id is null and not es_consola_supabase()
     and (new.matricula_camion is null
          or (new.matricula_remolque is null and not coalesce(new.requiere_plataforma_elevadora, false)
              and coalesce((select v.tipo from vehiculos v where v.id = new.vehiculo_camion_id), 'tractora') <> 'rigido')) then
    raise exception 'Faltan las matrículas del camión (tractora y, si es un tráiler, también el semirremolque): sin ellas el envío no puede pasar a cargando.';
  end if;
  return new;
end $$;
revoke execute on function fn_envios_af_estado_con_camion() from public, anon, authenticated;
comment on function public.fn_envios_af_estado_con_camion() is '[Disparadores] Un envío de Dynamo no pasa de programado (hacia la carga, cargando, en ruta, entregado) sin transportista asignado, ni pasa a cargando, en ruta o entregado sin sus matrículas (la del camión y, en un conjunto articulado, la del semirremolque): el documento de control debe estar completo antes de iniciar el transporte. Quién: disparador de envios.';

-- ---- 3. El seguimiento automático espera en «yendo a la carga» y avisa a Dynamo --------
-- ---- 4. Marcar la etapa a mano responde con su motivo ('sin_matriculas') ---------------
-- Sobre la definición actual de cada función (pg_get_functiondef): si la línea esperada
-- no estuviera, la migración falla en vez de dejarla a medias.
do $$
declare v_def text; v_nueva text; r record;
begin
  for r in select * from (values
      ('public.seguimiento_aplicar(uuid,boolean)',
       '  select coalesce(max(s.paso), 0) into v_obj from seguimiento_calcular(p_envio) s where s.hora <= now();' || chr(10),
       '  select coalesce(max(s.paso), 0) into v_obj from seguimiento_calcular(p_envio) s where s.hora <= now();' || chr(10)
       || '  -- SIN MATRÍCULAS NO SE CARGA (2026-11-15): por reloj no pasa de «yendo a la carga»' || chr(10)
       || '  -- mientras falten; un aviso urgente a Dynamo, una sola vez por envío.' || chr(10)
       || '  if not p_a_mano and v_obj >= 2 and v_actual < 2 and not envio_matriculas_completas(p_envio) then' || chr(10)
       || '    v_obj := 1;' || chr(10)
       || '    if not exists (select 1 from avisos a where a.envio_id = p_envio and a.tipo = ''sin_matriculas_al_cargar'') then' || chr(10)
       || '      perform crear_aviso(''dynamo'', null, null, ''sin_matriculas_al_cargar'', ''urgente'',' || chr(10)
       || '        ''Faltan matrículas · '' || coalesce((select x.referencia_gx from envios x where x.id = p_envio), ''''),' || chr(10)
       || '        ''Ya es su hora de carga y no tiene las matrículas del camión (tractora y, si es tráiler, semirremolque): el seguimiento espera en «yendo a la carga» hasta que se pongan.'',' || chr(10)
       || '        ''/panel/envios?ver='' || p_envio, p_envio);' || chr(10)
       || '    end if;' || chr(10)
       || '  end if;' || chr(10)),
      ('public.marcar_etapa_envio(uuid,smallint,timestamptz)',
       '  if p_paso > 0 and e.transportista_id is null and e.operador_id is null then return jsonb_build_object(''ok'', false, ''resultado'', ''sin_transportista''); end if;' || chr(10),
       '  if p_paso > 0 and e.transportista_id is null and e.operador_id is null then return jsonb_build_object(''ok'', false, ''resultado'', ''sin_transportista''); end if;' || chr(10)
       || '  if p_paso >= 2 and not envio_matriculas_completas(p_envio) then return jsonb_build_object(''ok'', false, ''resultado'', ''sin_matriculas''); end if;' || chr(10))
    ) as x(fn, viejo, nuevo)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_nueva := replace(v_def, r.viejo, r.nuevo);
    if v_nueva = v_def then raise exception 'No encuentro la línea esperada en %: revisar antes de aplicar.', r.fn; end if;
    execute v_nueva;
  end loop;
end $$;
comment on function public.seguimiento_aplicar(uuid, boolean) is '[Envíos] Paso interno del seguimiento: pone el envío en la etapa que toca según su horario. Hacia delante etapa a etapa; hacia atrás solo si es a mano. Por reloj no pasa de «yendo a la carga» mientras falten las matrículas (envio_matriculas_completas) y deja un aviso urgente a Dynamo, una vez. Devuelve cuántos cambios hizo. Quién: interno.';
do $$ begin
  execute format('comment on function public.marcar_etapa_envio(uuid, smallint, timestamptz) is %L',
    replace(obj_description('public.marcar_etapa_envio(uuid, smallint, timestamptz)'::regprocedure), ' Quién:',
            ' Sin las matrículas del camión (y la del semirremolque en un tráiler) no deja marcar de «cargando» en adelante (resultado sin_matriculas). Quién:'));
end $$;
