// Política de seguridad de contenido (CSP). Hoy en modo «SOLO AVISAR» (Report-Only):
// el navegador no bloquea nada, solo nos manda un informe a /api/csp-informe de lo que
// habría bloqueado. Cuando los informes estén limpios, se pasa a modo bloquear cambiando
// el nombre de la cabecera (CABECERA_CSP). Ver PRODUCCION.md, punto 06.
//
// Dos niveles:
//  · PLATAFORMA (/panel, /carga, /cmr): estricta. Cada página lleva una llave de un solo
//    uso (nonce) y solo se ejecutan los scripts que la llevan (y los que estos carguen:
//    'strict-dynamic', p. ej. el de Google Translate). Un script inyectado no corre.
//  · WEB PÚBLICA estática: lista de servicios que ya usa (no admite nonce: es HTML fijo).

// Para pasar a BLOQUEAR: BLOQUEAR = true (cambia la cabecera y añade upgrade-insecure-requests).
const BLOQUEAR = true as boolean;   // PLATAFORMA en modo bloquear desde el 2026-11-22 (pruebas de navegador limpias)
export const CABECERA_CSP = BLOQUEAR ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
export const INFORME_CSP = '/api/csp-informe';

const comunes = [
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Stripe: el formulario «Pagar con tarjeta» redirige a su página de pago.
  "form-action 'self' https://checkout.stripe.com",
  // Sin 'upgrade-insecure-requests': todo va ya por https (HSTS de un año) y en local (http)
  // rompería la web.
  `report-uri ${INFORME_CSP}`,
  'report-to csp',
];
const TRADUCTOR = 'https://translate.google.com https://translate.googleapis.com https://translate-pa.googleapis.com https://www.gstatic.com';
const VERCEL = 'https://vercel.live';   // barra de comentarios de las vistas previas de Vercel
// Captcha de registro y olvido (tarea 76): su script se inyecta desde el bundle (lo
// permite 'strict-dynamic'), pero el widget pinta un iframe de este dominio.
const TURNSTILE = 'https://challenges.cloudflare.com';
// El mapa (Google Maps JavaScript API): su script lo inserta el nuestro ('strict-dynamic'),
// pero pide las teselas y los datos a estos dominios. Con la clave de Google puesta ya no se
// llama a OpenStreetMap desde el navegador (direcciones y mapa van por Google).
const GOOGLE_MAPAS = 'https://*.googleapis.com https://*.gstatic.com https://*.google.com';
const SIN_GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ? '' : 'https://nominatim.openstreetmap.org';
// Pago con tarjeta en una ventana de la plataforma (Stripe incrustado): su script lo inserta
// el nuestro ('strict-dynamic'); el formulario de pago es un marco suyo y habla con su API.
const STRIPE_MARCOS = 'https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://checkout.stripe.com';
const STRIPE_API = 'https://api.stripe.com https://checkout.stripe.com';
const SENTRY = 'https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io';   // aviso de errores

// La base de datos configurada (en producción ya entra en *.supabase.co; en las pruebas locales y
// del CI es http://127.0.0.1:54321): su dirección y la de su canal en vivo (ws/wss).
function baseDeDatos(): string {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    return `${u.origin} ${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}`;
  } catch { return ''; }
}

export function cspPlataforma(nonce: string, desarrollo = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'${desarrollo ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${TRADUCTOR}`,
    `img-src 'self' data: blob: https: ${baseDeDatos().split(' ')[0]}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${baseDeDatos()} ${GOOGLE_MAPAS} ${SIN_GOOGLE} ${TRADUCTOR} ${VERCEL} ${SENTRY} ${STRIPE_API} wss://ws-us3.pusher.com`,
    `frame-src 'self' ${TRADUCTOR} ${VERCEL} ${TURNSTILE} ${STRIPE_MARCOS}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'none'",
    ...comunes,
  ].join('; ');
}

export const cspPublica = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.googletagmanager.com ${TRADUCTOR} ${VERCEL}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net ${TRADUCTOR}`,
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://nominatim.openstreetmap.org https://get.geojs.io https://date.nager.at ${TRADUCTOR} ${VERCEL}`,
  `frame-src 'self' https://www.google.com ${TRADUCTOR} ${VERCEL}`,
  "worker-src 'self' blob:",
  "base-uri 'self'",
  ...comunes,
].join('; ');

// Llave de un solo uso por petición (16 bytes aleatorios en base64).
export function nuevoNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b));
}
