import 'server-only';

// HOLDED, SOLO LECTURA. Regla dura del usuario (2026-11-24): «la API de Holded solo hará
// lectura de Holded, NUNCA cambios hasta que expresamente lo hablemos».
// Por eso TODO lo que la plataforma habla con Holded pasa por este fichero, y aquí solo hay
// LECTURAS: las dos funciones piden con el método de leer y no aceptan otro. No se añade aquí
// (ni en ningún otro sitio) nada que cree, cambie, apruebe, cobre o borre en Holded sin una
// orden expresa suya. Una prueba (tests/unit/holdedSoloLectura.test.ts) vigila las dos cosas.
// La clave vive SOLO en Vercel (la pone el usuario; token «Global · Leer»): HOLDED_DYNAMO_API.
// Nunca en el chat, en el repositorio ni con NEXT_PUBLIC_.
const BASE = 'https://api.holded.com/api/v2';

const clave = (): string | null => {
  const e = process.env as Record<string, string | undefined>;   // leída al atender, no al compilar
  return (e['HOLDED_DYNAMO_API'] ?? e['HOLDED_API_KEY'] ?? '').trim() || null;
};
export const holdedListo = () => !!clave();

// CUÁNTAS CONSULTAS SE HACEN (usuario, 2026-11-26): la facturación tiene un tope al mes. Cada
// petición que sale se cuenta aquí, y quien la ha pedido lo apunta después en la base de datos
// (lib/servidor/holdedUso.ts). Solo es un contador en memoria: esta puerta sigue sin escribir nada.
let hechas = 0;
/** Las consultas hechas desde la última vez que se preguntó (y pone el contador a cero). */
export function consultasPorApuntar(): number { const n = hechas; hechas = 0; return n; }

export type FalloHolded = { ok: false; estado: number; error: string };
const AVISOS: Record<number, string> = {
  401: 'La clave de la facturación no vale o ha caducado.',
  403: 'La clave de la facturación no tiene permiso para leer esto.',
  404: 'La facturación no encuentra lo pedido.',
  429: 'Se ha llegado al tope de consultas a la facturación. Prueba dentro de un minuto.',
};
async function pedir(ruta: string, params: Record<string, string | number | undefined>, acepta: string): Promise<Response | FalloHolded> {
  const k = clave();
  if (!k) return { ok: false, estado: 0, error: 'La facturación no está conectada en este entorno.' };
  if (!/^\/[a-z0-9/_-]+$/i.test(ruta)) return { ok: false, estado: 0, error: 'Consulta no válida.' };
  const url = new URL(BASE + ruta);
  for (const [n, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(n, String(v));
  hechas++;
  try {
    const r = await fetch(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${k}`, accept: acepta } });
    if (r.ok) return r;
    // El detalle de su respuesta (sin la clave) ayuda a saber qué pasa: título y explicación.
    const j = await r.json().catch(() => null) as { title?: string; detail?: string } | null;
    const detalle = [j?.title, j?.detail].filter((x) => typeof x === 'string' && x).join(' · ').slice(0, 300);
    return { ok: false, estado: r.status, error: `${AVISOS[r.status] ?? 'La facturación no ha contestado bien.'} (respuesta ${r.status}${detalle ? `: ${detalle}` : ''})` };
  } catch {
    return { ok: false, estado: 0, error: 'No se ha podido hablar con la facturación. Prueba otra vez en un momento.' };
  }
}

/** Lee datos (JSON) de Holded. Solo lectura. */
export async function leerHolded(ruta: string, params: Record<string, string | number | undefined> = {}): Promise<{ ok: true; datos: unknown } | FalloHolded> {
  const r = await pedir(ruta, params, 'application/json');
  if (!(r instanceof Response)) return r;
  const datos = await r.json().catch(() => null);
  return datos === null ? { ok: false, estado: r.status, error: 'La facturación ha contestado algo que no se entiende.' } : { ok: true, datos };
}

/** Lee un documento (PDF) de Holded. Solo lectura. */
export async function leerHoldedPdf(ruta: string): Promise<{ ok: true; pdf: ArrayBuffer } | FalloHolded> {
  const r = await pedir(ruta, {}, 'application/pdf');
  if (!(r instanceof Response)) return r;
  return { ok: true, pdf: await r.arrayBuffer() };
}
