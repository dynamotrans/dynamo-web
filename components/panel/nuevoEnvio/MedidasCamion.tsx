'use client';

// Ventana «Medidas y peso máximo del camión» (usuario, 2026-11-16): se abre desde la línea
// de la altura máxima de Nuevo envío. Arriba, un selector que alterna entre los dos
// camiones; se abre en el que toca al envío (con plataforma elevadora, el rígido; sin
// ella, el tráiler). Mismas cifras que el resto de la plataforma: 13,30 m y 24 Tn el
// tráiler, 8 m y 14 Tn el rígido (lib/tarifador.ts); alturas 2,70 y 2,60 m (lib/formato.ts).
import { useState } from 'react';
import Modal from '../Modal';

type Camion = 'trailer' | 'rigido';
const CAMIONES: Record<Camion, { nombre: string; sub: string; filas: [string, string][] }> = {
  trailer: {
    nombre: 'Tráiler', sub: 'Tráiler tauliner (lona corredera)',
    filas: [
      ['Largo útil', '13,30 m'],
      ['Ancho útil', '2,40 m'],
      ['Altura máxima de la mercancía', '2,70 m'],
      ['Peso máximo', '24 toneladas'],
      ['Europalets (120 × 80 cm)', '33'],
      ['Palets americanos (120 × 100 cm)', '26'],
      ['Carga y descarga', 'Lateral, trasera y por el techo'],
    ],
  },
  rigido: {
    nombre: 'Rígido', sub: 'Camión rígido con plataforma elevadora',
    filas: [
      ['Largo útil', '8 m'],
      ['Ancho útil', '2,40 m'],
      ['Altura máxima de la mercancía', '2,60 m'],
      ['Peso máximo', '14 toneladas'],
      ['Europalets (120 × 80 cm)', '20'],
      ['Palets americanos (120 × 100 cm)', '16'],
      ['Carga y descarga', 'Lateral, trasera y por el techo'],
      ['Equipamiento', 'Plataforma elevadora y transpaleta'],
    ],
  },
};

export default function MedidasCamion({ inicial, onCerrar }: { inicial: Camion; onCerrar: () => void }) {
  const [cual, setCual] = useState<Camion>(inicial);
  const c = CAMIONES[cual];
  return (
    <Modal abierto ancho={480} onCerrar={onCerrar} titulo="Medidas y peso máximo" sub={c.sub}
      pie={<button className="btn-primary" style={{ minWidth: 120, justifyContent: 'center' }} onClick={onCerrar}>OK</button>}>
      <div className="tabs" style={{ marginBottom: '0.8rem' }} role="tablist">
        {(['trailer', 'rigido'] as Camion[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={cual === k} className={`tab${cual === k ? ' active' : ''}`} onClick={() => setCual(k)}>
            {CAMIONES[k].nombre}{k === inicial ? <span className="badge badge-blue" style={{ marginLeft: 6 }}>Tu envío</span> : null}
          </button>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-m)' }}>
        <tbody>
          {c.filas.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: '1px solid var(--gray-200)' }}>
              <td style={{ padding: '0.55rem 0.5rem 0.55rem 0', color: 'var(--gray-500)' }}>{k}</td>
              <td style={{ padding: '0.55rem 0', textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0', lineHeight: 1.4 }}>
        {cual === 'rigido'
          ? 'Es el camión de los envíos con plataforma elevadora: para sitios sin muelle ni medios de carga o descarga.'
          : 'Es el camión de los envíos sin plataforma elevadora.'}
      </p>
    </Modal>
  );
}
