'use client';

import { pesoTn, metros, fecha, fechaHora } from '@/lib/formato';

// CMR digital, copiado de firmar-cmr.html: resumen del CMR, un bloque por casilla (22 cada
// recogida · 23 transportista · 24 cada entrega) y la pantalla de firma con el dedo, con el
// documento de identidad validado por país. La firma la guarda el servidor (acciones.ts).
import { useEffect, useRef, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import { firmar, type DatosFirma } from './acciones';
import { DOC_PAISES, validaDoc } from '@/lib/documentoIdentidad';
import { CONTACTO } from '@/lib/atencion';
import type { CmrPublico, ParadaCmr, FirmaCmr, ReservaCmr } from './tipos';

type Bloque = { clave: string; titulo: string; casilla: string; firmante: string; rol: DatosFirma['rol']; parada_id: string | null; pre: string; };

export default function FirmarCmr({ token, cmr, trazos }: { token: string; cmr: CmrPublico; trazos: Record<string, string> }) {
  const refrescar = useRefrescar();
  const [abierto, setAbierto] = useState<Bloque | null>(null);

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
    ...rec.map((p, i) => ({ clave: `remitente:${p.id}`, titulo: `Recogida ${rec.length > 1 ? i + 1 : ''}`.trim(), casilla: 'Casilla 22 · firma y sello', firmante: 'Remitente / Cargador', rol: 'remitente' as const, parada_id: p.id, pre: p.contacto ?? '' })),
    { clave: 'transportista:', titulo: 'Transportista', casilla: 'Casilla 23 · firma y sello', firmante: 'Porteador / Transportista', rol: 'transportista', parada_id: null, pre: cmr.conductor ?? '' },
    ...ent.map((p, i) => ({ clave: `destinatario:${p.id}`, titulo: `Entrega ${ent.length > 1 ? i + 1 : ''}`.trim(), casilla: 'Casilla 24 · recibí de la mercancía', firmante: 'Destinatario', rol: 'destinatario' as const, parada_id: p.id, pre: p.contacto ?? '' })),
  ];
  const firmas = new Map<string, FirmaCmr>((cmr.firmas ?? []).map((f) => [`${f.rol}:${f.parada_id ?? ''}`, f]));
  const hechas = bloques.filter((b) => firmas.has(b.clave)).length;

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
              <div className="firma-tit">{b.titulo}<span className="cas-quien">Firma: {b.firmante}</span><span className="cas">{b.casilla}</span></div>
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
  const [email, setEmail] = useState('');
  const [reservas, setReservas] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

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
    if (!doc.trim() || !nombre.trim()) { setAviso('Indica el documento y el nombre y apellidos de quien firma.'); return; }
    if (v && !v.ok) { setAviso(v.msg || 'El documento no es válido.'); return; }
    if (!dibujado) { setAviso('Firma con el dedo dentro del recuadro.'); return; }
    setGuardando(true);
    const r = await firmar(token, { parada_id: b.parada_id, rol: b.rol, nombre, documento: doc, pais, email, reservas, png: canvas.current!.toDataURL('image/png') });
    setGuardando(false);
    if (!r.ok) { setAviso(r.error); return; }
    onFirmado();
  }

  return (
    <div className="sigov show" role="dialog" aria-modal="true" aria-label="Firmar el CMR">
      <div className="sigcard">
        <h2>Firmar {b.titulo.toLowerCase()}</h2>
        <label className="sig-lbl" htmlFor="sigDni">Documento de identidad *</label>
        <div className="sig-row">
          <select id="sigDocPais" aria-label="País del documento" value={pais} onChange={(e) => setPais(e.target.value)}>
            {DOC_PAISES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
          <input type="text" id="sigDni" autoComplete="off" autoCapitalize="characters" placeholder="12345678Z" value={doc} onChange={(e) => setDoc(e.target.value)} className={v && !v.ok ? 'err' : undefined} />
        </div>
        {v && <div className={`sig-msg ${!v.ok ? 'err' : v.soft ? 'warn' : 'okv'}`}>{!v.ok ? `⚠ ${v.msg}` : v.soft ? `⚠ ${v.soft}` : '✓ Documento válido'}</div>}
        <label className="sig-lbl" htmlFor="sigNombre">Nombre y apellidos *</label>
        <input type="text" id="sigNombre" autoComplete="off" placeholder="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <label className="sig-lbl" htmlFor="sigEmail">Email <span className="op">· opcional</span></label>
        <input type="text" id="sigEmail" autoComplete="off" inputMode="email" placeholder="nombre@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="sig-lbl" htmlFor="sigReservas">Reservas <span className="op">· solo si falta algo o hay daños</span></label>
        <textarea id="sigReservas" rows={2} maxLength={1000} placeholder="Ej. faltan 2 palets; 1 palet con el film roto y cajas aplastadas" value={reservas} onChange={(e) => setReservas(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', border: reservas.trim() ? '1.5px solid #dc2626' : undefined, borderRadius: 10, padding: '0.5rem 0.6rem', font: 'inherit' }} />
        {reservas.trim() && <div className="sig-msg err">Se avisa a Dynamo al momento. Haz fotos y, si eres el destinatario, no termines la descarga sin hablar con nosotros ({CONTACTO.telefono}).</div>}
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
          en {CONTACTO.email}. <a href="https://www.dynamotrans.com/#privacidad" target="_blank" rel="noopener">Política de privacidad</a>.
        </p>
        <div className="sigbtns">
          <button type="button" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="button" className="b-borrar" onClick={preparar} disabled={guardando}>Borrar</button>
          <button type="button" className="b-aceptar" disabled={!dibujado || guardando} onClick={aceptar}>{guardando ? 'Guardando…' : 'Aceptar firma'}</button>
        </div>
      </div>
    </div>
  );
}
