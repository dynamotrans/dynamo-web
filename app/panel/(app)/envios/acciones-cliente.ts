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

// Puntuar al transportista de un envío entregado (1 a 5 estrellas y comentario). Lo
// comprueba todo la base de datos (valorar_mi_envio): su envío, de Dynamo, entregado.
export async function valorarMiEnvio(envio: string, nota: number, comentario: string): Promise<Res> {
  const s = await soloCliente();
  if (!s) return { ok: false, error: 'Solo el cliente valora su envío.' };
  const { error } = await s.supabase.rpc('valorar_mi_envio', { p_envio: envio, p_nota: Math.round(nota), p_comentario: comentario.slice(0, 500) });
  if (error) return { ok: false, error: limpio(error.message) };
  return { ok: true, aviso: '¡Gracias por tu valoración! Nos ayuda a trabajar con los mejores transportistas.' };
}

// Envíos MANUALES (con su propio operador): el cliente lleva el estado.
export async function marcarMiEnvioManual(envio: string, estado: string): Promise<Res> {
  const s = await soloCliente();
  if (!s) return { ok: false, error: 'Solo el cliente lleva sus envíos manuales.' };
  const { error } = await s.supabase.rpc('marcar_mi_envio_manual', { p_envio: envio, p_estado: estado });
  return error ? { ok: false, error: limpio(error.message) } : { ok: true, aviso: 'Estado actualizado.' };
}

// Contraoferta: el cliente propone un precio más bajo (solo si su ficha lo permite).
// Poca rebaja se acepta sola; más, la revisa Dynamo; demasiada no se admite. Los
// porcentajes no se le dicen.
export async function contraofertarPrecio(envio: string, importe: number): Promise<Res> {
  const s = await soloCliente();
  if (!s) return { ok: false, error: 'Solo el cliente propone su precio.' };
  if (!Number.isFinite(importe) || importe <= 0) return { ok: false, error: 'Escribe un precio válido (sin IVA).' };
  const { data, error } = await s.supabase.rpc('contraofertar_precio_solicitud', { p_envio: envio, p_importe: Math.round(importe * 100) / 100 });
  if (error) return { ok: false, error: limpio(error.message) };
  const r = (data as { resultado: string }).resultado;
  const ERR: Record<string, string> = {
    no_permitida: 'En tu cuenta no está activada la contraoferta. Llámanos y lo vemos.',
    no_esperando: 'Esta solicitud ya no está esperando tu respuesta.', caducado: 'El precio ha caducado. Te pasamos uno nuevo en un momento.',
    fecha_pasada: 'La fecha de recogida ya ha pasado: cancela la solicitud y pide otra.', precio_no_valido: 'Escribe un precio válido (sin IVA).',
    no_es_rebaja: 'Tu precio tiene que ser más bajo que el nuestro.',
    demasiado_lejos: 'Ese precio está demasiado lejos del nuestro. Propón uno más cercano o llámanos.',
  };
  if (r === 'aceptada') return { ok: true, aviso: 'Aceptado: tu envío queda programado a tu precio y buscamos el camión.' };
  if (r === 'pendiente_revision') return { ok: true, aviso: 'Hemos recibido tu propuesta. La revisamos y te contestamos aquí enseguida.' };
  return { ok: false, error: ERR[r] ?? r };
}
