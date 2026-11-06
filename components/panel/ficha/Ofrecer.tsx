'use client';

import { useState } from 'react';
import Modal from '../Modal';
import Cargando from '@/components/Cargando';
import { euros, numero } from '@/lib/formato';
import { NEGOCIACION } from '@/lib/envios';
import type { Ficha, TransportistaOpcion } from '@/lib/fichaEnvio';
import { ofrecerCarga } from '@/app/panel/(app)/envios/acciones';
import { CANALES, I, ICO, Interruptor, aNum, enlaceOferta, mensajeOferta } from './comun';

// ---- Ofrecer carga ------------------------------------------------------------------
export function Ofrecer({ ficha, transportistas, onVolver }: { ficha: Ficha; transportistas: TransportistaOpcion[]; onVolver: () => void }) {
  const e = ficha.envio;
  const sugerido = e.importe_transportista != null ? Number(e.importe_transportista)
    : e.importe_cliente != null ? Math.round((Number(e.importe_cliente) * 0.8) / 10) * 10 : null;
  const [para, setPara] = useState<string>('bolsa');
  const [canal, setCanal] = useState<string>('bolsa_wtransnet');
  const [precio, setPrecio] = useState(numero(sugerido, 2));
  const [banda, setBanda] = useState<number>(e.negociacion_pct ?? 10);
  const [pronto, setPronto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [hecho, setHecho] = useState<{ token: string; precio: number } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const t = transportistas.find((x) => x.id === para);
  const activos = transportistas.filter((x) => x.estado === 'activo');
  const pv = aNum(precio);
  const bandaEur = pv && banda ? Math.max(10, Math.round((pv * banda) / 100 / 10) * 10) : 0;
  const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null;

  async function crear() {
    setError(null);
    if (pv == null || Number.isNaN(pv) || pv <= 0) { setError('Pon el precio que se ofrece al transportista.'); return; }
    setTrabajando(true);
    const r = await ofrecerCarga(e.id, { transportista_id: para === 'bolsa' ? null : para, canal, precio: pv, banda_pct: banda, pronto_pago: pronto });
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    setHecho({ token: r.token, precio: pv });
  }

  if (hecho) {
    const msg = mensajeOferta(ficha, hecho.precio, hecho.token);
    const tel = t?.telefono?.replace(/[^\d]/g, '');
    return (
      <Modal abierto onCerrar={onVolver} titulo="Oferta creada" sub={`#${e.referencia_gx} · ${t ? t.nombre : CANALES[canal]}`} icono={<I d={ICO.enviar} />}
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
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
          <button className="btn-primary" onClick={() => { navigator.clipboard?.writeText(msg); setCopiado(true); }}>{copiado ? 'Copiado' : 'Copiar mensaje'}</button>
          <a className="btn-secondary" href={`https://wa.me/${tel ?? ''}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">WhatsApp{t && !tel ? ' (sin teléfono en su ficha)' : ''}</a>
          <a className="btn-secondary" href={`mailto:${t?.email ?? ''}?subject=${encodeURIComponent(`Envío disponible #${e.referencia_gx}`)}&body=${encodeURIComponent(msg)}`}>Email</a>
        </div>
        <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>
          El mensaje no lleva el cliente ni las direcciones: el transportista las ve al aceptar. Las aperturas del enlace y quién la acepta quedan en la ficha.
          El envío automático por WhatsApp y email llegará con los avisos (NOTIFICACIONES.md).
        </p>
      </Modal>
    );
  }
  return (
    <Modal abierto onCerrar={onVolver} titulo={`Ofrecer envío · #${e.referencia_gx}`} sub="Crea un enlace para que un transportista lo acepte" icono={<I d={ICO.enviar} />}
      pie={<>
        <button className="btn-ghost" onClick={onVolver} disabled={trabajando}>Volver</button>
        <button className="btn-primary" onClick={crear} disabled={trabajando}>Crear oferta y enlace</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="of-para">Para</label>
          <select id="of-para" value={para} onChange={(ev) => { setPara(ev.target.value); setCanal(ev.target.value === 'bolsa' ? 'bolsa_wtransnet' : 'whatsapp'); }}>
            <option value="bolsa">Bolsa de cargas · enlace abierto (se identifican con su CIF)</option>
            {activos.map((x) => <option key={x.id} value={x.id}>{x.nombre} · {x.cif}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="of-canal">Por dónde se le manda</label>
          <select id="of-canal" value={canal} onChange={(ev) => setCanal(ev.target.value)}>
            {(para === 'bolsa' ? ['bolsa_wtransnet', 'bolsa_teleroute', 'bolsa_otra'] : ['whatsapp', 'email', 'telefono']).map((c) => <option key={c} value={c}>{CANALES[c]}</option>)}
          </select>
        </div>
        <div>
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
      {t && !t.telefono && canal === 'whatsapp' && <div className="modal-warn-box" style={{ marginTop: '0.8rem' }}>Este transportista no tiene teléfono de tráfico en su ficha: el WhatsApp se abrirá sin destinatario.</div>}
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto="Creando la oferta" />}
    </Modal>
  );
}
