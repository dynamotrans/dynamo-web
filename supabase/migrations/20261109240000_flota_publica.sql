-- =====================================================================================
-- ACEPTAR CARGA: MATRÍCULAS Y CHÓFER DE OTRAS VECES, AUTOASIGNADOS Y EN LISTA (usuario, 2026-11-09)
-- =====================================================================================
-- En la página pública de aceptar carga, al identificarse la empresa se autorrellenan
-- matrículas, conductor y teléfono con LO ÚLTIMO que usó en un envío con Dynamo (si no
-- hay nada, no se autorrellena). Y cada campo ofrece la lista de matrículas y chóferes
-- ya usados con ese transportista (su flota, que se alimenta sola de los envíos), por
-- si es otro camión u otro chófer — o se escribe uno nuevo sin más.
--   · flota_publica(p_reserva, p_cif): como el resto de funciones públicas del enlace,
--     SOLO responde con una reserva viva (la cookie del navegador que abrió el enlace).
--     Con p_cif se busca el transportista (quien se está identificando); sin él, el de
--     la reserva (ofertas personales y pantalla de carga aceptada).
--   · Además devuelve el teléfono y el email de la ficha OCULTOS (usuario, 2026-11-09):
--     el teléfono sin sus 4 últimas cifras y el email con 4 asteriscos delante de cada
--     tramo («+34 60011****», «****.lopez@****esa.com»). Se enmascaran EN EL SERVIDOR:
--     el dato entero nunca viaja al navegador de quien se identifica.
-- =====================================================================================

create or replace function flota_publica(p_reserva uuid, p_cif text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; t uuid; u record; tt record; v_tel text;
begin
  select x.* into r from envio_reservas x
   where x.id = p_reserva and x.estado in ('viva', 'pendiente_revision', 'aceptada');
  if not found or not enlace_carga_vigente(r.envio_id) then return jsonb_build_object('resultado', 'no_valida'); end if;
  if nullif(trim(coalesce(p_cif, '')), '') is not null then
    select id into t from transportistas
     where normalizar_id_fiscal(cif) = normalizar_id_fiscal(p_cif) limit 1;
  else
    t := r.transportista_id;
  end if;
  if t is null then return jsonb_build_object('resultado', 'sin_transportista'); end if;
  -- El contacto vive en la agenda compartida: el principal del transportista (o el
  -- primero con teléfono), como en las fichas de sitio.
  select c.telefono, c.email into tt from contactos c
   where c.transportista_id = t and (c.telefono is not null or c.email is not null)
   order by c.es_principal desc, c.creado_en limit 1;
  v_tel := nullif(regexp_replace(coalesce(tt.telefono, ''), '\s', '', 'g'), '');
  -- Lo último usado en un envío (el conjunto entero: camión, remolque, chófer, teléfono).
  select e.matricula_camion, e.matricula_remolque, e.conductor_nombre, e.conductor_telefono into u
    from envios e where e.transportista_id = t and e.matricula_camion is not null
   order by e.creado_en desc limit 1;
  return jsonb_build_object('resultado', 'ok',
    -- Contacto de la ficha, OCULTO: teléfono sin las 4 últimas cifras; email con 4
    -- asteriscos delante de cada tramo (local y dominio).
    'telefono_oculto', case when v_tel is null then null
      else regexp_replace(left(v_tel, greatest(length(v_tel) - 4, 0)) || '****', '^(\+\d{2})', '\1 ') end,
    'email_oculto', case when tt.email is null or position('@' in tt.email) = 0 then null
      else '****' || substring(split_part(tt.email, '@', 1) from 5) || '@' || '****' || substring(split_part(tt.email, '@', 2) from 5) end,
    'ultimo', case when u.matricula_camion is null then null else jsonb_build_object(
      'camion', u.matricula_camion, 'remolque', u.matricula_remolque,
      'conductor', u.conductor_nombre, 'telefono', u.conductor_telefono) end,
    'camiones', coalesce((select jsonb_agg(m.matricula) from (select matricula from vehiculos
      where transportista_id = t and activo and tipo <> 'remolque' order by creado_en desc limit 30) m), '[]'::jsonb),
    'remolques', coalesce((select jsonb_agg(m.matricula) from (select matricula from vehiculos
      where transportista_id = t and activo and tipo = 'remolque' order by creado_en desc limit 30) m), '[]'::jsonb),
    'conductores', coalesce((select jsonb_agg(c.nombre) from (select nombre from conductores
      where transportista_id = t and activo order by creado_en desc limit 30) c), '[]'::jsonb));
end $$;
revoke execute on function flota_publica(uuid, text) from public;
grant execute on function flota_publica(uuid, text) to anon, authenticated;
comment on function public.flota_publica(uuid, text) is '[Ofertas y transportistas] Enlace público de la carga: lo último usado por el transportista en un envío (camión, remolque, chófer y teléfono, para autorrellenar al identificarse) y las listas de sus matrículas y chóferes conocidos (su flota, máx. 30 de cada), para elegir de la lista o escribir nuevos. Solo responde con una reserva viva/aceptada y el enlace vigente. Devuelve {resultado: ok | no_valida | sin_transportista, ultimo, camiones, remolques, conductores, telefono_oculto, email_oculto} (teléfono sin las 4 últimas cifras; email con 4 asteriscos delante de cada tramo — se ocultan en el servidor). Quién: cualquiera con el enlace (anon), con la cookie de su reserva. Argumentos: p_reserva: envio_reservas.id (la cookie) · p_cif: CIF/NIF de la empresa que se identifica (opcional; sin él, el transportista de la reserva).';

-- ---- Sugerencias de identificación: nombre desde 5 LETRAS (usuario, 2026-11-09) ------------
-- Antes el nombre sugería desde 2 letras y salían listas enormes. Ahora: NOMBRE (y
-- población) desde 5 caracteres; CIF/NIF normalizado y código de bolsa desde 4.
create or replace function public.sugerencias_transportistas_publicas(p_reserva uuid, p_q text)
returns table (nombre text, cif text, poblacion text)
language plpgsql stable security definer set search_path = public as $$
declare r record; v_raw text := trim(coalesce(p_q, ''));
  v_id text; v_pal text[]; v_alnum text;
begin
  select * into r from envio_reservas where id = p_reserva;
  if not found or r.estado <> 'viva' or r.hasta < now() then return; end if;
  v_alnum := regexp_replace(v_raw, '[^A-Za-z0-9]', '', 'g');
  if length(v_alnum) < 4 or length(v_raw) > 80 then return; end if;
  v_id := normalizar_id_fiscal(v_raw);
  v_pal := patrones_busqueda(v_raw);
  return query
  select t.nombre_visible, t.cif, t.poblacion
    from transportistas t
   where (length(v_alnum) >= 5 and cardinality(v_pal) > 0 and t.texto_busqueda like all (v_pal))
      or (length(v_id) >= 4 and normalizar_id_fiscal(t.cif) like '%' || v_id || '%')
      or (t.codigo_bolsa is not null and upper(t.codigo_bolsa) like '%' || upper(v_alnum) || '%')
   order by (t.estado_operativo = 'activo') desc, t.nombre_visible, t.id
   limit 6;
end $$;
comment on function public.sugerencias_transportistas_publicas(uuid, text) is '[Ofertas y transportistas] Sugerencias para identificarse al aceptar una carga: hasta 6 transportistas de Dynamo (nombre visible, CIF y población, los activos primero) que casan con lo escrito — nombre por palabras desde 5 caracteres, o CIF/NIF (normalizado: sin «ES», guiones ni puntos) y código de bolsa desde 4. Solo con una reserva viva; sin ella no devuelve filas. Quién: la página pública (anon) con su reserva. Argumentos: p_reserva: envio_reservas.id vivo · p_q: lo escrito (4–80 caracteres).';
