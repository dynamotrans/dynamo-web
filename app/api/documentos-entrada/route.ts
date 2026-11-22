import { createHash } from 'node:crypto';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { tipoReal } from '@/lib/contenidoArchivo';
import { leerNombreAlbaran, mismaClave } from '@/lib/documentosEntrada';

// ENTRADA DE ALBARANES (usuario, 2026-11-22): por aquí sube los albaranes, CMR y DeCA firmados
// el script de Google que vigila la carpeta de Drive donde la tarea de Claude los deja (ver
// tools/apps-script/). Solo con la clave secreta ENTRADA_DOCUMENTOS_TOKEN (Vercel, Sensitive),
// en la cabecera «Authorization: Bearer …». Dos pasos, para que el archivo vaya DIRECTO al
// almacén (sin el límite de 4,5 MB de una petición a Vercel):
//   1. {"accion":"iniciar","nombre":"GX…pdf","origen_id":"<id de Drive>"} → {"id","subir_a"}
//      (o {"resultado":"ya_existe"}: ese archivo ya entró y no se vuelve a subir).
//   2. PUT del archivo a «subir_a» (Content-Type del archivo).
//   3. {"accion":"confirmar","id":"…"} → se mira que es un PDF o una imagen DE VERDAD, se
//      descarta si es repetido y queda en «Verificación de albaranes», invisible al cliente.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const MAX = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const clave = process.env.ENTRADA_DOCUMENTOS_TOKEN ?? '';
  const dada = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (clave.length < 24 || !mismaClave(dada, clave)) return json({ resultado: 'sin_permiso' }, 401);
  const sb = supabaseServicio();
  if (!sb) return json({ resultado: 'sin_configurar' }, 503);
  let p: { accion?: string; nombre?: string; origen?: string; origen_id?: string; id?: string; datos?: Record<string, unknown> };
  try { p = await req.json(); } catch { return json({ resultado: 'datos_no_validos' }, 400); }

  if (p.accion === 'iniciar') {
    const nombre = String(p.nombre ?? '').slice(0, 200);
    const leido = leerNombreAlbaran(nombre);
    const datos = { ...(typeof p.datos === 'object' && p.datos ? p.datos : {}), ...leido };
    const { data, error } = await sb.rpc('entrada_documento_iniciar', { p_nombre: nombre, p_origen: p.origen ?? 'drive', p_origen_id: p.origen_id ? String(p.origen_id) : null, p_datos: datos });
    if (error) { console.error('[entrada documentos] iniciar', error.message); return json({ resultado: 'fallo' }, 500); }
    const r = data as { resultado: string; id?: string; ruta?: string };
    if (r.resultado !== 'ok' || !r.ruta) return json(r, r.resultado === 'ya_existe' ? 200 : 400);
    const { data: s, error: e2 } = await sb.storage.from('documentos').createSignedUploadUrl(r.ruta, { upsert: true });
    if (e2 || !s) { console.error('[entrada documentos] enlace de subida', e2?.message); return json({ resultado: 'fallo' }, 500); }
    return json({ resultado: 'ok', id: r.id, subir_a: s.signedUrl });
  }

  if (p.accion === 'confirmar' && /^[0-9a-f-]{36}$/i.test(String(p.id ?? ''))) {
    const { data: fila } = await sb.from('documentos_entrada').select('id, storage_ruta, estado').eq('id', p.id!).maybeSingle();
    if (!fila) return json({ resultado: 'no_existe' }, 404);
    if (fila.estado !== 'subiendo') return json({ resultado: 'ya_existe', estado: fila.estado });
    const { data: blob, error } = await sb.storage.from('documentos').download(fila.storage_ruta);
    if (error || !blob) return json({ resultado: 'sin_archivo' }, 400);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const tipo = tipoReal(bytes.subarray(0, 64));
    // Lo que no es un PDF ni una imagen de verdad (o pasa de 25 MB) no entra: se borra.
    if (!tipo || bytes.length > MAX || bytes.length < 100) {
      await sb.storage.from('documentos').remove([fila.storage_ruta]);
      await sb.from('documentos_entrada').delete().eq('id', fila.id);
      return json({ resultado: 'contenido_no_valido' }, 400);
    }
    const sha = createHash('sha256').update(bytes).digest('hex');
    const { data, error: e3 } = await sb.rpc('entrada_documento_confirmar', { p_id: fila.id, p_sha256: sha, p_tamano: bytes.length, p_mime: tipo });
    if (e3) { console.error('[entrada documentos] confirmar', e3.message); return json({ resultado: 'fallo' }, 500); }
    const r = data as { resultado: string; ruta?: string };
    if (r.resultado === 'duplicado' && r.ruta) await sb.storage.from('documentos').remove([r.ruta]);
    return json(r);
  }
  return json({ resultado: 'accion_no_valida' }, 400);
}
