// Política de seguridad de la WEB PÚBLICA estática (la de la plataforma la pone
// middleware.ts con su llave de un solo uso). Misma lista que lib/csp.ts → cspPublica.
const TRADUCTOR = 'https://translate.google.com https://translate.googleapis.com https://translate-pa.googleapis.com https://www.gstatic.com';
const CSP_PUBLICA = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.googletagmanager.com ${TRADUCTOR} https://vercel.live`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net ${TRADUCTOR}`,
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://nominatim.openstreetmap.org https://get.geojs.io https://date.nager.at ${TRADUCTOR} https://vercel.live`,
  `frame-src 'self' https://www.google.com ${TRADUCTOR} https://vercel.live`,
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",   // + 'upgrade-insecure-requests' al pasar a bloquear
  'report-uri /api/csp-informe', 'report-to csp',
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Los PDF (orden de carga y CMR) leen del disco el logo y los fondos del impreso CMR:
  // hay que meterlos en la función del servidor, que en Vercel no ve la carpeta public/.
  outputFileTracingIncludes: {
    // También donde se generan sin pasar por el visor: la orden desde el enlace público,
    // «Guardar copia» de la ficha (acción de servidor de la página de Envíos) y la
    // proforma de los almacenamientos.
    '/panel/envios/[id]/[documento]': ['./images/2.png', './images/cmr-fondo-*.jpg', './lib/pdf/recursos/*.png'],
    '/panel/envios': ['./images/2.png', './images/cmr-fondo-*.jpg', './lib/pdf/recursos/*.png'],
    '/carga/[token]/orden-de-carga': ['./images/2.png', './lib/pdf/recursos/*.png'],
    '/panel/almacenamientos/[id]/proforma': ['./images/4.png'],
    '/panel/recursos/[documento]': ['./images/cmr-fondo-*.jpg'],
  },
  // Fuera de la plataforma (que la pone el middleware): la política de la web pública,
  // en modo SOLO AVISAR, y aislar la ventana de otras webs (Cross-Origin-Opener-Policy).
  async headers() {
    return [
      { source: '/((?!panel|carga|cmr|api|_next).*)', headers: [
        { key: 'Content-Security-Policy-Report-Only', value: CSP_PUBLICA },
        { key: 'Reporting-Endpoints', value: 'csp="/api/csp-informe"' },
      ] },
      { source: '/:path*', headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
      ] },
    ];
  },
  async rewrites() {
    return {
      // La portada es el index.html estático de siempre (copiado a public/).
      beforeFiles: [{ source: '/', destination: '/index.html' }],
    };
  },
};
export default nextConfig;
