import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { COOKIE_RECORDAR, duracionSegunRecordar } from './recordar';
export { COOKIE_RECORDAR };

// Dirección y clave PÚBLICA de Supabase. La clave pública va al navegador por diseño:
// es segura SOLO porque todas las tablas tienen seguridad por filas (probado en
// tools/probar-migraciones). La clave de servicio NUNCA va aquí ni en el navegador.
export function configSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) return null;
  return { url, clave };
}

// Cliente de Supabase para el servidor (páginas y acciones), con la sesión del usuario
// en cookies. Devuelve null si falta la configuración, para enseñar un aviso claro en
// vez de romper la página.
export async function supabaseServidor(recordar?: boolean) {
  const cfg = configSupabase();
  if (!cfg) return null;
  const almacen = await cookies();
  const mantener = recordar ?? almacen.get(COOKIE_RECORDAR)?.value !== '0';
  return createServerClient(cfg.url, cfg.clave, {
    cookies: {
      getAll() {
        return almacen.getAll();
      },
      setAll(lista) {
        try {
          lista.forEach(({ name, value, options }) => almacen.set(name, value, duracionSegunRecordar(options, mantener)));
        } catch {
          // Desde un Server Component no se pueden escribir cookies: lo hace el middleware.
        }
      },
    },
  });
}
