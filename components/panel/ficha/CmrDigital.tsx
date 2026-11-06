'use client';

import { useState } from 'react';
import { fechaHora, fechaDe } from '@/lib/formato';
import type { Ficha } from '@/lib/fichaEnvio';
import { enlaceCmr, retirarEnlaceCmr } from '@/app/panel/(app)/envios/acciones';
import { I, ICO, ROL_CMR, enlaceCmrUrl } from './comun';

// ---- CMR digital ------------------------------------------------------------------
// Un enlace por envío para que firmen con el dedo cargador, transportista y destinatario
// (sin cuenta). Las firmas quedan en el CMR relleno y no se borran nunca.
export function CmrDigital({ ficha, hacer, trabajando }: { ficha: Ficha; hacer: (t: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, ok?: string) => Promise<boolean>; trabajando: string | null }) {
  const e = ficha.envio;
  const [copiado, setCopiado] = useState(false);
  const enl = ficha.cmrEnlace;
  const recogidas = ficha.paradas.filter((p) => p.tipo === 'carga'), entregas = ficha.paradas.filter((p) => p.tipo === 'descarga');
  const total = recogidas.length + 1 + entregas.length;
  const lugar = (id: string | null) => { const p = ficha.paradas.find((x) => x.id === id); return p ? ` · ${p.nombre_empresa || p.poblacion || ''}` : ''; };
  const msg = enl ? `CMR del envío #${e.referencia_gx}${e.es_manual ? '' : ' · Dynamo'}\nFirma tu casilla con el dedo aquí: ${enlaceCmrUrl(enl.token)}` : '';
  return <>
    <h4 className="modal-section-title">CMR digital</h4>
    <div className="det-block">
      <p style={{ margin: '0 0 0.6rem', fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.45 }}>Un enlace para que <strong>cargador, transportista y destinatario</strong> firmen el CMR con el dedo desde el móvil, sin crear cuenta. Cada firma queda con su documento, la hora del servidor y desde dónde se firmó, y sale en el <strong>CMR relleno</strong>.</p>
      {enl ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn-secondary" onClick={() => { navigator.clipboard?.writeText(enlaceCmrUrl(enl.token)); setCopiado(true); setTimeout(() => setCopiado(false), 1800); }}>{copiado ? 'Enlace copiado' : 'Copiar enlace'}</button>
          <a className="btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">WhatsApp</a>
          <a className="btn-secondary" href={`/cmr/${enl.token}`} target="_blank" rel="noopener"><I d={ICO.ojo} />Abrir</a>
          <button className="btn-ghost" style={{ color: '#dc2626' }} disabled={!!trabajando} onClick={() => hacer('Retirando el enlace', () => retirarEnlaceCmr(enl.id), 'Enlace del CMR retirado: ya no se abre. Las firmas hechas se conservan.')}>Retirar enlace</button>
          <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', flexBasis: '100%' }}>Vale hasta el {fechaDe(enl.caduca_en)}.</span>
        </div>
      ) : (
        <button className="btn-primary" disabled={!!trabajando} onClick={() => hacer('Creando el enlace', () => enlaceCmr(e.id), 'Enlace del CMR creado: cópialo o mándalo por WhatsApp.')}><I d={ICO.doc} />Crear enlace para firmar</button>
      )}
      <div className="pen-envio-sum" style={{ marginTop: '0.7rem' }}>
        <div className="pen-sum-row"><span className="k"><strong>{ficha.firmasCmr.length} de {total}</strong> firmas</span><span className="v">{ficha.firmasCmr.length >= total ? <span className="badge badge-green">CMR firmado</span> : ''}</span></div>
        {ficha.firmasCmr.map((f, i) => (
          <div key={i} className="pen-sum-row">
            <span className="k">{ROL_CMR[f.rol] ?? f.rol}{lugar(f.parada_id)}<br /><span style={{ color: 'var(--gray-500)' }}>{f.nombre} · {f.documento} ({f.documento_pais}){f.documento_validado ? '' : ' · documento sin comprobar'}</span></span>
            <span className="v" style={{ whiteSpace: 'nowrap' }}>{fechaHora(f.firmado_en)}</span>
          </div>
        ))}
      </div>
    </div>
  </>;
}
