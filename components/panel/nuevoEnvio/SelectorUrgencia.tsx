'use client';

// Desplegable propio del tipo de fecha de recogida. Se hace a mano (en vez de un <select>
// nativo) solo para poder poner el NOMBRE en negrita y la aclaración entre paréntesis en
// peso normal, cada opción con su color: ventana de 1 a 3 días en verde, fecha fija en negro.
import { useEffect, useRef, useState } from 'react';

type Urgencia = 'dia' | 'estandar';
const OPCIONES: { v: Urgencia; nombre: string; nota: string; color: string }[] = [
  { v: 'estandar', nombre: 'Recogida de 1 a 3 días', nota: 'más económica', color: 'var(--green)' },
  { v: 'dia', nombre: 'Fecha fija', nota: 'un día concreto, más caro', color: '#dc2626' },
];

export function SelectorUrgencia({ valor, onCambio }: { valor: Urgencia; onCambio: (v: Urgencia) => void }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);
  const sel = OPCIONES.find((o) => o.v === valor) ?? OPCIONES[0];
  return (
    <div className="ptar-urg" ref={ref}>
      <button type="button" className="ptar-select ptar-urg-btn" aria-haspopup="listbox" aria-expanded={abierto}
        aria-label="Días de recogida" onClick={() => setAbierto((v) => !v)} style={{ color: sel.color }}>
        <span className="ptar-urg-txt"><strong>{sel.nombre}</strong> <span className="ptar-urg-nota">({sel.nota})</span></span>
        <svg className="ptar-urg-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {abierto && (
        <ul className="ptar-sug ptar-urg-list" role="listbox">
          {OPCIONES.map((o) => (
            <li key={o.v} role="option" aria-selected={o.v === valor} style={{ color: o.color }}
              onMouseDown={(e) => { e.preventDefault(); onCambio(o.v); setAbierto(false); }}>
              <strong>{o.nombre}</strong> <span className="ptar-urg-nota">({o.nota})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
