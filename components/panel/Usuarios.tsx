'use client';

import { fechaHora, numero } from '@/lib/formato';

// Usuarios (solo Dynamo): diseño de #sec-usuarios de dashboard.html. Cada usuario es un
// email de acceso de un admin, empleado, cliente o transportista. El alta es una
// INVITACIÓN (el usuario crea su propia contraseña) y el rol se cambia con una acción
// aparte que pide teclear su email, como en el mockup.
import { useEffect, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import Cargando from '@/components/Cargando';
import Paginador from './Paginador';
import { BuscadorUrl } from './BuscadorUrl';
import Buscador, { type Opcion } from './Buscador';
import { buscarClientes } from '@/app/panel/(app)/sitios/acciones';
import { buscarTransportistas } from '@/app/panel/(app)/envios/acciones';
import { guardarUsuario, cambiarRol, cambiarEmail, invitarUsuario, reenviarInvitacion, anonimizarUsuario, type UsuarioDatos } from '@/app/panel/(app)/usuarios/acciones';
import type { Rol } from '@/lib/sesion';

import { partirTel, telBonito } from '@/lib/paises';
import SelectorPais from '@/components/SelectorPais';
import Req from '@/components/Req';
import { avisaFaltas } from '@/lib/faltas';

export type Empresa = { id: string; nombre: string; cif: string };
export type Conteos = { total: number; activa: number; pendiente: number; suspendida: number; suspendida_auto: number; invitacion: number };
export type ListaUsuarios = { q: string; rol: string; estado: string; pagina: number; porPagina: number; total: number };
export type UsuarioFila = UsuarioDatos & {
  id: string; email: string; rol: Rol; creado_en: string; modificado_en: string | null;
  empresa: string;
  ultima_conexion: string | null; email_confirmado: boolean;
  envios: number; cancelados: number; cancelados_ult10: number;
  consultas: number; min_dia: number; min_semana: number;
  suspension_motivo: string | null; suspendida_en: string | null;
};
// Minutos → «2 h 56 min» / «45 min».
const minTxt = (n: number) => { if (!n) return '—'; const h = Math.floor(n / 60), m = n % 60; return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`; };
const conversion = (u: UsuarioFila) => (u.consultas > 0 ? `${Math.round(u.envios / u.consultas * 100)} %` : '—');

const ROLES: [Rol, string][] = [['admin', 'Admin Master'], ['admin_lectura', 'Admin lectura'], ['empleado', 'Empleado gestor'], ['empleado_lectura', 'Empleado lectura'], ['cliente', 'Cliente'], ['transportista', 'Transportista']];
const ROL_COLOR: Record<Rol, [string, string]> = {
  admin: ['rgba(51,0,204,0.10)', 'var(--purple)'], empleado: ['rgba(15,23,42,0.08)', 'var(--navy)'],
  admin_lectura: ['rgba(51,0,204,0.05)', '#5b3fd6'], empleado_lectura: ['rgba(15,23,42,0.04)', 'var(--gray-700)'],
  cliente: ['rgba(15,107,58,0.10)', '#0f6b3a'], transportista: ['rgba(255,122,0,0.12)', '#b45309'],
};
// Qué puede hacer cada rol: se enseña ANTES de confirmar un cambio (mockup).
const ROL_DESC: Record<Rol, string> = {
  admin: 'Admin Master: acceso TOTAL a la plataforma. Lo ve todo y lo cambia todo: precios de compra y márgenes, clientes y transportistas, penalizaciones, usuarios (incluidos los roles) y parámetros. Solo se nombra desde Supabase.',
  admin_lectura: 'Lo VE TODO, igual que el Admin Master (precios de compra, márgenes, usuarios, parámetros…), pero NO PUEDE CAMBIAR NADA: no crea, no edita y no borra.',
  empleado: 'Empleado gestor: operativa interna del equipo Dynamo. Crea, edita y borra envíos, almacenamientos, incidencias, penalizaciones, clientes, transportistas y sitios. No cambia los parámetros.',
  empleado_lectura: 'Supervisor: ve lo mismo que un Empleado gestor, pero NO PUEDE CAMBIAR NADA: no crea, no edita y no borra.',
  cliente: 'Solo SUS envíos, almacenamientos, facturas, albaranes e incidencias. No ve precios de compra, márgenes ni datos de otros clientes.',
  transportista: 'Solo los envíos que se le asignen y su documentación. No crea envíos ni ve datos de clientes.',
};
const ESTADOS: [UsuarioDatos['estado'], string][] = [['activa', 'Activa'], ['suspendida', 'Suspendida'], ['pendiente_verificacion', 'Pendiente de verificación']];
const IDIOMAS: [string, string][] = [['es', 'Español'], ['pt', 'Portugués'], ['fr', 'Francés'], ['en', 'Inglés'], ['de', 'Alemán'], ['it', 'Italiano'], ['nl', 'Neerlandés'], ['pl', 'Polaco'], ['ro', 'Rumano'], ['uk', 'Ucraniano'], ['zh-CN', 'Chino']];

const nombreRol = (r: Rol) => ROLES.find(([k]) => k === r)?.[1] ?? r;
const interno = (r: Rol) => r === 'admin' || r === 'empleado' || r === 'admin_lectura' || r === 'empleado_lectura';
// Lo que lo ve TODO (también lo de administración): solo lo concede el Admin Master.
const nivelAdmin = (r: Rol) => r === 'admin' || r === 'admin_lectura';
// El Admin Master NO se da desde la web: solo desde Supabase (la base de datos lo impide).
const ROLES_ELEGIBLES = ROLES.filter(([k]) => k !== 'admin');
const confirmado = (t: string) => t.trim().toLowerCase() === 'confirmo';

// Campo «escribe Confirmo» que valida la elección de un tipo de usuario.
function CampoConfirmo({ id, valor, onCambio }: { id: string; valor: string; onCambio: (v: string) => void }) {
  const ok = confirmado(valor);
  return (
    <div style={{ gridColumn: '1/-1' }}>
      <label htmlFor={id}>Para seleccionar este rol, <strong>escribe «Confirmo»</strong></label>
      <input id={id} type="text" autoComplete="off" spellCheck={false} placeholder="Confirmo" value={valor} onChange={(e) => onCambio(e.target.value)}
        style={ok ? { borderColor: 'var(--green)', boxShadow: '0 0 0 3px rgba(34,165,90,0.15)' } : undefined} />
    </div>
  );
}

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

export default function Usuarios({ filas, yo, error, conteos, lista }: {
  filas: UsuarioFila[]; yo: { id: string; rol: Rol }; error: string | null; conteos: Conteos; lista: ListaUsuarios;
}) {
  const refrescar = useRefrescar();
  const [ficha, setFicha] = useState<UsuarioFila | null>(null);
  const [rolDe, setRolDe] = useState<UsuarioFila | null>(null);
  const [emailDe, setEmailDe] = useState<UsuarioFila | null>(null);
  const [anonDe, setAnonDe] = useState<UsuarioFila | null>(null);
  const [invitar, setInvitar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const url = (p: number) => {
    const u = new URLSearchParams();
    if (lista.q) u.set('q', lista.q); if (lista.rol) u.set('rol', lista.rol); if (lista.estado) u.set('estado', lista.estado);
    if (p > 1) u.set('p', String(p)); if (lista.porPagina !== 50) u.set('n', String(lista.porPagina));
    const s = u.toString(); return `/panel/usuarios${s ? `?${s}` : ''}`;
  };

  const hecho = (txt: string) => { setFicha(null); setRolDe(null); setInvitar(false); setAviso(txt); refrescar(); };

  return (
    <section className="section active" id="sec-usuarios">
      <div className="sec-header">
        <h2>Usuarios ({numero(lista.total, 0)})</h2>
        <div className="sec-header-actions">
          <button className="btn-primary" onClick={() => { setAviso(null); setInvitar(true); }}>+ Nuevo usuario</button>
        </div>
      </div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Cada usuario es un email de acceso asociado a un empleado, cliente, transportista o admin, con sus métricas de uso. Pulsa una fila para ver o editar la ficha.
      </p>
      <BuscadorUrl accion="/panel/usuarios" valor={lista.q} placeholder="Buscar por email, nombre, DNI, teléfono, empresa…" campos={<>
        <select name="rol" defaultValue={lista.rol} onChange={(ev) => ev.currentTarget.form?.requestSubmit()} aria-label="Filtrar por tipo de usuario">
          <option value="">Tipo: todos</option>
          {ROLES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <select name="estado" defaultValue={lista.estado} onChange={(ev) => ev.currentTarget.form?.requestSubmit()} aria-label="Filtrar por estado de la cuenta">
          <option value="">Estado: todos</option>
          <option value="activa">Activa ({conteos.activa})</option>
          <option value="pendiente_verificacion">Pendiente de verificación ({conteos.pendiente})</option>
          <option value="suspendida">Suspendida ({conteos.suspendida})</option>
          <option value="suspendida_auto">Suspendida automáticamente ({conteos.suspendida_auto})</option>
          <option value="invitacion">Invitación sin aceptar ({conteos.invitacion})</option>
        </select>
        {lista.porPagina !== 50 && <input type="hidden" name="n" value={lista.porPagina} />}
      </>} />
      {error && <div className="pt-aviso error">No se han podido cargar los usuarios: {error}</div>}
      {aviso && <div className="pt-aviso info">{aviso}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th>Email · usuario</th><th>Tipo</th><th>Estado</th><th>Nombre y apellidos</th><th>DNI</th><th>Teléfono</th>
            <th>Última conexión</th><th>Conexión diaria</th><th>Consultas de precio</th><th>Envíos creados</th><th>Cancelaciones</th><th>Cancel. / envíos</th><th>Cancelados en últ. 10</th>
          </tr></thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={13} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>Sin usuarios que coincidan</td></tr>
            ) : filas.map((u) => {
              const m = metricas(u);
              return (
                <tr key={u.id} onClick={() => { setAviso(null); setFicha(u); }} style={{ cursor: 'pointer' }}>
                  <td><strong>{u.email}</strong>{u.id === yo.id && <> <span className="badge badge-green">Tú</span></>}<div className="meta">{u.empresa}</div></td>
                  <td><ChipRol rol={u.rol} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {u.estado === 'activa' ? <span className="badge badge-green">Activa</span>
                      : u.estado === 'suspendida' ? <span className="badge badge-red" title={u.suspension_motivo ?? undefined}>{u.suspension_motivo?.startsWith('Automática') ? 'Suspendida (auto)' : u.suspension_motivo?.startsWith('Baja a petición') ? 'De baja (la pidió)' : 'Suspendida'}</span>
                      : <span className="badge badge-orange">Pendiente verif.</span>}
                    {u.estado === 'suspendida' && u.suspendida_en && <div className="meta">desde {fechaHora(u.suspendida_en)}</div>}
                    {!u.email_confirmado && <div className="meta" style={{ color: '#b45309', fontWeight: 700 }}>Invitación sin aceptar</div>}
                  </td>
                  <td>{u.nombre || '—'}{u.cargo && <div className="meta">{u.cargo}</div>}</td>
                  <td>{u.documento || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{telBonito(u.telefono) || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{u.ultima_conexion ? fechaHora(u.ultima_conexion) : 'Sin conexiones'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{minTxt(u.min_dia)}</td>
                  <td className="amount">{u.rol === 'cliente' ? u.consultas : '—'}</td>
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
      <Paginador total={lista.total} pagina={lista.pagina} porPagina={lista.porPagina} url={url} nombre="usuarios" nombreUno="usuario" />

      {ficha && <FichaUsuario u={ficha} yo={yo}
        onCerrar={() => setFicha(null)} onCambiarRol={() => { setRolDe(ficha); setFicha(null); }} onHecho={hecho}
        onCambiarEmail={yo.rol === 'admin' ? () => { setEmailDe(ficha); setFicha(null); } : undefined}
        onAnonimizar={yo.rol === 'admin' && ['cliente', 'transportista'].includes(ficha.rol) ? () => { setAnonDe(ficha); setFicha(null); } : undefined} />}
      {anonDe && <Anonimizar u={anonDe} onCerrar={() => { setFicha(anonDe); setAnonDe(null); }} onHecho={hecho} />}
      {emailDe && <CambiarEmail u={emailDe} onCerrar={() => { setFicha(emailDe); setEmailDe(null); }} onHecho={hecho} />}
      {rolDe && <CambiarRol u={rolDe} yo={yo}
        onCerrar={() => { setFicha(rolDe); setRolDe(null); }} onHecho={hecho} />}
      {invitar && <Invitar yo={yo} onCerrar={() => setInvitar(false)} onHecho={hecho} />}
    </section>
  );
}

// ---- Selector de empresa según el rol (buscador servidor, no desplegable de miles) ------
function SelectorEmpresa({ rol, cliente_id, transportista_id, onCambio, id }: {
  rol: Rol; cliente_id: string; transportista_id: string;
  onCambio: (c: { cliente_id: string; transportista_id: string }) => void; id: string;
}) {
  const esCli = rol === 'cliente';
  const actual = esCli ? cliente_id : transportista_id;
  const [sel, setSel] = useState<Opcion | null>(null);
  // Al abrir con una empresa ya asignada, traer su nombre para enseñarla ya elegida.
  useEffect(() => {
    let vivo = true;
    if (interno(rol) || !actual) { setSel(null); return; }
    (esCli ? buscarClientes('', actual) : buscarTransportistas('', actual))
      .then((r) => { const x = r.find((o) => o.id === actual); if (vivo) setSel(x ? { id: x.id, nombre: x.nombre, cif: x.cif } : null); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [rol, actual, esCli]);

  if (interno(rol)) return (
    <div><label htmlFor={id}>Empresa</label><input id={id} className="sitio-f-lock" readOnly tabIndex={-1} value="Dynamo (personal interno)" /></div>
  );
  return (
    <div>
      <label htmlFor={id}>{esCli ? 'Cliente' : 'Transportista'} <Req /></label>
      <Buscador id={id} valor={sel}
        buscar={async (q) => { const r = esCli ? await buscarClientes(q) : await buscarTransportistas(q); return r.map((o) => ({ id: o.id, nombre: o.nombre, cif: o.cif })); }}
        onElegir={(o) => { setSel(o); onCambio(esCli ? { cliente_id: o?.id ?? '', transportista_id: '' } : { cliente_id: '', transportista_id: o?.id ?? '' }); }}
        placeholder={esCli ? 'Busca el cliente por nombre o CIF…' : 'Busca el transportista por nombre o CIF…'}
        vacio={esCli ? 'Ningún cliente coincide.' : 'Ningún transportista coincide.'} />
    </div>
  );
}
function Telefono({ id, valor, onCambio }: { id: string; valor: { pref: string; num: string }; onCambio: (v: { pref: string; num: string }) => void }) {
  return (
    <div>
      <label htmlFor={id}>Teléfono <Req si={false} /></label>
      <div className="tel-group">
        <SelectorPais modo="prefijo" valor={valor.pref} onCambio={(v) => onCambio({ ...valor, pref: v })} />
        <input id={id} type="tel" inputMode="tel" value={valor.num} placeholder="Ej. 600 000 000" onChange={(e) => onCambio({ ...valor, num: e.target.value })} />
      </div>
    </div>
  );
}
const telDe = (t: { pref: string; num: string }) => t.num.trim() ? t.pref + t.num.replace(/\D/g, '') : '';
const IcoUsuario = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);

// ---- Ficha --------------------------------------------------------------------------
function FichaUsuario({ u, yo, onCerrar, onCambiarRol, onCambiarEmail, onAnonimizar, onHecho }: {
  u: UsuarioFila; yo: { id: string; rol: Rol };
  onCerrar: () => void; onCambiarRol: () => void; onCambiarEmail?: () => void; onAnonimizar?: () => void; onHecho: (t: string) => void;
}) {
  const [d, setD] = useState<UsuarioDatos>({
    nombre: u.nombre, documento: u.documento, telefono: u.telefono, cargo: u.cargo, idioma: u.idioma || 'es',
    estado: u.estado, cliente_id: u.cliente_id, transportista_id: u.transportista_id,
    limite_consultas_precio_diario: u.limite_consultas_precio_diario, limite_envios_diario: u.limite_envios_diario,
    anotaciones: u.anotaciones, copias: u.copias, exento_autosuspension: u.exento_autosuspension,
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
  const limite = (k: 'limite_consultas_precio_diario' | 'limite_envios_diario', label: string) => (
    <div>
      <label htmlFor={`usr-${k}`}>{label} <Req si={false} /></label>
      <input id={`usr-${k}`} type="text" inputMode="numeric" placeholder="Sin límite" value={d[k] ?? ''}
        onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); set(k, v ? Number(v) : null); }} />
    </div>
  );
  const fila = (k: string, v: React.ReactNode) => <div className="pen-sum-row"><span className="k">{k}</span><span className="v">{v}</span></div>;

  return (
    <Modal abierto titulo="Editar usuario" sub={u.email} icono={<IcoUsuario />} onCerrar={onCerrar}
      pie={<>
        <a className="btn-ghost" href={`/panel/usuarios/${u.id}/datos`} download title="RGPD: lo que la plataforma guarda de esta persona (JSON)">Exportar datos</a>
        {onAnonimizar && <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={onAnonimizar} disabled={!!trabajando}>Anonimizar…</button>}
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cancelar</button>
        {!u.email_confirmado && <button className="btn-secondary" onClick={reenviar} disabled={!!trabajando}>Reenviar invitación</button>}
        <button className="btn-primary" onClick={guardar} disabled={!!trabajando}>Guardar cambios</button>
      </>}>
      <div style={{ margin: '0 0 0.9rem', padding: '0.55rem 0.85rem', border: '1px solid var(--gray-200)', borderRadius: 9, background: 'var(--gray-50)', fontSize: 'var(--fs-m)', color: 'var(--gray-500)', fontWeight: 600 }}>
        Creado: {fechaHora(u.creado_en)}{u.modificado_en ? ` · Última modificación: ${fechaHora(u.modificado_en)}` : ''}
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
          {u.id === yo.id || u.rol === 'admin' ? (
            // Nadie cambia el estado de su propia cuenta; el de un Admin Master, solo desde Supabase.
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minHeight: 44 }}>
              <span className={`badge ${u.estado === 'activa' ? 'badge-green' : 'badge-orange'}`}>{ESTADOS.find(([k]) => k === u.estado)?.[1] ?? u.estado}</span>
              <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>{u.id === yo.id ? 'Tu propia cuenta no se puede suspender' : 'Admin Master: solo se cambia desde Supabase'}</span>
            </div>
          ) : (
            <select id="usr-estado" value={d.estado} onChange={(e) => set('estado', e.target.value as UsuarioDatos['estado'])}>
              {/* «Pendiente de verificación» solo existe mientras se revisa un alta: no se vuelve a él. */}
              {ESTADOS.filter(([k]) => k !== 'pendiente_verificacion' || u.estado === 'pendiente_verificacion').map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          )}
        </div>
        {u.estado === 'suspendida' && u.suspension_motivo && (
          <div style={{ gridColumn: '1/-1' }} className="modal-warn-box">
            <strong>{u.suspension_motivo.startsWith('Automática') ? 'Suspendida automáticamente' : 'Suspendida'}{u.suspendida_en ? ` el ${fechaHora(u.suspendida_en)}` : ''}.</strong> {u.suspension_motivo.replace(/^Automática · /, '')}
            {' '}Para reactivarla, pon el estado en «Activa» y guarda: el contador de las reglas vuelve a empezar desde hoy.
          </div>
        )}
        <SelectorEmpresa id="usr-empresa" rol={u.rol} cliente_id={d.cliente_id} transportista_id={d.transportista_id}
          onCambio={(c) => setD((x) => ({ ...x, ...c }))} />
        <div>
          <label htmlFor="usr-idioma">Idioma (portal y avisos)</label>
          <select id="usr-idioma" value={d.idioma} onChange={(e) => set('idioma', e.target.value)}>
            {IDIOMAS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="usr-nombre">Nombre y apellidos <Req si={false} /></label>
          <input id="usr-nombre" type="text" value={d.nombre} placeholder="Nombre y apellidos" onChange={(e) => set('nombre', e.target.value)} />
        </div>
        <div>
          <label htmlFor="usr-dni">DNI / NIE <Req si={false} /></label>
          <input id="usr-dni" type="text" value={d.documento} placeholder="Ej. 12345678Z" onChange={(e) => set('documento', e.target.value)} />
        </div>
        <Telefono id="usr-tel" valor={tel} onCambio={setTel} />
        <div>
          <label htmlFor="usr-cargo">Cargo <Req si={false} /></label>
          <input id="usr-cargo" type="text" value={d.cargo} placeholder="Ej. jefe de tráfico, administración…" onChange={(e) => set('cargo', e.target.value)} />
        </div>
        <div />
        {u.rol === 'cliente' && <>{limite('limite_consultas_precio_diario', 'Límite de consultas de precio al día')}{limite('limite_envios_diario', 'Límite de envíos al día')}</>}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="usr-copias">Enviar copia a <Req si={false} /> (si hay varios, sepáralos por comas; máx. 10)</label>
          <input id="usr-copias" type="text" inputMode="email" value={d.copias} placeholder="Ej. logistica@empresa.com, almacen@empresa.com" onChange={(e) => set('copias', e.target.value)} />
        </div>
        {!interno(u.rol) && (
          <div style={{ gridColumn: '1/-1' }}>
            <label>No suspender nunca automáticamente</label>
            <label className="ptar-tramp-box" style={{ display: 'inline-flex' }}>
              <input type="checkbox" className="ptar-switch-input" checked={d.exento_autosuspension} onChange={(e) => set('exento_autosuspension', e.target.checked)} />
              <span className="ptar-switch" aria-hidden="true" />
              <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">No</span><span className="tramp-on">Sí</span></span>
            </label>
            <div className="meta" style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Las reglas de suspensión automática (Parámetros) no se le aplican. Para clientes especiales.</div>
          </div>
        )}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="usr-notas">Notas internas <Req si={false} /></label>
          <textarea id="usr-notas" rows={2} placeholder="Solo visibles para el equipo Dynamo" value={d.anotaciones} onChange={(e) => set('anotaciones', e.target.value)} />
        </div>
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', fontWeight: 600, margin: '0.6rem 0 0' }}>
        La contraseña no se gestiona aquí: el usuario la crea con el enlace de su invitación, y puede cambiarla con «¿Olvidaste tu contraseña?».
      </p>
      <div style={{ marginTop: '0.9rem' }}>
        <label style={{ fontSize: 'var(--fs-m)', fontWeight: 700, color: 'var(--gray-500)' }}>Uso de la plataforma <span style={{ fontWeight: 600 }}>· solo lectura, lo calcula el sistema</span></label>
        <div className="pen-envio-sum" style={{ marginTop: '0.35rem' }}>
          {fila('Última conexión', u.ultima_conexion ? fechaHora(u.ultima_conexion) : 'Sin conexiones')}
          {fila('Conexión diaria (media, últimos 30 días)', minTxt(u.min_dia))}
          {fila('Conexión semanal (media, últimas 4 semanas)', minTxt(u.min_semana))}
          {u.rol === 'cliente' && fila('Consultas de precio', u.consultas)}
          {fila('Envíos creados', u.envios)}
          {u.rol === 'cliente' && fila('Envíos / consultas (conversión)', conversion(u))}
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
          <label htmlFor="email-nuevo">Email nuevo <Req /></label>
          <input id="email-nuevo" type="email" inputMode="email" autoComplete="off" placeholder="Ej. nuevo@empresa.com" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="email-conf">Para confirmar, <strong>escribe el email actual</strong></label>
          <input id="email-conf" type="text" inputMode="email" autoComplete="off" placeholder={u.email} value={conf} onChange={(e) => setConf(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function CambiarRol({ u, yo, onCerrar, onHecho }: {
  u: UsuarioFila; yo: { id: string; rol: Rol };
  onCerrar: () => void; onHecho: (t: string) => void;
}) {
  const [nuevo, setNuevo] = useState<Rol>(u.rol);
  const [emp, setEmp] = useState({ cliente_id: u.cliente_id, transportista_id: u.transportista_id });
  const [conf, setConf] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const igual = nuevo === u.rol;
  // Regla dura (también en la base de datos): una cuenta ya atada a la empresa de un
  // cliente o transportista nunca pasa a interna.
  const prohibido = !!(u.cliente_id || u.transportista_id) && interno(nuevo);
  const sinPermiso = nuevo === 'admin' || (nuevo === 'admin_lectura' && yo.rol !== 'admin');
  const rojo = (nivelAdmin(nuevo) || prohibido) && !igual;

  async function confirmar() {
    setError(null);
    if (igual || prohibido || sinPermiso) return;
    if (!confirmado(conf)) { setError('Escribe «Confirmo» para cambiar el rol.'); return; }
    setTrabajando(true);
    const r = await cambiarRol(u.id, nuevo, conf, emp.cliente_id, emp.transportista_id);
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    onHecho(`${u.email} pasa de ${nombreRol(u.rol)} a ${nombreRol(nuevo)}. Queda en el registro de auditoría.`);
  }

  return (
    <Modal abierto titulo={`Cambiar rol — ${u.email}`} sub={`Rol actual: ${nombreRol(u.rol)}`} icono={<IcoUsuario />} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={trabajando}>Cancelar</button>
        <button className="btn-primary" onClick={confirmar} disabled={trabajando || igual || prohibido || sinPermiso || !confirmado(conf)}
          style={rojo && !prohibido ? { background: 'var(--red)' } : undefined}>Cambiar rol</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="rol-nuevo">Nuevo rol</label>
          <select id="rol-nuevo" value={nuevo} onChange={(e) => { setNuevo(e.target.value as Rol); setError(null); }}>
            {u.rol === 'admin' && <option value="admin" disabled>Admin Master (solo desde Supabase)</option>}
            {ROLES_ELEGIBLES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        {!igual && !prohibido && !interno(nuevo) && (
          <SelectorEmpresa id="rol-empresa" rol={nuevo} cliente_id={emp.cliente_id} transportista_id={emp.transportista_id}
            onCambio={setEmp} />
        )}
      </div>
      <div style={{ margin: '0.8rem 0', padding: '0.7rem 0.8rem', borderRadius: 9, fontSize: 'var(--fs-m)', lineHeight: 1.55,
        background: rojo ? 'rgba(220,38,38,0.10)' : 'var(--gray-50)', border: rojo ? '1px solid rgba(220,38,38,0.45)' : '1px solid var(--gray-200)',
        color: rojo ? '#991b1b' : 'var(--gray-700)' }}>
        {igual ? 'Es el rol que ya tiene: no hay nada que cambiar.'
          : prohibido ? <><strong>No permitido:</strong> un email de <strong>{nombreRol(u.rol)}</strong> nunca puede pasar a <strong>{nombreRol(nuevo)}</strong>. Para hacerlo personal interno hay que borrar el usuario y darlo de alta de nuevo, normalmente con un email de Dynamo.</>
          : sinPermiso ? (nuevo === 'admin' ? <><strong>El Admin Master solo se nombra desde Supabase</strong> (Table Editor → usuarios), nunca desde la web.</> : <><strong>Solo el Admin Master</strong> puede conceder el rol <strong>{nombreRol(nuevo)}</strong>.</>)
          : <>{nuevo === 'admin_lectura' ? <strong>Vas a dar acceso a TODO (solo para mirar). </strong> : <strong>{nombreRol(nuevo)}: </strong>}{ROL_DESC[nuevo]}</>}
      </div>
      {!igual && !prohibido && !sinPermiso && (
        <div className="ptar-sitio-grid">
          <CampoConfirmo id="rol-confirmo" valor={conf} onCambio={(v) => { setConf(v); setError(null); }} />
        </div>
      )}
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto="Cambiando el rol" />}
    </Modal>
  );
}

// ---- Alta (invitación) --------------------------------------------------------------
function Invitar({ yo, onCerrar, onHecho }: {
  yo: { id: string; rol: Rol }; onCerrar: () => void; onHecho: (t: string) => void;
}) {
  const [d, setD] = useState({ email: '', nombre: '', rol: 'cliente' as Rol, cliente_id: '', transportista_id: '', cargo: '' });
  const [conf, setConf] = useState('');
  const [tel, setTel] = useState({ pref: '+34', num: '' });
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function enviar() {
    setError(null);
    // Faltas de obligatorios: aviso + desplazar + borde rojo (criterio único, 2026-11-09).
    const faltas = [
      !d.email.trim() && 'inv-email', !d.nombre.trim() && 'inv-nombre',
      d.rol === 'cliente' && !d.cliente_id && 'inv-empresa',
      d.rol === 'transportista' && !d.transportista_id && 'inv-empresa',
    ].filter(Boolean) as string[];
    if (faltas.length) { setError('Faltan campos obligatorios (en rojo).'); avisaFaltas(faltas); return; }
    if (!confirmado(conf)) { setError('Escribe «Confirmo» para dar de alta este tipo de usuario.'); return; }
    setTrabajando(true);
    const r = await invitarUsuario({ ...d, telefono: telDe(tel), confirmacion: conf });
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    onHecho(`Invitación enviada a ${d.email.trim().toLowerCase()}. Le llega un email para crear su contraseña.`);
  }
  return (
    <Modal abierto titulo="Nuevo usuario" sub="Alta de un email de acceso a la plataforma" icono={<IcoUsuario />} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={trabajando}>Cancelar</button>
        <button className="btn-primary" onClick={enviar} disabled={trabajando || !confirmado(conf)}>Enviar invitación</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="inv-email">Email (usuario de acceso) <Req /></label>
          <input id="inv-email" type="email" inputMode="email" autoComplete="off" value={d.email} placeholder="Ej. nombre@empresa.com" onChange={(e) => setD({ ...d, email: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="inv-nombre">Nombre y apellidos <Req /></label>
          <input id="inv-nombre" type="text" value={d.nombre} placeholder="Nombre y apellidos" onChange={(e) => setD({ ...d, nombre: e.target.value })} />
        </div>
        <div>
          <label htmlFor="inv-rol">Tipo de usuario</label>
          <select id="inv-rol" value={d.rol} onChange={(e) => { setD({ ...d, rol: e.target.value as Rol, cliente_id: '', transportista_id: '' }); setConf(''); }}>
            {ROLES_ELEGIBLES.filter(([k]) => !nivelAdmin(k) || yo.rol === 'admin').map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        <SelectorEmpresa id="inv-empresa" rol={d.rol} cliente_id={d.cliente_id} transportista_id={d.transportista_id}
          onCambio={(c) => setD({ ...d, ...c })} />
        <Telefono id="inv-tel" valor={tel} onCambio={setTel} />
        <div>
          <label htmlFor="inv-cargo">Cargo <Req si={false} /></label>
          <input id="inv-cargo" type="text" value={d.cargo} placeholder="Ej. jefe de tráfico, administración…" onChange={(e) => setD({ ...d, cargo: e.target.value })} />
        </div>
        <CampoConfirmo id="inv-confirmo" valor={conf} onCambio={(v) => { setConf(v); setError(null); }} />
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

// RGPD — derecho de supresión: borrar los datos personales de un cliente o transportista
// cuando lo pide. Solo el Admin Master, tecleando su email. No se puede deshacer.
function Anonimizar({ u, onCerrar, onHecho }: { u: UsuarioFila; onCerrar: () => void; onHecho: (t: string) => void }) {
  const [conf, setConf] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  async function confirmar() {
    setError(null); setTrabajando(true);
    const r = await anonimizarUsuario(u.id, conf);
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    onHecho(`${u.email}: ${r.aviso ?? 'datos borrados.'}`);
  }
  return (
    <Modal abierto titulo={`Anonimizar — ${u.email}`} sub="Derecho de supresión (RGPD)" icono={<IcoUsuario />} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={trabajando}>Cancelar</button>
        <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={confirmar} disabled={trabajando || !conf.trim()}>{trabajando ? 'Anonimizando…' : 'Anonimizar para siempre'}</button>
      </>}>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      <div className="modal-warn-box">
        Hazlo solo cuando <strong>la propia persona lo pida</strong> (por escrito). <strong>No se puede deshacer.</strong>
        <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
          <li>Se borran su nombre, teléfono, DNI, cargo y email; sus fichas de contacto; y las notas internas sobre ella.</li>
          <li>La cuenta queda suspendida y, con la clave de servicio, ya no puede entrar.</li>
          <li>Se conserva lo que es prueba legal (firmas del CMR, envíos) hasta que pase el plazo.</li>
          <li>La auditoría apunta que se anonimizó, sin guardar los datos borrados.</li>
        </ul>
        Antes, si te lo pide, descárgale sus datos con «Exportar datos».
      </div>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="anon-conf">Para confirmar, <strong>escribe su email</strong></label>
          <input id="anon-conf" type="text" inputMode="email" autoComplete="off" placeholder={u.email} value={conf} onChange={(e) => setConf(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
