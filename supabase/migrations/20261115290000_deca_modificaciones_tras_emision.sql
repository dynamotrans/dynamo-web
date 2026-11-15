-- PANEL DE MODIFICACIONES DEL DeCA: TODO LO QUE CAMBIA DESPUÉS DE LA EMISIÓN (usuario,
-- 2026-11-15): un DeCA emitido el sábado sin matrículas, que el transportista completa el
-- domingo al firmar, salía «Sin modificaciones desde la emisión». La regla buena: lo que
-- ya estaba al EMITIRSE (fecha del enlace vivo del DeCA = su nº único, la misma que el
-- PDF pone en «Emitida el») es el documento original; todo lo que se cambie o se
-- complete DESPUÉS queda en el panel con fecha y hora — también la PRIMERA asignación de
-- transportista o de matrículas. Antes de emitirse, la 1.ª asignación sigue sin contar
-- (rellena, no modifica). La 1.ª tras la emisión va marcada ('primera') para que el PDF
-- diga «Matrículas asignadas» / «Transportista asignado» en vez de «cambio». El
-- transportista lleva ahora su nombre en el detalle (sin datos económicos, como siempre).

create or replace function fn_modificaciones_deca(p_envio uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with emision as (
    select max(c.creado_en) as en from cmr_enlaces c where c.envio_id = p_envio and not c.revocado
  ), h as (
    select hito, cuando, datos, row_number() over (partition by hito order by cuando) as n
      from envio_hitos
     where envio_id = p_envio
       and hito in ('ruta_cambiada', 'fecha_carga_movida', 'transportista_quitado',
                    'transportista_asignado', 'matricula_asignada')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cuando', to_char(cuando at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI'),
           'hito', hito,
           'primera', n = 1 and hito in ('transportista_asignado', 'matricula_asignada'),
           'detalle', case hito
             when 'ruta_cambiada' then (
               select string_agg(nullif(trim(coalesce(x ->> 'codigo_postal', '') || ' ' || coalesce(x ->> 'poblacion', '')), ''), ' → ')
                 from jsonb_array_elements(datos -> 'despues') x)
             when 'fecha_carga_movida' then nullif(concat_ws(' → ',
               to_char((nullif(datos ->> 'antes_desde', ''))::date, 'DD/MM/YYYY'),
               to_char((nullif(datos ->> 'desde', ''))::date, 'DD/MM/YYYY')), '')
             when 'matricula_asignada' then nullif(concat_ws(' + ',
               coalesce(datos ->> 'camion', datos ->> 'tractora'), datos ->> 'remolque'), '')
             when 'transportista_asignado' then (
               select coalesce(t.nombre_visible, t.razon_social) from transportistas t
                where t.id = (nullif(datos ->> 'transportista_id', ''))::uuid)
             else null end
         ) order by cuando), '[]'::jsonb)
    from h cross join emision
   where hito in ('ruta_cambiada', 'fecha_carga_movida', 'transportista_quitado')
      or n > 1
      or (emision.en is not null and cuando > emision.en)
$$;
revoke execute on function fn_modificaciones_deca(uuid) from public, anon, authenticated;
comment on function public.fn_modificaciones_deca(uuid) is '[Envíos] Las modificaciones del documento de control (DeCA) de un envío, para el panel del PDF (Resolución 5-jun-2026, apdo. quinto): cambios de ruta, fecha de carga movida, transportista retirado, y asignaciones de transportista y de matrículas — desde la segunda, o también la primera si llega DESPUÉS de emitirse el DeCA (fecha del enlace vivo, su nº único), marcada con primera=true —, de envio_hitos, cada una con fecha y hora españolas y un detalle corto SIN datos económicos (el transportista, por su nombre). Devuelve jsonb [{cuando, hito, primera, detalle}]. Quién: funciones internas (orden_carga_json, datos_cmr_por_token) y el envoltorio modificaciones_deca. Argumentos: p_envio: envios.id.';
