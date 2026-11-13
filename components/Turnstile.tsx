'use client';

// Widget de Cloudflare Turnstile (tarea 76): va DENTRO del <form> de los formularios
// públicos que envían email (registro, olvido). El propio widget mete en el formulario
// el campo oculto cf-turnstile-response, que la acción comprueba en el servidor con
// turnstileOk(). Sin variables de entorno usa la clave de PRUEBA de Cloudflare (sale
// con el rótulo «Testing only» y siempre pasa); con la clave real es invisible salvo
// que Cloudflare dude. Si el script no carga (adblocker), el formulario sigue
// funcionando: el servidor decide (ver lib/servidor/turnstile.ts).
import { useEffect, useRef } from 'react';

const CLAVE_SITIO = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'; // prueba: visible, siempre pasa

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, opciones: Record<string, unknown>) => string | undefined } }
}

export default function Turnstile() {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pintar = () => {
      // El guard de hijos evita el doble widget del doble montaje de React en desarrollo.
      if (caja.current && window.turnstile && !caja.current.hasChildNodes()) {
        window.turnstile.render(caja.current, { sitekey: CLAVE_SITIO, size: 'flexible' });
      }
    };
    if (window.turnstile) { pintar(); return; }
    const id = 'cf-turnstile-js';
    let s = document.getElementById(id) as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement('script');
      s.id = id;
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener('load', pintar);
    return () => s?.removeEventListener('load', pintar);
  }, []);
  return <div ref={caja} style={{ margin: '0.7rem 0 0' }} />;
}
