'use client';

import { useEffect, useState } from 'react';
import Modal from '../Modal';
import { euros, ventana, fecha } from '@/lib/formato';
import { telBonito } from '@/lib/paises';
import { CONTACTO } from '@/lib/atencion';
import { NOMBRE_IDIOMA, type IdiomaOrden } from '@/lib/pdf/ordenTextos';
import type { Ficha, ParadaFicha } from '@/lib/fichaEnvio';
import { datosOrden } from '@/app/panel/(app)/envios/acciones';
import { I, ICO } from './comun';

// ---- Compartir la ORDEN DE CARGA (usuario, 2026-11-10) ------------------------------
// Al pulsar «Orden de carga» en la ficha ya no se abre el PDF a secas: este diálogo
// pregunta QUÉ se comparte (conjunta = operativa + económica · solo operativa · solo
// económica) y CÓMO (email al transportista, WhatsApp al transportista, o copiar el
// enlace de descarga), con un mensaje ordenado tipo orden de carga que deja claro que
// lleva la orden en PDF. El PDF sale en el idioma del transportista y en español.

type Que = 'conjunta' | 'operativa' | 'economica';
const QUE: [Que, string, string][] = [
  ['conjunta', 'Conjunta (operativa + económica)', 'DOS PDF separados: la copia del conductor sin precios y la de administración completa — que usen la que necesiten.'],
  ['operativa', 'Solo operativa', 'La copia del conductor: sin ninguna información económica.'],
  ['economica', 'Solo económica', 'La copia de administración: el documento completo, con el precio.'],
];
const QUE_TXT: Record<Que, string> = {
  conjunta: 'copia del conductor sin precios + copia de administración completa',
  operativa: 'copia del conductor, sin información económica',
  economica: 'copia de administración, completa',
};

function dirCorta(p: ParadaFicha): string {
  const prov = p.provincia && p.provincia !== p.poblacion ? p.provincia : null;
  return [[p.codigo_postal, p.poblacion].filter(Boolean).join(' '), prov, (p.pais_codigo_iso ?? 'ES').toUpperCase()].filter(Boolean).join(', ');
}

export function CompartirOrden({ ficha, onVolver }: { ficha: Ficha; onVolver: () => void }) {
  const e = ficha.envio;
  const [que, setQue] = useState<Que>('conjunta');
  const [d, setD] = useState<{ email: string | null; telefono: string | null; idioma: string; clave: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  useEffect(() => { datosOrden(e.id).then((r) => { if (r.ok) setD(r); else setError(r.error); }); }, [e.id]);

  const token = ficha.cmrEnlace?.token ?? null;
  const origen = typeof window !== 'undefined' ? window.location.origin : '';
  // La conjunta son DOS PDF separados (usuario, 2026-11-11: «que usen la que quieran»):
  // un enlace por copia; las que llevan precio van con la clave.
  const enlaceDe = (c: 'operativa' | 'economica') => token && d ? `${origen}/cmr/${token}/orden?copia=${c}${c !== 'operativa' ? `&clave=${d.clave}` : ''}` : '';
  const enlOp = enlaceDe('operativa'), enlEc = enlaceDe('economica');
  const enlace = que === 'operativa' ? enlOp : enlEc;
  const idioma = (d?.idioma ?? 'es') as IdiomaOrden;
  const idiomas = idioma !== 'es' ? `${NOMBRE_IDIOMA[idioma]} y español` : 'español';

  const rec = ficha.paradas.filter((p) => p.tipo === 'carga'), ent = ficha.paradas.filter((p) => p.tipo === 'descarga');
  const matr = [e.matricula_camion, e.matricula_remolque].filter(Boolean).join(' / ');
  const pt = e.importe_transportista != null ? Number(e.importe_transportista) : null;
  // Mensaje ordenado tipo orden de carga, diciendo claro que lleva la orden en PDF.
  const msg = [
    `ORDEN DE CARGA · Dynamo · #${e.referencia_gx}`,
    ficha.transportista ? `Transportista: ${ficha.transportista.nombre}` : null,
    // Nº de parada correlativo (2026-11-11): con más de 2 paradas, 1-2 recogidas → 3-4 entregas.
    ...rec.map((p, i) => `Recogida${rec.length + ent.length > 2 ? ` ${i + 1}` : ''}: ${dirCorta(p)} — ${ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}`),
    ...ent.map((p, i) => `Entrega${rec.length + ent.length > 2 ? ` ${rec.length + i + 1}` : ''}: ${dirCorta(p)}${e.fecha_entrega_estimada ? ` — estimada ${fecha(e.fecha_entrega_estimada)}` : ''}`),
    `Mercancía: ${[e.metros_lineales != null && `${e.metros_lineales} m`, e.toneladas != null && `${e.toneladas} Tn`,
      e.descripcion_mercancia || (e.paletizado === false ? 'No paletizada' : 'Paletizada')].filter(Boolean).join(' · ')}`,
    matr ? `Matrículas autorizadas: ${matr}` : null,
    e.conductor_nombre ? `Conductor: ${[e.conductor_nombre, e.conductor_telefono && telBonito(e.conductor_telefono)].filter(Boolean).join(' · ')}` : null,
    que !== 'operativa' && pt != null ? `Precio acordado: ${euros(pt)} (sin IVA)` : null,
    '',
    ...(que === 'conjunta' ? [
      `Las DOS copias de la ORDEN DE CARGA en PDF, en ${idiomas}, con todos los datos y las condiciones — abrid o descargad la que necesitéis:`,
      `· Copia del CONDUCTOR (sin precios): ${enlOp}`,
      `· Copia de ADMINISTRACIÓN (completa): ${enlEc}`,
    ] : [
      `La ORDEN DE CARGA en PDF (${QUE_TXT[que]}), en ${idiomas}, con todos los datos y las condiciones. Ábrela o descárgala aquí:`,
      enlace,
    ]),
    '',
    `Si cambian las matrículas o el conductor, avísanos ANTES de la carga. Urgencias e incidencias 24 h: ${telBonito(CONTACTO.telefono)}.`,
  ].filter((x) => x !== null).join('\n');

  const waTel = (d?.telefono ?? '').replace(/[^0-9]/g, '');
  const mailtoHref = `mailto:${d?.email ?? ''}?subject=${encodeURIComponent(`Orden de carga #${e.referencia_gx} · Dynamo`)}&body=${encodeURIComponent(msg)}`;

  // ---- Enviar con los PDF ADJUNTOS (usuario, 2026-11-11: «no solo enlaces») ----------
  // La hoja de compartir del sistema (navigator.share con archivos) adjunta los PDF de
  // verdad en WhatsApp, Mail, etc. (móvil y buena parte de escritorio). Donde no existe,
  // los PDF se descargan y se abre el email con el mensaje, para adjuntarlos a mano.
  const [compartiendo, setCompartiendo] = useState(false);
  const [avisoShare, setAvisoShare] = useState<string | null>(null);
  async function compartirConPdf() {
    setAvisoShare(null); setCompartiendo(true);
    try {
      const lista: [string, string][] = que === 'conjunta'
        ? [[enlOp, 'conductor'], [enlEc, 'administracion']]
        : [[enlace, que === 'operativa' ? 'conductor' : 'administracion']];
      const files = await Promise.all(lista.map(async ([url, suf]) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error('No se ha podido generar el PDF de la orden.');
        return new File([await r.blob()], `Orden-${e.referencia_gx}-${suf}.pdf`, { type: 'application/pdf' });
      }));
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
        await navigator.share({ files, title: `Orden de carga #${e.referencia_gx} · Dynamo`, text: msg });
      } else {
        for (const f of files) {
          const u = URL.createObjectURL(f);
          const a = document.createElement('a'); a.href = u; a.download = f.name; a.click();
          URL.revokeObjectURL(u);
        }
        window.location.href = mailtoHref;
        setAvisoShare('Este navegador no deja adjuntar directamente: los PDF se han DESCARGADO y se ha abierto el email con el mensaje — arrastra los PDF descargados al email antes de enviarlo.');
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') setAvisoShare('No se ha podido compartir. Usa los botones de abajo: el PDF irá como enlace de descarga.');
    }
    setCompartiendo(false);
  }

  return (
    <Modal abierto onCerrar={onVolver} titulo={`Orden de carga · #${e.referencia_gx}`}
      sub={ficha.transportista ? `${ficha.transportista.nombre}${d && idioma !== 'es' ? ` · el PDF sale en ${idiomas}` : ''}` : undefined}
      icono={<I d={ICO.doc} />} pie={<button className="btn-ghost" onClick={onVolver}>Volver a la ficha</button>}>
      {error && <div className="pt-aviso error" role="alert"><div>{error}</div></div>}
      {/* QUÉ se comparte: preguntar SIEMPRE antes de enviar (usuario, 2026-11-10). */}
      <div className="pen-envio-sum" role="radiogroup" aria-label="Qué se comparte">
        {QUE.map(([k, tit, det]) => (
          <label key={k} className="pen-sum-row" style={{ alignItems: 'flex-start', gap: '0.5rem', justifyContent: 'flex-start', cursor: 'pointer', padding: '0.3rem 0' }}>
            <input type="radio" name="orden-que" checked={que === k} onChange={() => { setQue(k); setCopiado(null); }} style={{ marginTop: 3 }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, color: 'var(--navy)' }}>{tit}</span>
              <span style={{ display: 'block', fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>{det}</span>
            </span>
          </label>
        ))}
      </div>
      {!token && <div className="modal-warn-box" style={{ marginTop: '0.6rem' }}><strong>El enlace del envío está retirado.</strong> Crea el enlace del CMR de nuevo (en Documentos) para poder compartir la orden.</div>}
      {token && (
        <>
          <div className="ptar-sitio-grid" style={{ marginTop: '0.7rem' }}>
            {/* Conjunta = DOS PDF separados, un enlace por copia (usuario, 2026-11-11). */}
            {(que === 'conjunta' ? [
              ['op', 'PDF operativa · copia del conductor (sin precios)', enlOp],
              ['ec', 'PDF económica · copia de administración (completa)', enlEc],
            ] as const : [['un', 'Enlace de descarga del PDF', enlace]] as const).map(([k, lbl, url]) => (
              <div key={k} style={{ gridColumn: '1/-1' }}>
                <label htmlFor={`ord-enlace-${k}`}>{lbl}</label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input id={`ord-enlace-${k}`} readOnly value={url} onFocus={(ev) => ev.target.select()} style={{ flex: 1, minWidth: 0 }} />
                  <button className="btn-secondary" style={{ padding: '0 0.7rem', whiteSpace: 'nowrap' }} title="Copiar este enlace"
                    onClick={() => { navigator.clipboard?.writeText(url); setCopiado(k); }}>{copiado === k ? '✓' : 'Copiar'}</button>
                </div>
              </div>
            ))}
            <div style={{ gridColumn: '1/-1' }}>
              <label htmlFor="ord-msg">Mensaje listo para enviar</label>
              <textarea id="ord-msg" readOnly rows={9} value={msg} />
            </div>
          </div>
          {/* Enviar con los PDF adjuntos: la vía preferida (usuario, 2026-11-11). */}
          <button type="button" className="btn-primary" style={{ width: '100%', marginTop: '0.8rem' }} onClick={compartirConPdf} disabled={compartiendo}>
            {compartiendo ? 'Preparando los PDF…' : `Enviar con ${que === 'conjunta' ? 'los PDF adjuntos' : 'el PDF adjunto'} (WhatsApp, email…)`}
          </button>
          {avisoShare && <div className="modal-warn-box" style={{ marginTop: '0.5rem' }}>{avisoShare}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.45rem', marginTop: '0.55rem' }}>
            {que === 'conjunta' ? (
              <>
                <a className="btn-primary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} href={enlOp} target="_blank" rel="noopener" title="Abrir el PDF operativa (conductor)">Operativa</a>
                <a className="btn-primary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} href={enlEc} target="_blank" rel="noopener" title="Abrir el PDF económica (administración)">Económica</a>
              </>
            ) : (
              <>
                <a className="btn-primary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} href={enlace} target="_blank" rel="noopener" title="Abrir el PDF en el visor">Abrir PDF</a>
                <button className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} title="Copiar el enlace de descarga del PDF"
                  onClick={() => { navigator.clipboard?.writeText(enlace); setCopiado('un'); }}>{copiado === 'un' ? 'Copiado ✓' : 'Enlace'}</button>
              </>
            )}
            <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} title={d?.telefono ? `WhatsApp a ${telBonito(d.telefono)}` : 'El transportista no tiene teléfono en su ficha: se abre sin destinatario'}
              href={`https://wa.me/${waTel}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">WhatsApp</a>
            <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} title={d?.email ? `Email a ${d.email}` : 'El transportista no tiene email en su ficha: se abre sin destinatario'}
              href={mailtoHref}>Email</a>
          </div>
          <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>
            <strong>«Enviar con el PDF adjunto»</strong> abre la hoja de compartir del sistema con los PDF de verdad adjuntos
            (elige ahí WhatsApp, Mail…). Los botones de WhatsApp y Email de abajo se abren con el transportista y el mensaje ya
            puestos, pero el PDF va como enlace de descarga (ni el email ni WhatsApp dejan adjuntar desde un enlace).
            La copia del conductor no lleva ninguna información económica; la económica solo se abre con su enlace completo (lleva la clave).
          </p>
        </>
      )}
    </Modal>
  );
}
