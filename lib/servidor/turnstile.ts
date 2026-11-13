import 'server-only';

// Cloudflare Turnstile (tarea 76): captcha invisible y gratuito en los formularios
// públicos que disparan emails (registro y olvido de contraseña), para proteger la
// cuota y la reputación de Postmark frente a bots — no para frenar a usuarios reales.
//
// CLAVES: sin variables de entorno se usan las CLAVES DE PRUEBA oficiales de
// Cloudflare (el widget se ve con el rótulo «Testing only» y siempre pasa). Antes de
// producción, el usuario crea el sitio en su cuenta de Cloudflare (gratis) y pone en
// Vercel NEXT_PUBLIC_TURNSTILE_SITE_KEY y TURNSTILE_SECRET_KEY (esta última Sensitive).
const SECRETO_PRUEBA = '1x0000000000000000000000000000000AA'; // siempre pasa

// Comprueba el token que el widget dejó en el formulario (campo cf-turnstile-response).
// Criterio: SOLO bloquea cuando Cloudflare responde explícitamente «no» (success:false).
// Si el token no llegó con las claves de prueba (script bloqueado por un adblocker,
// tests), o Cloudflare no responde (red caída, 5xx), se deja pasar: este captcha
// protege una cuota de emails, no es una autenticación — bloquear altas reales por una
// caída de Cloudflare sería peor que dejar pasar un bot con rate limit detrás.
export async function turnstileOk(f: FormData): Promise<boolean> {
  const secreto = process.env.TURNSTILE_SECRET_KEY || SECRETO_PRUEBA;
  const token = String(f.get('cf-turnstile-response') ?? '').slice(0, 4096);
  if (!token) return secreto === SECRETO_PRUEBA;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: secreto, response: token }),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return true;
    const j = (await r.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return true;
  }
}
