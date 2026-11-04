-- =====================================================================================
-- EL CLIENTE PUNTÚA AL TRANSPORTISTA DE SU ENVÍO (decisión del usuario, 2026-11-04)
-- =====================================================================================
-- Al entregarse un envío de Dynamo, el cliente le pone de 1 a 5 estrellas y, si quiere, un
-- comentario. Es aparte de la valoración interna de Dynamo (valoracion_transportista),
-- que el cliente no ve.
--
--   · Solo SUS envíos de Dynamo entregados con transportista (los manuales no: ahí el
--     transportista es suyo).
--   · Puede cambiarla durante 30 días desde que la puso; después queda fija.
--   · La nota es SUYA: ni Dynamo la cambia (un trigger lo impide fuera de esta función).
--   · La media por transportista (`valoracion_clientes`) es interna de Dynamo: el
--     transportista no la ve (mi_empresa_transportista no la devuelve).
-- =====================================================================================
alter table envios add column valoracion_cliente smallint check (valoracion_cliente between 1 and 5);
alter table envios add column valoracion_cliente_comentario text
  check (valoracion_cliente_comentario is null or length(valoracion_cliente_comentario) <= 500);
alter table envios add column valoracion_cliente_en timestamptz;
comment on column envios.valoracion_cliente is 'Nota del CLIENTE (1-5) al transportista de este envío. Solo la pone el cliente (valorar_mi_envio).';

alter table transportistas add column valoracion_clientes numeric(2,1) check (valoracion_clientes between 0 and 5);
alter table transportistas add column valoracion_clientes_votos integer not null default 0;
comment on column transportistas.valoracion_clientes is 'INTERNO: media de las notas de los clientes. El transportista no la ve.';

-- Nadie toca la nota del cliente salvo la función de abajo.
create or replace function fn_envios_valoracion_cliente()
returns trigger language plpgsql as $$
begin
  if (new.valoracion_cliente, new.valoracion_cliente_comentario, new.valoracion_cliente_en)
     is distinct from (old.valoracion_cliente, old.valoracion_cliente_comentario, old.valoracion_cliente_en)
     and coalesce(current_setting('dynamo.valorando', true), '') <> 'si' then
    raise exception 'La valoración del cliente solo la pone el cliente.';
  end if;
  return new;
end $$;
create trigger tg_envios_valoracion_cliente before update of valoracion_cliente, valoracion_cliente_comentario, valoracion_cliente_en
  on envios for each row execute function fn_envios_valoracion_cliente();

create or replace function valorar_mi_envio(p_envio uuid, p_nota smallint, p_comentario text)
returns void language plpgsql security definer set search_path = public as $$
declare v_cli uuid := cliente_del_usuario(); e record;
begin
  if v_cli is null then raise exception 'Solo el cliente del envío lo puede valorar.'; end if;
  select id, estado, es_manual, transportista_id, valoracion_cliente_en into e
    from envios where id = p_envio and cliente_id = v_cli;
  if not found then raise exception 'Ese envío no es tuyo.'; end if;
  if e.es_manual then raise exception 'Los envíos con tu propio transportista no se valoran aquí.'; end if;
  if e.estado <> 'entregado' or e.transportista_id is null then raise exception 'Podrás valorarlo cuando esté entregado.'; end if;
  if p_nota is null or p_nota not between 1 and 5 then raise exception 'Elige de 1 a 5 estrellas.'; end if;
  if e.valoracion_cliente_en is not null and e.valoracion_cliente_en < now() - interval '30 days' then
    raise exception 'La valoración ya no se puede cambiar (han pasado más de 30 días).';
  end if;
  perform set_config('dynamo.valorando', 'si', true);
  update envios set valoracion_cliente = p_nota,
                    valoracion_cliente_comentario = nullif(trim(left(coalesce(p_comentario, ''), 500)), ''),
                    valoracion_cliente_en = coalesce(valoracion_cliente_en, now())
   where id = p_envio;
  perform set_config('dynamo.valorando', '', true);
  update transportistas t set
    valoracion_clientes = (select round(avg(valoracion_cliente)::numeric, 1) from envios where transportista_id = t.id and valoracion_cliente is not null),
    valoracion_clientes_votos = (select count(*) from envios where transportista_id = t.id and valoracion_cliente is not null)
   where t.id = e.transportista_id;
end $$;
revoke execute on function valorar_mi_envio(uuid, smallint, text) from public, anon;
grant execute on function valorar_mi_envio(uuid, smallint, text) to authenticated;

-- Lo que la ficha del cliente necesita: si puede valorar y lo que ya puso.
create or replace function mi_valoracion_envio(p_envio uuid)
returns table (puede boolean, nota smallint, comentario text, valorado_en timestamptz, editable boolean)
language sql stable security definer set search_path = public as $$
  select (e.estado = 'entregado' and not e.es_manual and e.transportista_id is not null),
         e.valoracion_cliente, e.valoracion_cliente_comentario, e.valoracion_cliente_en,
         (e.valoracion_cliente_en is null or e.valoracion_cliente_en >= now() - interval '30 days')
    from envios e where e.id = p_envio and e.cliente_id = cliente_del_usuario()
$$;
revoke execute on function mi_valoracion_envio(uuid) from public, anon;
grant execute on function mi_valoracion_envio(uuid) to authenticated;
