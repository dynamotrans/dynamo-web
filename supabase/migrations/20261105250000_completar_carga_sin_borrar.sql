-- =====================================================================================
-- COMPLETAR CAMIÓN Y CONDUCTOR DESDE EL ENLACE: UN CAMPO VACÍO NO BORRA (usuario, 2026-11-05)
-- En la página de la carga, el transportista rellena matrícula, remolque, conductor y
-- teléfono. Si vuelve a guardar dejando un hueco vacío, antes se borraba lo que había;
-- ahora se conserva. Para cambiar un dato, se escribe el nuevo.
-- =====================================================================================

create or replace function completar_carga_publica(
  p_reserva uuid, p_camion text, p_remolque text, p_conductor text, p_telefono text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_tel text;
begin
  select * into r from envio_reservas where id = p_reserva and estado = 'aceptada';
  if not found then return jsonb_build_object('resultado', 'no_aceptada'); end if;
  if not exists (select 1 from envios where id = r.envio_id and transportista_id = r.transportista_id
                  and estado in ('programado', 'hacia_la_carga')) then
    return jsonb_build_object('resultado', 'ya_no_se_puede');
  end if;
  if not enlace_carga_vigente(r.envio_id) then return jsonb_build_object('resultado', 'ya_no_se_puede'); end if;
  v_tel := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
  update envios set
    -- Un campo que llega vacío NO borra lo que ya había (usuario, 2026-11-05).
    matricula_camion   = coalesce(nullif(upper(regexp_replace(coalesce(p_camion, ''), '[\s-]', '', 'g')), ''), matricula_camion),
    matricula_remolque = coalesce(nullif(upper(regexp_replace(coalesce(p_remolque, ''), '[\s-]', '', 'g')), ''), matricula_remolque),
    conductor_nombre   = coalesce(nullif(trim(p_conductor), ''), conductor_nombre),
    conductor_telefono = coalesce(case when length(replace(coalesce(v_tel, ''), '+', '')) >= 6 then v_tel end, conductor_telefono)
   where id = r.envio_id;
  return jsonb_build_object('resultado', 'guardado');
end $$;
