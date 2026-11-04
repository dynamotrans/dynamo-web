-- =====================================================================================
-- RESERVAS EN EL CMR DIGITAL (protocolo de siniestro, usuario 2026-11-04)
-- Quien firma una casilla del CMR (cargador, conductor o destinatario) puede anotar
-- RESERVAS: qué falta o qué está dañado. Es lo que permite reclamar al seguro. Se guardan
-- aparte de la firma (las firmas no se pueden cambiar), justo ANTES de firmar, y entran en
-- la huella de lo firmado. Cada reserva abre sola una incidencia de SINIESTRO (crítica)
-- para Dynamo. Salen en la casilla 18 del CMR en PDF.
-- =====================================================================================

create table cmr_reservas (
  id            uuid primary key default gen_random_uuid(),
  envio_id      uuid not null references envios(id) on delete restrict,
  parada_id     uuid,
  rol           text not null check (rol in ('remitente', 'transportista', 'destinatario')),
  texto         text not null check (length(trim(texto)) between 3 and 1000),
  incidencia_id uuid references incidencias(id) on delete set null,
  creado_en     timestamptz not null default now()
);
create index idx_cmr_reservas_envio on cmr_reservas (envio_id, creado_en);
alter table cmr_reservas enable row level security;
create policy cmr_reservas_sel on cmr_reservas for select to authenticated
  using (ve_todo() or envio_del_cliente(envio_id) or envio_del_transportista(envio_id));
revoke insert, update, delete on cmr_reservas from anon, authenticated;

create or replace function anotar_reservas_cmr(p_token uuid, p_parada uuid, p_rol text, p_texto text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_envio uuid; v_texto text := trim(coalesce(p_texto, '')); v_inc uuid; v_quien text;
begin
  v_envio := cmr_envio_de_token(p_token);
  if v_envio is null then return jsonb_build_object('resultado', 'enlace_no_valido'); end if;
  if p_rol not in ('remitente', 'transportista', 'destinatario') then return jsonb_build_object('resultado', 'rol_no_valido'); end if;
  if length(v_texto) < 3 or length(v_texto) > 1000 then return jsonb_build_object('resultado', 'texto_no_valido'); end if;
  if (select count(*) from cmr_reservas where envio_id = v_envio and rol = p_rol and parada_id is not distinct from p_parada) >= 3 then
    return jsonb_build_object('resultado', 'demasiadas');
  end if;
  v_quien := case p_rol when 'remitente' then 'el cargador' when 'transportista' then 'el conductor' else 'el destinatario' end;
  insert into incidencias (tipo_id, envio_id, cliente_id, titulo, detalle)
  values ((select id from tipos_incidencia where clave = 'siniestro'), v_envio, (select cliente_id from envios where id = v_envio),
          format('Reservas en el CMR (%s)', v_quien), v_texto)
  returning id into v_inc;
  insert into cmr_reservas (envio_id, parada_id, rol, texto, incidencia_id) values (v_envio, p_parada, p_rol, v_texto, v_inc);
  return jsonb_build_object('resultado', 'ok');
end $$;
revoke execute on function anotar_reservas_cmr(uuid, uuid, text, text) from public;
grant execute on function anotar_reservas_cmr(uuid, uuid, text, text) to anon, authenticated;

-- Para la página del CMR (con su enlace): las reservas ya anotadas.
create or replace function reservas_cmr_publico(p_token uuid)
returns table (rol text, parada_id uuid, texto text, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select r.rol, r.parada_id, r.texto, r.creado_en from cmr_reservas r
   where r.envio_id = cmr_envio_de_token(p_token) order by r.creado_en
$$;
revoke execute on function reservas_cmr_publico(uuid) from public;
grant execute on function reservas_cmr_publico(uuid) to anon, authenticated;
