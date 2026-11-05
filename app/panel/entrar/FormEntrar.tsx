'use client';

import { useActionState } from 'react';
import { entrar, type EstadoEntrar } from '../acciones';
import { IcoAviso } from '@/components/Iconos';
import Cargando from '@/components/Cargando';

const inicial: EstadoEntrar = { error: null };


// caducada: viene del middleware al pasar los días de Parámetros sin escribir la contraseña.
export default function FormEntrar({ caducada = false }: { caducada?: boolean }) {
  const [estado, accion, enviando] = useActionState(entrar, inicial);
  return (
    <form action={accion} noValidate>
      {enviando && <Cargando texto="Entrando" />}
      {caducada && !estado.error && (
        <div className="pt-aviso info" role="status"><div>Por seguridad, hace tiempo que no escribías tu contraseña: vuelve a entrar.</div></div>
      )}
      {estado.error && (
        <div className="pt-aviso error" role="alert"><IcoAviso /><div>{estado.error}</div></div>
      )}
      <div className="portal-field">
        <label className="portal-label" htmlFor="portal-user">Correo electrónico</label>
        <div className="portal-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
          <input id="portal-user" name="email" key={estado.email ?? ''} defaultValue={estado.email ?? ''} className="portal-input" type="email" inputMode="email"
                 placeholder="tu@empresa.com" autoComplete="username" required />
        </div>
      </div>

      <div className="portal-field">
        <label className="portal-label" htmlFor="portal-pass">Contraseña</label>
        <div className="portal-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <input id="portal-pass" name="password" className="portal-input" type="password"
                 autoComplete="current-password" required />
        </div>
      </div>

      <div className="portal-row">
        <label className="portal-check"><input type="checkbox" name="recordar" defaultChecked /> Recordarme</label>
        <a href="/panel/olvido" className="portal-forgot">¿Olvidaste tu contraseña?</a>
      </div>

      <button type="submit" className="portal-submit" disabled={enviando}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>
        {enviando ? 'Entrando…' : 'Iniciar sesión'}
      </button>
    </form>
  );
}
