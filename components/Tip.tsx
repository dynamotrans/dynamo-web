'use client';

import { useEffect, useRef, useState } from 'react';

// Icono ⓘ con globo de ayuda que funciona TAMBIÉN en móvil: el tap abre y cierra
// (en iOS un botón no recibe foco al tocarlo, así que :focus-within no bastaba),
// tocar fuera o Escape cierra, y en escritorio también se abre pasando el ratón
// (CSS) o con el foco del teclado. El globo flota anclado al icono sin ocupar
// sitio, y al abrirse se recoloca para no salirse de la pantalla.
export default function Tip({ texto, aria }: { texto: string; aria?: string }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!abierto) return;
    // Que el globo no se salga por los lados (importante en móvil).
    if (popRef.current && ref.current) {
      const icono = ref.current.getBoundingClientRect();
      const ancho = popRef.current.offsetWidth;
      let izq = -8;
      const sobra = icono.left + izq + ancho - (window.innerWidth - 10);
      if (sobra > 0) izq -= sobra;
      if (icono.left + izq < 10) izq = 10 - icono.left;
      popRef.current.style.left = `${izq}px`;
    }
    const fuera = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('pointerdown', fuera); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);
  return (
    <span className={`tip-i${abierto ? ' tip-abierto' : ''}`} ref={ref}>
      <button type="button" className="tip-i-btn" aria-expanded={abierto} aria-label={aria ?? 'Más información'}
        onClick={() => setAbierto((v) => !v)}>ⓘ</button>
      <span className="tip-i-pop" role="tooltip" ref={popRef}>{texto}</span>
    </span>
  );
}
