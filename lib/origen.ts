import { headers } from 'next/headers';

// Dirección de la web desde la que se hace la petición (pruebas o producción), para los
// enlaces que llevan los emails. Supabase solo los acepta si están en su lista de
// "Redirect URLs" (Authentication → URL Configuration).
export async function origen(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
