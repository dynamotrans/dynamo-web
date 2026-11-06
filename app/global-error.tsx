'use client';

import { useEffect } from 'react';
import { CONTACTO } from '@/lib/atencion';
import { avisarError } from '@/lib/avisoError';

// Último recurso: si falla hasta el marco de la página. Lleva su propio <html> (Next.js lo exige).
export default function ErrorGeneral({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Aviso a Sentry (no hace nada si no está configurado).
  useEffect(() => { avisarError(error); }, [error]);
  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', color: '#0a0230' }}>
        <h1 style={{ fontSize: '1.3rem' }}>Algo no ha ido bien</h1>
        <p>No se ha podido cargar la página. Vuelve a intentarlo en un momento.</p>
        <button onClick={() => reset()} style={{ padding: '0.6rem 1rem', borderRadius: 8, border: 0, background: '#3300cc', color: '#fff', fontWeight: 700 }}>Reintentar</button>
        <p style={{ fontSize: '0.85rem', color: '#667085' }}>Si sigue pasando, llámanos al {CONTACTO.telefono}{error.digest ? ` (código ${error.digest})` : ''}.</p>
      </body>
    </html>
  );
}
