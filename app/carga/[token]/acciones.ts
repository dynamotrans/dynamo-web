'use server';

import { cookies, headers } from 'next/headers';
import { supabasePublico } from '@/lib/supabase/publico';

import { cookieReserva } from '@/lib/cargaPublica';

// La reserva va en una cookie de esta página: su id es la llave para aceptar y para ver
// los datos completos después. Solo la tiene quien reservó.
const ERROR_CONEXION = 'No se puede conectar ahora mismo. Vuelve a intentarlo en un momento.';

export async function reservar(token: string): Promise<{ resultado: string; hasta?: string; desde?: string; ahora?: string }> {
  const sb = supabasePublico();
  if (!sb) return { resultado: 'error' };
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const { data, error } = await sb.rpc('reservar_envio', { p_token: token, p_ip: ip, p_navegador: h.get('user-agent') });
  if (error) return { resultado: 'error' };
  const r = data as { resultado: string; reserva_id?: string; hasta?: string; desde?: string; ahora?: string };
  if (r.resultado === 'reservada' && r.reserva_id) {
    (await cookies()).set(cookieReserva(token), r.reserva_id, { httpOnly: true, sameSite: 'lax', secure: true, path: '/carga', maxAge: 60 * 60 * 24 * 30 });
  }
  return { resultado: r.resultado, hasta: r.hasta, desde: r.desde, ahora: r.ahora };
}

export type Aceptacion = { cif: string; precio: number | null; pronto_pago: boolean; camion: string; remolque: string; conductor: string; telefono: string };

export async function aceptar(token: string, a: Aceptacion): Promise<{ resultado: string; minimo?: number; maximo?: number; error?: string }> {
  const sb = supabasePublico();
  const reserva = (await cookies()).get(cookieReserva(token))?.value;
  if (!sb || !reserva) return { resultado: 'error', error: 'Tu reserva no está en este navegador. Vuelve a abrir el enlace.' };
  const { data, error } = await sb.rpc('aceptar_oferta_publica', {
    p_reserva: reserva, p_cif: a.cif, p_precio: a.precio, p_pronto_pago: a.pronto_pago,
    p_camion: a.camion, p_remolque: a.remolque, p_conductor: a.conductor, p_telefono: a.telefono,
  });
  if (error) return { resultado: 'error', error: ERROR_CONEXION };
  return data as { resultado: string; minimo?: number; maximo?: number };
}

export async function liberar(token: string): Promise<void> {
  const sb = supabasePublico();
  const almacen = await cookies();
  const reserva = almacen.get(cookieReserva(token))?.value;
  if (sb && reserva) await sb.rpc('liberar_reserva', { p_reserva: reserva, p_motivo: 'el transportista no la quiere' });
  almacen.delete({ name: cookieReserva(token), path: '/carga' });
}

export async function completar(token: string, d: { camion: string; remolque: string; conductor: string; telefono: string }): Promise<{ resultado: string }> {
  const sb = supabasePublico();
  const reserva = (await cookies()).get(cookieReserva(token))?.value;
  if (!sb || !reserva) return { resultado: 'error' };
  const { data, error } = await sb.rpc('completar_carga_publica', {
    p_reserva: reserva, p_camion: d.camion, p_remolque: d.remolque, p_conductor: d.conductor, p_telefono: d.telefono,
  });
  return error ? { resultado: 'error' } : (data as { resultado: string });
}
