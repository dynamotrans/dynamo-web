'use client';

import { useState, type CSSProperties } from 'react';
import Modal from '../Modal';
import CompartirSheet from '@/components/CompartirSheet';
import type { Ficha } from '@/lib/fichaEnvio';
import { emailDecaPlataforma, anotarCompartido } from '@/app/panel/(app)/envios/acciones';
import { HistorialEnvios } from './HistorialEnvios';
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

export function Deca({ ficha, onVolver }: { ficha: Ficha; onVolver: () => void }) {
  const e = ficha.envio;
  const token = ficha.cmrEnlace?.token ?? null;
  const [mandando, setMandando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  const [compartir, setCompartir] = useState(false);
  const [recarga, setRecarga] = useState(0);   // el historial se vuelve a leer tras enviar o compartir
  const origen = typeof window !== 'undefined' ? window.location.origin : '';
  const url = token ? `${origen}/deca/${token}` : '';
  const matr = [e.matricula_camion, e.matricula_remolque].filter(Boolean).join(' / ');

  async function enviar() {
    setAviso(null); setMandando(true);
    const r = await emailDecaPlataforma(e.id).catch(() => ({ ok: false as const, error: 'No se ha podido enviar.' }));
    setAviso(r.ok ? { ok: true, txt: `DeCA enviado a ${r.para}, con el PDF adjunto.` } : { ok: false, txt: r.error });
    setMandando(false);
    setRecarga((n) => n + 1);
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
      <HistorialEnvios envioId={e.id} documento="deca" titulo="Historial envíos DeCA" recarga={recarga} />
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0', lineHeight: 1.45 }}>
        Su código QR abre siempre la versión vigente. Cada versión queda guardada sola en Documentos («Copia archivada DeCA») y se conserva al menos un año.
      </p>
      {compartir && token && (
        <CompartirSheet onCerrar={() => setCompartir(false)} url={url}
          onVia={(via) => { anotarCompartido(e.id, 'deca', via).then(() => setRecarga((n) => n + 1)).catch(() => {}); }}
          titulo={`DeCA del envío #${e.referencia_gx} · Dynamo`}
          texto={`DeCA (documento de control) del envío #${e.referencia_gx} · Dynamo${matr ? `\nMatrículas: ${matr}` : ''}\nÁbrelo o descárgalo aquí:`} />
      )}
    </Modal>
  );
}
