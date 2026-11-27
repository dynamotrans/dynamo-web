'use client';

import { useEffect, useRef, type RefObject } from 'react';

// CERRAR UN DESPLEGABLE AL PULSAR FUERA, NO AL PERDER EL FOCO (usuario, 2026-11-27): en Safari del
// iPhone, el ✓ que cierra el teclado quita el foco del campo; si la lista se cerraba al perder el
// foco, se iba con el teclado y no se podía elegir un resultado de los que quedaban debajo.
// Ahora la lista se cierra al pulsar fuera de `dentro` (el campo y la lista), con Escape o si el
// foco pasa a OTRO campo (el tabulador en el ordenador). Al cerrar solo el teclado no pasa nada.
export function useCerrarFuera(abierto: boolean, cerrar: () => void, ...dentro: RefObject<HTMLElement | null>[]) {
  const fn = useRef(cerrar); fn.current = cerrar;
  const refs = useRef(dentro); refs.current = dentro;
  useEffect(() => {
    if (!abierto) return;
    const es = (t: EventTarget | null) => t instanceof Node && refs.current.some((r) => r.current?.contains(t));
    // Al TERMINAR el toque o clic fuera (evento «click»), no al empezarlo: si la lista ocupa sitio en
    // la página y se cerrara al apretar, todo se movería y el toque caería en otro sitio (2026-11-27:
    // el botón «País» de Nuevo sitio no se abría).
    const fuera = (e: Event) => { if (!es(e.target)) fn.current(); };
    // El foco pasa a OTRO campo (tabulador): se mira un momento después, para no mover la página en
    // mitad de un clic. Si el foco se ha ido «a ninguna parte» (el ✓ del teclado del iPhone), sigue abierta.
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const foco = () => {
      clearTimeout(reloj);
      reloj = setTimeout(() => {
        const a = document.activeElement;
        if (a && a !== document.body && !es(a)) fn.current();
      }, 200);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fn.current(); };
    document.addEventListener('click', fuera, true);
    document.addEventListener('focusin', foco, true);
    document.addEventListener('keydown', esc);
    return () => {
      clearTimeout(reloj);
      document.removeEventListener('click', fuera, true);
      document.removeEventListener('focusin', foco, true);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);
}
