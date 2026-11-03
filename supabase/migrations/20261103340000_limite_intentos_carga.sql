-- =====================================================================================
-- LÍMITE DE INTENTOS EN LA PÁGINA PÚBLICA «ACEPTAR CARGA»
-- =====================================================================================
-- Con un enlace de bolsa, el transportista se identifica con su CIF. Sin límite, alguien
-- podría probar CIF a lo bruto hasta dar con uno de la base. Limitar por IP no sirve aquí:
-- todas las peticiones llegan desde el servidor web (la misma IP). Se limita por:
--   · RESERVA: 5 CIF no encontrados y la reserva se libera (hay que volver a empezar).
--   · CARGA:   20 fallos en 24 h y la aceptación por enlace se bloquea para esa carga
--              (Dynamo la asigna a mano o la vuelve a ofertar).
-- Cada fallo queda registrado (append-only) con la IP que manda el servidor web.
-- Sigue pendiente lo importante (necesita Postmark): un CÓDIGO por email al aceptar con
-- un enlace de bolsa, para que no baste con conocer el CIF de otro.

create table intentos_carga_publica (
  id         bigint generated always as identity primary key,
  envio_id   uuid not null,
  reserva_id uuid,
  cuando     timestamptz not null default now(),
  motivo     text not null,
  ip         inet
);
create index idx_intentos_carga_envio on intentos_carga_publica (envio_id, cuando desc);
create index idx_intentos_carga_reserva on intentos_carga_publica (reserva_id) where reserva_id is not null;
create trigger tg_intentos_carga_sellar before insert on intentos_carga_publica
  for each row execute function fn_cuando_servidor();
create trigger tg_intentos_carga_inmutable before update or delete or truncate on intentos_carga_publica
  for each statement execute function fn_append_only();
revoke update, delete, truncate on intentos_carga_publica from public, anon, authenticated;
alter table intentos_carga_publica enable row level security;
create policy intentos_carga_admin_sel on intentos_carga_publica for select using (es_admin());

insert into parametros (clave, valor, descripcion) values
  ('carga_publica_max_fallos_reserva', '5', 'CIF no encontrados por reserva antes de liberarla (página aceptar carga).'),
  ('carga_publica_max_fallos_dia', '20', 'Fallos en 24 h por carga antes de bloquear su aceptación por enlace.')
on conflict (clave) do nothing;

-- aceptar_oferta_publica con los límites (mismo contrato; añade p_ip y el resultado
-- 'demasiados_intentos').
create or replace function aceptar_oferta_publica(
  p_reserva uuid, p_cif text, p_precio numeric default null, p_pronto_pago boolean default false,
  p_camion text default null, p_remolque text default null, p_conductor text default null, p_telefono text default null,
  p_ip inet default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; o record; v_t uuid; v_res jsonb; v_tel text; v_fr int; v_fd int;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found then return jsonb_build_object('resultado', 'reserva_no_existe'); end if;
  if r.oferta_id is not null then select * into o from envio_ofertas where id = r.oferta_id; end if;

  -- ¿Demasiados fallos con esta carga en 24 h? Bloqueada por enlace.
  select count(*) into v_fd from intentos_carga_publica where envio_id = r.envio_id and cuando > now() - interval '24 hours';
  if v_fd >= coalesce((parametro('carga_publica_max_fallos_dia') #>> '{}')::int, 20) then
    return jsonb_build_object('resultado', 'demasiados_intentos');
  end if;

  v_t := o.transportista_id;
  if v_t is null then
    if nullif(trim(p_cif), '') is null then return jsonb_build_object('resultado', 'falta_cif'); end if;
    select id into v_t from transportistas where normaliza_id_fiscal(cif) = normaliza_id_fiscal(p_cif);
    if v_t is null then
      insert into intentos_carga_publica (envio_id, reserva_id, motivo, ip) values (r.envio_id, p_reserva, 'cif_no_encontrado', p_ip);
      select count(*) into v_fr from intentos_carga_publica where reserva_id = p_reserva;
      if v_fr >= coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) then
        perform liberar_reserva(p_reserva, 'demasiados CIF no encontrados');
        return jsonb_build_object('resultado', 'demasiados_intentos');
      end if;
      return jsonb_build_object('resultado', 'transportista_no_encontrado', 'intentos_restantes',
        coalesce((parametro('carga_publica_max_fallos_reserva') #>> '{}')::int, 5) - v_fr);
    end if;
  end if;

  v_res := aceptar_reserva(p_reserva, v_t, null, p_precio);
  if v_res ->> 'resultado' in ('aceptada', 'pendiente_revision') then
    update envio_reservas
       set pronto_pago = coalesce(p_pronto_pago, false) and coalesce(o.pronto_pago, true)
     where id = p_reserva;
  end if;
  if v_res ->> 'resultado' = 'aceptada' then
    v_tel := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
    update envios set
      matricula_camion   = coalesce(nullif(upper(regexp_replace(coalesce(p_camion, ''), '[\s-]', '', 'g')), ''), matricula_camion),
      matricula_remolque = coalesce(nullif(upper(regexp_replace(coalesce(p_remolque, ''), '[\s-]', '', 'g')), ''), matricula_remolque),
      conductor_nombre   = coalesce(nullif(trim(p_conductor), ''), conductor_nombre),
      conductor_telefono = coalesce(case when length(replace(v_tel, '+', '')) >= 6 then v_tel end, conductor_telefono),
      transportista_nima = coalesce(transportista_nima, (select nima from transportistas where id = v_t))
     where id = r.envio_id;
  end if;
  return v_res || jsonb_build_object('transportista', (select nombre_visible from transportistas where id = v_t));
end $$;
-- La versión anterior (sin p_ip) se quita: una sola puerta.
drop function if exists aceptar_oferta_publica(uuid, text, numeric, boolean, text, text, text, text);
revoke execute on function aceptar_oferta_publica(uuid, text, numeric, boolean, text, text, text, text, inet) from public;
grant execute on function aceptar_oferta_publica(uuid, text, numeric, boolean, text, text, text, text, inet) to anon, authenticated;
