'use client';

import { useCerrarFuera } from '@/lib/useCerrarFuera';
import { avisarNavegandoA } from './CargandoNavegacion';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { busquedaGlobal, muestraGlobal, type BusquedaGlobal } from '@/app/panel/(app)/buscador/acciones';
import { nombreEstado } from '@/lib/estados';

// BUSCADOR GLOBAL (usuario, 2026-11-12): en el dashboard es un AUTOCOMPLETADO en el
// sitio (tocas la caja, escribes y los resultados se despliegan debajo — en iPhone el
// teclado solo se abre si el campo es de verdad); desde cualquier otra pantalla,
// Ctrl/Cmd+K abre la paleta flotante. Los dos comparten la misma búsqueda, con caché
// de lo ya buscado y sin parpadeos: mientras llega la respuesta se sigue viendo la
// anterior.

type Item = { tipo: 'envio' | 'sitio' | 'cliente' | 'transportista' | 'incidencia' | 'penalizacion'; titulo: string; sub: string; href: string };
const TITULOS: Record<Item['tipo'], string> = { envio: 'Envíos', sitio: 'Sitios', cliente: 'Clientes', transportista: 'Transportistas', incidencia: 'Incidencias', penalizacion: 'Penalizaciones' };
// Lo que busca cada uno (usuario, 2026-11-16): un cliente no busca clientes ni
// transportistas — busca sus envíos, sitios, incidencias y penalizaciones.
const AYUDA = {
  gestor: { corto: 'Buscar envío, cliente, matrícula…', largo: 'Envío, cliente, transportista, CIF, matrícula, incidencia…',
    pista: 'un nº de envío, una población, un CIF, una matrícula, una incidencia…' },
  resto: { corto: 'Buscar envío, sitio, incidencia…', largo: 'Envío, sitio, incidencia, penalización, población…',
    pista: 'un nº de envío, una población, un sitio, una incidencia, una penalización…' },
};

function aItems(res: BusquedaGlobal): Item[] {
  return [
    ...res.envios.map((e) => ({ tipo: 'envio' as const, titulo: `#${e.ref}`, sub: [e.ruta, nombreEstado(e.estado)].filter(Boolean).join(' · '), href: `/panel/envios?ver=${e.id}` })),
    // Un sitio se abre en su lista, buscado por su nombre (la ficha vive en esa pantalla).
    ...res.sitios.map((x) => ({ tipo: 'sitio' as const, titulo: x.nombre, sub: x.direccion, href: `/panel/sitios?q=${encodeURIComponent(x.nombre)}` })),
    ...res.clientes.map((c) => ({ tipo: 'cliente' as const, titulo: c.nombre, sub: c.cif, href: `/panel/clientes?ver=${c.id}` })),
    ...res.transportistas.map((t) => ({ tipo: 'transportista' as const, titulo: t.nombre, sub: t.cif, href: `/panel/transportistas?ver=${t.id}` })),
    // Incidencias y penalizaciones se abren en su lista, ya filtrada por su código.
    ...res.incidencias.map((x) => ({ tipo: 'incidencia' as const, titulo: x.codigo, sub: x.titulo, href: `/panel/incidencias?q=${encodeURIComponent(x.codigo)}` })),
    ...res.penalizaciones.map((x) => ({ tipo: 'penalizacion' as const, titulo: x.codigo, sub: x.detalle, href: `/panel/penalizaciones?q=${encodeURIComponent(x.codigo)}` })),
  ];
}

// La búsqueda compartida: espera corta al teclear, caché por texto y respuesta más
// reciente solamente (una lenta antigua no pisa a una nueva).
function useBusqueda(q: string, activo: boolean) {
  const [items, setItems] = useState<Item[]>([]);
  const [cargando, setCargando] = useState(false);
  const cache = useRef(new Map<string, Item[]>());
  const seq = useRef(0);
  useEffect(() => {
    if (!activo) { setCargando(false); return; }
    const texto = q.trim();
    // Sin texto (o con 1 letra), la MUESTRA (usuario, 2026-11-13): al pulsar la caja ya
    // salen los últimos de cada grupo. Se cachea con la clave vacía.
    const clave = texto.length < 2 ? '' : texto;
    const guardado = cache.current.get(clave);
    if (guardado) { setItems(guardado); setCargando(false); return; }
    setCargando(true);
    const mio = ++seq.current;
    const t = setTimeout(() => {
      (clave === '' ? muestraGlobal() : busquedaGlobal(clave))
        .then((r) => {
          const its = aItems(r);
          cache.current.set(clave, its);
          if (seq.current === mio) { setItems(its); setCargando(false); }
        })
        .catch(() => { if (seq.current === mio) setCargando(false); });
    }, clave === '' ? 0 : 180);
    return () => clearTimeout(t);
  }, [q, activo]);
  return { items, cargando };
}

function Lista({ q, items, cargando, sel, setSel, elegir, gestor }: {
  q: string; items: Item[]; cargando: boolean; sel: number; setSel: (i: number) => void; elegir: (it: Item) => void; gestor: boolean;
}) {
  const texto = q.trim();
  const pista = (gestor ? AYUDA.gestor : AYUDA.resto).pista;
  return (
    <div className="bgq-lista">
      {texto.length < 2 && <div className="bgq-pista">{items.length ? `Lo último de tu cuenta — o escribe: ${pista}` : `Escribe al menos 2 letras: ${pista}`}</div>}
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
export function CajaBuscadorGlobal({ gestor = false }: { gestor?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [foco, setFoco] = useState(false);
  const [sel, setSel] = useState(0);
  const { items, cargando } = useBusqueda(q, foco);
  const elegir = (it: Item) => { setQ(''); setFoco(false); avisarNavegandoA(it.href); router.push(it.href); };
  // Abierto desde el FOCO: al pulsar la caja ya se despliega la muestra (usuario, 2026-11-13).
  const abierto = foco;
  // Se cierra al pulsar fuera, no al perder el foco (en el iPhone, el ✓ del teclado lo quita).
  const wrap = useRef<HTMLDivElement>(null);
  useCerrarFuera(foco, () => setFoco(false), wrap);
  return (
    <div className="bgq-wrap" ref={wrap}>
      <div className={`bgq-caja${abierto ? ' abierta' : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
        <input type="text" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onFocus={() => setFoco(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); setFoco(false); (e.target as HTMLInputElement).blur(); } else teclasLista(e, items, sel, setSel, elegir); }}
          placeholder={(gestor ? AYUDA.gestor : AYUDA.resto).corto} aria-label="Buscar en toda la plataforma" maxLength={120} />
        {cargando && <span className="bgq-rueda" aria-hidden="true" />}
      </div>
      {abierto && (
        <div className="bgq-drop">
          <Lista q={q} items={items} cargando={cargando} sel={sel} setSel={setSel} elegir={elegir} gestor={gestor} />
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
  const { items, cargando } = useBusqueda(q, abierto);

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
  const elegir = (it: Item) => { setAbierto(false); setQ(''); avisarNavegandoA(it.href); router.push(it.href); };
  return (
    <div className="bgq-fondo" onClick={() => setAbierto(false)}>
      <div className="bgq-panel" role="dialog" aria-label="Buscador" onClick={(e) => e.stopPropagation()}>
        <div className="bgq-barra">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
          <input ref={inputRef} type="text" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => teclasLista(e, items, sel, setSel, elegir)}
            placeholder={(gestor ? AYUDA.gestor : AYUDA.resto).largo}
            aria-label="Buscar en toda la plataforma" maxLength={120} />
          {cargando && <span className="bgq-rueda" aria-hidden="true" />}
          <button type="button" className="bgq-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar">✕</button>
        </div>
        <Lista q={q} items={items} cargando={cargando} sel={sel} setSel={setSel} elegir={elegir} gestor={gestor} />
      </div>
    </div>
  );
}
