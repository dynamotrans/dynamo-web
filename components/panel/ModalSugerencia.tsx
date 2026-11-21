'use client';

// «Sugerencias y fallos» (usuario, 2026-11-21): un comentario sencillo, los botones de hacer
// foto y subir foto, y «Enviar sugerencia». Llega a Dynamo (Gestión interna → Sugerencias) y
// a su campana. Las fotos se suben nada más guardarla, colgadas de ella.
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Modal from './Modal';
import CajaSubir from './CajaSubir';
import Cargando from '@/components/Cargando';
import { subirDocumentoDirecto, MAX_BYTES, tamano } from './Documentos';
import { enviarSugerencia } from '@/app/panel/(app)/sugerencias/acciones';

const FOTOS = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
const MAX_FOTOS = 5;

// Navegador y aparato en palabras, para poder reproducir un fallo.
function navegador(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Otro navegador';
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const ancho = typeof window === 'undefined' ? '' : ` · ${window.innerWidth}×${window.innerHeight}`;
  return `${nav}${so ? ` · ${so}` : ''}${ancho}`;
}

export default function ModalSugerencia({ onCerrar, pagina }: { onCerrar: () => void; pagina?: string }) {
  const ruta = usePathname();
  const [texto, setTexto] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);
  const [idCreada, setIdCreada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  const anadir = (lista: FileList) => {
    setError(null);
    const nuevas: File[] = [];
    for (const f of Array.from(lista)) {
      if (!FOTOS.split(',').includes(f.type)) { setError(`«${f.name}»: solo fotos (JPG, PNG, WEBP o HEIC).`); continue; }
      if (f.size > MAX_BYTES) { setError(`«${f.name}» pasa de 25 MB.`); continue; }
      nuevas.push(f);
    }
    setFotos((l) => {
      const todas = [...l, ...nuevas];
      if (todas.length > MAX_FOTOS) setError(`Como máximo ${MAX_FOTOS} fotos.`);
      return todas.slice(0, MAX_FOTOS);
    });
  };

  async function enviar() {
    setError(null);
    if (texto.trim().length < 3) { setError('Escribe la sugerencia o el fallo.'); return; }
    let id = idCreada;
    if (!id) {
      setTrabajando('Enviando');
      const r = await enviarSugerencia(texto.trim(), pagina ?? ruta ?? '', navegador());
      if (!r.ok) { setTrabajando(null); setError(r.error); return; }
      id = r.id; setIdCreada(r.id);
    }
    // Las fotos, contra la sugerencia ya guardada; las que fallen se quedan para reintentar.
    const fallos: File[] = [];
    let ultimo = '';
    for (const f of fotos) {
      setTrabajando(`Subiendo «${f.name}»`);
      const g = await subirDocumentoDirecto({ campo: 'sugerencia_id', id }, f, 'adjunto');
      if (!g.ok) { fallos.push(f); ultimo = g.error; }
    }
    setTrabajando(null);
    setFotos(fallos);
    if (fallos.length) { setError(`Tu sugerencia ya nos ha llegado, pero no se ha podido subir ${fallos.map((f) => `«${f.name}»`).join(', ')} (${ultimo}). Pulsa otra vez «Enviar sugerencia» para reintentarlo, o quítalas.`); return; }
    setHecho(true);
  }

  return (
    <Modal abierto titulo="Sugerencias y fallos" onCerrar={onCerrar}
      sub={hecho ? undefined : 'Cuéntanos qué podemos mejorar o qué fallo has visto. Si puedes, añade una foto o una captura de pantalla.'}
      pie={hecho
        ? <button className="btn-primary" onClick={onCerrar}>Cerrar</button>
        : <><button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cancelar</button>
            <button className="btn-primary" id="sug-enviar" onClick={enviar} disabled={!!trabajando}>Enviar sugerencia</button></>}>
      {hecho ? (
        <div className="modal-ok-box" id="sug-ok">¡Gracias! Tu sugerencia nos ha llegado. La revisaremos y, si hace falta, te contactamos.</div>
      ) : (
        <div style={{ display: 'grid', gap: '0.7rem' }}>
          <div>
            <label htmlFor="sug-texto">Tu sugerencia o el fallo que has visto</label>
            <textarea id="sug-texto" rows={5} maxLength={4000} value={texto} disabled={!!idCreada}
              placeholder="Ej.: en el móvil, al filtrar los envíos por fecha no se ve el calendario…"
              onChange={(e) => setTexto(e.target.value)} />
          </div>
          <div>
            <label>Fotos o capturas <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· opcional</span></label>
            <CajaSubir onFiles={anadir} accept={FOTOS} disabled={!!trabajando || fotos.length >= MAX_FOTOS}
              textoGal="Subir foto" sub={`Hasta ${MAX_FOTOS} fotos (JPG, PNG, WEBP o HEIC), 25 MB cada una.`} />
            {fotos.length > 0 && (
              <ul id="sug-fotos" style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'grid', gap: '0.3rem' }}>
                {fotos.map((f, i) => (
                  <li key={`${f.name}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: 'var(--fs-s)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name} <span className="meta">· {tamano(f.size)}</span></span>
                    <button type="button" className="btn-ghost" style={{ minHeight: 26, padding: '0 0.5rem' }} disabled={!!trabajando}
                      onClick={() => setFotos((l) => l.filter((_, j) => j !== i))}>Quitar</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
          {trabajando && <Cargando texto={trabajando} />}
        </div>
      )}
    </Modal>
  );
}
