'use client';

// Crear o cambiar la contraseña, con el medidor de fortaleza de crear-password.html.
import { useActionState, useState } from 'react';
import { guardarClave, type EstadoClave } from './acciones';
import { IcoAviso } from '@/components/Iconos';
import Cargando from '@/components/Cargando';
import MedidorClave, { claveValida } from '@/components/MedidorClave';

export default function FormClave() {
  const [estado, accion, enviando] = useActionState(guardarClave, { error: null } as EstadoClave);
  const [clave, setClave] = useState('');
  const [ver, setVer] = useState(false);
  const vale = claveValida(clave);
  return (
    <form action={accion} noValidate>
      {enviando && <Cargando texto="Guardando la contraseña" />}
      {estado.error && <div className="pt-aviso error" role="alert"><IcoAviso /><div>{estado.error}</div></div>}
      <div className="portal-field">
        <label className="portal-label" htmlFor="clave">Contraseña nueva</label>
        <div className="portal-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <input id="clave" name="password" className="portal-input" type={ver ? 'text' : 'password'} autoComplete="new-password"
                 value={clave} onChange={(e) => setClave(e.target.value)} required />
          <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Ver contraseña'}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--gray-500)', cursor: 'pointer', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ver ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                   : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
            </svg>
          </button>
        </div>
      </div>
      <MedidorClave clave={clave} />
      <button type="submit" className="portal-submit" disabled={enviando || !vale}>
        {enviando ? 'Guardando…' : 'Guardar contraseña y entrar'}
      </button>
      {!vale && clave && <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>Mínimo 8 caracteres y al menos 3 de las reglas.</p>}
    </form>
  );
}
