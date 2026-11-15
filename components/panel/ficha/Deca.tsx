'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import Modal from '../Modal';
import CompartirSheet from '@/components/CompartirSheet';
import { fechaHora } from '@/lib/formato';
import type { Ficha } from '@/lib/fichaEnvio';
import { emailDecaPlataforma, historialDeca, anotarDecaCompartido, type EnvioDeca } from '@/app/panel/(app)/envios/acciones';
import { I, ICO } from './comun';

// ---- DeCA (usuario, 2026-11-15) ------------------------------------------------------
// El documento de control es un documento APARTE del CMR, con su propio camino: se emite
// solo al ponerse las matrículas, se envía solo al transportista en cada versión y cada
// versión queda archivada. Este botón es para lo manual: reenviárselo al transportista,
// compartirlo por donde haga falta o abrir el PDF. Solo sale con el DeCA ya emitido.

const fila: CSSProperties = {
  whiteSpace: 'normal', height: 'auto', minHeight: 48, padding: '0.6rem 0.7rem', width: '100%',
  display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.25,
};

// Cómo se cuenta cada envío en el historial: «Automático · email», «Manual · WhatsApp»…
const VIA: Record<string, string> = { email: 'email', whatsapp: 'WhatsApp', sms: 'SMS', copiar: 'enlace copiado', otros: 'otra aplicación' };
function lineaEnvio(x: EnvioDeca): string {
  // Lo compartido a mano con el email del propio usuario no es el email de la plataforma.
  const via = x.estado === 'compartido' && x.via === 'email' ? 'email propio' : VIA[x.via] ?? x.via;
  return `${x.modo === 'auto' ? 'Automático' : 'Manual'} · ${via}${x.para ? ` · a ${x.para}` : ''}`;
}

export function Deca({ ficha, onVolver }: { ficha: Ficha; onVolver: () => void }) {
  const e = ficha.envio;
  const token = ficha.cmrEnlace?.token ?? null;
  const [mandando, setMandando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  const [compartir, setCompartir] = useState(false);
  // Historial de envíos del DeCA: se carga al abrir la ventana y tras cada envío.
  const [hist, setHist] = useState<EnvioDeca[] | null>(null);
  const [histAbierto, setHistAbierto] = useState(false);
  const cargarHist = useCallback(() => { historialDeca(e.id).then(setHist).catch(() => setHist([])); }, [e.id]);
  useEffect(() => { cargarHist(); }, [cargarHist]);
  const origen = typeof window !== 'undefined' ? window.location.origin : '';
  const url = token ? `${origen}/deca/${token}` : '';
  const matr = [e.matricula_camion, e.matricula_remolque].filter(Boolean).join(' / ');

  async function enviar() {
    setAviso(null); setMandando(true);
    const r = await emailDecaPlataforma(e.id).catch(() => ({ ok: false as const, error: 'No se ha podido enviar.' }));
    setAviso(r.ok ? { ok: true, txt: `DeCA enviado a ${r.para}, con el PDF adjunto.` } : { ok: false, txt: r.error });
    setMandando(false);
    cargarHist();
  }

  return (
    <Modal abierto onCerrar={onVolver} titulo={`DeCA · #${e.referencia_gx}`}
      sub={[ficha.transportista?.nombre, matr].filter(Boolean).join(' · ') || undefined}
      icono={<I d={ICO.doc} />} pie={<button className="btn-ghost" onClick={onVolver}>Volver a la ficha</button>}>
      <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-600)', margin: '0 0 0.7rem', lineHeight: 1.5 }}>
        El <strong>documento de control (DeCA)</strong> que el conductor debe llevar durante el transporte. Se generó solo al ponerse las
        matrículas y se le envía solo al transportista cada vez que cambia.
      </p>
      {!token && <div className="modal-warn-box"><strong>El enlace del envío está retirado.</strong> Créalo de nuevo desde el botón del CMR para poder compartir el DeCA.</div>}
      {token && (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <button type="button" className="btn-primary" style={fila} disabled={mandando} onClick={enviar}
            title="Email al transportista con el DeCA en PDF adjunto y su dirección">
            <I d={ICO.enviar} />{mandando ? 'Enviando…' : 'Enviar al transportista'}
          </button>
          <button type="button" className="btn-secondary" style={fila} onClick={() => setCompartir(true)}
            title="WhatsApp, email, SMS o copiar el enlace"><I d={ICO.enviar} />Compartir por…</button>
          <a className="btn-secondary" style={fila} href={url} target="_blank" rel="noopener"
            title="El DeCA tal y como está ahora mismo, con su QR y su histórico"><I d={ICO.ojo} />Abrir PDF</a>
        </div>
      )}
      {aviso && <div className={`pt-aviso${aviso.ok ? ' info' : ' error'}`} role="status" style={{ marginTop: '0.6rem' }}><div>{aviso.txt}</div></div>}
      {/* HISTORIAL DE ENVÍOS DEL DeCA (usuario, 2026-11-15): desplegable como el «Historial»
          de la ficha — fecha y hora, y la vía (automático o manual; email, WhatsApp…). */}
      <section className={`ficha-sec${histAbierto ? ' open' : ''}`} style={{ marginTop: '0.7rem' }}>
        <button type="button" className="ficha-sec-head" aria-expanded={histAbierto} onClick={() => setHistAbierto((v) => !v)}>
          <span className="fsh-chev" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
          <span className="fsh-t">Historial envíos DeCA{hist?.length ? ` (${hist.length})` : ''}</span>
          {!histAbierto && <span className="fsh-sum">{hist === null ? 'Cargando…' : hist.length ? `último ${fechaHora(hist[0].cuando)}` : 'Sin envíos'}</span>}
        </button>
        {histAbierto && (
          <div className="ficha-sec-body">
            <div className="pen-envio-sum">
              {hist === null && <div className="pen-sum-row"><span className="k">Cargando…</span><span className="v" /></div>}
              {hist?.length === 0 && <div className="pen-sum-row"><span className="k">Todavía no se ha enviado</span><span className="v" /></div>}
              {(hist ?? []).map((x) => (
                <div key={x.id} className="pen-sum-row pen-sum-col">
                  <span className="k" style={{ whiteSpace: 'nowrap' }}>{fechaHora(x.cuando)}</span>
                  <span className="v">
                    {lineaEnvio(x)}
                    {x.estado === 'enviado' && <span style={{ color: '#0f6b3a' }}> · enviado</span>}
                    {x.estado === 'pendiente' && <span style={{ color: 'var(--gray-500)' }}> · saliendo…</span>}
                    {x.estado === 'error' && <span style={{ color: '#b42318' }}> · NO enviado{x.detalle ? `: ${x.detalle}` : ''}</span>}
                    {x.estado === 'compartido' && x.autor && <span style={{ color: 'var(--gray-500)' }}> · {x.autor}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0', lineHeight: 1.45 }}>
        Su código QR abre siempre la versión vigente. Cada versión queda guardada sola en Documentos («Copia archivada DeCA») y se conserva al menos un año.
      </p>
      {compartir && token && (
        <CompartirSheet onCerrar={() => setCompartir(false)} url={url}
          onVia={(via) => { anotarDecaCompartido(e.id, via).then(cargarHist).catch(() => {}); }}
          titulo={`DeCA del envío #${e.referencia_gx} · Dynamo`}
          texto={`DeCA (documento de control) del envío #${e.referencia_gx} · Dynamo${matr ? `\nMatrículas: ${matr}` : ''}\nÁbrelo o descárgalo aquí:`} />
      )}
    </Modal>
  );
}
