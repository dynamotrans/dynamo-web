-- ---- Teléfono del conductor: fuera de los emails; en la plataforma, solo unas horas ------------
-- (usuario, 2026-11-20: «OK las dos propuestas, hazlas»). Un teléfono metido en un email se
-- queda para siempre en buzones ajenos. Ahora:
--   · los emails al cliente ya no lo llevan (matrículas y datos del envío): remiten a la ficha;
--   · en la plataforma, el cliente lo ve desde el día ANTES de la carga hasta 24 h después de
--     la entrega (o, sin marcarla, hasta el plazo que ya había tras la entrega prevista).

insert into parametros (clave, valor, descripcion) values
  ('telefono_conductor_horas_tras_entrega', '24', 'Horas después de marcar el envío como entregado en que el cliente sigue viendo el teléfono del conductor en la plataforma. Antes de la víspera de la carga no lo ve.')
on conflict (clave) do nothing;

create or replace function telefono_conductor_visible(p_estado estado_envio, p_carga date, p_entregado_en timestamptz, p_entrega date)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_estado = 'cancelado' then false
    when p_carga is null or now() < ((p_carga - 1)::timestamp at time zone 'Europe/Madrid') then false
    when p_estado = 'entregado' then p_entregado_en is not null
         and now() < p_entregado_en + make_interval(hours => parametro_num('telefono_conductor_horas_tras_entrega', 24)::int)
    else not contacto_transportista_oculto(p_estado, p_entrega) end
$$;
revoke all on function telefono_conductor_visible(estado_envio, date, timestamptz, date) from public, anon;
grant execute on function telefono_conductor_visible(estado_envio, date, timestamptz, date) to authenticated, service_role;
comment on function telefono_conductor_visible(estado_envio, date, timestamptz, date) is '[Envíos] Si el cliente puede ver ya el teléfono del conductor: desde el día antes de la carga hasta las horas de Parámetros (telefono_conductor_horas_tras_entrega) después de marcar la entrega; nunca en un envío cancelado. Quién: las funciones que dan los envíos al cliente. Argumentos: p_estado: envios.estado · p_carga: día de carga (real, previsto o el primero de la ventana) · p_entregado_en: envios.entregado_en · p_entrega: envios.fecha_entrega_estimada.';

do $$ declare f text; v text; n text; begin
  foreach f in array array['public.mis_envios'::text, 'public.mis_envios_por_ids'] loop
    v := pg_get_functiondef(f::regproc);
    n := replace(v, 'case when contacto_transportista_oculto(e.estado, e.fecha_entrega_estimada) then null else e.conductor_telefono end',
      'case when telefono_conductor_visible(e.estado, coalesce(e.fecha_carga_real, e.fecha_carga_prevista, e.fecha_carga_desde), e.entregado_en, e.fecha_entrega_estimada) then e.conductor_telefono end');
    if n <> v then execute n; elsif position('telefono_conductor_visible' in v) = 0 then raise exception '%: no encuentro el teléfono del conductor', f; end if;
  end loop;

  v := pg_get_functiondef('public.envio_detalle_html'::regproc);
  n := replace(v, $a$then 'conductor ' || btrim(e.conductor_nombre) || coalesce(' (' || nullif(btrim(e.conductor_telefono), '') || ')', '') end) end;$a$,
                  $a$then 'conductor ' || btrim(e.conductor_nombre) end) end;$a$);
  -- Ya aplicada: no se repite.
  if n <> v then execute n; elsif position('then ''conductor '' || btrim(e.conductor_nombre) end) end;' in v) = 0 then raise exception 'envio_detalle_html: no encuentro el teléfono del conductor'; end if;

  v := pg_get_functiondef('public.fn_email_envio_matriculas'::regproc);
  n := replace(v, $a$case when nullif(btrim(new.conductor_telefono), '') is not null then ' · <strong>Teléfono:</strong> ' || escapar_html(btrim(new.conductor_telefono)) else '' end));$a$,
                  $a$case when nullif(btrim(new.conductor_telefono), '') is not null then '</p><p>El <strong>teléfono del conductor</strong> lo tienes en la ficha del envío desde el día antes de la carga.' else '' end));$a$);
  -- Ya aplicada: no se repite.
  if n <> v then execute n; elsif position('lo tienes en la ficha del envío' in v) = 0 then raise exception 'fn_email_envio_matriculas: no encuentro el teléfono del conductor'; end if;
end $$;
