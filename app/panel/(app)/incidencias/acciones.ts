'use server';

import { mensajeError } from '@/lib/mensajeError';
import { sesion, esGestor } from '@/lib/sesion';

export type IncidenciaDatos = {
  envio_id: string | null; cliente_id: string | null; tipo_id: string;
  estado: 'abierto' | 'en_curso' | 'resuelto' | 'cancelado'; prioridad: 'baja' | 'media' | 'alta' | 'critica';
  titulo: string; detalle: string; resolucion: string;
};
type Res = { ok: true; id: string } | { ok: false; error: string };

function traducir(msg: string): string {
  if (/titulo/i.test(msg) && /check|null/i.test(msg)) return 'Escribe un resumen de la incidencia.';
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return mensajeError(msg);   // los de las reglas de la base de datos ya vienen en castellano
}

export async function guardarIncidencia(id: string | null, d: IncidenciaDatos): Promise<Res> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return { ok: false, error: 'No tienes permiso para hacer esto.' };
  const transportista = s.perfil.rol === 'transportista';
  const cliente = s.perfil.rol === 'cliente' || transportista;   // los dos «de fuera»: mismas limitaciones
  if (!cliente && !esGestor(s.perfil.rol)) return { ok: false, error: 'No tienes permiso para hacer esto.' };
  if (transportista && !id && !d.envio_id) return { ok: false, error: 'Elige el envío de la incidencia.' };
  // El CLIENTE abre y amplía las suyas, o las retira; el estado, la prioridad y la
  // resolución son de Dynamo (y lo vuelve a imponer la base de datos).
  if (cliente) {
    if (!d.tipo_id) return { ok: false, error: 'Elige el tipo de incidencia.' };
    if (!d.detalle.trim()) return { ok: false, error: 'Cuenta lo ocurrido en el detalle de la incidencia.' };
    const { data: yo } = await s.supabase.from('usuarios').select('cliente_id').eq('id', s.user.id).maybeSingle();
    const fila: Record<string, unknown> = {
      envio_id: d.envio_id, tipo_id: d.tipo_id, titulo: d.titulo.trim() || d.detalle.trim().slice(0, 80), detalle: d.detalle.trim(),
      estado: d.estado === 'cancelado' ? 'cancelado' : 'abierto',
    };
    if (!id && !transportista) fila.cliente_id = yo?.cliente_id ?? null;   // la del transportista la completa la base de datos
    const q = id ? s.supabase.from('incidencias').update(fila).eq('id', id).select('id').single()
                 : s.supabase.from('incidencias').insert(fila).select('id').single();
    const { data, error } = await q;
    if (error) return { ok: false, error: traducir(error.message) };
    return { ok: true, id: data.id };
  }
  if (!d.tipo_id) return { ok: false, error: 'Elige el tipo de incidencia.' };
  if (!d.detalle.trim()) return { ok: false, error: 'Cuenta lo ocurrido en el detalle de la incidencia.' };
  if (!d.envio_id && !d.cliente_id) return { ok: false, error: 'Elige el envío o, si no va sobre un envío, el cliente.' };
  const fila: Record<string, unknown> = {
    envio_id: d.envio_id, tipo_id: d.tipo_id, estado: d.estado, prioridad: d.prioridad,
    titulo: d.titulo.trim() || d.detalle.trim().slice(0, 80), detalle: d.detalle.trim(),
    resolucion: d.resolucion.trim() || null,
  };
  // Con envío, el cliente lo pone la base de datos (el del envío); sin envío, el elegido.
  if (!d.envio_id) fila.cliente_id = d.cliente_id;
  const q = id ? s.supabase.from('incidencias').update(fila).eq('id', id).select('id').single()
               : s.supabase.from('incidencias').insert(fila).select('id').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true, id: data.id };
}
