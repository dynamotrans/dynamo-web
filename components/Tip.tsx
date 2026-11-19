'use client';

import { useEffect, useRef, useState } from 'react';

// Icono ⓘ con globo de ayuda que funciona TAMBIÉN en móvil: el tap abre y cierra
// (en iOS un botón no recibe foco al tocarlo, así que :focus-within no bastaba),
// tocar fuera o Escape cierra, y en escritorio también se abre pasando el ratón
// (CSS) o con el foco del teclado. El globo flota anclado al icono sin ocupar
// sitio, y al abrirse se recoloca para no salirse de la pantalla.
// enBoton: el icono va DENTRO de otro botón (la cabecera de una tarjeta que se despliega):
// entonces es un span con papel de botón y no abre ni cierra la tarjeta al tocarlo.
export default function Tip({ texto, aria, enBoton, id }: { texto: string; aria?: string; enBoton?: boolean; id?: string }) {
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
    <span className={`tip-i${abierto ? ' tip-abierto' : ''}`} ref={ref} id={id}>
      {enBoton
        ? <span role="button" tabIndex={0} className="tip-i-btn" aria-expanded={abierto} aria-label={aria ?? 'Más información'}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAbierto((v) => !v); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setAbierto((v) => !v); } }}>ⓘ</span>
        : <button type="button" className="tip-i-btn" aria-expanded={abierto} aria-label={aria ?? 'Más información'}
            onClick={() => setAbierto((v) => !v)}>ⓘ</button>}
      <span className="tip-i-pop" role="tooltip" ref={popRef}>{texto}</span>
    </span>
  );
}
