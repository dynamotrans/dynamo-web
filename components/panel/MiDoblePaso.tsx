'use client';

// «Mi cuenta» → Seguridad → DOBLE PASO (usuario, 2026-11-18). Para los usuarios de Dynamo:
// ver si lo tienen activo, darlo de alta y cambiar de móvil. Cambiar de móvil pide la
// contraseña: con una sesión que alguien se dejó abierta no se puede poner otro móvil.
import { useState } from 'react';
import Link from 'next/link';
import Modal from './Modal';
import Cargando from '@/components/Cargando';
import Req from '@/components/Req';
import { quitarMiDoblePaso } from '@/app/panel/(app)/mi-cuenta/acciones';

export default function MiDoblePaso({ activo, obligatorio }: { activo: boolean; obligatorio: boolean }) {
  const [cambiar, setCambiar] = useState(false);
  // «Quitar» (sin dar de alta otro): solo mientras no sea obligatorio para el equipo.
  const [soloQuitar, setSoloQuitar] = useState(false);
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function quitar() {
    setError(null); setTrabajando(true);
    const r = await quitarMiDoblePaso(clave);
    if (!r.ok) { setTrabajando(false); setError(r.error); return; }
    // Ya sin móvil: a darlo de alta de nuevo (si es obligatorio, no se entra sin hacerlo);
    // o, si solo se quería quitar, de vuelta a «Mi cuenta».
    window.location.assign(soloQuitar ? '/panel/mi-cuenta' : '/panel/doble-paso?alta=1');
  }

  return (
    <div id="mi-doble-paso" style={{ marginTop: '1.1rem', paddingTop: '0.8rem', borderTop: '1px dashed var(--gray-200)' }}>
      <div className="account-row">
        <span className="account-row-label">Doble paso (código del móvil)</span>
        <span className={`badge ${activo ? 'badge-green' : 'badge-gray'}`}>{activo ? 'Activo' : 'Sin activar'}</span>
      </div>
      <p className="account-card-desc" style={{ margin: '0.35rem 0 0.6rem' }}>
        {activo
          ? <>Al entrar, además de la contraseña se pide el código de 6 cifras de tu aplicación del móvil.{obligatorio ? <> Es <strong>obligatorio</strong> para el equipo de Dynamo.</> : <> Lo has activado tú: <strong>se te pide siempre</strong>, aunque todavía no sea obligatorio para el resto del equipo. Si no lo quieres aún, puedes quitarlo.</>}</>
          : <>Además de la contraseña, un código de tu móvil (Google Authenticator). Si te roban la contraseña, no pueden entrar.{obligatorio ? <> Es <strong>obligatorio</strong> para el equipo de Dynamo.</> : null}</>}
      </p>
      {activo
        ? <span style={{ display: 'inline-flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn-ghost account-edit" onClick={() => { setClave(''); setError(null); setSoloQuitar(false); setCambiar(true); }}>Cambiar de móvil</button>
            {!obligatorio && <button type="button" id="mdp-quitar" className="btn-ghost account-edit" onClick={() => { setClave(''); setError(null); setSoloQuitar(true); setCambiar(true); }}>Quitar el doble paso</button>}
          </span>
        : <Link className="btn-ghost account-edit" href="/panel/doble-paso?alta=1" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Activar el doble paso</Link>}

      {cambiar && (
        <Modal abierto titulo={soloQuitar ? 'Quitar el doble paso' : 'Cambiar de móvil'} sub={soloQuitar ? 'Volverás a entrar solo con tu contraseña' : 'Quita el doble paso de este móvil y lo das de alta en el nuevo'} onCerrar={() => setCambiar(false)}
          pie={<>
            <button className="btn-ghost" onClick={() => setCambiar(false)} disabled={trabajando}>Cancelar</button>
            <button className="btn-primary" onClick={quitar} disabled={trabajando || !clave}>{soloQuitar ? 'Quitar el doble paso' : 'Quitar y dar de alta el nuevo'}</button>
          </>}>
          <div className="modal-warn-box">
            {soloQuitar
              ? <>Al confirmar, el código del móvil deja de valer y tu cuenta vuelve a entrar <strong>solo con la contraseña</strong>. Puedes activarlo de nuevo cuando quieras; cuando sea obligatorio para el equipo, se te pedirá darlo de alta al entrar.</>
              : <>Ten el <strong>móvil nuevo a mano</strong> con Google Authenticator instalado: al confirmar, el código del móvil de
            ahora deja de valer y te sale el código QR para el nuevo.</>}
          </div>
          <div className="ptar-sitio-grid">
            <div style={{ gridColumn: '1/-1' }}>
              <label htmlFor="mdp-clave">Para confirmar, <strong>escribe tu contraseña</strong> <Req /></label>
              <input id="mdp-clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => { setClave(e.target.value); setError(null); }} />
            </div>
          </div>
          {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
          {trabajando && <Cargando texto="Quitando el doble paso" />}
        </Modal>
      )}
    </div>
  );
}
