'use client';

import { useEffect, useRef, useState } from 'react';

// El CONCEPTO de una fila de precio («Recargo … (20 %)», «Almacenamiento · 2 tráileres × 3
// semanas»), siempre en UNA línea (usuario, 2026-11-24: «en dos líneas ocupa mucho»; el
// importe de la derecha nunca se parte). Si no cabe, se corta con puntos suspensivos y al
// tocarlo (o con Intro) se abre entero; otro toque lo vuelve a recoger. En ordenador, el
// texto completo sale también al pasar el ratón.
export default function ConceptoPrecio({ texto }: { texto: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [cortado, setCortado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setCortado(el.scrollWidth > el.clientWidth + 1);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [texto, abierto]);
  const pulsable = cortado || abierto;
  return (
    <span ref={ref} className={`k${abierto ? ' abierta' : ''}${pulsable ? ' pulsable' : ''}`} title={cortado ? texto : undefined}
      role={pulsable ? 'button' : undefined} tabIndex={pulsable ? 0 : undefined} aria-expanded={pulsable ? abierto : undefined}
      onClick={pulsable ? () => setAbierto((v) => !v) : undefined}
      onKeyDown={pulsable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbierto((v) => !v); } } : undefined}>{texto}</span>
  );
}
