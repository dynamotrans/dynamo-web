'use client';

import { pesoTn, metros, fecha, fechaHora } from '@/lib/formato';

// CMR digital, copiado de firmar-cmr.html: resumen del CMR, un bloque por casilla (22 cada
// recogida · 23 transportista · 24 cada entrega) y la pantalla de firma con el dedo, con el
// documento de identidad validado por país. La firma la guarda el servidor (acciones.ts).
import { useEffect, useRef, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import { firmar, type DatosFirma } from './acciones';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { DOC_PAISES, validaDoc } from '@/lib/documentoIdentidad';
import { CONTACTO } from '@/lib/atencion';
import CompartirSheet from '@/components/CompartirSheet';

// Botón discreto «¿Necesitas ayuda? · Contáctanos» (usuario, 2026-11-11): al principio y
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

type Bloque = { clave: string; titulo: string; casilla: string; firmante: string; rol: DatosFirma['rol']; parada_id: string | null; pre: string; preEmail: string; lugar?: string; extra?: boolean;
  // Matrículas al firmar (usuario, 2026-11-11): solo la CABECERA (transportista o
  // cargador de la 1.ª parada) las ve, verifica y corrige; obligatorias salvo manuales.
  conMatricula?: boolean; matObligatoria?: boolean; matCam?: string; matRem?: string };

export default function FirmarCmr({ token, cmr, trazos }: { token: string; cmr: CmrPublico; trazos: Record<string, string> }) {
  const refrescar = useRefrescar();
  const [abierto, setAbierto] = useState<Bloque | null>(null);
  const [fin, setFin] = useState(false);   // pantalla de gracias tras «Está todo guardado»
  // Firma EXTRA (usuario, 2026-11-09): hasta 3 además de las casillas de siempre. Se elige
  // la casilla y se abre la pantalla de firma normal; no ocupa la casilla ni anota reservas.
  const [eligiendoExtra, setEligiendoExtra] = useState(false);
  // Solo tras FIRMAR en esta visita (usuario, 2026-11-10): quien entra a mirar sin firmar
  // nada no ve el botón de salir.
  const [firmoAqui, setFirmoAqui] = useState(false);
  const [compartir, setCompartir] = useState(false);     // ventana de compartir propia (mismo diseño en cualquier aparato)
  const [masInfo, setMasInfo] = useState(false);          // despliegue del detalle legal (eIDAS / FOM)
  // Aviso con tono de ALERTA antes de abrir la pantalla de firma (usuario, 2026-11-10):
  // quién firma y que el dispositivo queda registrado; «De acuerdo» sigue, «Cancelar» no.
  const [preFirma, setPreFirma] = useState<Bloque | null>(null);
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

  const paradas: ParadaCmr[] = cmr.paradas ?? [];
  const rec = paradas.filter((p) => p.tipo === 'carga'), ent = paradas.filter((p) => p.tipo === 'descarga');
  const lugar = (p: ParadaCmr | undefined) => [p?.nombre_empresa, [p?.codigo_postal, p?.poblacion].filter(Boolean).join(' '), p?.provincia !== p?.poblacion ? p?.provincia : null].filter(Boolean).join(' · ');
  // Matrículas al firmar (usuario, 2026-11-11): la CABECERA — el cargador de la 1.ª
  // parada del recorrido y el transportista — las verifica, corrige o, si faltan, las
  // pone (obligatorias salvo en envíos manuales). El resto ya está en tránsito.
  const primera = paradas[0]?.id ?? null;
  const mat = { conMatricula: true, matObligatoria: !cmr.manual, matCam: cmr.matricula_camion ?? '', matRem: cmr.matricula_remolque ?? '' };
  const bloques: Bloque[] = [
    ...rec.map((p, i) => ({ clave: `remitente:${p.id}`, titulo: `Recogida ${rec.length + ent.length > 2 ? i + 1 : ''}`.trim(), casilla: 'Casilla 22 · firma y sello', firmante: 'Remitente / Cargador', rol: 'remitente' as const, parada_id: p.id, pre: p.contacto ?? '', preEmail: p.email ?? '', lugar: lugar(p), ...(p.id === primera ? mat : {}) })),
    { clave: 'transportista:', titulo: 'Transportista', casilla: 'Casilla 23 · firma y sello', firmante: 'Porteador / Transportista', rol: 'transportista', parada_id: null, pre: cmr.conductor ?? '', preEmail: cmr.transportista_email ?? '', lugar: cmr.transportista ?? undefined, ...mat },
    ...ent.map((p, i) => ({ clave: `destinatario:${p.id}`, titulo: `Entrega ${rec.length + ent.length > 2 ? rec.length + i + 1 : ''}`.trim(), casilla: 'Casilla 24 · recibí de la mercancía', firmante: 'Destinatario', rol: 'destinatario' as const, parada_id: p.id, pre: p.contacto ?? '', preEmail: p.email ?? '', lugar: lugar(p) })),
  ];
  const firmas = new Map<string, FirmaCmr>((cmr.firmas ?? []).filter((f) => !f.extra).map((f) => [`${f.rol}:${f.parada_id ?? ''}`, f]));
  // «Está todo guardado» (usuario, 2026-11-11): ya NO se lleva a nadie a la web pública.
  // Al pulsarlo, AQUÍ mismo sale la pantalla de gracias con un botón bien llamativo que
  // abre el PDF del eCMR al día, con las firmas actuales. Solo tras firmar en esta visita.
  const btnFin = fin ? (
    <div style={{ background: '#ecfdf5', border: '2px solid #1d9e57', borderRadius: 14, padding: '1.2rem 1rem', textAlign: 'center' }}>
      <div aria-hidden="true" style={{ width: 54, height: 54, margin: '0 auto 0.6rem', borderRadius: '50%', background: '#1d9e57', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.7rem', fontWeight: 800 }}>✓</div>
      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#065f46' }}>Todo guardado. ¡Gracias!</div>
      <p style={{ margin: '0.35rem 0 0.9rem', color: '#047857', fontWeight: 600 }}>Cada firma queda registrada en el eCMR al momento.</p>
      <a className="firma-btn" href={`/cmr/${token}/pdf`} target="_blank" rel="noopener" style={{ display: 'block', width: '100%', background: '#1d9e57', textAlign: 'center', textDecoration: 'none',
        padding: '1rem 1.1rem', fontSize: '1.08rem', borderRadius: 12, boxShadow: '0 4px 14px rgba(29,158,87,0.35)' }}>
        Ver el CMR en PDF · con las firmas actuales
      </a>
      {/* Salir SÍ lleva a la web de Dynamo, pero solo desde aquí (usuario, 2026-11-11). */}
      <a href="/" style={{ display: 'block', width: '100%', marginTop: '0.6rem', padding: '0.85rem 1rem', borderRadius: 12, textAlign: 'center', textDecoration: 'none',
        background: '#fff', border: '2px solid #1d9e57', color: '#065f46', fontWeight: 800, fontSize: '1rem' }}>
        Salir · He terminado, gracias
      </a>
      <button type="button" onClick={() => setFin(false)} style={{ marginTop: '0.7rem', background: 'none', border: 'none', color: '#047857', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
        Volver a las firmas
      </button>
    </div>
  ) : (
    <button type="button" className="firma-btn" onClick={() => setFin(true)} style={{ display: 'block', width: '100%', background: '#1d9e57', textAlign: 'center',
      padding: '1rem 1.1rem', fontSize: '1.08rem', borderRadius: 12, boxShadow: '0 4px 14px rgba(29,158,87,0.35)', border: 'none', cursor: 'pointer' }}>
      ✓ Está todo guardado · Terminar
    </button>
  );
  const extras = (cmr.firmas ?? []).filter((f) => f.extra);
  const hechas = bloques.filter((b) => firmas.has(b.clave)).length;
  // SIN TRANSPORTISTA NO SE FIRMA (usuario, 2026-11-10): sin camión asignado no se puede
  // estar cargando. La base de datos lo rechaza igualmente (sin_transportista); aquí los
  // botones quedan bloqueados con el porqué. Las firmas ya hechas se quedan, y la página
  // está EN VIVO: al asignar (o reasignar) transportista se desbloquea sola. En envíos
  // manuales el porteador es el operador del cliente: no aplica.
  const sinTransportista = !cmr.manual && !cmr.transportista;
  const nombreBloque = (f: FirmaCmr) => bloques.find((b) => b.rol === f.rol && (f.rol === 'transportista' || b.parada_id === f.parada_id))?.titulo
    ?? (f.rol === 'remitente' ? 'Recogida' : f.rol === 'transportista' ? 'Transportista' : 'Entrega');

  return (
    <div className="card">
      {!cmr.manual && <div className="brand"><img src="/images/2.png" alt="Dynamo" /></div>}
      {/* Cabecera en caja gris suave y formal (usuario, 2026-11-11). */}
      <div className="cab-caja">
        <h1>CMR digital</h1>
        <p className="sub">Carta de porte del envío <strong>{cmr.referencia}</strong> · firma cada parte con el dedo</p>
        {/* Qué es esta página, en claro (usuario, 2026-11-11). */}
        <p className="sub" style={{ marginTop: '0.15rem', color: 'var(--gray-500)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.72rem' }}>Hoja de firmas</p>
      </div>
      <dl className="cmrbox">
        <dt>Remitente</dt><dd>{cmr.remitente || '—'}</dd>
        <dt>Porteador</dt><dd>{cmr.porteador || '—'}</dd>
        {(cmr.transportista || cmr.matricula) && <><dt>Transportista efectivo</dt><dd>{[cmr.transportista, cmr.matricula].filter(Boolean).join(' · ')}</dd></>}
        {/* Cada parada en SU línea, numerada cuando hay varias (usuario, 2026-11-10):
            nada de «A / B» corrido, que no se lee. */}
        <dt>Recogida</dt><dd>{rec.length ? rec.map((p, i) => <div key={p.id}>{rec.length + ent.length > 2 ? `${i + 1}. ` : ''}{lugar(p)}</div>) : '—'}</dd>
        <dt>Entrega</dt><dd>{ent.length ? ent.map((p, i) => <div key={p.id}>{rec.length + ent.length > 2 ? `${rec.length + i + 1}. ` : ''}{lugar(p)}</div>) : '—'}</dd>
        <dt>Fecha de carga</dt><dd>{fecha(cmr.fecha_carga)}</dd>
        <dt>Mercancía</dt><dd>{[cmr.mercancia, cmr.metros_lineales != null && `${metros(cmr.metros_lineales)}`, cmr.toneladas != null && pesoTn(cmr.toneladas)].filter(Boolean).join(' · ') || '—'}</dd>
        {cmr.adr && <div className="adr">⚠ MERCANCÍA ADR (peligrosa) — transporte sujeto al Acuerdo ADR</div>}
      </dl>
      {/* Compartir ESTA página de firmas, lo PRIMERO (usuario, 2026-11-11): cargador,
          transportista y destinatario ya la recibieron igual que quien la abre, y pueden
          firmar en este mismo móvil; el botón es para reenviársela a quien la quiera.
          Con menú de compartir del sistema si lo hay; si no, copia el mensaje. */}
      <button type="button" className="firma-btn" style={{ display: 'block', width: '100%', margin: '0.8rem 0 0', background: '#fff',
        color: 'var(--gray-700)', border: '1.5px solid var(--gray-300)', textAlign: 'center', padding: '0.95rem 1rem', fontSize: '1.05rem', borderRadius: 12 }}
        onClick={() => setCompartir(true)}>
        Compartir esta página de firmas
      </button>
      {/* Ventana de compartir PROPIA (usuario, 2026-11-11): mismo diseño sencillo en
          cualquier aparato — WhatsApp, Email, SMS, Copiar y «Más opciones…» si el
          aparato tiene hoja de compartir del sistema. Mensaje corto. */}
      {compartir && (
        <CompartirSheet onCerrar={() => setCompartir(false)} url={window.location.href}
          titulo={`CMR del envío #${cmr.referencia ?? ''}${cmr.manual ? '' : ' · Dynamo'}`}
          texto={`CMR del envío #${cmr.referencia ?? ''}${cmr.manual ? '' : ' · Dynamo'}\nFirma tu casilla con el dedo aquí:`} />
      )}
      {/* En caja verde y con el texto más claro y algo más grande (usuario, 2026-11-11);
          lo de firmar en este mismo móvil, resaltado a marcador (usuario, 2026-11-12). */}
      <div style={{ margin: '0.45rem 0 0', background: '#eafaf0', border: '1.5px solid #b7ebcd', color: '#0f6b3a', borderRadius: 12,
        padding: '0.65rem 0.85rem', fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', lineHeight: 1.5 }}>
        Cargador, transportista y destinatario ya la han recibido igual que tú, y{' '}
        <strong style={{ background: '#c6f2d9', color: '#0b5c31', padding: '0.05rem 0.3rem', borderRadius: 6, fontWeight: 800 }}>
          también pueden firmar aquí, en tu móvil.
        </strong>{' '}
        Si alguien la quiere, mándasela.
      </div>
      <Ayuda />
      {/* Con TODO firmado, el contador va en caja verde y debajo se repite la de
          «CMR completamente firmado» (usuario, 2026-11-12) — la del pie se queda. */}
      {hechas === bloques.length && bloques.length > 0 ? <>
        <div className="prog prog-caja">✓ {hechas} de {bloques.length} firmas completadas</div>
        <div className="banner-ok show" style={{ marginTop: 0, marginBottom: '0.8rem' }}>✓ CMR completamente firmado — todas las partes han quedado registradas.</div>
      </> : <div className="prog">{hechas} de {bloques.length} firmas completadas</div>}
      {sinTransportista && hechas < bloques.length && (
        <div style={{ background: '#fff7e6', border: '1.5px solid #ffd591', color: '#8a5a00', borderRadius: 12, padding: '0.7rem 0.85rem', margin: '0 0 0.8rem', fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.45 }}>
          Todavía no se puede firmar: el envío <strong>no tiene transportista asignado</strong> (sin camión no se puede estar cargando).
          En cuanto se asigne, las firmas se abren solas en esta misma página.
        </div>
      )}
      {firmoAqui && <div style={{ margin: '0 0 0.8rem' }}>{btnFin}</div>}
      {/* Caja AZUL con la misma cabecera que la hoja del panel: qué es esto y su validez
          legal, con el detalle eIDAS/FOM desplegable. JUSTO delante de la primera caja
          de firma (usuario, 2026-11-12), que es cuando toca leerla. */}
      <div style={{ margin: '0 0 0.8rem', background: '#eef2ff', border: '1.5px solid #c7d2fe', borderRadius: 12, padding: '0.7rem 0.85rem', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy)' }}>Firmen el CMR con el dedo desde el móvil, sin crear cuenta</p>
        <button type="button" onClick={() => setMasInfo((v) => !v)} aria-expanded={masInfo}
          style={{ margin: '0.25rem 0 0', padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: 'var(--purple)' }}>
          100% seguro, digital y legal. Protocolo eIDAS ~ Orden FOM/2861/2012. {masInfo ? '▴' : '▾'}
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
              <strong>Base legal:</strong> Orden FOM/2861/2012, de 13 de diciembre (documento de control administrativo del transporte público de mercancías
              por carretera), <strong>art. 6</strong>: el documento de control puede llevarse en <strong>soporte electrónico</strong> siempre que recoja los
              datos exigidos y pueda mostrarse en una inspección en carretera. Este eCMR los recoge todos, con el QR, el nº único y el registro de creación
              y firmas dentro del PDF. En transporte <strong>internacional</strong> rige el Convenio CMR (Ginebra, 19-may-1956) y no se exige DeCA.
            </p>
          </div>
        )}
      </div>
      {bloques.map((b) => {
        const f = firmas.get(b.clave);
        // Toda la caja de una firma PENDIENTE es pulsable (usuario, 2026-11-11): abre el
        // mismo flujo que el botón «Firmar» (el botón se queda, de señal visual).
        const pulsable = !f && !sinTransportista;
        return (
          <div key={b.clave} className={`firma${f ? ' firmada' : ''}${pulsable ? ' firma-pulsable' : ''}`}
            onClick={pulsable ? (ev) => { if (!(ev.target as HTMLElement).closest('button')) setPreFirma(b); } : undefined}>
            <div className="firma-head">
              <div className="firma-tit">{b.titulo}<span className="cas-quien">Firma: {b.firmante}</span><span className="cas">{b.casilla}{b.lugar ? ` · ${b.lugar}` : ''}</span></div>
              {!f && <button type="button" className="firma-btn" disabled={sinTransportista}
                title={sinTransportista ? 'No se puede firmar hasta que haya transportista asignado' : undefined}
                onClick={() => setPreFirma(b)}>Firmar</button>}
            </div>
            {/* El transportista con sus matrículas a la vista (usuario, 2026-11-11):
                arriba ya sale su nombre y aquí también; si faltan, en rojo. */}
            {b.rol === 'transportista' && (cmr.matricula_camion
              ? <div className="firma-estado">Matrículas: <strong>{[cmr.matricula_camion, cmr.matricula_remolque].filter(Boolean).join(' / ')}</strong></div>
              : !cmr.manual && <div className="firma-estado" style={{ color: '#b91c1c', fontWeight: 800 }}>⚠ Faltan matrículas — se piden al firmar</div>)}
            {f ? <>
              {trazos[f.ruta] && <div className="firma-img"><img src={trazos[f.ruta]} alt="Firma" /></div>}
              <div className="firma-estado">✓ Firmada el {fechaHora(f.firmado_en)} por {f.nombre} · {f.documento}{f.documento_pais && f.documento_pais !== 'XX' ? ` (${f.documento_pais})` : ''}</div>
            </> : <div className="firma-estado">Pendiente de firma</div>}
            {(cmr.reservas ?? []).filter((r: ReservaCmr) => r.rol === b.rol && (b.rol === 'transportista' || r.parada_id === b.parada_id)).map((r: ReservaCmr, i: number) => (
              <div key={i} className="firma-estado" style={{ color: '#b91c1c', fontWeight: 700 }}>⚠ Reservas: {r.texto}</div>
            ))}
          </div>
        );
      })}
      {extras.map((f, i) => (
        <div key={`x${i}`} className="firma firmada">
          <div className="firma-head">
            <div className="firma-tit">Firma extra {extras.length > 1 ? i + 1 : ''}<span className="cas-quien">Firma: {nombreBloque(f)}</span><span className="cas">Añadida a las casillas del CMR</span></div>
          </div>
          {trazos[f.ruta] && <div className="firma-img"><img src={trazos[f.ruta]} alt="Firma" /></div>}
          <div className="firma-estado">✓ Firmada el {fechaHora(f.firmado_en)} por {f.nombre} · {f.documento}{f.documento_pais && f.documento_pais !== 'XX' ? ` (${f.documento_pais})` : ''}</div>
        </div>
      ))}
      {extras.length < 3 && (
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
              <button type="button" className="firma-btn" disabled={sinTransportista}
                title={sinTransportista ? 'No se puede firmar hasta que haya transportista asignado' : undefined}
                onClick={() => setEligiendoExtra(true)}>+ Añadir</button>
            </div>
          )}
        </div>
      )}
      <div className={`banner-ok${hechas === bloques.length ? ' show' : ''}`}>✓ CMR completamente firmado — todas las partes han quedado registradas.</div>
      {firmoAqui && <div style={{ margin: '0.8rem 0 0' }}>{btnFin}</div>}
      <p className="foot">Cada firma queda registrada con la fecha y la hora del servidor, el documento de quien firma y desde dónde se firmó (y tu ubicación GPS si das permiso). Firma electrónica simple (Reglamento eIDAS).</p>
      <Ayuda />
      {preFirma && (
        <div role="alertdialog" aria-modal="true" aria-label="Aviso antes de firmar"
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,2,48,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.2rem' }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '1.3rem 1.2rem', maxWidth: 380, width: '100%', textAlign: 'center', boxShadow: '0 24px 60px rgba(10,2,48,0.35)', borderTop: '5px solid #d97706' }}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ margin: '0 auto 0.5rem', display: 'block' }}>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h2 style={{ margin: '0 0 0.2rem', fontSize: '1.05rem' }}>Vas a firmar como {preFirma.firmante}</h2>
            <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', color: 'var(--gray-500)' }}>{preFirma.titulo}{preFirma.lugar ? ` · ${preFirma.lugar}` : ''}</p>
            <p style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.5, textAlign: 'left' }}>
              La firma queda asociada a tu persona de forma inequívoca: se registran <strong>tu dispositivo</strong>, la <strong>fecha y hora</strong> y el
              <strong> nombre y documento</strong> que pongas.
            </p>
            <p style={{ margin: '0 0 0.9rem', fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.5, textAlign: 'left' }}>
              <strong>Si no eres tú quien debe firmar, no firmes:</strong>{' '}
              <strong style={{ color: '#b91c1c' }}>el dispositivo queda registrado y firmar por otra persona te haría responsable en caso de fraude.</strong>
            </p>
            <button type="button" className="firma-btn" style={{ width: '100%', marginBottom: '0.5rem', padding: '0.95rem 1rem', fontSize: '1.05rem', borderRadius: 12 }}
              onClick={() => { setAbierto(preFirma); setPreFirma(null); }}>Firmar</button>
            <button type="button" className="firma-btn" style={{ width: '100%', background: '#fff', color: 'var(--gray-700)', border: '1.5px solid var(--gray-300)', padding: '0.95rem 1rem', fontSize: '1.05rem', borderRadius: 12 }}
              onClick={() => setPreFirma(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {abierto && <PantallaFirma token={token} b={abierto} onCerrar={() => setAbierto(null)} onFirmado={() => { setAbierto(null); setFirmoAqui(true); refrescar(); }} />}
    </div>
  );
}

function PantallaFirma({ token, b, onCerrar, onFirmado }: { token: string; b: Bloque; onCerrar: () => void; onFirmado: () => void }) {
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
  // Matrículas (usuario, 2026-11-11): solo la cabecera (transportista o cargador de la
  // 1.ª parada) las ve — precargadas si el envío ya las tiene, editables, y obligatoria
  // la tractora salvo en envíos manuales. En firmas extra no salen: ya está en tránsito.
  const pideMatricula = !!b.conMatricula && !b.extra;
  const [matCam, setMatCam] = useState(b.matCam ?? '');
  const [matRem, setMatRem] = useState(b.matRem ?? '');
  const [reservas, setReservas] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
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
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
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
    x.lineWidth = 2.6; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#0a0230'; x.fillStyle = '#fff';
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
    if (pideMatricula && b.matObligatoria && !matCam.trim()) {
      setAviso('Pon la matrícula del camión (tractora): sin ella no se puede salir de la 1.ª parada.');
      avisaFaltas(['sigMatCam']); return;
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
        try {
          // La dirección aproximada de esas coordenadas (geocodificado inverso de OSM).
          const rg = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=es&lat=${g.lat}&lon=${g.lon}`);
          const j = (await rg.json()) as { display_name?: string };
          if (j?.display_name) g.direccion = String(j.display_name).slice(0, 300);
        } catch { /* sin dirección: las coordenadas bastan */ }
        return g;
      } catch { return null; }
    })();
    const r = await firmar(token, { parada_id: b.parada_id, rol: b.rol, nombre, documento: doc, pais, email, extra: !!b.extra,
      reservas: b.extra ? '' : reservas, fotos: !b.extra && reservas.trim() ? fotos.map((f) => f.ruta) : [], png: canvas.current!.toDataURL('image/png'),
      gps, matricula_camion: pideMatricula ? matCam : undefined, matricula_remolque: pideMatricula ? matRem : undefined });
    setGuardando(false);
    if (!r.ok) { setAviso(r.error); return; }
    onFirmado();
  }

  return (
    <div className="sigov show" role="dialog" aria-modal="true" aria-label="Firmar el CMR">
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
        <label className="sig-lbl" htmlFor="sigEmail">Email <Req si={false} /></label>
        <input type="text" id="sigEmail" autoComplete="off" inputMode="email" placeholder="Ej. nombre@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        {/* Matrículas en la CABECERA (usuario, 2026-11-11): el DeCA debe existir antes de
            salir de la 1.ª parada — verifica, corrige o ponlas; luego ya no se tocan. */}
        {pideMatricula && <>
          <label className="sig-lbl" htmlFor="sigMatCam">Matrículas del camión {b.matObligatoria ? <Req /> : <Req si={false} />}</label>
          <div className="sig-row">
            <input type="text" id="sigMatCam" autoComplete="off" autoCapitalize="characters" placeholder="Tractora · Ej. 1234 BCD"
              value={matCam} onChange={(e) => setMatCam(e.target.value.toUpperCase())} />
            <input type="text" id="sigMatRem" autoComplete="off" autoCapitalize="characters" placeholder="Remolque (opcional)" aria-label="Matrícula del remolque (opcional)"
              value={matRem} onChange={(e) => setMatRem(e.target.value.toUpperCase())} />
          </div>
          <div className="sig-msg warn">
            {b.matCam
              ? 'Verifica que las matrículas son las del camión que se lleva la mercancía; aquí puedes corregirlas. Después ya no se pueden cambiar.'
              : 'El envío aún no tiene matrículas: ponlas aquí. Sin ellas el camión no puede salir de la 1.ª parada (documento de control DeCA).'}
          </div>
        </>}
        {/* Las reservas son de la casilla principal: una firma extra no las anota. */}
        {!b.extra && <>
        <label className="sig-lbl" htmlFor="sigReservas">Reservas <Req si={false} /></label>
        {/* Una línea que crece sola con el texto hasta 5 líneas (luego, scroll) y máximo
            300 caracteres (usuario, 2026-11-10). */}
        <textarea id="sigReservas" rows={1} maxLength={300} placeholder="Ej. faltan 2 palets; film roto" value={reservas}
          onChange={(e) => { setReservas(e.target.value.slice(0, 300)); const t = e.target; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 127)}px`; }}
          style={{ width: '100%', boxSizing: 'border-box', border: reservas.trim() ? '1.5px solid #dc2626' : undefined, borderRadius: 10, padding: '0.5rem 0.6rem', font: 'inherit',
            resize: 'none', overflowY: 'auto', lineHeight: 1.35 }} />
        {reservas.trim() && <>
          <div className="sig-msg err">Se avisa a Dynamo al momento. Haz fotos y, si eres el destinatario, no termines la descarga sin hablar con nosotros ({CONTACTO.telefono}).</div>
          {/* Cámara y galería en la misma fila: las fotos se verán en la incidencia del envío. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
            <label className="sig-foto-btn">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
              Cámara
              <input type="file" accept="image/*" capture="environment" hidden disabled={subiendo || fotos.length >= 6} onChange={(e) => { void subirFotos(e.target.files); e.target.value = ''; }} />
            </label>
            <label className="sig-foto-btn">
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
          onPointerDown={(e) => { e.preventDefault(); const x = ctx.current; if (!x) return; trazando.current = true; canvas.current!.setPointerCapture(e.pointerId); const p = pos(e); x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x + 0.1, p.y + 0.1); x.stroke(); setDibujado(true); }}
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
        {/* Aceptar GRANDE y en verde arriba; Cancelar y Borrar debajo (usuario, 2026-11-10). */}
        <div className="sigbtns">
          <button type="button" className="b-aceptar" disabled={!dibujado || guardando} onClick={aceptar}>{guardando ? 'Guardando…' : 'Aceptar firma'}</button>
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
      {verPrivacidad && (
        <div className="privov" role="dialog" aria-modal="true" aria-label="Política de privacidad"
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
