import 'server-only';
import { errorBrevo } from '@/lib/brevoSitios';

// TODO lo que la plataforma habla con Brevo pasa por aquí (como Holded por lib/servidor/holded.ts).
// La clave es BREVO_API_KEY: la crea y la pega el usuario en Vercel (Sensitive), restringida a
// «contacto: Todos». Nunca en el repositorio ni en el chat. Con esa clave no se pueden enviar
// emails ni ver campañas: aquí solo se crean listas y contactos.
const API = 'https://api.brevo.com/v3';

export const brevoConectado = () => (process.env.BREVO_API_KEY ?? '').length > 20;

type Res<T> = { ok: true; datos: T } | { ok: false; error: string };

async function llamar<T>(ruta: string, init?: { metodo?: 'GET' | 'POST'; cuerpo?: unknown }): Promise<Res<T>> {
  const clave = process.env.BREVO_API_KEY ?? '';
  if (clave.length <= 20) return { ok: false, error: 'Falta la clave de Brevo en el servidor (BREVO_API_KEY).' };
  try {
    const r = await fetch(API + ruta, {
      method: init?.metodo ?? 'GET',
      headers: { 'api-key': clave, accept: 'application/json', ...(init?.cuerpo !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: init?.cuerpo !== undefined ? JSON.stringify(init.cuerpo) : undefined,
      cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
    const texto = await r.text();
    let j: unknown = null;
    try { j = texto ? JSON.parse(texto) : null; } catch { /* sin cuerpo JSON (204) */ }
    if (!r.ok) return { ok: false, error: errorBrevo(r.status, j) };
    return { ok: true, datos: j as T };
  } catch {
    return { ok: false, error: 'No se ha podido contactar con Brevo.' };
  }
}

type Lista = { id: number; name: string; folderId?: number };

/** Busca una lista por su nombre exacto; si no existe, la crea junto a las demás. */
export async function brevoListaPorNombre(nombre: string): Promise<Res<{ id: number; creada: boolean }>> {
  const todas: Lista[] = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const r = await llamar<{ lists?: Lista[]; count?: number }>(`/contacts/lists?limit=50&offset=${offset}`);
    if (!r.ok) return r;
    const pagina = r.datos?.lists ?? [];
    todas.push(...pagina);
    if (pagina.length < 50) break;
  }
  const hay = todas.find((l) => l.name.trim().toLowerCase() === nombre.trim().toLowerCase());
  if (hay) return { ok: true, datos: { id: hay.id, creada: false } };
  // En la misma carpeta que sus otras listas; sin ninguna, en la primera carpeta de la cuenta.
  let carpeta = todas.find((l) => typeof l.folderId === 'number')?.folderId ?? null;
  if (carpeta == null) {
    const c = await llamar<{ folders?: { id: number }[] }>('/contacts/folders?limit=10&offset=0');
    if (!c.ok) return c;
    carpeta = c.datos?.folders?.[0]?.id ?? null;
  }
  if (carpeta == null) return { ok: false, error: 'En Brevo no hay ninguna carpeta de listas: crea la lista a mano en Brevo.' };
  const n = await llamar<{ id?: number }>('/contacts/lists', { metodo: 'POST', cuerpo: { name: nombre, folderId: carpeta } });
  if (!n.ok) return n;
  if (!n.datos?.id) return { ok: false, error: 'Brevo no ha devuelto el número de la lista nueva.' };
  return { ok: true, datos: { id: n.datos.id, creada: true } };
}

/** Crea el contacto o, si ya existe, le actualiza los campos y lo añade a la lista. No envía nada. */
export async function brevoGuardarContacto(lista: number, email: string, atributos: Record<string, string>): Promise<Res<null>> {
  const r = await llamar<unknown>('/contacts', { metodo: 'POST', cuerpo: { email, attributes: atributos, listIds: [lista], updateEnabled: true } });
  return r.ok ? { ok: true, datos: null } : r;
}
