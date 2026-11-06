'use server';

import { supabaseServidor } from '@/lib/supabase/server';
import { origen } from '@/lib/origen';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type EstadoOlvido = { enviado: boolean; error: string | null; email?: string };

export async function pedirEnlace(_prev: EstadoOlvido, datos: FormData): Promise<EstadoOlvido> {
  comprobarEntrada("app/panel/olvido/acciones#pedirEnlace", [_prev, datos]);
  const email = String(datos.get('email') || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { enviado: false, error: 'Escribe tu email.', email };
  const supabase = await supabaseServidor();
  if (!supabase) return { enviado: false, error: 'La plataforma no está conectada a la base de datos.', email };
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await origen()}/panel/confirmar` });
  if (error && /rate limit|too many|security purposes/i.test(error.message)) {
    return { enviado: false, error: 'Has pedido varios enlaces seguidos. Espera unos minutos y vuelve a probar.', email };
  }
  // Siempre la misma respuesta, exista o no la cuenta: así nadie averigua qué emails
  // tienen cuenta en la plataforma.
  return { enviado: true, error: null, email };
}
