// Aviso automático de errores en producción (Sentry). APAGADO mientras no exista
// SENTRY_DSN en las variables de Vercel: sin ella no se inicializa nada ni se envía nada.
// Ver PRODUCCION.md → «Aviso de errores (Sentry)».
import * as Sentry from '@sentry/nextjs';

const ajustes = () => ({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  // Datos personales fuera: ni IP, ni cookies, ni cabeceras del usuario.
  sendDefaultPii: false,
  // Solo errores; nada de medir rendimiento (consume cuota y no lo necesitamos).
  tracesSampleRate: 0,
});

export async function register() {
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') Sentry.init(ajustes());
}

// Errores en páginas, acciones de servidor y rutas: Next.js los pasa aquí.
export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (!process.env.SENTRY_DSN) return;
  return Sentry.captureRequestError(...args);
};
