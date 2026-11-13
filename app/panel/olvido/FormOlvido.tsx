'use client';

import { useActionState } from 'react';
import { pedirEnlace, type EstadoOlvido } from './acciones';
import { IcoAviso } from '@/components/Iconos';
import Cargando from '@/components/Cargando';
import Req from '@/components/Req';
import Turnstile from '@/components/Turnstile';

export default function FormOlvido() {
  // Al enviar, la acción redirige a /panel/olvido/codigo: el email trae enlace Y código
  // de 6 cifras (doble vía, usuario 2026-11-11), y allí se teclea el código.
  const [estado, accion, enviando] = useActionState(pedirEnlace, { enviado: false, error: null } as EstadoOlvido);
  return (
    <form action={accion} noValidate>
      {enviando && <Cargando texto="Enviando el email" />}
      {estado.error && <div className="pt-aviso error" role="alert"><IcoAviso /><div>{estado.error}</div></div>}
      <div className="portal-field">
        <label className="portal-label" htmlFor="olvido-email">Correo electrónico <Req /></label>
        <div className="portal-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
          <input id="olvido-email" name="email" key={estado.email ?? ''} defaultValue={estado.email ?? ''} className="portal-input"
                 type="email" inputMode="email" placeholder="Ej. tu@empresa.com" autoComplete="username" required />
        </div>
      </div>
      <Turnstile />
      <button type="submit" className="portal-submit" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviarme el enlace y el código'}</button>
    </form>
  );
}
