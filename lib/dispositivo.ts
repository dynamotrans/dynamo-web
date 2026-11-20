// Dispositivo de quien entra (aviso «Nuevo acceso a tu cuenta», usuario 2026-11-20).
// El navegador se reconoce por un número al azar en una cookie propia; a la base de datos solo
// llega su huella (SHA-256). Para el email, el navegador y el sistema en palabras.

export const COOKIE_DISPOSITIVO = 'dyn_disp';

export function describirNavegador(ua: string | null | undefined): string | null {
  const u = ua ?? '';
  if (!u) return null;
  const navegador = /Edg\//.test(u) ? 'Edge' : /OPR\/|Opera/.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox'
    : /CriOS\/|Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : null;
  const sistema = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android'
    : /Mac OS X|Macintosh/.test(u) ? 'macOS' : /Windows/.test(u) ? 'Windows' : /Linux/.test(u) ? 'Linux' : null;
  if (navegador && sistema) return `${navegador} en ${sistema}`;
  return navegador ?? sistema ?? 'Navegador sin identificar';
}

// Ciudad y país aproximados que pone Vercel en la petición (sin guardar la IP).
export function lugarAproximado(h: { get(n: string): string | null }): string | null {
  let ciudad = h.get('x-vercel-ip-city');
  try { ciudad = ciudad ? decodeURIComponent(ciudad) : null; } catch { /* se queda como venga */ }
  const pais = h.get('x-vercel-ip-country');
  const txt = [ciudad, pais].filter(Boolean).join(', ');
  return txt || null;
}

export async function huella(valor: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
