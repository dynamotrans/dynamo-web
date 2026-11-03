'use client';

// Usuarios (solo Dynamo): diseño de #sec-usuarios de dashboard.html. Cada usuario es un
// email de acceso de un admin, empleado, cliente o transportista. El alta es una
// INVITACIÓN (el usuario crea su propia contraseña) y el rol se cambia con una acción
// aparte que pide teclear su email, como en el mockup.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from './Modal';
import Cargando from '@/components/Cargando';
import { guardarUsuario, cambiarRol, cambiarEmail, invitarUsuario, reenviarInvitacion, type UsuarioDatos } from '@/app/panel/(app)/usuarios/acciones';
import type { Rol } from '@/lib/sesion';
import { creadoTxt } from '@/lib/envios';
import { partirTel, telBonito } from '@/lib/paises';
import SelectorPais from '@/components/SelectorPais';

export type Empresa = { id: string; nombre: string; cif: string };
export type UsuarioFila = UsuarioDatos & {
  id: string; email: string; rol: Rol; creado_en: string; modificado_en: string | null;
  ultima_conexion: string | null; email_confirmado: boolean;
  envios: number; cancelados: number; cancelados_ult10: number;
};

const ROLES: [Rol, string][] = [['admin', 'Admin'], ['empleado', 'Empleado'], ['cliente', 'Cliente'], ['transportista', 'Transportista']];
const ROL_COLOR: Record<Rol, [string, string]> = {
  admin: ['rgba(51,0,204,0.10)', 'var(--purple)'], empleado: ['rgba(15,23,42,0.08)', 'var(--navy)'],
  cliente: ['rgba(15,107,58,0.10)', '#0f6b3a'], transportista: ['rgba(255,122,0,0.12)', '#b45309'],
};
// Qué puede hacer cada rol: se enseña ANTES de confirmar un cambio (mockup).
const ROL_DESC: Record<Rol, string> = {
  admin: 'Acceso TOTAL a la plataforma: precios de compra y márgenes, todos los clientes y transportistas, penalizaciones, gestión de usuarios (incluidos los roles) y configuración.',
  empleado: 'Operativa interna del equipo Dynamo: envíos y almacenamientos de todos los clientes, incidencias, penalizaciones y catálogos. Sin gestión de usuarios ni configuración.',
  cliente: 'Solo SUS envíos, almacenamientos, facturas, albaranes e incidencias. No ve precios de compra, márgenes ni datos de otros clientes.',
  transportista: 'Solo los envíos que se le asignen y su documentación. No crea envíos ni ve datos de clientes.',
};
const ESTADOS: [UsuarioDatos['estado'], string][] = [['activa', 'Activa'], ['suspendida', 'Suspendida'], ['pendiente_verificacion', 'Pendiente de verificación']];
const IDIOMAS: [string, string][] = [['es', 'Español'], ['pt', 'Portugués'], ['fr', 'Francés'], ['en', 'Inglés'], ['de', 'Alemán'], ['it', 'Italiano'], ['nl', 'Neerlandés'], ['pl', 'Polaco'], ['ro', 'Rumano'], ['uk', 'Ucraniano'], ['zh-CN', 'Chino']];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nombreRol = (r: Rol) => ROLES.find(([k]) => k === r)?.[1] ?? r;
const interno = (r: Rol) => r === 'admin' || r === 'empleado';

function ChipRol({ rol }: { rol: Rol }) {
  const [bg, fg] = ROL_COLOR[rol];
  return <span style={{ display: 'inline-block', background: bg, color: fg, fontWeight: 700, borderRadius: 6, padding: '1px 8px', fontSize: 'var(--fs-s)', whiteSpace: 'nowrap' }}>{nombreRol(rol)}</span>;
}
// Métricas del mockup: cancelaciones sobre envíos en ROJO por encima del 29 %, y las de
// los últimos 10 en verde (≤ 2) o rojo (≥ 3).
function metricas(u: UsuarioFila) {
  if (!u.envios) return null;
  const pct = (u.cancelados / u.envios) * 100;
  return { pct: Math.round(pct), alto: pct > 29, ult10: Math.min(u.cancelados_ult10, 10), ult10Color: u.cancelados_ult10 >= 3 ? '#dc2626' : '#0f6b3a' };
}

export default function Usuarios({ filas, clientes, transportistas, yo, error }: {
  filas: UsuarioFila[]; clientes: Empresa[]; transportistas: Empresa[]; yo: { id: string; rol: Rol }; error: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [fRol, setFRol] = useState('');
  const [ficha, setFicha] = useState<UsuarioFila | null>(null);
  const [rolDe, setRolDe] = useState<UsuarioFila | null>(null);
  const [emailDe, setEmailDe] = useState<UsuarioFila | null>(null);
  const [invitar, setInvitar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const empresas = useMemo(() => new Map([...clientes, ...transportistas].map((e) => [e.id, e])), [clientes, transportistas]);
  const empresaDe = (u: UsuarioFila) => interno(u.rol) ? 'Dynamo' : empresas.get(u.cliente_id || u.transportista_id)?.nombre ?? '';

  const lista = useMemo(() => {
    const w = norm(q.trim());
    return filas.filter((u) => !fRol || u.rol === fRol)
      .filter((u) => !w || norm([u.email, u.nombre, u.documento, u.telefono, u.cargo, nombreRol(u.rol), empresaDe(u)].join(' ')).includes(w));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, q, fRol, empresas]);

  const hecho = (txt: string) => { setFicha(null); setRolDe(null); setInvitar(false); setAviso(txt); router.refresh(); };

  return (
    <section className="section active" id="sec-usuarios">
      <div className="sec-header">
        <h2>Usuarios ({lista.length})</h2>
        <div className="sec-header-actions">
          <button className="btn-primary" onClick={() => { setAviso(null); setInvitar(true); }}>+ Nuevo usuario</button>
        </div>
      </div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Cada usuario es un email de acceso asociado a un empleado, cliente, transportista o admin, con sus métricas de uso. Pulsa una fila para ver o editar la ficha.
      </p>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por email, nombre, DNI, teléfono, empresa…" />
        <select value={fRol} onChange={(e) => setFRol(e.target.value)} aria-label="Filtrar por tipo de usuario">
          <option value="">Tipo: todos</option>
          {ROLES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </div>
      {error && <div className="pt-aviso error">No se han podido cargar los usuarios: {error}</div>}
      {aviso && <div className="pt-aviso info">{aviso}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th>Email · usuario</th><th>Tipo</th><th>Nombre y apellidos</th><th>DNI</th><th>Teléfono</th>
            <th>Última conexión</th><th>Envíos creados</th><th>Cancelaciones</th><th>Cancel. / envíos</th><th>Cancelados en últ. 10</th>
          </tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>Sin usuarios que coincidan</td></tr>
            ) : lista.map((u) => {
              const m = metricas(u);
              return (
                <tr key={u.id} onClick={() => { setAviso(null); setFicha(u); }} style={{ cursor: 'pointer' }}>
                  <td><strong>{u.email}</strong>{u.id === yo.id && <> <span className="badge badge-green">Tú</span></>}<div className="meta">{empresaDe(u)}</div></td>
                  <td><ChipRol rol={u.rol} />
                    {u.estado === 'suspendida' && <div className="meta" style={{ color: '#dc2626', fontWeight: 700 }}>Suspendida</div>}
                    {u.estado === 'pendiente_verificacion' && <div className="meta" style={{ color: '#b45309', fontWeight: 700 }}>Pendiente verif.</div>}
                    {!u.email_confirmado && <div className="meta" style={{ color: '#b45309', fontWeight: 700 }}>Invitación sin aceptar</div>}
                  </td>
                  <td>{u.nombre || '—'}{u.cargo && <div className="meta">{u.cargo}</div>}</td>
                  <td>{u.documento || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{telBonito(u.telefono) || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{u.ultima_conexion ? creadoTxt(u.ultima_conexion) : 'Sin conexiones'}</td>
                  <td className="amount">{interno(u.rol) || u.rol === 'cliente' ? u.envios : '—'}</td>
                  <td className="amount">{m ? u.cancelados : '—'}</td>
                  <td className="amount" style={m?.alto ? { color: '#dc2626', fontWeight: 800 } : undefined}>{m ? `${m.pct} %` : '—'}</td>
                  <td className="amount" style={m ? { color: m.ult10Color, fontWeight: 800 } : undefined}>{m ? `${m.ult10} de 10` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ficha && <FichaUsuario u={ficha} yo={yo} clientes={clientes} transportistas={transportistas}
        onCerrar={() => setFicha(null)} onCambiarRol={() => { setRolDe(ficha); setFicha(null); }} onHecho={hecho}
        onCambiarEmail={!interno(ficha.rol) || yo.rol === 'admin' ? () => { setEmailDe(ficha); setFicha(null); } : undefined} />}
      {emailDe && <CambiarEmail u={emailDe} onCerrar={() => { setFicha(emailDe); setEmailDe(null); }} onHecho={hecho} />}
      {rolDe && <CambiarRol u={rolDe} yo={yo} clientes={clientes} transportistas={transportistas}
        onCerrar={() => { setFicha(rolDe); setRolDe(null); }} onHecho={hecho} />}
      {invitar && <Invitar yo={yo} clientes={clientes} transportistas={transportistas} onCerrar={() => setInvitar(false)} onHecho={hecho} />}
    </section>
  );
}

// ---- Selector de empresa según el rol ----------------------------------------------
function SelectorEmpresa({ rol, cliente_id, transportista_id, clientes, transportistas, onCambio, id }: {
  rol: Rol; cliente_id: string; transportista_id: string; clientes: Empresa[]; transportistas: Empresa[];
  onCambio: (c: { cliente_id: string; transportista_id: string }) => void; id: string;
}) {
  if (interno(rol)) return (
    <div><label htmlFor={id}>Empresa</label><input id={id} className="sitio-f-lock" readOnly tabIndex={-1} value="Dynamo (personal interno)" /></div>
  );
  const esCli = rol === 'cliente';
  const lista = esCli ? clientes : transportistas;
  return (
    <div>
      <label htmlFor={id}>{esCli ? 'Cliente' : 'Transportista'} <span className="sitio-req">· obligatorio</span></label>
      <select id={id} value={esCli ? cliente_id : transportista_id}
        onChange={(e) => onCambio(esCli ? { cliente_id: e.target.value, transportista_id: '' } : { cliente_id: '', transportista_id: e.target.value })}>
        <option value="">Elige {esCli ? 'el cliente' : 'el transportista'}…</option>
        {lista.map((e) => <option key={e.id} value={e.id}>{e.nombre} · {e.cif}</option>)}
      </select>
    </div>
  );
}
function Telefono({ id, valor, onCambio }: { id: string; valor: { pref: string; num: string }; onCambio: (v: { pref: string; num: string }) => void }) {
  return (
    <div>
      <label htmlFor={id}>Teléfono</label>
      <div className="tel-group">
        <SelectorPais modo="prefijo" valor={valor.pref} onCambio={(v) => onCambio({ ...valor, pref: v })} />
        <input id={id} type="tel" inputMode="tel" value={valor.num} placeholder="600 000 000" onChange={(e) => onCambio({ ...valor, num: e.target.value })} />
      </div>
    </div>
  );
}
const telDe = (t: { pref: string; num: string }) => t.num.trim() ? t.pref + t.num.replace(/\D/g, '') : '';
const IcoUsuario = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);

// ---- Ficha --------------------------------------------------------------------------
function FichaUsuario({ u, yo, clientes, transportistas, onCerrar, onCambiarRol, onCambiarEmail, onHecho }: {
  u: UsuarioFila; yo: { id: string; rol: Rol }; clientes: Empresa[]; transportistas: Empresa[];
  onCerrar: () => void; onCambiarRol: () => void; onCambiarEmail?: () => void; onHecho: (t: string) => void;
}) {
  const [d, setD] = useState<UsuarioDatos>({
    nombre: u.nombre, documento: u.documento, telefono: u.telefono, cargo: u.cargo, idioma: u.idioma || 'es',
    estado: u.estado, cliente_id: u.cliente_id, transportista_id: u.transportista_id,
    limite_consultas_precio_diario: u.limite_consultas_precio_diario, limite_cargas_diario: u.limite_cargas_diario,
    anotaciones: u.anotaciones,
  });
  const [tel, setTel] = useState(partirTel(u.telefono));
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const set = <K extends keyof UsuarioDatos>(k: K, v: UsuarioDatos[K]) => setD((x) => ({ ...x, [k]: v }));
  const m = metricas(u);

  async function guardar() {
    setError(null); setTrabajando('Guardando cambios');
    const r = await guardarUsuario(u.id, u.rol, { ...d, telefono: telDe(tel) });
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    onHecho(`Cambios de ${u.email} guardados.`);
  }
  async function reenviar() {
    setError(null); setTrabajando('Enviando invitación');
    const r = await reenviarInvitacion(u.id);
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    onHecho(`Invitación reenviada a ${u.email}.`);
  }
  const limite = (k: 'limite_consultas_precio_diario' | 'limite_cargas_diario', label: string) => (
    <div>
      <label htmlFor={`usr-${k}`}>{label}</label>
      <input id={`usr-${k}`} type="text" inputMode="numeric" placeholder="Sin límite" value={d[k] ?? ''}
        onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); set(k, v ? Number(v) : null); }} />
    </div>
  );
  const fila = (k: string, v: React.ReactNode) => <div className="pen-sum-row"><span className="k">{k}</span><span className="v">{v}</span></div>;

  return (
    <Modal abierto titulo="Editar usuario" sub={u.email} icono={<IcoUsuario />} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cancelar</button>
        {!u.email_confirmado && <button className="btn-secondary" onClick={reenviar} disabled={!!trabajando}>Reenviar invitación</button>}
        <button className="btn-primary" onClick={guardar} disabled={!!trabajando}>Guardar cambios</button>
      </>}>
      <div style={{ margin: '0 0 0.9rem', padding: '0.55rem 0.85rem', border: '1px solid var(--gray-200)', borderRadius: 9, background: 'var(--gray-50)', fontSize: 'var(--fs-m)', color: 'var(--gray-500)', fontWeight: 600 }}>
        Creado: {creadoTxt(u.creado_en)}{u.modificado_en ? ` · Última modificación: ${creadoTxt(u.modificado_en)}` : ''}
      </div>
      {!u.email_confirmado && (
        <div className="modal-warn-box"><strong>Invitación sin aceptar.</strong> Aún no ha creado su contraseña. Si no le llegó el email (mira en spam), reenvíasela.</div>
      )}
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="usr-email">Email (usuario de acceso)</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input id="usr-email" className="sitio-f-lock" readOnly tabIndex={-1} value={u.email} style={{ flex: 1 }} />
            {onCambiarEmail && <button type="button" className="btn-secondary" style={{ minHeight: 34, padding: '0 0.8rem', whiteSpace: 'nowrap' }} onClick={onCambiarEmail}>Cambiar email…</button>}
          </div>
        </div>
        <div>
          <label>Tipo de usuario</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minHeight: 44 }}>
            <ChipRol rol={u.rol} />
            {u.id !== yo.id
              ? <button type="button" className="btn-secondary" style={{ minHeight: 34, padding: '0 0.8rem' }} onClick={onCambiarRol}>Cambiar rol…</button>
              : <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>Tu propio rol no se puede cambiar</span>}
          </div>
        </div>
        <div>
          <label htmlFor="usr-estado">Estado de la cuenta</label>
          <select id="usr-estado" value={d.estado} onChange={(e) => set('estado', e.target.value as UsuarioDatos['estado'])}>
            {ESTADOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        <SelectorEmpresa id="usr-empresa" rol={u.rol} cliente_id={d.cliente_id} transportista_id={d.transportista_id}
          clientes={clientes} transportistas={transportistas} onCambio={(c) => setD((x) => ({ ...x, ...c }))} />
        <div>
          <label htmlFor="usr-idioma">Idioma (portal y avisos)</label>
          <select id="usr-idioma" value={d.idioma} onChange={(e) => set('idioma', e.target.value)}>
            {IDIOMAS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="usr-nombre">Nombre y apellidos</label>
          <input id="usr-nombre" type="text" value={d.nombre} placeholder="Nombre y apellidos" onChange={(e) => set('nombre', e.target.value)} />
        </div>
        <div>
          <label htmlFor="usr-dni">DNI / NIE</label>
          <input id="usr-dni" type="text" value={d.documento} placeholder="12345678Z" onChange={(e) => set('documento', e.target.value)} />
        </div>
        <Telefono id="usr-tel" valor={tel} onCambio={setTel} />
        <div>
          <label htmlFor="usr-cargo">Cargo</label>
          <input id="usr-cargo" type="text" value={d.cargo} placeholder="Jefe de tráfico, administración…" onChange={(e) => set('cargo', e.target.value)} />
        </div>
        <div />
        {u.rol === 'cliente' && <>{limite('limite_consultas_precio_diario', 'Límite de consultas de precio al día')}{limite('limite_cargas_diario', 'Límite de envíos al día')}</>}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="usr-notas">Notas internas</label>
          <textarea id="usr-notas" rows={2} placeholder="Solo visibles para el equipo Dynamo" value={d.anotaciones} onChange={(e) => set('anotaciones', e.target.value)} />
        </div>
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', fontWeight: 600, margin: '0.6rem 0 0' }}>
        La contraseña no se gestiona aquí: el usuario la crea con el enlace de su invitación, y puede cambiarla con «¿Olvidaste tu contraseña?».
      </p>
      <div style={{ marginTop: '0.9rem' }}>
        <label style={{ fontSize: 'var(--fs-m)', fontWeight: 700, color: 'var(--gray-500)' }}>Uso de la plataforma <span style={{ fontWeight: 600 }}>· solo lectura, lo calcula el sistema</span></label>
        <div className="pen-envio-sum" style={{ marginTop: '0.35rem' }}>
          {fila('Última conexión', u.ultima_conexion ? creadoTxt(u.ultima_conexion) : 'Sin conexiones')}
          {fila('Envíos creados', u.envios)}
          {fila('Cancelaciones de envíos', m ? u.cancelados : '—')}
          {fila('Cancelaciones / envíos creados', m ? <span style={m.alto ? { color: '#dc2626' } : undefined}>{m.pct} %</span> : '—')}
          {fila('Cancelados en los últimos 10 creados', m ? `${m.ult10} de 10` : '—')}
        </div>
      </div>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}

// ---- Cambiar el rol (acción deliberada) ---------------------------------------------
// Cambiar el email de acceso (cuando el cliente o el transportista lo pide): con el email
// actual tecleado como confirmación. Desde ese momento entra con el nuevo.
function CambiarEmail({ u, onCerrar, onHecho }: { u: UsuarioFila; onCerrar: () => void; onHecho: (t: string) => void }) {
  const [nuevo, setNuevo] = useState('');
  const [conf, setConf] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  async function confirmar() {
    setError(null); setTrabajando(true);
    const r = await cambiarEmail(u.id, nuevo, conf);
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    onHecho(`El usuario ${u.email} entra ahora con ${nuevo.trim().toLowerCase()}. Queda en el registro de auditoría.`);
  }
  return (
    <Modal abierto titulo={`Cambiar email — ${u.email}`} sub="El email es el usuario con el que entra en la plataforma" icono={<IcoUsuario />} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={trabajando}>Cancelar</button>
        <button className="btn-primary" onClick={confirmar} disabled={trabajando || !nuevo.trim() || !conf.trim()}>{trabajando ? 'Cambiando…' : 'Cambiar email'}</button>
      </>}>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      <div className="modal-warn-box">Hazlo solo si te lo pide <strong>el propio usuario</strong> o su empresa (por teléfono o desde su email de siempre). Desde ese momento entra con el email nuevo y su contraseña de siempre; los avisos le llegan al nuevo.</div>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="email-nuevo">Email nuevo</label>
          <input id="email-nuevo" type="email" inputMode="email" autoComplete="off" placeholder="nuevo@empresa.com" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="email-conf">Para confirmar, <strong>escribe el email actual</strong></label>
          <input id="email-conf" type="text" inputMode="email" autoComplete="off" placeholder={u.email} value={conf} onChange={(e) => setConf(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function CambiarRol({ u, yo, clientes, transportistas, onCerrar, onHecho }: {
  u: UsuarioFila; yo: { id: string; rol: Rol }; clientes: Empresa[]; transportistas: Empresa[];
  onCerrar: () => void; onHecho: (t: string) => void;
}) {
  const [nuevo, setNuevo] = useState<Rol>(u.rol);
  const [emp, setEmp] = useState({ cliente_id: u.cliente_id, transportista_id: u.transportista_id });
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const igual = nuevo === u.rol;
  // Regla dura (también en la base de datos): una cuenta ya atada a la empresa de un
  // cliente o transportista nunca pasa a interna.
  const prohibido = !!(u.cliente_id || u.transportista_id) && interno(nuevo);
  const sinPermiso = nuevo === 'admin' && yo.rol !== 'admin';
  const rojo = (nuevo === 'admin' || prohibido) && !igual;

  async function confirmar() {
    setError(null);
    if (igual || prohibido || sinPermiso) return;
    if (email.trim().toLowerCase() !== u.email.toLowerCase()) { setError('El email no coincide. Escríbelo exactamente para confirmar el cambio de rol.'); return; }
    setTrabajando(true);
    const r = await cambiarRol(u.id, nuevo, email, emp.cliente_id, emp.transportista_id);
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    onHecho(`${u.email} pasa de ${nombreRol(u.rol)} a ${nombreRol(nuevo)}. Queda en el registro de auditoría.`);
  }

  return (
    <Modal abierto titulo={`Cambiar rol — ${u.email}`} sub={`Rol actual: ${nombreRol(u.rol)}`} icono={<IcoUsuario />} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={trabajando}>Cancelar</button>
        <button className="btn-primary" onClick={confirmar} disabled={trabajando || igual || prohibido || sinPermiso}
          style={rojo && !prohibido ? { background: 'var(--red)' } : undefined}>Cambiar rol</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="rol-nuevo">Nuevo rol</label>
          <select id="rol-nuevo" value={nuevo} onChange={(e) => { setNuevo(e.target.value as Rol); setError(null); }}>
            {ROLES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        {!igual && !prohibido && !interno(nuevo) && (
          <SelectorEmpresa id="rol-empresa" rol={nuevo} cliente_id={emp.cliente_id} transportista_id={emp.transportista_id}
            clientes={clientes} transportistas={transportistas} onCambio={setEmp} />
        )}
      </div>
      <div style={{ margin: '0.8rem 0', padding: '0.7rem 0.8rem', borderRadius: 9, fontSize: 'var(--fs-m)', lineHeight: 1.55,
        background: rojo ? 'rgba(220,38,38,0.10)' : 'var(--gray-50)', border: rojo ? '1px solid rgba(220,38,38,0.45)' : '1px solid var(--gray-200)',
        color: rojo ? '#991b1b' : 'var(--gray-700)' }}>
        {igual ? 'Es el rol que ya tiene: no hay nada que cambiar.'
          : prohibido ? <><strong>No permitido:</strong> un email de <strong>{nombreRol(u.rol)}</strong> nunca puede pasar a <strong>{nombreRol(nuevo)}</strong>. Para hacerlo personal interno hay que borrar el usuario y darlo de alta de nuevo, normalmente con un email de Dynamo.</>
          : sinPermiso ? <><strong>Solo un administrador</strong> puede conceder el rol de administrador.</>
          : <>{nuevo === 'admin' ? <strong>Vas a conceder acceso de administrador. </strong> : <strong>{nombreRol(nuevo)}: </strong>}{ROL_DESC[nuevo]}</>}
      </div>
      {!igual && !prohibido && !sinPermiso && (
        <div className="ptar-sitio-grid">
          <div style={{ gridColumn: '1/-1' }}>
            <label htmlFor="rol-email">Cambiar el rol es delicado: para confirmar, <strong>escribe el email del usuario</strong></label>
            <input id="rol-email" type="text" inputMode="email" autoComplete="off" placeholder={u.email} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
      )}
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto="Cambiando el rol" />}
    </Modal>
  );
}

// ---- Alta (invitación) --------------------------------------------------------------
function Invitar({ yo, clientes, transportistas, onCerrar, onHecho }: {
  yo: { id: string; rol: Rol }; clientes: Empresa[]; transportistas: Empresa[]; onCerrar: () => void; onHecho: (t: string) => void;
}) {
  const [d, setD] = useState({ email: '', nombre: '', rol: 'cliente' as Rol, cliente_id: '', transportista_id: '', cargo: '' });
  const [tel, setTel] = useState({ pref: '+34', num: '' });
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function enviar() {
    setError(null); setTrabajando(true);
    const r = await invitarUsuario({ ...d, telefono: telDe(tel) });
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    onHecho(`Invitación enviada a ${d.email.trim().toLowerCase()}. Le llega un email para crear su contraseña.`);
  }
  return (
    <Modal abierto titulo="Nuevo usuario" sub="Alta de un email de acceso a la plataforma" icono={<IcoUsuario />} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={trabajando}>Cancelar</button>
        <button className="btn-primary" onClick={enviar} disabled={trabajando}>Enviar invitación</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="inv-email">Email (usuario de acceso) <span className="sitio-req">· obligatorio</span></label>
          <input id="inv-email" type="email" inputMode="email" autoComplete="off" value={d.email} placeholder="nombre@empresa.com" onChange={(e) => setD({ ...d, email: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="inv-nombre">Nombre y apellidos <span className="sitio-req">· obligatorio</span></label>
          <input id="inv-nombre" type="text" value={d.nombre} placeholder="Nombre y apellidos" onChange={(e) => setD({ ...d, nombre: e.target.value })} />
        </div>
        <div>
          <label htmlFor="inv-rol">Tipo de usuario</label>
          <select id="inv-rol" value={d.rol} onChange={(e) => setD({ ...d, rol: e.target.value as Rol, cliente_id: '', transportista_id: '' })}>
            {ROLES.filter(([k]) => k !== 'admin' || yo.rol === 'admin').map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        <SelectorEmpresa id="inv-empresa" rol={d.rol} cliente_id={d.cliente_id} transportista_id={d.transportista_id}
          clientes={clientes} transportistas={transportistas} onCambio={(c) => setD({ ...d, ...c })} />
        <Telefono id="inv-tel" valor={tel} onCambio={setTel} />
        <div>
          <label htmlFor="inv-cargo">Cargo</label>
          <input id="inv-cargo" type="text" value={d.cargo} placeholder="Jefe de tráfico, administración…" onChange={(e) => setD({ ...d, cargo: e.target.value })} />
        </div>
      </div>
      <div style={{ marginTop: '0.8rem', padding: '0.7rem 0.8rem', borderRadius: 9, fontSize: 'var(--fs-m)', lineHeight: 1.55, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', color: 'var(--gray-700)' }}>
        <strong>{nombreRol(d.rol)}: </strong>{ROL_DESC[d.rol]}
        <div style={{ marginTop: '0.4rem', color: 'var(--gray-500)' }}>Le llegará un email con un enlace para <strong>crear su contraseña</strong>. Dynamo nunca la ve ni la escribe.</div>
      </div>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto="Enviando invitación" />}
    </Modal>
  );
}
