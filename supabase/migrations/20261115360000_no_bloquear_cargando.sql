-- MARCHA ATRÁS: NO SE BLOQUEA EL PASO A «CARGANDO» SIN MATRÍCULAS (usuario, 2026-11-15:
-- «No, no bloquees, perdón»). Se deshace el bloqueo de 20261115350000: el seguimiento
-- vuelve a avanzar por reloj y a mano aunque falten las matrículas, y la tabla solo exige
-- transportista, como antes. Se conserva ÚNICAMENTE el aviso urgente a Dynamo (uno por
-- envío) cuando llega la hora de carga y faltan matrículas: informa, no detiene nada.
-- (La firma del CMR / DeCA sigue pidiéndolas — tractora y, en un tráiler, semirremolque.)

-- ---- 1. La tabla vuelve a exigir solo el transportista -----------------------------------
create or replace function fn_envios_af_estado_con_camion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado') and new.estado is distinct from old.estado
     and new.transportista_id is null and new.operador_id is null and not es_consola_supabase() then   -- operador_id: envío manual (es_manual aún no está calculado aquí)
    raise exception 'Asigna antes el transportista: sin camión el envío no puede ir hacia la carga.';
  end if;
  return new;
end $$;
revoke execute on function fn_envios_af_estado_con_camion() from public, anon, authenticated;
comment on function public.fn_envios_af_estado_con_camion() is '[Disparadores] Un envío de Dynamo no pasa de programado (hacia la carga, cargando, en ruta, entregado) sin transportista asignado. Quién: disparador de envios.';

-- ---- 2. El seguimiento ya no espera (solo avisa) y marcar etapa a mano ya no lo impide ----
do $$
declare v_def text; v_nueva text; r record;
begin
  for r in select * from (values
      ('public.seguimiento_aplicar(uuid,boolean)',
       '    v_obj := 1;' || chr(10), ''),
      ('public.seguimiento_aplicar(uuid,boolean)',
       '  -- SIN MATRÍCULAS NO SE CARGA (2026-11-15): por reloj no pasa de «yendo a la carga»' || chr(10)
       || '  -- mientras falten; un aviso urgente a Dynamo, una sola vez por envío.' || chr(10),
       '  -- Hora de carga y sin matrículas (2026-11-15): NO se detiene nada; solo un aviso' || chr(10)
       || '  -- urgente a Dynamo, una sola vez por envío.' || chr(10)),
      ('public.seguimiento_aplicar(uuid,boolean)',
       'el seguimiento espera en «yendo a la carga» hasta que se pongan.',
       'ponlas cuanto antes: el documento de control (DeCA) debe llevarlas.'),
      ('public.marcar_etapa_envio(uuid,smallint,timestamptz)',
       '  if p_paso >= 2 and not envio_matriculas_completas(p_envio) then return jsonb_build_object(''ok'', false, ''resultado'', ''sin_matriculas''); end if;' || chr(10), '')
    ) as x(fn, viejo, nuevo)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_nueva := replace(v_def, r.viejo, r.nuevo);
    if v_nueva = v_def then raise exception 'No encuentro la línea esperada en %: revisar antes de aplicar.', r.fn; end if;
    execute v_nueva;
  end loop;
  execute format('comment on function public.marcar_etapa_envio(uuid, smallint, timestamptz) is %L',
    replace(obj_description('public.marcar_etapa_envio(uuid, smallint, timestamptz)'::regprocedure),
            ' Sin las matrículas del camión (y la del semirremolque en un tráiler) no deja marcar de «cargando» en adelante (resultado sin_matriculas).', ''));
end $$;
comment on function public.seguimiento_aplicar(uuid, boolean) is '[Envíos] Paso interno del seguimiento: pone el envío en la etapa que toca según su horario. Hacia delante etapa a etapa; hacia atrás solo si es a mano. Si al llegar su hora de carga le faltan matrículas (envio_matriculas_completas) deja un aviso urgente a Dynamo, una vez, sin detener el avance. Devuelve cuántos cambios hizo. Quién: interno.';
comment on function public.envio_matriculas_completas(uuid) is '[Envíos] true si el envío tiene las matrículas que su documento de control necesita: la del camión y, si es un conjunto articulado (envio_necesita_remolque), también la del semirremolque. Los envíos manuales (operador propio del cliente) siempre dan true. Quién: el seguimiento (para avisar a Dynamo; no bloquea nada). Argumentos: p_envio: envios.id.';
