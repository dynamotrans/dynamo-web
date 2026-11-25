'use server';

// WhatsApp (usuario, 2026-11-25): contestar desde la bandeja y marcar como leída. Las reglas
// (solo el equipo, no los de solo lectura, solo dentro de las 24 h de Meta) las impone la base de
// datos (whatsapp_preparar_respuesta); el envío a Meta pasa por lib/servidor/whatsapp.ts.
import { revalidatePath } from 'next/cache';
import { mensajeError } from '@/lib/mensajeError';
import { sesion } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { mandarTexto, whatsappConectado } from '@/lib/servidor/whatsapp';

type Res = { ok: true } | { ok: false; error: string };

export async function responderWhatsApp(conversacion: string, texto: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/whatsapp/acciones#responderWhatsApp", [conversacion, texto]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  if (!whatsappConectado()) return { ok: false, error: 'WhatsApp no está conectado todavía: faltan las claves de Meta en Vercel.' };
  const { data: p } = await s.supabase.from('parametros').select('valor').eq('clave', 'whatsapp_activo').maybeSingle();
  if (!(p?.valor === true || p?.valor === 'true')) return { ok: false, error: 'WhatsApp está apagado: enciéndelo en Parámetros → «WhatsApp».' };
  const sv = supabaseServicio();
  if (!sv) return { ok: false, error: 'Falta la conexión del servidor con la base de datos.' };

  const { data, error } = await s.supabase.rpc('whatsapp_preparar_respuesta', { p_conversacion: conversacion, p_texto: texto });
  if (error) return { ok: false, error: /42501|permiso|equipo/i.test(`${error.code} ${error.message}`) ? 'Solo el equipo de Dynamo puede contestar (y no los usuarios de solo lectura).' : mensajeError(error.message) };
  const r = data as { resultado: string; mensaje_id?: string; telefono?: string };
  if (r.resultado === 'vacio') return { ok: false, error: 'Escribe la respuesta.' };
  if (r.resultado === 'largo') return { ok: false, error: 'La respuesta es demasiado larga (4.096 caracteres como mucho).' };
  if (r.resultado === 'no_existe') return { ok: false, error: 'Esa conversación ya no existe.' };
  if (r.resultado === 'fuera_de_plazo') return { ok: false, error: 'Han pasado más de 24 h desde su último mensaje: Meta solo deja escribirle con una plantilla aprobada.' };
  if (r.resultado !== 'ok' || !r.mensaje_id || !r.telefono) return { ok: false, error: 'No se ha podido preparar la respuesta.' };

  const envio = await mandarTexto(r.telefono, texto.trim());
  await sv.rpc('whatsapp_marcar_enviado', { p_mensaje: r.mensaje_id, p_wa_id: envio.ok ? envio.datos.wa_id : null, p_error: envio.ok ? undefined : envio.error });
  revalidatePath('/panel/whatsapp');
  if (!envio.ok) { console.error('[WhatsApp] mandar respuesta', envio.error); return { ok: false, error: envio.error }; }
  return { ok: true };
}

export async function marcarWhatsAppLeida(conversacion: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/whatsapp/acciones#marcarWhatsAppLeida", [conversacion]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const { error } = await s.supabase.rpc('whatsapp_marcar_leida', { p_conversacion: conversacion });
  if (error) return { ok: false, error: mensajeError(error.message) };
  return { ok: true };
}

/** «Tomo yo» (la lleva una persona y Claude no contesta) o «Que conteste Claude». */
export async function tomarWhatsApp(conversacion: string, tomar: boolean): Promise<Res> {
  comprobarEntrada("app/panel/(app)/whatsapp/acciones#tomarWhatsApp", [conversacion, tomar]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const { error } = await s.supabase.rpc('whatsapp_tomar', { p_conversacion: conversacion, p_tomar: tomar });
  if (error) return { ok: false, error: /42501|equipo/i.test(`${error.code} ${error.message}`) ? 'Solo el equipo de Dynamo (y no los usuarios de solo lectura).' : mensajeError(error.message) };
  revalidatePath('/panel/whatsapp');
  return { ok: true };
}
