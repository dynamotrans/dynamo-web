-- =====================================================================================
-- DeCA Y CMR, DOS DOCUMENTOS CON CAMINOS DISTINTOS (usuario, 2026-11-15)
-- =====================================================================================
-- «Vamos a separar el PDF DeCA / CMR en 2… Llevarán caminos diferentes en cuanto a
-- mailing, registro, etc.» Hasta hoy el QR abría un único PDF con el DeCA delante y el CMR
-- con sus firmas detrás, y la plataforma lo llamaba «CMR / DeCA».
--   · El DeCA (documento de control) es un PDF propio, sin firmas, con su dirección
--     pública (/deca/<nº>), que se emite al ponerse las primeras matrículas y se envía
--     solo al transportista en cada versión.
--   · El CMR (carta de porte) sigue como estaba —página de firmas, PDF y emails—, pero se
--     llama «CMR», sin «/ DeCA».
-- Aquí va la parte de base de datos: el tipo de email del DeCA y los textos.

-- 1. Tipo de email nuevo: el DeCA al transportista ---------------------------------------
alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo',
                  'difusion', 'difusion_fin', 'difusion_recordatorio', 'aviso_entrega',
                  'aviso_parada', 'aviso_parada_cancelada', 'cuenta_suspendida',
                  'envio_aceptado', 'alta_pendiente', 'deca'));
comment on column public.emails_enviados.tipo is 'formato: texto | rango: no aplica | lista: matriculas · vispera · orden_carga · firma_cmr · cmr_completo · difusion · difusion_fin · difusion_recordatorio · aviso_entrega · aviso_parada · aviso_parada_cancelada · cuenta_suspendida · envio_aceptado · alta_pendiente · deca (el DeCA en PDF al transportista, en cada versión) | obligatorio | Qué aviso es. Ej. OK: matriculas';

-- 2. Las copias archivadas son del DeCA (no del «CMR / DeCA») ----------------------------
do $$
declare v_def text; v_nueva text;
begin
  v_def := pg_get_functiondef('public.fn_documentos_deca_copia()'::regprocedure);
  v_nueva := replace(v_def, 'CMR / DeCA', 'DeCA');
  if v_nueva = v_def then raise exception 'No encuentro los textos esperados en fn_documentos_deca_copia: revisar antes de aplicar.'; end if;
  execute v_nueva;
end $$;
comment on function public.fn_documentos_deca_copia() is '[Documentos] Candado de las copias archivadas del DeCA (tipo deca_copia): las guarda solo el servidor o el equipo de Dynamo, con envío, huella y tamaño, nunca visibles para el cliente; durante un año no se cambian, no se quitan y no se borran (Resolución de 5-jun-2026, apdo. segundo.4; Orden FOM/2861/2012, art. 9). Quién: interno (disparador de documentos).';
comment on column public.documentos.tipo is 'formato: texto | rango: no aplica | lista: albaran, cmr, cmr_firmado, orden_carga, proforma, seguro_cmr (seguro del transportista), tarjeta_transporte, foto_incidencia, gps_tacografo (prueba GPS/tacógrafo del viaje), hoja_cif, dni, logo (de un operador), adjunto, otro, deca_copia (copia archivada sola del DeCA; no se toca en un año) | obligatorio | Clase de documento. Ej. OK: albaran · Ej. mal: factura';

-- 3. Lo que se firma es el CMR: fuera «/ DeCA» de avisos, emails y comentarios -----------
-- Todas las funciones que lo nombran (avisos a los sitios, recordatorio de matrículas…) se
-- reescriben tal cual están en vivo, cambiando solo ese texto.
do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid, p.oid::regprocedure::text as firma
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%CMR / DeCA%'
  loop
    execute replace(pg_get_functiondef(r.oid), 'CMR / DeCA', 'CMR');
    n := n + 1;
    raise notice 'Texto «CMR / DeCA» → «CMR» en %', r.firma;
  end loop;
  if n = 0 then raise exception 'No encuentro ninguna función con el texto «CMR / DeCA»: revisar antes de aplicar.'; end if;
  for r in
    select p.oid::regprocedure::text as firma, d.description
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      join pg_description d on d.objoid = p.oid and d.classoid = 'pg_proc'::regclass and d.objsubid = 0
     where s.nspname = 'public' and d.description like '%CMR / DeCA%'
  loop
    execute format('comment on function %s is %L', r.firma, replace(r.description, 'CMR / DeCA', 'CMR'));
  end loop;
end $$;
update parametros set descripcion = replace(descripcion, 'CMR / DeCA', 'CMR') where descripcion like '%CMR / DeCA%';
