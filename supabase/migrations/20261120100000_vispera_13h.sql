-- ---- «Mañana cargamos tu envío» a partir de las 13:00 (usuario, 2026-11-20) -------------------
-- Antes salía a partir de las 17:00 fijas; ahora la hora es un parámetro (13 por defecto).
insert into parametros (clave, valor, descripcion) values
  ('aviso_vispera_cliente_hora', '13', 'Hora (de Madrid) a partir de la cual sale la tarde anterior al día de carga el email «Mañana cargamos tu envío» al cliente.')
on conflict (clave) do nothing;

do $$ declare v text; n text; c text := obj_description('public.encolar_avisos_operativos'::regproc); begin
  v := pg_get_functiondef('public.encolar_avisos_operativos'::regproc);
  n := replace(v, $a$  if ahora >= time '17:00' then$a$,
    $a$  if ahora >= make_time(greatest(0, least(23, parametro_num('aviso_vispera_cliente_hora', 13)::int)), 0, 0) then$a$);
  if n <> v then execute n;
  elsif position('aviso_vispera_cliente_hora' in v) = 0 then raise exception 'encolar_avisos_operativos: no encuentro la hora de la víspera'; end if;
  if position('a partir de las 17:00' in coalesce(c, '')) > 0 then
    execute format('comment on function public.encolar_avisos_operativos(timestamptz) is %L',
      replace(c, 'a partir de las 17:00', 'a partir de la hora de aviso_vispera_cliente_hora (13:00)'));
  end if;
end $$;
