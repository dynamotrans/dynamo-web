'use client';

// Crear o cambiar la contraseña, con el medidor de fortaleza de crear-password.html.
import { useActionState, useState } from 'react';
import { guardarClave, type EstadoClave } from './acciones';
import { IcoAviso } from '@/components/Iconos';
import Cargando from '@/components/Cargando';

const REGLAS: [string, (s: string) => boolean][] = [
  ['Mínimo 8 caracteres', (s) => s.length >= 8],
  ['Una mayúscula', (s) => /[A-ZÁÉÍÓÚÑ]/.test(s)],
  ['Una minúscula', (s) => /[a-záéíóúñ]/.test(s)],
  ['Un número', (s) => /\d/.test(s)],
  ['Un símbolo', (s) => /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/.test(s)],
];
const NIVELES = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte'];
const COLORES = ['#dc2626', '#f97316', '#eab308', '#84cc16', '#22a55a'];

export default function FormClave() {
  const [estado, accion, enviando] = useActionState(guardarClave, { error: null } as EstadoClave);
  const [clave, setClave] = useState('');
  const [ver, setVer] = useState(false);
  const cumple = REGLAS.map(([, f]) => f(clave));
  const n = cumple.filter(Boolean).length;
  const vale = clave.length >= 8 && n >= 3;
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
      <div style={{ display: 'flex', gap: 4, margin: '0.2rem 0 0.35rem' }} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: clave && i < n ? COLORES[n - 1] : 'var(--gray-200)' }} />)}
      </div>
      {clave && <div style={{ fontSize: '0.8rem', fontWeight: 700, color: COLORES[Math.max(0, n - 1)], marginBottom: '0.4rem' }}>{NIVELES[Math.max(0, n - 1)]}</div>}
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--gray-500)', display: 'grid', gap: 3 }}>
        {REGLAS.map(([t], i) => (
          <li key={t} style={{ color: cumple[i] ? '#0f6b3a' : undefined, fontWeight: cumple[i] ? 700 : 500 }}>{cumple[i] ? '✓' : '·'} {t}</li>
        ))}
      </ul>
      <button type="submit" className="portal-submit" disabled={enviando || !vale}>
        {enviando ? 'Guardando…' : 'Guardar contraseña y entrar'}
      </button>
      {!vale && clave && <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>Mínimo 8 caracteres y al menos 3 de las reglas.</p>}
    </form>
  );
}
