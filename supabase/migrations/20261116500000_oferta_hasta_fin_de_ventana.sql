-- =====================================================================================
-- CON VENTANA DE CARGA, LA OFERTA SIGUE HASTA EL ÚLTIMO DÍA (usuario, 2026-11-16)
-- =====================================================================================
-- «Si hay franja de carga de 3 días, de lunes a miércoles, el envío de mails sigue hasta
-- el último día, hora de cierre.» La hora límite de la oferta escalonada tomaba siempre
-- el PRIMER día de carga. Desde hoy:
--
--   · Con ventana (fecha desde – hasta), el límite es el cierre del primer sitio de carga
--     el ÚLTIMO día de la ventana en que ese sitio abre. Si no abre ningún día de la
--     ventana, el último día a la hora por defecto.
--   · Sin ventana, como estaba: el cierre de ese día.
--   · Si Dynamo indica una hora al lanzar, es esa hora del último día de la ventana.
--   · El ARRANQUE no cambia: los emails empiezan 3 días antes del PRIMER día, y la bolsa
--     12 días antes del primero.
--   · Si después se cambia solo el final de la ventana, la oferta también se recoloca.

create or replace function fn_difusion_limite(p_envio uuid, p_desde date, p_hasta date, p_hora_manual time)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare v_fin date; v_d date; v_h time; v_sitio uuid;
begin
  if p_desde is null then return null; end if;
  v_fin := least(greatest(coalesce(p_hasta, p_desde), p_desde), p_desde + 31);
  if p_hora_manual is not null then return (v_fin + p_hora_manual) at time zone 'Europe/Madrid'; end if;
  select sitio_id into v_sitio from envio_paradas where envio_id = p_envio and tipo = 'carga' order by orden limit 1;
  if v_sitio is not null then
    v_d := v_fin;
    while v_d >= p_desde loop
      select max(h.cierra) into v_h from horario_del_dia(v_sitio, v_d) h;
      if v_h is not null then return (v_d + v_h) at time zone 'Europe/Madrid'; end if;
      v_d := v_d - 1;
    end loop;
  end if;
  return (v_fin + make_time(least(23, greatest(0, coalesce((parametro('difusion_hora_carga_defecto'))::text::int, 18))), 0, 0)) at time zone 'Europe/Madrid';
end $$;
revoke execute on function fn_difusion_limite(uuid, date, date, time) from public, anon, authenticated;
comment on function public.fn_difusion_limite(uuid, date, date, time) is '[Gestión interna] Momento hasta el que sigue la oferta escalonada de un envío: el cierre del primer sitio de carga el último día de la ventana de carga en que abre (sin ventana, ese día); si Dynamo indicó una hora, esa hora del último día; si el sitio no abre ningún día de la ventana, el último día a la hora por defecto (difusion_hora_carga_defecto). Quién: interno (lanzar y recolocar la oferta). Argumentos: p_envio: envios.id · p_desde: primer día de carga · p_hasta: último día de la ventana (o vacío) · p_hora_manual: hora indicada por Dynamo (o vacío).';

do $$
declare v_oid oid; v_def text; v_nueva text;
begin
  v_oid := 'public.iniciar_difusion(uuid, numeric, smallint, boolean, time, boolean)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_nueva := replace(v_def,
    '(e.fecha_carga_desde + coalesce(p_hora_carga, fn_difusion_hora_limite(p_envio, e.fecha_carga_desde))) at time zone ''Europe/Madrid''',
    'fn_difusion_limite(p_envio, e.fecha_carga_desde, (select x.fecha_carga_hasta from envios x where x.id = p_envio), p_hora_carga)');
  if v_nueva = v_def then raise exception 'No encuentro la hora límite en iniciar_difusion: revisar antes de aplicar.'; end if;
  execute v_nueva;
  execute format('comment on function public.iniciar_difusion(uuid, numeric, smallint, boolean, time, boolean) is %L',
    obj_description(v_oid, 'pg_proc') || ' Con ventana de carga, la oferta sigue hasta el cierre del último día de la ventana (fn_difusion_limite).');

  v_oid := 'public.fn_difusion_sigue_fecha()'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_nueva := replace(v_def,
    '(new.fecha_carga_desde + v_hora) at time zone ''Europe/Madrid''',
    'fn_difusion_limite(new.id, new.fecha_carga_desde, new.fecha_carga_hasta, d.hora_manual)');
  if v_nueva = v_def then raise exception 'No encuentro la hora límite en fn_difusion_sigue_fecha: revisar antes de aplicar.'; end if;
  execute v_nueva;
end $$;

-- La oferta se recoloca también si solo cambia el final de la ventana.
drop trigger if exists tg_envios_difusion_fecha on envios;
create trigger tg_envios_difusion_fecha after update of fecha_carga_desde, fecha_carga_hasta on envios
  for each row when (old.fecha_carga_desde is distinct from new.fecha_carga_desde
                     or old.fecha_carga_hasta is distinct from new.fecha_carga_hasta)
  execute function fn_difusion_sigue_fecha();

-- Las ofertas ya en marcha de envíos con ventana: su límite pasa al último día.
with nueva as (
  select d.id, d.envio_id, fn_difusion_limite(e.id, e.fecha_carga_desde, e.fecha_carga_hasta, d.hora_manual) as limite
    from difusiones d join envios e on e.id = d.envio_id
   where d.estado = 'activa' and e.fecha_carga_desde is not null
     and e.fecha_carga_hasta is not null and e.fecha_carga_hasta > e.fecha_carga_desde
), puesta as (
  update difusiones d set carga_prevista_en = n.limite,
         corte_en = n.limite - make_interval(hours => greatest(0, coalesce((parametro('difusion_horas_corte'))::text::int, 0)))
    from nueva n where n.id = d.id and n.limite > d.carga_prevista_en
  returning d.envio_id, d.corte_en
)
update envio_ofertas o set caduca_en = greatest(o.caduca_en, p.corte_en)
  from puesta p where o.envio_id = p.envio_id and o.canal = 'email' and o.estado = 'activa';
