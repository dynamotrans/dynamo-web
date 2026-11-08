-- =====================================================================================
-- BUSCADOR DE IDENTIFICACIÓN EN LA PÁGINA PÚBLICA DE LA CARGA (usuario, 2026-11-09)
-- =====================================================================================
-- Como en el mockup de aceptar-carga: el transportista se identifica con un buscador
-- con sugerencias de la base de Dynamo — por NOMBRE de empresa (desde 2 letras, todas
-- las palabras en cualquier orden), o por CIF/NIF, código de bolsa, población… (lo que
-- lleve texto_busqueda), y el CIF también normalizado (da igual «ES», guiones, puntos
-- o minúsculas). Máximo 6, los activos primero. Decisión del usuario, consciente de que
-- expone nombre+CIF+población de la agenda a quien tenga un enlace: por eso SOLO
-- responde con una RESERVA VIVA (quien tiene la carga reservada en ese momento), igual
-- que el resto de funciones públicas del enlace; sin reserva, ni una fila.
-- =====================================================================================

create function public.sugerencias_transportistas_publicas(p_reserva uuid, p_q text)
returns table (nombre text, cif text, poblacion text)
language plpgsql stable security definer set search_path = public as $$
declare r record; v_raw text := trim(coalesce(p_q, ''));
  v_id text; v_pal text[];
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'viva' or r.hasta < now() then return; end if;
  if length(regexp_replace(v_raw, '[^A-Za-z0-9]', '', 'g')) < 2 or length(v_raw) > 80 then return; end if;
  v_id := normalizar_id_fiscal(v_raw);
  v_pal := patrones_busqueda(v_raw);
  return query
  select t.nombre_visible, t.cif, t.poblacion
    from transportistas t
   where (cardinality(v_pal) > 0 and t.texto_busqueda like all (v_pal))
      or (length(v_id) >= 4 and normalizar_id_fiscal(t.cif) like '%' || v_id || '%')
   order by (t.estado_operativo = 'activo') desc, t.nombre_visible, t.id
   limit 6;
end $$;
revoke all on function public.sugerencias_transportistas_publicas(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.sugerencias_transportistas_publicas(uuid, text) to anon, authenticated, service_role;
comment on function public.sugerencias_transportistas_publicas(uuid, text) is '[Ofertas y transportistas] Sugerencias para identificarse al aceptar una carga: hasta 6 transportistas de Dynamo (nombre visible, CIF y población, los activos primero) que casan con lo escrito — nombre por palabras desde 2 letras, o CIF/NIF (normalizado: sin «ES», guiones ni puntos), código de bolsa, población… Solo con una reserva viva; sin ella no devuelve filas. Quién: la página pública (anon) con su reserva. Argumentos: p_reserva: envio_reservas.id vivo · p_q: lo escrito (2–80 caracteres).';
