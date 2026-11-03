'use client';

// Mi cuenta, con el diseño de #sec-mi-cuenta de dashboard.html (tarjetas .account-card):
// datos personales (editables), seguridad y datos fiscales de la empresa (solo lectura).
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Modal from './Modal';
import Documentos from './Documentos';
import Cargando from '@/components/Cargando';
import { guardarMisDatos, type MisDatos } from '@/app/panel/(app)/mi-cuenta/acciones';
import { creadoTxt } from '@/lib/envios';
import { paisDe, telBonito } from '@/lib/paises';
import { ROL, fecha } from '@/lib/formato';

// Los mismos idiomas que el selector de la web (y que usarán los avisos automáticos).
const IDIOMAS: [string, string][] = [
  ['es', 'Español'], ['ca', 'Català'], ['eu', 'Euskara'], ['pt', 'Português'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'],
  ['it', 'Italiano'], ['nl', 'Nederlands'], ['pl', 'Polski'], ['ro', 'Română'], ['uk', 'Українська'], ['zh-CN', '中文'], ['ar', 'العربية'],
];

// Lo del TRANSPORTISTA: su empresa de transporte (NIMA, seguro, bolsa), su flota y su documentación.
export type TransporteDatos = {
  id: string; nima: string | null; bolsa: string | null; codigo_bolsa: string | null; plazo_pago_dias: number | null;
  seguro_cmr_compania: string | null; seguro_cmr_poliza: string | null; seguro_cmr_vence: string | null;
  vehiculos: { id: string; matricula: string; tipo: string; itv_vence: string | null; seguro_vence: string | null; tarjeta_transporte_vence: string | null; adr: boolean; trampilla: boolean }[];
  conductores: { id: string; nombre: string; telefono: string | null }[];
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
  const router = useRouter();
  const [editar, setEditar] = useState(false);
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
          {fila('Última conexión', ultimaConexion ? creadoTxt(ultimaConexion) : '')}
          <Link className="btn-ghost account-edit" href="/panel/nueva-contrasena" style={{ textDecoration: 'none', textAlign: 'center' }}>Cambiar contraseña</Link>
          <p className="account-card-desc" style={{ marginTop: '0.8rem' }}>Para cambiar el <strong>email</strong> con el que entras, escríbenos a info@dynamotrans.com: es tu usuario y lo cambiamos nosotros.</p>
        </div>
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
            <p className="account-card-desc" style={{ marginTop: '0.8rem' }}>Si algo ha cambiado (seguro renovado, NIMA nuevo…), súbelo en <strong>Documentación</strong> y lo actualizamos.</p>
          </div>
          <div className="account-card">
            <h3 className="account-card-title">Mi flota</h3>
            {transporte.vehiculos.length === 0 && transporte.conductores.length === 0 && <p className="account-card-desc">Aún no hay camiones ni conductores. Se añaden solos al darnos la matrícula y el conductor de cada viaje.</p>}
            {transporte.vehiculos.map((v) => (
              <div key={v.id} className="account-row"><span className="account-row-label">{TIPO_VEH[v.tipo] ?? v.tipo}{v.trampilla ? ' · trampilla' : ''}{v.adr ? ' · ADR' : ''}</span>
                <span className="account-row-value"><strong>{v.matricula}</strong>{v.itv_vence && <><br /><span style={{ fontSize: 'var(--fs-s)' }}>ITV: <Vence f={v.itv_vence} /></span></>}</span></div>
            ))}
            {transporte.conductores.map((c) => (
              <div key={c.id} className="account-row"><span className="account-row-label">Conductor</span><span className="account-row-value">{c.nombre}{c.telefono ? ` · ${telBonito(c.telefono)}` : ''}</span></div>
            ))}
            <p className="account-card-desc" style={{ marginTop: '0.8rem' }}>La flota se completa sola con los camiones y conductores de tus viajes.</p>
          </div>
          <div className="account-card">
            <h3 className="account-card-title">Documentación</h3>
            <Documentos dueno={{ campo: 'transportista_id', id: transporte.id }} max={5} tipos={['hoja_cif', 'seguro_cmr', 'tarjeta_transporte', 'dni', 'otro']} sinQuitar
              ayuda={<>Hoja del CIF, seguro CMR en vigor, tarjeta de transporte… (máx. 5). Para retirar uno, escríbenos.</>} />
          </div>
        </>)}
      </div>
      {editar && <EditarDatos datos={datos} onCerrar={() => setEditar(false)} onHecho={() => { setEditar(false); router.refresh(); }} />}
    </section>
  );
}

function EditarDatos({ datos, onCerrar, onHecho }: { datos: MisDatos; onCerrar: () => void; onHecho: () => void }) {
  const [d, setD] = useState<MisDatos>(datos);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof MisDatos, v: string) => setD((x) => ({ ...x, [k]: v }));
  async function guardar() {
    setError(null); setGuardando(true);
    const r = await guardarMisDatos(d);
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    onHecho();
  }
  const campo = (k: keyof MisDatos, label: string, ph: string, tipo = 'text') => (
    <div>
      <label htmlFor={`mc-${k}`}>{label}</label>
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
          <label htmlFor="mc-nombre">Nombre y apellidos *</label>
          <input id="mc-nombre" type="text" value={d.nombre} placeholder="Nombre y apellidos" onChange={(e) => set('nombre', e.target.value)} />
        </div>
        {campo('telefono', 'Teléfono', '+34 600 000 000', 'tel')}
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
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {guardando && <Cargando texto="Guardando tus datos" />}
    </Modal>
  );
}
