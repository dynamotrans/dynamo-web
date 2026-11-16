-- =====================================================================================
-- LA OFERTA ESCALONADA SIGUE HASTA EL CIERRE DEL SITIO DE CARGA (usuario, 2026-11-16)
-- =====================================================================================
-- «Envía hasta la hora de cierre de almacén del sitio de carga primero. No hasta la hora
-- de apertura.» Hasta hoy, si Dynamo no indicaba hora, la oferta tomaba como referencia
-- las 8:00 del día de carga: los emails se acababan a la hora de ABRIR, cuando todavía
-- quedaba todo el día para cargar.
--
-- Desde hoy la hora límite es la de CIERRE del primer sitio de carga ese día (su último
-- tramo, con su horario de verano si toca). De ella salen el ritmo de los emails («últimas
-- 3 horas», «últimas 6 horas»…) y su final. Si Dynamo indica una hora al lanzar, manda
-- esa; si el sitio no tiene horario ese día, se usa la hora por defecto (parámetro, que
-- pasa de 8 a 18).

-- ---- 1. La hora que indicó Dynamo (para respetarla si después se mueve la fecha) -------
alter table difusiones add column hora_manual time;
comment on column difusiones.hora_manual is 'formato: hora (HH:MM) | rango: 00:00 a 23:59 | lista: no aplica | opcional | Hora límite que indicó Dynamo al lanzar la oferta escalonada. Vacío = se usa el cierre del primer sitio de carga ese día. Ej. OK: 14:00';

-- ---- 2. La hora por defecto, cuando el sitio no tiene horario --------------------------
update parametros set valor = '18'::jsonb,
  descripcion = 'Oferta escalonada: hora española (0-23) que se toma como hora límite cuando Dynamo no indica ninguna y el primer sitio de carga no tiene horario ese día. Lo normal es que mande el cierre del sitio.'
 where clave = 'difusion_hora_carga_defecto';

-- ---- 3. Hora límite de un envío en una fecha -------------------------------------------
create or replace function fn_difusion_hora_limite(p_envio uuid, p_fecha date)
returns time language sql stable security definer set search_path = public as $$
  select coalesce(
    (select max(h.cierra)
       from (select sitio_id from envio_paradas where envio_id = p_envio and tipo = 'carga' order by orden limit 1) p,
            lateral horario_del_dia(p.sitio_id, p_fecha) h),
    make_time(least(23, greatest(0, coalesce((parametro('difusion_hora_carga_defecto'))::text::int, 18))), 0, 0));
$$;
revoke execute on function fn_difusion_hora_limite(uuid, date) from public, anon, authenticated;
comment on function public.fn_difusion_hora_limite(uuid, date) is '[Gestión interna] Hora límite de la oferta escalonada de un envío en una fecha: la de cierre del primer sitio de carga ese día (su último tramo, con horario de verano si toca); si no tiene horario ese día, la hora por defecto (parámetro difusion_hora_carga_defecto). Quién: interno (lanzar y recolocar la oferta). Argumentos: p_envio: envios.id · p_fecha: día de carga.';

-- ---- 4. Lanzar y recolocar la oferta usan esa hora -------------------------------------
do $$
declare v_oid oid; v_def text; v_nueva text;
begin
  -- Lanzar.
  v_oid := 'public.iniciar_difusion(uuid, numeric, smallint, boolean, time, boolean)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_nueva := replace(v_def, 'coalesce(p_hora_carga, make_time(v_hdef, 0, 0))', 'coalesce(p_hora_carga, fn_difusion_hora_limite(p_envio, e.fecha_carga_desde))');
  if v_nueva = v_def then raise exception 'No encuentro la hora de carga en iniciar_difusion: revisar antes de aplicar.'; end if;
  v_def := v_nueva;
  v_nueva := replace(v_def, 'empieza_en, carga_prevista_en, corte_en, creado_por)', 'empieza_en, carga_prevista_en, corte_en, creado_por, hora_manual)');
  if v_nueva = v_def then raise exception 'No encuentro las columnas del alta en iniciar_difusion: revisar antes de aplicar.'; end if;
  v_def := v_nueva;
  v_nueva := replace(v_def, 'v_empieza, v_carga, v_corte, auth.uid())', 'v_empieza, v_carga, v_corte, auth.uid(), p_hora_carga)');
  if v_nueva = v_def then raise exception 'No encuentro los valores del alta en iniciar_difusion: revisar antes de aplicar.'; end if;
  execute v_nueva;
  execute format('comment on function public.iniciar_difusion(uuid, numeric, smallint, boolean, time, boolean) is %L',
    obj_description(v_oid, 'pg_proc') || ' Sin hora indicada, la referencia es el cierre del primer sitio de carga ese día (fn_difusion_hora_limite), no la apertura.');

  -- Recolocar al mover la fecha.
  v_oid := 'public.fn_difusion_sigue_fecha()'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_nueva := replace(v_def,
    'coalesce((d.carga_prevista_en at time zone ''Europe/Madrid'')::time, make_time(v_hdef, 0, 0))',
    'coalesce(d.hora_manual, fn_difusion_hora_limite(new.id, new.fecha_carga_desde))');
  if v_nueva = v_def then raise exception 'No encuentro la hora en fn_difusion_sigue_fecha: revisar antes de aplicar.'; end if;
  execute v_nueva;

  -- El aviso de cierre ya no es «queda poco»: es que se acabó el plazo.
  v_oid := 'public.fn_difusion_paso(uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_nueva := replace(v_def, 'Queda poco para la carga y nadie la ha aceptado · envío #%s', 'Se acabó el plazo de la oferta y nadie la ha aceptado · envío #%s');
  if v_nueva = v_def then raise exception 'No encuentro el aviso de cierre en fn_difusion_paso: revisar antes de aplicar.'; end if;
  execute v_nueva;
end $$;

-- ---- 5. Las ofertas ya en marcha que iban con la hora antigua por defecto (8:00) -------
with nueva as (
  select d.id, d.envio_id,
         (e.fecha_carga_desde + fn_difusion_hora_limite(e.id, e.fecha_carga_desde)) at time zone 'Europe/Madrid' as limite
    from difusiones d join envios e on e.id = d.envio_id
   where d.estado = 'activa' and e.fecha_carga_desde is not null and d.hora_manual is null
     and (d.carga_prevista_en at time zone 'Europe/Madrid')::time = time '08:00'
), puesta as (
  update difusiones d set carga_prevista_en = n.limite,
         corte_en = n.limite - make_interval(hours => greatest(0, coalesce((parametro('difusion_horas_corte'))::text::int, 0)))
    from nueva n where n.id = d.id and n.limite > d.carga_prevista_en
  returning d.envio_id, d.corte_en
)
update envio_ofertas o set caduca_en = greatest(o.caduca_en, p.corte_en)
  from puesta p where o.envio_id = p.envio_id and o.canal = 'email' and o.estado = 'activa';
