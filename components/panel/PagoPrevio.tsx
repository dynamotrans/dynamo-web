'use client';

// Previo pago de un envío, en la ficha de Dynamo: en qué está, por qué se pide, el total
// con IVA y lo que puede hacer Dynamo (transferencia recibida, pasar sin pago previo con
// motivo, exigirlo, deshacer). Las reglas las impone la base de datos (marcar_pago_envio).
import CuentaAtras from './CuentaAtras';
import { useState } from 'react';
import { euros, fecha, fechaHora, porcentaje } from '@/lib/formato';

import type { Ficha } from '@/lib/fichaEnvio';
import { marcarPagoEnvio, registrarTransferenciaEnvio, rechazarPagoEnvio } from '@/app/panel/(app)/envios/acciones';
import FormTransferencia from './FormTransferencia';
// Etiquetas y faltas según el criterio único (usuario, 2026-11-09).
import Req from '@/components/Req';
import { avisaFaltas } from '@/lib/faltas';

type Hacer = (texto: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>) => Promise<boolean>;

export default function PagoPrevio({ envio, pago, libre, hacer, onDevolver }: {
  envio: { id: string; estado: string; referencia_gx: string; stripe_cobro_sin_aplicar?: string | null }; pago: Ficha['pago']; libre: boolean; hacer: Hacer;
  onDevolver?: () => void;   // solo el Admin Master: abre «Devolver importe» (pago con tarjeta)
}) {
  const [exento, setExento] = useState(false);
  const [transferencia, setTransferencia] = useState(false);   // abierto el formulario de banco, concepto y fecha
  const [rechazar, setRechazar] = useState(false);             // «Pago no recibido»: se pregunta antes de anular
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [falta, setFalta] = useState<string | null>(null);
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

  // CANCELADO sin haberse pagado: solo se dice eso (usuario, 2026-11-24: «¿no debería decir
  // cancelado y punto?»). Antes seguía saliendo la caja de «Pendiente de pago» con el plazo
  // vencido y los botones de cobro, como si aún se pudiera cobrar.
  if (envio.estado === 'cancelado' && pago.estado === 'pendiente') {
    return (
      <div id="pago-anulado" role="status" style={{ background: '#fef9c3', color: '#111827', border: '1px solid #fde047', borderRadius: 8, padding: '0.5rem 0.7rem', marginBottom: '0.8rem' }}>
        <strong>Anulado sin pago.</strong> No se llegó a pagar ({total}){pago.limite ? <>; el plazo terminaba el <strong>{fechaHora(pago.limite)}</strong></> : null}. El envío y su proforma están anulados.
        {envio.stripe_cobro_sin_aplicar && (
          <div style={{ marginTop: '0.35rem', color: '#b42318', fontWeight: 700 }}>Ojo: hay un cobro con tarjeta que no se aplicó (pago {envio.stripe_cobro_sin_aplicar}). Revísalo en Stripe.</div>
        )}
      </div>
    );
  }
  if (pago.estado === 'pendiente') {
    return (
      <div className="modal-warn-box" style={{ marginBottom: '0.8rem' }}>
        <div><strong style={{ color: '#b42318' }}>Pendiente de pago</strong> · {pago.motivo ?? 'Pago previo'} · total {total}{desglose}.</div>
        {pago.aCuenta > 0 && <div style={{ marginTop: '0.3rem' }}>El cliente <strong>ya había pagado {euros(pago.aCuenta)}</strong> y, al modificar el envío, el precio ha subido: <strong style={{ color: '#b42318' }}>le falta pagar {euros(pago.pendiente)}</strong>. Este resto no anula el envío solo.</div>}
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
        {pago.avisado_en ? (
          <div id="pago-avisado" className="pago-avisado" role="status">
            <span className="pa-ico" aria-hidden="true">🔔</span>
            <span><strong>El cliente avisó de su transferencia el {fechaHora(pago.avisado_en)}.</strong> El plazo está <strong>parado</strong> y el envío no se anula solo: mira el banco y márcala como recibida, o pulsa «Pago no recibido» si no ha llegado.</span>
          </div>
        ) : pago.limite && (
          <div id="pago-plazo">
            <CuentaAtras grande hasta={pago.limite} para="al cliente para pagar" vencidoTxt="Plazo vencido: se anula en breve" />
            <div>Plazo para pagar: hasta el <strong>{fechaHora(pago.limite)}</strong>. Si para entonces no ha pagado con tarjeta ni ha avisado de su transferencia, el envío se anula solo y tiene que volver a pedirlo.</div>
          </div>
        )}
        {transferencia ? (
          // Un toque ya no basta (usuario, 2026-11-17): banco, concepto y fecha antes de marcarla.
          <div style={{ marginTop: '0.6rem', background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '0.7rem 0.8rem' }}>
            <div style={{ fontWeight: 800, marginBottom: '0.5rem' }}>Transferencia recibida · PRO-{envio.referencia_gx}</div>
            <FormTransferencia gx={envio.referencia_gx} onCancelar={() => setTransferencia(false)}
              onConfirmar={async (d) => { if (await hacer('Guardando', () => registrarTransferenciaEnvio(envio.id, d))) setTransferencia(false); }} />
          </div>
        ) : rechazar ? (
          <div id="pago-rechazar" style={{ marginTop: '0.6rem', background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '0.7rem 0.8rem' }}>
            <strong style={{ color: '#b42318' }}>¿Anular el envío por pago no recibido?</strong>
            <div style={{ marginTop: '0.25rem' }}>El envío #{envio.referencia_gx} y su proforma quedan <strong>anulados sin pago</strong> (no cuenta como cancelación del cliente) y el cliente recibe el aviso de volver a pedirlo.</div>
            <label htmlFor="pp-rechazo" style={{ fontWeight: 700, display: 'block', marginTop: '0.5rem' }}>Nota para el historial <span style={{ fontWeight: 500, color: 'var(--gray-500)' }}>· opcional</span></label>
            <input id="pp-rechazo" type="text" maxLength={200} value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} placeholder="Ej. no aparece en el banco a las 12:30" style={{ marginTop: '0.25rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.55rem', flexWrap: 'wrap' }}>
              <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={async () => { if (await hacer('Anulando', () => rechazarPagoEnvio(envio.id, motivoRechazo))) { setRechazar(false); setMotivoRechazo(''); } }}>Sí, pago no recibido: anular</button>
              <button className="btn-ghost" onClick={() => setRechazar(false)}>Volver</button>
            </div>
          </div>
        ) : !exento ? (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => setTransferencia(true)}>Ha llegado la transferencia</button>
            {libre && pago.aCuenta <= 0 && <button className="btn-secondary" id="pago-no-recibido" style={{ color: '#b42318' }} onClick={() => setRechazar(true)}>Pago no recibido</button>}
            <button className="btn-ghost" onClick={() => setExento(true)}>Pasar sin pago previo (cobro a vencimiento)</button>
          </div>
        ) : (
          <div style={{ marginTop: '0.6rem' }}>
            {!pago.conCredito && <div style={{ color: '#b42318', fontWeight: 700, marginBottom: '0.3rem' }}>Ojo: este cliente no tiene crédito disponible en la plataforma. Hazlo solo si CESCE te lo ha confirmado.</div>}
            <label htmlFor="pp-motivo" style={{ fontWeight: 700 }}>Motivo (queda guardado) <Req /></label>
            <textarea id="pp-motivo" className="campo-texto" rows={3} value={motivo} onChange={(e) => { setMotivo(e.target.value); if (e.target.value.trim().length >= 3) setFalta(null); }} maxLength={500}
              placeholder="Ej. CESCE positivo, empresa conocida, cobro a 60 días" style={{ marginTop: '0.25rem' }} />
            {falta && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.4rem' }}>⚠ {falta}</div>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn-primary"
                onClick={async () => {
                  // El botón NO se deshabilita en silencio (el usuario escribió «Ok» y
                  // parecía que no funcionaba): si el motivo es demasiado corto, se dice.
                  if (motivo.trim().length < 3) { setFalta('Escribe el motivo con unas palabras (mínimo 3 letras): queda guardado en el envío.'); avisaFaltas(['pp-motivo']); return; }
                  setFalta(null);
                  if (await hacer('Guardando', () => marcarPagoEnvio(envio.id, 'exento', motivo))) { setExento(false); setMotivo(''); }
                }}>
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
        ? <><strong>Pagado por adelantado</strong> {pago.metodo === 'stripe' ? 'con tarjeta' : 'por transferencia'}{pago.pagado_en ? ` el ${fechaHora(pago.pagado_en)}` : ''} · {total}{desglose}.
            {pago.banco && <><br /><span id="pago-transferencia-datos">Banco: <strong>{pago.banco}</strong>{pago.fecha_transferencia ? <> · transferencia del <strong>{fecha(pago.fecha_transferencia)}</strong></> : null}{pago.concepto ? <> · «{pago.concepto}»</> : null}</span></>}
            {/* Proforma vinculada (usuario, 2026-11-15): la misma que viaja en el concepto del pedido de venta. */}
            <br />Proforma relacionada: <a href={`/panel/envios/${envio.id}/proforma`} target="_blank" rel="noopener"><strong>PRO-{envio.referencia_gx}</strong></a>
            <span style={{ color: 'var(--gray-500)' }}> · va en el concepto del pedido de venta al exportar</span></>
        : <><strong>Sin pago previo</strong> (cobro a vencimiento){pago.exento_motivo ? <> · {pago.exento_motivo}</> : null}. Se pedía por: {pago.motivo ?? '—'}.</>}
      {deshacer}
      {/* Devolver el importe de un pago con tarjeta: decisión de una persona, solo el Admin Master. */}
      {pago.estado === 'pagado' && pago.metodo === 'stripe' && onDevolver && (
        <div style={{ marginTop: '0.55rem' }}>
          <button type="button" className="btn-secondary" id="pago-devolver" onClick={onDevolver}>Devolver importe</button>
        </div>
      )}
    </div></div>
  );
}
