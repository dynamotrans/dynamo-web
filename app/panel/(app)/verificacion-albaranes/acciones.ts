'use server';

import { mensajeError } from '@/lib/mensajeError';
import { soloGestor } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { supabaseServicio } from '@/lib/supabase/servicio';

// Verificación de albaranes (usuario, 2026-11-22): aceptar, rechazar, cambiar de envío o de
// tipo. Lo decide todo la base de datos (solo el equipo de Dynamo, no los de solo lectura).
type Res = { ok: true; nombre?: string } | { ok: false; error: string };
const MSG: Record<string, string> = {
  sin_envio: 'No hay ningún envío con esa referencia GX.', sin_envio_aceptar: 'Este documento no tiene envío: escribe su referencia GX antes de aceptarlo.', no_pendiente: 'Este documento ya no está pendiente (otra persona lo ha revisado).',
  referencia_no_valida: 'Escribe una referencia como GX66081.', tipo_no_valido: 'Tipo de documento no válido.',
};
const fallo = (r: string | undefined) => ({ ok: false as const, error: MSG[r ?? ''] ?? 'No se ha podido guardar. Vuelve a intentarlo.' });

export async function aceptarAlbaran(id: string, tipo: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/verificacion-albaranes/acciones#aceptarAlbaran", [id, tipo]);
  const s = await soloGestor();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo.' };
  const { data, error } = await s.supabase.rpc('verificacion_albaran_aceptar', { p_id: id, p_tipo: tipo });
  if (error) return { ok: false, error: mensajeError(error.message) };
  const r = data as { resultado: string };
  return r.resultado === 'ok' ? { ok: true } : fallo(r.resultado === 'sin_envio' ? 'sin_envio_aceptar' : r.resultado);
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
