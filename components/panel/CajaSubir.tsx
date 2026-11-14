'use client';

// La caja de subir archivos de TODA la plataforma (usuario, 2026-11-14): TRIPLE VÍA,
// con cualquier rol — «Hacer foto» (cámara), «Galería o archivo» (selector) y ARRASTRAR
// Y SOLTAR sobre cualquiera de las dos cajas. Quien la usa decide qué hacer con los
// ficheros (onFiles); los límites de tamaño/número los valida cada pantalla como hasta
// ahora. La cámara siempre admite imagen; `accept` manda en la galería.
import { useRef, useState } from 'react';

const IcoCamara = () => (<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: -2 }}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>);
const IcoGaleria = () => (<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: -2 }}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>);

export default function CajaSubir({ onFiles, accept, multiple = true, disabled = false, textoFoto = 'Hacer foto', textoGal = 'Galería o archivo', sub = null }: {
  onFiles: (f: FileList) => void;
  accept: string;                       // lo que admite la galería
  multiple?: boolean;
  disabled?: boolean;
  textoFoto?: string;
  textoGal?: string;
  sub?: React.ReactNode;                // la línea pequeña de formatos y límites, bajo las cajas
}) {
  const inFoto = useRef<HTMLInputElement>(null);
  const inGal = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const caja = (ref: React.RefObject<HTMLInputElement | null>, ico: React.ReactNode, texto: string) => (
    <div className={`modal-file-drop${disabled ? ' is-disabled' : ''}`} role="button" tabIndex={0}
      style={encima && !disabled ? { borderColor: 'var(--purple)', background: 'rgba(51,0,204,0.04)', color: 'var(--purple)' } : undefined}
      onClick={() => { if (!disabled) ref.current?.click(); }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); ref.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)}
      onDrop={(e) => { e.preventDefault(); setEncima(false); if (!disabled && e.dataTransfer.files.length) onFiles(e.dataTransfer.files); }}>
      <div>{ico} {texto}</div>
    </div>
  );
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {caja(inFoto, <IcoCamara />, textoFoto)}
        {caja(inGal, <IcoGaleria />, textoGal)}
      </div>
      {sub != null && <div className="modal-file-drop-sub" style={{ marginTop: '0.3rem' }}>{sub}</div>}
      <input ref={inFoto} type="file" accept="image/*" capture="environment" hidden disabled={disabled}
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ''; }} />
      <input ref={inGal} type="file" accept={accept} multiple={multiple} hidden disabled={disabled}
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ''; }} />
    </>
  );
}
