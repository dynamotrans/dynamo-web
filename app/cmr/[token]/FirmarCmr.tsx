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
import type { CmrPublico, ParadaCmr, FirmaCmr, ReservaCmr } from './tipos';
import Req from '@/components/Req';
import { avisaFaltas } from '@/lib/faltas';

type Bloque = { clave: string; titulo: string; casilla: string; firmante: string; rol: DatosFirma['rol']; parada_id: string | null; pre: string; preEmail: string; lugar?: string; extra?: boolean };

export default function FirmarCmr({ token, cmr, trazos }: { token: string; cmr: CmrPublico; trazos: Record<string, string> }) {
  const refrescar = useRefrescar();
  const [abierto, setAbierto] = useState<Bloque | null>(null);
  // Firma EXTRA (usuario, 2026-11-09): hasta 3 además de las casillas de siempre. Se elige
  // la casilla y se abre la pantalla de firma normal; no ocupa la casilla ni anota reservas.
  const [eligiendoExtra, setEligiendoExtra] = useState(false);

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
  const bloques: Bloque[] = [
    ...rec.map((p, i) => ({ clave: `remitente:${p.id}`, titulo: `Recogida ${rec.length > 1 ? i + 1 : ''}`.trim(), casilla: 'Casilla 22 · firma y sello', firmante: 'Remitente / Cargador', rol: 'remitente' as const, parada_id: p.id, pre: p.contacto ?? '', preEmail: p.email ?? '', lugar: lugar(p) })),
    { clave: 'transportista:', titulo: 'Transportista', casilla: 'Casilla 23 · firma y sello', firmante: 'Porteador / Transportista', rol: 'transportista', parada_id: null, pre: cmr.conductor ?? '', preEmail: cmr.transportista_email ?? '' },
    ...ent.map((p, i) => ({ clave: `destinatario:${p.id}`, titulo: `Entrega ${ent.length > 1 ? i + 1 : ''}`.trim(), casilla: 'Casilla 24 · recibí de la mercancía', firmante: 'Destinatario', rol: 'destinatario' as const, parada_id: p.id, pre: p.contacto ?? '', preEmail: p.email ?? '', lugar: lugar(p) })),
  ];
  const firmas = new Map<string, FirmaCmr>((cmr.firmas ?? []).filter((f) => !f.extra).map((f) => [`${f.rol}:${f.parada_id ?? ''}`, f]));
  const extras = (cmr.firmas ?? []).filter((f) => f.extra);
  const hechas = bloques.filter((b) => firmas.has(b.clave)).length;
  const nombreBloque = (f: FirmaCmr) => bloques.find((b) => b.rol === f.rol && (f.rol === 'transportista' || b.parada_id === f.parada_id))?.titulo
    ?? (f.rol === 'remitente' ? 'Recogida' : f.rol === 'transportista' ? 'Transportista' : 'Entrega');

  return (
    <div className="card">
      {!cmr.manual && <div className="brand"><img src="/images/2.png" alt="Dynamo" /></div>}
      <h1>CMR digital</h1>
      <p className="sub">Carta de porte del envío <strong>{cmr.referencia}</strong> · firma cada parte con el dedo</p>
      <dl className="cmrbox">
        <dt>Remitente</dt><dd>{cmr.remitente || '—'}</dd>
        <dt>Porteador</dt><dd>{cmr.porteador || '—'}</dd>
        {(cmr.transportista || cmr.matricula) && <><dt>Transportista efectivo</dt><dd>{[cmr.transportista, cmr.matricula].filter(Boolean).join(' · ')}</dd></>}
        <dt>Recogida</dt><dd>{rec.map(lugar).join(' / ') || '—'}</dd>
        <dt>Entrega</dt><dd>{ent.map(lugar).join(' / ') || '—'}</dd>
        <dt>Fecha de carga</dt><dd>{fecha(cmr.fecha_carga)}</dd>
        <dt>Mercancía</dt><dd>{[cmr.mercancia, cmr.metros_lineales != null && `${metros(cmr.metros_lineales)}`, cmr.toneladas != null && pesoTn(cmr.toneladas)].filter(Boolean).join(' · ') || '—'}</dd>
        {cmr.adr && <div className="adr">⚠ MERCANCÍA ADR (peligrosa) — transporte sujeto al Acuerdo ADR</div>}
      </dl>
      <div className="prog">{hechas === bloques.length ? <span className="done-all">✓ {hechas} de {bloques.length} firmas completadas</span> : `${hechas} de ${bloques.length} firmas completadas`}</div>
      {bloques.map((b) => {
        const f = firmas.get(b.clave);
        return (
          <div key={b.clave} className={`firma${f ? ' firmada' : ''}`}>
            <div className="firma-head">
              <div className="firma-tit">{b.titulo}<span className="cas-quien">Firma: {b.firmante}</span><span className="cas">{b.casilla}{b.lugar ? ` · ${b.lugar}` : ''}</span></div>
              {!f && <button type="button" className="firma-btn" onClick={() => setAbierto(b)}>Firmar</button>}
            </div>
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
                    onClick={() => { setEligiendoExtra(false); setAbierto({ ...b, clave: `extra:${b.clave}`, titulo: `Firma extra · ${b.titulo}`, extra: true }); }}>
                    {b.titulo} · {b.firmante}{b.lugar ? ` · ${b.lugar.split(' · ')[0]}` : ''}
                  </button>
                ))}
                <button type="button" className="firma-btn" style={{ width: '100%', background: '#fff', color: 'var(--gray-700)', border: '1.5px solid var(--gray-300)' }} onClick={() => setEligiendoExtra(false)}>Cancelar</button>
              </div>
            </>
          ) : (
            <div className="firma-head">
              <div className="firma-tit">Firma extra<span className="cas">Otra persona que también firma (hasta 3): elige su casilla y firma como siempre</span></div>
              <button type="button" className="firma-btn" onClick={() => setEligiendoExtra(true)}>+ Añadir</button>
            </div>
          )}
        </div>
      )}
      <div className={`banner-ok${hechas === bloques.length ? ' show' : ''}`}>✓ CMR completamente firmado — todas las partes han quedado registradas.</div>
      <p className="foot">Cada firma queda registrada con la fecha y la hora del servidor, el documento de quien firma y desde dónde se firmó. Firma electrónica simple (Reglamento eIDAS).</p>
      {abierto && <PantallaFirma token={token} b={abierto} onCerrar={() => setAbierto(null)} onFirmado={() => { setAbierto(null); refrescar(); }} />}
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
  const [reservas, setReservas] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
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
    if (!dibujado) { setAviso('Firma con el dedo dentro del recuadro.'); return; }
    setGuardando(true);
    const r = await firmar(token, { parada_id: b.parada_id, rol: b.rol, nombre, documento: doc, pais, email, extra: !!b.extra,
      reservas: b.extra ? '' : reservas, fotos: !b.extra && reservas.trim() ? fotos.map((f) => f.ruta) : [], png: canvas.current!.toDataURL('image/png') });
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
          <input type="text" id="sigDni" autoComplete="off" autoCapitalize="characters" placeholder="12345678Z" value={doc} onChange={(e) => setDoc(e.target.value)} className={v && !v.ok ? 'err' : undefined} />
        </div>
        {v && <div className={`sig-msg ${!v.ok ? 'err' : v.soft ? 'warn' : 'okv'}`}>{!v.ok ? `⚠ ${v.msg}` : v.soft ? `⚠ ${v.soft}` : '✓ Documento válido'}</div>}
        <label className="sig-lbl" htmlFor="sigNombre">Nombre y apellidos <Req /></label>
        <input type="text" id="sigNombre" autoComplete="off" placeholder="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <label className="sig-lbl" htmlFor="sigEmail">Email <Req si={false} /></label>
        <input type="text" id="sigEmail" autoComplete="off" inputMode="email" placeholder="nombre@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        {/* Las reservas son de la casilla principal: una firma extra no las anota. */}
        {!b.extra && <>
        <label className="sig-lbl" htmlFor="sigReservas">Reservas <Req si={false} /></label>
        <textarea id="sigReservas" rows={2} maxLength={1000} placeholder="Ej. faltan 2 palets; 1 palet con el film roto y cajas aplastadas" value={reservas} onChange={(e) => setReservas(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', border: reservas.trim() ? '1.5px solid #dc2626' : undefined, borderRadius: 10, padding: '0.5rem 0.6rem', font: 'inherit' }} />
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
        {/* Información básica de protección de datos (RGPD art. 13): quien firma da su nombre y DNI. */}
        <p className="hint" style={{ marginTop: '0.6rem', fontSize: '0.78rem', lineHeight: 1.45 }}>
          <strong>Protección de datos:</strong> Dynamo guarda tu nombre, documento, firma, email (si lo pones) y la hora y desde dónde firmas,
          como prueba de la carga o la entrega en el CMR (contrato de transporte y Convenio CMR), durante 6 años. Puedes ejercer tus derechos
          en {CONTACTO.email}. <button type="button" className="sig-link" onClick={() => setVerPrivacidad(true)}>Política de privacidad</button>.
        </p>
        <div className="sigbtns">
          <button type="button" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="button" className="b-borrar" onClick={preparar} disabled={guardando}>Borrar</button>
          <button type="button" className="b-aceptar" disabled={!dibujado || guardando} onClick={aceptar}>{guardando ? 'Guardando…' : 'Aceptar firma'}</button>
        </div>
      </div>
      {verPrivacidad && (
        <div className="privov" role="dialog" aria-modal="true" aria-label="Política de privacidad"
          onClick={(e) => { if (e.target === e.currentTarget) setVerPrivacidad(false); }}>
          <div className="privcard">
            <button type="button" className="priv-x" aria-label="Cerrar" onClick={() => setVerPrivacidad(false)}>✕</button>
            <h2>Política de privacidad · firma del CMR</h2>
            <p><strong>Responsable:</strong> Dynamo Operador Logístico, S.L. · {CONTACTO.email} · {CONTACTO.telefono}.</p>
            <p><strong>Qué guardamos:</strong> tu nombre y apellidos, el documento de identidad, el trazo de la firma, el email (si lo pones),
              la fecha y la hora, y desde dónde firmas (dirección IP y navegador). Si anotas reservas, también su texto y sus fotos.</p>
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
