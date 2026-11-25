import { after } from 'next/server';
import { leerAviso } from '@/lib/whatsapp';
import { firmaValida } from '@/lib/whatsappFirma';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { borrarArchivosCaducados, guardarArchivosPendientes } from '@/lib/servidor/whatsapp';

// /api/whatsapp: la puerta por la que Meta entrega los mensajes de WhatsApp y los avisos de
// entregado/leído (usuario, 2026-11-25). En Meta → tu app → WhatsApp → Configuración: esta URL,
// el token de verificación (WHATSAPP_VERIFY_TOKEN) y suscribirse a «messages».
//  · GET: Meta comprueba la URL una vez (devuelve el «challenge» si el token coincide).
//  · POST: solo se fía de avisos FIRMADOS con la clave secreta de la app (WHATSAPP_APP_SECRET).
//    Se guarda todo en la base de datos y se contesta 200 enseguida (si no, Meta reintenta);
//    los archivos se bajan después (after), y de paso se borran los que han caducado.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN ?? '';
  if (u.searchParams.get('hub.mode') === 'subscribe' && token.length >= 8 && u.searchParams.get('hub.verify_token') === token) {
    return new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  return new Response('no', { status: 403 });
}

export async function POST(req: Request) {
  const cuerpo = await req.text();
  if (!firmaValida(cuerpo, req.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)) {
    return new Response('firma no válida', { status: 401 });
  }
  let json: unknown;
  try { json = JSON.parse(cuerpo); } catch { return new Response('ok', { status: 200 }); }
  const { entradas, estados } = leerAviso(json);
  const sb = supabaseServicio();
  if (!sb) return new Response('sin conexión', { status: 500 });
  let fallos = 0;
  for (const e of entradas) {
    const { error } = await sb.rpc('whatsapp_registrar_entrada', { p: e });
    if (error) { fallos += 1; console.error('[WhatsApp] guardar mensaje', e.wa_id, error.message); }
  }
  for (const s of estados) {
    const { error } = await sb.rpc('whatsapp_registrar_estado', { p_wa_id: s.wa_id, p_estado: s.estado, p_error: s.error ?? undefined, p_cuando: s.cuando ?? undefined });
    if (error) console.error('[WhatsApp] estado', s.wa_id, error.message);
  }
  if (entradas.some((e) => e.meta_archivo_id)) after(async () => { await guardarArchivosPendientes(10); });
  after(async () => { await borrarArchivosCaducados(20); });
  // Si no se ha podido guardar algún mensaje, 500: Meta lo vuelve a mandar (el mismo no se guarda dos veces).
  return new Response(fallos ? 'error' : 'ok', { status: fallos ? 500 : 200 });
}
