'use client';

import { useState } from 'react';

// Botón de COPIAR un dato (usuario, 2026-11-27: «el típico botón para copiar el IBAN, el concepto,
// el beneficiario, el banco…»). Un toque y queda en el portapapeles; dice «Copiado» 2 s. Si el
// navegador no deja copiar, selecciona el texto para copiarlo a mano.
export default function BotonCopiar({ texto, que, id, conTexto = false }: { texto: string; que: string; id?: string; conTexto?: boolean }) {
  const [hecho, setHecho] = useState<'si' | 'no' | null>(null);
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setHecho('si'); }
    catch { setHecho('no'); }
    setTimeout(() => setHecho(null), 2000);
  }
  return (
    <button type="button" className={`btn-copiar${hecho === 'si' ? ' hecho' : ''}`} id={id} onClick={copiar}
      aria-label={`Copiar ${que}`} title={`Copiar ${que}`}>
      {hecho === 'si'
        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
      {(conTexto || hecho) && <span>{hecho === 'si' ? 'Copiado' : hecho === 'no' ? 'Cópialo a mano' : `Copiar ${que}`}</span>}
    </button>
  );
}
