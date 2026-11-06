'use client';

// El cargador de Dynamo al pulsar un enlace del panel, mientras llega la pantalla nueva.
// Antes lo ponía app/panel/(app)/loading.tsx, pero esa caja de «cargando» de Next.js hacía
// que a veces los refrescos de la plataforma en vivo no se pintaran (comprobado
// 2026-11-06: sin ella, 10 de 10 al primer intento). Aquí solo salta con un clic en un
// enlace interno que cambia de dirección, y se quita al llegar (o a los 15 s, por si acaso).
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Cargando from '@/components/Cargando';

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
    // En captura: los <Link> de Next.js cancelan el clic (preventDefault) antes de que llegue.
    document.addEventListener('click', clic, true);
    return () => document.removeEventListener('click', clic, true);
  }, []);

  useEffect(() => {
    if (!cargando) return;
    const t = setTimeout(() => setCargando(false), 15000);
    return () => clearTimeout(t);
  }, [cargando]);

  return cargando ? <Cargando /> : null;
}
