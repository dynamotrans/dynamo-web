'use client';

import { useActionState } from 'react';
import { buscarPorCodigo, type EstadoCodigo } from './acciones';
import Turnstile from '@/components/Turnstile';
import { CONTACTO } from '@/lib/atencion';

// La casilla del código de aceptación. Mientras se comprueba, el botón lo dice; si el
// código vale, la acción lleva sola a la pantalla de la carga.
export default function CodigoCarga() {
  const [estado, accion, comprobando] = useActionState(buscarPorCodigo, { error: null } as EstadoCodigo);
  return (
    <form action={accion} noValidate>
      <h1>Aceptar carga</h1>
      <p className="sub">Escribe el <strong>código de aceptación</strong> que aparece en la carga publicada en la bolsa.</p>
      <label htmlFor="codigo-carga">Código de aceptación</label>
      <input id="codigo-carga" name="codigo" type="text" key={estado.codigo ?? ''} defaultValue={estado.codigo ?? ''}
        placeholder="Ej. 482 913" maxLength={12} inputMode="numeric" pattern="[0-9 ]*" autoComplete="off" autoCorrect="off" spellCheck={false}
        required disabled={comprobando} aria-describedby="codigo-carga-ayuda"
        style={{ letterSpacing: '0.18em', fontWeight: 800, textAlign: 'center' }} />
      <p id="codigo-carga-ayuda" className="id-hint">Son 6 cifras.</p>
      {estado.error && !comprobando && <div className="id-nofound show" role="alert">{estado.error}</div>}
      {comprobando && <div className="id-nofound show" role="status" aria-live="polite">Comprobando si la carga sigue disponible…</div>}
      <Turnstile />
      <button type="submit" className="btn" disabled={comprobando}>{comprobando ? 'Comprobando…' : 'Ver la carga'}</button>
      <p className="aviso">¿Dudas? Llámanos al <strong>{CONTACTO.telefono}</strong> o escribe a <strong>{CONTACTO.email}</strong>.</p>
    </form>
  );
}
