'use client';

// «⋯ Más» / «Acciones»: las acciones secundarias de una ficha en un desplegable (de varias
// filas de botones a una). EMERGENTE a lo ancho: velo + panel centrado en escritorio; en
// móvil, hoja pegada abajo. Lo usan la ficha de Dynamo y la del cliente.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function MasAcciones({ children, etiqueta = '⋯ Más', titulo = 'Más acciones', id }: {
  children: React.ReactNode; etiqueta?: React.ReactNode; titulo?: string; id?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!abierto) return;
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [abierto]);
  // EMERGENTE a lo ancho (usuario, 2026-11-10): velo + panel centrado (hoja inferior en
  // móvil). En PORTAL sobre <body>: dentro del modal de la ficha (que lleva transform por
  // su animación) el position:fixed se calcula contra el modal y el panel caía fuera de
  // la pantalla — solo se veía el velo. El velo cierra, así que no hace falta detectar
  // clics «fuera».
  return (
    <div className="ficha-mas">
      <button type="button" className="btn-secondary" id={id} aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>{etiqueta}</button>
      {abierto && createPortal(<>
        <div className="ficha-mas-backdrop" onClick={() => setAbierto(false)} />
        <div className="ficha-mas-menu" role="menu">
          <div className="fm-asa" aria-hidden="true" />
          <div className="fm-cab">
            <span>{titulo}</span>
            <button type="button" className="fm-x" aria-label="Cerrar" onClick={() => setAbierto(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="fm-lista" onClick={() => setAbierto(false)}>{children}</div>
        </div>
      </>, document.body)}
    </div>
  );
}
