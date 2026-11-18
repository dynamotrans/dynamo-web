// ¿Las cookies llevan la marca «Secure» (solo viajan por HTTPS)? SIEMPRE, salvo cuando la
// propia web se sirve por http en el mismo ordenador (SITE_URL = http://localhost… o
// http://127.0.0.1…): ahí no hay HTTPS por el que mandarlas. Es el caso de las pruebas
// automáticas, y solo importa en Safari: Chrome acepta cookies «Secure» en localhost sin
// HTTPS, pero Safari las descarta y la sesión se perdía nada más entrar (2026-11-18).
// En Vercel, SITE_URL es https://… → marca puesta. Sin SITE_URL → marca puesta.
export function cookieSegura(sitio: string | undefined = process.env.SITE_URL): boolean {
  return !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test((sitio ?? '').trim());
}
