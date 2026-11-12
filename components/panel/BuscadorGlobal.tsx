'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { busquedaGlobal, type BusquedaGlobal } from '@/app/panel/(app)/buscador/acciones';
import { nombreEstado } from '@/lib/estados';

// BUSCADOR GLOBAL (usuario, 2026-11-12): en el dashboard es un AUTOCOMPLETADO en el
// sitio (tocas la caja, escribes y los resultados se despliegan debajo — en iPhone el
// teclado solo se abre si el campo es de verdad); desde cualquier otra pantalla,
// Ctrl/Cmd+K abre la paleta flotante. Los dos comparten la misma búsqueda, con caché
// de lo ya buscado y sin parpadeos: mientras llega la respuesta se sigue viendo la
// anterior.

type Item = { tipo: 'envio' | 'cliente' | 'transportista'; titulo: string; sub: string; href: string };
const TITULOS: Record<Item['tipo'], string> = { envio: 'Envíos', cliente: 'Clientes', transportista: 'Transportistas' };

function aItems(res: BusquedaGlobal): Item[] {
  return [
    ...res.envios.map((e) => ({ tipo: 'envio' as const, titulo: `#${e.ref}`, sub: [e.ruta, nombreEstado(e.estado)].filter(Boolean).join(' · '), href: `/panel/envios?ver=${e.id}` })),
    ...res.clientes.map((c) => ({ tipo: 'cliente' as const, titulo: c.nombre, sub: c.cif, href: `/panel/clientes?ver=${c.id}` })),
    ...res.transportistas.map((t) => ({ tipo: 'transportista' as const, titulo: t.nombre, sub: t.cif, href: `/panel/transportistas?ver=${t.id}` })),
  ];
}

// La búsqueda compartida: espera corta al teclear, caché por texto y respuesta más
// reciente solamente (una lenta antigua no pisa a una nueva).
function useBusqueda(q: string) {
  const [items, setItems] = useState<Item[]>([]);
  const [cargando, setCargando] = useState(false);
  const cache = useRef(new Map<string, Item[]>());
  const seq = useRef(0);
  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) { setItems([]); setCargando(false); return; }
    const guardado = cache.current.get(texto);
    if (guardado) { setItems(guardado); setCargando(false); return; }
    setCargando(true);
    const mio = ++seq.current;
    const t = setTimeout(() => {
      busquedaGlobal(texto)
        .then((r) => {
          const its = aItems(r);
          cache.current.set(texto, its);
          if (seq.current === mio) { setItems(its); setCargando(false); }
        })
        .catch(() => { if (seq.current === mio) setCargando(false); });
    }, 180);
    return () => clearTimeout(t);
  }, [q]);
  return { items, cargando };
}

function Lista({ q, items, cargando, sel, setSel, elegir }: {
  q: string; items: Item[]; cargando: boolean; sel: number; setSel: (i: number) => void; elegir: (it: Item) => void;
}) {
  const texto = q.trim();
  return (
    <div className="bgq-lista">
      {texto.length < 2 && <div className="bgq-pista">Escribe al menos 2 letras: un nº de envío, una población, un CIF, una matrícula…</div>}
      {texto.length >= 2 && !cargando && items.length === 0 && <div className="bgq-pista">Nada casa con «{texto}».</div>}
      {texto.length >= 2 && cargando && items.length === 0 && <div className="bgq-pista">Buscando…</div>}
      {items.map((it, i) => (
        <div key={`${it.tipo}-${it.href}`}>
          {(i === 0 || items[i - 1].tipo !== it.tipo) && <div className="bgq-grupo">{TITULOS[it.tipo]}</div>}
          <button type="button" className={`bgq-item${i === sel ? ' activo' : ''}`} onMouseEnter={() => setSel(i)}
            onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(it)}>
            <span className="bgq-tit">{it.titulo}</span>
            {it.sub && <span className="bgq-sub">{it.sub}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}

function teclasLista(e: React.KeyboardEvent, items: Item[], sel: number, setSel: (i: number) => void, elegir: (it: Item) => void) {
  if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(sel + 1, items.length - 1)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(sel - 1, 0)); }
  else if (e.key === 'Enter' && items[sel]) elegir(items[sel]);
}

// ---- Autocompletado del dashboard: el campo REAL, con los resultados debajo ----------
export function CajaBuscadorGlobal() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [foco, setFoco] = useState(false);
  const [sel, setSel] = useState(0);
  const { items, cargando } = useBusqueda(foco ? q : '');
  const elegir = (it: Item) => { setQ(''); setFoco(false); router.push(it.href); };
  const abierto = foco && q.trim().length >= 1;
  return (
    <div className="bgq-wrap">
      <div className={`bgq-caja${abierto ? ' abierta' : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
        <input type="text" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onFocus={() => setFoco(true)} onBlur={() => setTimeout(() => setFoco(false), 120)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); (e.target as HTMLInputElement).blur(); } else teclasLista(e, items, sel, setSel, elegir); }}
          placeholder="Buscar envío, cliente, matrícula…" aria-label="Buscar en toda la plataforma" maxLength={120} />
        {cargando && <span className="bgq-rueda" aria-hidden="true" />}
      </div>
      {abierto && (
        <div className="bgq-drop">
          <Lista q={q} items={items} cargando={cargando} sel={sel} setSel={setSel} elegir={elegir} />
        </div>
      )}
    </div>
  );
}

// ---- Paleta Ctrl/Cmd+K para el resto del panel (escritorio sobre todo) ---------------
export default function BuscadorGlobal({ gestor }: { gestor: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { items, cargando } = useBusqueda(abierto ? q : '');

  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setAbierto(true); setTimeout(() => inputRef.current?.focus(), 0);
      } else if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener('keydown', teclas);
    return () => window.removeEventListener('keydown', teclas);
  }, []);

  if (!abierto) return null;
  const elegir = (it: Item) => { setAbierto(false); setQ(''); router.push(it.href); };
  return (
    <div className="bgq-fondo" onClick={() => setAbierto(false)}>
      <div className="bgq-panel" role="dialog" aria-label="Buscador" onClick={(e) => e.stopPropagation()}>
        <div className="bgq-barra">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
          <input ref={inputRef} type="text" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => teclasLista(e, items, sel, setSel, elegir)}
            placeholder={gestor ? 'Envío, cliente, transportista, CIF, matrícula, población…' : 'Nº de envío, población, matrícula…'}
            aria-label="Buscar en toda la plataforma" maxLength={120} />
          {cargando && <span className="bgq-rueda" aria-hidden="true" />}
          <button type="button" className="bgq-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar">✕</button>
        </div>
        <Lista q={q} items={items} cargando={cargando} sel={sel} setSel={setSel} elegir={elegir} />
      </div>
    </div>
  );
}
