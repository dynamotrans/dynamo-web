-- SECTOR DEL CLIENTE (usuario, 2026-11-06): «en la ficha del cliente, "Sector", opcional,
-- por defecto "Sin definir"; 10 sectores que sean editables cuando fijemos cuáles son».
--  · clientes.sector: texto libre acotado a la lista del parámetro sectores_cliente (o vacío
--    = Sin definir). La lista se cambia en Parámetros (un sector que se quita de la lista no
--    borra a los clientes que ya lo tienen: siguen viéndolo, y se puede volver a elegir uno).
--  · El cuadro de mando lo usa para repartir la facturación por sector.
alter table clientes add column if not exists sector text;
comment on column clientes.sector is 'formato: texto | rango: no aplica | lista: la del parámetro sectores_cliente | opcional | Sector de actividad del cliente (vacío = Sin definir). Se elige en su ficha de la lista editable en Parámetros. Ej. OK: Alimentación y bebidas';

insert into parametros (clave, valor, descripcion) values
  ('sectores_cliente', '["Alimentación y bebidas", "Construcción y materiales", "Agricultura y fertilizantes", "Industria y metal", "Química y plásticos", "Papel, cartón y embalaje", "Textil y calzado", "Muebles y madera", "Automoción y recambios", "Distribución y retail"]',
   'Sectores que se pueden elegir en la ficha del cliente, separados por comas. Se pueden cambiar; los clientes que tengan uno que ya no esté lo conservan.')
on conflict (clave) do nothing;

-- Al guardar un cliente, el sector tiene que estar en la lista (o vacío).
create or replace function fn_clientes_sector()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.sector := nullif(trim(coalesce(new.sector, '')), '');
  if new.sector is not null and (tg_op = 'INSERT' or new.sector is distinct from old.sector)
     and not exists (select 1 from jsonb_array_elements_text(parametro('sectores_cliente')) s where s = new.sector) then
    raise exception 'Ese sector no está en la lista de Parámetros (sectores_cliente).';
  end if;
  return new;
end $$;
drop trigger if exists tg_clientes_sector on clientes;
create trigger tg_clientes_sector before insert or update of sector on clientes for each row execute function fn_clientes_sector();
comment on function public.fn_clientes_sector() is '[Clientes] Disparador: el sector del cliente tiene que estar en la lista del parámetro sectores_cliente (o vacío = Sin definir).';

-- Cuadro de mando: la facturación del periodo por sector del cliente.
create or replace function cuadro_mando_sectores(p_desde date, p_hasta date)
returns table (sector text, clientes int, realizados int, facturacion numeric, margen numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(k.sector, 'Sin definir'), count(distinct e.cliente_id)::int, count(*)::int,
         coalesce(sum(coalesce(e.importe_cliente, 0)), 0), coalesce(sum(coalesce(e.importe_cliente, 0) - coalesce(e.importe_transportista, e.importe_cliente, 0)), 0)
    from envios e join clientes k on k.id = e.cliente_id
   where ve_todo() and not coalesce(e.es_manual, false)
     and e.estado in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado')
     and coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde, (e.creado_en at time zone 'Europe/Madrid')::date) between least(p_desde, p_hasta) and greatest(p_desde, p_hasta)
   group by 1 order by 4 desc
$$;
revoke execute on function cuadro_mando_sectores(date, date) from public, anon;
grant execute on function cuadro_mando_sectores(date, date) to authenticated, service_role;
comment on function public.cuadro_mando_sectores(date, date) is '[Avisos y panel] Cuadro de mando: envíos realizados, facturación y margen del periodo por sector del cliente («Sin definir» si no tiene). Quién: Dynamo (también solo lectura). Argumentos: p_desde, p_hasta: periodo.';
