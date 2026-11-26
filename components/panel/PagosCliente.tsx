'use client';

// PAGOS TARDÍOS Y BLOQUEO DEL CRÉDITO, en la ficha del cliente (usuario, 2026-11-17).
// Solo lo ve el Admin Master: para cualquier otro la acción no devuelve nada y este
// apartado no se pinta. Aquí se pone la regla propia del cliente (vacía = manda la general
// de Parámetros), se ve si está bloqueado y por qué y se le devuelve el crédito. Las facturas
// NO se apuntan aquí (usuario, 2026-11-17: «no aporta»): llegan solas de la copia de la
// facturación (facturas_cliente_desde_copia, 2026-11-26).
import { useCallback, useEffect, useState } from 'react';
import { pagosDeCliente, guardarReglaPagos, devolverCredito, type PagosCliente as Datos } from '@/app/panel/(app)/clientes/acciones';
import { euros, fechaHora } from '@/lib/formato';

const entero = (t: string) => (t.trim() === '' ? null : Number(t.trim()));

export default function PagosCliente({ clienteId, onCreditoDevuelto }: { clienteId: string; onCreditoDevuelto: (creditoManual: number | null) => void }) {
  const [d, setD] = useState<Datos | null | undefined>(undefined);   // undefined = cargando · null = no es Admin
  const [dias, setDias] = useState(''); const [tol, setTol] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async (inicial = false) => {
    const r = await pagosDeCliente(clienteId).catch(() => null);
    setD(r);
    if (r && inicial) { setDias(r.regla.dias_max == null ? '' : String(r.regla.dias_max)); setTol(r.regla.facturas_toleradas == null ? '' : String(r.regla.facturas_toleradas)); }
  }, [clienteId]);
  useEffect(() => { cargar(true); }, [cargar]);

  async function hacer(f: () => Promise<{ ok: true } | { ok: false; error: string }>, bien: string) {
    setTrabajando(true); setAviso(null);
    const r = await f();
    setTrabajando(false);
    setAviso(r.ok ? { ok: true, txt: bien } : { ok: false, txt: r.error });
    if (r.ok) await cargar();
    return r.ok;
  }

  if (d === undefined) return <div className="meta" style={{ gridColumn: '1/-1' }}>Cargando los pagos…</div>;
  if (d === null) return null;
  const e = d.estado;
  const desde = e.desde_vencimiento ? 'del vencimiento' : 'de la emisión';

  return (
    <>
      <div style={{ gridColumn: '1/-1', marginTop: '0.6rem' }} className="ptar-section-head">Pagos tardíos y bloqueo del crédito · solo Admin</div>
      <div id="cli-pagos" style={{ gridColumn: '1/-1' }}>
        {!d.activo && <div className="pt-aviso info" style={{ marginBottom: '0.6rem' }}><div>El bloqueo automático está <strong>apagado</strong> (Parámetros → CESCE - Riesgos). Puedes dejar aquí la regla preparada; no se bloquea a nadie hasta encenderlo y hasta que lleguen las facturas con la conexión de la contabilidad.</div></div>}
        {e.bloqueado_en ? (
          <div className="pt-aviso error" style={{ marginBottom: '0.6rem' }}><div>
            <strong>Crédito bloqueado</strong> desde el {fechaHora(e.bloqueado_en)}: {e.bloqueado_motivo}
            {e.vencidas_sin_cobrar === 0 ? ' Ya no tiene facturas vencidas sin cobrar.' : ` Le quedan ${e.vencidas_sin_cobrar} vencida${e.vencidas_sin_cobrar === 1 ? '' : 's'} sin cobrar.`}
            <div style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn-primary" disabled={trabajando}
                onClick={async () => {
                  setTrabajando(true); setAviso(null);
                  const r = await devolverCredito(clienteId);
                  setTrabajando(false);
                  if (!r.ok) { setAviso({ ok: false, txt: r.error }); return; }
                  onCreditoDevuelto(r.credito_manual);
                  setAviso({ ok: true, txt: r.credito_manual == null ? 'Crédito devuelto: vuelve a mandar el de CESCE.' : `Crédito devuelto: ${euros(r.credito_manual)}.` });
                  await cargar();
                }}>Devolverle el crédito</button>
            </div>
          </div></div>
        ) : (
          <div className="meta" style={{ marginBottom: '0.6rem' }}>
            A este cliente se le dan <strong>{e.dias_max} días</strong> {desde} para pagar y se le toleran <strong>{e.toleradas}</strong> factura{e.toleradas === 1 ? '' : 's'} tardía{e.toleradas === 1 ? '' : 's'} de las últimas {e.miradas}
            {e.regla_propia ? ' (regla propia)' : ' (regla general)'}. Ahora lleva <strong>{e.tardias}</strong>.
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 150px' }}>
            <label htmlFor="pg-dias">Días para pagar (este cliente)</label>
            <input id="pg-dias" type="text" inputMode="numeric" placeholder="Vacío = el general" value={dias} onChange={(ev) => setDias(ev.target.value)} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label htmlFor="pg-tol">Facturas tardías toleradas</label>
            <input id="pg-tol" type="text" inputMode="numeric" placeholder="Vacío = el general" value={tol} onChange={(ev) => setTol(ev.target.value)} />
          </div>
          <button type="button" className="btn-ghost" disabled={trabajando}
            onClick={() => hacer(() => guardarReglaPagos(clienteId, entero(dias), entero(tol)), 'Regla de pagos guardada.')}>Guardar regla</button>
        </div>
        <div className="meta" style={{ marginTop: '0.3rem' }}>Vacío, manda la regla general. Ejemplo: 30 días y 1 tolerada para quien paga al contado o a 30 → se le bloquea a la segunda factura pagada a más de 30 días.</div>

        {aviso && <div className={`pt-aviso ${aviso.ok ? 'ok' : 'error'}`} role="status" style={{ marginTop: '0.6rem' }}><div>{aviso.txt}</div></div>}
      </div>
    </>
  );
}
