'use client';

import { useState } from 'react';
import { fechaHora } from '@/lib/formato';
import type { Ficha } from '@/lib/fichaEnvio';
import { enlaceCmr } from '@/app/panel/(app)/envios/acciones';
import { I, ICO, ROL_CMR, enlaceCmrUrl } from './comun';

// ---- CMR digital ------------------------------------------------------------------
// Un enlace por envío para que firmen con el dedo cargador, transportista y destinatario
// (sin cuenta). Las firmas quedan en el CMR relleno y no se borran nunca.
export function CmrDigital({ ficha, hacer, trabajando }: { ficha: Ficha; hacer: (t: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, ok?: string) => Promise<boolean>; trabajando: string | null }) {
  const e = ficha.envio;
  const [copiado, setCopiado] = useState(false);
  const [masInfo, setMasInfo] = useState(false);   // explicación + base legal, plegadas
  const enl = ficha.cmrEnlace;
  const recogidas = ficha.paradas.filter((p) => p.tipo === 'carga'), entregas = ficha.paradas.filter((p) => p.tipo === 'descarga');
  const total = recogidas.length + 1 + entregas.length;
  const lugar = (id: string | null) => { const p = ficha.paradas.find((x) => x.id === id); return p ? ` · ${p.nombre_empresa || p.poblacion || ''}` : ''; };
  const msg = enl ? `CMR del envío #${e.referencia_gx}${e.es_manual ? '' : ' · Dynamo'}\nFirma tu casilla con el dedo aquí: ${enlaceCmrUrl(enl.token)}` : '';
  // Vive DENTRO de la sección Documentos de la ficha (usuario, 2026-11-10: «unificamos
  // CMR en uno»): sub-bloque con el enlace de firma y el estado, junto al botón del PDF.
  return <>
    <div className="det-block" style={{ margin: '0 0 0.8rem' }}>
      <p style={{ margin: '0 0 0.5rem', fontSize: 'var(--fs-m)', fontWeight: 800, color: 'var(--navy)' }}>Firmen el CMR con el dedo desde el móvil, sin crear cuenta</p>
      {/* La explicación larga y la base legal, PLEGADAS tras un enlace (usuario,
          2026-11-10: «mete en texto que pulsa y abre entero»). El enlace nace CON el
          envío; el botón de crear solo aparece si se retiró (o caducó). */}
      <button type="button" onClick={() => setMasInfo((v) => !v)} aria-expanded={masInfo}
        style={{ border: 0, background: 'none', padding: 0, margin: '0 0 0.6rem', cursor: 'pointer', font: 'inherit', fontSize: 'var(--fs-s)', fontWeight: 700, color: 'var(--purple)' }}>
        {masInfo ? 'Ocultar cómo funciona y la base legal ▴' : '¿Cómo funciona y qué validez legal tiene? ▾'}
      </button>
      {masInfo && <>
        <p style={{ margin: '0 0 0.6rem', fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.45 }}>El enlace se crea solo con el envío, para que <strong>cargador, transportista y destinatario</strong> firmen el CMR con el dedo desde el móvil, sin crear cuenta. Cada firma queda con su documento, la hora del servidor y desde dónde se firmó, y sale en el <strong>CMR relleno</strong>, que lleva dentro el QR con el nº único del documento y hace de <strong>DeCA</strong> (documento de control) en los tramos nacionales. Desde aquí puedes reenviárselo a quien haga falta.</p>
        <p style={{ margin: '0 0 0.6rem', fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.45 }}>
          <strong>Base legal:</strong> Orden FOM/2861/2012, de 13 de diciembre (documento de control administrativo del transporte público de mercancías por carretera), <strong>art. 6</strong>: el documento de control puede llevarse en <strong>soporte electrónico</strong> siempre que recoja los datos exigidos (art. 5: cargador contractual y transportista efectivo con su NIF, vehículo, naturaleza y peso de la carga, origen, destino y fechas) y pueda mostrarse en una inspección en carretera. Este eCMR los recoge todos, con el QR, el nº único y el registro de creación y firmas dentro del PDF. En transporte <strong>internacional</strong> rige el Convenio CMR (Ginebra, 19-may-1956) y no se exige DeCA.
        </p>
        <p style={{ margin: '0 0 0.6rem', fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.45 }}>
          <strong>En resumen:</strong> e-CMR con <strong>firma electrónica simple eIDAS</strong>, reforzada con evidencias de identidad, tiempo y ubicación (<strong>audit trail</strong>): documento del firmante con letra validada, hora del servidor, IP, GPS con dirección y huella SHA-256 de lo firmado. El Reglamento eIDAS (UE 910/2014, <strong>art. 25</strong>) impide negarle efectos jurídicos: es <strong>admisible como prueba ante organismos, peritos y tribunales</strong>; y el <strong>Protocolo e-CMR</strong> (Ginebra, 2008), ratificado por España y decenas de países, reconoce <strong>internacionalmente</strong> la carta de porte electrónica.
        </p>
      </>}
      {enl ? (
        <>
          {/* La acción principal, a lo ancho: FIRMAR. Debajo, UNA sola fila de 3 iguales
              (usuario, 2026-11-10): compartir el enlace y el PDF relleno con el QR. */}
          <a className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: '0.45rem' }} href={`/cmr/${enl.token}`} target="_blank" rel="noopener"
             title="Abre la página de firma: cargador, transportista y destinatario firman desde el móvil."><I d={ICO.firma} />Abrir la página de firma</a>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem' }}>
            <button className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} title="Copiar el enlace de firma"
              onClick={() => { navigator.clipboard?.writeText(enlaceCmrUrl(enl.token)); setCopiado(true); setTimeout(() => setCopiado(false), 1800); }}>{copiado ? 'Copiado ✓' : 'Copiar enlace'}</button>
            <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">WhatsApp</a>
            <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} href={`/panel/envios/${ficha.envio.id}/cmr`} target="_blank" rel="noopener"
               title="El CMR relleno tal y como está ahora mismo, con las firmas que haya; lleva el QR del DeCA."><I d={ICO.ojo} />PDF relleno</a>
          </div>
        </>
      ) : (
        <button className="btn-primary" disabled={!!trabajando} onClick={() => hacer('Creando el enlace', () => enlaceCmr(e.id), 'Enlace del CMR creado: cópialo o mándalo por WhatsApp.')}><I d={ICO.doc} />Crear el enlace de nuevo</button>
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
