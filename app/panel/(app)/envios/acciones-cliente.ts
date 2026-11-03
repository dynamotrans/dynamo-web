'use server';

import { sesion } from '@/lib/sesion';

// Lo que el CLIENTE puede hacer con un envío suyo. Todo pasa por funciones de la base de
// datos que comprueban que el envío es suyo (no hay escritura directa en `envios`).
type Res = { ok: true; aviso?: string } | { ok: false; error: string };
async function soloCliente() {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || s.perfil.rol !== 'cliente') return null;
  return s;
}
const limpio = (m: string) => (/42501|permission/i.test(m) ? 'No tienes permiso para hacer esto.' : m);

export async function responderPrecio(envio: string, acepta: boolean): Promise<Res> {
  const s = await soloCliente();
  if (!s) return { ok: false, error: 'Solo el cliente responde a su precio.' };
  const { data, error } = await s.supabase.rpc('responder_precio_solicitud', { p_envio: envio, p_acepta: acepta });
  if (error) return { ok: false, error: limpio(error.message) };
  if (data === 'caducado') return { ok: false, error: 'El precio ha caducado. Te pasamos uno nuevo en un momento.' };
  return { ok: true, aviso: acepta ? 'Envío confirmado. Ya está programado y buscamos el camión.' : 'Solicitud cancelada, sin ningún coste.' };
}

export async function cancelarMiEnvio(envio: string, motivo: string): Promise<Res> {
  const s = await soloCliente();
  if (!s) return { ok: false, error: 'Solo el cliente cancela su envío.' };
  const { data, error } = await s.supabase.rpc('cancelar_mi_envio', { p_envio: envio, p_motivo: motivo.trim() || null });
  if (error) return { ok: false, error: limpio(error.message) };
  const r = data as { penalizacion?: boolean; importe?: number | null };
  return { ok: true, aviso: r?.penalizacion
    ? 'Envío cancelado. Como se ha cancelado fuera de plazo con el camión ya asignado, se aplica el coste de cancelación (lo verás en Penalizaciones).'
    : 'Envío cancelado, sin ningún coste.' };
}

// Envíos MANUALES (con su propio operador): el cliente lleva el estado.
export async function marcarMiEnvioManual(envio: string, estado: string): Promise<Res> {
  const s = await soloCliente();
  if (!s) return { ok: false, error: 'Solo el cliente lleva sus envíos manuales.' };
  const { error } = await s.supabase.rpc('marcar_mi_envio_manual', { p_envio: envio, p_estado: estado });
  return error ? { ok: false, error: limpio(error.message) } : { ok: true, aviso: 'Estado actualizado.' };
}
