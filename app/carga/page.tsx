import type { Metadata } from 'next';
import SelectorIdioma from '@/components/SelectorIdioma';
import CodigoCarga from './CodigoCarga';
import './carga.css';

export const metadata: Metadata = { title: 'Acceder a la carga · Dynamo', robots: { index: false, follow: false },
  formatDetection: { telephone: false, address: false, email: false, date: false } };

// LA PUERTA POR CÓDIGO (usuario, 2026-11-17): en la bolsa de cargas no se pueden publicar
// enlaces, así que la carga lleva allí un código de aceptación. El transportista entra
// aquí, lo teclea y, si la carga sigue libre, pasa a la pantalla de aceptación de siempre
// (/carga/<enlace>). El código no es el número de envío: ese lo conoce el cliente.
export default function PaginaCodigoCarga() {
  return (
    <div className="carga-page">
      <SelectorIdioma />
      <div className="card">
        <div className="brand"><img src="/images/2.png" alt="Dynamo" /></div>
        <CodigoCarga />
      </div>
      <p className="foot">Dynamo Operador Logístico, S.L.</p>
    </div>
  );
}
