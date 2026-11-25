'use server';

import { mensajeError } from '@/lib/mensajeError';
import { soloGestor } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type PenalizacionDatos = {
  envio_id: string; tipo_id: string; descripcion: string;
  importe_cliente: number | null; importe_transportista: number | null;
};
type Res = { ok: true; id: string } | { ok: false; error: string };

function traducir(msg: string): string {
  if (/ck_penalizacion_algun_importe/i.test(msg)) return 'Pon un importe mayor que 0, al cliente o al transportista.';
  if (/importe_.*check|violates check/i.test(msg)) return 'Los importes no pueden ser negativos.';
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return mensajeError(msg);   // los de las reglas de la base de datos ya vienen en castellano
}
const dynamo = async () => (await soloGestor())?.supabase ?? null;

export async function guardarPenalizacion(id: string | null, d: PenalizacionDatos): Promise<Res> {
  comprobarEntrada("app/panel/(app)/penalizaciones/acciones#guardarPenalizacion", [id, d]);
  const sb = await dynamo();
  if (!sb) return { ok: false, error: 'Solo el equipo de Dynamo gestiona penalizaciones.' };
  if (!d.envio_id) return { ok: false, error: 'Elige el envío al que corresponde la penalización.' };
  if (!d.tipo_id) return { ok: false, error: 'Elige el tipo de penalización.' };
  if (!((d.importe_cliente ?? 0) > 0) && !((d.importe_transportista ?? 0) > 0)) return { ok: false, error: 'Pon un importe mayor que 0, al cliente o al transportista: una penalización a 0 € no existe.' };
  const fila = { envio_id: d.envio_id, tipo_id: d.tipo_id, descripcion: d.descripcion.trim() || null,
    importe_cliente: d.importe_cliente, importe_transportista: d.importe_transportista };
  const q = id ? sb.from('penalizaciones').update(fila).eq('id', id).select('id').single()
               : sb.from('penalizaciones').insert(fila).select('id').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true, id: data.id };
}

export async function cambiarEstadoPenalizacion(id: string, estado: 'pendiente_confirmar' | 'confirmada' | 'cancelada'): Promise<Res> {
  comprobarEntrada("app/panel/(app)/penalizaciones/acciones#cambiarEstadoPenalizacion", [id, estado]);
  const sb = await dynamo();
  if (!sb) return { ok: false, error: 'Solo el equipo de Dynamo gestiona penalizaciones.' };
  const { error } = await sb.from('penalizaciones').update({ estado }).eq('id', id);
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true, id };
}

// Deshacer el último cambio de estado de una penalización (confirmarla, anularla, reabrirla)
// mientras corre su plazo (usuario, 2026-11-25): vuelve al estado de antes y no se avisa a nadie.
export async function deshacerCambioPenalizacion(id: string): Promise<{ ok: true; aviso: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/penalizaciones/acciones#deshacerCambioPenalizacion", [id]);
  const sb = await dynamo();
  if (!sb) return { ok: false, error: 'Solo el equipo de Dynamo gestiona penalizaciones.' };
  const { data, error } = await sb.rpc('deshacer_cambio', { p_tabla: 'penalizaciones', p_fila: id });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data ?? {}) as { resultado?: string };
  switch (r.resultado) {
    case 'deshecho': return { ok: true, aviso: 'Cambio deshecho: la penalización vuelve a como estaba y no se ha avisado a nadie.' };
    case 'ya_salio': return { ok: false, error: 'Ya es tarde: el aviso acaba de salir. Si hace falta, cambia la penalización de nuevo.' };
    case 'nada': return { ok: false, error: 'No queda nada por deshacer en esta penalización.' };
    default: return { ok: false, error: 'No se ha podido deshacer el cambio. Cambia la penalización a mano si hace falta.' };
  }
}
