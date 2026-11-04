'use client';

// Altas pendientes (solo Dynamo), con el diseño de #sec-altas de dashboard.html: quien se
// ha registrado en el portal y espera verificación. Al confirmar se le asocia su empresa
// (una que ya existe o una nueva con lo que escribió) y la cuenta queda activa.
import { useMemo, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import Documentos from './Documentos';
import Cargando from '@/components/Cargando';
import { confirmarAlta, suspenderAlta, type NuevaEmpresa } from '@/app/panel/(app)/altas/acciones';
import { creadoTxt } from '@/lib/envios';
import { telBonito } from '@/lib/paises';
import SelectorPais from '@/components/SelectorPais';

export type AltaFila = {
  id: string; email: string; nombre: string; telefono: string; documento: string; solicitada_en: string; confirmado_email: boolean;
  empresa: string; cif: string; direccion: string; codigo_postal: string; poblacion: string; provincia: string; pais: string;
};
type Cliente = { id: string; nombre_visible: string; cif: string };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s.-]/g, '').toLowerCase();
const IcoUsuario = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><polyline points="17 11 19 13 23 9" /></svg>;
const Chip = () => <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)' }}>Cliente</span>;

export default function Altas({ filas, clientes, error }: { filas: AltaFila[]; clientes: Cliente[]; error: string | null }) {
  const refrescar = useRefrescar();
  const [q, setQ] = useState('');
  const [ver, setVer] = useState<AltaFila | null>(null);
  const lista = useMemo(() => {
    const w = norm(q);
    return !w ? filas : filas.filter((a) => norm([a.email, a.nombre, a.documento, a.telefono, a.empresa, a.cif, a.poblacion, a.provincia].join(' ')).includes(w));
  }, [filas, q]);

  return (
    <section className="section active" id="sec-altas">
      <div className="sec-header"><h2>Altas pendientes ({lista.length})</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Solicitudes de alta de <strong>clientes</strong> pendientes de verificar. Pulsa una fila para revisar los datos y confirmar el alta o suspenderla (un email suspendido no puede volver a solicitar acceso). Los <strong>transportistas no pasan por aquí</strong>: los da de alta el equipo directamente.
      </p>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por email, empresa, CIF, nombre, teléfono…" />
      </div>
      {error && <div className="pt-aviso error">No se han podido cargar las altas: {error}</div>}
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Email · usuario</th><th>Empresa · CIF</th><th>Nombre y apellidos</th><th>Teléfono</th><th>Email confirmado</th><th>Solicitada</th></tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>{filas.length ? 'Sin altas que coincidan' : 'No hay altas pendientes de verificar.'}</td></tr>
            ) : lista.map((a) => (
              <tr key={a.id} onClick={() => setVer(a)} style={{ cursor: 'pointer' }}>
                <td><strong>{a.email}</strong><div className="meta"><Chip /></div></td>
                <td>{a.empresa || '—'}<div className="meta">{a.cif || 'Sin CIF'}</div></td>
                <td>{a.nombre || '—'}{a.documento ? <div className="meta">{a.documento}</div> : <div className="meta" style={{ color: '#b45309' }}>Sin DNI</div>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{a.telefono ? telBonito(a.telefono) : '—'}</td>
                <td>{a.confirmado_email ? <span className="badge badge-green">Sí</span> : <span className="badge badge-orange">Todavía no</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{creadoTxt(a.solicitada_en)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ver && <FichaAlta a={ver} clientes={clientes} onCerrar={() => setVer(null)} onHecho={() => { setVer(null); refrescar(); }} />}
    </section>
  );
}

function FichaAlta({ a, clientes, onCerrar, onHecho }: { a: AltaFila; clientes: Cliente[]; onCerrar: () => void; onHecho: () => void }) {
  // Si su CIF ya es de un cliente, lo normal es asociarla a ese (regla 10: un CIF, un cliente).
  const coincide = a.cif ? clientes.find((c) => norm(c.cif) === norm(a.cif)) ?? null : null;
  const [modo, setModo] = useState<'existente' | 'nuevo'>(coincide || !a.empresa ? 'existente' : 'nuevo');
  const [clienteId, setClienteId] = useState(coincide?.id ?? '');
  const [n, setN] = useState<NuevaEmpresa>({ razon_social: a.empresa, cif: a.cif, direccion: a.direccion, codigo_postal: a.codigo_postal,
    poblacion: a.poblacion, provincia: a.provincia, pais_codigo_iso: a.pais.length === 2 ? a.pais.toUpperCase() : 'ES' });
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [preguntaSuspender, setPreguntaSuspender] = useState(false);
  const fila = (k: string, v: React.ReactNode) => <div className="pen-sum-row"><span className="k">{k}</span><span className="v">{v || '—'}</span></div>;

  async function confirmar() {
    setError(null); setTrabajando('Confirmando el alta');
    const r = await confirmarAlta(a.id, modo === 'existente' ? { id: clienteId } : { nuevo: n });
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    onHecho();
  }
  async function suspender() {
    setTrabajando('Suspendiendo');
    const r = await suspenderAlta(a.id);
    setTrabajando(null);
    if (!r.ok) { setError(r.error); setPreguntaSuspender(false); return; }
    onHecho();
  }

  if (preguntaSuspender) {
    return (
      <Modal abierto titulo={`Suspender ${a.email}`} sub="La cuenta queda bloqueada" icono={<IcoUsuario />} onCerrar={() => setPreguntaSuspender(false)}
        pie={<>
          <button className="btn-ghost" onClick={() => setPreguntaSuspender(false)}>No, volver</button>
          <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={suspender} disabled={!!trabajando}>Sí, suspender</button>
        </>}>
        <p style={{ fontSize: 'var(--fs-l)', color: 'var(--gray-700)' }}>No podrá entrar en el portal y ese email <strong>no podrá volver a solicitar acceso</strong>. Se puede reactivar más tarde desde <strong>Usuarios</strong>.</p>
        {trabajando && <Cargando texto={trabajando} />}
      </Modal>
    );
  }

  const campo = (k: keyof NuevaEmpresa, label: string, full = false) => (
    <div style={full ? { gridColumn: '1/-1' } : undefined}>
      <label htmlFor={`alta-${k}`}>{label}</label>
      <input id={`alta-${k}`} type="text" value={n[k]} onChange={(e) => setN((x) => ({ ...x, [k]: e.target.value }))} />
    </div>
  );
  return (
    <Modal abierto titulo={`Verificar alta de cliente — ${a.email}`} sub={`Solicitada el ${creadoTxt(a.solicitada_en)}`} icono={<IcoUsuario />} onCerrar={onCerrar} ancho={720}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cerrar</button>
        <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={() => setPreguntaSuspender(true)} disabled={!!trabajando}>Suspender</button>
        <button className="btn-primary" onClick={confirmar} disabled={!!trabajando || (modo === 'existente' && !clienteId)}>Confirmar alta</button>
      </>}>
      <p style={{ fontSize: 'var(--fs-m)', lineHeight: 1.55, color: 'var(--gray-700)', marginBottom: '0.7rem' }}>Datos tal cual los envió en el <strong>formulario de registro</strong> (las altas del portal son siempre de <strong>clientes</strong>).</p>
      <div className="pen-envio-sum">
        {fila('Email (usuario)', <><strong>{a.email}</strong>{a.confirmado_email ? '' : ' · aún no ha confirmado el email'}</>)}
        {fila('Tipo de cuenta', <Chip />)}
        {fila('Nombre y apellidos', a.nombre)}
        {fila('DNI', a.documento)}
        {fila('Teléfono', a.telefono ? telBonito(a.telefono) : '')}
        {fila('Empresa / Razón social', a.empresa)}
        {fila('CIF', a.cif)}
        {fila('Dirección fiscal', [a.direccion, a.codigo_postal, a.poblacion, a.provincia].filter(Boolean).join(', '))}
      </div>
      <div className="ptar-section-head" style={{ marginTop: '1rem' }}>Documentación que ha subido</div>
      <div style={{ marginTop: '0.4rem' }}><Documentos dueno={{ campo: 'usuario_id', id: a.id }} tipos={['hoja_cif', 'dni', 'otro']} editable={false} /></div>

      <div className="ptar-section-head" style={{ marginTop: '1rem' }}>Empresa de la cuenta</div>
      {coincide && <div className="pt-aviso" style={{ margin: '0.5rem 0' }}><div>Su CIF ya es de <strong>{coincide.nombre_visible}</strong>: lo normal es asociarla a esa empresa (un CIF solo puede ser cliente una vez).</div></div>}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0 0.7rem' }}>
        <button type="button" className={modo === 'existente' ? 'btn-primary' : 'btn-ghost'} onClick={() => setModo('existente')}>Asociar a un cliente que ya existe</button>
        <button type="button" className={modo === 'nuevo' ? 'btn-primary' : 'btn-ghost'} onClick={() => setModo('nuevo')}>Crear un cliente nuevo con sus datos</button>
      </div>
      {modo === 'existente' ? (
        <select className="ptar-select" value={clienteId} onChange={(e) => setClienteId(e.target.value)} aria-label="Cliente">
          <option value="">Selecciona el cliente…</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_visible} · {c.cif}</option>)}
        </select>
      ) : (
        <div className="ptar-sitio-grid">
          {campo('razon_social', 'Razón social *', true)}
          {campo('cif', 'CIF / NIF *')}
          <div>
            <label htmlFor="alta-pais">País</label>
            <SelectorPais id="alta-pais" valor={n.pais_codigo_iso} onCambio={(v) => setN((x) => ({ ...x, pais_codigo_iso: v }))} />
          </div>
          {campo('direccion', 'Dirección (calle y número)', true)}
          {campo('codigo_postal', 'Código postal')}
          {campo('poblacion', 'Población')}
          {campo('provincia', 'Provincia')}
        </div>
      )}
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>Al confirmar, la cuenta queda <strong>activa</strong> y ya puede entrar. Las condiciones del cliente (plazo de pago, crédito, factor…) se completan en <strong>Clientes</strong>.</p>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
