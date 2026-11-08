'use client';

import { useState } from 'react';
import Modal from '../Modal';
import Cargando from '@/components/Cargando';
import { euros, fechaHora } from '@/lib/formato';
import { cancelarEnvio } from '@/app/panel/(app)/envios/acciones';
import { I, ICO, SubProps } from './comun';

// ---- Cancelar -----------------------------------------------------------------------
export function Cancelar({ ficha, onVolver, hacer, trabajando, fallo }: SubProps) {
  const e = ficha.envio;
  const [motivo, setMotivo] = useState('');
  const conCamion = !!ficha.transportista && !e.es_manual;
  const fuera = conCamion && ficha.corte != null && new Date() >= new Date(ficha.corte);
  return (
    <Modal abierto onCerrar={onVolver} titulo={`Cancelar envío #${e.referencia_gx}`} sub={ficha.cliente?.nombre} icono={<I d={ICO.x} />}
      pie={<>
        <button className="btn-ghost" onClick={onVolver} disabled={!!trabajando}>No, volver</button>
        <button className="btn-primary" style={{ background: 'var(--red)' }} disabled={!!trabajando}
          onClick={() => hacer('Cancelando el envío', () => cancelarEnvio(e.id, motivo))}>Sí, cancelar envío</button>
      </>}>
      <div className="modal-warn-box" style={fuera ? { background: 'rgba(220,38,38,0.08)', borderColor: 'rgba(220,38,38,0.4)' } : undefined}>
        {fuera
          ? <><strong style={{ color: '#b42318' }}>Fuera de plazo, con camión asignado:</strong> pasó la hora límite ({fechaHora(ficha.corte)}). Se generará la <strong>penalización de cancelación por el coste completo</strong>{e.importe_cliente != null ? <> ({euros(e.importe_cliente)} sin IVA)</> : null}, pendiente de confirmar: se puede renegociar o anular en Penalizaciones.</>
          : conCamion
            ? <>Dentro de plazo: <strong>sin coste</strong> para el cliente. La hora límite para cancelar gratis es <strong>{ficha.corte ? fechaHora(ficha.corte) : '—'}</strong> (9:00 del día hábil anterior a la carga).</>
            : <>Sin transportista asignado: se cancela <strong>sin coste</strong>.</>}
      </div>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="ca-motivo">Motivo (queda en el historial)</label>
          <textarea id="ca-motivo" rows={3} value={motivo} placeholder="Ej. el cliente ya no tiene la mercancía" onChange={(ev) => setMotivo(ev.target.value)} />
        </div>
      </div>
      <div className={ficha.enVistaCliente ? 'pt-aviso error' : 'pt-aviso info'} style={{ marginTop: '0.6rem' }}><div>
        {ficha.enVistaCliente
          ? <><strong>Estás en la vista del cliente:</strong> cuenta como si lo cancelara él (por ejemplo, porque te ha llamado), también para su suspensión automática.</>
          : <><strong>Estás en gestión interna:</strong> cuenta como cancelación de Dynamo (no le afecta al cliente). Si te lo ha pedido el cliente, cancélalo desde su vista («Ver como» → el cliente).</>}
      </div></div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>Se puede deshacer desde la ficha: el envío vuelve al estado que tenía.</p>
      {fallo && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.6rem' }}>⚠ {fallo}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
