-- =====================================================================================
-- ARCHIVO AUTOMÁTICO DE COPIAS DEL DeCA (usuario, 2026-11-15)
-- =====================================================================================
-- Resolución de 5-jun-2026 (BOE-A-2026-12784), apdo. segundo.4, y Orden FOM/2861/2012,
-- art. 9: los ficheros electrónicos generados del documento de control se conservan al
-- menos UN AÑO. Hasta hoy el PDF se generaba al vuelo cada vez que alguien lo abría y no
-- quedaba copia de cada versión (solo los datos, con su histórico).
--
-- Desde hoy la plataforma guarda sola una copia del PDF cada vez que el documento cambia
-- una vez EMITIDO (primeras matrículas, cambio de matrículas, de transportista, de ruta,
-- de fecha, de mercancía, cada firma…) y cada vez que se sirve una versión que aún no
-- estaba guardada. Cada copia es una fila de `documentos` de tipo `deca_copia`, con su
-- huella sha256, y su fichero en el bucket privado.
--
-- Lo que pone esta migración:
--   1. El tipo de documento `deca_copia`.
--   2. Una sola copia por versión (el nombre lleva la huella de los datos del documento).
--   3. Candado: una copia no se cambia, no se quita ni se borra durante un año, la guarda
--      solo el servidor o el equipo de Dynamo, y nunca la ve el cliente.
--   4. El borrado de datos de prueba suelta ese candado mientras borra (como con los
--      hitos y las firmas).

-- 1. Tipo nuevo --------------------------------------------------------------------------
alter table public.documentos drop constraint documentos_tipo_check;
alter table public.documentos add constraint documentos_tipo_check check (tipo = any (array[
  'albaran', 'cmr', 'cmr_firmado', 'orden_carga', 'proforma', 'seguro_cmr', 'tarjeta_transporte',
  'foto_incidencia', 'gps_tacografo', 'hoja_cif', 'dni', 'logo', 'adjunto', 'otro', 'deca_copia']));
comment on column public.documentos.tipo is 'formato: texto | rango: no aplica | lista: albaran, cmr, cmr_firmado, orden_carga, proforma, seguro_cmr (seguro del transportista), tarjeta_transporte, foto_incidencia, gps_tacografo (prueba GPS/tacógrafo del viaje), hoja_cif, dni, logo (de un operador), adjunto, otro, deca_copia (copia archivada sola del CMR / DeCA; no se toca en un año) | obligatorio | Clase de documento. Ej. OK: albaran · Ej. mal: factura';

-- 2. Una copia por versión del documento -----------------------------------------------
create unique index ux_documentos_deca_copia on public.documentos (envio_id, nombre_archivo) where tipo = 'deca_copia';

-- 3. Candado de las copias ---------------------------------------------------------------
create or replace function public.fn_documentos_deca_copia()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.tipo = 'deca_copia' then
      if not (es_servidor() or es_equipo_dynamo()) then
        raise exception 'Las copias archivadas del CMR / DeCA las guarda la plataforma.';
      end if;
      if new.envio_id is null or new.sha256 is null or new.tamano_bytes is null then
        raise exception 'Una copia archivada del CMR / DeCA lleva su envío, su huella y su tamaño.';
      end if;
      new.visible_cliente := false;
      new.borrado := false;
      new.borrado_en := null;
      new.es_recurso := false;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.tipo = 'deca_copia' and old.tipo <> 'deca_copia' then
      raise exception 'Un documento no se convierte en copia archivada del CMR / DeCA.';
    end if;
    if old.tipo = 'deca_copia' and old.creado_en > now() - interval '1 year' then
      raise exception 'Las copias archivadas del CMR / DeCA no se cambian ni se quitan durante un año (conservación legal).';
    end if;
    return new;
  end if;
  if old.tipo = 'deca_copia' and old.creado_en > now() - interval '1 year' then
    raise exception 'Las copias archivadas del CMR / DeCA no se borran durante un año (conservación legal).';
  end if;
  return old;
end $$;
revoke execute on function public.fn_documentos_deca_copia() from public, anon, authenticated;
comment on function public.fn_documentos_deca_copia() is '[Documentos] Candado de las copias archivadas del CMR / DeCA (tipo deca_copia): las guarda solo el servidor o el equipo de Dynamo, con envío, huella y tamaño, nunca visibles para el cliente; durante un año no se cambian, no se quitan y no se borran (Resolución de 5-jun-2026, apdo. segundo.4; Orden FOM/2861/2012, art. 9). Quién: interno (disparador de documentos).';
create trigger tg_documentos_deca_copia before insert or update or delete on public.documentos
  for each row execute function public.fn_documentos_deca_copia();

-- 4. El borrado de datos de prueba suelta el candado mientras borra ---------------------
-- (La función solo existe en el entorno de pruebas: si no está, no hay nada que tocar.)
do $$
declare v_def text; v_nueva text; v_oid oid;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'borrar_datos_de_prueba';
  if v_oid is null then
    raise notice 'borrar_datos_de_prueba no existe aquí: nada que tocar.';
    return;
  end if;
  v_def := pg_get_functiondef(v_oid);
  v_nueva := replace(v_def, 'alter table auditoria disable trigger tg_auditoria_inmutable;',
    'alter table auditoria disable trigger tg_auditoria_inmutable;' || chr(10) || '  alter table documentos disable trigger tg_documentos_deca_copia;');
  if v_nueva = v_def then raise exception 'No encuentro donde se sueltan los candados en borrar_datos_de_prueba: revisar antes de aplicar.'; end if;
  v_def := v_nueva;
  v_nueva := replace(v_def, 'alter table auditoria enable trigger tg_auditoria_inmutable;',
    'alter table auditoria enable trigger tg_auditoria_inmutable;' || chr(10) || '  alter table documentos enable trigger tg_documentos_deca_copia;');
  if v_nueva = v_def then raise exception 'No encuentro donde se vuelven a poner los candados en borrar_datos_de_prueba: revisar antes de aplicar.'; end if;
  execute v_nueva;
end $$;
