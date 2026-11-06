import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/supabase/tipos';

// Cliente de Supabase en el NAVEGADOR (clave pública). Solo lo usa la página que recibe
// los enlaces de los emails (invitación y cambio de contraseña): guarda la sesión en las
// mismas cookies que lee el servidor.
export function supabaseNavegador() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) return null;
  return createBrowserClient<Database>(url, clave);
}
