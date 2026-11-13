'use server';

import { redirect } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';
import { origen } from '@/lib/origen';
import { turnstileOk } from '@/lib/servidor/turnstile';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type EstadoOlvido = { enviado: boolean; error: string | null; email?: string };

export async function pedirEnlace(_prev: EstadoOlvido, datos: FormData): Promise<EstadoOlvido> {
  comprobarEntrada("app/panel/olvido/acciones#pedirEnlace", [_prev, datos]);
  const email = String(datos.get('email') || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { enviado: false, error: 'Escribe tu email.', email };
  // Captcha (Cloudflare Turnstile, tarea 76): protege la cuota de emails frente a bots.
  if (!(await turnstileOk(datos))) return { enviado: false, error: 'No hemos podido comprobar que no eres un robot. Recarga la página y vuelve a intentarlo.', email };
  const supabase = await supabaseServidor();
  if (!supabase) return { enviado: false, error: 'La plataforma no está conectada a la base de datos.', email };
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await origen()}/panel/confirmar` });
  if (error && /rate limit|too many|security purposes/i.test(error.message)) {
    return { enviado: false, error: 'Has pedido varios enlaces seguidos. Espera unos minutos y vuelve a probar.', email };
  }
  // Siempre el mismo destino, exista o no la cuenta: así nadie averigua qué emails
  // tienen cuenta en la plataforma. DOBLE VÍA (usuario, 2026-11-11): el email trae
  // enlace Y código de 6 cifras, y esta pantalla deja teclear el código — el enlace a
  // veces lo quema el escáner del correo o se abre en otro navegador.
  redirect(`/panel/olvido/codigo?email=${encodeURIComponent(email)}`);
}

export type EstadoCodigoOlvido = { error: string | null; reenviado?: boolean };

// El código de 6 cifras del email de recuperación: canjearlo por sesión y a crear la
// contraseña nueva. Inmune a escáneres y vale en cualquier navegador.
export async function comprobarCodigoOlvido(_prev: EstadoCodigoOlvido, f: FormData): Promise<EstadoCodigoOlvido> {
  comprobarEntrada("app/panel/olvido/acciones#comprobarCodigoOlvido", [_prev, f]);
  const email = String(f.get('email') || '').trim().toLowerCase();
  const token = String(f.get('codigo') ?? '').replace(/\D/g, '');
  if (!email) return { error: 'Falta el email. Vuelve a empezar.' };
  if (token.length !== 6) return { error: 'Escribe las 6 cifras del código que te hemos enviado.' };
  const supabase = await supabaseServidor(true);
  if (!supabase) return { error: 'La plataforma no está conectada a la base de datos.' };
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
  if (error) {
    if (!error.status || error.status >= 500) return { error: 'Ahora mismo no se puede comprobar el código. Prueba en un momento.' };
    return { error: 'El código no es correcto o ha caducado. Revísalo o pide otro.' };
  }
  redirect('/panel/nueva-contrasena');
}

// Reenviar: otro email de recuperación (enlace + código). Misma respuesta siempre.
export async function reenviarOlvido(_prev: EstadoCodigoOlvido, f: FormData): Promise<EstadoCodigoOlvido> {
  comprobarEntrada("app/panel/olvido/acciones#reenviarOlvido", [_prev, f]);
  const email = String(f.get('email') || '').trim().toLowerCase();
  const supabase = await supabaseServidor();
  if (!supabase || !email) return { error: 'No se ha podido reenviar. Vuelve a empezar.' };
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await origen()}/panel/confirmar` });
  if (error && /rate limit|too many|security purposes/i.test(error.message)) {
    return { error: 'Espera un minuto antes de pedir otro código.' };
  }
  return { error: null, reenviado: true };
}
