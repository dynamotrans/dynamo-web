import { headers } from 'next/headers';

// Dirección de la web (pruebas o producción) para los enlaces que llevan los emails
// (invitación, código de alta, contraseña olvidada). Supabase solo los acepta si están en
// su lista de "Redirect URLs" (Authentication → URL Configuration).
//
// SEGURIDAD: la dirección sale de una variable FIJA, no de la cabecera Host de la
// petición. Si saliera de la cabecera, alguien podría pedir "he olvidado mi contraseña"
// para otra persona con una cabecera trucada y que su email llevara un enlace a otra web
// (envenenamiento de cabecera Host). Orden:
//   1. SITE_URL, si se pone a mano en Vercel (p. ej. https://dynamotrans.com el día del lanzamiento).
//   2. La que da Vercel sola: la de la rama en pruebas, la del dominio en producción.
//   3. Solo en local (sin Vercel), la cabecera Host.
export async function origen(): Promise<string> {
  const fija = process.env.SITE_URL?.trim().replace(/\/+$/, '');
  if (fija) return fija;
  const vercel = process.env.VERCEL_ENV === 'production'
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  return `${host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'}://${host}`;
}
