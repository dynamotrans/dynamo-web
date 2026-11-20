-- =====================================================================================
-- FLOTA DEL TRANSPORTISTA SIN FECHAS DE ITV, SEGURO NI TARJETA
-- =====================================================================================
-- Usuario, 2026-11-20: «ni vamos a controlar nada de documentación de transportistas. Son
-- externos, es cosa suya… quita todo eso». Los camiones se quedan con matrícula, tipo, ADR y
-- plataforma elevadora; fuera las fechas de vencimiento (columnas y formulario).

-- 1. Los datos de prueba dejan de rellenarlas.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.cargar_datos_de_prueba(text, numeric, text, jsonb)'::regprocedure);
  n := replace(v, 'insert into vehiculos (id, transportista_id, matricula, tipo, itv_vence, seguro_vence, tarjeta_transporte_vence, adr, tiene_plataforma_elevadora, activo, creado_en)',
                  'insert into vehiculos (id, transportista_id, matricula, tipo, adr, tiene_plataforma_elevadora, activo, creado_en)');
  n := regexp_replace(n, '\n\s*case when r3 < \.9 then v_hoy \+ \(floor\(r1 \* 420\) - 40\)::int end,'
                         '\n\s*case when r3 < \.8 then v_hoy \+ \(floor\(r2 \* 380\) - 20\)::int end,'
                         '\n\s*case when r3 < \.6 and tipo <> ''remolque'' then v_hoy \+ \(floor\(r3 \* 900\) - 30\)::int end,', '');
  if n <> v then
    if position('itv_vence' in n) > 0 then raise exception 'cargar_datos_de_prueba: no he podido quitar las fechas de los camiones'; end if;
    execute n;
  elsif position('itv_vence' in v) > 0 then
    raise exception 'cargar_datos_de_prueba: no encuentro el alta de camiones';
  end if;
end $$;

-- 2. El transportista guarda su camión sin fechas.
drop function if exists public.guardar_mi_vehiculo(uuid, text, tipo_vehiculo, date, date, date, boolean, boolean);
create or replace function public.guardar_mi_vehiculo(p_id uuid, p_matricula text, p_tipo tipo_vehiculo, p_adr boolean, p_plataforma_elevadora boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_t uuid := transportista_del_usuario(); v_id uuid;
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar su flota.' using errcode = '42501'; end if;
  if p_id is null then
    if exists (select 1 from vehiculos where activo and normalizar_matricula(matricula) = normalizar_matricula(p_matricula)) then
      raise exception 'No se ha podido dar de alta esa matrícula. Si es tuya, escríbenos y lo revisamos.';
    end if;
    insert into vehiculos (transportista_id, matricula, tipo, adr, tiene_plataforma_elevadora)
    values (v_t, upper(trim(p_matricula)), p_tipo, coalesce(p_adr, false), coalesce(p_plataforma_elevadora, false))
    returning id into v_id;
  else
    -- Corregir la matrícula (p. ej. una errata), si no la tiene otro vehículo. Los envíos
    -- ya hechos conservan la matrícula con la que cargaron.
    if nullif(trim(p_matricula), '') is not null
       and exists (select 1 from vehiculos where activo and id <> p_id and normalizar_matricula(matricula) = normalizar_matricula(p_matricula)) then
      raise exception 'Esa matrícula ya está dada de alta. Si es tuya, escríbenos y lo revisamos.';
    end if;
    update vehiculos set matricula = coalesce(nullif(upper(trim(p_matricula)), ''), matricula),
                         tipo = p_tipo, adr = coalesce(p_adr, false), tiene_plataforma_elevadora = coalesce(p_plataforma_elevadora, false)
     where id = p_id and transportista_id = v_t and activo
    returning id into v_id;
    if v_id is null then raise exception 'Ese camión no es de tu flota.' using errcode = '42501'; end if;
  end if;
  return v_id;
end $$;
revoke execute on function public.guardar_mi_vehiculo(uuid, text, tipo_vehiculo, boolean, boolean) from public, anon;
grant execute on function public.guardar_mi_vehiculo(uuid, text, tipo_vehiculo, boolean, boolean) to authenticated;
comment on function public.guardar_mi_vehiculo(uuid, text, tipo_vehiculo, boolean, boolean) is '[Ofertas y transportistas] El transportista da de alta (sin id) o edita (con id) un camión de su flota: matrícula, tipo, ADR y plataforma elevadora (su documentación es cosa suya: no se anota). La matrícula no puede estar ya activa en otra flota. Devuelve el id del vehículo. Quién: transportista (cuenta activa). Argumentos: p_id: vehiculos.id (null = nuevo) · p_matricula · p_tipo · p_adr: apto mercancías peligrosas · p_plataforma_elevadora: tiene plataforma elevadora.';

-- 3. Fuera las columnas.
alter table vehiculos
  drop column if exists itv_vence,
  drop column if exists seguro_vence,
  drop column if exists tarjeta_transporte_vence;
