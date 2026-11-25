import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { botonesReenvio, cuerpoArchivo, cuerpoBotones, cuerpoPlantilla, cuerpoReaccion, cuerpoTexto, extensionDe, tipoArchivoMeta, type Cabecera } from '@/lib/whatsapp';

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

/** Manda a Meta un mensaje ya montado (lib/whatsapp.ts) y devuelve su identificador. */
async function mandar(cuerpo: unknown): Promise<Res<{ wa_id: string }>> {
  const r = await llamar<{ messages?: { id?: string }[] }>(`${API()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { metodo: 'POST', cuerpo });
  if (!r.ok) return r;
  const id = r.datos?.messages?.[0]?.id;
  return id ? { ok: true, datos: { wa_id: id } } : { ok: false, error: 'Meta no ha devuelto el identificador del mensaje.' };
}

/** Manda un texto libre (solo dentro de las 24 h siguientes al último mensaje de la persona). */
export async function mandarTexto(telefono: string, texto: string, cita?: string | null): Promise<Res<{ wa_id: string }>> {
  return mandar(cuerpoTexto(telefono, texto, cita));
}

/** Sube a Meta un archivo para poder mandarlo (devuelve su id en Meta). */
async function subirArchivo(bytes: Uint8Array, mime: string, nombre: string): Promise<Res<{ id: string }>> {
  if (!whatsappConectado()) return { ok: false, error: 'WhatsApp no está conectado: faltan las claves de Meta en Vercel.' };
  try {
    const f = new FormData();
    f.append('messaging_product', 'whatsapp');
    f.append('type', mime);
    f.append('file', new Blob([bytes as BlobPart], { type: mime }), nombre);
    const r = await fetch(`${API()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: 'POST', headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN ?? ''}` }, body: f, cache: 'no-store', signal: AbortSignal.timeout(30_000),
    });
    const j = await r.json().catch(() => null) as { id?: string } | null;
    if (!r.ok) return { ok: false, error: errorMeta(r.status, j) };
    return j?.id ? { ok: true, datos: { id: j.id } } : { ok: false, error: 'Meta no ha devuelto el id del archivo.' };
  } catch {
    return { ok: false, error: 'No se ha podido subir el archivo a Meta.' };
  }
}

/** Baja de Meta un archivo que llegó y lo vuelve a subir para mandarlo a otro número. */
async function prepararArchivo(metaId: string, mime: string | null, nombre: string | null): Promise<Res<{ id: string; tipo: ReturnType<typeof tipoArchivoMeta>; mime: string }>> {
  const a = await bajarArchivo(metaId);
  if (!a.ok) return a;
  const tipoMime = a.datos.mime || mime || 'application/octet-stream';
  const s = await subirArchivo(a.datos.bytes, tipoMime, nombre || `archivo.${extensionDe(tipoMime, nombre)}`);
  if (!s.ok) return s;
  return { ok: true, datos: { id: s.datos.id, tipo: tipoArchivoMeta(tipoMime), mime: tipoMime } };
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

// ---- Reenvío al móvil de Dynamo y respuestas desde él (usuario, 2026-11-25) -------------------
// La base de datos decide (whatsapp_tras_entrada) y deja el mensaje pendiente; aquí se manda y se
// apunta el resultado (whatsapp_marcar_enviado).
type Accion = {
  accion: 'nada' | 'avisar' | 'reenviar' | 'responder' | 'reaccion';
  mensaje_id?: string; telefono?: string; texto?: string | null; cita?: string; ventana?: boolean;
  conversacion?: string; nombre?: string; contenido?: string; tomada?: boolean; plantilla?: string | null;
  tipo?: string; meta_archivo_id?: string | null; archivo_tipo?: string | null; archivo_nombre?: string | null;
  wa_id?: string; emoji?: string; confirmar?: { telefono: string; wa_id: string };
};

/** Lo que toca hacer después de guardar un mensaje que llega (reenviar, responder, avisar). */
export async function trasEntrada(mensajeId: string): Promise<void> {
  const sb = supabaseServicio();
  if (!sb || !whatsappConectado()) return;
  const { data, error } = await sb.rpc('whatsapp_tras_entrada', { p_mensaje: mensajeId });
  if (error) { console.error('[WhatsApp] tras entrada', mensajeId, error.message); return; }
  const a = data as Accion;
  const apuntar = async (r: Res<{ wa_id: string }>) => {
    if (!a.mensaje_id) return;
    const { error: e } = await sb.rpc('whatsapp_marcar_enviado', { p_mensaje: a.mensaje_id, p_wa_id: r.ok ? r.datos.wa_id : null, p_error: r.ok ? undefined : r.error });
    if (e) console.error('[WhatsApp] apuntar envío', a.mensaje_id, e.message);
    if (!r.ok) console.error('[WhatsApp]', a.accion, a.mensaje_id, r.error);
  };
  switch (a.accion) {
    case 'reaccion':
      if (a.telefono && a.wa_id) { const r = await mandar(cuerpoReaccion(a.telefono, a.wa_id, a.emoji ?? '👍')); if (!r.ok) console.error('[WhatsApp] reacción', r.error); }
      return;
    case 'avisar':
      if (a.telefono && a.texto) await apuntar(await mandarTexto(a.telefono, a.texto, a.cita));
      return;
    case 'reenviar': {
      if (!a.telefono || !a.conversacion) return;
      const botones = botonesReenvio(a.conversacion);
      if (a.ventana === false && a.plantilla) {
        await apuntar(await mandar(cuerpoPlantilla(a.telefono, a.plantilla, [a.nombre ?? '', `${a.contenido ?? ''}${a.tomada ? ' (La llevas tú)' : ''}`], botones)));
        return;
      }
      let cabecera: Cabecera = null;
      if (a.meta_archivo_id) {
        const f = await prepararArchivo(a.meta_archivo_id, a.archivo_tipo ?? null, a.archivo_nombre ?? null);
        if (!f.ok) console.error('[WhatsApp] reenviar archivo', a.mensaje_id, f.error);
        else if (f.datos.tipo === 'audio') {
          // Una nota de voz no puede ir de cabecera: va sola, justo antes.
          const r = await mandar(cuerpoArchivo(a.telefono, 'audio', f.datos.id));
          if (!r.ok) console.error('[WhatsApp] reenviar audio', a.mensaje_id, r.error);
        } else cabecera = { tipo: f.datos.tipo, id: f.datos.id, nombre: a.archivo_nombre };
      }
      await apuntar(await mandar(cuerpoBotones(a.telefono, a.texto ?? '', botones, cabecera)));
      return;
    }
    case 'responder': {
      if (!a.telefono) return;
      let r: Res<{ wa_id: string }>;
      if (a.meta_archivo_id) {
        const f = await prepararArchivo(a.meta_archivo_id, a.archivo_tipo ?? null, a.archivo_nombre ?? null);
        r = f.ok ? await mandar(cuerpoArchivo(a.telefono, f.datos.tipo, f.datos.id, a.texto, a.archivo_nombre)) : f;
      } else r = await mandarTexto(a.telefono, a.texto ?? '');
      await apuntar(r);
      // Al móvil de Dynamo: ✅ en su mensaje si ha salido; si no, por qué.
      if (a.confirmar) {
        const c = r.ok ? await mandar(cuerpoReaccion(a.confirmar.telefono, a.confirmar.wa_id, '✅'))
          : await mandarTexto(a.confirmar.telefono, `⚠ No le ha llegado a ${a.nombre ?? 'esa persona'}: ${r.error}`, a.confirmar.wa_id);
        if (!c.ok) console.error('[WhatsApp] confirmar al móvil', c.error);
      }
      return;
    }
    default:
  }
}
