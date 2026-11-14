'use client';

import { useEffect, useState } from 'react';
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

// «cp población, país (tipo de sitio)» — el mismo estilo de la proforma (usuario, 2026-11-13).
function dirCorta(p: ParadaFicha): string {
  const pais = nombrePais((p.pais_codigo_iso ?? 'ES').toUpperCase());
  return `${[[p.codigo_postal, p.poblacion].filter(Boolean).join(' '), pais].filter(Boolean).join(', ')} (${nombreTipo(p.sitio?.tipo)})`;
}

export function CompartirOrden({ ficha, onVolver }: { ficha: Ficha; onVolver: () => void }) {
  const e = ficha.envio;
  const [d, setD] = useState<{ email: string | null; telefono: string | null; idioma: string; clave: string; bolsa: string | null; codigoBolsa: string | null; clienteEmail: string | null; clienteTelefono: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [para, setPara] = useState<'transportista' | 'cliente'>('transportista');
  // El email desde la plataforma: en marcha y su resultado (se enseña en pantalla).
  const [mandando, setMandando] = useState(false);
  const [avisoMail, setAvisoMail] = useState<{ ok: boolean; txt: string } | null>(null);
  useEffect(() => { datosOrden(e.id).then((r) => { if (r.ok) setD(r); else setError(r.error); }); }, [e.id]);

  const token = ficha.cmrEnlace?.token ?? null;
  const origen = typeof window !== 'undefined' ? window.location.origin : '';
  const enlace = token && d ? `${origen}/cmr/${token}/orden?copia=economica&clave=${d.clave}` : '';
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

  // Mensaje para el CLIENTE (usuario, 2026-11-13): su resumen del envío SIN precios y
  // SIN los datos del transportista (solo matrículas y conductor), con el enlace de
  // firma — su almacén firma la casilla del cargador desde ahí.
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
    `Seguimiento al minuto, documentos y eCMR en tu panel de dynamotrans.com. Cualquier duda o cambio: ${CONTACTO.email} · ${telBonito(CONTACTO.telefono)}.`,
  ].filter((x) => x !== null).join('\n');

  const waTel = (d?.telefono ?? '').replace(/[^0-9]/g, '');
  const mailtoHref = `mailto:${d?.email ?? ''}?subject=${encodeURIComponent(`Orden de carga #${e.referencia_gx} · Dynamo`)}&body=${encodeURIComponent(msg)}`;
  const waTelCli = (d?.clienteTelefono ?? '').replace(/[^0-9]/g, '');
  const mailtoCli = `mailto:${d?.clienteEmail ?? ''}?subject=${encodeURIComponent(`Tu envío #${e.referencia_gx} · Dynamo`)}&body=${encodeURIComponent(msgCli.replace(/\n/g, '\r\n'))}`;

  // El PDF se DESCARGA al pulsar WhatsApp o Email (usuario, 2026-11-13): ninguno de los
  // dos deja adjuntar desde un enlace, así que se descarga y se adjunta ahí a mano.
  function descargarPdf() {
    (async () => {
      try {
        const r = await fetch(enlace);
        if (!r.ok) return;
        const u = URL.createObjectURL(await r.blob());
        const a = document.createElement('a'); a.href = u; a.download = `Orden-de-carga-${e.referencia_gx}.pdf`; a.click();
        URL.revokeObjectURL(u);
      } catch { /* la descarga nunca rompe la apertura del mensaje */ }
    })();
  }

  // Email DESDE LA PLATAFORMA: Postmark adjunta el PDF de verdad (usuario, 2026-11-13).
  async function mandarDesdePlataforma(aQuien: 'transportista' | 'cliente') {
    setAvisoMail(null); setMandando(true);
    const r = await emailOrdenPlataforma(e.id, aQuien, aQuien === 'transportista' ? msg : msgCli).catch(() => ({ ok: false as const, error: 'No se ha podido enviar.' }));
    setAvisoMail(r.ok ? { ok: true, txt: `Email enviado a ${r.para}${aQuien === 'transportista' ? ' con la orden en PDF adjunta' : ''}.` } : { ok: false, txt: r.error });
    setMandando(false);
  }

  return (
    <Modal abierto onCerrar={onVolver} titulo={`Orden de carga · #${e.referencia_gx}`}
      sub={ficha.transportista ? `${ficha.transportista.nombre}${d && idioma !== 'es' ? ` · el PDF sale en ${idiomas}` : ''}` : undefined}
      icono={<I d={ICO.doc} />} pie={<button className="btn-ghost" onClick={onVolver}>Volver a la ficha</button>}>
      {error && <div className="pt-aviso error" role="alert"><div>{error}</div></div>}
      {/* A QUIÉN va (usuario, 2026-11-13): transportista o cliente, cada uno con su mensaje. */}
      <div className="tabs" style={{ marginBottom: '0.7rem' }}>
        <button type="button" className={`tab${para === 'transportista' ? ' active' : ''}`} onClick={() => { setPara('transportista'); setCopiado(null); setAvisoMail(null); }}>Para el transportista</button>
        <button type="button" className={`tab${para === 'cliente' ? ' active' : ''}`} onClick={() => { setPara('cliente'); setCopiado(null); setAvisoMail(null); }}>Para el cliente</button>
      </div>
      {!token && <div className="modal-warn-box" style={{ marginTop: '0.6rem' }}><strong>El enlace del envío está retirado.</strong> Crea el enlace del CMR de nuevo (en Documentos) para poder compartir la orden.</div>}

      {para === 'cliente' && (
        <>
          <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-600)', margin: '0 0 0.6rem' }}>
            El resumen del envío para <strong>el cliente</strong>: sin precios y sin los datos del transportista
            (solo matrículas y conductor), con su enlace de firma del eCMR.
          </p>
          <button type="button" className="btn-primary" style={{ width: '100%' }} disabled={mandando || !d?.clienteEmail}
            title={d?.clienteEmail ? `Se envía a ${d.clienteEmail}` : 'El cliente no tiene email en sus contactos'}
            onClick={() => mandarDesdePlataforma('cliente')}>
            {mandando ? 'Enviando…' : `Enviar email desde la plataforma${d?.clienteEmail ? ` a ${d.clienteEmail}` : ''}`}
          </button>
          {avisoMail && <div className={`pt-aviso${avisoMail.ok ? ' info' : ' error'}`} role="status" style={{ marginTop: '0.5rem' }}><div>{avisoMail.txt}</div></div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem', marginTop: '0.55rem' }}>
            <button className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }}
              onClick={() => { navigator.clipboard?.writeText(msgCli); setCopiado('cli'); }}>{copiado === 'cli' ? 'Copiado ✓' : 'Copiar mensaje'}</button>
            <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }}
              title={d?.clienteTelefono ? `WhatsApp a ${telBonito(d.clienteTelefono)}` : 'El cliente no tiene teléfono en sus contactos: se abre sin destinatario'}
              href={`https://wa.me/${waTelCli}?text=${encodeURIComponent(msgCli)}`} target="_blank" rel="noopener">WhatsApp</a>
            <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }}
              title={d?.clienteEmail ? `Email a ${d.clienteEmail}` : 'El cliente no tiene email en sus contactos: se abre sin destinatario'}
              href={mailtoCli}>Email</a>
          </div>
        </>
      )}

      {para === 'transportista' && token && (
        <>
          {/* La vía preferida: el email lo manda LA PLATAFORMA con el PDF adjunto de verdad. */}
          <button type="button" className="btn-primary" style={{ width: '100%' }} disabled={mandando || !d?.email}
            title={d?.email ? `Se envía a ${d.email} con la orden en PDF adjunta` : 'El transportista no tiene email en su ficha'}
            onClick={() => mandarDesdePlataforma('transportista')}>
            {mandando ? 'Enviando…' : `Enviar email con el PDF adjunto${d?.email ? ` a ${d.email}` : ''}`}
          </button>
          {avisoMail && <div className={`pt-aviso${avisoMail.ok ? ' info' : ' error'}`} role="status" style={{ marginTop: '0.5rem' }}><div>{avisoMail.txt}</div></div>}
          <div className="ptar-sitio-grid" style={{ marginTop: '0.7rem' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label htmlFor="ord-enlace">Enlace de descarga del PDF (lleva la clave: solo para el transportista)</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input id="ord-enlace" readOnly value={enlace} onFocus={(ev) => ev.target.select()} style={{ flex: 1, minWidth: 0 }} />
                <button className="btn-secondary" style={{ padding: '0 0.7rem', whiteSpace: 'nowrap' }} title="Copiar este enlace"
                  onClick={() => { navigator.clipboard?.writeText(enlace); setCopiado('un'); }}>{copiado === 'un' ? '✓' : 'Copiar'}</button>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem', marginTop: '0.55rem' }}>
            <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} href={enlace} target="_blank" rel="noopener" title="Abrir el PDF en el visor">Abrir PDF</a>
            <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} title={d?.telefono ? `WhatsApp a ${telBonito(d.telefono)} (el PDF se descarga al pulsar)` : 'El transportista no tiene teléfono en su ficha: se abre sin destinatario'}
              onClick={() => descargarPdf()}
              href={`https://wa.me/${waTel}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">WhatsApp</a>
            <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} title={d?.email ? `Email a ${d.email} (el PDF se descarga al pulsar)` : 'El transportista no tiene email en su ficha: se abre sin destinatario'}
              onClick={() => descargarPdf()}
              href={mailtoHref}>Email</a>
          </div>
          <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>
            Hay UNA sola orden de carga: el documento completo, en {idiomas}. <strong>«Enviar email con el PDF adjunto»</strong> lo
            manda la plataforma con el PDF adjunto de verdad. Los botones de WhatsApp y Email abren el mensaje con el
            transportista ya puesto y <strong>descargan el PDF</strong> para adjuntarlo ahí a mano (ninguno de los dos deja
            adjuntarlo solo). El PDF solo se abre con su enlace completo: lleva la clave.
          </p>
        </>
      )}
    </Modal>
  );
}
