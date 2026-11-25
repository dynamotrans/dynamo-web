'use server';

import { mensajeError } from '@/lib/mensajeError';
import { sesion, esGestor } from '@/lib/sesion';
import type { TablaInsert, TablaUpdate } from '@/lib/supabase/tipos';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

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
  comprobarEntrada("app/panel/(app)/incidencias/acciones#guardarIncidencia", [id, d]);
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
    const q = id ? s.supabase.from('incidencias').update(fila as TablaUpdate<'incidencias'>).eq('id', id).select('id').single()
                 : s.supabase.from('incidencias').insert(fila as TablaInsert<'incidencias'>).select('id').single();
    const { data, error } = await q;
    if (error) return { ok: false, error: traducir(error.message) };
    return { ok: true, id: data.id };
  }
  if (!d.tipo_id) return { ok: false, error: 'Elige el tipo de incidencia.' };
  if (!d.detalle.trim()) return { ok: false, error: 'Cuenta lo ocurrido en el detalle de la incidencia.' };
  // «Ver como» un transportista: la incidencia sin envío es DE ESE transportista (sin
  // cliente), así que no hay cliente que elegir (usuario, 2026-11-09).
  const { vistaCruda } = await import('@/lib/vista');
  const vista = await vistaCruda();
  const deTransportista = vista.tipo === 'transportista' && !d.envio_id;
  if (!deTransportista && !d.envio_id && !d.cliente_id) return { ok: false, error: 'Elige el envío o, si no va sobre un envío, el cliente.' };
  const fila: Record<string, unknown> = {
    envio_id: d.envio_id, tipo_id: d.tipo_id, estado: d.estado, prioridad: d.prioridad,
    titulo: d.titulo.trim() || d.detalle.trim().slice(0, 80), detalle: d.detalle.trim(),
    resolucion: d.resolucion.trim() || null,
  };
  // Con envío, el cliente lo pone la base de datos (el del envío); sin envío, el elegido
  // (o, en la vista de un transportista, ese transportista y sin cliente).
  if (deTransportista && !id) { fila.transportista_id = vista.id; fila.cliente_id = null; }
  else if (!d.envio_id) fila.cliente_id = d.cliente_id;
  const q = id ? s.supabase.from('incidencias').update(fila as TablaUpdate<'incidencias'>).eq('id', id).select('id').single()
               : s.supabase.from('incidencias').insert(fila as TablaInsert<'incidencias'>).select('id').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true, id: data.id };
}

// Deshacer el último cambio de una incidencia mientras corre su plazo (usuario, 2026-11-25:
// «incluye incidencias, penalizaciones — 60 segundos»): recién abierta queda retirada; un
// cambio de estado vuelve al de antes; y sus emails y avisos no salen.
export async function deshacerCambioIncidencia(id: string): Promise<{ ok: true; aviso: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/incidencias/acciones#deshacerCambioIncidencia", [id]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const { data, error } = await s.supabase.rpc('deshacer_cambio', { p_tabla: 'incidencias', p_fila: id });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data ?? {}) as { resultado?: string; tipo?: string };
  switch (r.resultado) {
    case 'deshecho':
      return { ok: true, aviso: r.tipo === 'creada' ? 'Incidencia retirada: no se ha avisado a nadie.' : 'Cambio deshecho: la incidencia vuelve a como estaba y no se ha avisado a nadie.' };
    case 'ya_salio': return { ok: false, error: 'Ya es tarde: el aviso acaba de salir. Si hace falta, cambia la incidencia de nuevo.' };
    case 'nada': return { ok: false, error: 'No queda nada por deshacer en esta incidencia.' };
    default: return { ok: false, error: 'No se ha podido deshacer el cambio. Cambia la incidencia a mano si hace falta.' };
  }
}
