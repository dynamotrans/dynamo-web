'use client';

// «NUEVO ENVÍO», en grande (usuario, 2026-11-24: «algo con más diseño, adaptado a móvil y web,
// para todos los roles»; después: «más fino, simple, lineal; quita el camión»). La franja morada
// con el título y UNA línea fina que va del punto de recogida (naranja) al de entrega (blanco):
// tramo recto, sube con una curva suave y sigue recta («como la de GLS: recta horizontal, sube,
// horizontal, con curvas suaves»). TODA la franja es el botón: debajo no hay otro botón verde
// («no tiene sentido, ya es botón arriba», usuario, mismo día).
// «Crear varios envíos»: en el ordenador, un enlace en la franja blanca de abajo; en el móvil,
// la flechita que despliega la opción, como en el botón de antes («ponlo como antes en móvil»).
// Para todos: equipo de Dynamo y clientes («claro, cliente también», usuario, mismo día).
// La línea son tres piezas: dos tramos rectos que se estiran con el ancho y, entre ellos, la
// subida, un dibujo de tamaño fijo: así la curva es la misma a cualquier ancho.
import Link from 'next/link';
import { MenuNuevoEnvio, useMenuFuera } from './BotonNuevoEnvio';

export default function BannerNuevoEnvio() {
  const m = useMenuFuera();
  return (
    <div className="ne-banner" id="banner-nuevo-envio" ref={m.ref}>
      <Link className="ne-banner-arriba" href="/panel/nuevo-envio">
        <span className="ne-banner-txt">
          <span className="ne-banner-tit">Nuevo envío</span>
          <span className="ne-banner-sub">Solicita un transporte o mira el coste de un envío</span>
        </span>
        <span className="ne-linea" aria-hidden="true">
          <i className="ne-tramo ne-tramo-1" />
          <svg className="ne-sube" width="72" height="65.5" viewBox="0 0 72 65.5" focusable="false"><path d="M0 64.75 C36 64.75 36 0.75 72 0.75" /></svg>
          <i className="ne-tramo ne-tramo-2" />
          <i className="ne-punto ne-punto-1" /><i className="ne-punto ne-punto-2" />
        </span>
      </Link>
      <button type="button" className="ne-banner-flecha" id="banner-mas" aria-haspopup="menu" aria-expanded={m.abierto}
        aria-label="Más formas de crear envíos" onClick={() => m.setAbierto((v) => !v)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {m.abierto && <MenuNuevoEnvio onCerrar={() => m.setAbierto(false)} />}
      <div className="ne-banner-abajo">
        <Link className="ne-banner-varios" href="/panel/nuevo-envio/varios" data-varios-envios="">
          <span>¿Muchos de golpe? <strong>Crear varios envíos</strong></span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </Link>
      </div>
    </div>
  );
}
