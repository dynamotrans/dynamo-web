'use server';

import { supabaseServidor } from '@/lib/supabase/server';
import { origen } from '@/lib/origen';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type EstadoNoHeSidoYo = { hecho: boolean; error: string | null; aviso?: string };

// «No he sido yo» (email de acceso nuevo): cierra todas las sesiones de esa persona, avisa a
// Dynamo y le manda el email para poner una contraseña nueva. Va con un botón (no al abrir el
// enlace): los programas de correo abren los enlaces solos para revisarlos.
export async function noHeSidoYo(_prev: EstadoNoHeSidoYo, datos: FormData): Promise<EstadoNoHeSidoYo> {
  comprobarEntrada("app/panel/no-he-sido-yo/[token]/acciones#noHeSidoYo", [_prev, datos]);
  const token = String(datos.get('token') || '');
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { hecho: false, error: 'Este enlace no es válido.' };
  const supabase = await supabaseServidor();
  if (!supabase) return { hecho: false, error: 'La plataforma no está conectada a la base de datos.' };
  const { data, error } = await supabase.rpc('no_he_sido_yo', { p_token: token });
  const r = (data ?? {}) as { ok?: boolean; resultado?: string; email?: string };
  if (error || !r.ok) return { hecho: false, error: 'Este enlace ya no vale (caduca a los 7 días). Llama a Dynamo al +34 955 225 945 o cambia tu contraseña desde «¿Olvidaste tu contraseña?».' };
  // Esta pestaña también sale (por si era una sesión abierta en este navegador).
  await supabase.auth.signOut({ scope: 'local' }).catch(() => null);
  if (r.email) await supabase.auth.resetPasswordForEmail(r.email, { redirectTo: `${await origen()}/panel/confirmar` }).catch(() => null);
  return {
    hecho: true, error: null,
    aviso: r.resultado === 'sin_cerrar'
      ? 'Hemos avisado a Dynamo, que cerrará tus sesiones. Te hemos mandado un email para poner una contraseña nueva: hazlo cuanto antes.'
      : 'Hemos cerrado todas las sesiones abiertas de tu cuenta y avisado a Dynamo. Te hemos mandado un email para poner una contraseña nueva: hazlo cuanto antes.',
  };
}
