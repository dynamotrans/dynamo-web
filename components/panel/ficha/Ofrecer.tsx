'use client';

import { useState } from 'react';
import Modal from '../Modal';
import Cargando from '@/components/Cargando';
import { euros, numero } from '@/lib/formato';
import { NEGOCIACION } from '@/lib/envios';
import type { Ficha } from '@/lib/fichaEnvio';
import { ofrecerCarga, iniciarDifusion, pararDifusion } from '@/app/panel/(app)/envios/acciones';
import { I, ICO, Interruptor, aNum, enlaceOferta, mensajeOferta } from './comun';

// ---- Ofrecer carga ------------------------------------------------------------------
// Una oferta es un envío PUNTUAL del enlace a transportistas (usuario, 2026-11-09): se
// crea el enlace abierto y se manda por WhatsApp o email; quien lo abre se identifica
// con su CIF al aceptar. Sin elegir transportista, sin «bolsa» ni «por dónde se manda»
// (la publicación automática en bolsas, con sus criterios y parámetros, vendrá aparte).
export function Ofrecer({ ficha, onVolver }: { ficha: Ficha; onVolver: () => void }) {
  const e = ficha.envio;
  const sugerido = e.importe_transportista != null ? Number(e.importe_transportista)
    : e.importe_cliente != null ? Math.round((Number(e.importe_cliente) * 0.8) / 10) * 10 : null;
  const [precio, setPrecio] = useState(numero(sugerido, 2));
  const [banda, setBanda] = useState<number>(e.negociacion_pct ?? 10);
  const [pronto, setPronto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  // El enlace nace con el envío (disparador en la base de datos) y es siempre el mismo:
  // si hay una oferta abierta viva, el modal se abre directamente en la pantalla de
  // compartir, con su enlace y su precio (al día). «Ofrecer con otro precio» crea otra.
  const abierta = ficha.ofertas.find((o) => !o.para && o.canal === 'enlace' && o.estado === 'activa' && new Date(o.caduca_en) > new Date());
  const [hecho, setHecho] = useState<{ token: string; precio: number } | null>(
    abierta ? { token: abierta.token, precio: Number(abierta.precio) } : null);
  const [copiado, setCopiado] = useState(false);
  const [copiadoEnlace, setCopiadoEnlace] = useState(false);
  // Oferta escalonada (usuario, 2026-11-12): el estado viene con la ficha (en vivo).
  const dif = ficha.difusion;
  const [difMsg, setDifMsg] = useState<string | null>(null);
  const pv = aNum(precio);
  const bandaEur = pv && banda ? Math.max(10, Math.round((pv * banda) / 100 / 10) * 10) : 0;
  const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null;

  async function crear() {
    setError(null);
    if (pv == null || Number.isNaN(pv) || pv <= 0) { setError('Pon el precio que se ofrece al transportista.'); return; }
    setTrabajando(true);
    const r = await ofrecerCarga(e.id, { transportista_id: null, canal: 'enlace', precio: pv, banda_pct: banda, pronto_pago: pronto });
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    setHecho({ token: r.token, precio: pv });
  }

  async function lanzarEscalonada() {
    setError(null); setDifMsg(null);
    if (pv == null || Number.isNaN(pv) || pv <= 0) { setError('Pon el precio que se ofrece al transportista.'); return; }
    setTrabajando(true);
    const r = await iniciarDifusion(e.id, { precio: pv, banda_pct: banda, pronto_pago: pronto });
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    setDifMsg('Oferta escalonada lanzada: el primer email sale ya (de 5:00 a 23:00) y la ficha va contando los contactados.');
  }

  async function pararEscalonada() {
    setError(null); setDifMsg(null);
    setTrabajando(true);
    const r = await pararDifusion(e.id);
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    setDifMsg('Oferta escalonada parada: no se contacta a nadie más (las ofertas ya enviadas siguen su curso).');
  }

  if (hecho) {
    const msg = mensajeOferta(ficha, hecho.precio, hecho.token);
    return (
      <Modal abierto onCerrar={onVolver} titulo="Oferta creada" sub={`#${e.referencia_gx} · enlace para aceptar`} icono={<I d={ICO.enviar} />}
        pie={<button className="btn-primary" onClick={onVolver}>Volver a la ficha</button>}>
        <div className="ptar-sitio-grid">
          <div style={{ gridColumn: '1/-1' }}>
            <label htmlFor="of-enlace">Enlace para aceptar el envío</label>
            <input id="of-enlace" readOnly value={enlaceOferta(hecho.token)} onFocus={(ev) => ev.target.select()} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label htmlFor="of-msg">Mensaje listo para enviar</label>
            <textarea id="of-msg" readOnly rows={8} value={msg} />
          </div>
        </div>
        {/* UNA sola fila SIEMPRE (usuario, 2026-11-10: con flex-wrap quedaban dos filas y
            la segunda con un botón suelto): rejilla de 4 columnas iguales con etiquetas
            cortas, y «Ofrecer con otro precio…» a lo ancho debajo. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.45rem', marginTop: '0.8rem' }}>
          <button className="btn-primary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} title="Copiar el mensaje entero"
            onClick={() => { navigator.clipboard?.writeText(msg); setCopiado(true); setCopiadoEnlace(false); }}>{copiado ? 'Copiado ✓' : 'Mensaje'}</button>
          <button className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} title="Copiar solo el enlace"
            onClick={() => { navigator.clipboard?.writeText(enlaceOferta(hecho.token)); setCopiadoEnlace(true); setCopiado(false); }}>{copiadoEnlace ? 'Copiado ✓' : 'Enlace'}</button>
          <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">WhatsApp</a>
          <a className="btn-secondary" style={{ padding: '0 0.3rem', minWidth: 0, whiteSpace: 'nowrap' }} href={`mailto:?subject=${encodeURIComponent(`Envío disponible #${e.referencia_gx}`)}&body=${encodeURIComponent(msg)}`}>Email</a>
        </div>
        <div style={{ marginTop: '0.45rem' }}>
          <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setHecho(null); setCopiado(false); setCopiadoEnlace(false); }}>Ofrecer con otro precio…</button>
        </div>
        <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>
          El mensaje no lleva el cliente ni las direcciones: el transportista las ve al aceptar, identificándose con su CIF.
          Las aperturas del enlace y quién lo acepta quedan en la ficha. El envío automático por WhatsApp y email llegará con los avisos (NOTIFICACIONES.md).
        </p>
      </Modal>
    );
  }
  return (
    <Modal abierto onCerrar={onVolver} titulo={`Ofrecer envío · #${e.referencia_gx}`} sub="Crea un enlace y mándaselo al transportista: se identifica con su CIF al aceptar" icono={<I d={ICO.enviar} />}
      pie={<>
        <button className="btn-ghost" onClick={onVolver} disabled={trabajando}>Volver</button>
        <button className="btn-primary" onClick={crear} disabled={trabajando}>Crear oferta y enlace</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="of-precio">Precio ofrecido (€ sin IVA)</label>
          <input id="of-precio" type="text" inputMode="decimal" value={precio} placeholder="Ej. 800" onChange={(ev) => setPrecio(ev.target.value)} />
          {pc != null && pv != null && !Number.isNaN(pv) && <div style={{ fontSize: 'var(--fs-s)', color: pc - pv >= 0 ? '#0f6b3a' : '#dc2626', fontWeight: 700, marginTop: '0.25rem' }}>Margen: {euros(pc - pv)}</div>}
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="of-banda">Negociación del precio</label>
          <select id="of-banda" value={banda} onChange={(ev) => setBanda(Number(ev.target.value))}>
            {NEGOCIACION.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          {bandaEur > 0 && pv && <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.25rem' }}>El transportista puede proponer entre <strong>{euros(pv - bandaEur)}</strong> y <strong>{euros(pv + bandaEur)}</strong> (nunca ve el %). Lo que pase del ±10 % lo apruebas tú.</div>}
        </div>
        <Interruptor k="of-pronto" l="Ofrecer pronto pago" v={pronto} on={setPronto} />
      </div>
      {/* Oferta ESCALONADA por email (usuario, 2026-11-12): con el mismo precio, banda y
          pronto pago de arriba, la plataforma manda un email cada pocos minutos (de 5:00
          a 23:00) a transportistas con sede en la provincia del origen o que ya hicieron
          la ruta — favoritos y mejor valorados primero — y para en cuanto uno acepta. */}
      <div style={{ marginTop: '0.9rem', padding: '0.8rem 0.9rem', border: '1px solid var(--gray-200)', borderRadius: 12, background: 'var(--gray-50)' }}>
        <div style={{ fontWeight: 800, marginBottom: '0.25rem' }}>Oferta escalonada por email</div>
        {dif?.estado === 'activa' ? (
          <>
            <div style={{ fontSize: 'var(--fs-s)', color: 'var(--purple)', fontWeight: 800 }}>
              En marcha · {dif.contactados} de {dif.max_contactados} transportistas contactados · {euros(dif.precio)} + IVA
            </div>
            <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.2rem 0 0.5rem' }}>
              Un email cada {dif.minutos_entre_emails} min (de 5:00 a 23:00) a transportistas de la zona del origen o que ya hicieron la ruta. Para sola en cuanto uno acepte o asignes a mano.
            </div>
            <button type="button" className="btn-ghost" style={{ color: '#dc2626', fontWeight: 700 }} onClick={pararEscalonada} disabled={trabajando}>Parar la oferta escalonada</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginBottom: '0.5rem' }}>
              Con este mismo precio, la plataforma manda un email cada pocos minutos (de 5:00 a 23:00) a transportistas con sede en la provincia del origen o que ya hicieron esta ruta — favoritos y mejor valorados primero — y <strong>para en cuanto uno acepta</strong> o asignes a mano.
            </div>
            {dif && dif.estado !== 'aceptada' && dif.fin_motivo && (
              <div style={{ fontSize: 'var(--fs-s)', color: '#b45309', marginBottom: '0.5rem' }}>Última: {dif.fin_motivo} ({dif.contactados} contactados)</div>
            )}
            <button type="button" className="btn-secondary" onClick={lanzarEscalonada} disabled={trabajando}>Lanzar oferta escalonada</button>
          </>
        )}
      </div>
      {difMsg && <div role="status" style={{ marginTop: '0.6rem', padding: '0.6rem 0.75rem', background: '#e8f6ee', border: '1px solid #b7e2c8', borderRadius: 9, color: '#0f6b3a', fontSize: 'var(--fs-m)', fontWeight: 700 }}>{difMsg}</div>}
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto="Un momento" />}
    </Modal>
  );
}
