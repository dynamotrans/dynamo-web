// «NUEVO ENVÍO», en grande y con dibujo propio (usuario, 2026-11-24: «algo con más diseño,
// adaptado a móvil y web, para todos los roles»). Arriba, la franja morada con el título y una
// ruta dibujada con el mismo lenguaje de nuestros mapas (recogida 1 en naranja, entrega 2, el
// tramo hecho en línea continua, el que falta en discontinua y el camión de Dynamo en medio).
// Abajo, la franja blanca con el botón «Crear un envío» y, al lado, «Crear varios envíos».
import Link from 'next/link';
import { svgCamion } from './mapaRuta';

const RUTA = 'M34 104 H170 C 215 104, 205 44, 250 44 H386';

/** `variosEnMovil`: el equipo de Dynamo tiene «Crear varios envíos» también en el móvil; los
 *  clientes, solo en el ordenador. */
export default function BannerNuevoEnvio({ variosEnMovil }: { variosEnMovil: boolean }) {
  return (
    <div className="ne-banner" id="banner-nuevo-envio">
      <Link className="ne-banner-arriba" href="/panel/nuevo-envio">
        <span className="ne-banner-txt">
          <span className="ne-banner-tit">Nuevo envío</span>
          <span className="ne-banner-sub">Solicita un transporte o mira el coste de un envío</span>
        </span>
        <svg className="ne-banner-ruta" viewBox="14 22 396 104" aria-hidden="true" focusable="false">
          <path d={RUTA} fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="1 10" />
          <path d={RUTA} pathLength={100} fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="50 100" />
          <circle cx="34" cy="104" r="14" fill="#ff7a00" stroke="#fff" strokeWidth="3" />
          <text x="34" y="109" textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">1</text>
          <circle cx="386" cy="44" r="15.5" fill="#fff" />
          <text x="386" y="49" textAnchor="middle" fontSize="14" fontWeight="800" fill="#3300cc" fontFamily="system-ui, sans-serif">2</text>
          <rect x="173" y="54" width="74" height="40" rx="10" fill="#fff" stroke="#22a55a" strokeWidth="2.5" />
          <g transform="translate(180 60.5)" dangerouslySetInnerHTML={{ __html: svgCamion(60) }} />
        </svg>
      </Link>
      <div className="ne-banner-abajo">
        <Link className={`ne-banner-varios${variosEnMovil ? '' : ' solo-ordenador'}`} href="/panel/nuevo-envio/varios" data-varios-envios="">
          <span>¿Muchos de golpe? <strong>Crear varios envíos</strong></span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </Link>
        <Link className="ne-banner-btn" href="/panel/nuevo-envio">Crear un envío</Link>
      </div>
    </div>
  );
}
