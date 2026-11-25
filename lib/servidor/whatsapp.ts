import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { extensionDe } from '@/lib/whatsapp';

// TODO lo que la plataforma habla con Meta (WhatsApp Cloud API) pasa por aquí (usuario,
// 2026-11-25). Claves, todas en Vercel (Sensitive), nunca en el repositorio ni en el chat:
//   WHATSAPP_TOKEN            token PERMANENTE de un «usuario del sistema» de Meta Business
//                             (permisos whatsapp_business_messaging y whatsapp_business_management)
//   WHATSAPP_PHONE_NUMBER_ID  identificador del número en Meta (no es secreto)
//   WHATSAPP_APP_SECRET       clave secreta de la app de Meta: comprueba que los avisos son de Meta
//   WHATSAPP_VERIFY_TOKEN     palabra que se inventa uno y se pone igual en Meta al dar de alta la URL
//   WHATSAPP_API_VERSION      opcional (por defecto v23.0)
const version = () => process.env.WHATSAPP_API_VERSION || 'v23.0';
const API = () => `https://graph.facebook.com/${version()}`;
const MAX_ARCHIVO = 25 * 1024 * 1024;

export const whatsappConectado = () =>
  (process.env.WHATSAPP_TOKEN ?? '').length > 20 && /^\d{6,}$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID ?? '');

type Res<T> = { ok: true; datos: T } | { ok: false; error: string };

/** El error de Meta, en corto y en castellano cuando se conoce. */
function errorMeta(estado: number, j: unknown): string {
  const e = (j as { error?: { code?: number; message?: string; error_data?: { details?: string } } } | null)?.error;
  const codigo = e?.code;
  if (estado === 401 || codigo === 190) return 'Meta no acepta el token de WhatsApp (WHATSAPP_TOKEN): revísalo en Vercel.';
  if (codigo === 131047) return 'Han pasado más de 24 h desde su último mensaje: Meta solo deja escribirle con una plantilla aprobada.';
  if (codigo === 131026) return 'Ese número no tiene WhatsApp o no puede recibir el mensaje.';
  if (codigo === 131056) return 'Demasiados mensajes seguidos a ese número: espera un poco.';
  if (codigo === 130429 || codigo === 131048) return 'Meta frena los envíos por ahora (límite de mensajes): prueba en unos minutos.';
  const detalle = e?.error_data?.details || e?.message;
  return `Meta (${estado}${codigo ? ` · ${codigo}` : ''}): ${String(detalle ?? 'sin detalle').slice(0, 300)}`;
}

async function llamar<T>(url: string, init?: { metodo?: 'GET' | 'POST'; cuerpo?: unknown }): Promise<Res<T>> {
  const token = process.env.WHATSAPP_TOKEN ?? '';
  if (!whatsappConectado()) return { ok: false, error: 'WhatsApp no está conectado: faltan las claves de Meta en Vercel.' };
  try {
    const r = await fetch(url, {
      method: init?.metodo ?? 'GET',
      headers: { authorization: `Bearer ${token}`, ...(init?.cuerpo !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: init?.cuerpo !== undefined ? JSON.stringify(init.cuerpo) : undefined,
      cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
    const texto = await r.text();
    let j: unknown = null;
    try { j = texto ? JSON.parse(texto) : null; } catch { /* sin cuerpo JSON */ }
    if (!r.ok) return { ok: false, error: errorMeta(r.status, j) };
    return { ok: true, datos: j as T };
  } catch {
    return { ok: false, error: 'No se ha podido contactar con Meta (WhatsApp).' };
  }
}

/** Manda un texto libre (solo dentro de las 24 h siguientes al último mensaje de la persona). */
export async function mandarTexto(telefono: string, texto: string): Promise<Res<{ wa_id: string }>> {
  const r = await llamar<{ messages?: { id?: string }[] }>(`${API()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    metodo: 'POST',
    cuerpo: { messaging_product: 'whatsapp', recipient_type: 'individual', to: telefono.replace(/^\+/, ''), type: 'text', text: { body: texto, preview_url: false } },
  });
  if (!r.ok) return r;
  const id = r.datos?.messages?.[0]?.id;
  return id ? { ok: true, datos: { wa_id: id } } : { ok: false, error: 'Meta no ha devuelto el identificador del mensaje.' };
}

/** Baja un archivo (foto, audio, PDF) que llegó por WhatsApp. Meta lo guarda poco tiempo. */
async function bajarArchivo(mediaId: string): Promise<Res<{ bytes: Uint8Array; mime: string }>> {
  const info = await llamar<{ url?: string; mime_type?: string; file_size?: number }>(`${API()}/${encodeURIComponent(mediaId)}`);
  if (!info.ok) return info;
  if (!info.datos?.url) return { ok: false, error: 'Meta no da la dirección del archivo.' };
  if (Number(info.datos.file_size) > MAX_ARCHIVO) return { ok: false, error: 'Archivo de más de 25 MB: no se guarda.' };
  try {
    const r = await fetch(info.datos.url, { headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN ?? ''}` }, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return { ok: false, error: `Meta no deja bajar el archivo (${r.status}).` };
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength > MAX_ARCHIVO) return { ok: false, error: 'Archivo de más de 25 MB: no se guarda.' };
    return { ok: true, datos: { bytes, mime: (info.datos.mime_type || r.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim() } };
  } catch {
    return { ok: false, error: 'No se ha podido bajar el archivo de Meta.' };
  }
}

/** Baja de Meta y guarda en el almacén «whatsapp» los archivos que aún no lo están. */
export async function guardarArchivosPendientes(limite = 10): Promise<number> {
  const sb = supabaseServicio();
  if (!sb || !whatsappConectado()) return 0;
  const { data, error } = await sb.rpc('whatsapp_archivos_por_bajar', { p_limite: limite });
  if (error) { console.error('[WhatsApp] archivos por bajar', error.message); return 0; }
  let n = 0;
  for (const f of (data ?? []) as { mensaje_id: string; meta_archivo_id: string; archivo_tipo: string | null; archivo_nombre: string | null; conversacion_id: string }[]) {
    const a = await bajarArchivo(f.meta_archivo_id);
    if (!a.ok) { console.error('[WhatsApp] bajar archivo', f.mensaje_id, a.error); continue; }
    const ruta = `c/${f.conversacion_id}/${f.mensaje_id}.${extensionDe(a.datos.mime || f.archivo_tipo, f.archivo_nombre)}`;
    const { error: e1 } = await sb.storage.from('whatsapp').upload(ruta, a.datos.bytes, { contentType: a.datos.mime, upsert: true });
    if (e1) { console.error('[WhatsApp] guardar archivo', f.mensaje_id, e1.message); continue; }
    const { error: e2 } = await sb.rpc('whatsapp_archivo_guardado', { p_mensaje: f.mensaje_id, p_ruta: ruta, p_tipo: a.datos.mime, p_bytes: a.datos.bytes.byteLength });
    if (e2) { console.error('[WhatsApp] apuntar archivo', f.mensaje_id, e2.message); continue; }
    n += 1;
  }
  return n;
}

/** Borra del almacén los archivos que han cumplido su plazo (6 meses) y lo apunta. */
export async function borrarArchivosCaducados(limite = 50): Promise<number> {
  const sb = supabaseServicio();
  if (!sb) return 0;
  const { data, error } = await sb.rpc('whatsapp_archivos_caducados', { p_limite: limite });
  if (error || !data?.length) { if (error) console.error('[WhatsApp] archivos caducados', error.message); return 0; }
  const filas = data as { mensaje_id: string; archivo_ruta: string }[];
  const { error: e1 } = await sb.storage.from('whatsapp').remove(filas.map((f) => f.archivo_ruta));
  if (e1) { console.error('[WhatsApp] borrar archivos', e1.message); return 0; }
  const { error: e2 } = await sb.rpc('whatsapp_archivos_borrados', { p_mensajes: filas.map((f) => f.mensaje_id) });
  if (e2) console.error('[WhatsApp] apuntar borrados', e2.message);
  return filas.length;
}
