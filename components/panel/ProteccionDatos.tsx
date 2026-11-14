'use client';

// Protección de datos (RGPD): buscar a una persona (email, teléfono, DNI o nombre) en
// cuentas, contactos y conductores, y exportar o anonimizar. Ver RGPD.md §4.
import { useEffect, useState } from 'react';
import Modal from './Modal';
import { buscarPersona, anonimizarPersona, listaBloqueos, bloquearAlta, quitarBloqueo, type Persona, type Bloqueo } from '@/app/panel/(app)/proteccion-datos/acciones';
import { CONTACTO } from '@/lib/atencion';

const TIPO: Record<Persona['tipo'], string> = { usuario: 'Cuenta de usuario', contacto: 'Contacto', conductor: 'Conductor' };
const docCorto = (d: string | null) => (d ? `•••${d.slice(-4)}` : '');

export default function ProteccionDatos() {
  const [q, setQ] = useState('');
  const [filas, setFilas] = useState<Persona[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [anon, setAnon] = useState<Persona | null>(null);

  async function buscar(texto = q) {
    setError(null); setBuscando(true);
    const r = await buscarPersona(texto);
    setBuscando(false);
    if (!r.ok) { setError(r.error); setFilas(null); return; }
    setFilas(r.filas);
  }

  return (
    <section className="section active" id="sec-rgpd">
      <div className="sec-header"><h2>Protección de datos</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        Para atender una petición de una persona (por escrito, a {CONTACTO.email}): busca por su <strong>email, teléfono, DNI o nombre</strong> y
        verás todas sus fichas en la plataforma. Desde aquí le descargas sus datos o los borras (anonimizar). Plazo para responder: <strong>un mes</strong>.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        <input type="search" className="param-input" style={{ flex: '1 1 260px', maxWidth: 420 }} placeholder="Email, teléfono, DNI o nombre" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }} aria-label="Buscar persona" />
        <button className="btn-primary" onClick={() => buscar()} disabled={buscando}>{buscando ? 'Buscando…' : 'Buscar'}</button>
      </div>
      {aviso && <div className="pt-aviso info" role="status" style={{ marginBottom: '0.8rem' }}><div>{aviso}</div></div>}
      {error && <div className="pt-aviso error" style={{ marginBottom: '0.8rem' }}><div>{error}</div></div>}
      {filas && filas.length === 0 && <div className="pt-aviso"><div>No hay ninguna ficha con eso.</div></div>}
      {filas && filas.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Ficha</th><th>Persona</th><th>Empresa</th><th></th></tr></thead>
            <tbody>
              {filas.map((p) => (
                <tr key={`${p.tipo}-${p.id}`}>
                  <td>{TIPO[p.tipo]}{p.estado && <div className="meta">{p.estado}</div>}</td>
                  <td><strong>{p.nombre || '—'}</strong>
                    <div className="meta">{[p.email, p.telefono, docCorto(p.documento)].filter(Boolean).join(' · ') || '—'}</div></td>
                  <td>{p.empresa || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {p.tipo === 'usuario' && <a className="btn-ghost" href={`/panel/usuarios/${p.id}/datos`} download>Exportar datos</a>}
                    {!(p.nombre ?? '').endsWith('eliminada') && !(p.nombre ?? '').endsWith('eliminado') &&
                      <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={() => { setAviso(null); setAnon(p); }}>Anonimizar…</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {anon && <Confirmar p={anon} onCerrar={() => setAnon(null)} onHecho={(t) => { setAnon(null); setAviso(t); buscar(); }} />}
      <BloqueosAlta />
    </section>
  );
}

// Lista de bloqueo de altas: emails o dominios que no pueden volver a registrarse (p. ej.
// una cuenta conflictiva recién anonimizada). Quien lo intente ve un mensaje neutro, sin
// saber que está bloqueado.
function BloqueosAlta() {
  const [filas, setFilas] = useState<Bloqueo[] | null>(null);
  const [tipo, setTipo] = useState<'email' | 'dominio'>('email');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  async function cargar() {
    const r = await listaBloqueos();
    if (r.ok) setFilas(r.filas);
  }
  useEffect(() => { cargar(); }, []);
  async function bloquear() {
    if (!valor.trim()) return;
    setError(null); setTrabajando(true);
    const r = await bloquearAlta(tipo, valor, motivo);
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    setValor(''); setMotivo('');
    cargar();
  }
  return (
    <div style={{ marginTop: '1.6rem' }}>
      <h3 style={{ margin: '0 0 0.35rem', fontSize: 'var(--fs-l)' }}>Bloqueos de alta</h3>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '0 0 0.7rem' }}>
        Emails o dominios enteros que <strong>no pueden volver a darse de alta</strong> (p. ej. una cuenta conflictiva que pidió el borrado).
        Quien lo intente ve solo «Actualmente no estamos dando de alta nuevos usuarios», sin saber que está bloqueado.
      </p>
      {error && <div className="pt-aviso error" style={{ marginBottom: '0.7rem' }}><div>{error}</div></div>}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        <select className="param-input" style={{ flex: '0 0 auto' }} value={tipo} onChange={(e) => setTipo(e.target.value as 'email' | 'dominio')} aria-label="Qué bloquear">
          <option value="email">Email completo</option>
          <option value="dominio">Dominio entero</option>
        </select>
        <input type="text" className="param-input" style={{ flex: '1 1 220px', maxWidth: 320 }} placeholder={tipo === 'email' ? 'persona@empresa.com' : 'empresa.com (sin @)'}
          value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') bloquear(); }} aria-label="Dirección o dominio a bloquear" />
        <input type="text" className="param-input" style={{ flex: '1 1 180px', maxWidth: 280 }} placeholder="Motivo · opcional" value={motivo}
          onChange={(e) => setMotivo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') bloquear(); }} aria-label="Motivo del bloqueo" />
        <button className="btn-primary" onClick={bloquear} disabled={trabajando || !valor.trim()}>{trabajando ? 'Bloqueando…' : 'Bloquear'}</button>
      </div>
      {filas && filas.length === 0 && <div className="pt-aviso"><div>No hay ningún bloqueo. Al anonimizar una cuenta puedes bloquear su email ahí mismo.</div></div>}
      {filas && filas.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Bloqueado</th><th>Motivo</th><th>Desde</th><th></th></tr></thead>
            <tbody>
              {filas.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.tipo === 'dominio' ? `@${b.valor}` : b.valor}</strong>
                    <div className="meta">{b.tipo === 'dominio' ? 'Dominio entero' : 'Email'}</div></td>
                  <td>{b.motivo || '—'}</td>
                  <td>{new Date(b.creado_en).toLocaleDateString('es-ES')}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={async () => { const r = await quitarBloqueo(b.id); if (!r.ok) setError(r.error); cargar(); }}>Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Confirmar({ p, onCerrar, onHecho }: { p: Persona; onCerrar: () => void; onHecho: (t: string) => void }) {
  const [conf, setConf] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [bEmail, setBEmail] = useState(false);
  const [bDominio, setBDominio] = useState(false);
  const palabra = p.tipo === 'usuario' ? (p.email ?? '') : 'ANONIMIZAR';
  const dominio = p.tipo === 'usuario' && p.email?.includes('@') ? p.email.split('@')[1].toLowerCase() : null;
  async function confirmar() {
    setError(null); setTrabajando(true);
    const r = await anonimizarPersona(p.tipo, p.id, conf, bEmail, bDominio);
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    onHecho(`${p.nombre ?? TIPO[p.tipo]}: ${r.aviso}`);
  }
  return (
    <Modal abierto titulo={`Anonimizar — ${p.nombre ?? TIPO[p.tipo]}`} sub={`${TIPO[p.tipo]}${p.empresa ? ` · ${p.empresa}` : ''}`} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={trabajando}>Cancelar</button>
        <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={confirmar} disabled={trabajando || !conf.trim()}>{trabajando ? 'Anonimizando…' : 'Anonimizar para siempre'}</button>
      </>}>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      <div className="modal-warn-box">
        Solo cuando <strong>la propia persona lo pida por escrito</strong>. <strong>No se puede deshacer.</strong>{' '}
        {p.tipo === 'usuario' && 'Se borran sus datos, sus fichas de contacto y las notas internas, y la cuenta queda suspendida.'}
        {p.tipo === 'contacto' && 'Se quita esta ficha de contacto.'}
        {p.tipo === 'conductor' && 'Se borran su DNI y su teléfono (también en sus envíos); el nombre se queda en los CMR ya firmados, como prueba.'}
        {' '}La auditoría apunta que se anonimizó, sin guardar los datos borrados.
      </div>
      {dominio && (
        <div style={{ marginTop: '0.8rem', display: 'grid', gap: '0.35rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={bEmail} onChange={(e) => setBEmail(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Bloquear <strong>su email</strong> para que no pueda volver a darse de alta</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={bDominio} onChange={(e) => setBDominio(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Bloquear también <strong>todo su dominio</strong> (@{dominio}): nadie de esa empresa podrá registrarse</span>
          </label>
          <div className="meta">Quien lo intente verá solo «Actualmente no estamos dando de alta nuevos usuarios», sin más. La lista se gestiona abajo, en «Bloqueos de alta».</div>
        </div>
      )}
      <label htmlFor="anon-p" style={{ display: 'block', marginTop: '0.8rem' }}>Para confirmar, escribe <strong>{p.tipo === 'usuario' ? 'su email' : 'ANONIMIZAR'}</strong></label>
      <input id="anon-p" type="text" autoComplete="off" placeholder={palabra} value={conf} onChange={(e) => setConf(e.target.value)} style={{ width: '100%' }} />
    </Modal>
  );
}
