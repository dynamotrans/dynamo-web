'use client';

// «Tirar para recargar» en el móvil: arriba del todo, se arrastra hacia abajo, sale la rueda
// de Dynamo y al soltar se vuelven a pedir los datos de la página (sin perder lo escrito ni
// la pestaña en la que se está). Solo con la plataforma instalada como app (pantalla de
// inicio): en Safari o Chrome el navegador ya lo trae de serie y no se duplica.
// No salta con una ventana abierta ni si el dedo empieza en una lista que ya está bajada.
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const UMBRAL = 70;   // px (ya amortiguados) para que al soltar recargue
const MAXIMO = 110;
const MINIMO_MS = 700;   // la rueda gira al menos esto, aunque los datos lleguen antes

export const EVENTO_RECARGAR = 'dynamo:recargar';   // para lo que se carga aparte (campana)

function haySubido(el: EventTarget | null): boolean {
  for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
    if (n.scrollTop > 0) return true;
  }
  return false;
}

export default function TirarParaRecargar() {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [tirado, setTirado] = useState(0);
  const [girando, setGirando] = useState(false);
  const desde = useRef(0);
  const inicio = useRef<number | null>(null);
  const actual = useRef(0);

  useEffect(() => {
    const app = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!app) return;
    const empieza = (ev: TouchEvent) => {
      inicio.current = null;
      if (ev.touches.length !== 1 || window.scrollY > 0) return;
      if (document.querySelector('[aria-modal="true"]') || haySubido(ev.target)) return;
      inicio.current = ev.touches[0].clientY;
    };
    const mueve = (ev: TouchEvent) => {
      if (inicio.current == null) return;
      const d = ev.touches[0].clientY - inicio.current;
      if (d <= 0 || window.scrollY > 0) { actual.current = 0; setTirado(0); return; }
      actual.current = Math.min(MAXIMO, d * 0.5);
      setTirado(actual.current);
    };
    const suelta = () => {
      if (inicio.current == null) return;
      inicio.current = null;
      const llego = actual.current >= UMBRAL;
      actual.current = 0;
      setTirado(0);
      if (llego) {
        desde.current = Date.now(); setGirando(true);
        window.dispatchEvent(new Event(EVENTO_RECARGAR));
        start(() => router.refresh());
      }
    };
    window.addEventListener('touchstart', empieza, { passive: true });
    window.addEventListener('touchmove', mueve, { passive: true });
    window.addEventListener('touchend', suelta);
    window.addEventListener('touchcancel', suelta);
    return () => {
      window.removeEventListener('touchstart', empieza);
      window.removeEventListener('touchmove', mueve);
      window.removeEventListener('touchend', suelta);
      window.removeEventListener('touchcancel', suelta);
    };
  }, [router]);

  // Se apaga cuando han llegado los datos y ha girado el mínimo.
  useEffect(() => {
    if (!girando || pendiente) return;
    const t = setTimeout(() => setGirando(false), Math.max(0, MINIMO_MS - (Date.now() - desde.current)));
    return () => clearTimeout(t);
  }, [girando, pendiente]);

  const cargando = pendiente || girando;
  if (!cargando && tirado === 0) return null;
  const y = cargando ? UMBRAL : tirado;
  return (
    <div className={`ptr${cargando ? ' ptr-cargando' : ''}${!cargando && tirado >= UMBRAL ? ' ptr-listo' : ''}`}
         style={{ transform: `translate(-50%, ${y - 56}px)`, opacity: cargando ? 1 : Math.min(1, tirado / UMBRAL) }}
         role={cargando ? 'status' : undefined} aria-live="polite">
      <div className="ptr-rueda" style={cargando ? undefined : { transform: `rotate(${tirado * 4}deg)` }} aria-hidden="true" />
      {cargando && <span className="ptr-texto">Actualizando</span>}
    </div>
  );
}
