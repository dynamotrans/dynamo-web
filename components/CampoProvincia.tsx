'use client';

import { PROVINCIAS_LISTA } from '@/lib/provinciasEs';

// Provincia (usuario, 2026-11-22): en España, desplegable con las 52 provincias, para que nadie
// escriba la misma de tres maneras; fuera de España, texto libre. Un valor antiguo que no esté
// en la lista se conserva como una opción más, para no perderlo al guardar.
export default function CampoProvincia({ id, pais, valor, onCambio, placeholder = 'Provincia o región', style, className, disabled, ariaInvalid }: {
  id: string; pais: string | null | undefined; valor: string; onCambio: (v: string) => void;
  placeholder?: string; style?: React.CSSProperties; className?: string; disabled?: boolean; ariaInvalid?: boolean;
}) {
  if ((pais || 'ES').toUpperCase() !== 'ES') {
    return <input id={id} type="text" value={valor} placeholder={placeholder} disabled={disabled} style={style} className={className}
      aria-invalid={ariaInvalid || undefined} onChange={(e) => onCambio(e.target.value)} />;
  }
  const antiguo = valor && !PROVINCIAS_LISTA.includes(valor) ? valor : null;
  return (
    <select id={id} className={`ptar-select${className ? ` ${className}` : ''}`} value={valor} disabled={disabled} style={style}
      aria-invalid={ariaInvalid || undefined} onChange={(e) => onCambio(e.target.value)}>
      <option value="">Elige la provincia…</option>
      {antiguo && <option value={antiguo}>{antiguo}</option>}
      {PROVINCIAS_LISTA.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
  );
}
