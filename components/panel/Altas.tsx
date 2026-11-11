'use client';

// Altas pendientes (solo Dynamo), con el diseño de #sec-altas de dashboard.html: clientes
// que se han registrado en el portal y transportistas dados de alta desde una carga. Al confirmar se le asocia su empresa
// (una que ya existe o una nueva con lo que escribió) y la cuenta queda activa.
import { useEffect, useMemo, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import Documentos from './Documentos';
import Cargando from '@/components/Cargando';
import { confirmarAlta, crearEmpresaDesdeAlta, suspenderAlta, type NuevaEmpresa } from '@/app/panel/(app)/altas/acciones';

import { fecha, euros, fechaHora } from '@/lib/formato';
import { estadoCola, duracionTxt, COLA_OBJETIVO_TXT } from '@/lib/colaAltas';
import { resolverContraoferta } from '@/app/panel/(app)/envios/acciones';
import { telBonito } from '@/lib/paises';
import SelectorPais from '@/components/SelectorPais';
// Etiquetas según el criterio único (usuario, 2026-11-09).
import Req from '@/components/Req';

export type AltaFila = {
  id: string; email: string; nombre: string; telefono: string; documento: string; documento_pais: string; solicitada_en: string; confirmado_email: boolean;
  empresa: string; cif: string; direccion: string; codigo_postal: string; poblacion: string; provincia: string; pais: string;
};
// Transportista dado de alta online desde el enlace de una carga (solo bolsas Alpega).
export type AltaTransportista = {
  reserva: string; envio_id: string; id: string; nombre: string; cif: string; pais: string; bolsa: string; codigo_bolsa: string;
  verificado: boolean; telefono: string; solicitada_en: string; envio: string; ruta: string;
  fecha_desde: string | null; fecha_hasta: string | null; precio: number | null; precio_base: number | null;
};
type Cliente = { id: string; nombre_visible: string; cif: string };
type Item = { tipo: 'cliente'; a: AltaFila } | { tipo: 'transportista'; t: AltaTransportista };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s.-]/g, '').toLowerCase();
const IcoUsuario = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><polyline points="17 11 19 13 23 9" /></svg>;
const IcoCamion = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1.5" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>;
// Clientes en azul, transportistas en naranja (los mismos del selector «Ver como»).
const Chip = ({ tipo = 'cliente' }: { tipo?: 'cliente' | 'transportista' }) => (
  <span className={`alta-chip alta-${tipo}`}>{tipo === 'cliente' ? 'Cliente' : 'Transportista'}</span>
);
const horaTxt = (iso: string) => fechaHora(iso);
const eur = (n: number | null) => euros(n);

// Reloj de atención de una solicitud: espera real + barra de 30 minutos de oficina.
function Reloj({ desde, fest, ahora }: { desde: string; fest: Set<string>; ahora: Date }) {
  const e = estadoCola(desde, fest, ahora);
  return (
    <div className="alta-reloj">
      <div className="alta-espera">{duracionTxt(e.esperaMin)}</div>
      {e.urgente ? <span className="alta-urgente">URGENTE</span>
        : e.enCola ? <span className="alta-cola">En cola · empieza a las 8:30</span>
        : <div className="alta-barra" title={`${duracionTxt(e.oficinaMin)} de ${COLA_OBJETIVO_TXT}`}><span style={{ width: `${Math.round(e.progreso * 100)}%` }} /></div>}
    </div>
  );
}

export default function Altas({ filas, transportistas = [], festivos = [], clientes, error }: {
  filas: AltaFila[]; transportistas?: AltaTransportista[]; festivos?: string[]; clientes: Cliente[]; error: string | null;
}) {
  const refrescar = useRefrescar();
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState<'' | 'cliente' | 'transportista'>('');
  const [ver, setVer] = useState<AltaFila | null>(null);
  const [verT, setVerT] = useState<AltaTransportista | null>(null);
  const fest = useMemo(() => new Set(festivos), [festivos]);
  // El reloj se mueve solo (cada 15 s).
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 15000); return () => clearInterval(t); }, []);
  const todos: Item[] = useMemo(() => [
    ...filas.map((a) => ({ tipo: 'cliente' as const, a })),
    ...transportistas.map((t) => ({ tipo: 'transportista' as const, t })),
  ].sort((x, y) => (x.tipo === 'cliente' ? x.a.solicitada_en : x.t.solicitada_en).localeCompare(y.tipo === 'cliente' ? y.a.solicitada_en : y.t.solicitada_en)), [filas, transportistas]);
  const lista = useMemo(() => {
    const w = norm(q);
    return todos.filter((i) => (!tipo || i.tipo === tipo) && (!w || norm(i.tipo === 'cliente'
      ? [i.a.email, i.a.nombre, i.a.documento, i.a.telefono, i.a.empresa, i.a.cif, i.a.poblacion, i.a.provincia].join(' ')
      : [i.t.nombre, i.t.cif, i.t.telefono, i.t.bolsa, i.t.codigo_bolsa, i.t.envio, i.t.ruta].join(' ')).includes(w)));
  }, [todos, q, tipo]);
  const urgentes = todos.filter((i) => estadoCola(i.tipo === 'cliente' ? i.a.solicitada_en : i.t.solicitada_en, fest, ahora).urgente).length;

  return (
    <section className="section active" id="sec-altas">
      <div className="sec-header"><h2>Altas pendientes ({lista.length})</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.6rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Solicitudes de alta esperando a Dynamo: <span className="alta-chip alta-cliente">clientes</span> que se registran en el portal y <span className="alta-chip alta-transportista">transportistas</span> que se dan de alta desde el enlace de un envío. Pulsa una fila para revisarla. La más antigua, arriba.
      </p>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-s)', margin: '0 0 0.9rem' }}>
        <strong>Tiempo:</strong> lo que lleva esperando (horas y minutos). La barra cuenta <strong>{COLA_OBJETIVO_TXT}</strong> de horario de oficina (lunes a viernes 8:30–17:30, sin festivos); al llenarse pasa a <strong style={{ color: '#b42318' }}>URGENTE</strong>. Fuera de ese horario la solicitud queda <strong>en cola</strong> y la barra arranca a las 8:30.
        {urgentes > 0 && <> · <strong style={{ color: '#b42318' }}>{urgentes} urgente{urgentes === 1 ? '' : 's'}</strong></>}
      </p>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por email, empresa, CIF, nombre, teléfono, bolsa…" />
        <select className="filter-estado" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} aria-label="Tipo de alta">
          <option value="">Todas</option><option value="cliente">Clientes</option><option value="transportista">Transportistas</option>
        </select>
      </div>
      {error && <div className="pt-aviso error">No se han podido cargar las altas: {error}</div>}
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Tipo · usuario</th><th>Empresa · CIF</th><th>Nombre · bolsa</th><th>Teléfono</th><th>Estado</th><th>Solicitada</th><th style={{ minWidth: 150 }}>Tiempo</th></tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>{todos.length ? 'Sin altas que coincidan' : 'No hay altas pendientes de verificar.'}</td></tr>
            ) : lista.map((i) => i.tipo === 'cliente' ? (
              <tr key={`c${i.a.id}`} className="alta-fila alta-cliente" onClick={() => setVer(i.a)}>
                <td><Chip /><div><strong>{i.a.email}</strong></div></td>
                <td>{i.a.empresa || '—'}<div className="meta">{i.a.cif || 'Sin CIF'}</div></td>
                <td>{i.a.nombre || '—'}{i.a.documento ? <div className="meta">{i.a.documento}</div> : <div className="meta" style={{ color: '#b45309' }}>Sin DNI</div>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{i.a.telefono ? telBonito(i.a.telefono) : '—'}</td>
                <td>{i.a.confirmado_email ? <span className="badge badge-green">Email confirmado</span> : <span className="badge badge-orange">Email sin confirmar</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{horaTxt(i.a.solicitada_en)}</td>
                <td><Reloj desde={i.a.solicitada_en} fest={fest} ahora={ahora} /></td>
              </tr>
            ) : (
              <tr key={`t${i.t.reserva}`} className="alta-fila alta-transportista" onClick={() => setVerT(i.t)}>
                <td><Chip tipo="transportista" /><div><strong>Pide el envío #{i.t.envio}</strong></div><div className="meta">{i.t.ruta}</div></td>
                <td>{i.t.nombre}<div className="meta">{i.t.cif}{i.t.pais ? ` · ${i.t.pais}` : ''}</div></td>
                <td>{i.t.bolsa}<div className="meta">Código {i.t.codigo_bolsa || '—'}</div></td>
                <td style={{ whiteSpace: 'nowrap' }}>{i.t.telefono ? telBonito(i.t.telefono) : '—'}</td>
                <td>{i.t.verificado ? <span className="badge badge-green">Ficha activa</span> : <span className="badge badge-orange">Sin verificar</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{horaTxt(i.t.solicitada_en)}</td>
                <td><Reloj desde={i.t.solicitada_en} fest={fest} ahora={ahora} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ver && <FichaAlta a={ver} clientes={clientes} onCerrar={() => setVer(null)} onHecho={() => { setVer(null); refrescar(); }} />}
      {verT && <FichaAltaTransportista t={verT} onCerrar={() => setVerT(null)} onHecho={() => { setVerT(null); refrescar(); }} />}
    </section>
  );
}

// Transportista nuevo: se comprueba en su bolsa, se completa su ficha y se aprueba o rechaza.
function FichaAltaTransportista({ t, onCerrar, onHecho }: { t: AltaTransportista; onCerrar: () => void; onHecho: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const fila = (k: string, v: React.ReactNode) => <div className="pen-sum-row"><span className="k">{k}</span><span className="v">{v || '—'}</span></div>;
  async function resolver(aprobar: boolean) {
    setError(null); setTrabajando(aprobar ? 'Aprobando' : 'Rechazando');
    const r = await resolverContraoferta(t.reserva, aprobar);
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    onHecho();
  }
  return (
    <Modal abierto titulo={`Alta de transportista — ${t.cif}`} sub={`Solicitada el ${horaTxt(t.solicitada_en)} · pide el envío #${t.envio}`} icono={<IcoCamion />} onCerrar={onCerrar} ancho={680}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cerrar</button>
        <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={() => resolver(false)} disabled={!!trabajando}>Rechazar</button>
        <button className="btn-primary" onClick={() => resolver(true)} disabled={!!trabajando}>Aprobar y darle el envío</button>
      </>}>
      <div className="modal-warn-box" style={{ marginBottom: '0.8rem' }}>
        <strong>Antes de aprobar:</strong> búscalo en <strong>{t.bolsa}</strong> con el código <strong>{t.codigo_bolsa}</strong>, completa en{' '}
        <a href={`/panel/transportistas?ver=${t.id}`} style={{ color: 'var(--purple)', fontWeight: 700 }}>su ficha</a> la razón social, dirección, seguro y email, y ponlo como <strong>Activo</strong>.
        Si no está en la bolsa o algo no cuadra, <strong>rechaza</strong>: el envío vuelve a quedar libre.
      </div>
      <div className="pen-envio-sum">
        {fila('Tipo de cuenta', <Chip tipo="transportista" />)}
        {fila('Bolsa de cargas', `${t.bolsa} · código ${t.codigo_bolsa}`)}
        {fila('CIF / NIF', t.cif)}
        {fila('País', t.pais)}
        {fila('Teléfono', t.telefono ? <a href={`tel:${t.telefono}`} style={{ color: 'var(--purple)', fontWeight: 700 }}>{telBonito(t.telefono)}</a> : '')}
        {fila('Ficha', t.verificado ? 'Activa (ya verificado)' : <span style={{ color: '#b45309', fontWeight: 700 }}>Sin verificar — razón social provisional</span>)}
      </div>
      <div className="ptar-section-head" style={{ marginTop: '1rem' }}>El envío que pide</div>
      <div className="pen-envio-sum">
        {fila('Envío', <a href={`/panel/envios?ver=${t.envio_id}`} style={{ color: 'var(--purple)', fontWeight: 700 }}>#{t.envio}</a>)}
        {fila('Ruta', t.ruta)}
        {fila('Fecha de carga', t.fecha_desde ? (t.fecha_hasta && t.fecha_hasta !== t.fecha_desde ? `${fecha(t.fecha_desde)} – ${fecha(t.fecha_hasta)}` : fecha(t.fecha_desde)) : '')}
        {fila('Precio que pide', <>{eur(t.precio)}{t.precio_base != null && t.precio != null && t.precio !== t.precio_base ? <span className="meta"> (ofertada a {eur(t.precio_base)})</span> : null}</>)}
      </div>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}

function FichaAlta({ a, clientes, onCerrar, onHecho }: { a: AltaFila; clientes: Cliente[]; onCerrar: () => void; onHecho: () => void }) {
  // Si su CIF ya es de un cliente, lo normal es asociarla a ese (regla 10: un CIF, un cliente).
  const coincide = a.cif ? clientes.find((c) => norm(c.cif) === norm(a.cif)) ?? null : null;
  const [clienteId, setClienteId] = useState(coincide?.id ?? '');
  const [lista, setLista] = useState<Cliente[]>(clientes);   // los clientes del selector (+ el que se cree aquí)
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [n, setN] = useState<NuevaEmpresa>({ razon_social: a.empresa, cif: a.cif, direccion: a.direccion, codigo_postal: a.codigo_postal,
    poblacion: a.poblacion, provincia: a.provincia, pais_codigo_iso: a.pais.length === 2 ? a.pais.toUpperCase() : 'ES' });
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [preguntaSuspender, setPreguntaSuspender] = useState(false);
  const fila = (k: string, v: React.ReactNode) => <div className="pen-sum-row"><span className="k">{k}</span><span className="v">{v || '—'}</span></div>;

  async function confirmar() {
    setError(null); setTrabajando('Confirmando el alta');
    const r = await confirmarAlta(a.id, { id: clienteId });
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    onHecho();
  }
  async function crearEmpresa() {
    setError(null); setTrabajando('Creando la empresa');
    const r = await crearEmpresaDesdeAlta(n);
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    setLista((l) => [r.cliente, ...l.filter((c) => c.id !== r.cliente.id)]);
    setClienteId(r.cliente.id);
    setCrearAbierto(false);
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

  const campo = (k: keyof NuevaEmpresa, label: React.ReactNode, full = false) => (
    <div style={full ? { gridColumn: '1/-1' } : undefined}>
      <label htmlFor={`alta-${k}`}>{label}</label>
      <input id={`alta-${k}`} type="text" value={n[k]} onChange={(e) => setN((x) => ({ ...x, [k]: e.target.value }))} />
    </div>
  );
  return (
    <Modal abierto titulo={`Verificar alta de cliente — ${a.email}`} sub={`Solicitada el ${fechaHora(a.solicitada_en)}`} icono={<IcoUsuario />} onCerrar={onCerrar} ancho={720}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cerrar</button>
        <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={() => setPreguntaSuspender(true)} disabled={!!trabajando}>Suspender</button>
        <button className="btn-primary" onClick={confirmar} disabled={!!trabajando || !clienteId}>Confirmar alta</button>
      </>}>
      <p style={{ fontSize: 'var(--fs-m)', lineHeight: 1.55, color: 'var(--gray-700)', marginBottom: '0.7rem' }}>Datos tal cual los envió en el <strong>formulario de registro</strong> (las altas del portal son siempre de <strong>clientes</strong>).</p>
      <div className="pen-envio-sum">
        {fila('Email (usuario)', <><strong>{a.email}</strong>{a.confirmado_email ? '' : ' · aún no ha confirmado el email'}</>)}
        {fila('Tipo de cuenta', <Chip />)}
        {fila('Nombre y apellidos', a.nombre)}
        {fila('DNI / NIE', a.documento ? `${a.documento}${a.documento_pais ? ` (${a.documento_pais})` : ''}` : '')}
        {fila('Teléfono', a.telefono ? telBonito(a.telefono) : '')}
        {fila('Empresa / Razón social', a.empresa)}
        {fila('CIF', a.cif)}
        {fila('Dirección fiscal', [a.direccion, a.codigo_postal, a.poblacion, a.provincia].filter(Boolean).join(', '))}
      </div>
      <div className="ptar-section-head" style={{ marginTop: '1rem' }}>Documentación que ha subido</div>
      <div style={{ marginTop: '0.4rem' }}><Documentos dueno={{ campo: 'usuario_id', id: a.id }} tipos={['hoja_cif', 'dni', 'otro']} editable={false} /></div>

      <div className="ptar-section-head" style={{ marginTop: '1rem' }}>Empresa de la cuenta</div>
      {coincide && <div className="pt-aviso" style={{ margin: '0.5rem 0' }}><div>Su CIF ya es de <strong>{coincide.nombre_visible}</strong>: lo normal es asociarla a esa empresa (un CIF solo puede ser cliente una vez).</div></div>}
      {/* Un único selector: se busca el cliente y, si no está, la última opción crea uno nuevo. */}
      <select className="ptar-select" style={{ marginTop: '0.5rem' }} value={clienteId} aria-label="Cliente"
        onChange={(e) => { if (e.target.value === '__nuevo__') setCrearAbierto(true); else setClienteId(e.target.value); }}>
        <option value="">Selecciona el cliente…</option>
        {lista.map((c) => <option key={c.id} value={c.id}>{c.nombre_visible} · {c.cif}</option>)}
        <option value="__nuevo__">➕ Crear un cliente nuevo con sus datos…</option>
      </select>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>Al confirmar, la cuenta queda <strong>activa</strong> y ya puede entrar. Las condiciones del cliente (plazo de pago, crédito, factor…) se completan en <strong>Clientes</strong>.</p>
      {error && !crearAbierto && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && !crearAbierto && <Cargando texto={trabajando} />}

      {crearAbierto && (
        <Modal abierto titulo="Crear un cliente nuevo" sub="Con los datos del registro; luego se asocia a esta cuenta." icono={<IcoUsuario />} ancho={620}
          onCerrar={() => { if (!trabajando) { setError(null); setCrearAbierto(false); } }}
          pie={<>
            <button className="btn-ghost" onClick={() => { setError(null); setCrearAbierto(false); }} disabled={!!trabajando}>Cancelar</button>
            <button className="btn-primary" onClick={crearEmpresa} disabled={!!trabajando || !n.razon_social.trim() || !n.cif.trim()}>Crear y seleccionar</button>
          </>}>
          <div className="ptar-sitio-grid">
            {campo('razon_social', <>Razón social <Req /></>, true)}
            {campo('cif', <>CIF / NIF <Req /></>)}
            <div>
              <label htmlFor="alta-pais">País</label>
              <SelectorPais id="alta-pais" valor={n.pais_codigo_iso} onCambio={(v) => setN((x) => ({ ...x, pais_codigo_iso: v }))} />
            </div>
            {campo('direccion', <>Dirección (calle y número) <Req si={false} /></>, true)}
            {campo('codigo_postal', <>Código postal <Req si={false} /></>)}
            {campo('poblacion', <>Población <Req si={false} /></>)}
            {campo('provincia', <>Provincia <Req si={false} /></>)}
          </div>
          {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
          {trabajando && <Cargando texto={trabajando} />}
        </Modal>
      )}
    </Modal>
  );
}
