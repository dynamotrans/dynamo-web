'use client';

// PAGOS TARDÍOS Y BLOQUEO DEL CRÉDITO, en la ficha del cliente (usuario, 2026-11-17).
// Solo lo ve el Admin Master: para cualquier otro la acción no devuelve nada y este
// apartado no se pinta. Aquí se pone la regla propia del cliente (vacía = manda la general
// de Parámetros), se ve si está bloqueado y por qué, se le devuelve el crédito y se apuntan
// sus facturas a mano mientras no las traiga Holded.
import { useCallback, useEffect, useState } from 'react';
import { pagosDeCliente, guardarReglaPagos, anadirFactura, cambiarFactura, borrarFactura, devolverCredito, type PagosCliente as Datos } from '@/app/panel/(app)/clientes/acciones';
import { euros, fecha, fechaHora, hoyMadrid } from '@/lib/formato';

const NUEVA = { numero: '', fecha_emision: '', fecha_vencimiento: '', fecha_cobro: '', importe: '' };
const entero = (t: string) => (t.trim() === '' ? null : Number(t.trim()));

export default function PagosCliente({ clienteId, onCreditoDevuelto }: { clienteId: string; onCreditoDevuelto: (creditoManual: number | null) => void }) {
  const [d, setD] = useState<Datos | null | undefined>(undefined);   // undefined = cargando · null = no es Admin
  const [dias, setDias] = useState(''); const [tol, setTol] = useState('');
  const [nueva, setNueva] = useState(NUEVA);
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
  const diasDe = (f: Datos['facturas'][number]) => {
    const base = (e.desde_vencimiento && f.fecha_vencimiento) || f.fecha_emision;
    return Math.round((Date.parse(f.fecha_cobro ?? hoyMadrid()) - Date.parse(base)) / 86400000);
  };

  return (
    <>
      <div style={{ gridColumn: '1/-1', marginTop: '0.6rem' }} className="ptar-section-head">Pagos tardíos y bloqueo del crédito · solo Admin</div>
      <div id="cli-pagos" style={{ gridColumn: '1/-1' }}>
        {!d.activo && <div className="pt-aviso info" style={{ marginBottom: '0.6rem' }}><div>El bloqueo automático está <strong>apagado</strong> (Parámetros → CESCE - Riesgos). Puedes dejar aquí la regla y las facturas preparadas; no se bloquea a nadie hasta encenderlo.</div></div>}
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
        <div className="meta" style={{ marginTop: '0.3rem' }}>Vacío, manda la regla general. Ejemplo para un buen cliente: 100 días y 5 toleradas → se le bloquea a la sexta factura pagada a más de 100 días.</div>

        <div style={{ marginTop: '0.9rem', fontWeight: 800, color: 'var(--navy)' }}>Facturas</div>
        {d.facturas.length === 0 ? <div className="meta">Sin facturas apuntadas. Llegarán solas al conectar Holded; mientras, puedes apuntarlas aquí.</div> : (
          <div className="table-wrap" style={{ marginTop: '0.3rem' }}>
            <table className="data" style={{ minWidth: 560 }}>
              <thead><tr><th>Factura</th><th>Emitida</th><th>Cobrada</th><th>Días</th><th></th></tr></thead>
              <tbody>
                {d.facturas.map((f) => {
                  const n = diasDe(f); const tarde = !f.no_cuenta && n > e.dias_max;
                  return (
                    <tr key={f.id} style={f.no_cuenta ? { opacity: 0.55 } : undefined}>
                      <td><strong>{f.numero}</strong>{f.importe != null && <div className="meta">{euros(f.importe)}</div>}{f.no_cuenta && <div className="meta">No cuenta</div>}</td>
                      <td>{fecha(f.fecha_emision)}</td>
                      <td>
                        <input type="date" aria-label={`Fecha de cobro de la factura ${f.numero}`} defaultValue={f.fecha_cobro ?? ''} key={`${f.id}:${f.fecha_cobro ?? ''}`} disabled={trabajando}
                          onChange={(ev) => { const v = ev.target.value; if (v === (f.fecha_cobro ?? '')) return; hacer(() => cambiarFactura(f.id, { fecha_cobro: v || null }), v ? 'Cobro apuntado.' : 'Factura marcada como sin cobrar.'); }} />
                      </td>
                      <td><span className={`badge ${tarde ? 'badge-red' : 'badge-green'}`}>{n}{f.fecha_cobro ? '' : ' · sin cobrar'}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn-ghost" style={{ minHeight: 30, padding: '0 0.5rem' }} disabled={trabajando}
                          onClick={() => hacer(() => cambiarFactura(f.id, { no_cuenta: !f.no_cuenta }), f.no_cuenta ? 'La factura vuelve a contar.' : 'La factura ya no cuenta (abono o en disputa).')}>{f.no_cuenta ? 'Que cuente' : 'No cuenta'}</button>{' '}
                        <button type="button" className="btn-ghost" style={{ minHeight: 30, padding: '0 0.5rem', color: 'var(--red)' }} disabled={trabajando}
                          onClick={() => hacer(() => borrarFactura(f.id), 'Factura borrada.')}>Borrar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '0.6rem' }}>
          <div style={{ flex: '1 1 130px' }}><label htmlFor="pg-num">N.º de factura</label><input id="pg-num" type="text" placeholder="Ej. F-2026/0412" value={nueva.numero} onChange={(ev) => setNueva({ ...nueva, numero: ev.target.value })} /></div>
          <div style={{ flex: '1 1 130px' }}><label htmlFor="pg-emi">Emitida</label><input id="pg-emi" type="date" value={nueva.fecha_emision} onChange={(ev) => setNueva({ ...nueva, fecha_emision: ev.target.value })} /></div>
          <div style={{ flex: '1 1 130px' }}><label htmlFor="pg-ven">Vence (opcional)</label><input id="pg-ven" type="date" value={nueva.fecha_vencimiento} onChange={(ev) => setNueva({ ...nueva, fecha_vencimiento: ev.target.value })} /></div>
          <div style={{ flex: '1 1 130px' }}><label htmlFor="pg-cob">Cobrada (opcional)</label><input id="pg-cob" type="date" value={nueva.fecha_cobro} onChange={(ev) => setNueva({ ...nueva, fecha_cobro: ev.target.value })} /></div>
          <div style={{ flex: '1 1 110px' }}><label htmlFor="pg-imp">Importe (opcional)</label><input id="pg-imp" type="text" inputMode="decimal" placeholder="Ej. 1.089,00" value={nueva.importe} onChange={(ev) => setNueva({ ...nueva, importe: ev.target.value })} /></div>
          <button type="button" className="btn-ghost" disabled={trabajando || !nueva.numero.trim() || !nueva.fecha_emision}
            onClick={async () => {
              const imp = nueva.importe.trim() === '' ? null : Number(nueva.importe.trim().replace(/\./g, '').replace(',', '.'));
              const ok = await hacer(() => anadirFactura(clienteId, { ...nueva, importe: imp }), 'Factura apuntada.');
              if (ok) setNueva(NUEVA);
            }}>Apuntar factura</button>
        </div>
        {aviso && <div className={`pt-aviso ${aviso.ok ? 'ok' : 'error'}`} role="status" style={{ marginTop: '0.6rem' }}><div>{aviso.txt}</div></div>}
      </div>
    </>
  );
}
