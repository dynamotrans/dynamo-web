'use client';

import { useState } from 'react';
import { fechaHora } from '@/lib/formato';
import type { Ficha } from '@/lib/fichaEnvio';
import { enlaceCmr, anotarCompartido, firmasEnPapel } from '@/app/panel/(app)/envios/acciones';
import { documentosDe } from '@/app/panel/(app)/documentos/acciones';
import { subirDocumentoDirecto, ACEPTA, MAX_BYTES } from '../Documentos';
import Modal from '../Modal';
import { DOC_EN_PAPEL } from '@/lib/firmas';
import Cargando from '@/components/Cargando';
import Req from '@/components/Req';
import { HistorialEnvios } from './HistorialEnvios';
import CompartirSheet from '@/components/CompartirSheet';
import { I, ICO, ROL_CMR, enlaceCmrUrl } from './comun';

// ---- CMR digital ------------------------------------------------------------------
// Un enlace por envío para que firmen con el dedo cargador, transportista y destinatario
// (sin cuenta). Las firmas quedan en el CMR relleno y no se borran nunca.
export function CmrDigital({ ficha, hacer, trabajando }: { ficha: Ficha; hacer: (t: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, ok?: string) => Promise<boolean>; trabajando: string | null }) {
  const e = ficha.envio;
  const [compartir, setCompartir] = useState(false);   // ventana de compartir propia (mismo diseño en cualquier aparato)
  const [masInfo, setMasInfo] = useState(false);   // explicación + base legal, plegadas
  const [recarga, setRecarga] = useState(0);   // el historial de envíos se vuelve a leer tras compartir
  const [papel, setPapel] = useState(false);   // ventana «Firmó en papel (CMR bis)»
  const [compartirPdf, setCompartirPdf] = useState(false);   // compartir el PDF del CMR (enlace público)
  const enl = ficha.cmrEnlace;
  const recogidas = ficha.paradas.filter((p) => p.tipo === 'carga'), entregas = ficha.paradas.filter((p) => p.tipo === 'descarga');
  const total = recogidas.length + 1 + entregas.length;
  // Casillas aún sin firma (las de cada sitio y la del transportista): las que admiten la firma en papel.
  const faltaTransportista = !ficha.firmasCmr.some((f) => !f.extra && f.rol === 'transportista');
  const sinFirma = ficha.paradas.filter((p) => !ficha.firmasCmr.some((f) => !f.extra && f.parada_id === p.id && f.rol === (p.tipo === 'carga' ? 'remitente' : 'destinatario')));
  const lugar = (id: string | null) => { const p = ficha.paradas.find((x) => x.id === id); return p ? ` · ${p.nombre_empresa || p.poblacion || ''}` : ''; };
  // Mensaje corto para compartir (la ventana propia añade el enlace al final).
  const msg = `CMR del envío #${e.referencia_gx}${e.es_manual ? '' : ' · Dynamo'}\nFirma tu casilla con el dedo aquí:`;
  // Vive DENTRO de la sección Documentos de la ficha (usuario, 2026-11-10: «unificamos
  // CMR en uno»): sub-bloque con el enlace de firma y el estado, junto al botón del PDF.
  return <>
    <div className="det-block" style={{ margin: '0 0 0.8rem' }}>
      <p style={{ margin: '0 0 0.5rem', fontSize: 'var(--fs-m)', fontWeight: 800, color: 'var(--navy)' }}>Firmen el CMR con el dedo desde el móvil, sin crear cuenta</p>
      {/* La explicación larga y la base legal, PLEGADAS tras un enlace (usuario,
          2026-11-10: «mete en texto que pulsa y abre entero»). El enlace nace CON el
          envío; el botón de crear solo aparece si se retiró (o caducó). */}
      {/* Afirmación, no pregunta (usuario, 2026-11-10): primero el eIDAS con las
          evidencias y al final cómo funciona. El DeCA es otro documento (su botón). */}
      <button type="button" onClick={() => setMasInfo((v) => !v)} aria-expanded={masInfo}
        style={{ border: 0, background: 'none', padding: 0, margin: '0 0 0.6rem', cursor: 'pointer', font: 'inherit', fontSize: 'var(--fs-s)', fontWeight: 700, color: 'var(--purple)', textAlign: 'left' }}>
        100% seguro, digital y legal. Protocolo eIDAS. {masInfo ? '▴' : '▾'}
      </button>
      {masInfo && <>
        <p style={{ margin: '0 0 0.6rem', fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.45 }}>
          e-CMR con <strong>firma electrónica simple eIDAS</strong>, reforzada con evidencias de identidad, tiempo y ubicación (<strong>audit trail</strong>): documento del firmante con letra validada, hora del servidor, IP, GPS con dirección y huella SHA-256 de lo firmado. El Reglamento eIDAS (UE 910/2014, <strong>art. 25</strong>) impide negarle efectos jurídicos: es <strong>admisible como prueba ante organismos, peritos y tribunales</strong>; y el <strong>Protocolo e-CMR</strong> (Ginebra, 2008), ratificado por España y decenas de países, reconoce <strong>internacionalmente</strong> la carta de porte electrónica.
        </p>
        <p style={{ margin: '0 0 0.6rem', fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.45 }}>
          El <strong>documento de control (DeCA)</strong> de la Orden FOM/2861/2012 es <strong>otro documento</strong>, sin firmas: tiene su propio botón en la ficha y se envía solo al transportista al ponerse las matrículas.
        </p>
        <p style={{ margin: '0 0 0.6rem', fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.45 }}>El enlace se crea solo con el envío, para que <strong>cargador, transportista y destinatario</strong> firmen el CMR con el dedo desde el móvil, sin crear cuenta. Cada firma queda con su documento, la hora del servidor y desde dónde se firmó, y sale en el <strong>CMR relleno</strong>, que lleva dentro el QR con el nº único del documento. Desde aquí puedes reenviárselo a quien haga falta.</p>
      </>}
      {enl ? (
        <>
          {/* La acción principal, a lo ancho: FIRMAR. Debajo, DOS iguales (usuario,
              2026-11-11): COMPARTIR la página de firmas con la hoja del sistema
              (WhatsApp, email, SMS, copiar — como en la propia página pública) y el
              PDF relleno con el QR. Sin hoja de compartir, copia el mensaje. */}
          <a className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: '0.45rem' }} href={`/cmr/${enl.token}`} target="_blank" rel="noopener"
             title="Abre la página de firma: cargador, transportista y destinatario firman desde el móvil."><I d={ICO.firma} />Abrir la página de firma</a>
          {compartir && (
            <CompartirSheet onCerrar={() => setCompartir(false)} url={enlaceCmrUrl(enl.token)}
              titulo={`CMR del envío #${e.referencia_gx}${e.es_manual ? '' : ' · Dynamo'}`}
              texto={msg}
              onVia={(via) => { anotarCompartido(e.id, 'cmr', via).then(() => setRecarga((n) => n + 1)).catch(() => {}); }} />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.45rem' }}>
            <button className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }}
              title="Compartir por WhatsApp, email, SMS o copiar el enlace"
              onClick={() => setCompartir(true)}>Compartir página de firmas</button>
            <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} href={`/panel/envios/${ficha.envio.id}/cmr`} target="_blank" rel="noopener"
               title="El CMR relleno tal y como está ahora mismo, con las firmas que haya."><I d={ICO.ojo} />Abrir PDF eCMR</a>
          </div>
          {/* COMPARTIR el PDF con las firmas actuales, debajo del de abrirlo (usuario,
              2026-11-16): va el enlace público del PDF, que abre cualquiera sin cuenta. */}
          <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: '0.45rem' }}
            title="Compartir por WhatsApp, email, SMS o copiar el enlace del PDF con las firmas que haya ahora"
            onClick={() => setCompartirPdf(true)}>Compartir PDF eCMR</button>
          {compartirPdf && (
            <CompartirSheet onCerrar={() => setCompartirPdf(false)} url={`${enlaceCmrUrl(enl.token)}/pdf`}
              titulo={`CMR del envío #${e.referencia_gx}${e.es_manual ? '' : ' · Dynamo'}`}
              texto={`CMR del envío #${e.referencia_gx}${e.es_manual ? '' : ' · Dynamo'}, con las firmas actuales (PDF):`}
              onVia={(via) => { anotarCompartido(e.id, 'cmr', via).then(() => setRecarga((n) => n + 1)).catch(() => {}); }} />
          )}
          <HistorialEnvios envioId={e.id} documento="cmr" titulo="Historial envíos eCMR" recarga={recarga} />
        </>
      ) : (
        <button className="btn-primary" disabled={!!trabajando} onClick={() => hacer('Creando el enlace', () => enlaceCmr(e.id), 'Enlace del CMR creado: cópialo o mándalo por WhatsApp.')}><I d={ICO.doc} />Crear el enlace de nuevo</button>
      )}
      <div className="pen-envio-sum" style={{ marginTop: '0.7rem' }}>
        <div className="pen-sum-row"><span className="k"><strong>{ficha.firmasCmr.length} de {total}</strong> firmas</span><span className="v">{ficha.firmasCmr.length >= total ? <span className="badge badge-green">CMR firmado</span> : ''}</span></div>
        {ficha.firmasCmr.map((f, i) => (
          <div key={i} className="pen-sum-row">
            <span className="k">{ROL_CMR[f.rol] ?? f.rol}{lugar(f.parada_id)}<br /><span style={{ color: 'var(--gray-500)' }}>{f.documento === DOC_EN_PAPEL ? `${f.nombre} · sus datos constan en el papel` : <>{f.nombre} · {f.documento} ({f.documento_pais}){f.documento_validado ? '' : ' · documento sin comprobar'}</>}</span>
              {f.en_papel && <><br /><span className="badge badge-orange">Firmó en papel · CMR bis anexo</span></>}</span>
            <span className="v" style={{ whiteSpace: 'nowrap' }}>{fechaHora(f.firmado_en)}</span>
          </div>
        ))}
      </div>
      {/* Quien se niega (o no puede) firmar en el móvil firma un CMR en papel con la misma
          referencia: aquí se registra, con la foto, y completa el CMR digital. */}
      {!e.es_manual && (sinFirma.length > 0 || faltaTransportista) && (
        <button type="button" className="btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: '0.6rem' }} disabled={!!trabajando}
          title="Alguien firmó en un CMR en papel en lugar de en el móvil: se registra con la foto del papel y completa el CMR digital."
          onClick={() => setPapel(true)}><I d={ICO.doc} />Firmó en papel (CMR bis)</button>
      )}
    </div>
    {papel && <FirmaPapel ficha={ficha} pendientes={sinFirma} faltaTransportista={faltaTransportista} hacer={hacer} trabajando={trabajando} onCerrar={() => setPapel(false)} />}
  </>;
}

// ---- Firma en papel que completa el CMR digital («CMR bis») ------------------------
// Caso real (usuario, 2026-11-16): firman todos en el móvil menos el último destinatario,
// que solo firma en papel. El conductor le hace firmar un CMR en papel que lleva escrita
// la referencia del electrónico; Dynamo sube aquí la foto y apunta quién firmó. No se
// rehace nada: las firmas digitales siguen igual y esta casilla queda «firmada en papel».
function FirmaPapel({ ficha, pendientes, faltaTransportista, hacer, trabajando, onCerrar }: {
  ficha: Ficha; pendientes: Ficha['paradas']; faltaTransportista: boolean; trabajando: string | null; onCerrar: () => void;
  hacer: (t: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, ok?: string) => Promise<boolean>;
}) {
  const e = ficha.envio;
  // Las casillas que aún no tienen firma, en el orden del CMR: recogidas (22), transportista
  // (23) y entregas (24). Salen TODAS marcadas (usuario, 2026-11-19): lo normal es que el
  // papel lo firmen todos; se desmarca quien no firmó en él.
  const TRANSPORTISTA = 'transportista';
  const casillas = [
    ...pendientes.filter((p) => p.tipo === 'carga').map((p) => ({ id: p.id, rol: 'Recogida · remitente', quien: p.nombre_empresa || p.poblacion || 'sitio', casilla: 22 })),
    ...(faltaTransportista ? [{ id: TRANSPORTISTA, rol: 'Transportista', quien: ficha.transportista?.nombre || 'transportista', casilla: 23 }] : []),
    ...pendientes.filter((p) => p.tipo !== 'carga').map((p) => ({ id: p.id, rol: 'Entrega · destinatario', quien: p.nombre_empresa || p.poblacion || 'sitio', casilla: 24 })),
  ];
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(casillas.map((c) => c.id)));
  const [foto, setFoto] = useState<File | null>(null);
  const [subido, setSubido] = useState<{ nombre: string; id: string } | null>(null);   // la foto ya subida: un reintento no la duplica
  const [subiendo, setSubiendo] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const frase = `Complementa al CMR electrónico nº ${e.referencia_gx}`;
  const marcar = (id: string, si: boolean) => setMarcadas((m) => { const n = new Set(m); if (si) n.add(id); else n.delete(id); return n; });

  async function guardar() {
    setFallo(null);
    if (!marcadas.size) return setFallo('Marca al menos una casilla: quién firmó en el papel.');
    if (!foto) return setFallo('Añade la foto o el PDF del CMR en papel firmado.');
    if (foto.size > MAX_BYTES) return setFallo('El fichero pesa más de 25 MB.');
    let id = subido && subido.nombre === foto.name ? subido.id : null;
    if (!id) {
      setSubiendo(true);
      const dueno = { campo: 'envio_id' as const, id: e.id };
      const r = await subirDocumentoDirecto(dueno, foto, 'cmr_firmado');
      if (!r.ok) { setSubiendo(false); return setFallo(r.error); }
      // La fila recién creada: el «CMR firmado» más nuevo con ese nombre.
      const docs = await documentosDe(dueno);
      setSubiendo(false);
      id = docs.find((x) => x.tipo === 'cmr_firmado' && x.nombre_archivo === foto.name.slice(0, 200))?.id ?? null;
      if (!id) return setFallo('La foto se ha subido pero no se encuentra entre los documentos del envío. Vuelve a intentarlo.');
      setSubido({ nombre: foto.name, id });
    }
    const idDoc = id;
    const paradas = [...marcadas].filter((x) => x !== TRANSPORTISTA);
    if (await hacer('Registrando la firma en papel', () => firmasEnPapel(e.id, paradas, marcadas.has(TRANSPORTISTA), idDoc))) onCerrar();
  }

  return (
    <Modal abierto ancho={560} onCerrar={onCerrar} titulo={`Firmó en papel · #${e.referencia_gx}`}
      sub="CMR bis: un CMR en papel que completa el CMR digital" icono={<I d={ICO.firma} />}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando || subiendo}>Volver</button>
        <button className="btn-primary" onClick={guardar} disabled={!!trabajando || subiendo}>Registrar la firma en papel</button>
      </>}>
      <div className="pt-aviso info"><div>
        Para quien <strong>no firma en el móvil</strong>. Firma un CMR en papel que lleve escrito a mano: <strong>«{frase}»</strong>, con su nombre, documento, fecha, hora y sello. Las firmas digitales que ya hay <strong>no se tocan</strong>: este papel se añade como anexo y completa el CMR.
      </div></div>
      <fieldset id="fp-casillas" style={{ border: 0, padding: 0, margin: '0.8rem 0 0' }}>
        <legend style={{ fontSize: 'var(--fs-m)', fontWeight: 700, color: 'var(--gray-700)', padding: 0, marginBottom: '0.4rem' }}>Quién firmó en el papel <Req /></legend>
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          {casillas.map((c) => (
            <label key={c.id} className="fp-casilla" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.75rem', border: `1.5px solid ${marcadas.has(c.id) ? 'var(--purple)' : 'var(--gray-200)'}`, borderRadius: 12, background: marcadas.has(c.id) ? 'rgba(51,0,204,0.04)' : '#fff', cursor: 'pointer', margin: 0 }}>
              <input type="checkbox" checked={marcadas.has(c.id)} onChange={(ev) => marcar(c.id, ev.target.checked)} style={{ width: 20, height: 20, flex: '0 0 auto', accentColor: 'var(--purple)' }} />
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', color: 'var(--navy)' }}>{c.quien}</strong>
                <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>{c.rol} · casilla {c.casilla}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div style={{ marginTop: '0.8rem' }}>
        <label htmlFor="fp-foto">Foto o PDF del CMR en papel firmado <Req /></label>
        <input id="fp-foto" type="file" accept={ACEPTA} onChange={(ev) => setFoto(ev.target.files?.[0] ?? null)} />
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>No hace falta escribir el nombre ni el documento de quien firmó: ya constan en el papel, que queda en los documentos del envío como «CMR firmado». Una firma registrada no se puede borrar: revisa las casillas antes de guardar.</p>
      {fallo && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.6rem' }}>⚠ {fallo}</div>}
      {(subiendo || trabajando) && <Cargando texto={subiendo ? 'Subiendo la foto' : trabajando!} />}
    </Modal>
  );
}
