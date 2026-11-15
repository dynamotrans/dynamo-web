import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { after } from 'next/server';
import type { SB } from '@/lib/supabase/cliente';
import { supabasePublico } from '@/lib/supabase/publico';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { cargarDatosCmrPorToken, emisionDeca } from '@/lib/pdf/datos';
import { pdfCmrDeDatosPublicos } from '@/lib/pdf/generar';

// ---- ARCHIVO AUTOMÁTICO DE COPIAS DEL CMR / DeCA (usuario, 2026-11-15) -----------------
// Resolución de 5-jun-2026, apdo. segundo.4, y Orden FOM/2861/2012, art. 9: los ficheros
// generados del documento de control se conservan al menos un año. El PDF se genera al
// vuelo cada vez que alguien lo abre, así que aquí se guarda una COPIA de cada versión:
//   · al cambiar el documento ya emitido (matrículas, transportista, ruta, fecha,
//     mercancía, cada firma), y
//   · cada vez que se sirve una versión que todavía no estaba guardada (red de seguridad).
// La copia es EXACTAMENTE el PDF del enlace público (el del QR), con su huella sha256, en
// `documentos` (tipo deca_copia). La base de datos no deja cambiarla ni borrarla en un año.
//
// Antes de la emisión (sin matrículas) el documento es un borrador y no se archiva.
// Quién escribe: la clave de servicio si está; si no, la sesión de Dynamo que dispara el
// cambio. Sin ninguna de las dos (firma pública en un despliegue sin clave de servicio) la
// copia se guarda en cuanto Dynamo abra la ficha o cambie algo. Nunca rompe la acción.

type Peticion = {
  envioId?: string;        // el envío (hace falta clave de servicio o sesión de Dynamo para hallar su enlace)
  token?: string;          // o el enlace del CMR, si ya se tiene
  reserva?: string;        // o la reserva de la página pública «aceptar carga» (solo con clave de servicio)
  sbDynamo?: SB | null;    // sesión del equipo de Dynamo, por si no hay clave de servicio
  origen?: string;         // dirección de la web que va en el QR (por defecto, la de la petición)
};

async function origenActual(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    return host ? `https://${host}` : 'https://www.dynamotrans.com';
  } catch { return 'https://www.dynamotrans.com'; }
}

// Guarda la copia si esa versión del documento aún no está archivada. Devuelve qué pasó
// (para los registros); no lanza nunca.
export async function archivarCopiaDeca(a: Peticion & { origen: string }): Promise<'guardada' | 'ya_estaba' | 'sin_emitir' | 'sin_enlace' | 'sin_permiso' | 'error'> {
  try {
    const escritor = supabaseServicio() ?? a.sbDynamo ?? null;
    const lector = supabasePublico();
    if (!escritor || !lector) return 'sin_permiso';

    let envioId = a.envioId ?? null;
    let token = a.token ?? null;
    if (!token) {
      if (!envioId && a.reserva) {
        envioId = (await escritor.from('envio_reservas').select('envio_id').eq('id', a.reserva).maybeSingle()).data?.envio_id ?? null;
      }
      if (!envioId) return 'sin_enlace';
      const { data: enl } = await escritor.from('cmr_enlaces').select('token').eq('envio_id', envioId).eq('revocado', false)
        .order('creado_en', { ascending: false }).limit(1).maybeSingle();
      token = enl?.token ?? null;
    }
    if (!token) return 'sin_enlace';

    // Los MISMOS datos y el mismo PDF que sirve el QR.
    const r = await cargarDatosCmrPorToken(lector, token);
    if (!r.datos || r.datos.manual || !r.decaCreado) return 'sin_enlace';
    if (!emisionDeca(r.datos)) return 'sin_emitir';
    envioId = String(r.datos.envio.id);

    // Versión = huella de TODO lo que pinta el documento (datos, firmas, modificaciones y
    // la dirección del QR). Misma versión → misma copia: no se guarda dos veces. El estado
    // del seguimiento no se pinta en el documento: no cuenta como versión nueva.
    const huellaDatos = createHash('sha256')
      .update(JSON.stringify({ o: a.origen, t: token, d: { ...r.datos, envio: { ...r.datos.envio, estado: undefined } } },
        (k, v) => (k === 'png' ? undefined : v)))
      .digest('hex').slice(0, 12);
    const ref = String(r.datos.envio.referencia_gx ?? 'envio').replace(/[^A-Za-z0-9-]/g, '');
    const nombre = `DeCA-${ref}-${huellaDatos}.pdf`;
    const { data: ya } = await escritor.from('documentos').select('id').eq('envio_id', envioId).eq('tipo', 'deca_copia')
      .eq('nombre_archivo', nombre).limit(1);
    if (ya?.length) return 'ya_estaba';

    const { bytes } = await pdfCmrDeDatosPublicos(r.datos, r.decaCreado, token, a.origen);
    const ruta = `envios/${envioId}/deca/${randomUUID()}/${nombre}`;
    const { error: eSubida } = await escritor.storage.from('documentos').upload(ruta, bytes, { contentType: 'application/pdf', upsert: false });
    if (eSubida) { console.error('[archivoDeca] no se ha podido subir la copia', { envioId, mensaje: eSubida.message }); return 'error'; }
    const { error } = await escritor.from('documentos').insert({
      envio_id: envioId, tipo: 'deca_copia', storage_bucket: 'documentos', storage_ruta: ruta, nombre_archivo: nombre,
      tipo_mime: 'application/pdf', tamano_bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), visible_cliente: false,
    });
    if (error) {
      // Dos a la vez con la misma versión: la segunda sobra (índice único). Su fichero se retira.
      await supabaseServicio()?.storage.from('documentos').remove([ruta]).catch(() => {});
      if (error.code === '23505') return 'ya_estaba';
      console.error('[archivoDeca] no se ha podido registrar la copia', { envioId, codigo: error.code, mensaje: error.message });
      return 'error';
    }
    return 'guardada';
  } catch (e) {
    console.error('[archivoDeca] fallo al archivar la copia', e);
    return 'error';
  }
}

// Lo mismo, pero DESPUÉS de responder: quien firma o guarda no espera a que se genere el
// PDF. Se llama desde las acciones y rutas que cambian o sirven el documento.
export async function programarCopiaDeca(a: Peticion): Promise<void> {
  try {
    const p = { ...a, origen: a.origen ?? await origenActual() };
    try { after(() => archivarCopiaDeca(p).then(() => {})); }
    catch { await archivarCopiaDeca(p); }
  } catch { /* archivar nunca rompe la acción que lo dispara */ }
}
