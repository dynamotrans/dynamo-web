// Aviso de errores desde el navegador. Sentry solo se descarga si NEXT_PUBLIC_SENTRY_DSN
// existe: sin ella, ni un byte de más en la página.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

let listo: Promise<typeof import('@sentry/nextjs')> | null = null;

export function iniciarAvisoErrores() {
  if (!dsn || listo) return listo;
  listo = import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
      sendDefaultPii: false,          // ni IP, ni cookies, ni cabeceras
      tracesSampleRate: 0,            // solo errores
      replaysSessionSampleRate: 0,    // sin grabar pantallas de clientes
      replaysOnErrorSampleRate: 0,
      ignoreErrors: ['ResizeObserver loop', 'Non-Error promise rejection captured', 'NEXT_REDIRECT', 'NEXT_NOT_FOUND'],
    });
    return Sentry;
  });
  return listo;
}

export function avisarError(error: unknown) {
  iniciarAvisoErrores()?.then((Sentry) => Sentry.captureException(error)).catch(() => {});
}
