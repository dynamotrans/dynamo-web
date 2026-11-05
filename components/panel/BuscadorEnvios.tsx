'use client';

// Buscador de la lista de envíos, sin botón: busca solo al dejar de escribir (0,4 s) y al
// cambiar una fecha. La búsqueda la hace el servidor en todos los años (buscar_envios_pagina).
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function BuscadorEnvios({ f, q, desde, hasta, placeholder }: { f: string; q: string; desde: string; hasta: string; placeholder: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState(q);
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);
  const [buscando, empezar] = useTransition();
  const primera = useRef(true);
  const escribiendo = useRef(false);

  // Si cambia la dirección desde fuera (atajos de fechas, «Quitar búsqueda»), se refleja aquí.
  useEffect(() => { if (!escribiendo.current) setTexto(q); }, [q]);
  useEffect(() => { setD(desde); setH(hasta); }, [desde, hasta]);

  function ir(t: string, de: string, ha: string) {
    const u = new URLSearchParams();
    if (f) u.set('f', f);
    const limpio = t.trim();
    if (limpio.length >= 2) u.set('q', limpio);       // una sola letra no busca (daría casi todo)
    if (de) u.set('desde', de);
    if (ha) u.set('hasta', ha);
    empezar(() => router.replace(`/panel/envios${u.toString() ? `?${u}` : ''}`, { scroll: false }));
  }

  // Texto: al dejar de escribir.
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    const limpio = texto.trim();
    if (limpio === q || (limpio.length === 1 && !q)) return;
    const t = setTimeout(() => { escribiendo.current = false; ir(texto, d, h); }, 400);
    return () => clearTimeout(t);
  }, [texto]);

  return (
    <div className="filters" style={{ flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
      <input type="search" value={texto} placeholder={placeholder} style={{ flex: '1 1 260px' }} aria-label="Buscar envíos"
        onChange={(e) => { escribiendo.current = true; setTexto(e.target.value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); escribiendo.current = false; ir(texto, d, h); } }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: 'var(--fs-s)' }}>Carga desde
        <input type="date" value={d} onChange={(e) => { setD(e.target.value); ir(texto, e.target.value, h); }} /></label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: 'var(--fs-s)' }}>hasta
        <input type="date" value={h} onChange={(e) => { setH(e.target.value); ir(texto, d, e.target.value); }} /></label>
      <span aria-live="polite" style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', minWidth: 80 }}>{buscando ? 'Buscando…' : ''}</span>
    </div>
  );
}
