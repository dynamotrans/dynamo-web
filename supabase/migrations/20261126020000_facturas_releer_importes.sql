-- =====================================================================================
-- COPIA DE FACTURAS: VOLVER A LEERLO TODO (usuario, 2026-11-26: «salen todas a 0»)
-- =====================================================================================
-- La facturación manda los importes con COMA decimal («240,00») y el servidor solo entendía el
-- punto: las 632 facturas de la primera carga se guardaron con base, IVA, total y pendiente a
-- 0,00 €. El lector ya entiende las dos formas (lib/holdedFacturas.ts, importeDe). Aquí solo se
-- le dice a la copia que su primera carga no vale: en la siguiente pasada el servidor vuelve a
-- leer los últimos 12 meses y todo lo pendiente, y corrige cada fila (no se borra ninguna).
update public.facturas_copia_estado
   set carga_completa_en = null, barrido_tipo = null, barrido_desde = null, barrido_hasta = null, barrido_cobros = null, barrido_inicio_en = null,
       repaso_en = null, repaso_desde = null, repaso_inicio_en = null, ultima_en = null, ultima_ok_en = null, error = null
 where id;
