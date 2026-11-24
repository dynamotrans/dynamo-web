'use client';

import { pesoTn, metros, fecha, fechaHora } from '@/lib/formato';

// CMR digital, copiado de firmar-cmr.html: resumen del CMR, un bloque por casilla (22 cada
// recogida · 23 transportista · 24 cada entrega) y la pantalla de firma con el dedo, con el
// documento de identidad validado por país. La firma la guarda el servidor (acciones.ts).
import { Fragment, useEffect, useRef, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import { firmar, pedirCodigoFirma, comprobarCodigoFirma, type DatosFirma } from './acciones';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { DOC_PAISES, validaDoc } from '@/lib/documentoIdentidad';
import { CONTACTO } from '@/lib/atencion';
import CompartirSheet from '@/components/CompartirSheet';
import SubirCmrPapel from './SubirCmrPapel';

// Botón discreto «¿Necesitas ayuda? · Contáctanos» (usuario, 2026-11-11; solo al pie desde el 2026-11-12):
// al final de la página de firmas; al pulsarlo se despliegan llamar, WhatsApp y email.
function Ayuda() {
  const [abierta, setAbierta] = useState(false);
  const chip: React.CSSProperties = { background: '#fff', color: 'var(--gray-700)', border: '1.5px solid var(--gray-300)',
    borderRadius: 10, padding: '0.55rem 0.9rem', font: 'inherit', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none', cursor: 'pointer' };
  return (
    <div style={{ margin: '0.7rem 0', textAlign: 'center' }}>
      {!abierta
        ? <button type="button" style={chip} onClick={() => setAbierta(true)}>¿Necesitas ayuda? · Contáctanos</button>
        : <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a style={chip} href={CONTACTO.telHref}>Llamar · {CONTACTO.telefono}</a>
            <a style={chip} href={CONTACTO.waHref} target="_blank" rel="noreferrer">WhatsApp</a>
            <a style={chip} href={`mailto:${CONTACTO.email}`}>Email</a>
          </div>}
    </div>
  );
}
import type { CmrPublico, ParadaCmr, FirmaCmr, ReservaCmr } from './tipos';
import Req from '@/components/Req';
import { avisaFaltas } from '@/lib/faltas';
import { esImagenReal, tipoRealDeArchivo } from '@/lib/contenidoArchivo';
import { quienFirmo } from '@/lib/firmas';

type Bloque = { clave: string; titulo: string; casilla: string; firmante: string; rol: DatosFirma['rol']; parada_id: string | null; pre: string; preEmail: string; lugar?: string; extra?: boolean;
  // Matrículas al firmar (usuario, 2026-11-11): solo la CABECERA (transportista o
  // cargador de la 1.ª parada) las ve, verifica y corrige; obligatorias salvo manuales.
  conMatricula?: boolean; matObligatoria?: boolean; matCam?: string; matRem?: string;
  // Conjunto articulado: hace falta también la matrícula del semirremolque (Orden FOM/2861/2012, art. 6).
  remObligatoria?: boolean };

// Texto «a marcador» de las cajas verdes: negrita sobre un verde algo más intenso.
const MARCADOR = { background: '#c6f2d9', color: '#0b5c31', padding: '0.05rem 0.3rem', borderRadius: 6, fontWeight: 800 } as const;

export default function FirmarCmr({ token, cmr, trazos }: { token: string; cmr: CmrPublico; trazos: Record<string, string> }) {
  const refrescar = useRefrescar();
  const [abierto, setAbierto] = useState<Bloque | null>(null);
  const [fin, setFin] = useState(false);   // pantalla de «Todo guardado»: sale sola nada más firmar en esta visita
  const [firmasAqui, setFirmasAqui] = useState(0);   // firmas hechas en esta visita: en cada una la caja verde vuelve a la vista
  const [copiaYa, setCopiaYa] = useState(true);   // ¿se le ha mandado ya su copia a quien acaba de firmar? (al transportista que firma con el email de su empresa, no: solo la final)
  // Firma EXTRA (usuario, 2026-11-09): hasta 3 además de las casillas de siempre. Se elige
  // la casilla y se abre la pantalla de firma normal; no ocupa la casilla ni anota reservas.
  const [eligiendoExtra, setEligiendoExtra] = useState(false);
  // Solo tras FIRMAR en esta visita (usuario, 2026-11-10): quien entra a mirar sin firmar
  // nada no ve el botón de salir.
  const [compartir, setCompartir] = useState(false);     // ventana de compartir propia (mismo diseño en cualquier aparato)
  const [compartirPdf, setCompartirPdf] = useState(false);   // compartir el PDF del CMR con las firmas actuales (pantalla de «todo guardado»)
  // ABIERTA EN UN ORDENADOR (usuario, 2026-11-15): arriba, un QR de esta misma página para
  // firmar con el dedo en el móvil. Ordenador = ratón fino con hover, pantalla ancha y sin
  // marca de móvil/tableta en el navegador. En el móvil no sale nada (se decide al montar,
  // así el HTML del servidor es el mismo para todos).
  const [qrMovil, setQrMovil] = useState<string | null>(null);
  useEffect(() => {
    const raton = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const movil = /Mobi|Android|iPhone|iPad|iPod|Tablet/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));   // iPad «de escritorio»
    if (!raton || movil || window.innerWidth < 768) return;
    let vivo = true;
    import('qrcode').then(({ default: QR }) => QR.toDataURL(window.location.href, { margin: 0, width: 360, color: { dark: '#0a0230', light: '#ffffff' } }))
      .then((u) => { if (vivo) setQrMovil(u); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  // Al salir la pantalla de «Todo guardado» se lleva a la vista: quien acaba de firmar puede
  // estar abajo del todo, en la casilla que firmó.
  useEffect(() => {
    if (fin) requestAnimationFrame(() => document.getElementById('cmr-guardado')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [fin, firmasAqui]);
  const [masInfo, setMasInfo] = useState(false);          // despliegue del detalle legal (eIDAS / FOM)
  // Aviso con tono de ALERTA antes de abrir la pantalla de firma (usuario, 2026-11-10):
  // quién firma y que el dispositivo queda registrado; «De acuerdo» sigue, «Cancelar» no.
  const [preFirma, setPreFirma] = useState<Bloque | null>(null);
  // Ventana al pulsar una firma en gris (usuario, 2026-11-13): el aviso, en claro.
  const [avisoSinTra, setAvisoSinTra] = useState(false);
  const [avisoSinMat, setAvisoSinMat] = useState(false);
  // Con una ventana abierta, el FONDO no scrollea. En iOS Safari «overflow: hidden» no
  // basta (el teclado sobre la pantalla de firma scrolleaba la página de detrás y le
  // dejaba un hueco enorme al final; usuario, 2026-11-10 ×2): se FIJA el body en su
  // sitio (position: fixed) mientras la ventana está abierta y, al cerrarla, se
  // devuelve el scroll acotado a la altura real, que borra el hueco fantasma.
  const hayVentana = !!(abierto || preFirma);
  useEffect(() => {
    if (!hayVentana) return;
    const html = document.documentElement, b = document.body, y = window.scrollY;
    html.style.overflow = 'hidden';
    b.style.position = 'fixed'; b.style.top = `-${y}px`; b.style.left = '0'; b.style.right = '0'; b.style.width = '100%';
    return () => {
      html.style.overflow = ''; b.style.position = ''; b.style.top = ''; b.style.left = ''; b.style.right = ''; b.style.width = '';
      window.scrollTo(0, Math.min(y, Math.max(0, html.scrollHeight - window.innerHeight)));
    };
  }, [hayVentana]);

  if (cmr.resultado !== 'ok') {
    const t: Record<string, [string, string]> = {
      enlace_no_valido: ['Este enlace no es válido', 'Ha caducado o se ha retirado. Pide uno nuevo a quien te lo envió.'],
      cancelado: ['Este envío está cancelado', 'Ya no hace falta firmar su CMR.'],
      mantenimiento: ['Plataforma en mantenimiento', `Vuelve a intentarlo en un rato. Si es urgente, llámanos al ${CONTACTO.telefono}.`],
      error: ['No se puede abrir ahora mismo', 'Vuelve a intentarlo en un momento.'],
    };
    const [h, p] = t[cmr.resultado ?? 'error'] ?? t.error;
    return <div className="card"><div className="brand"><img src="/images/2.png" alt="Dynamo" /></div><h1>{h}</h1><p className="sub">{p}</p></div>;
  }

  // Envío manual (usuario, 2026-11-14): sin firma digital de CMR — la plataforma no
  // archiva documentación de transportes en los que no interviene. Sin marca de Dynamo.
  if (cmr.manual) {
    return <div className="card"><h1>Firma digital no disponible</h1><p className="sub">Este envío es una contratación directa entre el ordenante y su transportista: la carta de porte (CMR) y el documento de control (DeCA) se gestionan entre las partes, fuera de esta plataforma.</p><p className="sub">Puedes <a href={`/cmr/${token}/pdf`} target="_blank" rel="noopener" style={{ fontWeight: 700 }}>descargar el CMR en PDF</a> para imprimirlo y firmarlo a mano.</p></div>;
  }

  const paradas: ParadaCmr[] = cmr.paradas ?? [];
  const rec = paradas.filter((p) => p.tipo === 'carga'), ent = paradas.filter((p) => p.tipo === 'descarga');
  const lugar = (p: ParadaCmr | undefined) => [p?.nombre_empresa, [p?.codigo_postal, p?.poblacion].filter(Boolean).join(' '), p?.provincia !== p?.poblacion ? p?.provincia : null].filter(Boolean).join(' · ');
  // Matrículas al firmar (usuario, 2026-11-11): la CABECERA — el cargador de la 1.ª
  // parada del recorrido y el transportista — las verifica, corrige o, si faltan, las
  // pone (obligatorias salvo en envíos manuales). El resto ya está en tránsito.
  const primera = paradas[0]?.id ?? null;
  const mat = { conMatricula: true, matObligatoria: !cmr.manual, matCam: cmr.matricula_camion ?? '', matRem: cmr.matricula_remolque ?? '', remObligatoria: !cmr.manual && cmr.necesita_remolque !== false };
  const bloques: Bloque[] = [
    ...rec.map((p, i) => ({ clave: `remitente:${p.id}`, titulo: `Recogida ${rec.length + ent.length > 2 ? i + 1 : ''}`.trim(), casilla: 'Casilla 22 · firma y sello', firmante: 'Remitente / Cargador', rol: 'remitente' as const, parada_id: p.id, pre: p.contacto ?? '', preEmail: p.email ?? '', lugar: lugar(p), ...(p.id === primera ? mat : {}) })),
    { clave: 'transportista:', titulo: 'Transportista', casilla: 'Casilla 23 · firma y sello', firmante: 'Porteador / Transportista', rol: 'transportista', parada_id: null, pre: cmr.conductor ?? '', preEmail: cmr.transportista_email ?? '', lugar: cmr.transportista ?? undefined, ...mat },
    ...ent.map((p, i) => ({ clave: `destinatario:${p.id}`, titulo: `Entrega ${rec.length + ent.length > 2 ? rec.length + i + 1 : ''}`.trim(), casilla: 'Casilla 24 · recibí de la mercancía', firmante: 'Destinatario', rol: 'destinatario' as const, parada_id: p.id, pre: p.contacto ?? '', preEmail: p.email ?? '', lugar: lugar(p) })),
  ];
  const firmas = new Map<string, FirmaCmr>((cmr.firmas ?? []).filter((f) => !f.extra).map((f) => [`${f.rol}:${f.parada_id ?? ''}`, f]));
  // Las PENDIENTES arriba y las ya firmadas debajo (usuario, 2026-11-14), cada grupo en
  // su orden de recorrido (recogidas → transportista → entregas). El selector de la firma extra sigue
  // listando las casillas en el orden natural del recorrido.
  const pendientesVista = bloques.filter((b) => !firmas.has(b.clave));
  const firmadasVista = bloques.filter((b) => firmas.has(b.clave));
  // TRAS FIRMAR sale directamente la pantalla de «Todo guardado» (usuario, 2026-11-17: sin el
  // botón intermedio «Está todo guardado · Terminar»): gracias y el PDF del eCMR al día para
  // verlo o compartirlo. Sin botón de «Seguir en la hoja de firmas»: la caja no tapa nada,
  // las casillas siguen debajo y se firma sin más. No se lleva a nadie a la web pública.
  // Solo tras firmar en esta visita.
  const btnFin = fin ? (
    <div style={{ background: '#ecfdf5', border: '2px solid #1d9e57', borderRadius: 14, padding: '1.2rem 1rem', textAlign: 'center' }}>
      <div aria-hidden="true" style={{ width: 54, height: 54, margin: '0 auto 0.6rem', borderRadius: '50%', background: '#1d9e57', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.7rem', fontWeight: 800 }}>✓</div>
      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#065f46' }}>Todo guardado. ¡Gracias!</div>
      {/* Lo importante, a marcador (usuario, 2026-11-17). Al transportista que firma con el
          email de su empresa no se le manda copia en cada firma, solo la final: se lo dice así. */}
      <p style={{ margin: '0.35rem 0 0.9rem', color: '#047857', fontWeight: 600, lineHeight: 1.6 }}>
        Cada firma queda registrada en el CMR al momento.{' '}
        {copiaYa
          ? <><strong style={MARCADOR}>Se te ha enviado una copia con las firmas a tu e-mail;</strong>{' '}
              <strong style={MARCADOR}>la copia final te llegará por email</strong> cuando firmen todos.</>
          : <><strong style={MARCADOR}>La copia final llegará al email de tu empresa</strong> cuando firmen todos.
              Si la quieres tú ahora, ábrela o compártela aquí debajo.</>}
      </p>
      <a className="firma-btn" href={`/cmr/${token}/pdf`} target="_blank" rel="noopener" style={{ display: 'block', width: '100%', background: '#1d9e57', textAlign: 'center', textDecoration: 'none',
        padding: '1rem 1.1rem', fontSize: '1.08rem', borderRadius: 12, boxShadow: '0 4px 14px rgba(29,158,87,0.35)' }}>
        Ver el CMR en PDF · con las firmas actuales
      </a>
      {/* COMPARTIR el PDF con las firmas actuales, justo debajo del de abrirlo (usuario,
          2026-11-16): WhatsApp, email, SMS, copiar… Así el conductor se lo lleva sin
          dejar su email. */}
      <button type="button" onClick={() => setCompartirPdf(true)} style={{ display: 'block', width: '100%', marginTop: '0.6rem', padding: '0.85rem 1rem', borderRadius: 12, textAlign: 'center',
        background: '#fff', border: '2px solid #1d9e57', color: '#065f46', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }}>
        Compartir el CMR en PDF · WhatsApp, email…
      </button>
      {/* NO se saca a nadie de la hoja de firmas (usuario, 2026-11-16; antes había un
          «Salir» que llevaba a la web): puede firmar otra persona aquí mismo, o volver a
          entrar más tarde con el mismo enlace para ver cómo van las firmas. */}
      <p style={{ margin: '0.8rem 0 0', color: '#047857', fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.4 }}>
        No hace falta salir: puede firmar otra persona aquí mismo, y puedes volver a entrar con este mismo enlace cuando quieras para ver cómo van las firmas.
      </p>
    </div>
  ) : null;
  const extras = (cmr.firmas ?? []).filter((f) => f.extra);
  const hechas = bloques.filter((b) => firmas.has(b.clave)).length;
  // SIN TRANSPORTISTA NO SE FIRMA (usuario, 2026-11-10): sin camión asignado no se puede
  // estar cargando. La base de datos lo rechaza igualmente (sin_transportista); aquí los
  // botones quedan bloqueados con el porqué. Las firmas ya hechas se quedan, y la página
  // está EN VIVO: al asignar (o reasignar) transportista se desbloquea sola. En envíos
  // manuales el porteador es el operador del cliente: no aplica.
  const sinTransportista = !cmr.manual && !cmr.transportista;
  // SIN MATRÍCULAS TAMPOCO (usuario, 2026-11-15): solo la casilla de CABECERA (transportista
  // o cargador de la 1.ª recogida) se puede firmar, porque es justo donde se ponen. Las demás
  // y las firmas extra esperan a que haya matrícula. La base de datos lo exige igualmente.
  // Un tráiler lleva DOS matrículas: sin la del semirremolque tampoco (2026-11-15).
  const sinMatricula = !cmr.manual && (!cmr.matricula_camion || (!!cmr.necesita_remolque && !cmr.matricula_remolque));
  // FIRMA CERRADA (usuario, 2026-11-22): 3 días después de la entrega en la última parada ya
  // no se firma (la base de datos lo rechaza igualmente): la hoja queda para ver y descargar.
  const cerrada = cmr.firma_abierta === false;
  const bloqueado = (b: Bloque) => sinTransportista || (sinMatricula && !b.conMatricula);
  const avisar = () => { if (sinTransportista) setAvisoSinTra(true); else setAvisoSinMat(true); };
  const nombreBloque = (f: FirmaCmr) => bloques.find((b) => b.rol === f.rol && (f.rol === 'transportista' || b.parada_id === f.parada_id))?.titulo
    ?? (f.rol === 'remitente' ? 'Recogida' : f.rol === 'transportista' ? 'Transportista' : 'Entrega');

  const cabecera = (<>
      {!cmr.manual && <div className="brand"><img src="/images/2.png" alt="Dynamo" /></div>}
      {/* Cabecera en caja gris suave y formal (usuario, 2026-11-11). */}
      {/* Cabecera corta (usuario, 2026-11-12): título y nº de envío, sin más. */}
      <div className="cab-caja">
        <h1>CMR digital</h1>
        <p className="sub">Envío <strong>{cmr.referencia}</strong></p>
      </div>
  </>);
  const datosEnvio = (
      <dl className="cmrbox">
        <dt>Remitente</dt><dd>{cmr.remitente || '—'}</dd>
        <dt>Porteador</dt><dd>{cmr.porteador || '—'}</dd>
        {(cmr.transportista || cmr.matricula) && <><dt>Transportista efectivo</dt><dd>{[cmr.transportista, cmr.matricula].filter(Boolean).join(' · ')}</dd></>}
        {/* Sin las filas de Recogida/Entrega (usuario, 2026-11-13): cada casilla de firma
            ya enseña su empresa en grande y aquí se repetían. */}
        <dt>Fecha de carga</dt><dd>{fecha(cmr.fecha_carga)}</dd>
        <dt>Mercancía</dt><dd>{[cmr.mercancia, cmr.metros_lineales != null && `${metros(cmr.metros_lineales)}`, cmr.toneladas != null && pesoTn(cmr.toneladas)].filter(Boolean).join(' · ') || '—'}</dd>
        {cmr.adr && <div className="adr">⚠ MERCANCÍA ADR (peligrosa) — transporte sujeto al Acuerdo ADR</div>}
      </dl>
  );
  const avisoSinTransportista = (
        <div style={{ background: '#fff7e6', border: '1.5px solid #ffd591', color: '#8a5a00', borderRadius: 12, padding: '0.9rem 1rem', margin: '0 0 0.8rem', fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.5, textAlign: 'center' }}>
          Todavía no se puede firmar: el envío <strong>no tiene transportista asignado</strong> (sin camión no se puede estar cargando).
          En cuanto se asigne, las firmas se abren solas en esta misma página.
        </div>
  );
  // SIN TRANSPORTISTA Y SIN NADA FIRMADO (usuario, 2026-11-15): no tiene sentido enseñar
  // las casillas de firma, ni el «mándasela», ni el contador: solo la cabecera, los datos
  // del envío y el aviso. En cuanto se asigne, la página en vivo pinta lo demás.
  if (sinTransportista && hechas === 0 && extras.length === 0) {
    return (
      <div className="card">
        {cabecera}
        {datosEnvio}
        <div style={{ marginTop: '0.8rem' }}>{avisoSinTransportista}</div>
        <Ayuda />
      </div>
    );
  }

  return (
    <div className="card">
      {cabecera}
      {qrMovil && !cerrada && (
        <section className="qr-movil" aria-label="Firmar desde el móvil">
          <div className="qr-movil-img"><img src={qrMovil} alt="Código QR de esta página" width={132} height={132} /></div>
          <div className="qr-movil-txt">
            <span className="qr-movil-eti">Estás en un ordenador</span>
            <h2>Firma desde tu móvil, es más cómodo</h2>
            <p>Escanea el código con la cámara del móvil: se abre <strong>esta misma página</strong> y firmas con el dedo. Sin apps ni cuenta.</p>
            <button type="button" className="sig-link" onClick={() => setCompartir(true)}>O mándala por WhatsApp o email</button>
          </div>
        </section>
      )}
      {datosEnvio}
      {/* Ventana de compartir PROPIA (usuario, 2026-11-11): mismo diseño sencillo en
          cualquier aparato — WhatsApp, Email, SMS, Copiar y «Más opciones…» si el
          aparato tiene hoja de compartir del sistema. Mensaje corto. */}
      {(avisoSinTra || avisoSinMat) && (
        <div role="alertdialog" aria-modal="true" aria-label="Todavía no se puede firmar" onClick={() => { setAvisoSinTra(false); setAvisoSinMat(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,2,48,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.2rem' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: '1.3rem 1.2rem', maxWidth: 380, width: '100%', textAlign: 'center', boxShadow: '0 24px 60px rgba(10,2,48,0.35)' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '0.25rem' }} aria-hidden="true">⚠️</div>
            <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>Todavía no se puede firmar</h2>
            <p style={{ margin: '0 0 0.9rem', fontSize: '0.9rem', color: '#4b5563', lineHeight: 1.5 }}>
              {avisoSinTra
                ? <>El envío <strong>no tiene transportista asignado</strong> (sin camión no se puede estar cargando).
                    En cuanto se asigne, las firmas se abren solas en esta misma página.</>
                : <>El envío <strong>todavía no tiene {cmr.matricula_camion ? 'la matrícula del semirremolque' : 'las matrículas del camión'}</strong>. Se ponen al firmar la casilla del
                    <strong> transportista</strong> (o la del cargador de la 1.ª recogida); después se abren las demás firmas.</>}
            </p>
            <button type="button" className="firma-btn" style={{ width: '100%', padding: '0.95rem 1rem', fontSize: '1.05rem', borderRadius: 12 }}
              onClick={() => { setAvisoSinTra(false); setAvisoSinMat(false); }}>De acuerdo</button>
          </div>
        </div>
      )}
      {compartirPdf && (
        <CompartirSheet onCerrar={() => setCompartirPdf(false)} url={`${window.location.origin}/cmr/${token}/pdf`}
          titulo={`CMR del envío #${cmr.referencia ?? ''}${cmr.manual ? '' : ' · Dynamo'}`}
          texto={`CMR del envío #${cmr.referencia ?? ''}${cmr.manual ? '' : ' · Dynamo'}, con las firmas actuales (PDF):`} />
      )}
      {compartir && (
        <CompartirSheet onCerrar={() => setCompartir(false)} url={window.location.href}
          titulo={`CMR del envío #${cmr.referencia ?? ''}${cmr.manual ? '' : ' · Dynamo'}`}
          texto={`CMR del envío #${cmr.referencia ?? ''}${cmr.manual ? '' : ' · Dynamo'}\nFirma tu casilla con el dedo aquí:`} />
      )}
      {/* Con TODO firmado, el contador va en caja verde y debajo se repite la de
          «CMR completamente firmado» (usuario, 2026-11-12) — la del pie se queda. */}
      {/* Con todas firmadas, SOLO el banner (usuario, 2026-11-14: el contador «5 de 5»
          sobra cuando ya lo dice el mensaje de CMR completamente firmado). */}
      {hechas === bloques.length && bloques.length > 0
        ? <div className="banner-ok show" style={{ marginTop: 0, marginBottom: '0.8rem' }}>✓ CMR completamente firmado — todas las partes han quedado registradas.</div>
        : <div className="prog">{hechas} de {bloques.length} firmas completadas</div>}
      {cerrada && (
        <div data-firma-cerrada="" style={{ background: '#f3f4f6', border: '1.5px solid #d1d5db', color: 'var(--gray-700)', borderRadius: 12, padding: '0.9rem 1rem', margin: '0 0 0.8rem', fontSize: '1rem', lineHeight: 1.5, textAlign: 'center' }}>
          <strong>El plazo para firmar este CMR se cerró{cmr.firma_hasta ? ` el ${fechaHora(cmr.firma_hasta)}` : ''}</strong> (3 días después de la entrega).
          Ya no se pueden añadir firmas ni reservas: aquí puedes ver las que hay y descargar el CMR.
          <a className="firma-btn" href={`/cmr/${token}/pdf`} target="_blank" rel="noopener" style={{ display: 'block', width: '100%', marginTop: '0.7rem', background: '#1d9e57', textAlign: 'center', textDecoration: 'none', padding: '0.85rem 1rem', borderRadius: 12 }}>
            Descargar el CMR en PDF
          </a>
        </div>
      )}
      {!cerrada && cmr.firma_hasta && hechas < bloques.length && (
        <div style={{ background: '#fff7e6', border: '1.5px solid #ffd591', color: '#8a5a00', borderRadius: 12, padding: '0.7rem 0.85rem', margin: '0 0 0.8rem', fontSize: '0.9rem', fontWeight: 700, lineHeight: 1.45, textAlign: 'center' }}>
          Envío entregado: se puede firmar hasta el {fechaHora(cmr.firma_hasta)}. Después, el CMR solo se podrá ver y descargar.
        </div>
      )}
      {!cerrada && sinTransportista && hechas < bloques.length && avisoSinTransportista}
      {!cerrada && !sinTransportista && sinMatricula && hechas < bloques.length && (
        <div style={{ background: '#fff7e6', border: '1.5px solid #ffd591', color: '#8a5a00', borderRadius: 12, padding: '0.7rem 0.85rem', margin: '0 0 0.8rem', fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.45 }}>
          {cmr.matricula_camion ? <>Falta la <strong>matrícula del semirremolque</strong> (un tráiler lleva las dos)</> : <>Faltan las <strong>matrículas del camión</strong></>}: primero firma el transportista (o el cargador de la 1.ª recogida) poniéndolas;
          después se abren las demás firmas en esta misma página.
        </div>
      )}
      {fin && <div id="cmr-guardado" style={{ margin: '0 0 0.8rem' }}>{btnFin}</div>}
      {/* Caja AZUL con la misma cabecera que la hoja del panel: qué es esto y su validez
          legal, con el detalle eIDAS/FOM desplegable. JUSTO delante de la primera caja
          de firma (usuario, 2026-11-12), que es cuando toca leerla. */}
      <div style={{ margin: '0 0 0.8rem', background: '#eef2ff', border: '1.5px solid #c7d2fe', borderRadius: 12, padding: '0.7rem 0.85rem', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy)' }}>Firmen el CMR con el dedo desde el móvil, sin crear cuenta</p>
        <button type="button" onClick={() => setMasInfo((v) => !v)} aria-expanded={masInfo}
          style={{ margin: '0.25rem 0 0', padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: 'var(--purple)' }}>
          100% seguro, digital y legal. Protocolo eIDAS. {masInfo ? '▴' : '▾'}
        </button>
        {masInfo && (
          <div style={{ marginTop: '0.5rem', textAlign: 'left', fontSize: '0.78rem', color: 'var(--gray-700)', lineHeight: 1.5 }}>
            <p style={{ margin: '0 0 0.45rem' }}>
              e-CMR con <strong>firma electrónica simple eIDAS</strong>, reforzada con evidencias de identidad, tiempo y ubicación (<strong>audit trail</strong>):
              documento del firmante con letra validada, hora del servidor, IP, GPS con dirección y huella SHA-256 de lo firmado. El Reglamento eIDAS
              (UE 910/2014, <strong>art. 25</strong>) impide negarle efectos jurídicos: es <strong>admisible como prueba ante organismos, peritos y
              tribunales</strong>; y el <strong>Protocolo e-CMR</strong> (Ginebra, 2008), ratificado por España y decenas de países, reconoce
              <strong> internacionalmente</strong> la carta de porte electrónica.
            </p>
            <p style={{ margin: 0 }}>
              El <strong>documento de control (DeCA)</strong> de la Orden FOM/2861/2012 es <strong>otro documento</strong>, sin firmas: el transportista
              lo recibe aparte, con su propio QR. En transporte <strong>internacional</strong> rige el Convenio CMR (Ginebra, 19-may-1956) y no se exige DeCA.
            </p>
          </div>
        )}
      </div>
      {/* JUSTO DESPUÉS de la caja azul (usuario, 2026-11-17): quien no quiera firmar en el
          móvil sube aquí las fotos del CMR / carta de porte firmada en papel. */}
      <SubirCmrPapel token={token} />
      {[...pendientesVista, ...firmadasVista].map((b) => {
        const f = firmas.get(b.clave);
        // Toda la caja de una firma PENDIENTE es pulsable (usuario, 2026-11-11): abre el
        // mismo flujo que el botón «Firmar» (el botón se queda, de señal visual).
        const pulsable = !f && !cerrada;
        return (<Fragment key={b.clave}>
          <div className={`firma firma-rol-${b.rol}${f ? ' firmada' : ''}${pulsable ? ' firma-pulsable' : ''}`}
            onClick={pulsable ? (ev) => { if (!(ev.target as HTMLElement).closest('button')) { if (bloqueado(b)) avisar(); else setPreFirma(b); } } : undefined}>
            <div className="firma-head">
              <div className="firma-tit">{b.titulo}<span className="cas-quien"><span className="cas-firma">Firma:</span> {b.firmante}</span>{b.lugar && <span className="cas-lugar">{b.lugar}</span>}<span className="cas">{b.casilla}</span></div>
              {!f && !cerrada && <button type="button" className={`firma-btn${bloqueado(b) ? ' firma-btn-gris' : ''}`}
                onClick={() => { if (bloqueado(b)) avisar(); else setPreFirma(b); }}>Firmar</button>}
            </div>
            {/* El transportista con sus matrículas a la vista (usuario, 2026-11-11):
                arriba ya sale su nombre y aquí también; si faltan, en rojo. */}
            {b.rol === 'transportista' && (sinTransportista
              ? <div className="firma-estado" style={{ color: '#b91c1c', fontWeight: 800 }}>⚠ Falta transportista</div>
              : cmr.matricula_camion
                ? <div className="firma-estado">Matrículas: <strong>{[cmr.matricula_camion, cmr.matricula_remolque].filter(Boolean).join(' / ')}</strong></div>
                : !cmr.manual && <div className="firma-estado" style={{ color: '#b91c1c', fontWeight: 800 }}>⚠ Faltan matrículas — se piden al firmar</div>)}
            {f ? <>
              {trazos[f.ruta] && <div className="firma-img"><img src={trazos[f.ruta]} alt="Firma" /></div>}
              {/* Firmó en papel (CMR bis): no hay trazo; el papel va anexo y completa este CMR. */}
              <div className="firma-estado">{f.en_papel ? '✓ Firmada EN PAPEL (CMR bis anexo, que completa este CMR) · registrada el' : '✓ Firmada el'} {fechaHora(f.firmado_en)} · {quienFirmo(f)}{f.documento_pais && f.documento_pais !== 'XX' ? ` (${f.documento_pais})` : ''}{f.email_verificado ? ' · email verificado' : ''}</div>
            </> : <div className="firma-estado">{cerrada ? 'Sin firmar (el plazo de firma ya se cerró)' : 'Pendiente de firma'}</div>}
            {(cmr.reservas ?? []).filter((r: ReservaCmr) => r.rol === b.rol && (b.rol === 'transportista' || r.parada_id === b.parada_id)).map((r: ReservaCmr, i: number) => (
              <div key={i} className="firma-estado" style={{ color: '#b91c1c', fontWeight: 700 }}>⚠ Reservas: {r.texto}</div>
            ))}
          </div>
        </Fragment>);
      })}
      {extras.map((f, i) => (
        <div key={`x${i}`} className="firma firmada">
          <div className="firma-head">
            <div className="firma-tit">Firma extra {extras.length > 1 ? i + 1 : ''}<span className="cas-quien"><span className="cas-firma">Firma:</span> {nombreBloque(f)}</span><span className="cas">Añadida a las casillas del CMR</span></div>
          </div>
          {trazos[f.ruta] && <div className="firma-img"><img src={trazos[f.ruta]} alt="Firma" /></div>}
          <div className="firma-estado">✓ Firmada el {fechaHora(f.firmado_en)} por {f.nombre} · {f.documento}{f.documento_pais && f.documento_pais !== 'XX' ? ` (${f.documento_pais})` : ''}{f.email_verificado ? ' · email verificado' : ''}</div>
        </div>
      ))}
      {extras.length < 3 && !cerrada && (
        <div className="firma">
          {eligiendoExtra ? (
            <>
              <div className="firma-tit" style={{ marginBottom: '0.45rem' }}>¿De qué casilla es la firma extra?</div>
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {bloques.map((b) => (
                  <button key={`eb${b.clave}`} type="button" className="firma-btn" style={{ width: '100%' }}
                    onClick={() => { setEligiendoExtra(false); setPreFirma({ ...b, clave: `extra:${b.clave}`, titulo: `Firma extra · ${b.titulo}`, extra: true }); }}>
                    {b.titulo} · {b.firmante}{b.lugar ? ` · ${b.lugar.split(' · ')[0]}` : ''}
                  </button>
                ))}
                <button type="button" className="firma-btn" style={{ width: '100%', background: '#fff', color: 'var(--gray-700)', border: '1.5px solid var(--gray-300)' }} onClick={() => setEligiendoExtra(false)}>Cancelar</button>
              </div>
            </>
          ) : (
            <div className="firma-head">
              <div className="firma-tit">Firma extra<span className="cas">Otra persona que también firma (hasta 3): elige su casilla y firma como siempre</span></div>
              <button type="button" className={`firma-btn${sinTransportista || sinMatricula ? ' firma-btn-gris' : ''}`}
                onClick={() => { if (sinTransportista || sinMatricula) avisar(); else setEligiendoExtra(true); }}>+ Añadir</button>
            </div>
          )}
        </div>
      )}
      <div className={`banner-ok${hechas === bloques.length ? ' show' : ''}`}>✓ CMR completamente firmado — todas las partes han quedado registradas.</div>
      {/* EL PIE (usuario, 2026-11-17): la caja de «también pueden firmar aquí», con su botón
          de compartir la página, y debajo el texto legal. «Compartir el CMR en PDF» ya NO
          sale aquí, antes de firmar: solo en la pantalla de «Todo guardado», tras firmar. */}
      {/* En caja verde y con el texto más claro y algo más grande (usuario, 2026-11-11);
          lo de firmar en este mismo móvil, resaltado a marcador (usuario, 2026-11-12). */}
      {!cerrada && (
      <div style={{ margin: '0.8rem 0 0', background: '#eafaf0', border: '1.5px solid #b7ebcd', color: '#0f6b3a', borderRadius: 12,
        padding: '0.65rem 0.85rem', fontSize: '0.95rem', fontWeight: 600, textAlign: 'center', lineHeight: 1.5 }}>
        Cargador, transportista y destinatario ya la han recibido igual que tú, y{' '}
        <strong style={{ background: '#c6f2d9', color: '#0b5c31', padding: '0.05rem 0.3rem', borderRadius: 6, fontWeight: 800 }}>
          también pueden firmar aquí, en {qrMovil ? 'esta misma página' : 'tu móvil'}.
        </strong>{' '}
        Si alguien quiere firmar en su móvil, mándasela:
        {/* Botón de verdad dentro de la caja (usuario, 2026-11-16; antes era el enlace
            «pulsando aquí»): abre la hoja de compartir (WhatsApp, Email, SMS, Copiar…). */}
        <button type="button" className="firma-btn" onClick={() => setCompartir(true)}
          style={{ display: 'block', width: '100%', margin: '0.55rem 0 0.1rem', background: '#1d9e57', textAlign: 'center', padding: '0.8rem 1rem', fontSize: '1rem', borderRadius: 12 }}>
          Compartir página de firmas eCMR
        </button>
      </div>
      )}
      <p className="foot">Cada firma queda registrada con la fecha y la hora del servidor, el documento de quien firma y desde dónde se firmó (y tu ubicación GPS si das permiso). Firma electrónica simple (Reglamento eIDAS).</p>
      <Ayuda />
      {preFirma && (
        <div role="alertdialog" aria-modal="true" aria-label="Aviso antes de firmar"
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,2,48,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.2rem' }}>
          {/* AVISO DURO Y DIRECTO (usuario, 2026-11-17: «más recto y duro, con ley, delito penal,
              suplantación»): qué queda registrado y, en caja roja, la ADVERTENCIA PENAL con el
              delito, sus artículos y su pena. Lo que se afirma es lo que se puede sostener: ni
              «serás procesado» ni «irrefutable» (eso lo decide un juez). */}
          <div style={{ background: '#fff', borderRadius: 18, padding: '1.2rem 1.1rem', maxWidth: 400, width: '100%', maxHeight: '92vh', overflowY: 'auto', textAlign: 'center', boxShadow: '0 24px 60px rgba(10,2,48,0.35)', borderTop: '6px solid #b91c1c' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ margin: '0 auto 0.45rem', display: 'block' }}>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h2 style={{ margin: '0 0 0.2rem', fontSize: '1.08rem' }}>Vas a firmar como {preFirma.firmante}</h2>
            {/* Quién y dónde, BIEN legible (usuario, 2026-11-17: «está enano»): es lo que hay que
                comprobar antes de firmar. */}
            <p style={{ margin: '0.15rem 0 0.8rem', fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy)', lineHeight: 1.3 }}>{preFirma.titulo}{preFirma.lugar ? ` · ${preFirma.lugar}` : ''}</p>
            <p style={{ margin: '0 0 0.7rem', fontSize: '0.88rem', color: '#1f2937', lineHeight: 1.5, textAlign: 'left' }}>
              La firma queda <strong>asociada a ti</strong> y guardada como prueba: estamos registrando <strong>tu IP</strong>, <strong>tu dispositivo</strong>,
              la <strong>fecha y la hora</strong>, tu ubicación (si das permiso) y los <strong>datos que introduzcas</strong>.
            </p>
            <div id="aviso-legal-firma" style={{ background: '#fef2f2', border: '2px solid #b91c1c', borderRadius: 12, padding: '0.75rem 0.8rem', margin: '0 0 0.9rem', textAlign: 'left', color: '#1f2937', fontSize: '0.88rem', lineHeight: 1.5 }}>
              <strong style={{ color: '#b91c1c' }}>ADVERTENCIA PENAL:</strong> si no eres el titular,{' '}
              <strong style={{ color: '#b91c1c', fontSize: '1rem' }}>NO FIRMES</strong>. Firmar por otra persona es{' '}
              <strong>suplantación de identidad y falsedad documental</strong>: un <strong>delito</strong> castigado con{' '}
              <strong style={{ color: '#b91c1c' }}>prisión de seis meses a tres años</strong> (arts. 390 y 392 del Código Penal).
              El rastro de tu dispositivo <strong>se pondrá a disposición de las autoridades</strong> y <strong>denunciaremos cualquier fraude</strong>.
            </div>
            <button type="button" className="firma-btn" style={{ width: '100%', marginBottom: '0.5rem', padding: '0.95rem 1rem', fontSize: '1.05rem', borderRadius: 12 }}
              onClick={() => { setAbierto(preFirma); setPreFirma(null); }}>Firmar</button>
            <button type="button" className="firma-btn" style={{ width: '100%', background: '#fff', color: 'var(--gray-700)', border: '1.5px solid var(--gray-300)', padding: '0.95rem 1rem', fontSize: '1.05rem', borderRadius: 12 }}
              onClick={() => setPreFirma(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {abierto && <PantallaFirma token={token} b={abierto} onCerrar={() => setAbierto(null)} onFirmado={(copia) => { setAbierto(null); setCopiaYa(copia); setFin(true); setFirmasAqui((n) => n + 1); refrescar(); }} />}
    </div>
  );
}

function PantallaFirma({ token, b, onCerrar, onFirmado }: { token: string; b: Bloque; onCerrar: () => void; onFirmado: (copiaEnviada: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ctx = useRef<CanvasRenderingContext2D | null>(null);
  const trazando = useRef(false);
  const [dibujado, setDibujado] = useState(false);
  const [pais, setPais] = useState('ES');
  const [doc, setDoc] = useState('');
  const [nombre, setNombre] = useState(b.pre);
  // Precargado con el del primer contacto de la ficha (sitio de la parada o transportista);
  // si la ficha no tenía ninguno y quien firma lo escribe, el servidor lo guarda en ella.
  const [email, setEmail] = useState(b.preEmail);
  // TRANSPORTISTA (usuario, 2026-11-16): su empresa ya tiene el email en su ficha, así
  // que aquí se ENSEÑA y no se edita. A él va la copia final, al terminar el transporte.
  // El conductor que quiera el CMR en su móvil se lo manda con «Compartir» tras firmar.
  const emailEmpresa = b.rol === 'transportista' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((b.preEmail ?? '').trim()) ? (b.preEmail ?? '').trim() : null;
  // Y un email PROPIO, opcional (usuario, 2026-11-17): si quien firma por el transportista lo
  // pone, también él recibe la copia —la de ahora y la final—, además de su empresa.
  const [emailPropio, setEmailPropio] = useState('');
  const propio = emailPropio.trim().toLowerCase();
  const propioVale = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(propio) && propio !== (emailEmpresa ?? '').toLowerCase();
  // El email que queda en la firma (y al que va el código).
  const emailFirma = (emailEmpresa ? (propioVale ? propio : emailEmpresa) : email).trim().toLowerCase();
  const emailFirmaVale = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailFirma);
  // CÓDIGO DE 6 CIFRAS (usuario, 2026-11-22): al abrir la ventana de firma se manda solo al
  // email de quien firma (si ya lo tenemos); si no, lo escribe y pulsa «Mandarme el código».
  // Se pide antes de «Aceptar firma». Si se escribe bien, la firma queda «email verificado»
  // (lo decide la base de datos). Si no le llega (pasado 1 minuto, o si no se pudo mandar),
  // puede firmar sin código: queda «email sin verificar». Al cambiar el email, se pierde.
  const [codigoA, setCodigoA] = useState<string | null>(null);       // email al que se mandó
  const [verificadoA, setVerificadoA] = useState<string | null>(null); // email ya verificado
  const [codigo, setCodigo] = useState('');
  const [codigoMsg, setCodigoMsg] = useState<{ t: 'err' | 'okv'; m: string } | null>(null);
  const [codigoOcupado, setCodigoOcupado] = useState(false);
  const [sinCodigo, setSinCodigo] = useState(false);
  const [falloEnvio, setFalloEnvio] = useState(false);
  const [esperaCumplida, setEsperaCumplida] = useState(false);       // pasó 1 minuto desde el envío
  const verificado = verificadoA === emailFirma && emailFirmaVale;
  const codigoMandado = codigoA === emailFirma && emailFirmaVale;
  const puedeSinCodigo = falloEnvio || (codigoMandado && esperaCumplida);
  async function pedirCodigo(email = emailFirma) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setCodigoMsg({ t: 'err', m: 'Pon antes un email válido.' }); return; }
    setCodigoOcupado(true); setCodigoMsg(null); setEsperaCumplida(false);
    const r = await pedirCodigoFirma(token, { parada_id: b.parada_id, rol: b.rol, email }).catch(() => ({ ok: false as const, error: 'No hay cobertura: vuelve a intentarlo.' }));
    setCodigoOcupado(false);
    if (r.ok) {
      setCodigoA(r.email); setCodigo(''); setFalloEnvio(false);
      setCodigoMsg({ t: 'okv', m: `Te lo hemos mandado a ${r.email}. Mira también en «Spam».` });
      setTimeout(() => setEsperaCumplida(true), 60_000);
    } else { setFalloEnvio(true); setCodigoMsg({ t: 'err', m: r.error }); }
  }
  async function comprobarCodigo(c = codigo) {
    setCodigoOcupado(true); setCodigoMsg(null);
    const r = await comprobarCodigoFirma(token, { parada_id: b.parada_id, rol: b.rol, email: emailFirma, codigo: c }).catch(() => ({ ok: false as const, error: 'No hay cobertura: vuelve a intentarlo.' }));
    setCodigoOcupado(false);
    if (r.ok) { setVerificadoA(emailFirma); setCodigoMsg(null); setAviso(null); } else setCodigoMsg({ t: 'err', m: r.error });
  }
  // Al abrir: si ya tenemos su email, el código sale solo. Al transportista no se le manda
  // solo al email de su EMPRESA (quien firma suele ser el conductor): pulsa él el botón.
  const autoMandado = useRef(false);
  useEffect(() => {
    if (autoMandado.current) return;
    autoMandado.current = true;
    const e = (b.preEmail ?? '').trim().toLowerCase();
    if (b.rol !== 'transportista' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) void pedirCodigo(e);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Matrículas (usuario, 2026-11-11): solo la cabecera (transportista o cargador de la
  // 1.ª parada) las ve — precargadas si el envío ya las tiene, editables, y obligatoria
  // la tractora salvo en envíos manuales. En firmas extra no salen: ya está en tránsito.
  const pideMatricula = !!b.conMatricula && !b.extra;
  const [matCam, setMatCam] = useState(b.matCam ?? '');
  const [matRem, setMatRem] = useState(b.matRem ?? '');
  // «Es un camión rígido»: sin semirremolque. De entrada, marcado solo si el envío no lo necesita.
  const [rigido, setRigido] = useState(!b.remObligatoria);
  const [reservas, setReservas] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [lento, setLento] = useState(false);   // la subida tarda: aviso de conexión lenta
  const [preGps, setPreGps] = useState(false);   // nuestro aviso de ubicación, ANTES del diálogo del sistema
  // Fotos de las reservas (usuario, 2026-11-09): cámara o galería, se suben al momento a
  // la carpeta de este enlace (la política del almacén solo admite enlaces vivos) y al
  // firmar se cuelgan de la incidencia de siniestro que abren las reservas.
  const [fotos, setFotos] = useState<{ ruta: string; nombre: string }[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [fotoAviso, setFotoAviso] = useState<string | null>(null);
  // La política de privacidad se enseña AQUÍ, en una ventana emergente propia: el enlace
  // de antes se llevaba a quien firmaba fuera de la página (usuario, 2026-11-09).
  const [verPrivacidad, setVerPrivacidad] = useState(false);
  async function subirFotos(files: FileList | null) {
    if (!files?.length) return;
    const sb = supabaseNavegador();
    if (!sb) { setFotoAviso('No se ha podido subir la foto. Vuelve a intentarlo.'); return; }
    setFotoAviso(null); setSubiendo(true);
    for (const f of Array.from(files).slice(0, Math.max(0, 6 - fotos.length))) {
      if (f.size > 25 * 1024 * 1024) { setFotoAviso(`«${f.name}» pasa de 25 MB: hazla de nuevo o elige otra.`); continue; }
      if (!esImagenReal(await tipoRealDeArchivo(f))) { setFotoAviso(`«${f.name || 'La foto'}» no es una imagen de verdad: no se ha añadido. Hazla de nuevo con la cámara.`); continue; }
      // La extensión sale del TIPO del fichero: el almacén solo admite las de imagen.
      const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[f.type]
        ?? (/\.hei[cf]$/i.test(f.name) ? 'heic' : 'jpg');
      const ruta = `cmr/${token}/foto-${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from('documentos').upload(ruta, f, { contentType: f.type || 'image/jpeg', upsert: false });
      if (error) { setFotoAviso('No se ha podido subir la foto. Vuelve a intentarlo.'); break; }
      setFotos((l) => [...l, { ruta, nombre: f.name || 'foto' }]);
    }
    setSubiendo(false);
  }

  function preparar() {
    const c = canvas.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect();
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const x = c.getContext('2d')!; x.scale(dpr, dpr);
    // Azul bolígrafo (usuario, 2026-11-14): la firma se ve y se guarda en azul, como a mano.
    x.lineWidth = 2.6; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#1b3fa0'; x.fillStyle = '#fff';
    x.fillRect(0, 0, r.width, r.height);
    ctx.current = x; setDibujado(false);
  }
  useEffect(() => { requestAnimationFrame(preparar); }, []);
  const pos = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const v = doc.trim().length >= 3 ? validaDoc(pais, doc) : null;

  async function aceptar() {
    setAviso(null);
    if (!doc.trim() || !nombre.trim()) { setAviso('Indica el documento y el nombre y apellidos de quien firma.'); avisaFaltas([!doc.trim() && 'sigDni', !nombre.trim() && 'sigNombre'].filter(Boolean) as string[]); return; }
    if (v && !v.ok) { setAviso(v.msg || 'El documento no es válido.'); return; }
    // Email OBLIGATORIO (usuario, 2026-11-14): a esa dirección va la copia del firmado.
    if (!emailEmpresa && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setAviso('Pon tu email: te enviaremos la copia del documento firmado.'); avisaFaltas(['sigEmail']); return; }
    if (emailEmpresa && propio && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(propio)) { setAviso('Tu email no es válido. Corrígelo o déjalo vacío: es opcional.'); avisaFaltas(['sigEmailPropio']); return; }
    if (!verificado && !sinCodigo) {
      setAviso(codigoMandado ? 'Escribe el código de 6 cifras que te hemos mandado a tu email.' : 'Pulsa «Mandarme el código» para recibir en tu email el código de 6 cifras.');
      avisaFaltas([codigoMandado ? 'sigCodigo' : 'sigEmail']); return;
    }
    if (pideMatricula && b.matObligatoria && !matCam.trim()) {
      setAviso('Pon la matrícula del camión (tractora): sin ella no se puede salir de la 1.ª parada.');
      avisaFaltas(['sigMatCam']); return;
    }
    if (pideMatricula && b.matObligatoria && !rigido && !matRem.trim()) {
      setAviso('Pon también la matrícula del semirremolque: un tráiler lleva las dos en el documento de control. Si es un camión rígido, márcalo.');
      avisaFaltas(['sigMatRem']); return;
    }
    if (!dibujado) { setAviso('Firma con el dedo dentro del recuadro.'); return; }
    // El diálogo de ubicación del SISTEMA es obligatorio (una web no puede darse permiso
    // sola), pero antes sale el NUESTRO, con diseño y explicación (usuario, 2026-11-10).
    // Con el permiso ya concedido o denegado, no se molesta: se firma directamente.
    let estado: string | null = null;
    try { estado = (await navigator.permissions.query({ name: 'geolocation' })).state; } catch { estado = null; }
    if (estado === 'granted') return guardar(true);
    if (estado === 'denied') return guardar(false);
    setPreGps(true);
  }

  async function guardar(conGps: boolean) {
    setPreGps(false);
    setGuardando(true);
    // Ubicación del dispositivo (OPCIONAL): el permiso se pide AQUÍ, al pulsar el botón,
    // y la posición es la VIVA de ese momento — jamás una guardada de hace horas (se
    // descarta cualquier lectura de más de 40 minutos; el navegador como mucho reutiliza
    // una de hace 1 minuto). Si quien firma deniega el permiso, no hay señal o tarda
    // demasiado, la firma se guarda exactamente igual, sin ubicación.
    const gps = !conGps ? null : await (async () => {
      try {
        const p = await new Promise<GeolocationPosition>((res, rej) => {
          if (!navigator.geolocation) { rej(new Error('sin geolocalización')); return; }
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
        });
        if (Date.now() - p.timestamp > 40 * 60 * 1000) return null;   // nunca una posición vieja
        const g: NonNullable<DatosFirma['gps']> = { lat: p.coords.latitude, lon: p.coords.longitude, precision_m: Math.round(p.coords.accuracy) };
        // Con Google, la dirección aproximada la pone el servidor al guardar la firma; sin sus
        // claves (pruebas y local), la reserva libre desde aquí.
        if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY) try {
          const rg = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=es&lat=${g.lat}&lon=${g.lon}`);
          const j = (await rg.json()) as { display_name?: string };
          if (j?.display_name) g.direccion = String(j.display_name).slice(0, 300);
        } catch { /* sin dirección: las coordenadas bastan */ }
        return g;
      } catch { return null; }
    })();
    // CONEXIÓN LENTA (usuario, 2026-11-12): si la subida tarda más de ~3 s (muelles con
    // mala cobertura), se dice en claro que se está guardando — que nadie machaque el
    // botón ni cierre la página. Los reintentos del servidor ya trabajan por dentro.
    const tLento = setTimeout(() => setLento(true), 3000);
    let r: Awaited<ReturnType<typeof firmar>>;
    try {
      r = await firmar(token, { parada_id: b.parada_id, rol: b.rol, nombre, documento: doc, pais, email: emailFirma, extra: !!b.extra,
        reservas: b.extra ? '' : reservas, fotos: !b.extra && reservas.trim() ? fotos.map((f) => f.ruta) : [], png: canvas.current!.toDataURL('image/png'),
        gps, matricula_camion: pideMatricula ? matCam : undefined, matricula_remolque: pideMatricula && !rigido ? matRem : undefined,
        camion_rigido: pideMatricula ? rigido : undefined });
    } catch {
      // La red se cayó del todo (antes esto dejaba el botón en «Guardando…» para siempre).
      r = { ok: false, error: 'No hay cobertura suficiente en esta zona. Muévete unos metros y vuelve a pulsar «Aceptar firma»: tu firma sigue en la pantalla, no se ha perdido.' };
    }
    clearTimeout(tLento);
    setLento(false);
    setGuardando(false);
    if (!r.ok) { setAviso(r.error); return; }
    onFirmado(!emailEmpresa || propioVale);   // copia al momento solo a quien firma con SU email
  }

  // PISTA «Desliza para firmar» (usuario, 2026-11-15): la ventana de firma es larga y en
  // el móvil el botón «Aceptar firma» queda abajo del todo. Píldora flotante, como la de
  // «Desliza para crear el envío»: sale mientras el botón no se ve y, al pulsarla, baja
  // suave hasta él. La ventana tiene su PROPIO scroll (no el de la página). Mientras se
  // traza la firma se quita, para no estorbar al dedo.
  const velo = useRef<HTMLDivElement>(null);
  const btnAceptar = useRef<HTMLButtonElement>(null);
  const [pista, setPista] = useState(false);
  useEffect(() => {
    const cont = velo.current;
    if (!cont) return;
    let raf = false;
    const mirar = () => {
      const btn = btnAceptar.current;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (!btn || trazando.current) { setPista(false); return; }
      const r = btn.getBoundingClientRect();
      setPista(!(r.top < vh - 24 && r.bottom > 0));   // se ve (aunque sea en parte) → fuera
    };
    const alScroll = () => { if (!raf) { raf = true; requestAnimationFrame(() => { raf = false; mirar(); }); } };
    mirar();
    const t = setInterval(mirar, 600);
    cont.addEventListener('scroll', alScroll, { passive: true });
    window.addEventListener('resize', mirar);
    return () => { clearInterval(t); cont.removeEventListener('scroll', alScroll); window.removeEventListener('resize', mirar); };
  }, []);

  return (
    <div className="sigov show" role="dialog" aria-modal="true" aria-label="Firmar el CMR" ref={velo}>
      {pista && !guardando && (
        <button type="button" className="sig-pista" aria-label="Desliza para firmar"
          onClick={() => btnAceptar.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })}>
          <span>Desliza para firmar</span><span className="sp-flecha" aria-hidden="true">↓</span>
        </button>
      )}
      <div className="sigcard">
        <h2>Firmar {b.titulo.toLowerCase()}</h2>
        <label className="sig-lbl" htmlFor="sigDni">Documento de identidad <Req /></label>
        <div className="sig-row">
          <select id="sigDocPais" aria-label="País del documento" value={pais} onChange={(e) => setPais(e.target.value)}>
            {DOC_PAISES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
          <input type="text" id="sigDni" autoComplete="off" autoCapitalize="characters" placeholder="Ej. 12345678Z" value={doc} onChange={(e) => setDoc(e.target.value)} className={v && !v.ok ? 'err' : undefined} />
        </div>
        {v && <div className={`sig-msg ${!v.ok ? 'err' : v.soft ? 'warn' : 'okv'}`}>{!v.ok ? `⚠ ${v.msg}` : v.soft ? `⚠ ${v.soft}` : '✓ Documento válido'}</div>}
        <label className="sig-lbl" htmlFor="sigNombre">Nombre y apellidos <Req /></label>
        <input type="text" id="sigNombre" autoComplete="off" placeholder="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        {/* OBLIGATORIO (usuario, 2026-11-14): a ese email va la copia del documento firmado,
            con el porqué entre paréntesis y en la caja verde de encima de «Aceptar firma». */}
        {emailEmpresa ? <>
          <label className="sig-lbl" htmlFor="sigEmail">Email de tu empresa</label>
          <input type="text" id="sigEmail" value={emailEmpresa} readOnly tabIndex={-1} aria-readonly="true"
            style={{ background: '#f3f4f6', color: '#4b5563', cursor: 'not-allowed' }} />
          <div className="sig-msg okv">A este email enviaremos la copia del CMR al terminar el transporte, cuando firme la entrega el último destinatario. Nosotros SIEMPRE guardamos la copia por si hiciera falta reenviarla.</div>
          <label className="sig-lbl" htmlFor="sigEmailPropio">Tu email <Req si={false} /></label>
          <input type="text" id="sigEmailPropio" autoComplete="off" inputMode="email" placeholder="Ej. nombre@correo.com" value={emailPropio} onChange={(e) => setEmailPropio(e.target.value)} />
          <div className="sig-msg okv">Si lo pones, tú también recibirás la copia: ahora, con las firmas que haya, y la final cuando firme el último destinatario.</div>
        </> : <>
          <label className="sig-lbl" htmlFor="sigEmail">Email <Req /> <strong style={{ color: 'var(--green-dark)', fontWeight: 800 }}>(recibirás tu copia al firmar y la copia final cuando firmen todos)</strong></label>
          <input type="text" id="sigEmail" autoComplete="off" inputMode="email" placeholder="Ej. nombre@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </>}
        {/* Código al email (usuario, 2026-11-22): se manda al abrir; se pide antes de firmar. */}
        <div style={{ marginTop: '0.55rem', padding: '0.55rem 0.65rem', border: '1.5px dashed var(--gray-300)', borderRadius: 10 }}>
          {verificado
            ? <div className="sig-msg okv" style={{ marginTop: 0 }}>✓ Email verificado con código: tu firma quedará como «email verificado».</div>
            : sinCodigo ? <div className="sig-msg warn" style={{ marginTop: 0 }}>
              Firmarás sin código: tu firma quedará como «email sin verificar».{' '}
              <button type="button" className="sig-link" onClick={() => setSinCodigo(false)}>Volver al código</button>
            </div>
            : codigoMandado ? <>
              <label className="sig-lbl" htmlFor="sigCodigo" style={{ marginTop: 0 }}>Código de 6 cifras que te hemos mandado a {emailFirma} <Req /></label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="text" id="sigCodigo" autoComplete="one-time-code" inputMode="numeric" maxLength={6} placeholder="Ej. 123456"
                  value={codigo} style={{ letterSpacing: '0.2em' }}
                  onChange={(e) => { const c = e.target.value.replace(/\D/g, '').slice(0, 6); setCodigo(c); if (c.length === 6 && !codigoOcupado) void comprobarCodigo(c); }} />
                <button type="button" className="sig-foto-btn" style={{ flex: '0 0 auto', padding: '0.5rem 0.8rem' }}
                  disabled={codigoOcupado || codigo.length !== 6} onClick={() => comprobarCodigo()}>{codigoOcupado ? '…' : 'Comprobar'}</button>
              </div>
              <button type="button" className="sig-link" style={{ fontSize: '0.78rem', marginTop: '0.3rem' }} disabled={codigoOcupado} onClick={() => pedirCodigo()}>Mandar otro código</button>
            </> : <button type="button" className="sig-foto-btn" style={{ width: '100%' }} disabled={codigoOcupado || !emailFirmaVale} onClick={() => pedirCodigo()}>
              {codigoOcupado ? 'Mandando el código…' : emailFirmaVale ? `✉ Mandarme el código a ${emailFirma}` : '✉ Escribe tu email para recibir el código'}
            </button>}
          {codigoMsg && !verificado && !sinCodigo && <div className={`sig-msg ${codigoMsg.t}`}>{codigoMsg.m}</div>}
          {!verificado && !sinCodigo && <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)', marginTop: '0.3rem' }}>
            Para firmar te mandamos un código de 6 cifras a tu email: así tu firma queda como «email verificado».{emailEmpresa && !propioVale ? ' Si no es tu email, pon el tuyo en «Tu email».' : ' Si no es tu email, cámbialo arriba.'}
            {puedeSinCodigo && <>{' '}<button type="button" className="sig-link" onClick={() => { setSinCodigo(true); setAviso(null); }}>¿No te llega? Firmar sin código</button></>}
          </div>}
        </div>
        {/* Matrículas en la CABECERA (usuario, 2026-11-11): el DeCA debe existir antes de
            salir de la 1.ª parada — verifica, corrige o ponlas; luego ya no se tocan. */}
        {pideMatricula && <>
          <label className="sig-lbl" htmlFor="sigMatCam">Matrículas del camión {b.matObligatoria ? <Req /> : <Req si={false} />}</label>
          <div className="sig-row">
            <input type="text" id="sigMatCam" autoComplete="off" autoCapitalize="characters" placeholder="Tractora · Ej. 1234 BCD"
              value={matCam} onChange={(e) => setMatCam(e.target.value.toUpperCase())} />
            <input type="text" id="sigMatRem" autoComplete="off" autoCapitalize="characters" disabled={rigido}
              placeholder={rigido ? 'Sin semirremolque' : 'Semirremolque · Ej. R1234 BCD'} aria-label="Matrícula del semirremolque"
              value={rigido ? '' : matRem} onChange={(e) => setMatRem(e.target.value.toUpperCase())} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', fontWeight: 600, margin: '0.35rem 0 0.2rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={rigido} onChange={(e) => setRigido(e.target.checked)} style={{ width: 18, height: 18 }} />
            Es un camión rígido (no lleva semirremolque)
          </label>
          <div className="sig-msg warn">
            {b.matCam
              ? 'Verifica que las matrículas son las del camión que se lleva la mercancía; aquí puedes corregirlas. Después ya no se pueden cambiar.'
              : 'El envío aún no tiene matrículas: ponlas aquí (tractora y semirremolque). Sin ellas el camión no puede salir de la 1.ª parada (documento de control DeCA).'}
          </div>
        </>}
        {/* Las reservas son de la casilla principal: una firma extra no las anota. */}
        {!b.extra && <>
        <label className="sig-lbl" htmlFor="sigReservas">Anotaciones/ Reservas <Req si={false} /></label>
        {/* Una línea que crece sola con el texto hasta 5 líneas (luego, scroll) y máximo
            300 caracteres (usuario, 2026-11-10). */}
        <textarea id="sigReservas" rows={1} maxLength={300} placeholder="Ej. Recibo 3 europalet; faltan 5 cajas; film roto; etc." value={reservas}
          onChange={(e) => { setReservas(e.target.value.slice(0, 300)); const t = e.target; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 127)}px`; }}
          style={{ width: '100%', boxSizing: 'border-box', border: reservas.trim() ? '1.5px solid #dc2626' : undefined, borderRadius: 10, padding: '0.5rem 0.6rem', font: 'inherit',
            resize: 'none', overflowY: 'auto', lineHeight: 1.35 }} />
        {reservas.trim() && <>
          <div className="sig-msg err">Se avisa a Dynamo al momento. Haz fotos y, si eres el destinatario, no termines la descarga sin hablar con nosotros ({CONTACTO.telefono}).</div>
          {/* Cámara y galería en la misma fila: las fotos se verán en la incidencia del envío. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
            <label className="sig-foto-btn" onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (!subiendo && fotos.length < 6) void subirFotos(e.dataTransfer.files); }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
              Cámara
              <input type="file" accept="image/*" capture="environment" hidden disabled={subiendo || fotos.length >= 6} onChange={(e) => { void subirFotos(e.target.files); e.target.value = ''; }} />
            </label>
            <label className="sig-foto-btn" onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (!subiendo && fotos.length < 6) void subirFotos(e.dataTransfer.files); }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
              Galería
              <input type="file" accept="image/*" multiple hidden disabled={subiendo || fotos.length >= 6} onChange={(e) => { void subirFotos(e.target.files); e.target.value = ''; }} />
            </label>
          </div>
          {subiendo && <div className="sig-msg warn">Subiendo la foto…</div>}
          {fotoAviso && <div className="sig-msg err">⚠ {fotoAviso}</div>}
          {fotos.length > 0 && (
            <div className="sig-msg okv">✓ {fotos.length === 1 ? '1 foto adjunta' : `${fotos.length} fotos adjuntas`} (máx. 6): se verán en la incidencia del envío.
              {' '}{fotos.map((f, i) => (
                <span key={f.ruta} style={{ whiteSpace: 'nowrap' }}>{i > 0 && ' · '}{f.nombre}
                  <button type="button" aria-label={`Quitar ${f.nombre}`} onClick={() => setFotos((l) => l.filter((x) => x.ruta !== f.ruta))}
                    style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 900, padding: '0 0.2rem' }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </>}
        </>}
        {aviso && <div className="sig-warn">⚠ {aviso}</div>}
        <p className="hint" style={{ marginTop: '0.6rem' }}>Firma con el dedo (o el ratón) dentro del recuadro.</p>
        <canvas id="sigCanvas" ref={canvas}
          onPointerDown={(e) => { e.preventDefault(); const x = ctx.current; if (!x) return; trazando.current = true; setPista(false); canvas.current!.setPointerCapture(e.pointerId); const p = pos(e); x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x + 0.1, p.y + 0.1); x.stroke(); setDibujado(true); }}
          onPointerMove={(e) => { if (!trazando.current || !ctx.current) return; e.preventDefault(); const p = pos(e); ctx.current.lineTo(p.x, p.y); ctx.current.stroke(); }}
          onPointerUp={() => { trazando.current = false; ctx.current?.beginPath(); }}
          onPointerCancel={() => { trazando.current = false; ctx.current?.beginPath(); }} />
        {/* Información básica de protección de datos (RGPD art. 13), capa 1 con lo MÍNIMO
            que pide la ley —responsable, finalidad y derechos— y el resto en la política
            (usuario, 2026-11-10: «pon lo mínimo por ley»). */}
        <p className="hint" style={{ marginTop: '0.6rem', fontSize: '0.78rem', lineHeight: 1.45 }}>
          <strong>Protección de datos:</strong> Dynamo guarda estos datos y tu firma como prueba del CMR durante 6 años.
          Derechos: {CONTACTO.email} · <button type="button" className="sig-link" onClick={() => setVerPrivacidad(true)}>Política de privacidad</button>.
        </p>
        {guardando && lento && (
          <div className="sig-msg warn" role="status" aria-live="polite">⏳ Conexión lenta en esta zona… guardando tu firma, no cierres la página.</div>
        )}
        {/* ANTES de la caja verde (usuario, 2026-11-17): fotos de documentos adicionales, con
            la misma ventana de subir del CMR en papel. No se pide a los que firman de más. */}
        <SubirCmrPapel token={token} clase="doc" />
        {/* Caja verde con el porqué del email obligatorio (usuario, 2026-11-14). */}
        <div style={{ margin: '0.7rem 0 0.1rem', background: '#ecfdf5', border: '1.5px solid #6ee7b7', borderRadius: 10, padding: '0.55rem 0.7rem', fontSize: '0.8rem', lineHeight: 1.45, color: '#065f46', fontWeight: 600 }}>
          {emailEmpresa
            ? (propioVale
                ? <>📩 La copia del CMR con todas las firmas llegará al <strong>email de tu empresa y al tuyo</strong> al terminar el transporte. Al aceptar, te mandamos además a <strong>tu email</strong> la copia con las firmas de ahora.</>
                : <>📩 La copia del CMR con todas las firmas llegará al <strong>email de tu empresa</strong> al terminar el transporte. Si la quieres tú también, pon <strong>tu email</strong> arriba, o después de firmar <strong>mándatela</strong> por WhatsApp, email o como prefieras.</>)
            : <>📩 Al aceptar, te enviaremos a <strong>tu email</strong> una copia del documento firmado, con tu firma y las que ya trae. Por eso el email es obligatorio.</>}
        </div>
        {/* Aceptar GRANDE y en verde arriba; Cancelar y Borrar debajo (usuario, 2026-11-10). */}
        <div className="sigbtns">
          <button type="button" className="b-aceptar" ref={btnAceptar} disabled={!dibujado || guardando} onClick={aceptar}>{guardando ? 'Guardando…' : 'Aceptar firma'}</button>
          <button type="button" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="button" className="b-borrar" onClick={preparar} disabled={guardando}>Borrar</button>
        </div>
      </div>
      {/* NUESTRO aviso de ubicación, con diseño, ANTES del diálogo del sistema (que es
          obligatorio: solo el navegador puede conceder el permiso). Sin ubicación, la
          firma vale exactamente igual. */}
      {preGps && (
        <div role="dialog" aria-modal="true" aria-label="Añadir la ubicación a la firma"
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,2,48,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.2rem' }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '1.3rem 1.2rem', maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 24px 60px rgba(10,2,48,0.35)' }}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#3300cc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ margin: '0 auto 0.5rem', display: 'block' }}>
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
            <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>¿Añadimos tu ubicación a la firma?</h2>
            <p style={{ margin: '0 0 0.9rem', fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.5 }}>
              Refuerza la validez: queda registrado el punto exacto desde el que se firma. Tu navegador te pedirá permiso ahora
              — pulsa <strong>Permitir</strong>. Si prefieres no darla, la firma vale exactamente igual.
            </p>
            <button type="button" className="firma-btn" style={{ width: '100%', marginBottom: '0.5rem', padding: '0.95rem 1rem', fontSize: '1.05rem', borderRadius: 12 }}
              onClick={() => guardar(true)}>Sí, añadir mi ubicación</button>
            <button type="button" className="firma-btn" style={{ width: '100%', background: '#fff', color: 'var(--gray-700)', border: '1.5px solid var(--gray-300)', padding: '0.95rem 1rem', fontSize: '1.05rem', borderRadius: 12 }}
              onClick={() => guardar(false)}>Firmar sin ubicación</button>
          </div>
        </div>
      )}
      {/* Siempre montada (oculta con CSS): así la primera pasada del traductor de Google
          la traduce con el resto de la página, sin depender del vigilante de contenido
          nuevo (usuario, 2026-11-14: salía en español con la página en polaco). */}
      {(
        <div className="privov" role="dialog" aria-modal="true" aria-label="Política de privacidad"
          style={verPrivacidad ? undefined : { display: 'none' }}
          onClick={(e) => { if (e.target === e.currentTarget) setVerPrivacidad(false); }}>
          <div className="privcard">
            <button type="button" className="priv-x" aria-label="Cerrar" onClick={() => setVerPrivacidad(false)}>✕</button>
            <h2>Política de privacidad · firma del CMR</h2>
            <p><strong>Responsable:</strong> Dynamo Operador Logístico, S.L. · {CONTACTO.email} · {CONTACTO.telefono}.</p>
            <p><strong>Qué guardamos:</strong> tu nombre y apellidos, el documento de identidad, el trazo de la firma, el email (si lo pones),
              la fecha y la hora, y desde dónde firmas (dirección IP y navegador; la ubicación GPS solo si das permiso en tu dispositivo). Si anotas reservas, también su texto y sus fotos.</p>
            <p><strong>Para qué:</strong> dejar constancia de quién firmó la carga o la entrega en el CMR y poder demostrarlo ante quienes
              intervienen en el transporte o ante una reclamación.</p>
            <p><strong>Con qué base:</strong> la ejecución del contrato de transporte y el Convenio CMR (art. 6.1.b y f del RGPD).</p>
            <p><strong>Cuánto tiempo:</strong> 6 años, el plazo de conservación de la documentación mercantil.</p>
            <p><strong>A quién se comunica:</strong> solo a las partes de este transporte (cliente, transportista, aseguradora si hay siniestro)
              y a las autoridades si lo exigen. Nunca se usa para publicidad ni se cede a terceros ajenos al envío.</p>
            <p><strong>Tus derechos:</strong> acceso, rectificación, supresión, limitación, oposición y portabilidad, escribiendo
              a {CONTACTO.email}; y reclamar ante la Agencia Española de Protección de Datos (aepd.es).</p>
            <button type="button" className="priv-cerrar" onClick={() => setVerPrivacidad(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
