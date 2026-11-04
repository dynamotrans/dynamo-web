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
  async rewrites() {
    return {
      // La portada es el index.html estático de siempre (copiado a public/).
      beforeFiles: [{ source: '/', destination: '/index.html' }],
    };
  },
};
export default nextConfig;
