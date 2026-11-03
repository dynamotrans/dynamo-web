/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Los PDF (orden de carga y CMR) leen del disco el logo y los fondos del impreso CMR:
  // hay que meterlos en la función del servidor, que en Vercel no ve la carpeta public/.
  outputFileTracingIncludes: {
    '/panel/envios/[id]/[documento]': ['./images/2.png', './images/cmr-fondo-*.jpg', './lib/pdf/recursos/*.png'],
  },
  async rewrites() {
    return {
      // La portada es el index.html estático de siempre (copiado a public/).
      beforeFiles: [{ source: '/', destination: '/index.html' }],
    };
  },
};
export default nextConfig;
