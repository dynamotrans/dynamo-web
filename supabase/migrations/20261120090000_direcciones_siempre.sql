-- ---- Las direcciones se ven SIEMPRE, también sin matrículas (usuario, 2026-11-20) -------------
-- «Eso de ocultar direcciones en la orden de carga, mejor no: mostramos siempre, desmontamos
-- eso. Pero sí el aviso en rojo del DeCA». Las dos funciones que recortaban las paradas
-- (paradas_ocultas, orden_oculta_sin_matriculas) ya no quitan nada: solo marcan que faltan las
-- matrículas, para que la pantalla enseñe el aviso del DeCA y no el botón del eCMR (el CMR sí
-- necesita las matrículas).

create or replace function paradas_ocultas(p_paradas jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg((x - 'oculta') || jsonb_build_object('sin_matriculas', true) order by t.n), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_paradas, '[]'::jsonb)) with ordinality as t(x, n)
$$;
comment on function paradas_ocultas(jsonb) is '[Gestión interna] Antes recortaba las paradas a solo el código postal mientras faltaban las matrículas; desde el 2026-11-20 las deja enteras y solo les añade sin_matriculas = true (la pantalla enseña el aviso del DeCA y no el botón del eCMR). Quién: las funciones que dan el viaje al transportista. Argumentos: p_paradas: las paradas en JSON.';

create or replace function orden_oculta_sin_matriculas(p_json jsonb, p_envio uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when envio_matriculas_completas(p_envio) then p_json
              else p_json || jsonb_build_object('faltan_matriculas', true) end
$$;
comment on function orden_oculta_sin_matriculas(jsonb, uuid) is '[Gestión interna] Los datos de la orden de carga para el transportista: desde el 2026-11-20 van siempre completos (con las direcciones); sin matrículas solo se marca faltan_matriculas (la orden lleva el aviso rojo del DeCA). Quién: las funciones que dan la orden al transportista. Argumentos: p_json: los datos de la orden · p_envio: envios.id.';
