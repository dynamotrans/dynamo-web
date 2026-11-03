'use client';

import { useState } from 'react';
import { IcoInfo } from '@/components/Iconos';

// "Crear cuenta" se queda con el diseño de portal.html, pero el alta de clientes aún no
// está abierta (etapa B): al pulsarlo se avisa y se ofrece el contacto.
export default function CrearCuenta() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <div className="portal-divider">¿No tienes cuenta?</div>
      <button type="button" className="portal-create" aria-expanded={abierto}
              onClick={() => setAbierto(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
        Crear cuenta
      </button>
      {abierto && (
        <div className="warn info portal-aviso-alta" role="status">
          <IcoInfo />
          <div>
            <strong>El alta online estará disponible muy pronto.</strong> Mientras tanto, escríbenos
            a <a href="mailto:info@dynamotrans.com?subject=Quiero%20crear%20una%20cuenta%20en%20la%20plataforma">info@dynamotrans.com</a> o
            por <a href="https://wa.me/34628995709" target="_blank" rel="noopener">WhatsApp</a> y
            te creamos la cuenta.
          </div>
        </div>
      )}
    </>
  );
}
