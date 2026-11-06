-- PLATAFORMA EN VIVO, 2.ª parte (2026-11-06): también las páginas que se abren por ENLACE,
-- sin cuenta: la carga de la bolsa (/carga/<enlace>) y la firma del CMR (/cmr/<enlace>).
-- Cuando cambia el envío, sus ofertas, reservas, paradas, firmas o el propio enlace del CMR,
-- se manda la misma señal SIN DATOS al canal «enlace:<sha256 de la llave>».
-- Quién escucha: cualquiera (también sin sesión) que conozca el canal, es decir, quien tenga
-- el enlace. Con el resumen, la llave no aparece en los registros de Realtime ni en sus
-- mensajes, y no se puede deducir de él.

create or replace function fn_senal_en_vivo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_modo text := coalesce(tg_argv[0], 'propio');
  v_filas jsonb[] := '{}';
  v_cli uuid[]; v_tra uuid[]; v_id uuid; v_carga jsonb := jsonb_build_object('t', tg_table_name);
  v_envios uuid[]; v_canal text;
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

    -- Páginas con enlace (bolsa de cargas y firma del CMR): su canal es «enlace:» + el
    -- resumen SHA-256 de la llave del enlace. Lo escucha quien tiene el enlace (como la
    -- página) y nadie puede adivinar el de otro; la llave no viaja ni se guarda en claro.
    select array_agg(distinct x) filter (where x is not null) into v_envios from (
      select case when tg_table_name = 'envios' then (f ->> 'id')::uuid else (f ->> 'envio_id')::uuid end x
        from unnest(v_filas) f) s;
    if v_envios is not null then
      for v_canal in
        select distinct 'enlace:' || encode(sha256(convert_to(t::text, 'UTF8')), 'hex') from (
          -- la propia fila si es un enlace (p. ej. el CMR que se acaba de retirar)
          select (f ->> 'token')::uuid t from unnest(v_filas) f where tg_table_name in ('cmr_enlaces', 'envio_ofertas')
          union
          select o.token from envio_ofertas o where o.envio_id = any(v_envios) and o.token is not null
          union
          select c.token from cmr_enlaces c where c.envio_id = any(v_envios) and not c.revocado and c.caduca_en > now() - interval '1 day'
        ) k
      loop perform realtime.send(v_carga, 'cambio', v_canal, true); end loop;
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
  'Plataforma en vivo: por cada sentencia que cambia una tabla del panel, manda por Realtime una señal sin datos ({"t": tabla}) a «dynamo», «cliente:<id>», «transportista:<id>» y, si toca a un envío, a «enlace:<sha256 de la llave>» de sus enlaces de bolsa y de CMR. Argumento: propio, envio, empresa_cliente / empresa_transportista. Nunca bloquea el cambio.';

-- El enlace del CMR (crear, retirar) también avisa.
do $$
declare v_t text;
begin
  perform set_config('client_min_messages', 'warning', true);
  foreach v_t in array array['alta', 'cambio', 'borrado'] loop
    execute format('drop trigger if exists %I on cmr_enlaces', 'tg_zz_en_vivo_' || v_t);
  end loop;
  create trigger tg_zz_en_vivo_alta after insert on cmr_enlaces referencing new table as nuevas for each statement execute function fn_senal_en_vivo('envio');
  create trigger tg_zz_en_vivo_cambio after update on cmr_enlaces referencing old table as viejas new table as nuevas for each statement execute function fn_senal_en_vivo('envio');
  create trigger tg_zz_en_vivo_borrado after delete on cmr_enlaces referencing old table as viejas for each statement execute function fn_senal_en_vivo('envio');
end $$;

-- Escuchar los canales «enlace:…» sin sesión. Solo recibir, solo ese prefijo con 64
-- caracteres hexadecimales.
do $$
begin
  if to_regclass('realtime.messages') is null or to_regprocedure('realtime.topic()') is null then
    raise notice 'en vivo: este Postgres no tiene Supabase Realtime; la política se crea en Supabase.';
    return;
  end if;
  execute 'drop policy if exists "en vivo: páginas con enlace" on realtime.messages';
  execute $p$
    create policy "en vivo: páginas con enlace" on realtime.messages
      for select to anon, authenticated
      using (realtime.messages.extension = 'broadcast' and realtime.topic() ~ '^enlace:[0-9a-f]{64}$')
  $p$;
end $$;
