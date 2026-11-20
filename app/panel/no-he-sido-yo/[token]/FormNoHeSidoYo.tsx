'use client';

import { useActionState } from 'react';
import { noHeSidoYo, type EstadoNoHeSidoYo } from './acciones';

const INICIO: EstadoNoHeSidoYo = { hecho: false, error: null };

export default function FormNoHeSidoYo({ token }: { token: string }) {
  const [estado, accion, enviando] = useActionState(noHeSidoYo, INICIO);
  if (estado.hecho) {
    return <div className="pt-aviso info" role="status" id="no-he-sido-yo-hecho"><div>{estado.aviso}</div></div>;
  }
  return (
    <form action={accion}>
      <input type="hidden" name="token" value={token} />
      <p style={{ margin: '0 0 1rem', lineHeight: 1.55 }}>
        Si <strong>no has sido tú</strong> quien ha entrado, pulsa el botón: cerramos todas las sesiones abiertas de tu cuenta (en cualquier
        ordenador o móvil), avisamos a Dynamo y te mandamos un email para poner una contraseña nueva.
      </p>
      {estado.error && <div className="pt-aviso error" role="alert" style={{ marginBottom: '0.8rem' }}><div>{estado.error}</div></div>}
      <button type="submit" className="portal-submit" id="no-he-sido-yo-boton" disabled={enviando} style={{ background: '#c0262d' }}>
        {enviando ? 'Cerrando sesiones…' : 'No he sido yo: cerrar todas las sesiones'}
      </button>
      <p style={{ margin: '1rem 0 0', fontSize: '0.9rem', color: '#6b7280', lineHeight: 1.5 }}>
        Si has sido tú, cierra esta página: no hace falta hacer nada. Dynamo nunca te pedirá tu contraseña ni tus códigos por teléfono, email o WhatsApp.
      </p>
    </form>
  );
}
