import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos';

// Cliente con la clave PÚBLICA y SIN sesión: el de la página "aceptar carga", que abre el
// transportista sin iniciar sesión. Solo puede usar las funciones de la puerta pública
// (oferta_publica, reservar_envio_publico, aceptar_oferta_publica…); las tablas no las ve.
export function supabasePublico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) return null;
  return createClient<Database>(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}
