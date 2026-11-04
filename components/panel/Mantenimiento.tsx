'use client';

// Modo mantenimiento (solo admin), con el diseño de la ventana del mockup (.maint-control).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Cargando from '@/components/Cargando';
import { guardarParametro } from '@/app/panel/(app)/parametros/acciones';
import { creadoTxt } from '@/lib/envios';
import { contarArchivosSueltos, borrarArchivosSueltos } from '@/app/panel/(app)/mantenimiento/acciones';

const LLAVE = 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z';

export default function Mantenimiento({ activo, esAdmin, cambiado, quien }: { activo: boolean; esAdmin: boolean; cambiado: string | null; quien: string | null }) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [preguntar, setPreguntar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function cambiar() {
    setError(null); setTrabajando(true);
    const r = await guardarParametro('mantenimiento_activo', !activo);
    setTrabajando(false); setPreguntar(false);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  }
  return (
    <section className="section active" id="sec-mantenimiento">
      <div className="sec-header"><h2>Modo mantenimiento</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Kill-switch de la plataforma, para un incidente o una actualización delicada.
      </p>
      <div style={{ maxWidth: 720, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 14, padding: '1.1rem 1.2rem' }}>
        <div className="maint-control">
          <div className="maint-control-info">
            <span className="maint-control-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={LLAVE} /></svg></span>
            <div className="maint-control-txt">
              <strong>Modo mantenimiento · {activo ? 'ACTIVADO' : 'desactivado'}</strong>
              <span>Cierra el portal para clientes y transportistas: ven la pantalla de mantenimiento en vez del panel, y la página pública de aceptar carga se para. El equipo de Dynamo sigue entrando.</span>
            </div>
          </div>
          {esAdmin && (
            <button type="button" className={`maint-control-btn${activo ? ' maint-on' : ''}`} aria-pressed={activo} disabled={trabajando}
              onClick={() => (activo ? cambiar() : setPreguntar(true))}>
              <span className="maint-control-btn-label">{activo ? 'Desactivar' : 'Activar'}</span>
            </button>
          )}
        </div>
        {cambiado && <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>Último cambio: {creadoTxt(cambiado)}{quien ? ` · por ${quien}` : ''}</p>}
        {!esAdmin && <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>Solo un <strong>administrador</strong> lo puede activar o desactivar.</p>}
        {preguntar && (
          <div className="pt-aviso error" style={{ marginTop: '0.9rem' }}>
            <div>
              <strong>¿Seguro que quieres cerrar la plataforma?</strong> Ningún cliente ni transportista podrá entrar ni aceptar cargas hasta que la vuelvas a abrir.
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                <button className="btn-ghost" onClick={() => setPreguntar(false)} disabled={trabajando}>No, volver</button>
                <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={cambiar} disabled={trabajando}>Sí, activar mantenimiento</button>
              </div>
            </div>
          </div>
        )}
        {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.8rem', maxWidth: 720 }}>
        Lo que ya está en marcha no se para: los envíos siguen su curso y las reservas abiertas caducan solas. Al desactivarlo, todo vuelve a funcionar al instante.
      </p>
      {esAdmin && <ArchivosSueltos />}
      {trabajando && <Cargando texto={activo ? 'Abriendo la plataforma' : 'Cerrando la plataforma'} />}
    </section>
  );
}

// Limpieza del almacén de archivos: lo que se subió pero nunca llegó a registrarse.
function ArchivosSueltos() {
  const [estado, setEstado] = useState<{ n: number; bytes: number } | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const mb = (b: number) => `${(b / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
  async function contar() {
    setError(null); setHecho(null); setTrabajando('Buscando archivos sueltos');
    const r = await contarArchivosSueltos();
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    setEstado({ n: r.n, bytes: r.bytes });
  }
  async function borrar() {
    setError(null); setTrabajando('Borrando archivos sueltos');
    const r = await borrarArchivosSueltos();
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    setEstado(null); setHecho(`Hecho: ${r.borrados} archivo${r.borrados === 1 ? '' : 's'} borrado${r.borrados === 1 ? '' : 's'}.`);
  }
  return (
    <div style={{ maxWidth: 720, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 14, padding: '1.1rem 1.2rem', marginTop: '1rem' }}>
      <strong style={{ color: 'var(--navy)' }}>Archivos sueltos</strong>
      <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-600)', margin: '0.35rem 0 0.7rem' }}>
        Archivos que se subieron pero no llegaron a registrarse (se cortó la conexión a mitad de la subida). No los ve nadie y solo ocupan sitio.
        Se buscan los que llevan más de 24 horas sin dueño; los documentos de envíos, firmas y altas no se tocan nunca, ni siquiera los quitados.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn-ghost" onClick={contar} disabled={!!trabajando}>Buscar</button>
        {estado && (estado.n > 0
          ? <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={borrar} disabled={!!trabajando}>Borrar {estado.n} archivo{estado.n === 1 ? '' : 's'} ({mb(estado.bytes)})</button>
          : <span style={{ fontSize: 'var(--fs-m)', color: '#0f6b3a', fontWeight: 700 }}>No hay ningún archivo suelto.</span>)}
        {hecho && <span style={{ fontSize: 'var(--fs-m)', color: '#0f6b3a', fontWeight: 700 }}>{hecho}</span>}
      </div>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </div>
  );
}
