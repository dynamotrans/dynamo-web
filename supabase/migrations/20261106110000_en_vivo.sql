-- PLATAFORMA EN VIVO (usuario, 2026-11-06): «si entra un envío nuevo o cambia algo, que se
-- mueva en pantalla sin refrescar».
--
-- Cómo: cada cambio en las tablas que se ven en el panel manda una SEÑAL por Supabase
-- Realtime (canal privado, «Broadcast desde la base de datos») a quien le toca:
--   · «dynamo»               → el equipo de Dynamo (todo).
--   · «cliente:<id>»         → los usuarios de ese cliente.
--   · «transportista:<id>»   → los usuarios de ese transportista.
-- La señal NO lleva datos: solo el nombre de la tabla ({"t": "envios"}). Al recibirla, la
-- pantalla vuelve a pedir sus datos por el camino de siempre, con sus permisos (RLS). Así
-- nada que no puedas ver viaja por el canal, aunque alguien escuche donde no debe.
-- Quién escucha cada canal lo decide la política de realtime.messages (abajo).
--
-- Una señal por SENTENCIA, no por fila (un barrido que toca 500 envíos manda una sola por
-- destinatario), y nunca bloquea un cambio: si Realtime falla, el cambio se guarda igual.

create or replace function fn_senal_en_vivo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_modo text := coalesce(tg_argv[0], 'propio');
  v_filas jsonb[] := '{}';
  v_cli uuid[]; v_tra uuid[]; v_id uuid; v_carga jsonb := jsonb_build_object('t', tg_table_name);
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return null; end if;
  begin
    if tg_op in ('INSERT', 'UPDATE') then select v_filas || coalesce(array_agg(to_jsonb(n)), '{}') into v_filas from nuevas n; end if;
    if tg_op in ('UPDATE', 'DELETE') then select v_filas || coalesce(array_agg(to_jsonb(o)), '{}') into v_filas from viejas o; end if;

    if v_modo = 'empresa_cliente' then
      select array_agg(distinct (f ->> 'id')::uuid) into v_cli from unnest(v_filas) f;
    elsif v_modo = 'empresa_transportista' then
      select array_agg(distinct (f ->> 'id')::uuid) into v_tra from unnest(v_filas) f;
    else
      -- Los de la propia fila y, si cuelga de un envío, los de ese envío.
      with ids as (
        select (f ->> 'cliente_id')::uuid c, (f ->> 'transportista_id')::uuid t from unnest(v_filas) f
        union all
        select e.cliente_id, e.transportista_id from unnest(v_filas) f
          join envios e on e.id = (f ->> 'envio_id')::uuid
         where v_modo = 'envio'
      )
      select array_agg(distinct c) filter (where c is not null), array_agg(distinct t) filter (where t is not null)
        into v_cli, v_tra from ids;
    end if;

    -- Los avisos para Dynamo no van a nadie más (la campana de cada uno es suya).
    perform realtime.send(v_carga, 'cambio', 'dynamo', true);
    foreach v_id in array coalesce(v_cli, '{}') loop perform realtime.send(v_carga, 'cambio', 'cliente:' || v_id, true); end loop;
    foreach v_id in array coalesce(v_tra, '{}') loop perform realtime.send(v_carga, 'cambio', 'transportista:' || v_id, true); end loop;
  exception when others then
    raise warning 'en vivo: no se ha mandado la señal de % (%): %', tg_table_name, tg_op, sqlerrm;
  end;
  return null;
end $$;
comment on function fn_senal_en_vivo() is
  'Plataforma en vivo: por cada sentencia que cambia una tabla del panel, manda por Realtime una señal sin datos ({"t": tabla}) a «dynamo», «cliente:<id>» y «transportista:<id>» según la fila. Argumento: propio (columnas cliente_id/transportista_id), envio (además los del envío de envio_id), empresa_cliente / empresa_transportista (la fila es la empresa). Nunca bloquea el cambio.';
revoke all on function fn_senal_en_vivo() from public, anon, authenticated;

-- Tres disparadores por tabla (alta, cambio, borrado): las «tablas de transición» con las
-- filas tocadas solo se pueden declarar con un evento por disparador.
do $$
declare r record; v_t text;
begin
  perform set_config('client_min_messages', 'warning', true);
  for r in select * from (values
      ('envios', 'propio'), ('envio_paradas', 'envio'), ('envio_hitos', 'envio'), ('envio_ofertas', 'envio'),
      ('envio_reservas', 'envio'), ('documentos', 'envio'), ('firmas_cmr', 'envio'), ('penalizaciones', 'envio'),
      ('incidencias', 'envio'), ('avisos', 'propio'), ('almacenamientos', 'propio'), ('usuarios', 'propio'),
      ('sitios', 'propio'), ('contactos', 'propio'), ('vehiculos', 'propio'), ('conductores', 'propio'),
      ('operadores', 'propio'), ('clientes', 'empresa_cliente'), ('transportistas', 'empresa_transportista')
    ) as t(tabla, modo)
  loop
    if to_regclass('public.' || r.tabla) is null then raise exception 'en vivo: falta la tabla %', r.tabla; end if;
    foreach v_t in array array['alta', 'cambio', 'borrado'] loop
      execute format('drop trigger if exists %I on %I', 'tg_zz_en_vivo_' || v_t, r.tabla);
    end loop;
    execute format('create trigger tg_zz_en_vivo_alta after insert on %I referencing new table as nuevas for each statement execute function fn_senal_en_vivo(%L)', r.tabla, r.modo);
    execute format('create trigger tg_zz_en_vivo_cambio after update on %I referencing old table as viejas new table as nuevas for each statement execute function fn_senal_en_vivo(%L)', r.tabla, r.modo);
    execute format('create trigger tg_zz_en_vivo_borrado after delete on %I referencing old table as viejas for each statement execute function fn_senal_en_vivo(%L)', r.tabla, r.modo);
  end loop;
end $$;

-- Quién escucha cada canal. Solo recibir (nadie manda señales desde el navegador: no hay
-- política de escritura). Solo cuentas activas.
do $$
begin
  if to_regclass('realtime.messages') is null or to_regprocedure('realtime.topic()') is null then
    raise notice 'en vivo: este Postgres no tiene Supabase Realtime; la política se crea en Supabase.';
    return;
  end if;
  execute 'drop policy if exists "en vivo: cada uno sus señales" on realtime.messages';
  execute $p$
    create policy "en vivo: cada uno sus señales" on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and (
          (realtime.topic() = 'dynamo' and (public.es_equipo_dynamo() or public.es_solo_lectura()))
          or exists (
            select 1 from public.usuarios u
             where u.id = auth.uid() and u.estado = 'activa'
               and (realtime.topic() = 'cliente:' || u.cliente_id::text
                 or realtime.topic() = 'transportista:' || u.transportista_id::text))
        )
      )
  $p$;
end $$;
