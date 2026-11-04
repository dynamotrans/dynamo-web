'use server';

import { cookies, headers } from 'next/headers';
import { supabasePublico } from '@/lib/supabase/publico';

import { cookieReserva, cookieAlta } from '@/lib/cargaPublica';
import { validaIdFiscalPais } from '@/lib/idFiscal';

// La reserva va en una cookie de esta página: su id es la llave para aceptar y para ver
// los datos completos después. Solo la tiene quien reservó.
const ERROR_CONEXION = 'No se puede conectar ahora mismo. Vuelve a intentarlo en un momento.';

async function enMantenimiento(sb: NonNullable<ReturnType<typeof supabasePublico>>) {
  const { data } = await sb.rpc('mantenimiento_activo');
  return !!data;
}

export async function reservar(token: string): Promise<{ resultado: string; hasta?: string; desde?: string; ahora?: string }> {
  const sb = supabasePublico();
  if (!sb || await enMantenimiento(sb)) return { resultado: 'error' };
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

export async function aceptar(token: string, a: Aceptacion): Promise<{ resultado: string; minimo?: number; maximo?: number; intentos_restantes?: number; error?: string }> {
  const sb = supabasePublico();
  const reserva = (await cookies()).get(cookieReserva(token))?.value;
  if (!sb || !reserva) return { resultado: 'error', error: 'Tu reserva no está en este navegador. Vuelve a abrir el enlace.' };
  if (await enMantenimiento(sb)) return { resultado: 'error', error: 'La plataforma está en mantenimiento. Vuelve a intentarlo en un rato o llámanos al +34 955 225 945.' };
  const { data, error } = await sb.rpc('aceptar_oferta_publica', {
    p_reserva: reserva, p_cif: a.cif, p_precio: a.precio, p_pronto_pago: a.pronto_pago,
    p_camion: a.camion, p_remolque: a.remolque, p_conductor: a.conductor, p_telefono: a.telefono,
    p_ip: ((await headers()).get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
  });
  if (error) return { resultado: 'error', error: /no se puede negociar/i.test(error.message) ? `${error.message.replace(/^.*?(Ahora no se puede)/, '$1')} Puedes aceptarla al precio ofertado.` : ERROR_CONEXION };
  return data as { resultado: string; minimo?: number; maximo?: number; intentos_restantes?: number };
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

// El enlace de firma del CMR digital de la carga aceptada (lo crea si no hay uno vivo).
export async function enlaceCmr(token: string): Promise<{ cmr?: string; error?: string }> {
  const sb = supabasePublico();
  const reserva = (await cookies()).get(cookieReserva(token))?.value;
  if (!sb || !reserva) return { error: 'Tu reserva no está en este navegador. Llámanos al +34 955 225 945.' };
  const { data, error } = await sb.rpc('enlace_cmr_publico', { p_reserva: reserva });
  if (error || !data) return { error: 'No se ha podido abrir el CMR. Llámanos al +34 955 225 945.' };
  return { cmr: String(data) };
}

// ---- Alta online de un transportista nuevo (CIF que no está en Dynamo) --------------------
// Se crea su ficha y la carga queda reservada para él, PENDIENTE de que Dynamo verifique sus
// datos (alta_transportista_publica). Solo con enlaces de bolsa y con la reserva viva.
// Solo transportistas de una bolsa del grupo Alpega: cuatro datos, el resto lo completa
// Dynamo desde su ficha en la bolsa.
export type AltaTransportista = { bolsa: string; codigo_bolsa: string; pais: string; cif: string; telefono: string; precio: number | null; pronto_pago: boolean };
export async function darseDeAlta(token: string, a: AltaTransportista): Promise<{ resultado: string; minimo?: number; maximo?: number; campo?: string; error?: string }> {
  const sb = supabasePublico();
  const almacen = await cookies();
  const reserva = almacen.get(cookieReserva(token))?.value;
  if (!sb || !reserva) return { resultado: 'error', error: 'Tu reserva no está en este navegador. Vuelve a abrir el enlace.' };
  if (await enMantenimiento(sb)) return { resultado: 'error', error: 'La plataforma está en mantenimiento. Vuelve a intentarlo en un rato o llámanos al +34 955 225 945.' };
  const v = validaIdFiscalPais(a.cif, a.pais);
  if (!v || !v.ok) return { resultado: 'datos_no_validos', campo: 'cif', error: v?.msg || 'El CIF / NIF no es válido.' };
  const { data, error } = await sb.rpc('alta_transportista_publica', {
    p_reserva: reserva, p_bolsa: a.bolsa || null, p_codigo_bolsa: a.codigo_bolsa, p_pais: a.pais, p_cif: a.cif, p_telefono: a.telefono,
    p_precio: a.precio, p_pronto_pago: a.pronto_pago, p_ip: ((await headers()).get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
  });
  if (error) return { resultado: 'error', error: /no se puede negociar/i.test(error.message) ? `${error.message.replace(/^.*?(Ahora no se puede)/, '$1')} Puedes aceptarla al precio ofertado.` : ERROR_CONEXION };
  const r = data as { resultado: string; minimo?: number; maximo?: number; campo?: string };
  if (r.resultado === 'alta_pendiente') almacen.set(cookieAlta(token), '1', { httpOnly: true, sameSite: 'lax', secure: true, path: '/carga', maxAge: 60 * 60 * 24 * 30 });
  return r;
}
