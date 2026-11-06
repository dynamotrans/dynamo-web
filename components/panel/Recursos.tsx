'use client';

// Recursos: el diseño de #sec-recursos de dashboard.html (tarjetas .rec-card) y su ventana
// «Medidas de los camiones» (.med-tabs). Las medidas son las OFICIALES (regla 0-quinquies
// de CLAUDE.md): si cambian, cambiarlas también en index.html, en las hojas de sección y aquí.
import { useRef, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import Cargando from '@/components/Cargando';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { rutaRecurso, registrarRecurso, quitarRecurso, type RecursoSubido } from '@/app/panel/(app)/recursos/acciones';
import { fecha } from '@/lib/formato';

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

const ICO_DOC = <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></>;
const ICO_IMG = <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>;
const diaMadrid = (ts: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(ts));

export default function Recursos({ subidos = [], gestor = false }: { subidos?: RecursoSubido[]; gestor?: boolean }) {
  const refrescar = useRefrescar();
  const [medidas, setMedidas] = useState(false);
  const [subir, setSubir] = useState(false);
  const [quitar, setQuitar] = useState<RecursoSubido | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function confirmarQuitar() {
    if (!quitar) return;
    setError(null); setTrabajando('Quitando el documento');
    const r = await quitarRecurso(quitar.id);
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    setQuitar(null); refrescar();
  }
  const [tipo, setTipo] = useState<'tauliner' | 'rigido'>('tauliner');
  return (
    <section className="section active" id="sec-recursos">
      <div className="sec-header">
        <h2>Recursos</h2>
        {gestor && <button className="btn-primary" onClick={() => setSubir(true)}>+ Subir documento</button>}
      </div>
      <p style={{ fontSize: 'var(--fs-l)', color: 'var(--gray-700)', margin: '-0.4rem 0 1rem' }}>
        Documentos y herramientas de apoyo para tus envíos. Todos los PDF se abren en el visor: desde ahí puedes imprimirlos o descargarlos.
      </p>
      <div className="rec-grid">
        {subidos.map((d) => (
          <div className="rec-card" key={d.id}>
            {svg((d.mime ?? '').startsWith('image/') ? ICO_IMG : ICO_DOC)}
            <h3>{d.titulo}</h3>
            <p>{d.descripcion || `Publicado el ${fecha(diaMadrid(d.creado_en))}.`}</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" onClick={() => abrir(`/panel/documentos/${d.id}`)}>Ver / descargar{(d.mime ?? '') === 'application/pdf' ? ' (PDF)' : ''}</button>
              {gestor && <button type="button" className="btn-ghost" onClick={() => setQuitar(d)}>Quitar</button>}
            </div>
          </div>
        ))}
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
          {svg(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>)}
          <h3>Medidas de los camiones</h3>
          <p>Medidas y capacidades de cada tipo de camión (metros, palets y peso máximo).</p>
          <button type="button" className="btn-secondary" onClick={() => setMedidas(true)}>Ver medidas</button>
        </div>
      </div>

      {subir && <SubirRecurso onCerrar={() => setSubir(false)} onHecho={() => { setSubir(false); refrescar(); }} />}
      {quitar && (
        <Modal abierto titulo="Quitar documento de Recursos" sub={quitar.titulo} onCerrar={() => setQuitar(null)}
          pie={<>
            <button className="btn-ghost" onClick={() => setQuitar(null)} disabled={!!trabajando}>No, volver</button>
            <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={confirmarQuitar} disabled={!!trabajando}>Sí, quitarlo</button>
          </>}>
          <p style={{ fontSize: 'var(--fs-l)', color: 'var(--gray-700)' }}>Deja de verse en Recursos para todos. El archivo se conserva en el almacén (no se borra).</p>
          {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
          {trabajando && <Cargando texto={trabajando} />}
        </Modal>
      )}
      <Modal abierto={medidas} onCerrar={() => setMedidas(false)} titulo="Medidas de los camiones"
        sub="Capacidades de cada tipo de camión (metros, palets y peso máximo)"
        pie={<button type="button" className="btn-primary" onClick={() => setMedidas(false)} style={{ flex: 1 }}>Cerrar</button>}>
        <div className="med-tabs">
          <button type="button" className={`med-tab${tipo === 'tauliner' ? ' active' : ''}`} onClick={() => setTipo('tauliner')}>Tráiler tauliner<br />Lona corredera</button>
          <button type="button" className={`med-tab${tipo === 'rigido' ? ' active' : ''}`} onClick={() => setTipo('rigido')}>Rígido<br />con plataforma</button>
        </div>
        <div className="med-panel">
          <table className="data"><tbody>
            {MEDIDAS[tipo].map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
          </tbody></table>
        </div>
        <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.6rem' }}>Equivalencias orientativas: 1 metro lineal ≈ 2,5 europalets · 2 palets americanos.</p>
      </Modal>
    </section>
  );
}

// ---- Subir un documento a Recursos (solo Dynamo) -------------------------------------------
const MAX_BYTES = 25 * 1024 * 1024;
const ACEPTA = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';
async function huella(f: File): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function SubirRecurso({ onCerrar, onHecho }: { onCerrar: () => void; onHecho: () => void }) {
  const [titulo, setTitulo] = useState('');
  const [desc, setDesc] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  function elegir(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) { setError(`«${f.name}» pasa de 25 MB.`); return; }
    if (!ACEPTA.split(',').includes(f.type)) { setError(`«${f.name}»: solo PDF o imágenes (JPG, PNG, WEBP, HEIC).`); return; }
    setArchivo(f);
    if (!titulo.trim()) setTitulo(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120));
  }
  async function publicar() {
    setError(null);
    if (!titulo.trim()) { setError('Pon un título al documento.'); return; }
    if (!archivo) { setError('Elige el archivo.'); return; }
    const sb = supabaseNavegador();
    if (!sb) { setError('La plataforma no está conectada.'); return; }
    setTrabajando('Subiendo el documento');
    const r = await rutaRecurso(archivo.name);
    if (!r.ok) { setTrabajando(null); setError(r.error); return; }
    const [{ error: e }, sha] = await Promise.all([sb.storage.from('documentos').upload(r.ruta, archivo, { contentType: archivo.type, upsert: false }), huella(archivo)]);
    if (e) { setTrabajando(null); setError(`No se ha podido subir: ${e.message}`); return; }
    const g = await registrarRecurso({ ruta: r.ruta, nombre: archivo.name, mime: archivo.type, tamano: archivo.size, sha256: sha, titulo, descripcion: desc });
    setTrabajando(null);
    if (!g.ok) { setError(g.error); return; }
    onHecho();
  }
  return (
    <Modal abierto titulo="Subir documento a Recursos" sub="Lo verán todos los usuarios de la plataforma" onCerrar={onCerrar}
      icono={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cancelar</button>
        <button className="btn-primary" onClick={publicar} disabled={!!trabajando}>Publicar</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label>Archivo *</label>
          <div className="modal-file-drop" role="button" tabIndex={0} onClick={() => input.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); elegir(e.dataTransfer.files[0]); }}>
            <div>{archivo ? `«${archivo.name}»` : 'Selecciona el archivo o arrástralo aquí'}</div>
            <div className="modal-file-drop-sub">PDF, JPG, PNG, WEBP o HEIC · máx. 25 MB</div>
          </div>
          <input ref={input} type="file" accept={ACEPTA} hidden onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="rec-tit">Título *</label>
          <input id="rec-tit" type="text" value={titulo} maxLength={120} placeholder="Ej. Condiciones generales de transporte" onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="rec-desc">Descripción</label>
          <input id="rec-desc" type="text" value={desc} maxLength={300} placeholder="Una línea que explique para qué sirve" onChange={(e) => setDesc(e.target.value)} />
        </div>
      </div>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
