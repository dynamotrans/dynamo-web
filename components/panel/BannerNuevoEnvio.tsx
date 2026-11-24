// «NUEVO ENVÍO», en grande (usuario, 2026-11-24: «algo con más diseño, adaptado a móvil y web,
// para todos los roles»; después: «más fino, simple, lineal; quita el camión»; y «la línea,
// curva, bonita»). Arriba, la franja morada con el título y UNA línea fina y curva que va del
// punto de recogida (naranja) al de entrega (blanco). Abajo, la franja blanca con el botón
// «Crear un envío» y, al lado, «Crear varios envíos». La curva se estira con el ancho del
// cartel sin engordar (trazo de grosor fijo) y los dos puntos van aparte, para que sigan redondos.
import Link from 'next/link';

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
        <span className="ne-linea" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
            <path d="M0 80 C 26 80, 38 97, 56 68 S 78 24, 100 24" />
          </svg>
          <i className="ne-punto ne-punto-1" /><i className="ne-punto ne-punto-2" />
        </span>
      </Link>
      <div className="ne-banner-abajo">
        <Link className={`ne-banner-varios${variosEnMovil ? '' : ' solo-ordenador'}`} href="/panel/nuevo-envio/varios" data-varios-envios="">
          <span>¿Muchos de golpe? <strong>Crear varios envíos</strong></span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </Link>
        <Link className="ne-banner-btn" href="/panel/nuevo-envio">Crear un envío</Link>
      </div>
    </div>
  );
}
