'use client';

// Combo de OPERADOR de Nuevo envío (calcado del mockup): Dynamo elegido por defecto como
// chip lavanda con ✕; al quitarlo se abre la lista con Dynamo primero, el catálogo privado
// de transportistas del cliente (nombre + CIF · contacto) y «+ Añade tu operador…», que
// lleva a la pantalla de Transportistas. Elegir bloquea el campo; la ✕ o pulsar el chip
// lo vuelven a abrir. `valor` vacío = Dynamo.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export type OperadorOpcion = { id: string; nombre: string; cif?: string | null; contacto?: string | null };
export const DYNAMO_NOMBRE = 'Dynamo Operador Logístico, S.L.';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const IcoCamion = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="1" y="3" width="15" height="13" rx="1.5" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);

export default function CampoOperador({ operadores, valor, onCambio }: {
  operadores: OperadorOpcion[];
  valor: string;                     // '' = Dynamo (por defecto) | operadores.id
  onCambio: (id: string) => void;
}) {
  const router = useRouter();
  const [eligiendo, setEligiendo] = useState(false);
  const [q, setQ] = useState('');
  const inp = useRef<HTMLInputElement>(null);
  const actual = valor ? operadores.find((o) => o.id === valor) ?? null : null;
  const abrir = () => { setEligiendo(true); setQ(''); setTimeout(() => inp.current?.focus(), 0); };
  const elegir = (id: string) => { onCambio(id); setEligiendo(false); };
  const w = norm(q.trim());
  const lista = operadores.filter((o) => !w || norm([o.nombre, o.cif, o.contacto].filter(Boolean).join(' ')).includes(w));
  const dynamoSale = !w || norm(`${DYNAMO_NOMBRE} dynamo operador transporte logistico`).includes(w);

  if (!eligiendo) {
    return (
      <div id="opCombo" className={`ptar-input-wrap ptar-picked${valor ? '' : ' op-dynamo'}`}>
        <IcoCamion />
        <input type="text" readOnly value={valor ? (actual?.nombre ?? '') : DYNAMO_NOMBRE} aria-label="Operador de transporte elegido"
          onClick={abrir} style={{ cursor: 'pointer' }} />
        <button type="button" className="ptar-clear" onClick={abrir} aria-label="Cambiar operador">✕</button>
      </div>
    );
  }
  return (
    <div id="opCombo" className="ptar-input-wrap alm-rep-wrap">
      <IcoCamion />
      <input ref={inp} type="text" value={q} placeholder="Operador de transporte · busca en tu catálogo" autoComplete="off" inputMode="search"
        aria-label="Buscar operador de transporte" onChange={(ev) => setQ(ev.target.value)}
        onKeyDown={(ev) => { if (ev.key === 'Escape') setEligiendo(false); }}
        onBlur={() => setTimeout(() => setEligiendo(false), 150)} />
      <ul className="ptar-sug alm-combo-list">
        {dynamoSale && (
          <li className="alm-combo-item" onMouseDown={(ev) => { ev.preventDefault(); elegir(''); }}>
            <span><strong style={{ color: 'var(--purple)' }}>{DYNAMO_NOMBRE}</strong></span>
            <span className="sub">Lo gestiona Dynamo · con precio y seguimiento</span>
          </li>
        )}
        {lista.map((o) => (
          <li key={o.id} className="alm-combo-item" onMouseDown={(ev) => { ev.preventDefault(); elegir(o.id); }}>
            <span><strong>{o.nombre}</strong></span>
            <span className="sub">{[o.cif, o.contacto].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
        <li className="alm-combo-item" onMouseDown={(ev) => { ev.preventDefault(); router.push('/panel/operadores'); }}>
          <span style={{ color: 'var(--purple)', fontWeight: 700 }}>+ Añade tu operador, empresa de transporte o transportista autónomo</span>
        </li>
      </ul>
    </div>
  );
}
