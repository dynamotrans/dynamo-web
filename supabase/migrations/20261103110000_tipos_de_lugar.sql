-- =====================================================================================
-- TIPOS DE LUGAR NUEVOS (decisión del usuario, 2026-11-03)
-- =====================================================================================
--   Antes                    Ahora                                     Recargo (provisional)
--   almacen_nave             almacen_nave      Almacén / Nave / Campa                 0 %
--   obra                     obra_zona_amplia  Obra · acceso en zona amplia            5 %
--   zona_urbana              obra_zona_urbana  Obra · acceso en zona urbana           20 %
--   evento                   — FUERA (los que hubiera pasan a obra_zona_urbana)
--   finca                    finca             Finca / zona agrícola o rústica        25 %
--
-- Postgres no deja quitar un valor de un tipo enumerado, así que se crea el tipo de
-- nuevo y se pasan las columnas. Así no queda "evento" escondido en la base de datos.
-- =====================================================================================

alter type tipo_lugar rename to tipo_lugar_viejo;
create type tipo_lugar as enum ('almacen_nave', 'obra_zona_amplia', 'obra_zona_urbana', 'finca');
comment on type tipo_lugar is
  'Tipo de punto de carga/descarga: almacen_nave (Almacén / Nave / Campa), '
  'obra_zona_amplia, obra_zona_urbana y finca (zona agrícola o rústica). De aquí cuelga el '
  'recargo del tarifador: ver recargos_tipo_lugar.';

create function tipo_lugar_nuevo(v tipo_lugar_viejo) returns tipo_lugar
language sql immutable as $$
  select (case v::text
            when 'obra'        then 'obra_zona_amplia'
            when 'zona_urbana' then 'obra_zona_urbana'
            when 'evento'      then 'obra_zona_urbana'
            else v::text end)::tipo_lugar
$$;

-- Recargos: el de "evento" se va; el resto cambia de nombre con su porcentaje.
delete from recargos_tipo_lugar where tipo = 'evento';
alter table recargos_tipo_lugar alter column tipo type tipo_lugar using tipo_lugar_nuevo(tipo);

alter table lugares alter column tipo drop default;
alter table lugares alter column tipo type tipo_lugar using tipo_lugar_nuevo(tipo);
alter table lugares alter column tipo set default 'almacen_nave';

drop function tipo_lugar_nuevo(tipo_lugar_viejo);
drop type tipo_lugar_viejo;
