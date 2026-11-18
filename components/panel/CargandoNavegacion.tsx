'use client';

// El cargador de Dynamo al pulsar un enlace del panel, mientras llega la pantalla nueva.
// Antes lo ponía app/panel/(app)/loading.tsx, pero esa caja de «cargando» de Next.js hacía
// que a veces los refrescos de la plataforma en vivo no se pintaran (comprobado
// 2026-11-06: sin ella, 10 de 10 al primer intento). Aquí solo salta con un clic en un
// enlace interno que cambia de dirección, y se quita al llegar (o a los 15 s, por si acaso).
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Cargando from '@/components/Cargando';

// Para navegaciones por código (router.push): la fila que abre una ficha o la X que la
// cierra avisan con esto y el cargador sale al instante (usuario, 2026-11-10: «no hay
// spinner al abrir ni al cerrar el detalle»).
export const avisarNavegando = () => { try { window.dispatchEvent(new Event('dynamo:navegando')); } catch { /* sin ventana */ } };
// Lo mismo, sabiendo ADÓNDE se va: si ya se está en esa pantalla no hay nada que esperar y
// el cargador no sale (se quedaría puesto hasta su tope). Para todo botón que navega por
// código: sin esto el botón no hace nada visible hasta que llega la pantalla nueva, y
// parece que no ha respondido (usuario, 2026-11-18: «cuando pulso botones tarda»).
export const avisarNavegandoA = (href: string) => {
  try {
    const u = new URL(href, window.location.href);
    if (u.origin === window.location.origin && u.pathname === window.location.pathname && u.search === window.location.search) return;
  } catch { /* dirección rara: se avisa igualmente */ }
  avisarNavegando();
};

export default function CargandoNavegacion() {
  const ruta = usePathname();
  const busqueda = useSearchParams();
  const [cargando, setCargando] = useState(false);

  // Ha llegado la pantalla nueva.
  useEffect(() => { setCargando(false); }, [ruta, busqueda]);

  useEffect(() => {
    const clic = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith('/panel')) return;
      if (url.pathname === location.pathname && url.search === location.search) return;   // misma pantalla (o solo #)
      setCargando(true);
    };
    const porCodigo = () => setCargando(true);
    // En captura: los <Link> de Next.js cancelan el clic (preventDefault) antes de que llegue.
    document.addEventListener('click', clic, true);
    window.addEventListener('dynamo:navegando', porCodigo);
    return () => { document.removeEventListener('click', clic, true); window.removeEventListener('dynamo:navegando', porCodigo); };
  }, []);

  useEffect(() => {
    if (!cargando) return;
    const t = setTimeout(() => setCargando(false), 15000);
    return () => clearTimeout(t);
  }, [cargando]);

  return cargando ? <Cargando /> : null;
}
