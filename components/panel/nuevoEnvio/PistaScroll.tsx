'use client';

// Píldora flotante «Desliza para crear el envío» (calcada del mockup): aparece cuando el
// botón de acción del paso queda por debajo del pliegue (sobre todo en el móvil) y, al
// pulsarla, baja suave hasta él. Se reevalúa al hacer scroll, al cambiar el tamaño y con
// un pulso corto (el contenido del formulario cambia de altura al abrir avisos o listas).
import { useEffect, useState } from 'react';

export default function PistaScroll({ texto, selector }: {
  texto: string;
  selector: string;   // el botón de acción vigente (data-pista-accion)
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let raf = false;
    const mirar = () => {
      const btn = document.querySelector<HTMLElement>(selector);
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const doc = document.documentElement;
      const conScroll = Math.max(doc.scrollHeight, document.body.scrollHeight) > vh + 40;
      if (!btn || !btn.offsetParent || !conScroll) { setVisible(false); return; }
      const r = btn.getBoundingClientRect();
      setVisible(!(r.top < vh - 24 && r.bottom > 0));   // se ve (aunque sea en parte) → fuera
    };
    const alScroll = () => { if (!raf) { raf = true; requestAnimationFrame(() => { raf = false; mirar(); }); } };
    mirar();
    const t = setInterval(mirar, 600);
    window.addEventListener('scroll', alScroll, { passive: true });
    window.addEventListener('resize', mirar);
    return () => { clearInterval(t); window.removeEventListener('scroll', alScroll); window.removeEventListener('resize', mirar); };
  }, [selector, texto]);
  if (!visible) return null;
  return (
    <button type="button" className="nc-scroll-hint" aria-label={texto}
      onClick={() => document.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}>
      <span className="nsh-text">{texto}</span>
      <span className="nsh-arrow" aria-hidden="true">↓</span>
    </button>
  );
}
