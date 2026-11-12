'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { busquedaGlobal, type BusquedaGlobal } from '@/app/panel/(app)/buscador/acciones';
import { nombreEstado } from '@/lib/estados';

// BUSCADOR GLOBAL (usuario, 2026-11-12): se abre con Cmd/Ctrl+K desde cualquier pantalla
// del panel, o con la caja del dashboard (que manda el evento 'dynamo:buscador').
// Escribe «1304», «Aldaia», un CIF o una matrícula y junta envíos + (solo Dynamo)
// clientes y transportistas. ↑/↓ + Enter navega; Esc o tocar fuera cierra.

const EVENTO = 'dynamo:buscador';

// La caja visible del dashboard: solo abre la paleta (que vive en el marco del panel).
export function CajaBuscadorGlobal() {
  return (
    <button type="button" className="bgq-caja" onClick={() => window.dispatchEvent(new CustomEvent(EVENTO))}
      aria-label="Abrir el buscador (Ctrl+K)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
      <span>Buscar envío, cliente, matrícula…</span>
      <kbd>Ctrl K</kbd>
    </button>
  );
}

type Item = { tipo: 'envio' | 'cliente' | 'transportista'; titulo: string; sub: string; href: string };

export default function BuscadorGlobal({ gestor }: { gestor: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<BusquedaGlobal | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const abrir = () => { setAbierto(true); setTimeout(() => inputRef.current?.focus(), 0); };
    const teclas = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrir(); }
      else if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener(EVENTO, abrir);
    window.addEventListener('keydown', teclas);
    return () => { window.removeEventListener(EVENTO, abrir); window.removeEventListener('keydown', teclas); };
  }, []);

  // Búsqueda con espera corta mientras se escribe; solo pinta la respuesta más reciente.
  useEffect(() => {
    if (!abierto) return;
    const texto = q.trim();
    if (texto.length < 2) { setRes(null); setCargando(false); return; }
    setCargando(true);
    const mio = ++seq.current;
    const t = setTimeout(() => {
      busquedaGlobal(texto)
        .then((r) => { if (seq.current === mio) { setRes(r); setSel(0); } })
        .catch(() => { if (seq.current === mio) setRes(null); })
        .finally(() => { if (seq.current === mio) setCargando(false); });
    }, 250);
    return () => clearTimeout(t);
  }, [q, abierto]);

  if (!abierto) return null;

  const items: Item[] = !res ? [] : [
    ...res.envios.map((e) => ({ tipo: 'envio' as const, titulo: `#${e.ref}`, sub: [e.ruta, nombreEstado(e.estado)].filter(Boolean).join(' · '), href: `/panel/envios?ver=${e.id}` })),
    ...res.clientes.map((c) => ({ tipo: 'cliente' as const, titulo: c.nombre, sub: c.cif, href: `/panel/clientes?ver=${c.id}` })),
    ...res.transportistas.map((t) => ({ tipo: 'transportista' as const, titulo: t.nombre, sub: t.cif, href: `/panel/transportistas?ver=${t.id}` })),
  ];
  const TITULOS: Record<Item['tipo'], string> = { envio: 'Envíos', cliente: 'Clientes', transportista: 'Transportistas' };

  const elegir = (it: Item) => { setAbierto(false); setQ(''); setRes(null); router.push(it.href); };
  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((v) => Math.min(v + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((v) => Math.max(v - 1, 0)); }
    else if (e.key === 'Enter' && items[sel]) elegir(items[sel]);
  };

  return (
    <div className="bgq-fondo" onClick={() => setAbierto(false)}>
      <div className="bgq-panel" role="dialog" aria-label="Buscador" onClick={(e) => e.stopPropagation()}>
        <div className="bgq-barra">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
          <input ref={inputRef} type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={alTeclear}
            placeholder={gestor ? 'Envío, cliente, transportista, CIF, matrícula, población…' : 'Nº de envío, población, matrícula…'}
            aria-label="Buscar en toda la plataforma" maxLength={120} />
          <button type="button" className="bgq-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar">✕</button>
        </div>
        <div className="bgq-lista">
          {q.trim().length < 2 && <div className="bgq-pista">Escribe al menos 2 letras: un nº de envío, una población, un CIF, una matrícula…</div>}
          {q.trim().length >= 2 && !cargando && res && items.length === 0 && <div className="bgq-pista">Nada casa con «{q.trim()}».</div>}
          {cargando && <div className="bgq-pista">Buscando…</div>}
          {items.map((it, i) => (
            <div key={`${it.tipo}-${it.href}`}>
              {(i === 0 || items[i - 1].tipo !== it.tipo) && <div className="bgq-grupo">{TITULOS[it.tipo]}</div>}
              <button type="button" className={`bgq-item${i === sel ? ' activo' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => elegir(it)}>
                <span className="bgq-tit">{it.titulo}</span>
                {it.sub && <span className="bgq-sub">{it.sub}</span>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
