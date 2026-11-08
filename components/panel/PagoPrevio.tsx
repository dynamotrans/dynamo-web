'use client';

// Previo pago de un envío, en la ficha de Dynamo: en qué está, por qué se pide, el total
// con IVA y lo que puede hacer Dynamo (transferencia recibida, pasar sin pago previo con
// motivo, exigirlo, deshacer). Las reglas las impone la base de datos (marcar_pago_envio).
import { useState } from 'react';
import { euros, fechaHora, porcentaje } from '@/lib/formato';

import type { Ficha } from '@/lib/fichaEnvio';
import { marcarPagoEnvio } from '@/app/panel/(app)/envios/acciones';

type Hacer = (texto: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>) => Promise<boolean>;

export default function PagoPrevio({ envio, pago, libre, hacer }: {
  envio: { id: string; estado: string; referencia_gx: string; stripe_cobro_sin_aplicar?: string | null }; pago: Ficha['pago']; libre: boolean; hacer: Hacer;
}) {
  const [exento, setExento] = useState(false);
  const [motivo, setMotivo] = useState('');
  if (!pago) {
    // Sin pago previo: Dynamo puede exigirlo a este envío mientras nadie lo tenga.
    if (envio.estado !== 'programado' || !libre) return null;
    return (
      <div style={{ margin: '0 0 0.7rem', fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>
        Sin pago previo.{' '}
        <button type="button" className="btn-ghost" style={{ padding: '0.15rem 0.5rem', fontSize: 'var(--fs-s)' }}
          onClick={() => hacer('Guardando', () => marcarPagoEnvio(envio.id, 'requerir', 'Pedido por Dynamo'))}>Exigir pago previo a este envío</button>
      </div>
    );
  }
  const total = <strong>{euros(pago.total)}</strong>;
  const desglose = <span style={{ color: 'var(--gray-500)' }}> ({euros(pago.base)} + IVA {porcentaje(pago.iva)})</span>;

  if (pago.estado === 'pendiente') {
    return (
      <div className="modal-warn-box" style={{ marginBottom: '0.8rem' }}>
        <div><strong style={{ color: '#b42318' }}>Pendiente de pago</strong> · {pago.motivo ?? 'Pago previo'} · total {total}{desglose}.</div>
        <div style={{ marginTop: '0.3rem' }}>No se puede ofertar, publicar en bolsa ni asignar hasta que se pague. El cliente lo ve en su panel con la proforma{' '}
          <a href={`/panel/envios/${envio.id}/proforma`} target="_blank" rel="noopener" style={{ color: 'var(--purple)', fontWeight: 700 }}>PRO-{envio.referencia_gx}</a>
          {' '}y puede pagar con tarjeta o por transferencia.</div>
        {envio.stripe_cobro_sin_aplicar && (
          <div style={{ marginTop: '0.4rem', color: '#b42318', fontWeight: 700 }}>
            Hay un cobro con tarjeta que no se aplicó solo (pago {envio.stripe_cobro_sin_aplicar}): el importe no coincidía. El envío no se anula mientras tanto.{' '}
            <button className="btn-secondary" style={{ marginLeft: '0.3rem' }} onClick={() => hacer('Guardando', () => marcarPagoEnvio(envio.id, 'tarjeta'))}>Darlo por pagado con tarjeta</button>
          </div>
        )}
        {pago.provisional && <div style={{ marginTop: '0.3rem' }}>Precio <strong>provisional</strong>: el plazo para pagar empieza cuando se revise el precio.</div>}
        {pago.limite && <div style={{ marginTop: '0.3rem' }}>Plazo para pagar: hasta el <strong>{fechaHora(pago.limite)}</strong>. Si no paga, el envío se anula solo y el cliente tiene que volver a pedirlo.</div>}
        {!exento ? (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => hacer('Guardando', () => marcarPagoEnvio(envio.id, 'transferencia'))}>Ha llegado la transferencia</button>
            <button className="btn-ghost" onClick={() => setExento(true)}>Pasar sin pago previo (cobro a vencimiento)</button>
          </div>
        ) : (
          <div style={{ marginTop: '0.6rem' }}>
            {!pago.conCredito && <div style={{ color: '#b42318', fontWeight: 700, marginBottom: '0.3rem' }}>Ojo: este cliente no tiene crédito disponible en la plataforma. Hazlo solo si CESCE te lo ha confirmado.</div>}
            <label htmlFor="pp-motivo" style={{ fontWeight: 700 }}>Motivo (queda guardado)</label>
            <textarea id="pp-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500}
              placeholder="P. ej. CESCE positivo, empresa conocida, cobro a 60 días" style={{ width: '100%', marginTop: '0.25rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn-primary" disabled={motivo.trim().length < 3}
                onClick={async () => { if (await hacer('Guardando', () => marcarPagoEnvio(envio.id, 'exento', motivo))) { setExento(false); setMotivo(''); } }}>
                Pasar a pendiente de asignar</button>
              <button className="btn-ghost" onClick={() => setExento(false)}>Volver</button>
            </div>
          </div>
        )}
      </div>
    );
  }
  const deshacer = libre && pago.metodo !== 'stripe' && (
    <button type="button" className="btn-ghost" style={{ padding: '0.15rem 0.5rem', fontSize: 'var(--fs-s)', marginLeft: '0.4rem' }}
      onClick={() => hacer('Deshaciendo', () => marcarPagoEnvio(envio.id, 'deshacer'))}>Deshacer</button>
  );
  return (
    <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>
      {pago.estado === 'pagado'
        ? <><strong>Pagado por adelantado</strong> {pago.metodo === 'stripe' ? 'con tarjeta' : 'por transferencia'}{pago.pagado_en ? ` el ${fechaHora(pago.pagado_en)}` : ''} · {total}{desglose}.</>
        : <><strong>Sin pago previo</strong> (cobro a vencimiento){pago.exento_motivo ? <> · {pago.exento_motivo}</> : null}. Se pedía por: {pago.motivo ?? '—'}.</>}
      {deshacer}
    </div></div>
  );
}
