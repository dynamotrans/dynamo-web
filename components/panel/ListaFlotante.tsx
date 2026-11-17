'use client';

// Lista desplegable que FLOTA colgada del cuerpo de la página, en la posición de su campo
// (usuario, 2026-11-17). Dentro de una ventana emergente, Safari pintaba las listas con
// scroll con la letra dentada y a trozos; fuera de ella se pintan bien, y además no las
// recorta el borde de la ventana. Es la misma colocación que usa Buscador.tsx.
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function ListaFlotante({ ancla, lista, children }: {
  ancla: React.RefObject<HTMLElement | null>;       // la caja del campo: la lista sale pegada a ella
  lista: React.RefObject<HTMLDivElement | null>;    // para que quien la usa sepa si un clic cae dentro
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; alto: number } | null>(null);
  useLayoutEffect(() => {
    const colocar = () => {
      const r = ancla.current?.getBoundingClientRect(); if (!r) return;
      const abajo = window.innerHeight - r.bottom - 12, arriba = r.top - 12;
      const haciaArriba = abajo < 180 && arriba > abajo;
      setPos(haciaArriba
        ? { bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width, alto: Math.max(120, Math.min(320, arriba)) }
        : { top: r.bottom + 4, left: r.left, width: r.width, alto: Math.max(120, Math.min(320, abajo)) });
    };
    colocar();
    // El scroll de la propia lista NO la recoloca; el de la página o el de la ventana, sí.
    const alMover = (ev: Event) => { if (lista.current && ev.target instanceof Node && lista.current.contains(ev.target)) return; colocar(); };
    window.addEventListener('scroll', alMover, true); window.addEventListener('resize', colocar);
    return () => { window.removeEventListener('scroll', alMover, true); window.removeEventListener('resize', colocar); };
  }, [ancla, lista]);
  if (!pos) return null;
  return createPortal(
    <div className="buscador-lista flotante" role="listbox" ref={lista} data-envivo-ignorar=""
      style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.alto }}>
      {children}
    </div>,
    document.body,
  );
}
