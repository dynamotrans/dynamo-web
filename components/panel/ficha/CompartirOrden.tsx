'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Modal from '../Modal';
import { euros, ventana, fecha, metros, pesoTn } from '@/lib/formato';
import { telBonito, paisDe as nombrePais } from '@/lib/paises';
import { nombreTipo } from '../TipoSitio';
import { CONTACTO } from '@/lib/atencion';
import { NOMBRE_IDIOMA, type IdiomaOrden } from '@/lib/pdf/ordenTextos';
import type { Ficha, ParadaFicha } from '@/lib/fichaEnvio';
import { datosOrden, emailOrdenPlataforma } from '@/app/panel/(app)/envios/acciones';
import { I, ICO } from './comun';

// ---- Compartir la ORDEN DE CARGA (usuario, 2026-11-10) ------------------------------
// UNA SOLA ORDEN (usuario, 2026-11-14: «evitamos la del conductor para no liar y
// unificar documentos»): el documento completo, con el precio; su enlace lleva la clave.
// Dos secciones (2026-11-13): al TRANSPORTISTA (orden en PDF + firma) y al CLIENTE
// (resumen sin precios ni datos internos del transportista). La vía preferida es el
// EMAIL DESDE LA PLATAFORMA, que adjunta el PDF de verdad (mailto no puede).
// Simplificado (usuario, 2026-11-14): por pestaña, UNA fila con el email azul y el
// WhatsApp al número de cada uno, más «Abrir el PDF» (solo transportista). Fuera el
// campo del enlace con Copiar, el botón de mailto y el parrafón de explicación.

// Botones de la fila: el texto (con el email o el teléfono) puede ocupar 2 líneas.
const btnPar: CSSProperties = {
  whiteSpace: 'normal', height: 'auto', minHeight: 46, padding: '0.55rem 0.5rem',
  display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.25,
};

// «cp población, país (tipo de sitio)» — el mismo estilo de la proforma (usuario, 2026-11-13).
function dirCorta(p: ParadaFicha): string {
  const pais = nombrePais((p.pais_codigo_iso ?? 'ES').toUpperCase());
  return `${[[p.codigo_postal, p.poblacion].filter(Boolean).join(' '), pais].filter(Boolean).join(', ')} (${nombreTipo(p.sitio?.tipo)})`;
}

export function CompartirOrden({ ficha, onVolver }: { ficha: Ficha; onVolver: () => void }) {
  const e = ficha.envio;
  const [d, setD] = useState<{ email: string | null; telefono: string | null; idioma: string; clave: string; claveCliente: string | null; bolsa: string | null; codigoBolsa: string | null; clienteEmail: string | null; clienteTelefono: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [para, setPara] = useState<'transportista' | 'cliente'>('transportista');
  // El email desde la plataforma: en marcha y su resultado (se enseña en pantalla).
  const [mandando, setMandando] = useState(false);
  const [avisoMail, setAvisoMail] = useState<{ ok: boolean; txt: string } | null>(null);
  useEffect(() => { datosOrden(e.id).then((r) => { if (r.ok) setD(r); else setError(r.error); }); }, [e.id]);

  const token = ficha.cmrEnlace?.token ?? null;
  const origen = typeof window !== 'undefined' ? window.location.origin : '';
  const enlace = token && d ? `${origen}/cmr/${token}/orden?copia=economica&clave=${d.clave}` : '';
  // La COPIA CLIENTE (usuario, 2026-11-14): el mismo documento con SU precio (+ IVA) y
  // sin los datos ni el precio del transportista. Su clave es el id del cliente.
  const enlaceCli = token && d?.claveCliente ? `${origen}/cmr/${token}/orden?copia=cliente&clave=${d.claveCliente}` : '';
  const idioma = (d?.idioma ?? 'es') as IdiomaOrden;
  const idiomas = idioma !== 'es' ? `${NOMBRE_IDIOMA[idioma]} y español` : 'español';

  const rec = ficha.paradas.filter((p) => p.tipo === 'carga'), ent = ficha.paradas.filter((p) => p.tipo === 'descarga');
  const matr = [e.matricula_camion, e.matricula_remolque].filter(Boolean).join(' / ');
  const pt = e.importe_transportista != null ? Number(e.importe_transportista) : null;
  const cargaTxt = e.fecha_carga_prevista ? `el ${fecha(e.fecha_carga_prevista)}`
    : e.fecha_carga_hasta && e.fecha_carga_hasta !== e.fecha_carga_desde ? ventana(e.fecha_carga_desde, e.fecha_carga_hasta) : `el ${fecha(e.fecha_carga_desde)}`;
  const camionTxt = e.requiere_plataforma_elevadora ? 'Camión rígido con plataforma elevadora (8 m · 14 Tn · altura máx. 2,60 m)' : 'Tráiler tauliner (lona corredera · altura máx. 2,70 m)';
  // El enlace de firma va ARRIBA (lo primero que se ve) y repetido en la lista de abajo
  // (usuario, 2026-11-13); la orden va como PDF ADJUNTO, sin enlace.
  const lineaFirma = token ? `Firma en este enlace tu e-CMR/DeCA DIGITAL EN RUTA (Para móvil/ordenador, 100 % seguro, digital y legal. Protocolo eIDAS): ${origen}/cmr/${token}` : null;
  // Nº de parada correlativo (2026-11-11): con más de 2 paradas, 1-2 recogidas → 3-4 entregas.
  const lineasRuta = [
    ...rec.map((p, i) => `Recogida${rec.length + ent.length > 2 ? ` ${i + 1}` : ''}: ${dirCorta(p)}`),
    ...ent.map((p, i) => `Entrega${rec.length + ent.length > 2 ? ` ${rec.length + i + 1}` : ''}: ${dirCorta(p)}`),
  ];
  const lineasDetalle = [
    `Carga ${cargaTxt}`,
    e.fecha_entrega_estimada ? `Entrega estimada ${fecha(e.fecha_entrega_estimada)}` : null,
    camionTxt,
    [e.metros_lineales != null && metros(e.metros_lineales), e.toneladas != null && pesoTn(e.toneladas),
      e.descripcion_mercancia || (e.paletizado === false ? 'No paletizada' : 'Paletizada')].filter(Boolean).join(' · '),
  ].filter((x) => x !== null) as string[];

  // Mensaje al TRANSPORTISTA: con aire y por bloques (usuario, 2026-11-13).
  const msg = [
    `ORDEN DE CARGA · Dynamo · #${e.referencia_gx}`,
    '',
    lineaFirma,
    lineaFirma ? '' : null,
    ...(ficha.transportista ? [
      'Transportista:',
      `${ficha.transportista.nombre}${ficha.transportista.cif ? ` · NIF/CIF ${ficha.transportista.cif}` : ''}`,
      d?.bolsa || d?.codigoBolsa ? `Bolsa: ${[d?.bolsa, d?.codigoBolsa ? `código ${d.codigoBolsa}` : null].filter(Boolean).join(' · ')}` : null,
      d?.email ?? null,
      d?.telefono ? telBonito(d.telefono) : null,
      '',
    ] : []),
    'RUTA:',
    ...lineasRuta,
    '',
    'DETALLE:',
    ...lineasDetalle,
    matr ? `Matrículas autorizadas: ${matr}` : null,
    e.conductor_nombre ? `Conductor: ${[e.conductor_nombre, e.conductor_telefono && telBonito(e.conductor_telefono)].filter(Boolean).join(' · ')}` : null,
    pt != null ? `Precio acordado: ${euros(pt)} (sin IVA)` : null,
    '',
    lineaFirma ? `· ${lineaFirma}` : null,
    lineaFirma ? '' : null,
    '· PDF ADJUNTO: LA ORDEN DE CARGA (documento completo, con los datos y las condiciones)',
    '',
    `Si cambian las matrículas o el conductor, avísanos ANTES de la carga. Urgencias e incidencias 24 h: ${telBonito(CONTACTO.telefono)}.`,
  ].filter((x) => x !== null).join('\n');

  // Mensaje para el CLIENTE (usuario, 2026-11-13): su resumen del envío SIN los datos
  // del transportista (solo matrículas y conductor), con el enlace de firma — su
  // almacén firma la casilla del cargador desde ahí — y, desde 2026-11-14, con el
  // enlace de SU copia de la orden en PDF (con su precio; por email va además adjunta).
  const msgCli = [
    `TU ENVÍO · Dynamo · #${e.referencia_gx}`,
    '',
    'Tu envío ya tiene camión asignado. Te pasamos el resumen:',
    '',
    lineaFirma,
    lineaFirma ? '' : null,
    'RUTA:',
    ...lineasRuta,
    '',
    'DETALLE:',
    ...lineasDetalle,
    matr ? `Matrículas: ${matr}` : null,
    e.conductor_nombre ? `Conductor: ${[e.conductor_nombre, e.conductor_telefono && telBonito(e.conductor_telefono)].filter(Boolean).join(' · ')}` : null,
    '',
    enlaceCli ? `· TU ORDEN DE CARGA EN PDF (con tu precio; por email va además adjunta): ${enlaceCli}`
      : '· PDF ADJUNTO: TU ORDEN DE CARGA (con tu precio)',
    '',
    `Seguimiento al minuto, documentos y eCMR en tu panel de dynamotrans.com. Cualquier duda o cambio: ${CONTACTO.email} · ${telBonito(CONTACTO.telefono)}.`,
  ].filter((x) => x !== null).join('\n');

  const waTel = (d?.telefono ?? '').replace(/[^0-9]/g, '');
  const waTelCli = (d?.clienteTelefono ?? '').replace(/[^0-9]/g, '');

  // El PDF se DESCARGA al pulsar WhatsApp (usuario, 2026-11-13): WhatsApp no deja
  // adjuntar desde un enlace, así que se descarga y se adjunta ahí a mano.
  function descargarPdf(url: string, nombre: string) {
    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        const u = URL.createObjectURL(await r.blob());
        const a = document.createElement('a'); a.href = u; a.download = nombre; a.click();
        URL.revokeObjectURL(u);
      } catch { /* la descarga nunca rompe la apertura del mensaje */ }
    })();
  }

  // Email DESDE LA PLATAFORMA: Postmark adjunta el PDF de verdad (usuario, 2026-11-13).
  async function mandarDesdePlataforma(aQuien: 'transportista' | 'cliente') {
    setAvisoMail(null); setMandando(true);
    const r = await emailOrdenPlataforma(e.id, aQuien, aQuien === 'transportista' ? msg : msgCli).catch(() => ({ ok: false as const, error: 'No se ha podido enviar.' }));
    setAvisoMail(r.ok ? { ok: true, txt: `Email enviado a ${r.para} con la orden en PDF adjunta.` } : { ok: false, txt: r.error });
    setMandando(false);
  }

  return (
    <Modal abierto onCerrar={onVolver} titulo={`Orden de carga · #${e.referencia_gx}`}
      sub={ficha.transportista ? `${ficha.transportista.nombre}${d && idioma !== 'es' ? ` · el PDF sale en ${idiomas}` : ''}` : undefined}
      icono={<I d={ICO.doc} />} pie={<button className="btn-ghost" onClick={onVolver}>Volver a la ficha</button>}>
      {error && <div className="pt-aviso error" role="alert"><div>{error}</div></div>}
      {/* A QUIÉN va (usuario, 2026-11-13): transportista o cliente, cada uno con su mensaje. */}
      <div className="tabs" style={{ marginBottom: '0.7rem' }}>
        <button type="button" className={`tab${para === 'transportista' ? ' active' : ''}`} onClick={() => { setPara('transportista'); setAvisoMail(null); }}>Para el transportista</button>
        <button type="button" className={`tab${para === 'cliente' ? ' active' : ''}`} onClick={() => { setPara('cliente'); setAvisoMail(null); }}>Para el cliente</button>
      </div>
      {!token && <div className="modal-warn-box" style={{ marginTop: '0.6rem' }}><strong>El enlace del envío está retirado.</strong> Crea el enlace del CMR de nuevo (en Documentos) para poder compartir la orden.</div>}

      {para === 'cliente' && (
        <>
          <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-600)', margin: '0 0 0.6rem' }}>
            La orden para <strong>el cliente</strong>: con <strong>su precio</strong> (+ IVA) y sin los datos ni el
            precio del transportista (solo matrículas y conductor), con su enlace de firma del eCMR.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
            <button type="button" className="btn-primary" style={btnPar} disabled={mandando || !d?.clienteEmail}
              title={d?.clienteEmail ? `Se envía a ${d.clienteEmail} con su orden en PDF adjunta` : 'El cliente no tiene email en sus contactos'}
              onClick={() => mandarDesdePlataforma('cliente')}>
              {mandando ? 'Enviando…' : `Enviar email con el PDF${d?.clienteEmail ? ` a ${d.clienteEmail}` : ''}`}
            </button>
            <a className="btn-secondary" style={btnPar}
              title={d?.clienteTelefono ? `WhatsApp a ${telBonito(d.clienteTelefono)} (su PDF se descarga al pulsar, para adjuntarlo ahí)` : 'El cliente no tiene teléfono en sus contactos: se abre sin destinatario'}
              onClick={() => { if (enlaceCli) descargarPdf(enlaceCli, `Orden-${e.referencia_gx}-cliente.pdf`); }}
              href={`https://wa.me/${waTelCli}?text=${encodeURIComponent(msgCli)}`} target="_blank" rel="noopener">
              WhatsApp{d?.clienteTelefono ? ` · ${telBonito(d.clienteTelefono)}` : ''}
            </a>
          </div>
          {avisoMail && <div className={`pt-aviso${avisoMail.ok ? ' info' : ' error'}`} role="status" style={{ marginTop: '0.5rem' }}><div>{avisoMail.txt}</div></div>}
          {enlaceCli && <a className="btn-secondary" style={{ ...btnPar, marginTop: '0.55rem' }} href={enlaceCli} target="_blank" rel="noopener"
            title="Abrir la copia del cliente en PDF en el navegador (el enlace lleva su clave)">Abrir el PDF en el navegador</a>}
        </>
      )}

      {para === 'transportista' && token && (
        <>
          {/* La vía preferida: el email lo manda LA PLATAFORMA con el PDF adjunto de verdad. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
            <button type="button" className="btn-primary" style={btnPar} disabled={mandando || !d?.email}
              title={d?.email ? `Se envía a ${d.email} con la orden en PDF adjunta` : 'El transportista no tiene email en su ficha'}
              onClick={() => mandarDesdePlataforma('transportista')}>
              {mandando ? 'Enviando…' : `Enviar email con el PDF${d?.email ? ` a ${d.email}` : ''}`}
            </button>
            <a className="btn-secondary" style={btnPar}
              title={d?.telefono ? `WhatsApp a ${telBonito(d.telefono)} (el PDF se descarga al pulsar, para adjuntarlo ahí)` : 'El transportista no tiene teléfono en su ficha: se abre sin destinatario'}
              onClick={() => descargarPdf(enlace, `Orden-de-carga-${e.referencia_gx}.pdf`)}
              href={`https://wa.me/${waTel}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">
              WhatsApp{d?.telefono ? ` · ${telBonito(d.telefono)}` : ''}
            </a>
          </div>
          {avisoMail && <div className={`pt-aviso${avisoMail.ok ? ' info' : ' error'}`} role="status" style={{ marginTop: '0.5rem' }}><div>{avisoMail.txt}</div></div>}
          <a className="btn-secondary" style={{ ...btnPar, marginTop: '0.55rem' }} href={enlace} target="_blank" rel="noopener"
            title="Abrir la orden en PDF en el navegador (el enlace lleva la clave: solo para el transportista)">Abrir el PDF en el navegador</a>
          <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>
            La orden completa en {idiomas}. El email la adjunta en PDF; WhatsApp abre el chat y la descarga para adjuntarla ahí a mano.
          </p>
        </>
      )}
    </Modal>
  );
}
