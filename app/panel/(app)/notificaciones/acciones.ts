'use server';

import { sesion, esDynamo } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// Encender/apagar una notificación y sus canales. Solo un administrador (la base de datos
// además exige el Admin Master y no deja apagar las de seguridad). Queda en la auditoría.
export async function guardarNotificacion(tipo: string, c: { activa: boolean; email: boolean; whatsapp: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/notificaciones/acciones#guardarNotificacion", [tipo, c]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || s.perfil.rol !== 'admin') return { ok: false, error: 'Solo un administrador cambia las notificaciones.' };
  const { error, count } = await s.supabase.from('notificaciones')
    .update({ activa: c.activa, email: c.email, whatsapp: c.whatsapp }, { count: 'exact' }).eq('tipo', tipo);
  if (error) return { ok: false, error: /seguridad/.test(error.message) ? error.message : /permission|row-level|42501/i.test(error.message) ? 'No tienes permiso para hacer esto.' : error.message };
  if (!count) return { ok: false, error: 'No tienes permiso para cambiarla (solo el Admin Master).' };
  return { ok: true };
}

// «Ver mensaje» (usuario, 2026-11-28): el último email de ese tipo que ha salido de verdad,
// con su diseño completo, y el texto tal como iría por WhatsApp. Solo el equipo de Dynamo.
export type MensajeEjemplo = {
  email: { asunto: string; html: string; fecha: string; estado: string } | null;
  whatsapp: string | null;
};
export async function verMensaje(tipo: string): Promise<{ ok: true; m: MensajeEjemplo } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/notificaciones/acciones#verMensaje", [tipo]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo.' };
  const { data: e, error } = await s.supabase.from('emails_enviados').select('asunto, cuerpo_html, creado_en, estado')
    .eq('tipo', tipo).order('creado_en', { ascending: false }).limit(1).maybeSingle();
  if (error) return { ok: false, error: 'No se ha podido leer el último email.' };
  if (!e) return { ok: true, m: { email: null, whatsapp: null } };
  // Con el mismo diseño con el que sale (cabecera, firma, botones). Si el cuerpo ya viene
  // envuelto, se queda tal cual.
  const { supabaseServicio } = await import('@/lib/supabase/servicio');
  const sv = supabaseServicio();
  const envuelto = sv ? (await sv.rpc('email_con_diseno', { p_html: e.cuerpo_html, p_remitente: null })).data as string | null : null;
  return { ok: true, m: {
    email: { asunto: e.asunto, html: envuelto || e.cuerpo_html, fecha: e.creado_en, estado: e.estado },
    whatsapp: textoWhatsapp(e.asunto, e.cuerpo_html),
  } };
}

// El texto del WhatsApp: el asunto en negrita y el cuerpo en texto llano (sin la firma, que
// en WhatsApp no hace falta), con los enlaces de los botones escritos.
function textoWhatsapp(asunto: string, html: string): string {
  const sinFirma = html.replace(/<p>— [^<]*<\/p>/g, '');
  const conEnlaces = sinFirma.replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, (_m, href: string, txt: string) => `${txt.trim()}: ${href}`);
  const texto = conEnlaces
    .replace(/<\/(p|li|div|tr|h\d)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<(strong|b)>([^<]*)<\/(strong|b)>/gi, '*$2*').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l, i, a) => l || (i > 0 && a[i - 1])).join('\n').trim();
  return `*${asunto.replace(/\s*·\s*Dynamo$/, '')}*\n\n${texto}`.slice(0, 1500);
}
