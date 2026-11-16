'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  // Desde 2026-11-15 la gobierna la fecha de carga: arranque días antes, cadencia por
  // tramos, recordatorio diario y corte horas antes de la hora de carga (esta hora la
  // pone Dynamo aquí; sin ponerla, se asumen las 8:00).
  const dif = ficha.difusion;
  const [difMsg, setDifMsg] = useState<string | null>(null);
  const [horaCarga, setHoraCarga] = useState('');   // vacío = hasta el cierre del sitio de carga
  const [pideForzar, setPideForzar] = useState<string | null>(null);
  const fmtTs = (x: string | null) => x ? new Date(x).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : null;
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

  async function lanzarEscalonada(forzar = false) {
    setError(null); setDifMsg(null); setPideForzar(null);
    if (pv == null || Number.isNaN(pv) || pv <= 0) { setError('Pon el precio que se ofrece al transportista.'); return; }
    setTrabajando(true);
    const r = await iniciarDifusion(e.id, { precio: pv, banda_pct: banda, pronto_pago: pronto, hora_carga: e.fecha_carga_desde && horaCarga ? horaCarga : null, forzar });
    setTrabajando(false);
    if (!r.ok) {
      if (r.dentroCorte) { setPideForzar(r.error); return; }
      setError(r.error); return;
    }
    setDifMsg(r.empieza
      ? `Oferta escalonada programada: los emails empiezan el ${r.empieza} (días antes de la carga) y siguen hasta el ${r.corte ?? '—'}.`
      : `Oferta escalonada lanzada: el primer email sale ya (de 5:30 a 23:30, los 365 días)${r.corte ? ` y sigue hasta el ${r.corte}` : ''}. La ficha va contando los contactados.`);
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
      {/* Oferta ESCALONADA por email, gobernada por la fecha de carga (usuario,
          2026-11-15): con el precio, banda y pronto pago de arriba, la plataforma empieza
          unos días antes de la carga, manda más seguido cuanto menos falte (de 5:00 a
          23:00), recuerda a diario a los contactados y corta unas horas antes de la hora
          de carga. Ranking: quien hizo esta ruta primero, después favoritos, valoración y
          sede en la provincia del origen o del destino o colindante. */}
      <div style={{ marginTop: '0.9rem', padding: '0.8rem 0.9rem', border: '1px solid var(--gray-200)', borderRadius: 12, background: 'var(--gray-50)' }}>
        <div style={{ fontWeight: 800, marginBottom: '0.25rem' }}>Oferta escalonada por email</div>
        {dif?.estado === 'activa' ? (
          <>
            <div style={{ fontSize: 'var(--fs-s)', color: 'var(--purple)', fontWeight: 800 }}>
              {dif.empieza_en && new Date(dif.empieza_en) > new Date()
                ? <>Programada · los emails empiezan el {fmtTs(dif.empieza_en)} · {euros(dif.precio)} + IVA</>
                : dif.contactados === 0 && dif.bolsa?.espera === 'bolsa'
                ? <>Esperando a la bolsa · los emails no salen hasta que el envío esté publicado · {euros(dif.precio)} + IVA</>
                : dif.contactados === 0 && dif.bolsa?.espera && dif.bolsa.desde
                ? <>La bolsa va primero · los emails empiezan el {fmtTs(dif.bolsa.desde)} · {euros(dif.precio)} + IVA</>
                : <>En marcha · {dif.contactados} de {dif.max_contactados} transportistas contactados · {euros(dif.precio)} + IVA</>}
            </div>
            {/* La bolsa va primero (usuario, 2026-11-16): qué falta para que arranquen. */}
            {dif.contactados === 0 && dif.bolsa?.espera === 'bolsa' && (
              <div className="wiz-warn show" style={{ margin: '0.35rem 0' }}>
                Súbelo a la bolsa desde <Link href="/panel/exportaciones" style={{ fontWeight: 800 }}>Exportaciones</Link> y márcalo como publicado: los emails a tus transportistas salen un margen después (3 h si faltan 3 días o más, 2 h a 2 días, 15 min si carga mañana y 5 min si carga hoy). Si la carga es hoy o mañana, salen aunque no esté publicado.
              </div>
            )}
            <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.2rem 0 0.5rem' }}>
              Más seguido cuanto menos falte para la carga (de 5:30 a 23:30, los 365 días), con recordatorio diario a los contactados{dif.corte_en ? <>, hasta el <strong>{fmtTs(dif.corte_en)}</strong></> : null}. Autónomos primero; después quien hizo esta ruta o una parecida, sede en la provincia del origen o del destino o colindante, y favoritos y valoración como desempate. Para sola en cuanto uno acepte o asignes a mano; si el envío se queda luego sin transportista, se reanuda sola.
            </div>
            <button type="button" className="btn-ghost" style={{ color: '#dc2626', fontWeight: 700 }} onClick={pararEscalonada} disabled={trabajando}>Parar la oferta escalonada</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginBottom: '0.5rem' }}>
              <strong>Primero la bolsa:</strong> los emails no salen hasta que el envío esté publicado en la bolsa y pase su margen. Con este mismo precio, la plataforma empieza a mandar emails unos días antes de la carga, más seguido cuanto menos falte (de 5:30 a 23:30, los 365 días), con recordatorio diario a los contactados, <strong>hasta la hora de carga</strong>. <strong>Autónomos primero</strong> (DNI, no CIF de empresa); después quien hizo esta ruta o una parecida, sede en la provincia del origen o del destino o colindante, y favoritos y valoración como desempate. <strong>Para en cuanto uno acepta</strong> o asignes a mano, y se reanuda sola si el envío se queda luego sin transportista.
            </div>
            {dif && dif.estado !== 'aceptada' && dif.fin_motivo && (
              <div style={{ fontSize: 'var(--fs-s)', color: '#b45309', marginBottom: '0.5rem' }}>Última: {dif.fin_motivo} ({dif.contactados} contactados)</div>
            )}
            {e.fecha_carga_desde && (
              <div style={{ marginBottom: '0.5rem' }}>
                <label htmlFor="of-hora-carga">Hora límite de los emails <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· opcional</span></label>
                <input id="of-hora-carga" type="time" value={horaCarga} onChange={(ev) => setHoraCarga(ev.target.value)} style={{ maxWidth: 140 }} />
                <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.2rem' }}>Si la dejas vacía, los emails siguen hasta que <strong>cierra el sitio de carga</strong> el día de carga (con ventana de varios días, el último). Pon una hora solo si hay que tener el camión antes (una cita, por ejemplo).</div>
              </div>
            )}
            {pideForzar ? (
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                <div className="wiz-warn show" role="alert">⚠ {pideForzar}</div>
                <div style={{ display: 'flex', gap: '0.45rem' }}>
                  <button type="button" className="btn-secondary" onClick={() => lanzarEscalonada(true)} disabled={trabajando}>Lanzarla igualmente (1 h)</button>
                  <button type="button" className="btn-ghost" onClick={() => setPideForzar(null)} disabled={trabajando}>No, lo muevo por teléfono</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn-secondary" onClick={() => lanzarEscalonada()} disabled={trabajando}>Lanzar oferta escalonada</button>
            )}
          </>
        )}
      </div>
      {difMsg && <div role="status" style={{ marginTop: '0.6rem', padding: '0.6rem 0.75rem', background: '#e8f6ee', border: '1px solid #b7e2c8', borderRadius: 9, color: '#0f6b3a', fontSize: 'var(--fs-m)', fontWeight: 700 }}>{difMsg}</div>}
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto="Un momento" />}
    </Modal>
  );
}
