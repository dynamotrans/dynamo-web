import 'server-only';
import type { SB } from '@/lib/supabase/cliente';
import { supabasePublico } from '@/lib/supabase/publico';

// «ESCRIBE TU CONTRASEÑA» antes de una acción delicada (usuario, 2026-11-18): cambiar el
// email de una cuenta, cambiar un rol, dar de alta a alguien de Dynamo, anonimizar o quitar
// un doble paso. Con la sesión abierta no basta: quien se siente en un ordenador que
// alguien dejó sin cerrar no conoce la contraseña, y sin ella no puede quedarse con una
// cuenta (p. ej. poniendo SU email a la del Admin Master).
//
// La contraseña se comprueba con una conexión aparte, sin tocar la sesión del navegador
// (mismo método que «Cambiar contraseña» de Mi cuenta).
export async function comprobarMiClave(sb: SB, clave: string): Promise<string | null> {
  if (!clave) return 'Escribe tu contraseña para confirmar.';
  const { data: { user } } = await sb.auth.getUser();
  const pub = supabasePublico();
  if (!user?.email || !pub) return 'No se ha podido comprobar tu cuenta. Vuelve a entrar.';
  const prueba = await pub.auth.signInWithPassword({ email: user.email, password: clave });
  if (prueba.error) {
    if (!prueba.error.status || prueba.error.status >= 500) return 'Ahora mismo no se puede comprobar tu contraseña. Prueba en un momento.';
    if (prueba.error.status === 429) return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.';
    return 'Tu contraseña no es correcta: no se ha hecho ningún cambio.';
  }
  await pub.auth.signOut({ scope: 'local' }).catch(() => {});   // solo esa sesión de prueba
  return null;
}
