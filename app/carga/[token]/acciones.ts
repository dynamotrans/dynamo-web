'use server';

import { cookies, headers } from 'next/headers';
import { supabasePublico } from '@/lib/supabase/publico';

import { cookieReserva, cookieAlta } from '@/lib/cargaPublica';
import { validaIdFiscalPais } from '@/lib/idFiscal';
import { CONTACTO } from '@/lib/atencion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// La reserva va en una cookie de esta página: su id es la llave para aceptar y para ver
// los datos completos después. Solo la tiene quien reservó.
const ERROR_CONEXION = 'No se puede conectar ahora mismo. Vuelve a intentarlo en un momento.';

async function enMantenimiento(sb: NonNullable<ReturnType<typeof supabasePublico>>) {
  const { data } = await sb.rpc('mantenimiento_activo');
  return !!data;
}

export async function reservar(token: string): Promise<{ resultado: string; hasta?: string; desde?: string; ahora?: string }> {
  comprobarEntrada("app/carga/[token]/acciones#reservar", [token]);
  const sb = supabasePublico();
  if (!sb || await enMantenimiento(sb)) return { resultado: 'error' };
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const { data, error } = await sb.rpc('reservar_envio_publico', { p_token: token, p_ip: ip, p_navegador: h.get('user-agent') });
  if (error) return { resultado: 'error' };
  const r = data as { resultado: string; reserva_id?: string; hasta?: string; desde?: string; ahora?: string };
  if (r.resultado === 'reservada' && r.reserva_id) {
    (await cookies()).set(cookieReserva(token), r.reserva_id, { httpOnly: true, sameSite: 'lax', secure: true, path: '/carga', maxAge: 60 * 60 * 24 * 30 });
  }
  return { resultado: r.resultado, hasta: r.hasta, desde: r.desde, ahora: r.ahora };
}

export type Aceptacion = { cif: string; precio: number | null; pronto_pago: boolean; camion: string; remolque: string; conductor: string; telefono: string };

export async function aceptar(token: string, a: Aceptacion): Promise<{ resultado: string; minimo?: number; maximo?: number; intentos_restantes?: number; error?: string }> {
  comprobarEntrada("app/carga/[token]/acciones#aceptar", [token, a]);
  const sb = supabasePublico();
  const reserva = (await cookies()).get(cookieReserva(token))?.value;
  if (!sb || !reserva) return { resultado: 'error', error: 'Tu reserva no está en este navegador. Vuelve a abrir el enlace.' };
  if (await enMantenimiento(sb)) return { resultado: 'error', error: `La plataforma está en mantenimiento. Vuelve a intentarlo en un rato o llámanos al ${CONTACTO.telefono}.` };
  const { data, error } = await sb.rpc('aceptar_oferta_publica', {
    p_reserva: reserva, p_cif: a.cif, p_precio: a.precio, p_pronto_pago: a.pronto_pago,
    p_matricula_camion: a.camion, p_matricula_remolque: a.remolque, p_conductor_nombre: a.conductor, p_telefono: a.telefono,
    p_ip: ((await headers()).get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
  });
  if (error) return { resultado: 'error', error: /no se puede negociar/i.test(error.message) ? `${error.message.replace(/^.*?(Ahora no se puede)/, '$1')} Puedes aceptarla al precio ofertado.` : ERROR_CONEXION };
  return data as { resultado: string; minimo?: number; maximo?: number; intentos_restantes?: number };
}

export async function liberar(token: string): Promise<void> {
  comprobarEntrada("app/carga/[token]/acciones#liberar", [token]);
  const sb = supabasePublico();
  const almacen = await cookies();
  const reserva = almacen.get(cookieReserva(token))?.value;
  if (sb && reserva) await sb.rpc('liberar_reserva_publica', { p_reserva: reserva, p_motivo: 'el transportista no la quiere' });
  almacen.delete({ name: cookieReserva(token), path: '/carga' });
}

export async function completar(token: string, d: { camion: string; remolque: string; conductor: string; telefono: string; dia?: string | null }): Promise<{ resultado: string; conductor?: string | null; telefono?: string | null; fecha_carga_prevista?: string | null }> {
  comprobarEntrada("app/carga/[token]/acciones#completar", [token, d]);
  const sb = supabasePublico();
  const reserva = (await cookies()).get(cookieReserva(token))?.value;
  if (!sb) return { resultado: 'error' };
  // Sin la cookie de la reserva no se puede guardar: que la pantalla lo diga claro.
  if (!reserva) return { resultado: 'sin_reserva' };
  const { data, error } = await sb.rpc('completar_carga_publica', {
    p_reserva: reserva, p_matricula_camion: d.camion, p_matricula_remolque: d.remolque, p_conductor_nombre: d.conductor, p_telefono: d.telefono,
    p_fecha_carga_prevista: d.dia || null,
  });
  return error ? { resultado: 'error' } : (data as { resultado: string; conductor?: string | null; telefono?: string | null; fecha_carga_prevista?: string | null });
}

// Al escribir una matrícula o un chófer: los datos que ya conocemos de su flota (el chófer
// de ese camión de otras veces, o el teléfono de ese chófer). Vacío si no hay.
export async function sugerirFlota(token: string, d: { matricula?: string; conductor?: string }): Promise<{ conductor: string | null; telefono: string | null } | null> {
  comprobarEntrada("app/carga/[token]/acciones#sugerirFlota", [token, d]);
  const sb = supabasePublico();
  const reserva = (await cookies()).get(cookieReserva(token))?.value;
  if (!sb || !reserva) return null;
  const { data, error } = await sb.rpc('flota_sugerencia_publica', { p_reserva: reserva, p_matricula: d.matricula ?? null, p_conductor_nombre: d.conductor ?? null });
  const f = data as { resultado?: string; conductor?: string | null; telefono?: string | null } | null;
  if (error || f?.resultado !== 'ok') return null;
  return { conductor: f.conductor ?? null, telefono: f.telefono ?? null };
}

// Flota de otras veces del transportista (usuario, 2026-11-09): lo último usado en un
// envío (para autorrellenar al identificarse), las listas de matrículas y chóferes ya
// usados (para elegir o escribir nuevos) y su teléfono/email de ficha OCULTOS (se
// enmascaran en el servidor). Solo con la reserva viva del navegador.
export type FlotaPublica = {
  ultimo: { camion: string | null; remolque: string | null; conductor: string | null; telefono: string | null } | null;
  camiones: string[]; remolques: string[]; conductores: string[];
  telefono_oculto: string | null; email_oculto: string | null;
};
export async function flotaPublica(token: string, cif: string | null): Promise<FlotaPublica | null> {
  comprobarEntrada("app/carga/[token]/acciones#flotaPublica", [token, cif]);
  const sb = supabasePublico();
  const reserva = (await cookies()).get(cookieReserva(token))?.value;
  if (!sb || !reserva) return null;
  const { data, error } = await sb.rpc('flota_publica', { p_reserva: reserva, p_cif: cif });
  const f = data as (FlotaPublica & { resultado?: string }) | null;
  if (error || f?.resultado !== 'ok') return null;
  return { ultimo: f.ultimo ?? null, camiones: f.camiones ?? [], remolques: f.remolques ?? [],
           conductores: f.conductores ?? [], telefono_oculto: f.telefono_oculto ?? null, email_oculto: f.email_oculto ?? null };
}

// El enlace de firma del CMR digital de la carga aceptada (lo crea si no hay uno vivo).
export async function enlaceCmr(token: string): Promise<{ cmr?: string; error?: string }> {
  comprobarEntrada("app/carga/[token]/acciones#enlaceCmr", [token]);
  const sb = supabasePublico();
  const reserva = (await cookies()).get(cookieReserva(token))?.value;
  if (!sb || !reserva) return { error: `Tu reserva no está en este navegador. Llámanos al ${CONTACTO.telefono}.` };
  const { data, error } = await sb.rpc('enlace_cmr_publico', { p_reserva: reserva });
  if (error || !data) return { error: `No se ha podido abrir el CMR. Llámanos al ${CONTACTO.telefono}.` };
  return { cmr: String(data) };
}

// ---- Alta online de un transportista nuevo (CIF que no está en Dynamo) --------------------
// Se crea su ficha y la carga queda reservada para él, PENDIENTE de que Dynamo verifique sus
// datos (alta_transportista_publica). Solo con enlaces de bolsa y con la reserva viva.
// Sugerencias para identificarse (como el mockup): hasta 6 transportistas de Dynamo que
// casan con lo escrito (nombre desde 2 letras, CIF/NIF normalizado, código de bolsa…).
// La base de datos solo responde con una RESERVA VIVA (la cookie del enlace).
export type SugerenciaT = { nombre: string; cif: string; poblacion: string | null };
export async function sugerirTransportistas(token: string, q: string): Promise<SugerenciaT[]> {
  comprobarEntrada("app/carga/[token]/acciones#sugerirTransportistas", [token, q]);
  const sb = supabasePublico();
  const reserva = (await cookies()).get(cookieReserva(token))?.value;
  if (!sb || !reserva || q.trim().replace(/[^0-9A-Za-z]/g, '').length < 2) return [];
  const { data } = await sb.rpc('sugerencias_transportistas_publicas', { p_reserva: reserva, p_q: q.trim().slice(0, 80) });
  return (data ?? []).map((s) => ({ nombre: s.nombre, cif: s.cif, poblacion: s.poblacion ?? null }));
}

// Solo transportistas de una bolsa del grupo Alpega: cuatro datos, el resto lo completa
// Dynamo desde su ficha en la bolsa.
export type AltaTransportista = { bolsa: string; codigo_bolsa: string; pais: string; cif: string; telefono: string; precio: number | null; pronto_pago: boolean };
export async function darseDeAlta(token: string, a: AltaTransportista): Promise<{ resultado: string; minimo?: number; maximo?: number; campo?: string; error?: string }> {
  comprobarEntrada("app/carga/[token]/acciones#darseDeAlta", [token, a]);
  const sb = supabasePublico();
  const almacen = await cookies();
  const reserva = almacen.get(cookieReserva(token))?.value;
  if (!sb || !reserva) return { resultado: 'error', error: 'Tu reserva no está en este navegador. Vuelve a abrir el enlace.' };
  if (await enMantenimiento(sb)) return { resultado: 'error', error: `La plataforma está en mantenimiento. Vuelve a intentarlo en un rato o llámanos al ${CONTACTO.telefono}.` };
  const v = validaIdFiscalPais(a.cif, a.pais);
  // Valen empresas Y autónomos: CIF, NIF o NIE en España; nº de IVA europeo con prefijo;
  // y de cualquier otro país, el nº fiscal tal cual (lo revisa Dynamo al activar el alta).
  if (!v || !v.ok) return { resultado: 'datos_no_validos', campo: 'cif',
    error: `${v?.tipo ? `${v.tipo}: ${v.msg}` : v?.msg || 'El CIF / NIF no es válido'}. Valen el CIF de empresa y el NIF/NIE de autónomo; de otro país, el nº de IVA con su prefijo (PT…, FR…) o tu nº fiscal.` };
  const { data, error } = await sb.rpc('alta_transportista_publica', {
    p_reserva: reserva, p_bolsa: a.bolsa || null, p_codigo_bolsa: a.codigo_bolsa, p_pais: a.pais, p_cif: a.cif, p_telefono: a.telefono,
    p_precio: a.precio, p_pronto_pago: a.pronto_pago, p_ip: ((await headers()).get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
  });
  if (error) return { resultado: 'error', error: /no se puede negociar/i.test(error.message) ? `${error.message.replace(/^.*?(Ahora no se puede)/, '$1')} Puedes aceptarla al precio ofertado.` : ERROR_CONEXION };
  const r = data as { resultado: string; minimo?: number; maximo?: number; campo?: string };
  if (r.resultado === 'alta_pendiente') almacen.set(cookieAlta(token), '1', { httpOnly: true, sameSite: 'lax', secure: true, path: '/carga', maxAge: 60 * 60 * 24 * 30 });
  return r;
}
