'use client';

// Bajas pedidas por un compañero (usuario, 2026-11-26), en Altas pendientes. La cuenta ya está
// sin acceso; Dynamo lo confirma por teléfono o email y decide: baja definitiva o rehabilitar
// (si era un intento de fraude). Con lo comprobado y la contraseña; queda en el registro.
import { useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import { fechaHora } from '@/lib/formato';
import { resolverBaja } from '@/app/panel/(app)/equipo/acciones';

export type BajaFila = { id: string; usuario: string; email: string; empresa: string; por: string; motivo: string; creada_en: string };

export default function BajasSolicitadas({ filas }: { filas: BajaFila[] }) {
  const refrescar = useRefrescar();
  const [abierta, setAbierta] = useState<{ id: string; decision: 'baja' | 'rehabilitar' } | null>(null);
  const [nota, setNota] = useState(''); const [clave, setClave] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  // Resuelta la última, la caja se va; el aviso de lo hecho se queda.
  if (!filas.length) return aviso ? <div className={`pt-aviso ${aviso.ok ? 'ok' : 'error'}`} id="bajas-solicitadas-hecho" style={{ marginBottom: '0.8rem' }}><div>{aviso.txt}</div></div> : null;

  async function resolver() {
    if (!abierta) return;
    setTrabajando(true); setAviso(null);
    const r = await resolverBaja(abierta.id, abierta.decision, nota, clave).catch(() => ({ ok: false as const, error: 'No se ha podido guardar.' }));
    setTrabajando(false);
    if (!r.ok) { setAviso({ ok: false, txt: r.error }); return; }
    setAviso({ ok: true, txt: abierta.decision === 'baja' ? '✓ Baja confirmada.' : '✓ Cuenta rehabilitada: le llega el email de cuenta reactivada.' });
    setAbierta(null); setNota(''); setClave(''); refrescar();
  }

  return (
    <section className="section active" id="bajas-solicitadas" style={{ paddingBottom: 0 }}>
      <div className="pt-aviso error" style={{ marginBottom: '0.6rem' }}><div>
        <strong>Bajas pedidas por un compañero ({filas.length}).</strong> La cuenta ya está sin acceso. Confírmalo por teléfono o email y decide.
      </div></div>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>Cuenta</th><th>Empresa</th><th>La pide</th><th>Motivo</th><th>Cuándo</th><th></th></tr></thead>
        <tbody>
          {filas.map((b) => (
            <tr key={b.id}>
              <td><strong>{b.usuario}</strong><br /><span className="meta">{b.email}</span></td>
              <td>{b.empresa}</td><td>{b.por}</td><td>{b.motivo}</td><td>{fechaHora(b.creada_en)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button type="button" className="btn-ghost" style={{ color: 'var(--red)' }} onClick={() => { setAbierta({ id: b.id, decision: 'baja' }); setAviso(null); }}>Confirmar baja</button>{' '}
                <button type="button" className="btn-ghost" onClick={() => { setAbierta({ id: b.id, decision: 'rehabilitar' }); setAviso(null); }}>Rehabilitar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {abierta && (
        <div style={{ marginTop: '0.7rem', display: 'grid', gap: '0.5rem', maxWidth: 520 }}>
          <label className="meta">{abierta.decision === 'baja' ? 'Qué has comprobado para confirmar la baja' : 'Por qué la rehabilitas (p. ej. no la reconoce: intento de fraude)'}
            <textarea id="baja-nota" rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.2rem' }} />
          </label>
          <label className="meta">Tu contraseña
            <input id="baja-clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.2rem' }} />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn-primary" disabled={trabajando} onClick={resolver}>{trabajando ? 'Guardando…' : abierta.decision === 'baja' ? 'Confirmar baja' : 'Rehabilitar'}</button>
            <button type="button" className="btn-ghost" onClick={() => setAbierta(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'ok' : 'error'}`} style={{ marginTop: '0.6rem' }}><div>{aviso.txt}</div></div>}
    </section>
  );
}
