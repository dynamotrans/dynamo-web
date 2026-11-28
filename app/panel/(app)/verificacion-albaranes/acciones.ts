'use server';

import { mensajeError } from '@/lib/mensajeError';
import { soloGestor } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

// Verificación de albaranes (usuario, 2026-11-22): aceptar, rechazar, cambiar de envío o de
// tipo. Lo decide todo la base de datos (solo el equipo de Dynamo, no los de solo lectura).
type Res = { ok: true; nombre?: string } | { ok: false; error: string };
const MSG: Record<string, string> = {
  sin_envio: 'No hay ningún envío con esa referencia GX.', sin_envio_aceptar: 'Este documento no tiene envío: escribe su referencia GX antes de aceptarlo.', no_pendiente: 'Este documento ya no está pendiente (otra persona lo ha revisado).',
  referencia_no_valida: 'Escribe una referencia como GX66081.', tipo_no_valido: 'Tipo de documento no válido.',
  no_es_pdf: 'Solo se pueden quitar hojas de un PDF.', duplicado: 'Sin esas hojas queda igual que otro albarán que ya está en la plataforma: recházalo.',
  datos_no_validos: 'No se han podido quitar las hojas. Vuelve a intentarlo.',
};
const fallo = (r: string | undefined) => ({ ok: false as const, error: MSG[r ?? ''] ?? 'No se ha podido guardar. Vuelve a intentarlo.' });

// «Quitar esta hoja» (usuario, 2026-11-28): si se marcaron hojas, antes de aceptar se hace un PDF
// nuevo sin ellas y la bandeja pasa a apuntar a él; el cliente solo recibe ese. El original sigue
// en Drive. quitar = números de hoja (1 = la primera); nunca todas (para eso, Rechazar).
export async function aceptarAlbaran(id: string, tipo: string, quitar: number[] = []): Promise<Res> {
  comprobarEntrada("app/panel/(app)/verificacion-albaranes/acciones#aceptarAlbaran", [id, tipo, quitar]);
  const s = await soloGestor();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo.' };
  if (quitar.length) {
    const q = await quitarHojas(s.supabase, id, quitar);
    if (!q.ok) return q;
  }
  const { data, error } = await s.supabase.rpc('verificacion_albaran_aceptar', { p_id: id, p_tipo: tipo });
  if (error) return { ok: false, error: mensajeError(error.message) };
  const r = data as { resultado: string };
  return r.resultado === 'ok' ? { ok: true } : fallo(r.resultado === 'sin_envio' ? 'sin_envio_aceptar' : r.resultado);
}

type Sb = NonNullable<Awaited<ReturnType<typeof soloGestor>>>['supabase'];
async function quitarHojas(sb: Sb, id: string, quitar: number[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const hojas = [...new Set(quitar)].sort((x, y) => x - y);
  if (hojas.some((h) => !Number.isInteger(h) || h < 1 || h > 1000)) return fallo('datos_no_validos');
  // La fila solo se ve con la sesión del equipo de Dynamo (y solo si sigue pendiente).
  const { data: fila } = await sb.from('documentos_entrada').select('storage_ruta, tipo_mime').eq('id', id).eq('estado', 'pendiente').maybeSingle();
  if (!fila) return fallo('no_pendiente');
  if (fila.tipo_mime && fila.tipo_mime !== 'application/pdf') return fallo('no_es_pdf');
  const almacen = (supabaseServicio() ?? sb).storage.from('documentos');
  const { data: blob } = await almacen.download(fila.storage_ruta);
  if (!blob) return { ok: false, error: 'No se ha podido leer el archivo. Vuelve a intentarlo.' };
  let doc: PDFDocument;
  try { doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer())); }
  catch { return { ok: false, error: 'Este PDF está protegido o dañado y no se le pueden quitar hojas. Recházalo y súbelo limpio a mano.' }; }
  const total = doc.getPageCount();
  if (hojas.some((h) => h > total)) return fallo('datos_no_validos');
  if (hojas.length >= total) return { ok: false, error: 'No se pueden quitar todas las hojas. Si no vale ninguna, recházalo.' };
  for (const h of [...hojas].reverse()) doc.removePage(h - 1);
  const bytes = await doc.save();
  const ruta = `entrada/${id}-h${Date.now()}.pdf`;
  const { error: eSubir } = await almacen.upload(ruta, bytes, { contentType: 'application/pdf', upsert: false });
  if (eSubir) return { ok: false, error: 'No se ha podido guardar el PDF sin esas hojas. Vuelve a intentarlo.' };
  const { data, error } = await sb.rpc('verificacion_albaran_quitar_hojas', {
    p_id: id, p_ruta: ruta, p_sha256: createHash('sha256').update(bytes).digest('hex'), p_tamano: bytes.length, p_hojas: hojas,
  });
  const r = (data ?? {}) as { resultado?: string; ruta_anterior?: string };
  if (error || r.resultado !== 'ok') {
    await almacen.remove([ruta]).catch(() => {});
    return error ? { ok: false, error: mensajeError(error.message) } : fallo(r.resultado);
  }
  // El de antes (con la hoja que sobraba) ya no lo usa nadie: fuera del almacén.
  if (r.ruta_anterior) await almacen.remove([r.ruta_anterior]).catch(() => {});
  return { ok: true };
}

export async function rechazarAlbaran(id: string, motivo: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/verificacion-albaranes/acciones#rechazarAlbaran", [id, motivo]);
  const s = await soloGestor();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo.' };
  const { data, error } = await s.supabase.rpc('verificacion_albaran_rechazar', { p_id: id, p_motivo: motivo });
  if (error) return { ok: false, error: mensajeError(error.message) };
  const r = data as { resultado: string; ruta?: string };
  if (r.resultado !== 'ok') return fallo(r.resultado);
  // El archivo se borra del almacén: rechazado, no se queda guardado en ningún sitio.
  if (r.ruta) await (supabaseServicio() ?? s.supabase).storage.from('documentos').remove([r.ruta]).catch(() => {});
  return { ok: true };
}

export async function reasignarAlbaran(id: string, referencia: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/verificacion-albaranes/acciones#reasignarAlbaran", [id, referencia]);
  const s = await soloGestor();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo.' };
  const { data, error } = await s.supabase.rpc('verificacion_albaran_reasignar', { p_id: id, p_referencia: referencia });
  if (error) return { ok: false, error: mensajeError(error.message) };
  const r = data as { resultado: string; nombre_archivo?: string };
  return r.resultado === 'ok' ? { ok: true, nombre: r.nombre_archivo } : fallo(r.resultado);
}

export async function tipoAlbaran(id: string, tipo: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/verificacion-albaranes/acciones#tipoAlbaran", [id, tipo]);
  const s = await soloGestor();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo.' };
  const { data, error } = await s.supabase.rpc('verificacion_albaran_tipo', { p_id: id, p_tipo: tipo });
  if (error) return { ok: false, error: mensajeError(error.message) };
  const r = data as { resultado: string };
  return r.resultado === 'ok' ? { ok: true } : fallo(r.resultado);
}

// Sugerencias (usuario, 2026-11-28): los envíos que encajan con un albarán sin envío, por lo que
// trae el nombre del archivo (matrículas, CP de origen y destino, fecha).
export type SugerenciaAlbaran = {
  id: string; referencia: string; estado: string; cliente: string | null; transportista: string | null; fecha_carga: string | null;
  origen: string | null; destino: string | null; matriculas_coinciden: boolean; origen_coincide: boolean; destino_coincide: boolean; dias: number;
};
export async function sugerenciasAlbaran(id: string): Promise<SugerenciaAlbaran[]> {
  comprobarEntrada("app/panel/(app)/verificacion-albaranes/acciones#sugerenciasAlbaran", [id]);
  const s = await soloGestor();
  if (!s) return [];
  const { data, error } = await s.supabase.rpc('verificacion_albaran_sugerencias', { p_id: id });
  if (error || !Array.isArray(data)) return [];
  return data as unknown as SugerenciaAlbaran[];
}
