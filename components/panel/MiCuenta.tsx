'use client';

// Mi cuenta, con el diseño de #sec-mi-cuenta de dashboard.html (tarjetas .account-card):
// datos personales (editables), seguridad y datos fiscales de la empresa (solo lectura).
import { useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import Documentos from './Documentos';
import Cargando from '@/components/Cargando';
import { cambiarMiClave, guardarMisDatos, guardarMiTransporte, guardarMiVehiculo, guardarMiConductor, darDeBajaFlota, darmeDeBaja, anadirCompanero, type MisDatos, type MiVehiculo, type MiConductor } from '@/app/panel/(app)/mi-cuenta/acciones';
import { DOC_PAISES } from '@/lib/documentoIdentidad';

import { paisDe, telBonito } from '@/lib/paises';
import { ROL, fecha, fechaHora } from '@/lib/formato';
import CampoTelefono from '@/components/CampoTelefono';
import Req from '@/components/Req';
import { avisaFaltas } from '@/lib/faltas';
import MedidorClave, { claveValida } from '@/components/MedidorClave';
import { CONTACTO } from '@/lib/atencion';

// Los mismos idiomas que el selector de la web (y que usarán los avisos automáticos).
const IDIOMAS: [string, string][] = [
  ['es', 'Español'], ['ca', 'Català'], ['eu', 'Euskara'], ['pt', 'Português'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'],
  ['it', 'Italiano'], ['nl', 'Nederlands'], ['pl', 'Polski'], ['ro', 'Română'], ['uk', 'Українська'], ['zh-CN', '中文'], ['ar', 'العربية'],
];

// Lo del TRANSPORTISTA: su empresa de transporte (NIMA, seguro, bolsa), su flota y su documentación.
export type TransporteDatos = {
  id: string; nima: string | null; bolsa: string | null; codigo_bolsa: string | null; plazo_pago_dias: number | null;
  seguro_cmr_compania: string | null; seguro_cmr_poliza: string | null; seguro_cmr_vence: string | null;
  vehiculos: { id: string; matricula: string; tipo: string; itv_vence: string | null; seguro_vence: string | null; tarjeta_transporte_vence: string | null; adr: boolean; tiene_plataforma_elevadora: boolean }[];
  conductores: { id: string; nombre: string; telefono: string | null; documento: string | null; documento_pais: string | null }[];
};
const TIPO_VEH: Record<string, string> = { tractora: 'Tractora', remolque: 'Remolque', rigido: 'Rígido' };
// Fecha de caducidad: en rojo si ya pasó, en ámbar si vence en menos de 30 días.
function Vence({ f }: { f: string | null }) {
  if (!f) return <span style={{ color: 'var(--gray-500)' }}>—</span>;
  const dias = Math.floor((new Date(`${f}T00:00:00`).getTime() - Date.now()) / 86400000);
  const color = dias < 0 ? 'var(--red)' : dias < 30 ? '#b45309' : undefined;
  return <span style={{ color, fontWeight: color ? 700 : undefined }}>{fecha(f)}{dias < 0 ? ' · caducado' : dias < 30 ? ' · vence pronto' : ''}</span>;
}

export default function MiCuenta({ datos, email, rol, ultimaConexion, empresa, transporte = null }: {
  datos: MisDatos; email: string; rol: string; ultimaConexion: string | null;
  empresa: { razon_social: string; cif: string | null; direccion: string; pais: string | null } | null;
  transporte?: TransporteDatos | null;
}) {
  const refrescar = useRefrescar();
  const [editar, setEditar] = useState(false);
  const [editaTransp, setEditaTransp] = useState(false);
  const [cambiaClave, setCambiaClave] = useState(false);
  const [claveCambiada, setClaveCambiada] = useState(false);
  const [baja, setBaja] = useState(false);
  const [companero, setCompanero] = useState(false);
  const [companeroOk, setCompaneroOk] = useState(false);
  const [vehiculo, setVehiculo] = useState<MiVehiculo | null>(null);
  const [conductor, setConductor] = useState<MiConductor | null>(null);
  const hecho = () => { setEditaTransp(false); setVehiculo(null); setConductor(null); refrescar(); };
  const fila = (k: string, v: React.ReactNode) => <div className="account-row"><span className="account-row-label">{k}</span><span className="account-row-value">{v || '—'}</span></div>;
  return (
    <section className="section active" id="sec-mi-cuenta">
      <div className="sec-header"><h2>Mi cuenta</h2></div>
      <div className="account-grid">
        <div className="account-card">
          <h3 className="account-card-title">Datos personales</h3>
          {fila('Nombre y apellidos', datos.nombre)}
          {fila('Email', email)}
          {fila('Teléfono', datos.telefono ? telBonito(datos.telefono) : '')}
          {fila('DNI / NIE', datos.documento)}
          {fila('Cargo', datos.cargo)}
          {fila('Idioma de los avisos', IDIOMAS.find(([k]) => k === datos.idioma)?.[1] ?? datos.idioma)}
          <div className="account-row"><span className="account-row-label">Rol</span><span className="user-menu-role">{ROL[rol] ?? rol}</span></div>
          <button className="btn-ghost account-edit" onClick={() => setEditar(true)}>Editar datos</button>
        </div>
        <div className="account-card">
          <h3 className="account-card-title">Seguridad</h3>
          {fila('Contraseña', '••••••••')}
          {fila('Última conexión', ultimaConexion ? fechaHora(ultimaConexion) : '')}
          <button className="btn-ghost account-edit" onClick={() => { setClaveCambiada(false); setCambiaClave(true); }}>Cambiar contraseña</button>
          {claveCambiada && <p className="account-card-desc" style={{ marginTop: '0.6rem', color: '#0f6b3a', fontWeight: 700 }}>✓ Contraseña cambiada.</p>}
          <p className="account-card-desc" style={{ marginTop: '0.8rem' }}>Para cambiar el <strong>email</strong> con el que entras, escríbenos a {CONTACTO.email}: es tu usuario y lo cambiamos nosotros.</p>
          {(rol === 'cliente' || rol === 'transportista') && (
            <button type="button" className="btn-ghost" style={{ marginTop: '0.8rem', color: 'var(--red)', borderColor: 'transparent', padding: '0.35rem 0' }} onClick={() => setBaja(true)}>Darme de baja</button>
          )}
        </div>
        {(rol === 'cliente' || rol === 'transportista') && (
          <div className="account-card">
            <h3 className="account-card-title">Tu equipo</h3>
            <p className="account-card-desc">¿Un compañero de tu empresa necesita acceso? Añádelo con su email y queda <strong>autorizado al instante</strong>, con tu mismo rol. Le llega un email para crear su contraseña.</p>
            <button className="btn-ghost account-edit" onClick={() => { setCompaneroOk(false); setCompanero(true); }}>+ Añadir un compañero</button>
            {companeroOk && <p className="account-card-desc" style={{ marginTop: '0.6rem', color: '#0f6b3a', fontWeight: 700 }}>✓ Invitación enviada: ya puede crear su contraseña desde su email.</p>}
          </div>
        )}
        {empresa && (
          <div className="account-card">
            <h3 className="account-card-title">Datos fiscales</h3>
            {fila('Razón social', empresa.razon_social)}
            {fila('CIF', empresa.cif)}
            {fila('Dirección fiscal', empresa.direccion)}
            {fila('País', empresa.pais ? paisDe(empresa.pais) : '')}
            <p className="account-card-desc" style={{ marginTop: '0.8rem' }}>Para modificar los datos fiscales, llámanos o escríbenos y lo actualizamos.</p>
          </div>
        )}
        {transporte && (<>
          <div className="account-card">
            <h3 className="account-card-title">Empresa de transporte</h3>
            {fila('NIMA', transporte.nima)}
            {fila('Seguro CMR', [transporte.seguro_cmr_compania, transporte.seguro_cmr_poliza && `póliza ${transporte.seguro_cmr_poliza}`].filter(Boolean).join(' · '))}
            <div className="account-row"><span className="account-row-label">Seguro CMR vence</span><span className="account-row-value"><Vence f={transporte.seguro_cmr_vence} /></span></div>
            {fila('Bolsa de carga', [transporte.bolsa, transporte.codigo_bolsa].filter(Boolean).join(' · '))}
            {fila('Plazo de pago', transporte.plazo_pago_dias != null ? `${transporte.plazo_pago_dias} días` : '')}
            <button className="btn-ghost account-edit" onClick={() => setEditaTransp(true)}>Editar NIMA y seguro</button>
            <p className="account-card-desc" style={{ marginTop: '0.8rem' }}>La razón social, el CIF, la dirección fiscal y la bolsa de carga los cambiamos nosotros: escríbenos si algo ha cambiado. Sube el seguro renovado en <strong>Documentación</strong>.</p>
          </div>
          <div className="account-card">
            <h3 className="account-card-title">Mi flota</h3>
            {transporte.vehiculos.length === 0 && transporte.conductores.length === 0 && <p className="account-card-desc">Aún no hay camiones ni conductores. Se añaden solos al darnos la matrícula y el conductor de cada envío.</p>}
            {transporte.vehiculos.map((v) => (
              <button type="button" key={v.id} className="account-row account-row-btn" title="Editar este vehículo"
                onClick={() => setVehiculo({ id: v.id, matricula: v.matricula, tipo: v.tipo as MiVehiculo['tipo'], itv: v.itv_vence ?? '', seguro: v.seguro_vence ?? '', tarjeta: v.tarjeta_transporte_vence ?? '', adr: v.adr, tiene_plataforma_elevadora: v.tiene_plataforma_elevadora })}>
                <span className="account-row-label">{TIPO_VEH[v.tipo] ?? v.tipo}{v.tiene_plataforma_elevadora ? ' · plataforma elevadora' : ''}{v.adr ? ' · ADR' : ''}</span>
                <span className="account-row-value"><strong>{v.matricula}</strong>{v.itv_vence && <><br /><span style={{ fontSize: 'var(--fs-s)' }}>ITV: <Vence f={v.itv_vence} /></span></>}</span>
              </button>
            ))}
            {transporte.conductores.map((c) => (
              <button type="button" key={c.id} className="account-row account-row-btn" title="Editar este conductor"
                onClick={() => setConductor({ id: c.id, nombre: c.nombre, documento: c.documento ?? '', pais: c.documento_pais ?? 'ES', telefono: c.telefono ?? '' })}>
                <span className="account-row-label">Conductor</span><span className="account-row-value">{c.nombre}{c.telefono ? ` · ${telBonito(c.telefono)}` : ''}</span>
              </button>
            ))}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
              <button className="btn-ghost" onClick={() => setVehiculo({ id: null, matricula: '', tipo: 'tractora', itv: '', seguro: '', tarjeta: '', adr: false, tiene_plataforma_elevadora: false })}>+ Añadir vehículo</button>
              <button className="btn-ghost" onClick={() => setConductor({ id: null, nombre: '', documento: '', pais: 'ES', telefono: '' })}>+ Añadir conductor</button>
            </div>
            <p className="account-card-desc" style={{ marginTop: '0.8rem' }}>También se completa sola con los camiones y conductores de tus envíos. Pulsa uno para cambiar sus datos o darlo de baja.</p>
          </div>
          <div className="account-card">
            <h3 className="account-card-title">Documentación</h3>
            <Documentos dueno={{ campo: 'transportista_id', id: transporte.id }} max={5} tipos={['hoja_cif', 'seguro_cmr', 'tarjeta_transporte', 'dni', 'otro']} sinQuitar
              ayuda={<>Hoja del CIF, seguro CMR en vigor, tarjeta de transporte… (máx. 5). Para retirar uno, escríbenos.</>} />
          </div>
        </>)}
      </div>
      {cambiaClave && <CambiarClave onCerrar={() => setCambiaClave(false)} onHecho={() => { setCambiaClave(false); setClaveCambiada(true); }} />}
      {companero && <AnadirCompanero empresa={empresa?.razon_social ?? 'tu empresa'} onCerrar={() => setCompanero(false)} onHecho={() => { setCompanero(false); setCompaneroOk(true); }} />}
      {baja && <DarmeDeBaja onCerrar={() => setBaja(false)} transportista={rol === 'transportista'} />}
      {editar && <EditarDatos datos={datos} onCerrar={() => setEditar(false)} onHecho={() => { setEditar(false); refrescar(); }} />}
      {editaTransp && transporte && <EditarTransporte inicial={{ nima: transporte.nima ?? '', compania: transporte.seguro_cmr_compania ?? '', poliza: transporte.seguro_cmr_poliza ?? '', vence: transporte.seguro_cmr_vence ?? '' }}
        onCerrar={() => setEditaTransp(false)} onHecho={hecho} />}
      {vehiculo && <EditarVehiculo inicial={vehiculo} onCerrar={() => setVehiculo(null)} onHecho={hecho} />}
      {conductor && <EditarConductor inicial={conductor} onCerrar={() => setConductor(null)} onHecho={hecho} />}
    </section>
  );
}

function EditarDatos({ datos, onCerrar, onHecho }: { datos: MisDatos; onCerrar: () => void; onHecho: () => void }) {
  const [d, setD] = useState<MisDatos>(datos);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof MisDatos, v: string) => setD((x) => ({ ...x, [k]: v }));
  async function guardar() {
    setError(null);
    if (!d.nombre.trim()) { setError('Pon tu nombre y apellidos.'); avisaFaltas(['mc-nombre']); return; }
    setGuardando(true);
    const r = await guardarMisDatos(d);
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    onHecho();
  }
  const campo = (k: keyof MisDatos, label: string, ph: string, tipo = 'text') => (
    <div>
      <label htmlFor={`mc-${k}`}>{label} <Req si={false} /></label>
      <input id={`mc-${k}`} type={tipo} value={d[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  return (
    <Modal abierto titulo="Editar mis datos" sub="Datos personales de tu cuenta" onCerrar={onCerrar}
      icono={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="mc-nombre">Nombre y apellidos <Req /></label>
          <input id="mc-nombre" type="text" value={d.nombre} placeholder="Nombre y apellidos" onChange={(e) => set('nombre', e.target.value)} />
        </div>
        <div><label htmlFor="mc-telefono">Teléfono <Req si={false} /></label><CampoTelefono id="mc-telefono" valor={d.telefono} onCambio={(v) => set('telefono', v)} /></div>
        {campo('documento', 'DNI / NIE', '12345678Z')}
        {campo('cargo', 'Cargo', 'Ej. Responsable de tráfico')}
        <div>
          <label htmlFor="mc-idioma">Idioma de los avisos</label>
          <select id="mc-idioma" className="ptar-select" value={d.idioma} onChange={(e) => set('idioma', e.target.value)}>
            {IDIOMAS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>Los avisos por email y WhatsApp te llegarán en este idioma.</p>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.4rem 0 0' }}>
        Protección de datos: <a href="/panel/mi-cuenta/mis-datos" download style={{ color: 'var(--purple)', fontWeight: 700 }}>descarga lo que guardamos de ti</a>.
        Para borrarlos o cualquier otra petición, escríbenos a {CONTACTO.email}.
      </p>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {guardando && <Cargando texto="Guardando tus datos" />}
    </Modal>
  );
}

// ---- Añadir un compañero (cliente o transportista activos) ------------------------------
// Entra en TU misma empresa y con tu mismo rol, activo al instante, sin pasar por Altas
// (usuario, 2026-11-11). Le llega un email para crear su contraseña.
function AnadirCompanero({ empresa, onCerrar, onHecho }: { empresa: string; onCerrar: () => void; onHecho: () => void }) {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const g = useGuardar(onHecho);
  const vale = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) && nombre.trim().length >= 3;
  return (
    <Modal abierto titulo="Añadir un compañero" sub={`Acceso a ${empresa}, autorizado al instante`} icono={ICO_PERSONA} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!g.trabajando}>Cancelar</button>
        <button className="btn-primary" onClick={() => g.correr('Enviando la invitación', () => anadirCompanero({ email: email.trim(), nombre: nombre.trim() }))} disabled={!!g.trabajando || !vale}>Añadir y autorizar</button>
      </>}>
      <div className="ptar-sitio-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div><label htmlFor="comp-email">Su correo electrónico <Req /></label>
          <input id="comp-email" type="email" inputMode="email" placeholder="Ej. nombre@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label htmlFor="comp-nombre">Su nombre y apellidos <Req /></label>
          <input id="comp-nombre" placeholder="La persona que usará la cuenta" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.6rem 0 0', lineHeight: 1.5 }}>
        Entrará en tu misma empresa y con tu mismo rol, y le llegará un email para crear su contraseña. Al añadirlo respondes de que es un compañero de tu empresa.</p>
      {g.error && <div className="wiz-warn show" role="alert">⚠ {g.error}</div>}
      {g.trabajando && <Cargando texto={g.trabajando} />}
    </Modal>
  );
}

// ---- Ventanas del transportista ---------------------------------------------------------
const ICO_CAMION = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>;
const ICO_PERSONA = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;

// Hook común: guardar con aviso de error y la ventana de «Guardando».
function useGuardar(onHecho: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  async function correr(texto: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null); setTrabajando(texto);
    const r = await fn();
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    onHecho();
  }
  return { error, trabajando, correr };
}
const fechaCampo = (id: string, label: string, valor: string, onCambio: (v: string) => void) => (
  <div><label htmlFor={id}>{label} <Req si={false} /></label><input id={id} type="date" value={valor} onChange={(e) => onCambio(e.target.value)} /></div>
);

function EditarTransporte({ inicial, onCerrar, onHecho }: { inicial: { nima: string; compania: string; poliza: string; vence: string }; onCerrar: () => void; onHecho: () => void }) {
  const [d, setD] = useState(inicial);
  const g = useGuardar(onHecho);
  return (
    <Modal abierto titulo="Empresa de transporte" sub="NIMA y seguro CMR" icono={ICO_CAMION} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!g.trabajando}>Cancelar</button>
        <button className="btn-primary" onClick={() => g.correr('Guardando', () => guardarMiTransporte(d))} disabled={!!g.trabajando}>Guardar cambios</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div><label htmlFor="mt-nima">NIMA <Req si={false} /></label><input id="mt-nima" type="text" value={d.nima} maxLength={40} placeholder="Solo si transportas residuos" onChange={(e) => setD({ ...d, nima: e.target.value })} /></div>
        <div><label htmlFor="mt-comp">Compañía del seguro CMR <Req si={false} /></label><input id="mt-comp" type="text" value={d.compania} maxLength={120} placeholder="Ej. Mapfre" onChange={(e) => setD({ ...d, compania: e.target.value })} /></div>
        <div><label htmlFor="mt-pol">Nº de póliza <Req si={false} /></label><input id="mt-pol" type="text" value={d.poliza} maxLength={60} onChange={(e) => setD({ ...d, poliza: e.target.value })} /></div>
        {fechaCampo('mt-vence', 'Vence el', d.vence, (v) => setD({ ...d, vence: v }))}
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>Recuerda subir la póliza renovada en Documentación.</p>
      {g.error && <div className="wiz-warn show" role="alert">⚠ {g.error}</div>}
      {g.trabajando && <Cargando texto={g.trabajando} />}
    </Modal>
  );
}

const ICO_CANDADO = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;

// Ventana «Cambiar contraseña»: la actual (por seguridad) y la nueva con su medidor.
function CambiarClave({ onCerrar, onHecho }: { onCerrar: () => void; onHecho: () => void }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [ver, setVer] = useState(false);
  const g = useGuardar(onHecho);
  const vale = !!actual && claveValida(nueva);
  const tipo = ver ? 'text' : 'password';
  return (
    <Modal abierto titulo="Cambiar contraseña" sub="Escribe la actual y elige una nueva" icono={ICO_CANDADO} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!g.trabajando}>Cancelar</button>
        <button className="btn-primary" onClick={() => g.correr('Cambiando la contraseña', () => cambiarMiClave(actual, nueva))} disabled={!!g.trabajando || !vale}>Guardar contraseña</button>
      </>}>
      <div className="ptar-sitio-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div><label htmlFor="cc-actual">Contraseña actual <Req /></label>
          <input id="cc-actual" type={tipo} autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} /></div>
        <div><label htmlFor="cc-nueva">Contraseña nueva <Req /></label>
          <input id="cc-nueva" type={tipo} autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} /></div>
      </div>
      <div style={{ marginTop: '0.5rem' }}><MedidorClave clave={nueva} /></div>
      <button type="button" className="btn-ghost" style={{ padding: '0.35rem 0.8rem' }} onClick={() => setVer((v) => !v)}>{ver ? 'Ocultar contraseñas' : 'Ver contraseñas'}</button>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>¿No recuerdas la actual? Sal y usa «¿Olvidaste tu contraseña?» en la entrada.</p>
      {g.error && <div className="wiz-warn show" role="alert">⚠ {g.error}</div>}
      {g.trabajando && <Cargando texto={g.trabajando} />}
    </Modal>
  );
}

function BotonBaja({ texto, onBaja, disabled }: { texto: string; onBaja: () => void; disabled: boolean }) {
  const [seguro, setSeguro] = useState(false);
  if (!seguro) return <button className="btn-ghost" style={{ marginRight: 'auto', color: 'var(--red)' }} onClick={() => setSeguro(true)} disabled={disabled}>Dar de baja</button>;
  return <button className="btn-ghost" style={{ marginRight: 'auto', color: 'var(--red)', borderColor: 'var(--red)' }} onClick={onBaja} disabled={disabled}>{texto}</button>;
}

function EditarVehiculo({ inicial, onCerrar, onHecho }: { inicial: MiVehiculo; onCerrar: () => void; onHecho: () => void }) {
  const [v, setV] = useState<MiVehiculo>(inicial);
  const g = useGuardar(onHecho);
  const nuevo = !v.id;
  return (
    <Modal abierto titulo={nuevo ? 'Añadir vehículo' : `Vehículo ${v.matricula}`} sub="Documentación y características" icono={ICO_CAMION} onCerrar={onCerrar}
      pie={<>
        {!nuevo && <BotonBaja texto="Sí, dar de baja" disabled={!!g.trabajando} onBaja={() => g.correr('Dando de baja', () => darDeBajaFlota('vehiculo', v.id!))} />}
        <button className="btn-ghost" onClick={onCerrar} disabled={!!g.trabajando}>Cancelar</button>
        <button className="btn-primary" onClick={() => { if (nuevo && !v.matricula.trim()) avisaFaltas(['mv-mat']); g.correr('Guardando', () => guardarMiVehiculo(v)); }} disabled={!!g.trabajando}>{nuevo ? 'Añadir' : 'Guardar cambios'}</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div><label htmlFor="mv-mat">Matrícula{nuevo && <Req />}</label>
          <input id="mv-mat" type="text" value={v.matricula} placeholder="Ej. 1234 ABC" onChange={(e) => setV({ ...v, matricula: e.target.value.toUpperCase() })} /></div>
        <div><label htmlFor="mv-tipo">Tipo</label>
          <select id="mv-tipo" className="ptar-select" value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as MiVehiculo['tipo'] })}>
            <option value="tractora">Tractora</option><option value="remolque">Remolque</option><option value="rigido">Rígido</option>
          </select></div>
        {fechaCampo('mv-itv', 'ITV vence', v.itv, (x) => setV({ ...v, itv: x }))}
        {fechaCampo('mv-seg', 'Seguro del vehículo vence', v.seguro, (x) => setV({ ...v, seguro: x }))}
        {v.tipo !== 'remolque' && fechaCampo('mv-tt', 'Tarjeta de transporte vence', v.tarjeta, (x) => setV({ ...v, tarjeta: x }))}
        {v.tipo === 'rigido' && (
          <div>
            <label>Plataforma elevadora</label>
            <label className="ptar-tramp-box">
              <input type="checkbox" className="ptar-switch-input" checked={v.tiene_plataforma_elevadora} onChange={(e) => setV({ ...v, tiene_plataforma_elevadora: e.target.checked })} />
              <span className="ptar-switch" aria-hidden="true" />
              <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">No</span><span className="tramp-on">Sí</span></span>
            </label>
          </div>
        )}
      </div>
      {!nuevo && <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>La matrícula no se cambia: si es otro camión, añádelo nuevo. Dar de baja no borra los envíos que ya hizo.</p>}
      {g.error && <div className="wiz-warn show" role="alert">⚠ {g.error}</div>}
      {g.trabajando && <Cargando texto={g.trabajando} />}
    </Modal>
  );
}

function EditarConductor({ inicial, onCerrar, onHecho }: { inicial: MiConductor; onCerrar: () => void; onHecho: () => void }) {
  const [c, setC] = useState<MiConductor>(inicial);
  const g = useGuardar(onHecho);
  const nuevo = !c.id;
  return (
    <Modal abierto titulo={nuevo ? 'Añadir conductor' : c.nombre} sub="Datos para la orden de carga y el CMR" icono={ICO_PERSONA} onCerrar={onCerrar}
      pie={<>
        {!nuevo && <BotonBaja texto="Sí, dar de baja" disabled={!!g.trabajando} onBaja={() => g.correr('Dando de baja', () => darDeBajaFlota('conductor', c.id!))} />}
        <button className="btn-ghost" onClick={onCerrar} disabled={!!g.trabajando}>Cancelar</button>
        <button className="btn-primary" onClick={() => { if (!c.nombre.trim()) avisaFaltas(['mcd-nom']); g.correr('Guardando', () => guardarMiConductor(c)); }} disabled={!!g.trabajando}>{nuevo ? 'Añadir' : 'Guardar cambios'}</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}><label htmlFor="mcd-nom">Nombre y apellidos <Req /></label>
          <input id="mcd-nom" type="text" value={c.nombre} maxLength={120} onChange={(e) => setC({ ...c, nombre: e.target.value })} /></div>
        <div><label htmlFor="mcd-pais">País del documento</label>
          <select id="mcd-pais" className="ptar-select" value={c.pais} onChange={(e) => setC({ ...c, pais: e.target.value })}>
            {DOC_PAISES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select></div>
        <div><label htmlFor="mcd-doc">DNI / NIE / documento <Req si={false} /></label>
          <input id="mcd-doc" type="text" value={c.documento} maxLength={30} placeholder="Ej. 12345678Z" onChange={(e) => setC({ ...c, documento: e.target.value.toUpperCase() })} /></div>
        <div style={{ gridColumn: '1/-1' }}><label htmlFor="mcd-tel">Teléfono móvil <Req si={false} /></label><CampoTelefono id="mcd-tel" valor={c.telefono} onCambio={(v) => setC({ ...c, telefono: v })} /></div>
      </div>
      {g.error && <div className="wiz-warn show" role="alert">⚠ {g.error}</div>}
      {g.trabajando && <Cargando texto={g.trabajando} />}
    </Modal>
  );
}

// Baja del ACCESO: se conserva todo lo que la ley obliga a guardar. Pide la contraseña.
function DarmeDeBaja({ onCerrar, transportista }: { onCerrar: () => void; transportista: boolean }) {
  const [clave, setClave] = useState('');
  const [motivo, setMotivo] = useState('');
  const [seguro, setSeguro] = useState(false);
  const g = useGuardar(() => { window.location.href = '/panel/entrar?sesion=baja'; });
  return (
    <Modal abierto titulo="Darme de baja" sub="Dejarás de poder entrar en la plataforma" icono={ICO_CANDADO} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!g.trabajando}>Cancelar</button>
        <button className="btn-primary" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} disabled={!!g.trabajando || !clave || !seguro}
          onClick={() => g.correr('Dando de baja tu cuenta', () => darmeDeBaja(clave, motivo))}>Darme de baja</button>
      </>}>
      <p className="account-card-desc" style={{ marginBottom: '0.6rem' }}>
        Se da de baja <strong>tu acceso</strong>: no podrás entrar ni recibirás avisos. Cerramos tus sesiones en todos los dispositivos.
      </p>
      <div className="pt-aviso info" style={{ marginBottom: '0.7rem' }}><div>
        <strong>Lo que NO se borra:</strong> {transportista ? 'los datos de tu empresa de transporte' : 'los datos de tu empresa'}, los envíos, albaranes, CMR, documentos de control y facturas. La ley nos obliga a guardarlos (inspección de transporte, Hacienda) y tu empresa puede tener más usuarios. Si además quieres que borremos tus datos personales, escríbenos a {CONTACTO.email}.
      </div></div>
      <div className="ptar-sitio-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div><label htmlFor="baja-motivo">Motivo <Req si={false} /></label>
          <textarea id="baja-motivo" rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Nos ayuda a mejorar" /></div>
        <div><label htmlFor="baja-clave">Tu contraseña, para confirmar <Req /></label>
          <input id="baja-clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} /></div>
      </div>
      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '0.6rem', fontSize: 'var(--fs-s)' }}>
        <input type="checkbox" checked={seguro} onChange={(e) => setSeguro(e.target.checked)} />
        <span>Entiendo que dejaré de poder entrar. Para volver, tendré que pedírselo a Dynamo.</span>
      </label>
      {g.error && <div className="wiz-warn show" role="alert">⚠ {g.error}</div>}
      {g.trabajando && <Cargando texto={g.trabajando} />}
    </Modal>
  );
}
