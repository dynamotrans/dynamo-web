import 'server-only';
import type { Database } from '@/lib/supabase/tipos';
import { createClient } from '@supabase/supabase-js';

// Cliente con la CLAVE DE SERVICIO de Supabase (variable SUPABASE_SERVICE_ROLE_KEY, que
// pega el usuario en Vercel; NUNCA con NEXT_PUBLIC_ ni en el chat). Esta clave se salta
// la seguridad por filas, así que se usa SOLO para lo que la clave pública no puede
// hacer: enviar la invitación de un usuario nuevo en Supabase Auth. Todo lo demás (rol,
// empresa, estado) se guarda con la sesión del admin, para que la base de datos lo
// compruebe. Solo se importa desde acciones de servidor ('use server').
export function supabaseServicio() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return null;
  return createClient<Database>(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}
