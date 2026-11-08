import type { Metadata, Viewport } from 'next';
import './plataforma.css';

export const metadata: Metadata = {
  title: 'Dynamo · Plataforma',
  // La plataforma no se indexa nunca.
  robots: { index: false, follow: false },
  // Iconos:
  //  - Pestaña del navegador (favicon): la marca de las tres rayas de colores sobre azul
  //    (images/DYNAMO-NEW-LOGO.png) en app/icon.png y app/favicon.ico.
  //  - Pantalla de inicio del iPhone (apple-icon) y PWA (manifest.webmanifest): el logo de
  //    Dynamo blanco sobre el morado de marca (images/4.png).
  // Next sirve los iconos y pone los <link> solo.
};

// Sin zoom al tocar un campo para escribir (iPhone acerca la pantalla si la letra del
// campo es pequeña): en toda la plataforma, como ya se decidió en el mockup (anti-zoom iOS,
// 2026-06-22). iOS sigue dejando ampliar con dos dedos.
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1, viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
