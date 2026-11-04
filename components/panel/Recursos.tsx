'use client';

// Recursos: el diseño de #sec-recursos de dashboard.html (tarjetas .rec-card) y su ventana
// «Medidas de los camiones» (.med-tabs). Las medidas son las OFICIALES (regla 0-quinquies
// de CLAUDE.md): si cambian, cambiarlas también en index.html, en las hojas de sección y aquí.
import { useState } from 'react';
import Modal from './Modal';

// Regla 0-bis: todo PDF se ABRE en el visor (ventana nueva).
const abrir = (url: string) => { const w = window.open(url, '_blank'); if (!w) location.href = url; };

const MEDIDAS = {
  tauliner: [
    ['Largo (interior)', '13,30 m'], ['Ancho (interior)', '2,40 m'], ['Altura (interior)', '2,70 m'], ['Volumen aprox.', '86 m³'],
    ['Carga máx. mercancía', '24.000 kg'], ['Palés europeos (120×80)', '33 uds.'], ['Palés americanos (120×100)', '26 uds.'],
  ],
  rigido: [
    ['Largo (interior)', '8 m'], ['Ancho (interior)', '2,40 m'], ['Altura (interior)', '2,40 m'], ['Volumen aprox.', '46 m³'],
    ['Carga máx.', '14.000 kg'], ['Palés europeos (120×80)', '20 uds.'], ['Palés americanos (120×100)', '16 uds.'],
  ],
} as const;

const svg = (d: React.ReactNode) => (
  <div className="rec-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg></div>
);

export default function Recursos() {
  const [medidas, setMedidas] = useState(false);
  const [tipo, setTipo] = useState<'tauliner' | 'rigido'>('tauliner');
  return (
    <section className="section active" id="sec-recursos">
      <div className="sec-header"><h2>Recursos</h2></div>
      <p style={{ fontSize: 'var(--fs-l)', color: 'var(--gray-700)', margin: '-0.4rem 0 1rem' }}>
        Documentos y herramientas de apoyo para tus envíos. Todos los PDF se abren en el visor: desde ahí puedes imprimirlos o descargarlos.
      </p>
      <div className="rec-grid">
        <div className="rec-card">
          {svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>)}
          <h3>Modelo CMR estándar</h3>
          <p>Carta de porte internacional (CMR) oficial en blanco, para imprimir y rellenar a mano.</p>
          <button type="button" className="btn-secondary" onClick={() => abrir('/panel/recursos/cmr')}>Ver / descargar (PDF)</button>
        </div>
        <div className="rec-card">
          {svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></>)}
          <h3>Carta de porte nacional</h3>
          <p>Modelo de carta de porte para transporte nacional, en blanco para rellenar.</p>
          <button type="button" className="btn-secondary" onClick={() => abrir('/panel/recursos/carta-de-porte')}>Ver / descargar (PDF)</button>
        </div>
        <div className="rec-card">
          {svg(<><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>)}
          <h3>Mapa de Europa con regiones - provincias</h3>
          <p>Mapa de los países en los que trabajamos.</p>
          <button type="button" className="btn-secondary" onClick={() => abrir('/images/europa-map.svg')}>Ver / descargar (SVG)</button>
        </div>
        <div className="rec-card">
          {svg(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>)}
          <h3>Medidas de los camiones</h3>
          <p>Medidas y capacidades de cada tipo de camión (metros, palés y peso máximo).</p>
          <button type="button" className="btn-secondary" onClick={() => setMedidas(true)}>Ver medidas</button>
        </div>
      </div>

      <Modal abierto={medidas} onCerrar={() => setMedidas(false)} titulo="Medidas de los camiones"
        sub="Capacidades de cada tipo de camión (metros, palés y peso máximo)"
        pie={<button type="button" className="btn-primary" onClick={() => setMedidas(false)} style={{ flex: 1 }}>Cerrar</button>}>
        <div className="med-tabs">
          <button type="button" className={`med-tab${tipo === 'tauliner' ? ' active' : ''}`} onClick={() => setTipo('tauliner')}>Trailer Tauliner<br />Lona corredera</button>
          <button type="button" className={`med-tab${tipo === 'rigido' ? ' active' : ''}`} onClick={() => setTipo('rigido')}>Rígido<br />con plataforma</button>
        </div>
        <div className="med-panel">
          <table className="data"><tbody>
            {MEDIDAS[tipo].map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
          </tbody></table>
        </div>
        <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.6rem' }}>Equivalencias orientativas: 1 metro lineal ≈ 2,5 palés europeos · 2 palés americanos.</p>
      </Modal>
    </section>
  );
}
