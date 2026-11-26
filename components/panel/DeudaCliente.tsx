'use client';

// LA DEUDA DEL CLIENTE, EN SU FICHA (usuario, 2026-11-26). Solo la ve el equipo de Dynamo:
// lo que debe según la facturación, lo que lleva más de su plazo sin pagar (60 días, el
// pactado: «para saber quién paga por encima de 60 días, que tengo que llamarlo»), con la
// lista de esas facturas, y cuánto crédito le queda contando sus envíos sin facturar.
import { useEffect, useState } from 'react';
import { deudaDeCliente, type DeudaFicha } from '@/app/panel/(app)/clientes/acciones';
import { euros, fecha, fechaHora } from '@/lib/formato';

export default function DeudaCliente({ clienteId }: { clienteId: string }) {
  const [d, setD] = useState<DeudaFicha | null | undefined>(undefined);
  useEffect(() => { let vivo = true; deudaDeCliente(clienteId).then((r) => { if (vivo) setD(r); }).catch(() => { if (vivo) setD(null); }); return () => { vivo = false; }; }, [clienteId]);
  if (d === undefined) return <div className="meta" style={{ gridColumn: '1/-1' }}>Cargando lo que debe…</div>;
  if (d === null) return null;
  const nada = d.debe <= 0 && d.sin_facturar <= 0 && d.pedidos <= 0;
  return (
    <>
      <div style={{ gridColumn: '1/-1', marginTop: '0.6rem' }} className="ptar-section-head">Lo que debe · solo Dynamo</div>
      <div id="cli-deuda" style={{ gridColumn: '1/-1' }}>
        {nada ? <div className="meta">No debe nada y no tiene envíos a crédito sin facturar.</div> : (
          <div className="deuda-ficha">
            <div><span className="meta">Debe (facturas)</span><strong>{euros(d.debe)}</strong>
              <span className="meta">{d.facturas} factura{d.facturas === 1 ? '' : 's'}{d.abonos > 0 ? ` · ya restados ${euros(d.abonos)} de abonos` : ''}</span></div>
            <div><span className="meta">Pasado de {d.dias_plazo} días</span><strong id="cli-deuda-pasado" style={{ color: d.pasado > 0 ? '#dc2626' : 'var(--navy)' }}>{euros(d.pasado)}</strong>
              <span className="meta">{d.facturas_pasadas > 0 ? `${d.facturas_pasadas} factura${d.facturas_pasadas === 1 ? '' : 's'} · la más antigua, de hace ${d.dias_mas_antigua} días` : 'Nada fuera de plazo'}</span></div>
            <div><span className="meta">Envíos a crédito sin facturar</span><strong>{euros(d.sin_facturar)}</strong>
              <span className="meta">{d.envios_sin_facturar} envío{d.envios_sin_facturar === 1 ? '' : 's'}{d.n_pedidos > 0 ? ` · y ${euros(d.pedidos)} en ${d.n_pedidos} pedido${d.n_pedidos === 1 ? '' : 's'} sin facturar` : ''}</span></div>
            <div><span className="meta">Crédito que le queda</span><strong style={{ color: d.disponible != null && d.disponible < 0 ? '#dc2626' : 'var(--navy)' }}>{d.disponible == null ? 'Sin crédito' : euros(d.disponible)}</strong>
              <span className="meta">{d.limite == null ? 'Va con pago previo' : `usado ${euros(d.usado)} de ${euros(d.limite)}`}</span></div>
          </div>
        )}
        {d.lista_pasadas.length > 0 && (
          <div className="pt-aviso error" id="cli-deuda-llamar" style={{ marginTop: '0.6rem' }}><div>
            <strong>Para reclamar:</strong> facturas con más de {d.dias_plazo} días sin pagar.
            <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>
              {d.lista_pasadas.map((f, i) => <li key={i}>{f.numero ?? 'Sin número'} · del {fecha(f.emision)} · {euros(f.pendiente)} · {f.dias} días</li>)}
            </ul>
          </div></div>
        )}
        <div className="meta" style={{ marginTop: '0.4rem' }}>Según la facturación{d.al_dia_en ? `, leída el ${fechaHora(d.al_dia_en)}` : ''}. El plazo de {d.dias_plazo} días se cuenta desde la emisión de cada factura.</div>
      </div>
    </>
  );
}
