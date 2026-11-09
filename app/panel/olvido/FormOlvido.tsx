'use client';

import { useActionState } from 'react';
import { pedirEnlace, type EstadoOlvido } from './acciones';
import { IcoAviso } from '@/components/Iconos';
import Cargando from '@/components/Cargando';
import Req from '@/components/Req';

export default function FormOlvido() {
  const [estado, accion, enviando] = useActionState(pedirEnlace, { enviado: false, error: null } as EstadoOlvido);
  if (estado.enviado) {
    return (
      <div className="pt-aviso info" role="status"><div>
        Si <strong>{estado.email}</strong> tiene cuenta en la plataforma, en unos minutos le llega un email con el enlace para
        crear una contraseña nueva. Mira también en <strong>spam</strong>. El enlace caduca en una hora.
      </div></div>
    );
  }
  return (
    <form action={accion} noValidate>
      {enviando && <Cargando texto="Enviando el enlace" />}
      {estado.error && <div className="pt-aviso error" role="alert"><IcoAviso /><div>{estado.error}</div></div>}
      <div className="portal-field">
        <label className="portal-label" htmlFor="olvido-email">Correo electrónico <Req /></label>
        <div className="portal-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
          <input id="olvido-email" name="email" key={estado.email ?? ''} defaultValue={estado.email ?? ''} className="portal-input"
                 type="email" inputMode="email" placeholder="tu@empresa.com" autoComplete="username" required />
        </div>
      </div>
      <button type="submit" className="portal-submit" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviarme el enlace'}</button>
    </form>
  );
}
