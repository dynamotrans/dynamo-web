'use client';

import { useEffect, useState } from 'react';
import Modal from '../Modal';
import { euros, ventana, fecha, metros, pesoTn } from '@/lib/formato';
import { telBonito, paisDe as nombrePais } from '@/lib/paises';
import { nombreTipo } from '../TipoSitio';
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

// «cp población, país (tipo de sitio)» — el mismo estilo de la proforma (usuario, 2026-11-13).
function dirCorta(p: ParadaFicha): string {
  const pais = nombrePais((p.pais_codigo_iso ?? 'ES').toUpperCase());
  return `${[[p.codigo_postal, p.poblacion].filter(Boolean).join(' '), pais].filter(Boolean).join(', ')} (${nombreTipo(p.sitio?.tipo)})`;
}

export function CompartirOrden({ ficha, onVolver }: { ficha: Ficha; onVolver: () => void }) {
  const e = ficha.envio;
  const [que, setQue] = useState<Que>('conjunta');
  const [d, setD] = useState<{ email: string | null; telefono: string | null; idioma: string; clave: string; bolsa: string | null; codigoBolsa: string | null; clienteEmail: string | null; clienteTelefono: string | null } | null>(null);
  // DOS secciones (usuario, 2026-11-13): al TRANSPORTISTA (orden en PDF, precio, firma)
  // y al CLIENTE (resumen sin precios ni datos internos del transportista).
  const [para, setPara] = useState<'transportista' | 'cliente'>('transportista');
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
  // Mensaje con aire y por bloques (usuario, 2026-11-13): Transportista con CIF, bolsa y
  // contacto · RUTA una parada por línea (cp población, país y tipo de sitio) · DETALLE en
  // líneas · y las copias LISTADAS SIN ENLACE (van adjuntas en PDF al email), con el
  // e-CMR/DeCA digital PRIMERO, que es el único que lleva URL (es una página, no un PDF).
  const cargaTxt = e.fecha_carga_prevista ? `el ${fecha(e.fecha_carga_prevista)}`
    : e.fecha_carga_hasta && e.fecha_carga_hasta !== e.fecha_carga_desde ? ventana(e.fecha_carga_desde, e.fecha_carga_hasta) : `el ${fecha(e.fecha_carga_desde)}`;
  const camionTxt = e.requiere_plataforma_elevadora ? 'Camión rígido con plataforma elevadora (8 m · 14 Tn · altura máx. 2,60 m)' : 'Tráiler tauliner (lona corredera · altura máx. 2,70 m)';
  // El enlace de firma va ARRIBA (lo primero que se ve) y repetido en la lista de abajo
  // (usuario, 2026-11-13); las órdenes van como PDF ADJUNTOS, sin enlace.
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
    que !== 'operativa' && pt != null ? `Precio acordado: ${euros(pt)} (sin IVA)` : null,
    '',
    lineaFirma ? `· ${lineaFirma}` : null,
    lineaFirma ? '' : null,
    ...(que !== 'operativa' ? ['· PDF ADJUNTO DE ORDEN DE CARGA PARA ADMINISTRACIÓN (con precios)'] : []),
    ...(que !== 'economica' ? ['· PDF ADJUNTO DE ORDEN DE CARGA PARA CONDUCTOR (sin precios)'] : []),
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

  // ---- Los PDF se DESCARGAN al pulsar WhatsApp o Email (usuario, 2026-11-13) ---------
  // Fuera el botón de la hoja de compartir del sistema: en escritorio no adjuntaba.
  // Ni el email ni WhatsApp dejan adjuntar un archivo desde un enlace, así que al pulsar
  // cualquiera de los dos se DESCARGAN los PDF de la copia elegida y se abre el mensaje
  // con el transportista ya puesto — los PDF descargados se adjuntan ahí arrastrándolos.
  function descargarPdfs() {
    const lista: [string, string][] = que === 'conjunta'
      ? [[enlOp, 'conductor'], [enlEc, 'administracion']]
      : [[enlace, que === 'operativa' ? 'conductor' : 'administracion']];
    lista.forEach(async ([url, suf]) => {
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        const u = URL.createObjectURL(await r.blob());
        const a = document.createElement('a'); a.href = u; a.download = `Orden-${e.referencia_gx}-${suf}.pdf`; a.click();
        URL.revokeObjectURL(u);
      } catch { /* la descarga nunca rompe la apertura del mensaje */ }
    });
  }

  return (
    <Modal abierto onCerrar={onVolver} titulo={`Orden de carga · #${e.referencia_gx}`}
      sub={ficha.transportista ? `${ficha.transportista.nombre}${d && idioma !== 'es' ? ` · el PDF sale en ${idiomas}` : ''}` : undefined}
      icono={<I d={ICO.doc} />} pie={<button className="btn-ghost" onClick={onVolver}>Volver a la ficha</button>}>
      {error && <div className="pt-aviso error" role="alert"><div>{error}</div></div>}
      {/* A QUIÉN va (usuario, 2026-11-13): transportista o cliente, cada uno con su mensaje. */}
      <div className="tabs" style={{ marginBottom: '0.7rem' }}>
        <button type="button" className={`tab${para === 'transportista' ? ' active' : ''}`} onClick={() => { setPara('transportista'); setCopiado(null); }}>Para el transportista</button>
        <button type="button" className={`tab${para === 'cliente' ? ' active' : ''}`} onClick={() => { setPara('cliente'); setCopiado(null); }}>Para el cliente</button>
      </div>
      {para === 'cliente' && (
        <>
          <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-600)', margin: '0 0 0.6rem' }}>
            El resumen del envío para <strong>el cliente</strong>: sin precios y sin los datos del transportista
            (solo matrículas y conductor), con su enlace de firma del eCMR.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem' }}>
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
      {para === 'transportista' && (<>
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
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.45rem', marginTop: '0.8rem' }}>
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
            <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} title={d?.telefono ? `WhatsApp a ${telBonito(d.telefono)} (los PDF se descargan al pulsar)` : 'El transportista no tiene teléfono en su ficha: se abre sin destinatario'}
              onClick={() => descargarPdfs()}
              href={`https://wa.me/${waTel}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">WhatsApp</a>
            <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} title={d?.email ? `Email a ${d.email} (los PDF se descargan al pulsar)` : 'El transportista no tiene email en su ficha: se abre sin destinatario'}
              onClick={() => descargarPdfs()}
              href={mailtoHref}>Email</a>
          </div>
          <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>
            Al pulsar <strong>WhatsApp</strong> o <strong>Email</strong> se <strong>descargan los PDF</strong> de la copia
            elegida y se abre el mensaje con el transportista ya puesto: <strong>adjunta ahí los PDF descargados</strong>
            (ni el email ni WhatsApp dejan adjuntarlos solos). La copia del conductor no lleva ninguna información económica;
            la económica solo se abre con su enlace completo (lleva la clave).
          </p>
        </>
      )}
      </>)}
    </Modal>
  );
}
