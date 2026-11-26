'use client';

// «Tu equipo» en Mi cuenta (usuario, 2026-11-26): los usuarios de tu empresa. No se borra a
// nadie: se PIDE la baja de un compañero (con motivo y tu contraseña). Su cuenta queda sin
// acceso al momento, le llega un email para que llame si no lo reconoce y Dynamo lo confirma.
import { useCallback, useEffect, useState } from 'react';
import { misCompaneros, pedirBajaCompanero, type Companero } from '@/app/panel/(app)/equipo/acciones';

const ESTADO: Record<string, [string, string]> = { activa: ['Activa', 'badge-green'], suspendida: ['Solo lectura', 'badge-orange'], suspendida_total: ['Sin acceso', 'badge-gray'] };

export default function EquipoEmpresa() {
  const [lista, setLista] = useState<Companero[] | null>(null);
  const [para, setPara] = useState<Companero | null>(null);
  const [motivo, setMotivo] = useState(''); const [clave, setClave] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const cargar = useCallback(() => { misCompaneros().then(setLista).catch(() => setLista([])); }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function pedir() {
    if (!para) return;
    setTrabajando(true); setAviso(null);
    const r = await pedirBajaCompanero(para.id, motivo, clave).catch(() => ({ ok: false as const, error: 'No se ha podido enviar. Vuelve a intentarlo.' }));
    setTrabajando(false);
    if (!r.ok) { setAviso({ ok: false, txt: r.error }); return; }
    setAviso({ ok: true, txt: `✓ Baja pedida: la cuenta de ${para.nombre || para.email} ya no tiene acceso y Dynamo lo confirmará.` });
    setPara(null); setMotivo(''); setClave(''); cargar();
  }

  if (!lista || lista.length < 2) return aviso ? <div className={`pt-aviso ${aviso.ok ? 'ok' : 'error'}`} style={{ marginTop: '0.6rem' }}><div>{aviso.txt}</div></div> : null;
  return (
    <div style={{ marginTop: '0.8rem' }} id="equipo-empresa">
      <div style={{ display: 'grid', gap: '0.35rem' }}>
        {lista.map((u) => {
          const [t, cls] = ESTADO[u.estado] ?? [u.estado, 'badge-gray'];
          return (
            <div key={u.id} className="equipo-fila" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.35rem 0', borderBottom: '1px dashed var(--gray-200)' }}>
              <span style={{ flex: '1 1 200px', minWidth: 0 }}><strong>{u.nombre || u.email}</strong>{u.soy_yo ? ' (tú)' : ''}<br /><span className="meta">{u.email}</span></span>
              <span className={`badge ${u.baja_pendiente ? 'badge-orange' : cls}`}>{u.baja_pendiente ? 'Baja pedida' : t}</span>
              {!u.soy_yo && !u.baja_pendiente && u.estado !== 'suspendida_total' && (
                <button type="button" className="btn-ghost" style={{ color: 'var(--red)' }} onClick={() => { setPara(u); setAviso(null); }}>Pedir su baja</button>
              )}
            </div>
          );
        })}
      </div>
      {para && (
        <div style={{ marginTop: '0.7rem', display: 'grid', gap: '0.5rem', maxWidth: 520 }} id="equipo-pedir-baja">
          <p className="account-card-desc" style={{ margin: 0 }}>
            Vas a pedir la baja de <strong>{para.nombre || para.email}</strong>. Su cuenta quedará <strong>sin acceso al momento</strong> y le avisaremos por email; Dynamo lo confirmará contigo. Solo para quien ya no debe entrar (p. ej. ha dejado la empresa).
          </p>
          <label className="meta">Motivo
            <textarea id="equipo-baja-motivo" rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.2rem' }} />
          </label>
          <label className="meta">Tu contraseña
            <input id="equipo-baja-clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.2rem' }} />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn-primary" id="btn-equipo-baja-confirmar" style={{ background: 'var(--red)' }} disabled={trabajando} onClick={pedir}>{trabajando ? 'Enviando…' : 'Pedir la baja'}</button>
            <button type="button" className="btn-ghost" onClick={() => setPara(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'ok' : 'error'}`} style={{ marginTop: '0.6rem' }}><div>{aviso.txt}</div></div>}
    </div>
  );
}
