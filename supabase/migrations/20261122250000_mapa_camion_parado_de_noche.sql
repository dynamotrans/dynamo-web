-- MAPA: DE NOCHE EL CAMIÓN SALE PARADO, NO «EN RUTA» (usuario, 2026-11-22, captura a las
-- 23:39 con camiones en azul «en ruta»). Dos fallos de la posición estimada (mapa_envio):
--   1. La jornada del conductor se contaba desde que salía de la carga y no desde su hora de
--      empezar (las 7:00, seguimiento_hora_inicio_jornada), como hace el plan del seguimiento:
--      saliendo a media tarde le dejaba conducir de madrugada. Ahora, igual que el plan: la
--      jornada empezó a las 7:00 del día de la salida (máx. 13 h, hasta las 20:00; 9 h de
--      conducción), luego descanso de 11 h y no arranca antes de las 7:00.
--   2. Con todas las horas de conducción del tramo hechas pero la llegada prevista aún por
--      llegar (espera a que abra el sitio por la mañana), salía «en ruta» al 100 %. Ahora,
--      parado esperando.
-- Además dice POR QUÉ está parado (pausa de 45 min, descanso del conductor o espera para
-- llegar) y a qué hora sigue.
do $$
declare
  def text := pg_get_functiondef('public.mapa_envio(uuid)'::regprocedure);
  cambios text[][] := array[
    array['v_t timestamptz;', 'v_t timestamptz; v_motivo text; v_sigue timestamptz; v_jor0 timestamptz;', '1'],
    array['      lo := 0; hi := v_horas;',
          E'      -- La jornada empezó a su hora (las 7:00) del día de la salida, como en el plan; y si\n      -- la salida quedó apuntada de madrugada, no arranca antes de esa hora.\n      v_jor0 := ((v_ini at time zone ''Europe/Madrid'')::date + v_inicio) at time zone ''Europe/Madrid'';\n      lo := 0; hi := v_horas;', '1'],
    array['seguimiento_conducir(v_ini, v_ini, 0, 0,', 'seguimiento_conducir(greatest(v_ini, v_jor0), v_jor0, 0, 0,', '2'],
    array['        v_parado := v_t > now() + interval ''5 minutes'';   -- la siguiente conducción empieza más tarde: pausa o descanso
      end if;',
          '        v_parado := v_t > now() + interval ''5 minutes'';   -- la siguiente conducción empieza más tarde: pausa o descanso
        if v_parado then
          v_motivo := case when v_t > now() + interval ''3 hours'' then ''descanso'' else ''pausa'' end; v_sigue := v_t;
        end if;
      elsif v_fin is not null and now() < v_fin then
        -- Ya ha conducido todo el tramo, pero llega más tarde (espera a que abra el sitio).
        v_parado := true; v_motivo := ''espera''; v_sigue := v_fin;
      end if;', '1'],
    array['''parado'', v_parado,', '''parado'', v_parado, ''motivo_parada'', v_motivo, ''sigue_en'', v_sigue,', '1']];
  i int; n int;
begin
  for i in 1..array_length(cambios, 1) loop
    n := (length(def) - length(replace(def, cambios[i][1], ''))) / length(cambios[i][1]);
    if n <> cambios[i][3]::int then raise exception 'mapa_camion_parado_de_noche: la aguja % aparece % veces', i, n; end if;
    def := replace(def, cambios[i][1], cambios[i][2]);
  end loop;
  execute def;
end $$;
