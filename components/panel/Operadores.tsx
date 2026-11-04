'use client';

// Transportistas propios del cliente (catálogo PRIVADO, tabla `operadores`), con el diseño
// de #sec-operadores de dashboard.html: Dynamo como fila fija arriba (no editable), y
// debajo los del cliente. Dynamo ve los de todos los clientes, con su columna de cliente.
import { useMemo, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import Documentos from './Documentos';
import Cargando from '@/components/Cargando';
import { guardarOperador, borrarOperador, type OperadorDatos } from '@/app/panel/(app)/operadores/acciones';
import { creadoTxt } from '@/lib/envios';
import { telBonito } from '@/lib/paises';
import { CONTACTO } from '@/lib/atencion';
import CampoTelefono from '@/components/CampoTelefono';

export type OperadorFila = OperadorDatos & {
  id: string; cliente: string | null; creado_en: string; modificado_en: string | null; envios: number;
};
type Cliente = { id: string; nombre_visible: string };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const IcoCamion = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1.5" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>;
// Texto de tranquilidad: qué es y qué NO hace Dynamo con estos transportistas.
const CHECK = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f6b3a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', marginTop: 2 }}><polyline points="20 6 9 17 4 12" /></svg>;
function Intro({ dynamo }: { dynamo: boolean }) {
  const punto = (t: React.ReactNode) => <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>{CHECK}<span>{t}</span></li>;
  return (
    <div className="table-wrap" style={{ padding: '0.9rem 1rem', marginBottom: '0.9rem' }}>
      <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: '0.3rem' }}>{dynamo ? 'La agenda privada de transportistas de cada cliente' : 'Tu agenda privada de transportistas'}</div>
      <p style={{ margin: '0 0 0.6rem', fontSize: 'var(--fs-m)', color: 'var(--gray-700)' }}>
        {dynamo ? 'Aquí cada cliente guarda' : 'Guarda aquí'} los transportistas con los que {dynamo ? 'ya trabaja' : 'ya trabajas'} por {dynamo ? 'su' : 'tu'} cuenta (empresas de transporte, operadores o autónomos) para {dynamo ? 'ver' : 'ver'} <strong>todos {dynamo ? 'sus' : 'tus'} envíos juntos en Envíos</strong>: los de Dynamo y los {dynamo ? 'suyos' : 'tuyos'}, en un solo sitio.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem', fontSize: 'var(--fs-m)', color: 'var(--gray-700)' }}>
        {punto(<><strong>Privado.</strong> {dynamo ? 'Cada cliente ve solo los suyos' : 'Solo lo ves tú y tu empresa'}: ningún otro cliente ni transportista de la plataforma tiene acceso.</>)}
        {punto(<><strong>Dynamo no interviene.</strong> En los envíos con {dynamo ? 'sus' : 'tus'} transportistas no contactamos con ellos ni tocamos nada: ni precios, ni albaranes, ni condiciones. Es {dynamo ? 'su' : 'tu'} relación directa.</>)}
        {punto(<><strong>Gratis y sin compromiso.</strong> Es solo una herramienta para {dynamo ? 'que tenga' : 'tener'} todo controlado. Se puede borrar cuando {dynamo ? 'quiera' : 'quieras'}.</>)}
      </ul>
    </div>
  );
}

export default function Operadores({ filas, dynamo, clientes, error }: { filas: OperadorFila[]; dynamo: boolean; clientes: Cliente[]; error: string | null }) {
  const refrescar = useRefrescar();
  const [q, setQ] = useState('');
  const [cli, setCli] = useState('');
  const [ficha, setFicha] = useState<{ fila: OperadorFila | null } | null>(null);
  const lista = useMemo(() => {
    const w = norm(q.trim()).split(/\s+/).filter(Boolean);
    return filas.filter((o) => (!cli || o.cliente_id === cli) && (!w.length || (() => {
      const b = norm([o.razon_social, o.cif, o.telefono, o.email, o.persona_contacto, o.web, o.anotaciones, o.cliente].filter(Boolean).join(' '));
      return w.every((t) => b.includes(t));
    })()));
  }, [filas, q, cli]);
  const cols = dynamo ? 6 : 5;

  return (
    <section className="section active" id="sec-operadores">
      <div className="sec-header">
        <h2>Transportistas{dynamo ? ' de los clientes' : ''} ({filas.length + 1})</h2>
        <button className="btn-primary" onClick={() => setFicha({ fila: null })}>+ Nuevo transportista</button>
      </div>
      <Intro dynamo={dynamo} />
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, CIF, contacto…" />
        {dynamo && (
          <select className="filter-estado" value={cli} onChange={(e) => setCli(e.target.value)} aria-label="Filtrar por cliente">
            <option value="">Cliente</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_visible}</option>)}
          </select>
        )}
      </div>
      {error && <div className="pt-aviso error">No se han podido cargar los transportistas: {error}</div>}
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Operador</th>{dynamo && <th>Cliente</th>}<th>Teléfono</th><th>Email</th><th>Contacto</th><th>Notas</th></tr></thead>
          <tbody>
            {/* Dynamo, siempre la primera y fija: es el transportista de la propia plataforma. */}
            <tr style={{ background: 'rgba(51,0,204,0.07)', cursor: 'default', boxShadow: 'inset 4px 0 0 var(--purple)' }}>
              <td className="ref">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <img src="/images/2.png" alt="" aria-hidden="true" style={{ height: 18, width: 'auto' }} />
                  <span style={{ fontSize: 'var(--fs-s)', fontWeight: 800, background: 'var(--purple)', color: '#fff', borderRadius: 6, padding: '1px 7px' }}>Plataforma</span>
                </div>
                <strong style={{ color: 'var(--purple)' }}>Dynamo Operador de Transportes</strong>
                <div className="meta">Transportista de la plataforma · siempre disponible</div>
              </td>
              {dynamo && <td>Todos los clientes</td>}
              <td>{CONTACTO.telefono}</td><td>{CONTACTO.email}</td><td>Álvaro Blanco</td>
              <td className="notas"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                Ficha fija, no se edita</span></td>
            </tr>
            {lista.length === 0 ? (
              <tr><td colSpan={cols} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {filas.length ? 'Sin transportistas que coincidan con la búsqueda.' : dynamo ? 'Ningún cliente ha añadido todavía transportistas propios.' : 'Aún no has añadido transportistas propios. Añade uno con «+ Nuevo transportista».'}
              </td></tr>
            ) : lista.map((o) => (
              <tr key={o.id} onClick={() => setFicha({ fila: o })} style={{ cursor: 'pointer' }}>
                <td className="ref"><strong>{o.razon_social}</strong><div className="meta">{o.cif}{o.envios ? ` · ${o.envios} envío${o.envios > 1 ? 's' : ''}` : ''}</div></td>
                {dynamo && <td>{o.cliente ?? '—'}</td>}
                <td>{o.telefono ? telBonito(o.telefono) : '—'}</td>
                <td>{o.email || '—'}</td>
                <td>{o.persona_contacto || '—'}</td>
                <td className="notas">{o.anotaciones || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ficha && <FichaOperador fila={ficha.fila} dynamo={dynamo} clientes={clientes} onCerrar={() => setFicha(null)} onHecho={() => { setFicha(null); refrescar(); }} />}
    </section>
  );
}

function FichaOperador({ fila, dynamo, clientes, onCerrar, onHecho }: {
  fila: OperadorFila | null; dynamo: boolean; clientes: Cliente[]; onCerrar: () => void; onHecho: () => void;
}) {
  const [d, setD] = useState<OperadorDatos>({
    cliente_id: fila?.cliente_id ?? null, razon_social: fila?.razon_social ?? '', cif: fila?.cif ?? '', telefono: fila?.telefono ?? '',
    email: fila?.email ?? '', persona_contacto: fila?.persona_contacto ?? '', web: fila?.web ?? '', anotaciones: fila?.anotaciones ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [preguntaBorrar, setPreguntaBorrar] = useState(false);
  const set = <K extends keyof OperadorDatos>(k: K, v: OperadorDatos[K]) => setD((x) => ({ ...x, [k]: v }));

  async function guardar() {
    setError(null);
    if (!d.razon_social.trim() || !d.cif.trim()) { setError('El nombre y el CIF/NIF son obligatorios.'); return; }
    if (dynamo && !fila && !d.cliente_id) { setError('Elige de qué cliente es este transportista.'); return; }
    setTrabajando(fila ? 'Guardando cambios' : 'Creando transportista');
    const r = await guardarOperador(fila?.id ?? null, d);
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    onHecho();
  }
  async function borrar() {
    if (!fila) return;
    setTrabajando('Quitando del catálogo');
    const r = await borrarOperador(fila.id);
    setTrabajando(null);
    if (!r.ok) { setError(r.error); setPreguntaBorrar(false); return; }
    onHecho();
  }
  const campo = (k: keyof OperadorDatos, label: string, ph: string, full = false, tipo = 'text') => (
    <div style={full ? { gridColumn: '1/-1' } : undefined}>
      <label htmlFor={`op-${k}`}>{label}</label>
      <input id={`op-${k}`} type={tipo} value={String(d[k] ?? '')} placeholder={ph} onChange={(e) => set(k, e.target.value as never)} />
    </div>
  );

  if (preguntaBorrar && fila) {
    return (
      <Modal abierto titulo={`Quitar ${fila.razon_social}`} sub="Del catálogo de transportistas" icono={<IcoCamion />} onCerrar={() => setPreguntaBorrar(false)}
        pie={<>
          <button className="btn-ghost" onClick={() => setPreguntaBorrar(false)}>No, volver</button>
          <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={borrar} disabled={!!trabajando}>Sí, quitarlo</button>
        </>}>
        <p style={{ fontSize: 'var(--fs-l)', color: 'var(--gray-700)' }}>Deja de salir en el catálogo y al crear envíos. Los <strong>{fila.envios} envío{fila.envios === 1 ? '' : 's'}</strong> que ya se hicieron con él lo conservan.</p>
        {trabajando && <Cargando texto={trabajando} />}
      </Modal>
    );
  }

  return (
    <Modal abierto titulo={fila ? 'Editar transportista' : 'Nuevo transportista'} sub={fila ? `${fila.razon_social}${dynamo && fila.cliente ? ` · de ${fila.cliente}` : ''}` : 'Se añade al catálogo privado de transportistas'}
      icono={<IcoCamion />} onCerrar={onCerrar}
      pie={<>
        {fila && <button className="btn-ghost" style={{ color: 'var(--red)', marginRight: 'auto' }} onClick={() => setPreguntaBorrar(true)} disabled={!!trabajando}>Quitar del catálogo</button>}
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cancelar</button>
        <button className="btn-primary" onClick={guardar} disabled={!!trabajando}>{fila ? 'Guardar cambios' : 'Crear transportista'}</button>
      </>}>
      {!fila && <div style={{ marginBottom: '0.8rem', padding: '0.65rem 0.8rem', background: 'rgba(51,0,204,0.06)', border: '1px solid rgba(51,0,204,0.2)', borderRadius: 10, fontSize: 'var(--fs-m)', lineHeight: 1.55, color: 'var(--gray-700)' }}><strong>Privado y sin intervención de Dynamo.</strong> Solo lo ve {dynamo ? 'ese cliente' : 'tu empresa'}; no contactamos con este transportista ni tocamos precios, albaranes ni condiciones. Sirve para ver todos los envíos juntos en Envíos.</div>}
      {fila && (
        <div style={{ margin: '0 0 0.9rem', padding: '0.55rem 0.85rem', border: '1px solid var(--gray-200)', borderRadius: 9, background: 'var(--gray-50)', fontSize: 'var(--fs-m)', color: 'var(--gray-500)', fontWeight: 600 }}>
          Creado: {creadoTxt(fila.creado_en)}{fila.modificado_en ? ` · Última modificación: ${creadoTxt(fila.modificado_en)}` : ''}
        </div>
      )}
      <div className="ptar-sitio-grid">
        {dynamo && (
          <div style={{ gridColumn: '1/-1' }}>
            <label htmlFor="op-cli">Cliente (dueño del catálogo)</label>
            <select id="op-cli" className="ptar-select" value={d.cliente_id ?? ''} disabled={!!fila} onChange={(e) => set('cliente_id', e.target.value || null)}>
              <option value="">Selecciona el cliente…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_visible}</option>)}
            </select>
          </div>
        )}
        {campo('razon_social', 'Nombre / Razón social *', 'Ej. Transportes Iberia Express S.L.', true)}
        {campo('cif', 'CIF / NIF *', 'B12345678')}
        <div><label htmlFor="op-telefono">Teléfono</label><CampoTelefono id="op-telefono" valor={String(d.telefono ?? '')} onCambio={(v) => set('telefono', v as never)} /></div>
        {campo('email', 'Email', 'trafico@empresa.com', false, 'email')}
        {campo('persona_contacto', 'Persona de contacto', 'Nombre y apellidos')}
        {campo('web', 'Web', 'www.empresa.com', true)}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="op-notas">Notas</label>
          <textarea id="op-notas" rows={3} value={d.anotaciones} onChange={(e) => set('anotaciones', e.target.value)} placeholder="Lo que haga falta recordar de este transportista" />
        </div>
      </div>
      <div style={{ marginTop: '0.7rem' }}>
        <label style={{ display: 'block', fontWeight: 700, color: 'var(--navy)', fontSize: 'var(--fs-m)', marginBottom: '0.3rem' }}>Logo · para la orden de transporte</label>
        {fila ? <Documentos dueno={{ campo: 'operador_id', id: fila.id }} tipos={['logo']} max={1} soloImagen />
          : <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: 0 }}>Crea el transportista y, al abrir su ficha, podrás subir su logo.</p>}
      </div>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
