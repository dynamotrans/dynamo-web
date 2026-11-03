'use server';

import { sesion, esGestor } from '@/lib/sesion';

export type PenalizacionDatos = {
  envio_id: string; tipo_id: string; descripcion: string;
  importe_cliente: number | null; importe_transportista: number | null;
};
type Res = { ok: true; id: string } | { ok: false; error: string };

function traducir(msg: string): string {
  if (/ck_penalizacion_algun_importe/i.test(msg)) return 'Pon al menos un importe (al cliente o al transportista).';
  if (/importe_.*check|violates check/i.test(msg)) return 'Los importes no pueden ser negativos.';
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return msg;
}
async function dynamo() {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return null;
  return s.supabase;
}

export async function guardarPenalizacion(id: string | null, d: PenalizacionDatos): Promise<Res> {
  const sb = await dynamo();
  if (!sb) return { ok: false, error: 'Solo el equipo de Dynamo gestiona penalizaciones.' };
  if (!d.envio_id) return { ok: false, error: 'Elige el envío al que corresponde la penalización.' };
  if (!d.tipo_id) return { ok: false, error: 'Elige el tipo de penalización.' };
  if (d.importe_cliente == null && d.importe_transportista == null) return { ok: false, error: 'Pon al menos un importe (al cliente o al transportista).' };
  const fila = { envio_id: d.envio_id, tipo_id: d.tipo_id, descripcion: d.descripcion.trim() || null,
    importe_cliente: d.importe_cliente, importe_transportista: d.importe_transportista };
  const q = id ? sb.from('penalizaciones').update(fila).eq('id', id).select('id').single()
               : sb.from('penalizaciones').insert(fila).select('id').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true, id: data.id };
}

export async function cambiarEstadoPenalizacion(id: string, estado: 'pendiente_confirmar' | 'confirmada' | 'cancelada'): Promise<Res> {
  const sb = await dynamo();
  if (!sb) return { ok: false, error: 'Solo el equipo de Dynamo gestiona penalizaciones.' };
  const { error } = await sb.from('penalizaciones').update({ estado }).eq('id', id);
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true, id };
}
