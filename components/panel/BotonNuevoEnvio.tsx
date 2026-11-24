'use client';

// «Nuevo envío» con una flechita al lado que despliega «Crear varios envíos» (usuario,
// 2026-11-21). Solo esa opción: «Nuevo envío» ya es el botón grande. Se cierra al pulsar fuera o con Escape.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export function MenuNuevoEnvio({ onCerrar }: { onCerrar: () => void }) {
  return (
    <div className="btn-nuevo-menu" role="menu">
      <Link role="menuitem" href="/panel/nuevo-envio/varios" id="menu-varios-envios" onClick={onCerrar}>Crear varios envíos<span>Hasta 20 de una vez, en una tabla</span></Link>
    </div>
  );
}

export function useMenuFuera() {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);
  return { abierto, setAbierto, ref };
}

export default function BotonNuevoEnvio({ texto = '+ Crear envío' }: { texto?: string }) {
  const m = useMenuFuera();
  return (
    <div className="btn-nuevo-grupo" ref={m.ref}>
      <Link className="btn-primary" href="/panel/nuevo-envio">{texto}</Link>
      <button type="button" className="btn-primary btn-nuevo-flecha" id="btn-nuevo-mas" aria-haspopup="menu" aria-expanded={m.abierto}
        aria-label="Más formas de crear envíos" onClick={() => m.setAbierto((v) => !v)}>▾</button>
      {m.abierto && <MenuNuevoEnvio onCerrar={() => m.setAbierto(false)} />}
    </div>
  );
}
