import type { Metadata, Viewport } from 'next';
import './plataforma.css';

export const metadata: Metadata = {
  title: 'Dynamo · Plataforma',
  // La plataforma no se indexa nunca.
  robots: { index: false, follow: false },
  // Favicon: la marca (las tres franjas) en app/icon.svg, app/favicon.ico y app/apple-icon.png;
  // Next los sirve y pone los <link> solo. Sin texto: a 16 px el logo con letras no se lee.
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
