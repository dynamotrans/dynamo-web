'use client';

import Tip from '@/components/Tip';

// ---- Interruptor Sí/No (el de plataforma elevadora/NIMA del mockup, regla 0-quater) --------
// Las coletillas por defecto hablan de precio (plataforma, NIMA, ADR encarecen); para un
// interruptor que no toca el precio (p. ej. Cita previa) se pasan otras con noTxt/siTxt.
// `tip` añade un ⓘ junto al título con la explicación de la sigla (tarea 86).
export function Interruptor({ titulo, valor, onCambio, noTxt = 'No (más económico)', siTxt = 'Sí (más caro)', tip }: {
  titulo: string; valor: boolean; onCambio: (v: boolean) => void; noTxt?: string; siTxt?: string; tip?: string;
}) {
  return (
    <div className="ptar-field">
      <label className="ptar-label">{titulo}{tip && <> <Tip texto={tip} aria={`Qué significa ${titulo}`} /></>}</label>
      <label className="ptar-tramp-box">
        <input type="checkbox" className="ptar-switch-input" checked={valor} onChange={(e) => onCambio(e.target.checked)} />
        <span className="ptar-switch" aria-hidden="true" />
        <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">{noTxt}</span><span className="tramp-on">{siTxt}</span></span>
      </label>
    </div>
  );
}
