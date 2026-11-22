-- LA FIRMA DEL CMR SE CIERRA (usuario, 2026-11-22): el enlace de firmas sirve para firmar
-- mientras el envío está vivo y hasta el FINAL DEL TERCER DÍA después de entregar en la
-- última parada (envío entregado), para las firmas que llegan tarde. Pasado ese plazo el
-- enlace sigue abriendo, pero solo para ver y descargar el PDF: nadie puede añadir una firma
-- (ni reservas, ni pedir el código) a un CMR cerrado hace meses. Las fotos del CMR en papel y
-- los documentos extra se pueden seguir subiendo: no son firmas y los revisa Dynamo.
-- Plazo en Parámetros (`cmr_dias_firma_tras_entrega`, 3 días).

insert into parametros (clave, valor, descripcion) values
  ('cmr_dias_firma_tras_entrega', '3', 'Días después de la entrega en la última parada durante los que aún se puede firmar el CMR digital (hasta el final de ese día, hora de Madrid). Después, el enlace solo deja ver y descargar el PDF.')
on conflict (clave) do nothing;

-- Hasta cuándo se puede firmar: null mientras el envío no está entregado (sin plazo).
create or replace function public.cmr_firma_hasta(p_envio uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select case when e.estado = 'entregado' then
           ((((coalesce(e.entregado_en,
                        (select max(p.realizado_en) from envio_paradas p where p.envio_id = e.id),
                        now()) at time zone 'Europe/Madrid')::date
              + greatest(parametro_num('cmr_dias_firma_tras_entrega', 3)::int, 0) + 1)::timestamp) at time zone 'Europe/Madrid')
         end
    from envios e where e.id = p_envio
$$;
revoke execute on function public.cmr_firma_hasta(uuid) from public, anon, authenticated;
comment on function public.cmr_firma_hasta(uuid) is '[CMR] Hasta cuándo se puede firmar el CMR digital de un envío: final del día (hora de Madrid) que cae cmr_dias_firma_tras_entrega días después de la entrega en la última parada. Null si el envío aún no está entregado (se puede firmar sin plazo). Quién: solo uso interno. Argumentos: p_envio: envios.id.';

create or replace function public.cmr_firma_abierta(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select e.estado <> 'cancelado' and (cmr_firma_hasta(e.id) is null or now() < cmr_firma_hasta(e.id))
    from envios e where e.id = p_envio
$$;
revoke execute on function public.cmr_firma_abierta(uuid) from public, anon, authenticated;
comment on function public.cmr_firma_abierta(uuid) is '[CMR] ¿Se puede firmar todavía el CMR digital del envío? Sí mientras no esté cancelado ni haya pasado cmr_firma_hasta(). Quién: solo uso interno. Argumentos: p_envio: envios.id.';

-- Firmar, anotar reservas y pedir el código: rechazados con el CMR cerrado.
do $$
declare f text; def text; aguja text; n int;
begin
  foreach f in array array['firmar_cmr_publico', 'anotar_reservas_cmr_publico', 'cmr_codigo_firma_crear'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = f;
    aguja := case f when 'firmar_cmr_publico'
               then $a$if v_estado = 'cancelado' then return jsonb_build_object('resultado', 'cancelado'); end if;$a$
               else $a$if (select estado from envios where id = v_envio) = 'cancelado' then return jsonb_build_object('resultado', 'cancelado'); end if;$a$ end;
    n := (length(def) - length(replace(def, aguja, ''))) / length(aguja);
    if n <> 1 then raise exception 'cmr_firma_se_cierra: % tiene la aguja % veces', f, n; end if;
    execute replace(def, aguja, aguja || E'\n  -- CMR cerrado: 3 días después de la entrega ya no se firma (usuario, 2026-11-22).\n  if not cmr_firma_abierta(v_envio) then return jsonb_build_object(''resultado'', ''firma_cerrada''); end if;');
  end loop;
end $$;

-- La hoja pública dice si se puede firmar y hasta cuándo.
do $$
declare def text; aguja text := $a$'resultado', 'ok',$a$; n int;
begin
  def := pg_get_functiondef('public.cmr_publico(uuid)'::regprocedure);
  n := (length(def) - length(replace(def, aguja, ''))) / length(aguja);
  if n <> 1 then raise exception 'cmr_firma_se_cierra: cmr_publico tiene la aguja % veces', n; end if;
  execute replace(def, aguja, aguja || E'\n    ''firma_abierta'', cmr_firma_abierta(e.id), ''firma_hasta'', cmr_firma_hasta(e.id),');
end $$;
