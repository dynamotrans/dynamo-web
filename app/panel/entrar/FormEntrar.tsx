'use client';

import { useActionState } from 'react';
import { entrar, type EstadoEntrar } from '../acciones';
import { IcoAviso } from '@/components/Iconos';

const inicial: EstadoEntrar = { error: null };

export default function FormEntrar() {
  const [estado, accion, enviando] = useActionState(entrar, inicial);
  return (
    <form action={accion} noValidate>
      {estado.error && (
        <div className="warn error" role="alert"><IcoAviso /><div>{estado.error}</div></div>
      )}
      <div className="pt-field">
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" name="email" type="email" className="pt-input"
               autoComplete="email" inputMode="email" placeholder="tu@empresa.com" required />
      </div>
      <div className="pt-field">
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" className="pt-input"
               autoComplete="current-password" required />
      </div>
      <button type="submit" className="btn-primary" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
