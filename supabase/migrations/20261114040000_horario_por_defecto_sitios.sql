-- =====================================================================================
-- HORARIO POR DEFECTO DE LOS SITIOS, CON VERANO ACTIVADO (usuario, 2026-11-14)
-- =====================================================================================
-- Todo sitio nace con horario general L-J 8:00-14:00 y 15:30-17:30 (antes 15:00) y
-- viernes 8:00-14:00, y ADEMÁS con el horario de verano ACTIVADO por defecto: del 1 de
-- junio al 15 de septiembre, L-V 7:00-15:00. Es un horario PROPUESTO: la ficha avisa de
-- que hay que confirmarlo con el sitio (responsabilidad del cliente). El parámetro del
-- aviso de verano pasa también al 1 de junio.

-- ---- 1. El horario que recibe todo sitio al nacer ------------------------------------
create or replace function public.poner_horario_por_defecto(p_sitio uuid)
returns void language sql security definer set search_path = public as $$
  insert into sitio_horarios (sitio_id, dia_semana, abre, cierra)
  select p_sitio, d, t.abre, t.cierra
    from generate_series(1, 4) d,
         (values (time '08:00', time '14:00'), (time '15:30', time '17:30')) t(abre, cierra)
  union all
  select p_sitio, 5, time '08:00', time '14:00'
  on conflict do nothing;
  insert into sitio_horarios (sitio_id, temporada, dia_semana, abre, cierra)
  select p_sitio, 'verano', d, time '07:00', time '15:00' from generate_series(1, 5) d
  on conflict do nothing;
  update sitios set verano_activo = true,
         verano_desde = coalesce(verano_desde, '06-01'),
         verano_hasta = coalesce(verano_hasta, '09-15')
   where id = p_sitio and not verano_activo;
$$;
revoke all on function public.poner_horario_por_defecto(p_sitio uuid) from public, anon, authenticated, service_role;
grant execute on function public.poner_horario_por_defecto(p_sitio uuid) to service_role;
comment on function public.poner_horario_por_defecto(p_sitio uuid) is '[Gestión interna] Horario por defecto de un sitio (decisión del usuario 2026-11-14): general L-J 8:00-14:00 y 15:30-17:30 y V 8:00-14:00, más el horario de VERANO activado (1 jun - 15 sep, L-V 7:00-15:00). Lo recibe todo sitio al nacer; la ficha lo cambia y avisa de que es un horario propuesto que hay que confirmar con el sitio. Quién: el disparador de alta de sitios. Argumentos: p_sitio: sitios.id.';

-- ---- 2. El aviso de verano se propone desde el 1 de junio ----------------------------
update parametros set valor = '"06-01"'::jsonb
 where clave = 'verano_sitios_desde' and valor = '"05-25"'::jsonb;

-- ---- 3. Insertar un tramo EXACTAMENTE igual a uno existente es un no-op --------------
-- Con el verano por defecto al nacer, quien re-inserta el mismo tramo (el cargador de
-- datos de prueba, una ficha que re-aplica su horario) chocaba con la regla de solapes.
-- Un duplicado exacto no es un solape: se ignora. Los solapes REALES (tramos distintos
-- que se pisan) siguen rechazándose igual.
create or replace function public.fn_sitio_horarios_duplicado_exacto()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from sitio_horarios h
              where h.sitio_id = new.sitio_id and h.temporada = new.temporada
                and h.dia_semana = new.dia_semana and h.abre = new.abre and h.cierra = new.cierra) then
    return null;
  end if;
  return new;
end $$;
comment on function public.fn_sitio_horarios_duplicado_exacto() is '[Gestión interna] Disparador de sitio_horarios: un INSERT de un tramo exactamente igual a uno ya guardado (mismo sitio, temporada, día y horas) se ignora en vez de chocar con la regla de solapes — re-aplicar un horario es idempotente. Los tramos distintos que se pisan se siguen rechazando. Quién: el disparador; nadie por la API. Argumentos: ninguno (NEW).';
-- El «0» del nombre es a propósito: los disparadores BEFORE corren en orden alfabético
-- y este debe ir ANTES que tg_sitio_horarios_sin_solapes (que es quien rechaza).
drop trigger if exists tg_sitio_horarios_0duplicado_exacto on sitio_horarios;
create trigger tg_sitio_horarios_0duplicado_exacto before insert on sitio_horarios
  for each row execute function fn_sitio_horarios_duplicado_exacto();
