-- VERIFICACIÓN DE ALBARANES: QUITAR HOJAS ANTES DE ACEPTAR (usuario, 2026-11-28): «un PDF trae
-- 4 hojas, 3 son de albaranes, pero se ha colado una hoja que es como la factura del transportista,
-- donde vienen precios… un botón que sea eliminar una hoja del PDF». En cada hoja del visor hay
-- «Quitar esta hoja»; al aceptar, el servidor hace un PDF nuevo sin esas hojas (con pdf-lib), lo
-- sube al almacén y llama aquí para que la bandeja apunte al archivo nuevo (ruta, huella y tamaño)
-- antes de pasarlo al envío. El archivo viejo se borra; el original sigue en Drive.

create or replace function public.verificacion_albaran_quitar_hojas(p_id uuid, p_ruta text, p_sha256 text, p_tamano bigint, p_hojas int[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare d documentos_entrada;
begin
  if not es_equipo_dynamo() then raise exception 'Solo el equipo de Dynamo.' using errcode = '42501'; end if;
  if es_solo_lectura() then raise exception 'Tu usuario es de solo lectura.' using errcode = '42501'; end if;
  select * into d from documentos_entrada where id = p_id for update;
  if d.id is null or d.estado <> 'pendiente' then return jsonb_build_object('resultado', 'no_pendiente'); end if;
  if coalesce(d.tipo_mime, 'application/pdf') <> 'application/pdf' then return jsonb_build_object('resultado', 'no_es_pdf'); end if;
  -- El archivo nuevo va al lado del viejo, con su mismo id delante: nadie apunta a otro archivo.
  if p_ruta is null or p_ruta !~ ('^entrada/' || p_id::text || '-h[0-9]{1,15}\.pdf$') then return jsonb_build_object('resultado', 'datos_no_validos'); end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or coalesce(p_tamano, 0) <= 0 then return jsonb_build_object('resultado', 'datos_no_validos'); end if;
  if p_hojas is null or cardinality(p_hojas) = 0 or exists (select 1 from unnest(p_hojas) h where h is null or h < 1 or h > 1000) then
    return jsonb_build_object('resultado', 'datos_no_validos'); end if;
  begin
    update documentos_entrada
       set storage_ruta = p_ruta, sha256 = p_sha256, tamano_bytes = p_tamano,
           -- La huella del PDF tal como llegó se guarda: si vuelve a llegar igual, no se repite.
           datos = coalesce(datos, '{}'::jsonb) || jsonb_build_object('sha256_original', coalesce(datos ->> 'sha256_original', d.sha256)) || jsonb_build_object('hojas_quitadas',
             coalesce(datos -> 'hojas_quitadas', '[]'::jsonb) || to_jsonb((select array_agg(distinct h order by h) from unnest(p_hojas) h)))
     where id = p_id;
  exception when unique_violation then
    return jsonb_build_object('resultado', 'duplicado');
  end;
  return jsonb_build_object('resultado', 'ok', 'ruta_anterior', d.storage_ruta);
end $$;
revoke execute on function public.verificacion_albaran_quitar_hojas(uuid, text, text, bigint, int[]) from public, anon;
grant execute on function public.verificacion_albaran_quitar_hojas(uuid, text, text, bigint, int[]) to authenticated;
comment on function public.verificacion_albaran_quitar_hojas(uuid, text, text, bigint, int[]) is '[Envíos] Verificación de albaranes: tras quitar hojas de un PDF pendiente (p. ej. una factura con precios que se coló), apunta la bandeja al PDF nuevo (ruta junto al viejo, huella y tamaño) y guarda qué hojas se quitaron. Devuelve resultado (ok con ruta_anterior para borrar el viejo, no_pendiente, no_es_pdf, datos_no_validos, duplicado). Quién: el equipo de Dynamo (no los de solo lectura), desde el servidor al aceptar. Argumentos: p_id: documentos_entrada.id · p_ruta: dónde está el PDF nuevo · p_sha256: su huella · p_tamano: sus bytes · p_hojas: números de las hojas quitadas (1 = la primera).';
comment on column documentos_entrada.datos is 'formato: JSON | rango: no aplica | lista: no aplica | automático | Lo demás que trae el nombre o el origen (fecha, CP y población de origen y destino, matrículas, carpeta) y, si se quitaron hojas al verificarlo, cuáles (hojas_quitadas, números del PDF original).';

-- Al entrar un archivo, también se compara con la huella original de los que se aceptaron (o
-- siguen pendientes) después de quitarles hojas: el mismo PDF de antes no vuelve a salir.
do $$
declare v_def text := pg_get_functiondef('public.entrada_documento_confirmar(uuid, text, bigint, text)'::regprocedure); v_nuevo text;
begin
  v_nuevo := replace(v_def,
    'select id into v_otro from documentos_entrada where sha256 = p_sha256 and estado in (''pendiente'', ''aceptado'') and id <> p_id limit 1;',
    'select id into v_otro from documentos_entrada where (sha256 = p_sha256 or datos ->> ''sha256_original'' = p_sha256) and estado in (''pendiente'', ''aceptado'') and id <> p_id limit 1;');
  if v_nuevo = v_def then raise exception 'entrada_documento_confirmar: no se ha encontrado la comprobación de duplicados'; end if;
  execute v_nuevo;
end $$;
comment on column documentos_entrada.datos is 'formato: JSON | rango: no aplica | lista: no aplica | automático | Lo demás que trae el nombre o el origen (fecha, CP y población de origen y destino, matrículas, carpeta) y, si se quitaron hojas al verificarlo, cuáles (hojas_quitadas, números del PDF original) y la huella del PDF tal como llegó (sha256_original), para no volver a meterlo si llega igual.';
