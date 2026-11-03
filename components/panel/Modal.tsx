'use client';

// Ventana del panel: la misma de dashboard.html (#dashModal, clases dash-modal-*).
import { useEffect } from 'react';

export default function Modal({ titulo, sub, icono, abierto, onCerrar, pie, acciones, ancho, children }: {
  titulo: string; sub?: React.ReactNode; icono?: React.ReactNode; abierto: boolean;
  onCerrar: () => void; pie?: React.ReactNode; children: React.ReactNode;
  acciones?: React.ReactNode;   // barra de acciones bajo el título (la del "Ver detalle" del mockup)
  ancho?: number;               // ancho máximo de la ventana, si hace falta más que el normal
}) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  return (
    <div className="dash-modal open" role="dialog" aria-modal="true" aria-labelledby="dashModalTitle">
      <div className="dash-modal-backdrop" onClick={onCerrar} />
      <div className="dash-modal-card" role="document" style={ancho ? { maxWidth: ancho } : undefined}>
        <button className="dash-modal-close" onClick={onCerrar} aria-label="Cerrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <div className="dash-modal-header">
          {icono && <div className="dash-modal-icon">{icono}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="dash-modal-title" id="dashModalTitle">{titulo}</h2>
            {sub && <p className="dash-modal-sub">{sub}</p>}
          </div>
        </div>
        {acciones && <div className="dash-modal-actions">{acciones}</div>}
        <div className="dash-modal-body">{children}</div>
        {pie && <div className="dash-modal-footer">{pie}</div>}
      </div>
    </div>
  );
}
