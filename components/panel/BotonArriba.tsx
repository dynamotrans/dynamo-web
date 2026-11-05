'use client';

// Flecha abajo a la derecha para volver arriba del todo (como en el mockup: .back-top).
// Sale al bajar un poco y desplaza con suavidad (sin animación si el sistema pide menos
// movimiento).
import { useEffect, useState } from 'react';

const DESDE = 220;   // px bajados para que aparezca

export default function BotonArriba() {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    let pendiente = false;
    const mira = () => { pendiente = false; setVer(window.scrollY > DESDE); };
    const alMover = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(mira); } };
    window.addEventListener('scroll', alMover, { passive: true });
    mira();
    return () => window.removeEventListener('scroll', alMover);
  }, []);
  const subir = () => {
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: suave ? 'smooth' : 'auto' });
  };
  return (
    <button type="button" className={`back-top${ver ? ' show' : ''}`} aria-label="Volver arriba" onClick={subir} tabIndex={ver ? 0 : -1}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>
    </button>
  );
}
