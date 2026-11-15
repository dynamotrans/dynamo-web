'use client';

import { useEffect, useState } from 'react';
import { fechaHora } from '@/lib/formato';
import { historialEnvios, type DocHistorial, type EnvioHist } from '@/app/panel/(app)/envios/acciones';

// ---- Historial de envíos de un documento (usuario, 2026-11-15) ------------------------
// Desplegable con el diseño del «Historial» de la ficha: cada vez que el documento ha
// salido hacia alguien, con su fecha y hora y la vía («Automático · email», «Manual ·
// WhatsApp»…). Lo llevan el DeCA, el eCMR y la orden de carga (transportista y cliente).
// `recarga` es un contador: al cambiar, se vuelve a leer (tras enviar o compartir).

const VIA: Record<string, string> = { email: 'email', whatsapp: 'WhatsApp', sms: 'SMS', copiar: 'enlace copiado', otros: 'otra aplicación' };
function linea(x: EnvioHist): string {
  // Lo compartido a mano con el email del propio usuario no es el email de la plataforma.
  const via = x.estado === 'compartido' && x.via === 'email' ? 'email propio' : VIA[x.via] ?? x.via;
  return `${x.modo === 'auto' ? 'Automático' : 'Manual'} · ${via}${x.para ? ` · a ${x.para}` : ''}`;
}

export function HistorialEnvios({ envioId, documento, titulo, recarga = 0 }: { envioId: string; documento: DocHistorial; titulo: string; recarga?: number }) {
  const [hist, setHist] = useState<EnvioHist[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    let vivo = true;
    historialEnvios(envioId, documento).then((r) => { if (vivo) setHist(r); }).catch(() => { if (vivo) setHist([]); });
    return () => { vivo = false; };
  }, [envioId, documento, recarga]);
  return (
    <section className={`ficha-sec${abierto ? ' open' : ''}`} style={{ marginTop: '0.7rem' }}>
      <button type="button" className="ficha-sec-head" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
        <span className="fsh-chev" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
        <span className="fsh-t">{titulo}{hist?.length ? ` (${hist.length})` : ''}</span>
        {!abierto && <span className="fsh-sum">{hist === null ? 'Cargando…' : hist.length ? `último ${fechaHora(hist[0].cuando)}` : 'Sin envíos'}</span>}
      </button>
      {abierto && (
        <div className="ficha-sec-body">
          <div className="pen-envio-sum">
            {hist === null && <div className="pen-sum-row"><span className="k">Cargando…</span><span className="v" /></div>}
            {hist?.length === 0 && <div className="pen-sum-row"><span className="k">Todavía no se ha enviado</span><span className="v" /></div>}
            {(hist ?? []).map((x) => (
              <div key={x.id} className="pen-sum-row pen-sum-col">
                <span className="k" style={{ whiteSpace: 'nowrap' }}>{fechaHora(x.cuando)}</span>
                <span className="v">
                  {linea(x)}
                  {x.estado === 'enviado' && <span style={{ color: '#0f6b3a' }}> · enviado</span>}
                  {x.estado === 'pendiente' && <span style={{ color: 'var(--gray-500)' }}> · saliendo…</span>}
                  {x.estado === 'error' && <span style={{ color: '#b42318' }}> · NO enviado{x.detalle ? `: ${x.detalle}` : ''}</span>}
                  {x.estado === 'compartido' && x.autor && <span style={{ color: 'var(--gray-500)' }}> · {x.autor}</span>}
                  {x.que && <><br /><span style={{ color: 'var(--gray-500)', fontWeight: 400 }}>{x.que}</span></>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
