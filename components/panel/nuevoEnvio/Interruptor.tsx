'use client';


// ---- Interruptor Sí/No (el de plataforma elevadora/NIMA del mockup, regla 0-quater) --------
export function Interruptor({ titulo, valor, onCambio }: { titulo: string; valor: boolean; onCambio: (v: boolean) => void }) {
  return (
    <div className="ptar-field">
      <label className="ptar-label">{titulo}</label>
      <label className="ptar-tramp-box">
        <input type="checkbox" className="ptar-switch-input" checked={valor} onChange={(e) => onCambio(e.target.checked)} />
        <span className="ptar-switch" aria-hidden="true" />
        <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">No (más económico)</span><span className="tramp-on">Sí (más caro)</span></span>
      </label>
    </div>
  );
}
