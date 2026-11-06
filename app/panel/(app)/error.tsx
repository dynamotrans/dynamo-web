'use client';

// Si una pantalla del panel falla al cargar, se ve esto en lugar de una página en blanco.
// El detalle técnico no se enseña: queda en la consola del navegador (y en Sentry, si está activo).
import { useEffect } from 'react';
import { CONTACTO } from '@/lib/atencion';
import { avisarError } from '@/lib/avisoError';

export default function ErrorPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[pantalla]', error.digest ?? '', error.message); avisarError(error); }, [error]);
  return (
    <section className="section active">
      <div className="pt-aviso error" style={{ maxWidth: 640 }}>
        <div>
          <strong>No se ha podido cargar esta pantalla.</strong> Puede ser la conexión o que acabamos de publicar una versión nueva.
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => reset()}>Reintentar</button>
            <button className="btn-ghost" onClick={() => window.location.reload()}>Recargar la página</button>
          </div>
          <div style={{ marginTop: '0.6rem', fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>Si sigue pasando, llámanos al {CONTACTO.telefono}{error.digest ? ` (código ${error.digest})` : ''}.</div>
        </div>
      </div>
    </section>
  );
}
